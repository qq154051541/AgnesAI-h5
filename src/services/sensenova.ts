/**
 * SenseNova API 服务层
 * 封装 SenseNova 平台的对话和图像生成接口
 * 支持 SSE 流式响应解析
 */

import {
  SENSENOVA_BASE_URL,
  SENSENOVA_PATHS
} from '../config/sensenova'
import type {
  RequestResult,
  ApiResponse,
  SenseNovaMessage,
  StreamCallbacks
} from '../types'

/**
 * 通用 fetch 请求封装（带 AbortController）
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
 * 清理 URL
 */
function cleanUrl(url: string): string {
  const safe = String(url).replace(/[^a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]/g, '')
  const match = safe.match(/https?:\/\/[a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]+/)
  return match ? match[0] : safe
}

/**
 * 构建请求头
 */
function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }
}

/* ===== 对话接口 ===== */

interface ChatOptions {
  model: string
  messages: SenseNovaMessage[]
  reasoningEffort?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

/**
 * 非流式对话
 */
export function sensenovaChat(
  apiKey: string,
  options: ChatOptions
): RequestResult<ApiResponse> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    stream: false
  }

  if (options.reasoningEffort) {
    body.reasoning_effort = options.reasoningEffort
  }
  if (options.temperature !== undefined) {
    body.temperature = options.temperature
  }
  if (options.maxTokens !== undefined) {
    body.max_tokens = options.maxTokens
  }

  return fetchWithAbort(
    `${SENSENOVA_BASE_URL}${SENSENOVA_PATHS.CHAT_COMPLETIONS}`,
    {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body)
    },
    120000
  )
}

/**
 * 流式对话（SSE）
 * 返回 abort 函数，通过 callbacks 接收增量数据
 */
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

  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    stream: true,
    stream_options: { include_usage: true }
  }

  if (options.reasoningEffort) {
    body.reasoning_effort = options.reasoningEffort
  }
  if (options.temperature !== undefined) {
    body.temperature = options.temperature
  }
  if (options.maxTokens !== undefined) {
    body.max_tokens = options.maxTokens
  }

  fetch(`${SENSENOVA_BASE_URL}${SENSENOVA_PATHS.CHAT_COMPLETIONS}`, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
    signal: controller.signal
  })
    .then(async (res) => {
      clearTimeout(timeoutId)

      if (!res.ok) {
        const text = await res.text()
        let errMsg = `HTTP ${res.status}`
        try {
          const json = JSON.parse(text)
          errMsg = json?.error?.message || json?.message || errMsg
        } catch {
          if (text) errMsg = text.substring(0, 200)
        }
        callbacks.onError?.(errMsg)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        callbacks.onError?.('无法读取响应流')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // 按 \n 分割，处理完整的 data: 行
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue

          const dataStr = trimmed.slice(5).trim()
          if (dataStr === '[DONE]') {
            callbacks.onDone?.()
            return
          }

          try {
            const chunk = JSON.parse(dataStr)
            const delta = chunk?.choices?.[0]?.delta
            if (!delta) continue

            // 推理内容（DeepSeek V4 思考模式）
            if (delta.reasoning_content) {
              callbacks.onReasoning?.(delta.reasoning_content)
            }
            // 正文内容
            if (delta.content) {
              callbacks.onContent(delta.content)
            }
          } catch {
            // 忽略解析失败的行
          }
        }
      }

      // 处理 buffer 中剩余的数据
      if (buffer.trim().startsWith('data:')) {
        const dataStr = buffer.trim().slice(5).trim()
        if (dataStr && dataStr !== '[DONE]') {
          try {
            const chunk = JSON.parse(dataStr)
            const delta = chunk?.choices?.[0]?.delta
            if (delta) {
              if (delta.reasoning_content) {
                callbacks.onReasoning?.(delta.reasoning_content)
              }
              if (delta.content) {
                callbacks.onContent(delta.content)
              }
            }
          } catch {
            // ignore
          }
        }
      }

      callbacks.onDone?.()
    })
    .catch((err) => {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        // 用户主动取消，不报错
        return
      }
      callbacks.onError?.(err?.message || '网络请求失败')
    })

  return () => {
    clearTimeout(timeoutId)
    controller.abort()
  }
}

/* ===== 图像生成接口 ===== */

/**
 * U1 Fast 信息图生成
 */
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

  if (n && n > 1) {
    body.n = n
  }

  return fetchWithAbort(
    `${SENSENOVA_BASE_URL}${SENSENOVA_PATHS.IMAGE_GENERATIONS}`,
    {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body)
    },
    300000 // 图片生成可能较慢，5分钟超时
  )
}

/* ===== 图片上传（复用 imgbb） ===== */

/**
 * 上传图片到 imgbb（复用现有逻辑）
 */
export async function uploadToImgbbSenseNova(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('source', file)
  formData.append('type', 'file')
  formData.append('action', 'upload')
  formData.append('timestamp', Date.now().toString())
  // 复用项目已有的 imgbb token
  formData.append('auth_token', 'b065dc4094117830e8900b7fa9d2128779736248')

  const res = await fetch('https://imgbb.com/json', {
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
