/**
 * SSE 流式响应解析（OpenAI 兼容 delta 格式）
 * 用于 SenseNova / Zhipu 等 chat/completions 流式接口
 */

import type { StreamCallbacks } from '../types'

/**
 * 解析单行 data: 帧，提取 reasoning_content / content 并分发给回调
 */
function dispatchDelta(chunk: unknown, callbacks: StreamCallbacks): void {
  const delta = (chunk as { choices?: Array<{ delta?: { reasoning_content?: string; content?: string } }> } | null)
    ?.choices?.[0]?.delta
  if (!delta) return
  if (delta.reasoning_content) callbacks.onReasoning?.(delta.reasoning_content)
  if (delta.content) callbacks.onContent(delta.content)
}

/**
 * 解析并消费一个 ReadableStream，按 data: 行切分后分发增量
 * - 自动按 \n 拆分，逐行处理完整的 data: 行
 * - 遇到 [DONE] 终止
 * - 流关闭后处理 buffer 残留
 */
export async function consumeSSEStream(
  stream: ReadableStream<Uint8Array>,
  decoder: TextDecoder,
  callbacks: StreamCallbacks,
  signal: AbortSignal
): Promise<void> {
  const reader = stream.getReader()
  let buffer = ''

  while (true) {
    if (signal.aborted) return
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

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
        dispatchDelta(JSON.parse(dataStr), callbacks)
      } catch {
        // 忽略解析失败的行
      }
    }
  }

  if (buffer.trim().startsWith('data:')) {
    const dataStr = buffer.trim().slice(5).trim()
    if (dataStr && dataStr !== '[DONE]') {
      try {
        dispatchDelta(JSON.parse(dataStr), callbacks)
      } catch {
        // ignore
      }
    }
  }

  callbacks.onDone?.()
}