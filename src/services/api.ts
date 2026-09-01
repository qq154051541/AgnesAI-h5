/**
 * API 服务层
 * 封装所有网络请求，使用 fetch API 替代 uni.request
 */

import {
  API_BASE_URL,
  IMGBB_UPLOAD_URL,
  IMGBB_AUTH_TOKEN,
  API_PATHS,
  VIDEO_MODEL,
  VIDEO_MODEL_FLASH,
  VIDEO_FLASH_SIZE,
  CHAT_MODEL,

  IMG2PROMPT_SYSTEM_ZH,
  IMG2PROMPT_SYSTEM_EN,
  IMG2PROMPT_USER_ZH,
  IMG2PROMPT_USER_EN
} from '../config/api'
import type { RequestResult, ApiResponse, VideoFlashCreateOptions } from '../types'

/**
 * 清理 URL，提取纯净的 http/https 地址
 * 注意：Data URI (data:image/...;base64,...) 直接原样返回，不做清理
 */
function cleanUrl(url: string): string {
  // Data URI Base64 直接原样返回，避免正则误匹配 base64 中的 http:// 片段
  if (url.startsWith('data:')) return url
  const safe = String(url).replace(/[^a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]/g, '')
  const match = safe.match(/https?:\/\/[a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]+/)
  return match ? match[0] : safe
}

/**
 * 将尺寸对齐到指定倍数
 */
function alignToMultiple(value: number, multiple: number): number {
  return Math.round(value / multiple) * multiple
}

/**
 * 通用 fetch 请求封装，支持 AbortController
 */
function fetchWithAbort(
  url: string,
  options: RequestInit,
  timeout = 120000
): RequestResult<ApiResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  const promise = fetch(url, { ...options, signal: controller.signal })
    .then(async (res) => {
      clearTimeout(timeoutId)
      const contentType = res.headers.get('content-type') || ''
      let data: unknown
      if (contentType.includes('application/json')) {
        data = await res.json()
      } else {
        const text = await res.text()
        try {
          data = JSON.parse(text)
        } catch {
          data = text
        }
      }
      return { statusCode: res.status, data }
    })
    .catch((err) => {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        throw { errMsg: '请求超时或已取消' }
      }
      throw { errMsg: err.message || '网络请求失败' }
    })

  return {
    promise,
    abort: () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }
}

/**
 * 生成图片
 * @param apiKey    API Key
 * @param prompt    提示词
 * @param model     模型名称
 * @param size      精确尺寸（"1024x1024"）或档位（"2K"）
 * @param refImageUrls 参考图 URL 数组（图生图）
 * @param n         生成数量
 * @param ratio     宽高比，仅档位式 size 时使用（如 "16:9"）
 */
export function generateImage(
  apiKey: string,
  prompt: string,
  model: string,
  size: string,
  refImageUrls?: string[],
  n?: number,
  ratio?: string
): RequestResult<ApiResponse> {
  const requestData: Record<string, unknown> = {
    model,
    prompt
  }

  if (ratio) {
    // 档位式尺寸（2.1 Flash）：size 为 "1K"/"2K"/"3K"/"4K"，配合 ratio
    requestData.size = size
    requestData.ratio = ratio
  } else {
    // 精确尺寸（2.0 Flash）：对齐到 16 的倍数
    const [w, h] = size.split('x').map(Number)
    requestData.size = `${alignToMultiple(w, 16)}x${alignToMultiple(h, 16)}`
  }

  if (n && n > 1) {
    requestData.n = n
  }

  if (refImageUrls && refImageUrls.length > 0) {
    // Data URI (base64) 直接使用，HTTP URL 进行清理
    const cleanedImages = refImageUrls
      .map((url) => (url.startsWith('data:') ? url : cleanUrl(url)))
      .filter((url) => url)
    requestData.extra_body = {
      image: cleanedImages,
      response_format: 'url'
    }
  }

  return fetchWithAbort(`${API_BASE_URL}${API_PATHS.IMAGE_GENERATIONS}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestData)
  })
}

/**
 * 创建视频生成任务
 */
export function createVideoTask(
  apiKey: string,
  prompt: string,
  width: number,
  height: number,
  numFrames: number,
  frameRate: number,
  refImageUrls?: string[],
  isKeyframeMode?: boolean
): RequestResult<ApiResponse> {
  const alignedWidth = alignToMultiple(width, 64)
  const alignedHeight = alignToMultiple(height, 64)

  const body: Record<string, unknown> = {
    model: VIDEO_MODEL,
    prompt,
    width: alignedWidth,
    height: alignedHeight,
    num_frames: numFrames,
    frame_rate: frameRate
  }

  if (refImageUrls && refImageUrls.length > 0) {
    // Data URI (base64) 直接使用，HTTP URL 进行清理
    const cleanedUrls = refImageUrls
      .map((url) => (url.startsWith('data:') ? url : cleanUrl(url)))
      .filter((url) => url)

    if (isKeyframeMode) {
      // 关键帧模式：使用 extra_body.image（数组）+ extra_body.mode
      body.extra_body = {
        image: cleanedUrls,
        mode: 'keyframes'
      }
    } else if (cleanedUrls.length === 1) {
      // 单张参考图（图生视频）：使用顶层 image 字段
      body.image = cleanedUrls[0]
    } else {
      // 多张参考图（多图视频）：使用 extra_body.image（数组）
      body.extra_body = {
        image: cleanedUrls
      }
    }
  }

  return fetchWithAbort(`${API_BASE_URL}${API_PATHS.VIDEOS}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
}

/**
 * 查询视频任务状态
 * 使用 GET /agnesapi?video_id=xxx&model_name=xxx 接口
 */
export function queryVideoTask(apiKey: string, videoId: string): RequestResult<ApiResponse> {
  return fetchWithAbort(
    `${API_BASE_URL}${API_PATHS.VIDEO_QUERY}?video_id=${encodeURIComponent(videoId)}&model_name=${encodeURIComponent(VIDEO_MODEL)}&_t=${Date.now()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    },
    60000
  )
}

/**
 * 创建视频生成任务（Agnes Video 2.5 Flash）
 * 参数体系与 v2.0 不同：使用 mode/seconds/size="720P"/aspect_ratio/first_frame/last_frame/images/audios
 */
export function createVideoTaskFlash(
  apiKey: string,
  options: VideoFlashCreateOptions
): RequestResult<ApiResponse> {
  const body: Record<string, unknown> = {
    model: VIDEO_MODEL_FLASH,
    prompt: options.prompt,
    mode: options.mode,
    seconds: options.seconds,
    size: VIDEO_FLASH_SIZE,
    aspect_ratio: options.aspectRatio,
    n: 1
  }

  if (options.seed !== undefined && options.seed !== null) {
    body.seed = options.seed
  }

  if (options.mode === 'keyframe') {
    if (options.firstFrame) {
      body.first_frame = cleanUrl(options.firstFrame)
    }
    if (options.lastFrame) {
      body.last_frame = cleanUrl(options.lastFrame)
    }
  } else if (options.mode === 'reference') {
    if (options.images && options.images.length > 0) {
      body.images = options.images
        .map((url) => (url.startsWith('data:') ? url : cleanUrl(url)))
        .filter((url) => url)
    }
    if (options.audios && options.audios.length > 0) {
      body.audios = options.audios
        .map((url) => (url.startsWith('data:') ? url : cleanUrl(url)))
        .filter((url) => url)
    }
  }

  return fetchWithAbort(`${API_BASE_URL}${API_PATHS.VIDEOS}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
}

/**
 * 查询视频任务状态（Agnes Video 2.5 Flash）
 * 推荐使用 video_id + model_name=agnes-video-2.5-flash 轮询，适用于全部模式
 */
export function queryVideoTaskFlash(apiKey: string, videoId: string): RequestResult<ApiResponse> {
  return fetchWithAbort(
    `${API_BASE_URL}${API_PATHS.VIDEO_QUERY}?video_id=${encodeURIComponent(videoId)}&model_name=${encodeURIComponent(VIDEO_MODEL_FLASH)}&_t=${Date.now()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    },
    60000
  )
}

/**
 * 图转提示词
 * 使用 agnes-2.5-flash（agnes-2.0-flash 已废弃，不再作为兼容回退）
 * 请求格式遵循 OpenAI 兼容的图像理解规范：
 * messages[0] 为单条 user 消息，content 为 [text, image_url] 内容块数组
 */
export function imageToPrompt(
  apiKey: string,
  imageUrl: string,
  lang: string
): RequestResult<ApiResponse> {
  const isZh = lang === 'zh'
  const systemPrompt = isZh ? IMG2PROMPT_SYSTEM_ZH : IMG2PROMPT_SYSTEM_EN
  const userText = isZh ? IMG2PROMPT_USER_ZH : IMG2PROMPT_USER_EN

  const body = {
    model: CHAT_MODEL,
    temperature: 0.7,
    stream: false,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `${systemPrompt}\n${userText}` },
          {
            type: 'image_url',
            image_url: { url: imageUrl }
          }
        ]
      }
    ]
  }

  return fetchWithAbort(`${API_BASE_URL}${API_PATHS.CHAT_COMPLETIONS}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
}

/**
 * 上传图片到 imgbb
 */
export async function uploadToImgbb(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('source', file)
  formData.append('type', 'file')
  formData.append('action', 'upload')
  formData.append('timestamp', Date.now().toString())
  formData.append('auth_token', IMGBB_AUTH_TOKEN)

  const res = await fetch(IMGBB_UPLOAD_URL, {
    method: 'POST',
    body: formData
  })

  if (res.ok) {
    const data = await res.json()
    if (data && data.image && data.image.url) {
      return cleanUrl(data.image.url)
    }
    throw new Error('上传返回数据异常')
  }
  throw new Error(`上传失败 (${res.status})`)
}
