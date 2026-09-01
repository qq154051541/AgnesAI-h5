import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { Button, Select, Notification } from 'animal-island-ui'
import {
  ZHIPU_IMAGE_SIZES,
  ZHIPU_STORAGE_KEYS,
  ZHIPU_IMAGE_MODEL,
  ZHIPU_REQUEST_INTERVAL,
  ZHIPU_MAX_RETRIES,
  ZHIPU_RETRY_BASE_DELAY,
  ZHIPU_RATE_LIMIT_WINDOW_MS,
  ZHIPU_RATE_LIMIT_MAX_REQUESTS
} from '../config/zhipu'
import { IMAGE_COUNTS } from '../config/api'
import { zhipuGenerateImage } from '../services/zhipu'
import type { SenseNovaImageHistoryItem, RequestResult, ApiResponse } from '../types'
import {
  copyToClipboard,
  downloadFile,
  formatTime,
  truncateText,
  getOrientation,
  ORIENTATION_LABELS
} from '../utils/helpers'
import { useHistory } from '../hooks/useHistory'
import { useHistoryPagination } from '../hooks/useHistoryPagination'
import HistoryPagination from './HistoryPagination'
import HistoryDetail from './HistoryDetail'
import type { HistoryRecordType } from './HistoryDetail'
import ImagePreview from './ImagePreview'

interface ZhipuImageProps {
  apiKey: string

  modelDescription: string
  errorMsg: string
  onError: (msg: string) => void
  onLoadingChange: (loading: boolean) => void
}

export interface ZhipuImageHandle {
  setPrompt: (text: string) => void
}

const PAGE_SIZE = 10

  const ZhipuImage = forwardRef<ZhipuImageHandle, ZhipuImageProps>(
    ({
      apiKey,
      modelDescription,
      errorMsg,
      onError,
      onLoadingChange
    }, ref) => {
  useImperativeHandle(ref, () => ({
    setPrompt: (text: string) => setImgPrompt(text)
  }))

  const [imgPrompt, setImgPrompt] = useState('')
  const [imgSizeIndex, setImgSizeIndex] = useState(0)
  const [imgCountIndex, setImgCountIndex] = useState(0)
  const [imgResultUrls, setImgResultUrls] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedImageIndexes, setSelectedImageIndexes] = useState<number[]>([])
  const [completedCount, setCompletedCount] = useState(0)
  const [previewSrc, setPreviewSrc] = useState('')
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewImages, setPreviewImages] = useState<string[] | undefined>(undefined)
  const [detailRecord, setDetailRecord] = useState<SenseNovaImageHistoryItem | null>(null)

  const requestsRef = useRef<RequestResult<ApiResponse>[]>([])
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const stoppedRef = useRef(false)
  const currentTaskIdRef = useRef<string | null>(null)
  const lastRequestTimeRef = useRef(0)
  const currentIndexRef = useRef(0)
  const completedCountRef = useRef(0)
  const requestTimestampsRef = useRef<number[]>([])

  const historyCtrl = useHistory<SenseNovaImageHistoryItem>(ZHIPU_STORAGE_KEYS.IMAGE_HISTORY)
  const paging = useHistoryPagination(historyCtrl.history, PAGE_SIZE)

  const imageCount = IMAGE_COUNTS[imgCountIndex].value

  useEffect(() => {
    onLoadingChange(isLoading)
  }, [isLoading, onLoadingChange])

  const handleGenerateImage = useCallback(() => {
    if (isLoading) return
    if (!apiKey.trim()) {
      onError('请输入智谱 AI API Key')
      return
    }
    if (!imgPrompt.trim()) {
      onError('请输入生图描述')
      return
    }

    setIsLoading(true)
    onError('')
    setImgResultUrls([])
    setIsSelectMode(false)
    setSelectedImageIndexes([])
    setCompletedCount(0)
    requestsRef.current = []
    timersRef.current = []
    stoppedRef.current = false
    currentIndexRef.current = 0
    completedCountRef.current = 0
    requestTimestampsRef.current = []

    const size = ZHIPU_IMAGE_SIZES[imgSizeIndex].value
    const errorMessages: string[] = []
    const collectedUrls: string[] = []

    const taskRecordId = historyCtrl.startTaskRecord({
      url: '',
      urls: [],
      prompt: imgPrompt.trim(),
      size,
      model: ZHIPU_IMAGE_MODEL,
      responseData: null
    } as unknown as Omit<SenseNovaImageHistoryItem, 'id' | 'time' | 'status'>)
    currentTaskIdRef.current = taskRecordId

    const isRateLimitError = (statusCode: number, errMsg: string): boolean => {
      return (
        statusCode === 429 ||
        errMsg.includes('速率限制') ||
        errMsg.includes('rate limit') ||
        errMsg.includes('Rate limit') ||
        errMsg.includes('RATE LIMIT') ||
        errMsg.includes('Too Many Requests')
      )
    }

    const finishAll = () => {
      setIsLoading(false)
      requestsRef.current = []
      timersRef.current = []
      currentTaskIdRef.current = null

      const detail = errorMessages.length > 0 ? [...new Set(errorMessages)].join('；') : ''
      const wasStopped = stoppedRef.current
      if (collectedUrls.length === 0) {
        historyCtrl.finishTaskRecord(taskRecordId, {
          status: wasStopped ? 'interrupted' : 'failed',
          failReason: wasStopped ? '已手动终止' : '所有图片生成均失败' + (detail ? '：' + detail : '')
        } as Partial<SenseNovaImageHistoryItem>)
        if (!wasStopped) {
          onError('所有图片生成均失败' + (detail ? '：' + detail : ''))
        }
      } else {
        const responseCopy = { data: collectedUrls.map((u) => ({ url: u })) }
        historyCtrl.finishTaskRecord(taskRecordId, {
          status: 'success',
          url: collectedUrls[0],
          urls: collectedUrls.slice(),
          responseData: wasStopped
            ? { ...responseCopy, note: `已手动终止，保留已完成 ${collectedUrls.length} 张` }
            : responseCopy
        } as Partial<SenseNovaImageHistoryItem>)
        if (detail && !wasStopped) {
          onError(`部分图片生成失败（成功 ${collectedUrls.length}/${imageCount}）：${detail}`)
        }
      }
    }

    const scheduleNext = () => {
      if (stoppedRef.current) return
      if (currentIndexRef.current >= imageCount) {
        finishAll()
        return
      }

      const elapsedMs = Date.now() - lastRequestTimeRef.current
      const intervalDelay = Math.max(0, ZHIPU_REQUEST_INTERVAL - elapsedMs)

      const now = Date.now()
      requestTimestampsRef.current = requestTimestampsRef.current.filter(
        (ts) => now - ts < ZHIPU_RATE_LIMIT_WINDOW_MS
      )
      let windowDelay = 0
      if (requestTimestampsRef.current.length >= ZHIPU_RATE_LIMIT_MAX_REQUESTS) {
        const oldestTs = requestTimestampsRef.current[0]
        windowDelay = ZHIPU_RATE_LIMIT_WINDOW_MS - (now - oldestTs) + 200
      }

      const delay = Math.max(intervalDelay, windowDelay)
      const timer = setTimeout(() => sendRequest(0), delay)
      timersRef.current.push(timer)
    }

    const sendRequest = (retryCount = 0) => {
      if (stoppedRef.current) return
      if (currentIndexRef.current >= imageCount) return

      const now = Date.now()
      lastRequestTimeRef.current = now
      requestTimestampsRef.current.push(now)

      const request = zhipuGenerateImage(apiKey.trim(), imgPrompt.trim(), size)
      requestsRef.current.push(request)

      request.promise
        .then((res) => {
          if (stoppedRef.current) return
          const data = res.data as Record<string, unknown>
          const errMsg = (data as any)?.error?.message || (data as any)?.message || ''

          if (isRateLimitError(res.statusCode, errMsg) && retryCount < ZHIPU_MAX_RETRIES) {
            const retryDelay = ZHIPU_RETRY_BASE_DELAY * Math.pow(2, retryCount)
            const timer = setTimeout(() => sendRequest(retryCount + 1), retryDelay)
            timersRef.current.push(timer)
            return
          }

          if (res.statusCode === 200 && data && Array.isArray((data as any).data) && (data as any).data.length > 0) {
            const url = (data as any).data[0].url
            if (url && collectedUrls.length < imageCount) {
              collectedUrls.push(url)
              setImgResultUrls((prev) => [...prev, url])
            }
          } else {
            errorMessages.push(errMsg || `HTTP ${res.statusCode}`)
          }

          currentIndexRef.current += 1
          completedCountRef.current += 1
          setCompletedCount(completedCountRef.current)
          scheduleNext()
        })
        .catch((err) => {
          if (stoppedRef.current) return
          const errMsg = err?.errMsg || err?.message || '请求超时或网络异常'

          if (isRateLimitError(0, errMsg) && retryCount < ZHIPU_MAX_RETRIES) {
            const retryDelay = ZHIPU_RETRY_BASE_DELAY * Math.pow(2, retryCount)
            const timer = setTimeout(() => sendRequest(retryCount + 1), retryDelay)
            timersRef.current.push(timer)
            return
          }

          errorMessages.push(errMsg)
          currentIndexRef.current += 1
          completedCountRef.current += 1
          setCompletedCount(completedCountRef.current)
          scheduleNext()
        })
    }

    sendRequest(0)
  }, [isLoading, apiKey, imgPrompt, imgSizeIndex, imageCount, onError, historyCtrl])

  const stopImageGenerate = useCallback(() => {
    stoppedRef.current = true
    requestsRef.current.forEach((req) => req.abort())
    requestsRef.current = []
    timersRef.current.forEach((t) => clearTimeout(t))
    timersRef.current = []
    setIsLoading(false)
    const taskId = currentTaskIdRef.current
    if (taskId) {
      currentTaskIdRef.current = null
      setImgResultUrls((urls) => {
        if (urls.length > 0) {
          historyCtrl.finishTaskRecord(taskId, {
            status: 'success',
            url: urls[0],
            urls: [...urls],
            responseData: { data: urls.map((u: string) => ({ url: u })), note: `已手动终止，保留已完成 ${urls.length} 张` }
          } as Partial<SenseNovaImageHistoryItem>)
        } else {
          historyCtrl.finishTaskRecord(taskId, { status: 'interrupted', failReason: '已手动终止' })
        }
        return urls
      })
    }
    onError('已终止生成')
  }, [onError, historyCtrl])

  const downloadSingleImage = useCallback((url: string) => {
    downloadFile(url, `cogview-3-flash-${Date.now()}.png`)
  }, [])

  const downloadAllImages = useCallback(() => {
    imgResultUrls.forEach((url, idx) => {
      setTimeout(() => downloadSingleImage(url), idx * 500)
    })
  }, [imgResultUrls, downloadSingleImage])

  const copyImageUrl = useCallback(async () => {
    if (imgResultUrls.length === 0) return
    const ok = await copyToClipboard(imgResultUrls.join(';'))
    Notification[ok ? 'success' : 'error'](ok ? `已复制${imgResultUrls.length}个地址` : '复制失败')
  }, [imgResultUrls])

  const toggleSelectMode = useCallback(() => {
    setIsSelectMode((prev) => {
      if (prev) setSelectedImageIndexes([])
      return !prev
    })
  }, [])

  const onGridImageClick = useCallback((idx: number) => {
    if (isSelectMode) {
      setSelectedImageIndexes((prev) =>
        prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
      )
    } else {
      setPreviewImages(imgResultUrls.length > 1 ? imgResultUrls : undefined)
      setPreviewIndex(idx)
      setPreviewSrc(imgResultUrls[idx])
    }
  }, [isSelectMode, imgResultUrls])

  const selectAllImages = useCallback(() => {
    setSelectedImageIndexes((prev) =>
      prev.length === imgResultUrls.length ? [] : imgResultUrls.map((_, i) => i)
    )
  }, [imgResultUrls])

  const downloadSelectedImages = useCallback(() => {
    if (selectedImageIndexes.length === 0) {
      Notification.warning('请先选择图片')
      return
    }
    selectedImageIndexes.forEach((idx, i) => {
      setTimeout(() => downloadSingleImage(imgResultUrls[idx]), i * 500)
    })
    setIsSelectMode(false)
    setSelectedImageIndexes([])
  }, [selectedImageIndexes, imgResultUrls, downloadSingleImage])

  const resetImages = useCallback(() => {
    setImgResultUrls([])
    setIsSelectMode(false)
    setSelectedImageIndexes([])
    onError('')
  }, [onError])

  return (
    <div>
      <div className="sensenova-model-desc">{modelDescription}</div>

      <div className="agnes-form-row">
        <div className="agnes-form-group">
          <div className="agnes-label-row">
            <span className="agnes-label-icon">📐</span>
            <span className="agnes-label-text">图片尺寸</span>
            <span className="agnes-label-required">*</span>
          </div>
          <Select
            value={String(imgSizeIndex)}
            onChange={(key) => setImgSizeIndex(Number(key))}
            options={ZHIPU_IMAGE_SIZES.map((s, i) => ({ key: String(i), label: s.label }))}
            placeholder="选择尺寸"
          />
          {(() => {
            const o = getOrientation(ZHIPU_IMAGE_SIZES[imgSizeIndex]?.value, ZHIPU_IMAGE_SIZES[imgSizeIndex]?.ratio)
            return o ? <span className={`agnes-orientation-badge agnes-orientation-${o}`}>{ORIENTATION_LABELS[o].icon} {ORIENTATION_LABELS[o].text}</span> : null
          })()}
        </div>
        <div className="agnes-form-group">
          <div className="agnes-label-row">
            <span className="agnes-label-icon">🔢</span>
            <span className="agnes-label-text">数量</span>
          </div>
          <Select
            value={String(imgCountIndex)}
            onChange={(key) => setImgCountIndex(Number(key))}
            options={IMAGE_COUNTS.map((c, i) => ({ key: String(i), label: c.label }))}
            placeholder="选择数量"
          />
        </div>
      </div>

      <div className="agnes-form-group">
        <div className="agnes-label-row">
          <span className="agnes-label-icon">✨</span>
          <span className="agnes-label-text">生图描述</span>
          <span className="agnes-label-required">*</span>
          {imgPrompt && (
            <div className="agnes-prompt-actions">
              <Button size="small" onClick={async () => {
                const ok = await copyToClipboard(imgPrompt)
                Notification[ok ? 'success' : 'error'](ok ? '已复制' : '复制失败')
              }}>复制</Button>
              <Button size="small" onClick={() => setImgPrompt('')}>清除</Button>
            </div>
          )}
        </div>
        <textarea
          className="agnes-textarea"
          style={{ minHeight: '150px' }}
          value={imgPrompt}
          onChange={(e) => setImgPrompt(e.target.value)}
          placeholder="详细描述你想要生成的图片，包括主体、场景、风格、光照、构图、质量等。例如：一只可爱的橘猫坐在窗台上，阳光透过窗帘洒下斑驳光影，温暖治愈风格，电影级画质..."
        />
        <div className="agnes-ref-tips">
          描述越详细，生成效果越好。支持描述主体、场景、艺术风格、光照、构图等
        </div>
      </div>

      <div className="agnes-generate-btn-wrapper">
        <Button
          type="primary"
          size="large"
          block
          loading={isLoading}
          disabled={isLoading}
          onClick={handleGenerateImage}
        >
          {isLoading ? '生成中...' : `✦ 生成图片${imageCount > 1 ? ' ×' + imageCount : ''}`}
        </Button>
      </div>

      {errorMsg && <div className="agnes-error-box">{errorMsg}</div>}

      {isLoading && (
        <div className="agnes-loading-box">
          <div className="agnes-spinner" />
          {imageCount > 1 ? (
            <>
              <div className="agnes-loading-text">AI 正在生成图片（{completedCount}/{imageCount}）</div>
              <div className="agnes-progress-bar">
                <div
                  className="agnes-progress-fill"
                  style={{ width: `${Math.round((completedCount / imageCount) * 100)}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="agnes-loading-text agnes-loading-dots">AI 正在生成图片</div>
            </>
          )}
          <Button type="dashed" danger size="small" onClick={stopImageGenerate}>
            终止生成
          </Button>
        </div>
      )}

      {imgResultUrls.length > 0 && (
        <div className="agnes-result-box">
          <div className="agnes-result-header">
            <span className="agnes-result-title">
              {imgResultUrls.length > 1 ? `🖼️ 生成结果（${imgResultUrls.length} 张）` : '🖼️ 生成结果'}
            </span>
            {imgResultUrls.length > 1 && (
              <Button size="small" type="dashed" onClick={toggleSelectMode}>
                {isSelectMode ? '取消选择' : '选择下载'}
              </Button>
            )}
          </div>

          {imgResultUrls.length === 1 ? (
            <img
              className="agnes-result-image"
              src={imgResultUrls[0]}
              alt="result"
              onClick={() => { setPreviewImages(undefined); setPreviewIndex(0); setPreviewSrc(imgResultUrls[0]) }}
            />
          ) : (
            <div className="agnes-result-grid">
              {imgResultUrls.map((url, idx) => (
                <div className="agnes-result-grid-item" key={idx} onClick={() => onGridImageClick(idx)}>
                  <img className="agnes-result-grid-image" src={url} alt={`result-${idx}`} />
                  {!isSelectMode && <div className="agnes-result-grid-index">{idx + 1}</div>}
                  {isSelectMode && (
                    <div className={`agnes-result-grid-check ${selectedImageIndexes.includes(idx) ? 'agnes-result-grid-checked' : ''}`}>
                      {selectedImageIndexes.includes(idx) ? '✓' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {isSelectMode && imgResultUrls.length > 1 && (
            <div className="agnes-select-actions">
              <Button onClick={selectAllImages}>
                {selectedImageIndexes.length === imgResultUrls.length ? '取消全选' : '全选'}
              </Button>
              <Button type="primary" onClick={downloadSelectedImages}>
                下载选中（{selectedImageIndexes.length}）
              </Button>
            </div>
          )}

          {!isSelectMode && (
            <div className="agnes-result-actions">
              {imgResultUrls.length > 1 && (
                <div className="agnes-result-action-btn" onClick={downloadAllImages}>
                  <span className="agnes-result-action-icon">⬇</span>
                  <span className="agnes-result-action-label">全部下载</span>
                </div>
              )}
              <div className="agnes-result-action-btn" onClick={() => downloadSingleImage(imgResultUrls[0])}>
                <span className="agnes-result-action-icon">⬇</span>
                <span className="agnes-result-action-label">
                  {imgResultUrls.length > 1 ? '下载首张' : '下载图片'}
                </span>
              </div>
              {imgResultUrls.length === 1 && !imgResultUrls[0].startsWith('data:') && (
                <div className="agnes-result-action-btn" onClick={copyImageUrl}>
                  <span className="agnes-result-action-icon">📋</span>
                  <span className="agnes-result-action-label">复制地址</span>
                </div>
              )}
              <div className="agnes-result-action-btn agnes-result-action-danger" onClick={resetImages}>
                <span className="agnes-result-action-icon">🗑️</span>
                <span className="agnes-result-action-label">清除结果</span>
              </div>
            </div>
          )}

          <div className="sensenova-url-warning">
            ⚠️ 图片链接有效期有限，请及时下载保存
          </div>
        </div>
      )}

      {historyCtrl.history.length > 0 && (
        <div className="agnes-history-box">
          <div className="agnes-history-header">
            <span className="agnes-history-title">📋 生图历史</span>
            <Button size="small" type="dashed" danger onClick={() => { paging.reset(); historyCtrl.clearHistory() }}>
              清空
            </Button>
          </div>
          <div className="agnes-history-list">
            {paging.pagedItems.map((imgItem) => {
              const urls = (imgItem.urls && imgItem.urls.length > 0 ? imgItem.urls : [imgItem.url]).filter(Boolean)
              const isMulti = urls.length > 1
              return (
                <div
                  className="agnes-history-item"
                  key={imgItem.id}
                  onClick={() => setDetailRecord(imgItem)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailRecord(imgItem) } }}
                >
                  {urls.length === 0 ? (
                    <div className="agnes-history-thumb agnes-history-thumb-placeholder">
                      {imgItem.status === 'generating' ? '⏳' : '⛔'}
                    </div>
                  ) : isMulti ? (
                    <div className="agnes-history-thumb-grid">
                      {urls.slice(0, 9).map((url, idx) => (
                        <img
                          key={idx}
                          className="agnes-history-thumb-grid-item"
                          src={url}
                          alt={`thumb-${idx}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <img
                      className="agnes-history-thumb"
                      src={urls[0]}
                      alt="thumb"
                    />
                  )}
                  <div className="agnes-history-info">
                    <div className="agnes-history-prompt">
                      {truncateText(imgItem.prompt, 30)}
                    </div>
                    <div className="agnes-history-tags">
                      {imgItem.status === 'generating' && <span className="agnes-history-tag">⏳ 生成中</span>}
                      {imgItem.status === 'interrupted' && <span className="agnes-history-tag">⛔ 已中断</span>}
                      {imgItem.status === 'failed' && <span className="agnes-history-tag">⚠️ 失败</span>}
                      <span className="agnes-history-tag">{imgItem.size}</span>
                      {(() => {
                        const matched = ZHIPU_IMAGE_SIZES.find((s) => s.value === imgItem.size)
                        const o = getOrientation(imgItem.size, matched?.ratio)
                        return o ? <span className="agnes-history-tag agnes-orientation-tag" data-orientation={o}>{ORIENTATION_LABELS[o].icon} {ORIENTATION_LABELS[o].text}</span> : null
                      })()}
                      {isMulti && (
                        <span className="agnes-history-tag">{urls.length}张</span>
                      )}
                    </div>
                    <div className="agnes-history-meta">{formatTime(imgItem.time)}</div>
                  </div>
                  <div
                    className="agnes-history-delete-btn"
                    onClick={(e) => { e.stopPropagation(); historyCtrl.deleteHistory(imgItem.id!) }}
                  >
                    ✕
                  </div>
                </div>
              )
            })}
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

      <ImagePreview
        src={previewSrc}
        images={previewImages}
        initialIndex={previewIndex}
        onClose={() => { setPreviewSrc(''); setPreviewImages(undefined) }}
      />
      <HistoryDetail
        record={detailRecord}
        recordType={'image' as HistoryRecordType}
        onClose={() => setDetailRecord(null)}
      />
    </div>
  )
  }
)

export default ZhipuImage
