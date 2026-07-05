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
  CHAT_MODEL,
  IMG2PROMPT_SYSTEM_ZH,
  IMG2PROMPT_SYSTEM_EN,
  IMG2PROMPT_USER_ZH,
  IMG2PROMPT_USER_EN
} from '../config/api'
import type { RequestResult, ApiResponse } from '../types'

/**
 * 清理 URL，提取纯净的 http/https 地址
 */
function cleanUrl(url: string): string {
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
 */
export function generateImage(
  apiKey: string,
  prompt: string,
  model: string,
  size: string,
  refImageUrls?: string[],
  n?: number
): RequestResult<ApiResponse> {
  const [w, h] = size.split('x').map(Number)
  const alignedW = alignToMultiple(w, 16)
  const alignedH = alignToMultiple(h, 16)

  const requestData: Record<string, unknown> = {
    model,
    prompt,
    size: `${alignedW}x${alignedH}`
  }

  if (n && n > 1) {
    requestData.n = n
  }

  if (refImageUrls && refImageUrls.length > 0) {
    const cleanedImages = refImageUrls.map((url) => cleanUrl(url)).filter((url) => url)
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
    const cleanedUrls = refImageUrls.map((url) => cleanUrl(url)).filter((url) => url)

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
 * 图转提示词
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
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
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
