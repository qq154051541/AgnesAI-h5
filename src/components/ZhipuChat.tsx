import { useState, useEffect, useCallback, useRef } from 'react'
import { Button, Notification } from 'animal-island-ui'
import {
  ZHIPU_THINKING_MODES,
  getZhipuStorageKeys
} from '../config/zhipu'
import {
  zhipuChatStream,
  uploadToImgbbZhipu
} from '../services/zhipu'
import type { ZhipuMessage, ZhipuContentBlock } from '../services/zhipu'
import type {
  SenseNovaChatMessage,
  SenseNovaChatHistoryItem
} from '../types'
import {
  getStorage,
  setStorage,
  copyToClipboard,
  formatTime,
  fileToJpegDataUri
} from '../utils/helpers'
import ImagePreview from './ImagePreview'

interface ZhipuChatProps {
  apiKey: string
  modelValue: string
  modelLabel: string
  modelDescription: string
  /** 是否支持图片输入（多模态） */
  supportsImage?: boolean
  errorMsg: string
  onError: (msg: string) => void
  onLoadingChange: (loading: boolean) => void
}

const PAGE_SIZE = 10

export default function ZhipuChat({
  apiKey,
  modelValue,
  modelLabel,
  modelDescription,
  supportsImage = false,
  errorMsg,
  onError,
  onLoadingChange
}: ZhipuChatProps) {
  /* ===== 聊天状态 ===== */
  const [chatMessages, setChatMessages] = useState<SenseNovaChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [thinkingModeIndex, setThinkingModeIndex] = useState(1) // 默认启用深度思考
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingReasoning, setStreamingReasoning] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [showReasoning, setShowReasoning] = useState(true)

  /* ===== 图片输入（GLM-4.6V-Flash） ===== */
  const [chatImageUrl, setChatImageUrl] = useState('')
  const [chatImageInput, setChatImageInput] = useState('')
  const [previewSrc, setPreviewSrc] = useState('')

  /* ===== 历史记录 ===== */
  const [chatHistory, setChatHistory] = useState<SenseNovaChatHistoryItem[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyJumpPage, setHistoryJumpPage] = useState('')

  /* ===== Refs ===== */
  const abortStreamRef = useRef<(() => void) | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const currentSessionIdRef = useRef<string | null>(null)

  const { historyKey, chatMessagesKey, systemPromptKey } = getZhipuStorageKeys(modelValue)
  const sessionIdKey = `${chatMessagesKey}-session-id`

  /* ===== 初始化 ===== */
  useEffect(() => {
    const savedHistory = getStorage<SenseNovaChatHistoryItem[]>(historyKey)
    if (savedHistory) setChatHistory(savedHistory)
    const savedMessages = getStorage<SenseNovaChatMessage[]>(chatMessagesKey)
    if (savedMessages) setChatMessages(savedMessages)
    const savedSystemPrompt = getStorage<string>(systemPromptKey)
    if (savedSystemPrompt) {
      setSystemPrompt(savedSystemPrompt)
      if (savedSystemPrompt.trim()) setShowSystemPrompt(true)
    }
    const savedSessionId = getStorage<string>(sessionIdKey)
    if (savedSessionId) currentSessionIdRef.current = savedSessionId
  }, [historyKey, chatMessagesKey, systemPromptKey, sessionIdKey])

  /* ===== 持久化对话内容 ===== */
  useEffect(() => {
    setStorage(chatMessagesKey, chatMessages)
  }, [chatMessages, chatMessagesKey])

  /* ===== 持久化系统提示词 ===== */
  useEffect(() => {
    setStorage(systemPromptKey, systemPrompt)
  }, [systemPrompt, systemPromptKey])

  useEffect(() => {
    onLoadingChange(isStreaming)
  }, [isStreaming, onLoadingChange])

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [chatMessages, streamingContent, streamingReasoning])

  /* ===== 工具方法 ===== */
  const saveChatHistory = useCallback(
    (items: SenseNovaChatHistoryItem[]) => {
      setStorage(historyKey, items)
    },
    [historyKey]
  )

  /* ===== 构建多模态消息内容 ===== */
  const buildUserContent = useCallback(
    (text: string, imageUrl?: string): string | ZhipuContentBlock[] => {
      if (!supportsImage || !imageUrl) {
        return text
      }
      const blocks: ZhipuContentBlock[] = [
        { type: 'text', text: text || '请描述这张图片' },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
      return blocks
    },
    [supportsImage]
  )

  /* ===== 聊天功能 ===== */
  const handleSendMessage = useCallback(() => {
    if (isStreaming) return
    if (!apiKey.trim()) {
      onError('请输入智谱 AI API Key')
      return
    }
    if (!chatInput.trim() && !chatImageUrl) {
      onError('请输入消息内容或添加图片')
      return
    }

    onError('')

    const userMsg: SenseNovaChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: chatInput.trim(),
      imageUrl: chatImageUrl || undefined,
      model: modelValue,
      time: Date.now()
    }

    const apiMessages: ZhipuMessage[] = []

    if (systemPrompt.trim()) {
      apiMessages.push({ role: 'system', content: systemPrompt.trim() })
    }

    const recentMessages = chatMessages.slice(-10)
    for (const msg of recentMessages) {
      if (msg.role === 'user') {
        const content = buildUserContent(msg.content, msg.imageUrl)
        apiMessages.push({ role: 'user', content })
      } else {
        apiMessages.push({ role: 'assistant', content: msg.content })
      }
    }

    // 当前消息
    apiMessages.push({
      role: 'user',
      content: buildUserContent(chatInput.trim(), chatImageUrl)
    })

    setChatMessages((prev) => [...prev, userMsg])
    setChatInput('')
    setChatImageUrl('')
    setChatImageInput('')
    setStreamingContent('')
    setStreamingReasoning('')
    setIsStreaming(true)

    const thinkingType = ZHIPU_THINKING_MODES[thinkingModeIndex].value

    let contentAccumulator = ''
    let reasoningAccumulator = ''

    abortStreamRef.current = zhipuChatStream(
      apiKey.trim(),
      {
        model: modelValue,
        messages: apiMessages,
        thinkingType,
        temperature: 1.0,
        maxTokens: 65536
      },
      {
        onContent: (chunk) => {
          contentAccumulator += chunk
          setStreamingContent(contentAccumulator)
        },
        onReasoning: (chunk) => {
          reasoningAccumulator += chunk
          setStreamingReasoning(reasoningAccumulator)
        },
        onDone: () => {
          const assistantMsg: SenseNovaChatMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: contentAccumulator || '(无回复内容)',
            reasoningContent: reasoningAccumulator || undefined,
            model: modelValue,
            time: Date.now()
          }
          const allMessages = [...chatMessages, userMsg, assistantMsg]
          setChatMessages((prev) => [...prev, assistantMsg])
          setStreamingContent('')
          setStreamingReasoning('')
          setIsStreaming(false)
          abortStreamRef.current = null

          const sessionId = currentSessionIdRef.current
          if (sessionId) {
            // 更新当前会话的历史记录（连续对话合并为一条）
            setChatHistory((prev) => {
              const updated = prev.map((item) =>
                item.id === sessionId
                  ? { ...item, messages: allMessages, time: Date.now() }
                  : item
              )
              saveChatHistory(updated)
              return updated
            })
          } else {
            // 创建新的会话历史记录
            const newId = `chat-${Date.now()}`
            currentSessionIdRef.current = newId
            setStorage(sessionIdKey, newId)
            const historyItem: SenseNovaChatHistoryItem = {
              id: newId,
              model: modelValue,
              messages: allMessages,
              reasoningEffort: thinkingType,
              time: Date.now()
            }
            setChatHistory((prev) => {
              const updated = [historyItem, ...prev].slice(0, 50)
              saveChatHistory(updated)
              return updated
            })
          }
        },
        onError: (err) => {
          setIsStreaming(false)
          onError(err)
          abortStreamRef.current = null
          if (contentAccumulator) {
            const assistantMsg: SenseNovaChatMessage = {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: contentAccumulator,
              reasoningContent: reasoningAccumulator || undefined,
              model: modelValue,
              time: Date.now()
            }
            const allMessages = [...chatMessages, userMsg, assistantMsg]
            setChatMessages((prev) => [...prev, assistantMsg])

            // 出错时也保存部分对话到历史记录
            const sessionId = currentSessionIdRef.current
            if (sessionId) {
              setChatHistory((prev) => {
                const updated = prev.map((item) =>
                  item.id === sessionId
                    ? { ...item, messages: allMessages, time: Date.now() }
                    : item
                )
                saveChatHistory(updated)
                return updated
              })
            } else {
              const newId = `chat-${Date.now()}`
              currentSessionIdRef.current = newId
              setStorage(sessionIdKey, newId)
              const historyItem: SenseNovaChatHistoryItem = {
                id: newId,
                model: modelValue,
                messages: allMessages,
                reasoningEffort: thinkingType,
                time: Date.now()
              }
              setChatHistory((prev) => {
                const updated = [historyItem, ...prev].slice(0, 50)
                saveChatHistory(updated)
                return updated
              })
            }
          }
          setStreamingContent('')
          setStreamingReasoning('')
        }
      }
    )
  }, [
    isStreaming, apiKey, chatInput, chatImageUrl, systemPrompt,
    chatMessages, modelValue, thinkingModeIndex,
    onError, saveChatHistory, buildUserContent, sessionIdKey
  ])

  const stopStreaming = useCallback(() => {
    if (abortStreamRef.current) {
      abortStreamRef.current()
      abortStreamRef.current = null
    }
    setIsStreaming(false)
    onError('已终止生成')
  }, [onError])

  const newSession = useCallback(() => {
    if (abortStreamRef.current) {
      abortStreamRef.current()
      abortStreamRef.current = null
    }
    setIsStreaming(false)
    setChatMessages([])
    setStreamingContent('')
    setStreamingReasoning('')
    setChatInput('')
    setChatImageUrl('')
    setChatImageInput('')
    currentSessionIdRef.current = null
    setStorage(sessionIdKey, null)
    setStorage(chatMessagesKey, [])
    Notification.success('已开始新会话')
  }, [chatMessagesKey, sessionIdKey])

  const copyMessage = useCallback(async (text: string) => {
    const ok = await copyToClipboard(text)
    Notification[ok ? 'success' : 'error'](ok ? '已复制' : '复制失败')
  }, [])

  /* ===== 图片输入（GLM-4.6V-Flash） ===== */
  const addChatImageUrl = useCallback(() => {
    const url = chatImageInput.trim()
    if (!url) return
    setChatImageUrl(url)
    setChatImageInput('')
  }, [chatImageInput])

  const uploadChatImage = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const url = await uploadToImgbbZhipu(file)
      setChatImageUrl(url)
      Notification.success('上传成功')
    } catch {
      // 上传失败时转 JPEG Data URI（自动处理 HEIC 等格式）
      try {
        const dataUri = await fileToJpegDataUri(file)
        setChatImageUrl(dataUri)
        Notification.warning('上传失败，已转用本地图片')
      } catch {
        Notification.error('图片格式不支持，请使用 JPG 或 PNG 格式')
      }
    }
    e.target.value = ''
  }, [])

  /* ===== 历史记录操作 ===== */
  const pagedChatHistory = chatHistory.slice(
    (historyPage - 1) * PAGE_SIZE,
    historyPage * PAGE_SIZE
  )
  const historyTotalPages = Math.ceil(chatHistory.length / PAGE_SIZE)

  const clearHistory = useCallback(() => {
    setChatHistory([])
    saveChatHistory([])
    currentSessionIdRef.current = null
    setStorage(sessionIdKey, null)
    setHistoryPage(1)
    setHistoryJumpPage('')
    Notification.success('已清空历史记录')
  }, [saveChatHistory, sessionIdKey])

  const deleteChatHistory = useCallback((id: string) => {
    setChatHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id)
      saveChatHistory(updated)
      return updated
    })
    if (currentSessionIdRef.current === id) {
      currentSessionIdRef.current = null
      setStorage(sessionIdKey, null)
      setChatMessages([])
      setStorage(chatMessagesKey, [])
    }
  }, [saveChatHistory, sessionIdKey, chatMessagesKey])

  const viewChatHistory = useCallback((item: SenseNovaChatHistoryItem) => {
    setChatMessages(item.messages)
    currentSessionIdRef.current = item.id
    setStorage(sessionIdKey, item.id)
    if (item.reasoningEffort) {
      const idx = ZHIPU_THINKING_MODES.findIndex((e) => e.value === item.reasoningEffort)
      if (idx >= 0) setThinkingModeIndex(idx)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [sessionIdKey])

  const jumpHistoryPage = useCallback(() => {
    const page = parseInt(historyJumpPage)
    if (isNaN(page) || page < 1 || page > historyTotalPages) {
      Notification.warning('请输入有效页码')
      return
    }
    setHistoryPage(page)
    setHistoryJumpPage('')
  }, [historyJumpPage, historyTotalPages])

  /* ===== 渲染 ===== */
  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* 模型描述 */}
      <div className="sensenova-model-desc">
        {modelDescription}
      </div>

      {/* 系统提示词（可折叠） */}
      <div className="agnes-form-group">
        <div className="agnes-label-row">
          <span className="agnes-label-icon">📝</span>
          <span className="agnes-label-text">系统提示词</span>
          <span className="agnes-label-optional">可选</span>
          <div className="agnes-prompt-actions">
            <Button size="small" onClick={() => setShowSystemPrompt(!showSystemPrompt)}>
              {showSystemPrompt ? '收起' : '展开'}
            </Button>
          </div>
        </div>
        {showSystemPrompt && (
          <textarea
            className="agnes-textarea"
            style={{ minHeight: '60px' }}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="设定 AI 的角色和行为，例如：你是一个专业的编程助手"
          />
        )}
      </div>

      {/* 思考模式选择 */}
      <div className="agnes-form-group">
        <div className="agnes-label-row">
          <span className="agnes-label-icon">💭</span>
          <span className="agnes-label-text">思考模式</span>
        </div>
        <div className="sensenova-reasoning-row">
          {ZHIPU_THINKING_MODES.map((mode, i) => (
            <button
              key={mode.value}
              className={`sensenova-reasoning-btn ${thinkingModeIndex === i ? 'sensenova-reasoning-active' : ''}`}
              onClick={() => setThinkingModeIndex(i)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* 图片输入（GLM-4.6V-Flash 多模态） */}
      {supportsImage && (
        <div className="agnes-form-group">
          <div className="agnes-label-row">
            <span className="agnes-label-icon">🖼️</span>
            <span className="agnes-label-text">图片输入（视觉理解）</span>
            <span className="agnes-label-optional">可选</span>
          </div>
          {chatImageUrl ? (
            <div className="sensenova-chat-image-preview">
              <img
                src={chatImageUrl}
                alt="chat-image"
                onClick={() => setPreviewSrc(chatImageUrl)}
              />
              <div
                className="agnes-ref-preview-delete"
                onClick={() => setChatImageUrl('')}
              >
                ✕
              </div>
            </div>
          ) : (
            <div className="agnes-ref-input-row">
              <input
                className="agnes-textarea agnes-ref-input"
                value={chatImageInput}
                onChange={(e) => setChatImageInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addChatImageUrl()}
                placeholder="输入图片 URL"
              />
              <Button size="middle" onClick={addChatImageUrl}>添加</Button>
              <Button size="middle" type="dashed" onClick={uploadChatImage}>上传</Button>
            </div>
          )}
        </div>
      )}

      {/* 聊天消息区域 */}
      {chatMessages.length > 0 || isStreaming ? (
        <div className="sensenova-chat-container" ref={chatScrollRef}>
          {chatMessages.map((msg) => (
            <div key={msg.id} className={`sensenova-chat-msg sensenova-chat-${msg.role}`}>
              <div className="sensenova-chat-avatar">
                {msg.role === 'user' ? '🧑' : '🤖'}
              </div>
              <div className="sensenova-chat-bubble">
                {msg.imageUrl && (
                  <img
                    className="sensenova-chat-msg-image"
                    src={msg.imageUrl}
                    alt="msg-image"
                    onClick={() => setPreviewSrc(msg.imageUrl!)}
                  />
                )}
                {msg.content && (
                  <div className="sensenova-chat-text">{msg.content}</div>
                )}
                {msg.reasoningContent && showReasoning && (
                  <div className="sensenova-chat-reasoning">
                    <div className="sensenova-chat-reasoning-header">💭 思考过程</div>
                    <div className="sensenova-chat-reasoning-text">{msg.reasoningContent}</div>
                  </div>
                )}
                <div className="sensenova-chat-meta">
                  <span>{msg.model}</span>
                  <span>{formatTime(msg.time)}</span>
                  {msg.role === 'assistant' && msg.content && (
                    <span
                      className="sensenova-chat-copy-btn"
                      onClick={() => copyMessage(msg.content)}
                    >
                      📋 复制
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isStreaming && (
            <div className="sensenova-chat-msg sensenova-chat-assistant">
              <div className="sensenova-chat-avatar">🤖</div>
              <div className="sensenova-chat-bubble">
                {streamingReasoning && showReasoning && (
                  <div className="sensenova-chat-reasoning">
                    <div className="sensenova-chat-reasoning-header">💭 思考中...</div>
                    <div className="sensenova-chat-reasoning-text">{streamingReasoning}</div>
                  </div>
                )}
                {streamingContent ? (
                  <div className="sensenova-chat-text">{streamingContent}</div>
                ) : (
                  !streamingReasoning && (
                    <div className="sensenova-chat-text sensenova-chat-loading">
                      <span className="sensenova-chat-dot" />
                      <span className="sensenova-chat-dot" />
                      <span className="sensenova-chat-dot" />
                    </div>
                  )
                )}
                <div className="sensenova-chat-meta">
                  <span>{modelValue}</span>
                  <span className="sensenova-streaming-badge">生成中...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="sensenova-chat-empty">
          <div className="sensenova-chat-empty-icon">💬</div>
          <div className="sensenova-chat-empty-text">
            开始与 {modelLabel} 对话
          </div>
          <div className="sensenova-chat-empty-hint">
            {supportsImage
              ? '支持图片/视频/文件理解与深度思考，上传图片或输入消息开始'
              : '支持 Agentic Coding、深度思考与流式输出，输入消息开始对话'}
          </div>
        </div>
      )}

      {/* 输入区域 */}
      <div className="sensenova-chat-input-area">
        <textarea
          className="agnes-textarea sensenova-chat-input"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSendMessage()
            }
          }}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          style={{ minHeight: '60px' }}
        />
        <div className="sensenova-chat-input-actions">
          <Button
            size="small"
            type="dashed"
            onClick={() => setShowReasoning(!showReasoning)}
          >
            {showReasoning ? '隐藏思考' : '显示思考'}
          </Button>
          <Button size="small" type="dashed" onClick={newSession} disabled={isStreaming}>
            ✨ 新建会话
          </Button>
          {isStreaming ? (
            <Button type="dashed" danger size="middle" onClick={stopStreaming}>
              终止
            </Button>
          ) : (
            <Button
              type="primary"
              size="middle"
              onClick={handleSendMessage}
              disabled={isStreaming}
            >
              发送
            </Button>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {errorMsg && <div className="agnes-error-box">{errorMsg}</div>}

      {/* 聊天历史 */}
      {chatHistory.length > 0 && (
        <div className="agnes-history-box">
          <div className="agnes-history-header">
            <span className="agnes-history-title">💬 对话历史</span>
            <Button size="small" type="dashed" danger onClick={clearHistory}>
              清空
            </Button>
          </div>
          <div className="agnes-history-list">
            {pagedChatHistory.map((item) => (
              <div className="agnes-history-item" key={item.id}>
                <div
                  className="agnes-history-info"
                  onClick={() => viewChatHistory(item)}
                >
                  <div className="agnes-history-prompt">
                    {item.messages.find((m) => m.role === 'user')?.content || '(空对话)'}
                  </div>
                  <div className="agnes-history-tags">
                    <span className="agnes-history-tag">{item.model}</span>
                    <span className="agnes-history-tag">{item.messages.length}条</span>
                    <span className="agnes-history-tag">思考: {item.reasoningEffort === 'enabled' ? '启用' : '关闭'}</span>
                  </div>
                  <div className="agnes-history-meta">{formatTime(item.time)}</div>
                </div>
                <div
                  className="agnes-history-delete-btn"
                  onClick={() => deleteChatHistory(item.id)}
                >
                  ✕
                </div>
              </div>
            ))}
          </div>

          {historyTotalPages > 1 && (
            <div className="agnes-history-pagination">
              <Button size="small" disabled={historyPage <= 1} onClick={() => setHistoryPage(1)}>
                首页
              </Button>
              <Button size="small" disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => p - 1)}>
                上一页
              </Button>
              <span className="agnes-page-info">{historyPage} / {historyTotalPages}</span>
              <Button size="small" disabled={historyPage >= historyTotalPages} onClick={() => setHistoryPage((p) => p + 1)}>
                下一页
              </Button>
              <Button size="small" disabled={historyPage >= historyTotalPages} onClick={() => setHistoryPage(historyTotalPages)}>
                尾页
              </Button>
              {historyTotalPages > 3 && (
                <div className="agnes-page-jump">
                  <input
                    className="agnes-page-jump-input"
                    type="number"
                    value={historyJumpPage}
                    maxLength={4}
                    placeholder="页码"
                    onChange={(e) => setHistoryJumpPage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && jumpHistoryPage()}
                  />
                  <Button size="small" onClick={jumpHistoryPage}>跳转</Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <ImagePreview src={previewSrc} onClose={() => setPreviewSrc('')} />
    </div>
  )
}
