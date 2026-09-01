/**
 * API 服务层（Agnes AI 平台）
 * 通用 fetch / URL 清洗 / imgbb 上传已抽到 utils/http
 */

import {
  API_BASE_URL,
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
import { cleanUrl, fetchWithAbort, uploadToImgbb } from '../utils/http'
import type { RequestResult, ApiResponse, VideoFlashCreateOptions } from '../types'

/**
 * 将尺寸对齐到指定倍数
 */
function alignToMultiple(value: number, multiple: number): number {
  return Math.round(value / multiple) * multiple
}

/** 清洗参考图 URL 数组（Data URI 原样保留；HTTP URL 走 cleanUrl） */
function sanitizeImageUrls(urls: string[] | undefined): string[] {
  if (!urls || urls.length === 0) return []
  return urls
    .map((url) => (url.startsWith('data:') ? url : cleanUrl(url)))
    .filter((url) => !!url)
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
  n?: number,
  ratio?: string
): RequestResult<ApiResponse> {
  const requestData: Record<string, unknown> = { model, prompt }

  if (ratio) {
    requestData.size = size
    requestData.ratio = ratio
  } else {
    const [w, h] = size.split('x').map(Number)
    requestData.size = `${alignToMultiple(w, 16)}x${alignToMultiple(h, 16)}`
  }

  if (n && n > 1) {
    requestData.n = n
  }

  const cleanedImages = sanitizeImageUrls(refImageUrls)
  if (cleanedImages.length > 0) {
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
 * 创建视频生成任务（Agnes Video V2.0）
 */
export function createVideoTask(
  apiKey: string,
  prompt: string,
  width: number,
  height: number,
  numFrames: number,
  frameRate: number,
  refImageUrls?: string[],
  isKeyframeMode?: boolean,
  options?: {
    negativePrompt?: string
    numInferenceSteps?: number
    seed?: number
  }
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

  const negativePrompt = options?.negativePrompt?.trim()
  if (negativePrompt) body.negative_prompt = negativePrompt
  if (typeof options?.numInferenceSteps === 'number' && options.numInferenceSteps > 0) {
    body.num_inference_steps = options.numInferenceSteps
  }
  if (typeof options?.seed === 'number' && Number.isFinite(options.seed)) {
    body.seed = options.seed
  }

  const cleanedUrls = sanitizeImageUrls(refImageUrls)
  if (cleanedUrls.length > 0) {
    if (isKeyframeMode) {
      body.extra_body = { image: cleanedUrls, mode: 'keyframes' }
    } else if (cleanedUrls.length === 1) {
      body.image = cleanedUrls[0]
    } else {
      body.extra_body = { image: cleanedUrls }
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
 * 查询视频任务状态（Agnes Video V2.0）
 * 视频地址位于 metadata.url（不再兼容 remixed_from_video_id 字段，避免拿到 video_id）
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
    if (options.firstFrame) body.first_frame = cleanUrl(options.firstFrame)
    if (options.lastFrame) body.last_frame = cleanUrl(options.lastFrame)
  } else if (options.mode === 'reference') {
    if (options.images && options.images.length > 0) {
      body.images = sanitizeImageUrls(options.images)
    }
    if (options.audios && options.audios.length > 0) {
      body.audios = options.audios
        .map((url) => (url.startsWith('data:') ? url : cleanUrl(url)))
        .filter((url) => !!url)
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
 * 图转提示词（OpenAI 兼容 image_url 结构）
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
          { type: 'image_url', image_url: { url: imageUrl } }
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

/** 重新导出，避免破坏可能的旧引用 */
export { uploadToImgbb }