/**
 * SenseNova API 服务层
 * 通用 fetch / URL 清洗 / SSE 解析已抽到 utils
 */

import {
  SENSENOVA_BASE_URL,
  SENSENOVA_PATHS,
  SENSENOVA_VISION_MODEL,
  SENSENOVA_IMG2PROMPT_SYSTEM_ZH,
  SENSENOVA_IMG2PROMPT_SYSTEM_EN,
  SENSENOVA_IMG2PROMPT_USER_ZH,
  SENSENOVA_IMG2PROMPT_USER_EN
} from '../config/sensenova'
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
  SenseNovaMessage,
  StreamCallbacks
} from '../types'

interface ChatOptions {
  model: string
  messages: SenseNovaMessage[]
  reasoningEffort?: string
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
  if (options.reasoningEffort) body.reasoning_effort = options.reasoningEffort
  if (options.temperature !== undefined) body.temperature = options.temperature
  if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens
  return body
}

/** 非流式对话（保留兼容，当前组件默认使用流式） */
export function sensenovaChat(
  apiKey: string,
  options: ChatOptions
): RequestResult<ApiResponse> {
  return fetchWithAbort(
    `${SENSENOVA_BASE_URL}${SENSENOVA_PATHS.CHAT_COMPLETIONS}`,
    {
      method: 'POST',
      headers: buildJsonHeaders(apiKey),
      body: JSON.stringify(buildChatBody(options, false))
    },
    120000
  )
}

/** 流式对话（SSE），返回 abort 函数 */
export function sensenovaChatStream(
  apiKey: string,
  options: ChatOptions,
  callbacks: StreamCallbacks
): () => void {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
    callbacks.onError?.('请求超时')
  }, 120000)

  fetch(`${SENSENOVA_BASE_URL}${SENSENOVA_PATHS.CHAT_COMPLETIONS}`, {
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

/** U1 Fast 信息图生成 */
export function sensenovaGenerateImage(
  apiKey: string,
  prompt: string,
  size: string,
  n?: number
): RequestResult<ApiResponse> {
  const body: Record<string, unknown> = {
    model: 'sensenova-u1-fast',
    prompt,
    size
  }
  if (n && n > 1) body.n = n

  return fetchWithAbort(
    `${SENSENOVA_BASE_URL}${SENSENOVA_PATHS.IMAGE_GENERATIONS}`,
    {
      method: 'POST',
      headers: buildJsonHeaders(apiKey),
      body: JSON.stringify(body)
    },
    300000
  )
}

/** 图转提示词（多模态视觉模型） */
export function sensenovaImageToPrompt(
  apiKey: string,
  imageUrl: string,
  lang: string
): RequestResult<ApiResponse> {
  const isZh = lang === 'zh'
  const systemPrompt = isZh ? SENSENOVA_IMG2PROMPT_SYSTEM_ZH : SENSENOVA_IMG2PROMPT_SYSTEM_EN
  const userText = isZh ? SENSENOVA_IMG2PROMPT_USER_ZH : SENSENOVA_IMG2PROMPT_USER_EN

  const body: Record<string, unknown> = {
    model: SENSENOVA_VISION_MODEL,
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
    `${SENSENOVA_BASE_URL}${SENSENOVA_PATHS.CHAT_COMPLETIONS}`,
    {
      method: 'POST',
      headers: buildJsonHeaders(apiKey),
      body: JSON.stringify(body)
    },
    120000
  )
}

/** 复用全局 imgbb 上传（保留旧名兼容旧引用） */
export const uploadToImgbbSenseNova = uploadToImgbb
export { cleanUrl }