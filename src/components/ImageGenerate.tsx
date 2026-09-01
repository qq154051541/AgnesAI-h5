import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { Button, Select, Notification } from 'animal-island-ui'
import { MODELS, SIZES, IMAGE_COUNTS, STORAGE_KEYS } from '../config/api'
import { generateImage, uploadToImgbb } from '../services/api'
import type { RequestResult, ImageHistoryItem } from '../types'
import {
  setStorage,
  copyToClipboard,
  downloadFile,
  formatTime,
  truncateText,
  fileToJpegDataUri,
  getOrientation,
  ORIENTATION_LABELS
} from '../utils/helpers'
import { useStageHint } from '../hooks/useStageHint'
import { useHistoryPagination } from '../hooks/useHistoryPagination'
import { useHistory } from '../hooks/useHistory'
import HistoryPagination from './HistoryPagination'
import HistoryDetail from './HistoryDetail'
import type { HistoryRecordType } from './HistoryDetail'
import ImagePreview from './ImagePreview'


export interface ImageGenerateHandle {
  setPrompt: (text: string) => void
}

interface ImageGenerateProps {
  apiKey: string
  errorMsg: string
  onError: (msg: string) => void
  onLoadingChange: (loading: boolean) => void
}

const PAGE_SIZE = 10
const TIERS = ['1K', '2K', '3K', '4K'] as const

const ImageGenerate = forwardRef<ImageGenerateHandle, ImageGenerateProps>(
  ({ apiKey, errorMsg, onError, onLoadingChange }, ref) => {
    const [modelIndex, setModelIndex] = useState(0)
    const [sizeIndex, setSizeIndex] = useState(0)
    const [countIndex, setCountIndex] = useState(0)
    const [prompt, setPrompt] = useState('')
    const [imageUrls, setImageUrls] = useState<string[]>([])
    const [selectedImageIndexes, setSelectedImageIndexes] = useState<number[]>([])
    const [isSelectMode, setIsSelectMode] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [refImageInput, setRefImageInput] = useState('')
    const [refImageUrls, setRefImageUrls] = useState<string[]>([])

    const [completedCount, setCompletedCount] = useState(0)
    const [totalCount, setTotalCount] = useState(0)
    const [previewSrc, setPreviewSrc] = useState('')
    const [previewIndex, setPreviewIndex] = useState(0)
    const [previewImages, setPreviewImages] = useState<string[] | undefined>(undefined)
    const [detailRecord, setDetailRecord] = useState<ImageHistoryItem | null>(null)

    const requestsRef = useRef<RequestResult[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)
    const stopRequestedRef = useRef(false)
    const { hint: stageHint, elapsed } = useStageHint(isLoading)

    const historyCtrl = useHistory<ImageHistoryItem>(STORAGE_KEYS.IMAGE_HISTORY)
    const paging = useHistoryPagination(historyCtrl.history, PAGE_SIZE)

    useImperativeHandle(ref, () => ({
      setPrompt: (text: string) => setPrompt(text)
    }))

    useEffect(() => {
      onLoadingChange(isLoading)
    }, [isLoading, onLoadingChange])

    const currentModel = MODELS[modelIndex].value
    const availableSizes = SIZES.filter(
      (s) => !s.model || (Array.isArray(s.model) ? s.model.includes(currentModel) : s.model === currentModel)
    )
    const isTierModel = true // 当前仅 2.1/2.5，均为档位模型
    const currentTier = availableSizes[sizeIndex]?.value || '2K'
    const tierSizes = availableSizes.filter((s) => s.value === currentTier)
    const isMaxTier = currentTier === '3K' || currentTier === '4K'
    const imageCount = isMaxTier ? 1 : IMAGE_COUNTS[countIndex].value

    const downloadSingleImage = useCallback((url: string, options?: { silent?: boolean }) => {
      downloadFile(url, `agnes-ai-${Date.now()}.png`, options)
    }, [])

    const handleGenerate = useCallback(() => {
      if (isLoading) return
      if (!apiKey.trim()) { onError('请输入 API Key'); return }
      if (!prompt.trim()) { onError('请输入提示词'); return }

      setStorage(STORAGE_KEYS.API_KEY, apiKey.trim())
      setIsLoading(true)
      onError('')
      setImageUrls([])
      setCompletedCount(0)
      setTotalCount(imageCount)
      requestsRef.current = []
      stopRequestedRef.current = false

      const model = MODELS[modelIndex].value
      const sizeItem = availableSizes[sizeIndex]
      const size = sizeItem.value
      const ratio = sizeItem.ratio

      const taskRecordId = historyCtrl.startTaskRecord({
        url: '',
        urls: [],
        prompt: prompt.trim(),
        model,
        size,
        ratio,
        refImageUrls,
        responseData: null
      } as unknown as Omit<ImageHistoryItem, 'id' | 'time' | 'status'>)

      const errorMessages: string[] = []
      const expected = imageCount

      const sendRequest = (i: number) => {
        if (i >= expected) return
        const request = generateImage(apiKey.trim(), prompt.trim(), model, size, refImageUrls, 1, ratio)
        requestsRef.current.push(request)

        request.promise
          .then((res) => {
            const data = res.data as Record<string, unknown>
            if (res.statusCode === 200 && data && Array.isArray((data as any).data) && (data as any).data.length > 0) {
              const imageData = (data as any).data[0]
              if (imageData.url) {
                setImageUrls((prev) => [...prev, imageData.url])
              } else if (imageData.b64_json) {
                setImageUrls((prev) => [...prev, 'data:image/png;base64,' + imageData.b64_json])
              }
            } else {
              const errMsg = (data as any)?.error?.message || (data as any)?.message || `HTTP ${res.statusCode}`
              errorMessages.push(errMsg)
              onError(errMsg)
            }
          })
          .catch((err) => {
            const errMsg = err?.errMsg || err?.message || '请求超时或网络异常'
            errorMessages.push(errMsg)
            if (!stopRequestedRef.current) onError(errMsg)
          })
          .finally(() => {
            setCompletedCount((prev) => {
              const next = prev + 1
              if (next >= expected) {
                setIsLoading(false)
                requestsRef.current = []
                setImageUrls((currentUrls) => {
                  const detail = errorMessages.length > 0 ? [...new Set(errorMessages)].join('；') : ''
                  if (currentUrls.length === 0) {
                    const wasStopped = stopRequestedRef.current
                    const reason = wasStopped
                      ? '已手动终止'
                      : '所有图片生成均失败' + (detail ? '：' + detail : '')
                    historyCtrl.finishTaskRecord(taskRecordId, {
                        status: wasStopped ? 'interrupted' : 'failed',
                        failReason: reason
                      } as Partial<ImageHistoryItem>)
                    if (!wasStopped) onError(reason)
                  } else {
                    const responseCopy = { data: currentUrls.map((u) => ({ url: u })) }
                    historyCtrl.finishTaskRecord(taskRecordId, {
                        status: 'success',
                        url: currentUrls[0],
                        urls: currentUrls.slice(),
                        responseData: stopRequestedRef.current
                          ? { ...responseCopy, note: `已手动终止，保留已完成 ${currentUrls.length} 张` }
                          : responseCopy
                      } as Partial<ImageHistoryItem>)
                    if (detail) {
                      onError(`部分图片生成失败（成功 ${currentUrls.length}/${expected}）：${detail}`)
                    }
                  }
                  return currentUrls
                })
              }
              return next
            })
          })
      }

      sendRequest(0)
      for (let i = 1; i < expected; i++) {
        setTimeout(() => sendRequest(i), i * 5000)
      }
    }, [isLoading, apiKey, prompt, imageCount, modelIndex, sizeIndex, availableSizes, refImageUrls, onError, historyCtrl])

    const stopImageGenerate = useCallback(() => {
      stopRequestedRef.current = true
      requestsRef.current.forEach((req) => req.abort())
      requestsRef.current = []
      setIsLoading(false)
      onError('已终止生成')
    }, [onError])

    const handleCopyPrompt = useCallback(async () => {
      const ok = await copyToClipboard(prompt)
      Notification[ok ? 'success' : 'error'](ok ? '已复制提示词' : '复制失败')
    }, [prompt])

    const handleDownload = useCallback(() => {
      if (imageUrls.length > 0) downloadSingleImage(imageUrls[0])
    }, [imageUrls, downloadSingleImage])

    const handleDownloadAll = useCallback(() => {
      imageUrls.forEach((url, idx) => {
        setTimeout(() => downloadSingleImage(url, { silent: true }), idx * 500)
      })
      Notification.success(`已发起批量下载，共 ${imageUrls.length} 个文件`)
    }, [imageUrls, downloadSingleImage])

    const copyImageUrl = useCallback(async () => {
      if (imageUrls.length === 0 || imageUrls[0].startsWith('data:')) return
      const ok = await copyToClipboard(imageUrls[0])
      Notification[ok ? 'success' : 'error'](ok ? '已复制图片地址' : '复制失败')
    }, [imageUrls])

    const resetImage = useCallback(() => {
      setImageUrls([])
      setSelectedImageIndexes([])
      setIsSelectMode(false)
      setPrompt('')
      setRefImageInput('')
      setRefImageUrls([])
      onError('')
    }, [onError])

    const toggleSelectMode = useCallback(() => {
      setIsSelectMode((prev) => {
        if (prev) setSelectedImageIndexes([])
        return !prev
      })
    }, [])

    const onGridImageClick = useCallback(
      (idx: number) => {
        if (isSelectMode) {
          setSelectedImageIndexes((prev) =>
            prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
          )
        } else {
          setPreviewImages(imageUrls.length > 1 ? imageUrls : undefined)
          setPreviewIndex(idx)
          setPreviewSrc(imageUrls[idx])
        }
      },
      [isSelectMode, imageUrls]
    )

    const selectAllImages = useCallback(() => {
      setSelectedImageIndexes((prev) =>
        prev.length === imageUrls.length ? [] : imageUrls.map((_, i) => i)
      )
    }, [imageUrls])

    const downloadSelectedImages = useCallback(() => {
      if (selectedImageIndexes.length === 0) {
        Notification.warning('请先选择图片')
        return
      }
      selectedImageIndexes.forEach((idx, i) => {
        setTimeout(() => downloadSingleImage(imageUrls[idx], { silent: true }), i * 500)
      })
      Notification.success(`已发起批量下载，共 ${selectedImageIndexes.length} 个文件`)
      setIsSelectMode(false)
      setSelectedImageIndexes([])
    }, [selectedImageIndexes, imageUrls, downloadSingleImage])


    const addRefImageUrl = useCallback(() => {
      const safe = refImageInput.replace(/[^a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]/g, '')
      const match = safe.match(/https?:\/\/[a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]+/)
      const url = match ? match[0] : safe
      if (!url) return
      setRefImageUrls((prev) => [...prev, url])
      setRefImageInput('')
    }, [refImageInput])

    const uploadRefImage = useCallback(() => {
      fileInputRef.current?.click()
    }, [])

    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const url = await uploadToImgbb(file)
        setRefImageUrls((prev) => [...prev, url])
        Notification.success('上传成功')
      } catch {
        try {
          const dataUri = await fileToJpegDataUri(file)
          setRefImageUrls((prev) => [...prev, dataUri])
          Notification.warning('URL 上传失败，已转用本地图片')
        } catch {
          Notification.error('图片格式不支持，请使用 JPG 或 PNG 格式')
        }
      }
      e.target.value = ''
    }, [])

    const removeRefImage = useCallback((index: number) => {
      setRefImageUrls((prev) => prev.filter((_, i) => i !== index))
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

        <div className="agnes-form-group">
          <div className="agnes-label-row">
            <span className="agnes-label-icon">⚙️</span>
            <span className="agnes-label-text">模型</span>
            <span className="agnes-label-required">*</span>
          </div>
          <Select
            value={String(modelIndex)}
            onChange={(key) => { setModelIndex(Number(key)); setSizeIndex(0) }}
            options={MODELS.map((m, i) => ({ key: String(i), label: m.label }))}
            placeholder="选择模型"
          />
        </div>

        <div className="agnes-form-group">
          <div className="agnes-label-row">
            <span className="agnes-label-icon">📐</span>
            <span className="agnes-label-text">尺寸</span>
            <span className="agnes-label-required">*</span>
          </div>
          <div className="agnes-size-picker-21">
            <div className="agnes-tier-row">
              {TIERS.map((tier) => (
                <button
                  key={tier}
                  className={`agnes-tier-btn ${currentTier === tier ? 'agnes-tier-btn-active' : ''}`}
                  onClick={() => {
                    const idx = availableSizes.findIndex((s) => s.value === tier)
                    if (idx >= 0) setSizeIndex(idx)
                    if (tier === '3K' || tier === '4K') setCountIndex(0)
                  }}
                >
                  {tier}
                </button>
              ))}
            </div>
            <div className="agnes-ratio-scroll">
              {tierSizes.map((s) => {
                const idx = availableSizes.indexOf(s)
                const isActive = idx === sizeIndex
                const [rw, rh] = (s.ratio || '1:1').split(':').map(Number)
                const maxDim = 30
                const previewW = rw >= rh ? maxDim : Math.round((rw / rh) * maxDim)
                const previewH = rh >= rw ? maxDim : Math.round((rh / rw) * maxDim)
                return (
                  <div
                    key={s.ratio}
                    className={`agnes-ratio-item ${isActive ? 'agnes-ratio-item-active' : ''}`}
                    onClick={() => setSizeIndex(idx)}
                  >
                    <div className="agnes-ratio-preview-wrap">
                      <div
                        className="agnes-ratio-preview"
                        style={{ width: `${previewW}px`, height: `${previewH}px` }}
                      />
                    </div>
                    <div className="agnes-ratio-info">
                      <span className="agnes-ratio-label">{s.ratio}</span>
                      <span className="agnes-ratio-pixels">{s.label.split(' ').pop()?.replace(/[（）]/g, '')}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {isTierModel && (
          <div className="agnes-form-group">
            <div className="agnes-label-row">
              <span className="agnes-label-icon">🔢</span>
              <span className="agnes-label-text">数量</span>
              {isMaxTier && <span className="agnes-label-optional">3K/4K 仅支持 1 张</span>}
            </div>
            <Select
              value={String(isMaxTier ? 0 : countIndex)}
              onChange={(key) => setCountIndex(Number(key))}
              options={IMAGE_COUNTS.map((c, i) => ({ key: String(i), label: c.label }))}
              placeholder="选择数量"
              disabled={isMaxTier}
            />
          </div>
        )}

        <div className="agnes-form-group">
          <div className="agnes-label-row">
            <span className="agnes-label-icon">✨</span>
            <span className="agnes-label-text">提示词</span>
            <span className="agnes-label-required">*</span>
            {prompt && (
              <div className="agnes-prompt-actions">
                <Button size="small" onClick={handleCopyPrompt}>复制</Button>
                <Button size="small" onClick={() => setPrompt('')}>清除</Button>
              </div>
            )}
          </div>
          <textarea
            className="agnes-textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述你想要生成的图像，例如：一只在月光下奔跑的白色猫咪，赛博朋克风格，霓虹灯光，8k 分辨率"
          />
        </div>

        <div className="agnes-form-group">
          <div className="agnes-label-row">
            <span className="agnes-label-icon">🖼️</span>
            <span className="agnes-label-text">参考图（图生图）</span>
            <span className="agnes-label-optional">可选，支持多张</span>
          </div>
          <div className="agnes-ref-input-row">
            <input
              className="agnes-textarea agnes-ref-input"
              value={refImageInput}
              onChange={(e) => setRefImageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addRefImageUrl()}
              placeholder="输入图片 URL 后点击添加"
            />
            <Button size="middle" onClick={addRefImageUrl}>添加</Button>
            <Button size="middle" type="dashed" onClick={uploadRefImage}>上传</Button>
          </div>
          <div className="agnes-ref-tips">添加参考图后，AI 将基于参考图风格生成新图像，支持多张参考图</div>
          {refImageUrls.length > 0 && (
            <div className="agnes-media-grid">
              {refImageUrls.map((url, index) => (
                <div className="agnes-media-tile" key={index}>
                  <img src={url} alt={`ref-${index}`} onClick={() => setPreviewSrc(url)} />
                  <div className="agnes-media-tile-remove" onClick={() => removeRefImage(index)} title="删除">✕</div>
                </div>
              ))}
            </div>
          )}
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
            {isLoading ? '生成中...' : '✦ 生成图片' + (imageCount > 1 ? ' ×' + imageCount : '')}
          </Button>
        </div>

        {errorMsg && <div className="agnes-error-box">{errorMsg}</div>}

        {isLoading && (
          <div className="agnes-loading-box">
            <div className="agnes-spinner" />
            {totalCount > 1 ? (
              <>
                <div className="agnes-loading-text">AI 正在创作中（{completedCount}/{totalCount}）</div>
                <div className="agnes-progress-bar">
                  <div
                    className="agnes-progress-fill"
                    style={{ width: `${Math.round((completedCount / totalCount) * 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="agnes-loading-text agnes-loading-dots">{stageHint}</div>
                <div className="agnes-loading-elapsed">已等待 {elapsed} 秒</div>
              </>
            )}
            <Button type="dashed" danger size="small" onClick={stopImageGenerate}>
              终止生成
            </Button>
          </div>
        )}

        {imageUrls.length > 0 && (
          <div className="agnes-result-box">
            <div className="agnes-result-header">
              <span className="agnes-result-title">
                {imageUrls.length > 1 ? `🖼️ 生成结果（${imageUrls.length} 张）` : '🖼️ 生成结果'}
              </span>
              {imageUrls.length > 1 && (
                <Button size="small" type="dashed" onClick={toggleSelectMode}>
                  {isSelectMode ? '取消选择' : '选择下载'}
                </Button>
              )}
            </div>

            {imageUrls.length === 1 ? (
              <img
                className="agnes-result-image"
                src={imageUrls[0]}
                alt="result"
                onClick={() => { setPreviewImages(imageUrls.length > 1 ? imageUrls : undefined); setPreviewIndex(0); setPreviewSrc(imageUrls[0]) }}
              />
            ) : (
              <div className="agnes-result-grid">
                {imageUrls.map((url, idx) => (
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

            {isSelectMode && imageUrls.length > 1 && (
              <div className="agnes-select-actions">
                <Button onClick={selectAllImages}>
                  {selectedImageIndexes.length === imageUrls.length ? '取消全选' : '全选'}
                </Button>
                <Button type="primary" onClick={downloadSelectedImages}>
                  下载选中（{selectedImageIndexes.length}）
                </Button>
              </div>
            )}

            {!isSelectMode && (
              <div className="agnes-result-actions">
                {imageUrls.length > 1 && (
                  <div className="agnes-result-action-btn" onClick={handleDownloadAll}>
                    <span className="agnes-result-action-icon">⬇</span>
                    <span className="agnes-result-action-label">全部下载</span>
                  </div>
                )}
                <div className="agnes-result-action-btn" onClick={handleDownload}>
                  <span className="agnes-result-action-icon">⬇</span>
                  <span className="agnes-result-action-label">
                    {imageUrls.length > 1 ? '下载首张' : '下载图片'}
                  </span>
                </div>
                {imageUrls.length === 1 && !imageUrls[0].startsWith('data:') && (
                  <div className="agnes-result-action-btn" onClick={copyImageUrl}>
                    <span className="agnes-result-action-icon">📋</span>
                    <span className="agnes-result-action-label">复制地址</span>
                  </div>
                )}
                <div className="agnes-result-action-btn agnes-result-action-danger" onClick={resetImage}>
                  <span className="agnes-result-action-icon">🗑️</span>
                  <span className="agnes-result-action-label">清除结果</span>
                </div>
              </div>
            )}
          </div>
        )}

        {historyCtrl.history.length > 0 && (
          <div className="agnes-history-box">
            <div className="agnes-header-row">
              <span className="agnes-history-title">📋 图片历史</span>
              <Button size="small" type="dashed" danger onClick={() => { historyCtrl.clearHistory(); paging.reset() }}>
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
                  {item.url || (item.urls && item.urls.length > 0) ? (
                    <img className="agnes-history-thumb" src={item.url || item.urls![0]} alt="thumb" />
                  ) : (
                    <div className="agnes-history-thumb agnes-history-thumb-placeholder">
                      {item.status === 'generating' ? '⏳' : '⛔'}
                    </div>
                  )}
                  <div className="agnes-history-info">
                    <div className="agnes-history-prompt">{truncateText(item.prompt, 30)}</div>
                    <div className="agnes-history-tags">
                      {item.status === 'generating' && <span className="agnes-history-tag">⏳ 生成中</span>}
                      {item.status === 'interrupted' && <span className="agnes-history-tag">⛔ 已中断</span>}
                      {item.status === 'failed' && <span className="agnes-history-tag">⚠️ 失败</span>}
                      <span className="agnes-history-tag">{item.model}</span>
                      <span className="agnes-history-tag">{item.size}{item.ratio ? ` ${item.ratio}` : ''}</span>
                      {(() => {
                        const o = getOrientation(item.size, item.ratio)
                        return o ? <span className="agnes-history-tag agnes-orientation-tag" data-orientation={o}>{ORIENTATION_LABELS[o].icon} {ORIENTATION_LABELS[o].text}</span> : null
                      })()}
                      {item.urls && item.urls.length > 1 && (
                        <span className="agnes-history-tag">{item.urls.length}张</span>
                      )}
                    </div>
                    <div className="agnes-history-meta">{formatTime(item.time)}</div>
                  </div>
                  <div
                    className="agnes-history-delete-btn"
                    onClick={(e) => { e.stopPropagation(); historyCtrl.deleteHistory(item.id) }}
                  >✕</div>
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

      <ImagePreview
        src={previewSrc}
        images={previewImages}
        initialIndex={previewIndex}
        onClose={() => setPreviewSrc('')}
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

ImageGenerate.displayName = 'ImageGenerate'
export default ImageGenerate