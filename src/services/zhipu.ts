/**
 * 智谱 AI（BigModel）API 服务层
 * 通用 fetch / SSE 解析已抽到 utils
 */

import {
  ZHIPU_BASE_URL,
  ZHIPU_PATHS,
  ZHIPU_VISION_MODEL,
  ZHIPU_VIDEO_MODEL,
  ZHIPU_IMG2PROMPT_SYSTEM_ZH,
  ZHIPU_IMG2PROMPT_SYSTEM_EN,
  ZHIPU_IMG2PROMPT_USER_ZH,
  ZHIPU_IMG2PROMPT_USER_EN
} from '../config/zhipu'
import {
  cleanUrl,
  fetchWithAbort,
  buildJsonHeaders,
  uploadToImgbb
} from '../utils/http'
import { consumeSSEStream } from '../utils/sse'
import type {
  RequestResult,
  ApiResponse,
  StreamCallbacks
} from '../types'

/** GLM 消息内容块（多模态） */
export interface ZhipuContentBlock {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

/** GLM 消息 */
export interface ZhipuMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ZhipuContentBlock[]
}

interface ChatOptions {
  model: string
  messages: ZhipuMessage[]
  /** 思考模式：enabled / disabled */
  thinkingType?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

function buildChatBody(options: ChatOptions, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    stream
  }
  if (stream) body.stream_options = { include_usage: true }
  if (options.thinkingType) body.thinking = { type: options.thinkingType }
  if (options.temperature !== undefined) body.temperature = options.temperature
  if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens
  return body
}

/** 非流式对话（保留兼容） */
export function zhipuChat(
  apiKey: string,
  options: ChatOptions
): RequestResult<ApiResponse> {
  return fetchWithAbort(
    `${ZHIPU_BASE_URL}${ZHIPU_PATHS.CHAT_COMPLETIONS}`,
    {
      method: 'POST',
      headers: buildJsonHeaders(apiKey),
      body: JSON.stringify(buildChatBody(options, false))
    },
    120000
  )
}

/** 流式对话（SSE） */
export function zhipuChatStream(
  apiKey: string,
  options: ChatOptions,
  callbacks: StreamCallbacks
): () => void {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
    callbacks.onError?.('请求超时')
  }, 120000)

  fetch(`${ZHIPU_BASE_URL}${ZHIPU_PATHS.CHAT_COMPLETIONS}`, {
    method: 'POST',
    headers: buildJsonHeaders(apiKey),
    body: JSON.stringify(buildChatBody(options, true)),
    signal: controller.signal
  })
    .then(async (res) => {
      clearTimeout(timeoutId)
      if (!res.ok || !res.body) {
        let errMsg = `HTTP ${res.status}`
        try {
          const text = await res.text()
          const json = JSON.parse(text)
          errMsg = json?.error?.message || json?.message || errMsg
        } catch {
          /* ignore */
        }
        callbacks.onError?.(errMsg)
        return
      }
      await consumeSSEStream(res.body, new TextDecoder(), callbacks, controller.signal)
    })
    .catch((err) => {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') return
      callbacks.onError?.(err?.message || '网络请求失败')
    })

  return () => {
    clearTimeout(timeoutId)
    controller.abort()
  }
}

/** 复用全局 imgbb 上传（保留旧名兼容旧引用） */
export const uploadToImgbbZhipu = uploadToImgbb
export { cleanUrl }

/** CogView-3-Flash 文生图 */
export function zhipuGenerateImage(
  apiKey: string,
  prompt: string,
  size: string
): RequestResult<ApiResponse> {
  return fetchWithAbort(
    `${ZHIPU_BASE_URL}${ZHIPU_PATHS.IMAGE_GENERATIONS}`,
    {
      method: 'POST',
      headers: buildJsonHeaders(apiKey),
      body: JSON.stringify({ model: 'cogview-3-flash', prompt, size })
    },
    300000
  )
}

/** 图转提示词（GLM-4.6V-Flash 多模态） */
export function zhipuImageToPrompt(
  apiKey: string,
  imageUrl: string,
  lang: string
): RequestResult<ApiResponse> {
  const isZh = lang === 'zh'
  const systemPrompt = isZh ? ZHIPU_IMG2PROMPT_SYSTEM_ZH : ZHIPU_IMG2PROMPT_SYSTEM_EN
  const userText = isZh ? ZHIPU_IMG2PROMPT_USER_ZH : ZHIPU_IMG2PROMPT_USER_EN

  const body: Record<string, unknown> = {
    model: ZHIPU_VISION_MODEL,
    temperature: 0.7,
    stream: false,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }
    ]
  }

  return fetchWithAbort(
    `${ZHIPU_BASE_URL}${ZHIPU_PATHS.CHAT_COMPLETIONS}`,
    {
      method: 'POST',
      headers: buildJsonHeaders(apiKey),
      body: JSON.stringify(body)
    },
    120000
  )
}

/** 视频生成请求参数 */
export interface ZhipuVideoOptions {
  prompt: string
  imageUrl?: string | string[]
  size: string
  duration: number
  fps: number
  quality: string
  withAudio: boolean
}

/** 创建视频生成任务（异步） */
export function zhipuCreateVideoTask(
  apiKey: string,
  options: ZhipuVideoOptions
): RequestResult<ApiResponse> {
  const body: Record<string, unknown> = {
    model: ZHIPU_VIDEO_MODEL,
    prompt: options.prompt,
    size: options.size,
    duration: options.duration,
    fps: options.fps,
    quality: options.quality,
    with_audio: options.withAudio
  }
  if (options.imageUrl) body.image_url = options.imageUrl

  return fetchWithAbort(
    `${ZHIPU_BASE_URL}${ZHIPU_PATHS.VIDEO_GENERATIONS}`,
    {
      method: 'POST',
      headers: buildJsonHeaders(apiKey),
      body: JSON.stringify(body)
    },
    60000
  )
}

/** 查询异步任务结果 */
export function zhipuQueryVideoTask(
  apiKey: string,
  taskId: string
): RequestResult<ApiResponse> {
  return fetchWithAbort(
    `${ZHIPU_BASE_URL}${ZHIPU_PATHS.ASYNC_RESULT}/${encodeURIComponent(taskId)}`,
    {
      method: 'GET',
      headers: buildJsonHeaders(apiKey)
    },
    30000
  )
}