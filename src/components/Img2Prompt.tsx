import { useState, useEffect, useCallback, useRef } from 'react'
import { Button, Notification } from 'animal-island-ui'
import { STORAGE_KEYS } from '../config/api'
import { imageToPrompt, uploadToImgbb } from '../services/api'
import type { RequestResult, ApiResponse, Img2PromptHistoryItem } from '../types'
import {
  setStorage,
  copyToClipboard,
  formatTime,
  truncateText,
  fileToJpegDataUri
} from '../utils/helpers'
import { useHistory } from '../hooks/useHistory'
import { useHistoryPagination } from '../hooks/useHistoryPagination'
import HistoryPagination from './HistoryPagination'
import HistoryDetail from './HistoryDetail'
import type { HistoryRecordType } from './HistoryDetail'
import ImagePreview from './ImagePreview'

interface Img2PromptProps {
  apiKey: string
  errorMsg: string
  onError: (msg: string) => void
  onLoadingChange: (loading: boolean) => void
  onUsePrompt: (prompt: string) => void
}

const PAGE_SIZE = 10

export default function Img2Prompt({ apiKey, errorMsg, onError, onLoadingChange, onUsePrompt }: Img2PromptProps) {
  const [imageUrl, setImageUrl] = useState('')
  const [imageDataUri, setImageDataUri] = useState('')
  const [imageInput, setImageInput] = useState('')
  const [lang, setLang] = useState<'en' | 'zh'>('en')
  const [result, setResult] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [previewSrc, setPreviewSrc] = useState('')
  const [detailRecord, setDetailRecord] = useState<Img2PromptHistoryItem | null>(null)

  const requestRef = useRef<RequestResult<ApiResponse> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const historyCtrl = useHistory<Img2PromptHistoryItem>(STORAGE_KEYS.IMG2PROMPT_HISTORY)
  const paging = useHistoryPagination(historyCtrl.history, PAGE_SIZE)

  useEffect(() => {
    onLoadingChange(isLoading)
  }, [isLoading, onLoadingChange])

  const addToHistory = useCallback(
    (promptText: string, imgUrl: string, langCode: string) => {
      const record: Img2PromptHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        prompt: promptText,
        imageUrl: imgUrl.startsWith('data:') ? '' : imgUrl,
        lang: langCode,
        time: Date.now(),
        status: 'success'
      } as Img2PromptHistoryItem
      historyCtrl.setHistory((prev) => {
        const updated = [record, ...prev].slice(0, 50)
        historyCtrl.saveHistory(updated)
        return updated
      })
    },
    [historyCtrl]
  )

  const addImageUrl = useCallback(() => {
    const url = imageInput.trim()
    if (!url) return
    setImageUrl(url)
    setImageDataUri('')
    setImageInput('')
  }, [imageInput])

  const uploadImage = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    let dataUri = ''
    try {
      dataUri = await fileToJpegDataUri(file)
    } catch {
      Notification.error('图片格式不支持，请使用 JPG 或 PNG 格式')
      e.target.value = ''
      return
    }
    try {
      const url = await uploadToImgbb(file)
      setImageUrl(url)
      setImageDataUri(dataUri)
      Notification.success('上传成功')
    } catch {
      setImageUrl(dataUri)
      setImageDataUri(dataUri)
      Notification.warning('图床上传失败，已使用本地图片')
    }
    e.target.value = ''
  }, [])

  const handleGenerate = useCallback(() => {
    if (isLoading) return
    if (!apiKey.trim()) {
      onError('请输入 API Key')
      return
    }
    if (!imageUrl.trim()) {
      onError('请输入或上传图片')
      return
    }

    setStorage(STORAGE_KEYS.API_KEY, apiKey.trim())
    onError('')
    setResult('')
    setIsLoading(true)

    const requestImageUrl = (imageDataUri || imageUrl).trim()
    requestRef.current = imageToPrompt(apiKey.trim(), requestImageUrl, lang)
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
          if (/loading IMAGE data|ImageData|Connection reset|upstream_error/i.test(errMsg)) {
            onError('服务端无法访问该图片地址（图床可能拒绝外部访问），请点击「上传」选择本地图片后重试')
          } else {
            onError(errMsg)
          }
        }
      })
      .catch((err) => {
        onError(err?.errMsg || err?.message || '网络请求失败')
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [isLoading, apiKey, imageUrl, imageDataUri, lang, onError, addToHistory])

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

  const copyHistoryPrompt = useCallback(async (item: Img2PromptHistoryItem) => {
    const ok = await copyToClipboard(item.prompt)
    Notification[ok ? 'success' : 'error'](ok ? '已复制提示词' : '复制失败')
  }, [])

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* ===== 图片输入卡片 ===== */}
      <div className="agnes-flash-card">
        <div className="agnes-flash-card-header">
          <span className="agnes-label-icon">🖼️</span>
          <span className="agnes-flash-card-title">图片</span>
          <span className="agnes-label-required">*</span>
          <span className="agnes-flash-card-tip">支持 URL / 上传 · 上传后内嵌发送</span>
        </div>
        <div className="agnes-attr-label" style={{ marginTop: 0 }}>
          <span className="agnes-attr-label-icon">🔗</span>
          <span>图片地址</span>
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
          <div className="agnes-media-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            <div className="agnes-media-tile" style={{ aspectRatio: 'auto', maxHeight: 220 }}>
              <img src={imageUrl} alt="preview" style={{ objectFit: 'contain' }} onClick={() => setPreviewSrc(imageUrl)} />
              <div
                className="agnes-media-tile-remove"
                onClick={() => { setImageUrl(''); setImageDataUri('') }}
                title="移除图片"
              >
                ✕
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== 语言切换卡片 ===== */}
      <div className="agnes-flash-card">
        <div className="agnes-flash-card-header">
          <span className="agnes-label-icon">🌐</span>
          <span className="agnes-flash-card-title">提示词语言</span>
          <span className="agnes-flash-card-tip">切换 AI 输出语言</span>
        </div>
        <div className="agnes-segment">
          <button
            type="button"
            className={`agnes-segment-item ${lang === 'en' ? 'agnes-segment-item-active' : ''}`}
            onClick={() => setLang('en')}
          >
            English
          </button>
          <button
            type="button"
            className={`agnes-segment-item ${lang === 'zh' ? 'agnes-segment-item-active' : ''}`}
            onClick={() => setLang('zh')}
          >
            中文
          </button>
        </div>
      </div>

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

      {errorMsg && (
        <div className="agnes-error-box">{errorMsg}</div>
      )}

      {isLoading && (
        <div className="agnes-loading-box">
          <div className="agnes-spinner" />
          <div className="agnes-loading-text agnes-loading-dots">AI 正在分析图片，生成提示词</div>
          <Button type="dashed" danger size="small" onClick={stopGenerate}>
            终止分析
          </Button>
        </div>
      )}

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
      {historyCtrl.history.length > 0 && (
        <div className="agnes-history-box">
          <div className="agnes-history-header">
            <span className="agnes-history-title">🔍 提示词历史</span>
            <Button size="small" type="dashed" danger onClick={() => { paging.reset(); historyCtrl.clearHistory() }}>
              清空
            </Button>
          </div>
          <div className="agnes-history-list">
            {paging.pagedItems.map((item) => (
              <div
                className="agnes-history-item"
                key={item.id}
                onClick={() => setDetailRecord(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailRecord(item) } }}
              >
                <div className="agnes-history-video-thumb-wrap">
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

                <div className="agnes-history-info">
                  <div className="agnes-history-prompt agnes-history-prompt-multi">
                    {truncateText(item.prompt, 100)}
                  </div>
                  <div className="agnes-history-meta">{formatTime(item.time)}</div>
                </div>

                <div className="agnes-history-actions">
                  <div
                    className="agnes-history-action-btn"
                    onClick={(e) => { e.stopPropagation(); copyHistoryPrompt(item) }}
                  >
                    📋
                  </div>
                  <div
                    className="agnes-history-action-btn"
                    onClick={(e) => { e.stopPropagation(); historyCtrl.deleteHistory(item.id) }}
                  >
                    🗑️
                  </div>
                </div>
              </div>
            ))}
          </div>

          <HistoryPagination
            page={paging.page}
            totalPages={paging.totalPages}
            jumpInput={paging.jumpInput}
            onJumpInputChange={paging.setJumpInput}
            onFirst={paging.goFirst}
            onPrev={paging.goPrev}
            onNext={paging.goNext}
            onLast={paging.goLast}
            onJump={paging.jumpTo}
          />
        </div>
      )}

      <ImagePreview src={previewSrc} onClose={() => setPreviewSrc('')} />
      <HistoryDetail
        record={detailRecord}
        recordType={'img2prompt' as HistoryRecordType}
        onClose={() => setDetailRecord(null)}
      />
    </div>
  )
}
