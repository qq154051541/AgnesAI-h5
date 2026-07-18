import { useState, useEffect, useCallback, useRef } from 'react'
import { Button, Modal, Notification } from 'animal-island-ui'
import { ZHIPU_STORAGE_KEYS, ZHIPU_VISION_MODEL } from '../config/zhipu'
import { zhipuImageToPrompt, uploadToImgbbZhipu } from '../services/zhipu'
import type { RequestResult, ApiResponse } from '../types'
import type { Img2PromptHistoryItem } from '../types'
import { getStorage, setStorage, copyToClipboard, formatTime, truncateText } from '../utils/helpers'
import ImagePreview from './ImagePreview'

interface ZhipuImg2PromptProps {
  apiKey: string
  errorMsg: string
  onError: (msg: string) => void
  onLoadingChange: (loading: boolean) => void
  onUsePrompt: (prompt: string) => void
}

const PAGE_SIZE = 10

export default function ZhipuImg2Prompt({
  apiKey,
  errorMsg,
  onError,
  onLoadingChange,
  onUsePrompt
}: ZhipuImg2PromptProps) {
  const [imageUrl, setImageUrl] = useState('')
  const [imageInput, setImageInput] = useState('')
  const [lang, setLang] = useState<'en' | 'zh'>('en')
  const [result, setResult] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [history, setHistory] = useState<Img2PromptHistoryItem[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyJumpPage, setHistoryJumpPage] = useState('')
  const [detailItem, setDetailItem] = useState<Img2PromptHistoryItem | null>(null)
  const [previewSrc, setPreviewSrc] = useState('')

  const requestRef = useRef<RequestResult<ApiResponse> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const pagedHistory = history.slice(
    (historyPage - 1) * PAGE_SIZE,
    historyPage * PAGE_SIZE
  )
  const historyTotalPages = Math.ceil(history.length / PAGE_SIZE)

  useEffect(() => {
    const savedHistory = getStorage<Img2PromptHistoryItem[]>(ZHIPU_STORAGE_KEYS.IMG2PROMPT_HISTORY)
    if (savedHistory) {
      setHistory(savedHistory)
    }
  }, [])

  useEffect(() => {
    onLoadingChange(isLoading)
  }, [isLoading, onLoadingChange])

  const saveHistory = useCallback((items: Img2PromptHistoryItem[]) => {
    setStorage(ZHIPU_STORAGE_KEYS.IMG2PROMPT_HISTORY, items)
  }, [])

  const addToHistory = useCallback(
    (promptText: string, imgUrl: string, langCode: string) => {
      const record: Img2PromptHistoryItem = {
        prompt: promptText,
        imageUrl: imgUrl,
        lang: langCode,
        time: Date.now()
      }
      setHistory((prev) => {
        const updated = [record, ...prev].slice(0, 50)
        saveHistory(updated)
        return updated
      })
    },
    [saveHistory]
  )

  const addImageUrl = useCallback(() => {
    const url = imageInput.trim()
    if (!url) return
    setImageUrl(url)
    setImageInput('')
  }, [imageInput])

  const uploadImage = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const url = await uploadToImgbbZhipu(file)
      setImageUrl(url)
      Notification.success('上传成功')
    } catch {
      // 上传失败时使用 base64 本地预览
      const reader = new FileReader()
      reader.onload = (ev) => {
        setImageUrl(ev.target?.result as string)
      }
      reader.readAsDataURL(file)
      Notification.warning('上传失败，使用本地图片')
    }
    e.target.value = ''
  }, [])

  const handleGenerate = useCallback(() => {
    if (isLoading) return
    if (!apiKey.trim()) {
      onError('请输入智谱 AI API Key')
      return
    }
    if (!imageUrl.trim()) {
      onError('请输入或上传图片')
      return
    }

    onError('')
    setResult('')
    setIsLoading(true)

    requestRef.current = zhipuImageToPrompt(apiKey.trim(), imageUrl.trim(), lang)
    requestRef.current.promise
      .then((res) => {
        if (res.statusCode === 200) {
          const data = res.data as Record<string, unknown>
          const choices = data.choices as Array<{ message?: { content?: string } }> | undefined
          if (choices && choices.length > 0) {
            const content = choices[0].message?.content || '无法生成提示词'
            setResult(content)
            addToHistory(content, imageUrl, lang)
          } else {
            onError('返回数据格式异常')
          }
        } else {
          const data = res.data as Record<string, unknown>
          const errMsg =
            (data?.error as { message?: string })?.message ||
            (typeof data === 'string' ? data : JSON.stringify(data)) ||
            `请求失败 (${res.statusCode})`
          onError(errMsg)
        }
      })
      .catch((err) => {
        onError(err?.errMsg || err?.message || '网络请求失败')
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [isLoading, apiKey, imageUrl, lang, onError, addToHistory])

  const stopGenerate = useCallback(() => {
    if (requestRef.current) {
      requestRef.current.abort()
      requestRef.current = null
    }
    setIsLoading(false)
    onError('已终止分析')
  }, [onError])

  const copyResult = useCallback(async () => {
    if (!result) return
    const ok = await copyToClipboard(result)
    Notification[ok ? 'success' : 'error'](ok ? '已复制提示词' : '复制失败')
  }, [result])

  const useResult = useCallback(() => {
    if (!result) return
    onUsePrompt(result)
  }, [result, onUsePrompt])

  const deleteHistory = useCallback(
    (index: number) => {
      const realIndex = (historyPage - 1) * PAGE_SIZE + index
      setHistory((prev) => {
        const updated = prev.filter((_, i) => i !== realIndex)
        saveHistory(updated)
        return updated
      })
    },
    [historyPage, saveHistory]
  )

  const clearHistory = useCallback(() => {
    setHistory([])
    setHistoryPage(1)
    setHistoryJumpPage('')
    saveHistory([])
    Notification.success('已清空')
  }, [saveHistory])

  const jumpHistoryPage = useCallback(() => {
    const page = parseInt(historyJumpPage)
    if (isNaN(page) || page < 1 || page > historyTotalPages) {
      Notification.warning('请输入有效页码')
      return
    }
    setHistoryPage(page)
    setHistoryJumpPage('')
  }, [historyJumpPage, historyTotalPages])

  const copyHistoryPrompt = useCallback(async (item: Img2PromptHistoryItem) => {
    const ok = await copyToClipboard(item.prompt)
    Notification[ok ? 'success' : 'error'](ok ? '已复制提示词' : '复制失败')
  }, [])

  const useDetailPrompt = useCallback(() => {
    if (!detailItem) return
    onUsePrompt(detailItem.prompt)
    setDetailItem(null)
  }, [detailItem, onUsePrompt])

  const copyDetailPrompt = useCallback(async () => {
    if (!detailItem?.prompt) return
    const ok = await copyToClipboard(detailItem.prompt)
    Notification[ok ? 'success' : 'error'](ok ? '已复制提示词' : '复制失败')
  }, [detailItem])

  const reuseDetail = useCallback(() => {
    if (!detailItem) return
    setImageUrl(detailItem.imageUrl)
    setLang((detailItem.lang as 'en' | 'zh') || 'en')
    setDetailItem(null)
    Notification.info('已填入，点击生成')
  }, [detailItem])

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* 模型说明 */}
      <div className="sensenova-model-desc">
        使用 GLM-4.6V-Flash 多模态视觉模型，上传参考图片即可反推生成适配 CogView-3-Flash 的结构化提示词，支持中英文输出，一键填入文生图。
      </div>

      {/* 图片输入 */}
      <div className="agnes-form-group">
        <div className="agnes-label-row">
          <span className="agnes-label-icon">🖼️</span>
          <span className="agnes-label-text">参考图片</span>
          <span className="agnes-label-required">*</span>
        </div>
        <div className="agnes-ref-input-row">
          <input
            className="agnes-textarea agnes-ref-input"
            value={imageInput}
            onChange={(e) => setImageInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addImageUrl()}
            placeholder="输入图片 URL 后点击添加"
          />
          <Button size="middle" onClick={addImageUrl}>添加</Button>
          <Button size="middle" type="dashed" onClick={uploadImage}>上传</Button>
        </div>
        {imageUrl && (
          <div className="agnes-img2prompt-preview-wrap">
            <img
              className="agnes-img2prompt-preview"
              src={imageUrl}
              alt="preview"
              onClick={() => setPreviewSrc(imageUrl)}
            />
            <div
              className="agnes-ref-preview-delete"
              onClick={() => setImageUrl('')}
            >
              ✕
            </div>
          </div>
        )}
      </div>

      {/* 语言切换 */}
      <div className="agnes-form-group">
        <div className="agnes-label-row">
          <span className="agnes-label-icon">🌐</span>
          <span className="agnes-label-text">提示词语言</span>
        </div>
        <div className="agnes-lang-switch">
          <button
            className={`agnes-lang-switch-btn ${lang === 'en' ? 'agnes-lang-active' : ''}`}
            onClick={() => setLang('en')}
          >
            English
          </button>
          <button
            className={`agnes-lang-switch-btn ${lang === 'zh' ? 'agnes-lang-active' : ''}`}
            onClick={() => setLang('zh')}
          >
            中文
          </button>
        </div>
      </div>

      {/* 生成按钮 */}
      <div className="agnes-generate-btn-wrapper">
        <Button
          type="primary"
          size="large"
          block
          loading={isLoading}
          disabled={isLoading}
          onClick={handleGenerate}
        >
          {isLoading ? '分析中...' : '✦ 生成提示词'}
        </Button>
      </div>

      {/* 错误提示 */}
      {errorMsg && (
        <div className="agnes-error-box">{errorMsg}</div>
      )}

      {/* 加载状态 */}
      {isLoading && (
        <div className="agnes-loading-box">
          <div className="agnes-spinner" />
          <div className="agnes-loading-text agnes-loading-dots">GLM-4.6V-Flash 正在分析图片，生成提示词</div>
          <Button type="dashed" danger size="small" onClick={stopGenerate}>
            终止分析
          </Button>
        </div>
      )}

      {/* 结果展示 */}
      {result && (
        <div className="agnes-result-box">
          <div className="agnes-result-header">
            <span className="agnes-result-title">🔍 提示词结果</span>
          </div>
          <div className="agnes-img2prompt-result-box">
            <div className="agnes-img2prompt-result-text">{result}</div>
          </div>
          <div className="agnes-result-actions">
            <div className="agnes-result-action-btn" onClick={copyResult}>
              <span className="agnes-result-action-icon">📋</span>
              <span className="agnes-result-action-label">复制提示词</span>
            </div>
            <div className="agnes-result-action-btn" onClick={useResult}>
              <span className="agnes-result-action-icon">✨</span>
              <span className="agnes-result-action-label">用于图片生成</span>
            </div>
            <div className="agnes-result-action-btn agnes-result-action-danger" onClick={() => { setResult(''); onError('') }}>
              <span className="agnes-result-action-icon">🗑️</span>
              <span className="agnes-result-action-label">清除结果</span>
            </div>
          </div>
        </div>
      )}

      {/* 历史记录 */}
      {history.length > 0 && (
        <div className="agnes-history-box">
          <div className="agnes-history-header">
            <span className="agnes-history-title">🔍 提示词历史</span>
            <Button size="small" type="dashed" danger onClick={clearHistory}>
              清空
            </Button>
          </div>
          <div className="agnes-history-list">
            {pagedHistory.map((item, index) => (
              <div className="agnes-history-item" key={index}>
                {/* 缩略图区域 */}
                <div
                  className="agnes-history-video-thumb-wrap"
                  onClick={() => setDetailItem(item)}
                >
                  {item.imageUrl && !item.imageUrl.startsWith('data:') ? (
                    <img
                      className="agnes-history-thumb"
                      src={item.imageUrl}
                      alt="thumb"
                    />
                  ) : (
                    <div className="agnes-history-thumb-placeholder">
                      🔍
                    </div>
                  )}
                  <span className="agnes-lang-badge">
                    {item.lang === 'zh' ? '中' : 'EN'}
                  </span>
                </div>

                {/* 内容区域 */}
                <div
                  className="agnes-history-info"
                  onClick={() => setDetailItem(item)}
                >
                  <div className="agnes-history-prompt agnes-history-prompt-multi">
                    {truncateText(item.prompt, 100)}
                  </div>
                  <div className="agnes-history-meta">{formatTime(item.time)}</div>
                </div>

                {/* 操作按钮 */}
                <div className="agnes-history-actions">
                  <div
                    className="agnes-history-action-btn"
                    onClick={() => copyHistoryPrompt(item)}
                  >
                    📋
                  </div>
                  <div
                    className="agnes-history-action-btn"
                    onClick={() => deleteHistory(index)}
                  >
                    🗑️
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 分页 */}
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

      {/* 详情弹窗 */}
      <Modal
        open={!!detailItem}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span>提示词记录详情</span>
            <button className="agnes-modal-close-btn" onClick={() => setDetailItem(null)}>✕</button>
          </div>
        }
        onClose={() => setDetailItem(null)}
        typewriter={false}
        footer={null}
        width={520}
      >
        {detailItem && (
          <div className="agnes-detail-popup-body">
            {detailItem.imageUrl && !detailItem.imageUrl.startsWith('data:') && (
              <img
                className="agnes-detail-image"
                src={detailItem.imageUrl}
                alt="detail"
                onClick={() => setPreviewSrc(detailItem.imageUrl)}
              />
            )}

            <div className="agnes-detail-field agnes-detail-prompt-field">
              <div className="agnes-detail-prompt-header">
                <span className="agnes-detail-label">提示词：</span>
                <Button size="small" onClick={copyDetailPrompt}>复制</Button>
              </div>
              <div className="agnes-detail-value agnes-detail-value-long">{detailItem.prompt}</div>
            </div>

            <div className="agnes-detail-field">
              <span className="agnes-detail-label">语言：</span>
              <span className="agnes-detail-value">{detailItem.lang === 'zh' ? '中文' : 'English'}</span>
            </div>
            <div className="agnes-detail-field">
              <span className="agnes-detail-label">模型：</span>
              <span className="agnes-detail-value">{ZHIPU_VISION_MODEL}</span>
            </div>
            <div className="agnes-detail-field">
              <span className="agnes-detail-label">生成时间：</span>
              <span className="agnes-detail-value">{formatTime(detailItem.time)}</span>
            </div>

            {/* 操作按钮 */}
            <div className="agnes-detail-actions">
              <Button type="primary" onClick={useDetailPrompt}>用于图片生成</Button>
              <Button onClick={reuseDetail}>重新分析</Button>
            </div>
          </div>
        )}
      </Modal>
      <ImagePreview src={previewSrc} onClose={() => setPreviewSrc('')} />
    </div>
  )
}
