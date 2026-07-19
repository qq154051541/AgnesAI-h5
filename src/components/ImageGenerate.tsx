import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { Button, Select, Card, Modal, Notification } from 'animal-island-ui'
import { MODELS, SIZES, IMAGE_COUNTS, STORAGE_KEYS } from '../config/api'
import { generateImage, uploadToImgbb } from '../services/api'
import type { RequestResult } from '../types'
import type { ImageHistoryItem } from '../types'
import { getStorage, setStorage, copyToClipboard, downloadFile, formatTime, truncateText, formatResponseData } from '../utils/helpers'
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
    const [history, setHistory] = useState<ImageHistoryItem[]>([])
    const [historyPage, setHistoryPage] = useState(1)
    const [historyJumpPage, setHistoryJumpPage] = useState('')
    const [detailItem, setDetailItem] = useState<ImageHistoryItem | null>(null)
    const [detailSelectedIndexes, setDetailSelectedIndexes] = useState<number[]>([])
    const [isDetailSelectMode, setIsDetailSelectMode] = useState(false)
    const [completedCount, setCompletedCount] = useState(0)
    const [totalCount, setTotalCount] = useState(0)
    const [previewSrc, setPreviewSrc] = useState('')
    const [previewIndex, setPreviewIndex] = useState(0)
    const [previewImages, setPreviewImages] = useState<string[] | undefined>(undefined)

    const requestsRef = useRef<RequestResult[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    useImperativeHandle(ref, () => ({
      setPrompt: (text: string) => setPrompt(text)
    }))

    // 根据当前模型过滤可用尺寸
    const availableSizes = SIZES.filter((s) => !s.model || s.model === MODELS[modelIndex].value)
    const isV21 = MODELS[modelIndex].value === 'agnes-image-2.1-flash'

    // 2.1 模型：档位 + 宽高比选择
    const TIERS_21 = ['1K', '2K', '3K', '4K'] as const
    const currentTier = isV21 ? (availableSizes[sizeIndex]?.value || '2K') : ''
    const tierSizes = isV21 ? availableSizes.filter((s) => s.value === currentTier) : []
    // 3K/4K 档位限制只能生成 1 张
    const isMaxTier = currentTier === '3K' || currentTier === '4K'
    const imageCount = isMaxTier ? 1 : IMAGE_COUNTS[countIndex].value

    const pagedHistory = history.slice(
      (historyPage - 1) * PAGE_SIZE,
      historyPage * PAGE_SIZE
    )
    const historyTotalPages = Math.ceil(history.length / PAGE_SIZE)

    useEffect(() => {
      const savedHistory = getStorage<ImageHistoryItem[]>(STORAGE_KEYS.IMAGE_HISTORY)
      if (savedHistory) {
        setHistory(savedHistory)
      }
    }, [])

    useEffect(() => {
      onLoadingChange(isLoading)
    }, [isLoading, onLoadingChange])

    const saveHistory = useCallback((items: ImageHistoryItem[]) => {
      setStorage(STORAGE_KEYS.IMAGE_HISTORY, items)
    }, [])

    const addToHistory = useCallback(
      (urls: string[], promptText: string, model: string, size: string, responseData: unknown, refImgs: string[], ratio?: string) => {
        const record: ImageHistoryItem = {
          id: Date.now().toString(),
          url: urls[0],
          urls,
          prompt: promptText,
          model,
          size,
          ratio,
          refImageUrls: refImgs,
          time: Date.now(),
          responseData
        }
        setHistory((prev) => {
          const updated = [record, ...prev].slice(0, 50)
          saveHistory(updated)
          return updated
        })
      },
      [saveHistory]
    )

    const handleGenerate = useCallback(() => {
      if (isLoading) return
      if (!apiKey.trim()) {
        onError('请输入 API Key')
        return
      }
      if (!prompt.trim()) {
        onError('请输入提示词')
        return
      }

      setStorage(STORAGE_KEYS.API_KEY, apiKey.trim())
      setIsLoading(true)
      onError('')
      setImageUrls([])
      setCompletedCount(0)
      setTotalCount(imageCount)
      requestsRef.current = []

      const model = MODELS[modelIndex].value
      const sizeItem = availableSizes[sizeIndex]
      const size = sizeItem.value
      const ratio = sizeItem.ratio

      const errorMessages: string[] = []

      const sendRequest = (i: number) => {
        if (i >= imageCount) return
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
            onError(errMsg)
          })
          .finally(() => {
            setCompletedCount((prev) => {
              const next = prev + 1
              if (next >= imageCount) {
                setIsLoading(false)
                requestsRef.current = []
                setImageUrls((currentUrls) => {
                  if (currentUrls.length === 0) {
                    const detail = errorMessages.length > 0 ? '：' + [...new Set(errorMessages)].join('；') : ''
                    onError('所有图片生成均失败' + detail)
                  } else {
                    const responseCopy = { data: currentUrls.map((u) => ({ url: u })) }
                    addToHistory(currentUrls.slice(), prompt.trim(), model, size, responseCopy, refImageUrls, ratio)
                    if (currentUrls.length < imageCount) {
                      const detail = errorMessages.length > 0 ? '：' + [...new Set(errorMessages)].join('；') : ''
                      onError(`部分图片生成失败（成功 ${currentUrls.length}/${imageCount}）` + detail)
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
      for (let i = 1; i < imageCount; i++) {
        setTimeout(() => sendRequest(i), i * 5000)
      }
    }, [isLoading, apiKey, prompt, imageCount, modelIndex, sizeIndex, availableSizes, refImageUrls, onError, addToHistory])

    const stopImageGenerate = useCallback(() => {
      requestsRef.current.forEach((req) => req.abort())
      requestsRef.current = []
      setIsLoading(false)
      onError('已终止生成')
    }, [onError])

    const handleCopyPrompt = useCallback(async () => {
      const ok = await copyToClipboard(prompt)
      Notification[ok ? 'success' : 'error'](ok ? '已复制提示词' : '复制失败')
    }, [prompt])

    const downloadSingleImage = useCallback((url: string) => {
      downloadFile(url, `agnes-ai-${Date.now()}.png`)
    }, [])

    const handleDownload = useCallback(() => {
      if (imageUrls.length > 0) downloadSingleImage(imageUrls[0])
    }, [imageUrls, downloadSingleImage])

    const handleDownloadAll = useCallback(() => {
      imageUrls.forEach((url, idx) => {
        setTimeout(() => downloadSingleImage(url), idx * 500)
      })
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
        setTimeout(() => downloadSingleImage(imageUrls[idx]), i * 500)
      })
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
        // URL 上传失败时，改用 Data URI Base64
        const reader = new FileReader()
        reader.onload = (ev) => {
          const dataUri = ev.target?.result as string
          if (dataUri) {
            setRefImageUrls((prev) => [...prev, dataUri])
          }
        }
        reader.readAsDataURL(file)
        Notification.warning('URL 上传失败，已改用 Base64 本地图片')
      }
      e.target.value = ''
    }, [])

    const removeRefImage = useCallback((index: number) => {
      setRefImageUrls((prev) => prev.filter((_, i) => i !== index))
    }, [])

    const deleteHistory = useCallback(
      (id: string) => {
        setHistory((prev) => {
          const updated = prev.filter((item) => item.id !== id)
          saveHistory(updated)
          return updated
        })
      },
      [saveHistory]
    )

    const clearHistory = useCallback(() => {
      setHistory([])
      setHistoryPage(1)
      setHistoryJumpPage('')
      saveHistory([])
      Notification.success('已清空历史记录')
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

    const viewHistory = useCallback((item: ImageHistoryItem) => {
      setImageUrls(item.urls || [item.url])
      setPrompt(item.prompt)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, [])

    const showDetail = useCallback((item: ImageHistoryItem) => {
      setDetailItem(item)
      setIsDetailSelectMode(false)
      setDetailSelectedIndexes([])
    }, [])

    const usePrompt = useCallback(() => {
      if (!detailItem) return
      setPrompt(detailItem.prompt)
      if (detailItem.model) {
        const idx = MODELS.findIndex((m) => m.value === detailItem.model)
        if (idx >= 0) setModelIndex(idx)
      }
      if (detailItem.size) {
        // 同时匹配 size 和 ratio（档位式尺寸可能有多个相同 value）
        const idx = availableSizes.findIndex(
          (s) => s.value === detailItem.size &&
                 (s.ratio || '') === (detailItem.ratio || '')
        )
        if (idx >= 0) setSizeIndex(idx)
      }
      setRefImageUrls(detailItem.refImageUrls || [])
      setDetailItem(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, [detailItem, availableSizes])

    const downloadDetailImage = useCallback(() => {
      if (!detailItem) return
      const urls = detailItem.urls || [detailItem.url]
      urls.forEach((url, idx) => {
        setTimeout(() => downloadSingleImage(url), idx * 500)
      })
    }, [detailItem, downloadSingleImage])

    const copyDetailPrompt = useCallback(async () => {
      if (!detailItem?.prompt) return
      const ok = await copyToClipboard(detailItem.prompt)
      Notification[ok ? 'success' : 'error'](ok ? '已复制提示词' : '复制失败')
    }, [detailItem])

    const toggleDetailSelectMode = useCallback(() => {
      setIsDetailSelectMode((prev) => {
        if (prev) setDetailSelectedIndexes([])
        return !prev
      })
    }, [])

    const onDetailGridClick = useCallback(
      (idx: number) => {
        if (isDetailSelectMode) {
          setDetailSelectedIndexes((prev) =>
            prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
          )
        } else if (detailItem) {
          const urls = detailItem.urls || [detailItem.url]
          setPreviewImages(urls.length > 1 ? urls : undefined)
          setPreviewIndex(idx)
          setPreviewSrc(urls[idx])
        }
      },
      [isDetailSelectMode, detailItem]
    )

    const detailSelectAll = useCallback(() => {
      if (!detailItem?.urls) return
      setDetailSelectedIndexes((prev) =>
        prev.length === detailItem.urls.length ? [] : detailItem.urls!.map((_, i) => i)
      )
    }, [detailItem])

    const downloadDetailSelected = useCallback(() => {
      if (!detailItem?.urls || detailSelectedIndexes.length === 0) {
        Notification.warning('请先选择图片')
        return
      }
      detailSelectedIndexes.forEach((idx, i) => {
        setTimeout(() => downloadSingleImage(detailItem.urls![idx]), i * 500)
      })
      setIsDetailSelectMode(false)
      setDetailSelectedIndexes([])
    }, [detailItem, detailSelectedIndexes, downloadSingleImage])

    const copyDetailSelectedUrls = useCallback(async () => {
      if (!detailItem?.urls) return
      const urls = detailSelectedIndexes
        .map((i) => detailItem.urls![i])
        .filter((u) => u && !u.startsWith('data:'))
      if (urls.length === 0) {
        Notification.warning('无有效地址')
        return
      }
      const ok = await copyToClipboard(urls.join(';'))
      Notification[ok ? 'success' : 'error'](ok ? `已复制${urls.length}个地址` : '复制失败')
    }, [detailItem, detailSelectedIndexes])

    return (
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />

        {/* 模型选择 */}
        <div className="agnes-form-group">
          <div className="agnes-label-row">
            <span className="agnes-label-icon">⚙️</span>
            <span className="agnes-label-text">模型</span>
            <span className="agnes-label-required">*</span>
          </div>
          <Select
            value={String(modelIndex)}
            onChange={(key) => {
              setModelIndex(Number(key))
              setSizeIndex(0)
            }}
            options={MODELS.map((m, i) => ({ key: String(i), label: m.label }))}
            placeholder="选择模型"
          />
        </div>

        {/* 尺寸与数量 */}
        {isV21 ? (
          <div className="agnes-form-group">
            <div className="agnes-label-row">
              <span className="agnes-label-icon">📐</span>
              <span className="agnes-label-text">尺寸</span>
              <span className="agnes-label-required">*</span>
            </div>
            {/* 2.1 Flash：档位 + 宽高比滑动选择 */}
            <div className="agnes-size-picker-21">
              <div className="agnes-tier-row">
                {TIERS_21.map((tier) => (
                  <button
                    key={tier}
                    className={`agnes-tier-btn ${currentTier === tier ? 'agnes-tier-btn-active' : ''}`}
                    onClick={() => {
                      const idx = availableSizes.findIndex((s) => s.value === tier)
                      if (idx >= 0) setSizeIndex(idx)
                      // 切换到 3K/4K 档位时强制数量为 1 张
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
        ) : (
        <div className="agnes-form-row">
          <div className="agnes-form-group">
            <div className="agnes-label-row">
              <span className="agnes-label-icon">📐</span>
              <span className="agnes-label-text">尺寸</span>
              <span className="agnes-label-required">*</span>
            </div>
            <Select
              value={String(sizeIndex)}
              onChange={(key) => setSizeIndex(Number(key))}
              options={availableSizes.map((s, i) => ({ key: String(i), label: s.label }))}
              placeholder="选择尺寸"
            />
          </div>
          <div className="agnes-form-group">
            <div className="agnes-label-row">
              <span className="agnes-label-icon">🔢</span>
              <span className="agnes-label-text">数量</span>
            </div>
            <Select
              value={String(countIndex)}
              onChange={(key) => setCountIndex(Number(key))}
              options={IMAGE_COUNTS.map((c, i) => ({ key: String(i), label: c.label }))}
              placeholder="选择数量"
            />
          </div>
        </div>
        )}
        {/* 2.1 模型时数量单独一行 */}
        {isV21 && (
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

        {/* 提示词 */}
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

        {/* 参考图 */}
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
            <div className="agnes-ref-preview-list">
              {refImageUrls.map((url, index) => (
                <div className="agnes-ref-preview-wrap" key={index}>
                  <img
                    className="agnes-ref-preview-image"
                    src={url}
                    alt={`ref-${index}`}
                    onClick={() => setPreviewSrc(url)}
                  />
                  <div
                    className="agnes-ref-preview-delete"
                    onClick={() => removeRefImage(index)}
                  >
                    ✕
                  </div>
                </div>
              ))}
            </div>
          )}
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
            {isLoading ? '生成中...' : `✦ 生成图片${imageCount > 1 ? ' ×' + imageCount : ''}`}
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
            {totalCount > 1 ? (
              <div className="agnes-loading-text">AI 正在创作中（{completedCount}/{totalCount}）</div>
            ) : (
              <div className="agnes-loading-text agnes-loading-dots">AI 正在创作中，请耐心等待</div>
            )}
            <Button type="dashed" danger size="small" onClick={stopImageGenerate}>
              终止生成
            </Button>
          </div>
        )}

        {/* 图片展示区 */}
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

            {/* 选择模式操作栏 */}
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

            {/* 普通操作栏 */}
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

        {/* 历史记录 */}
        {history.length > 0 && (
          <div className="agnes-history-box">
            <div className="agnes-history-header">
              <span className="agnes-history-title">📋 图片历史</span>
              <Button size="small" type="dashed" danger onClick={clearHistory}>
                清空
              </Button>
            </div>
            <div className="agnes-history-list">
              {pagedHistory.map((item) => (
                <div className="agnes-history-item" key={item.id}>
                  <img
                    className="agnes-history-thumb"
                    src={item.url}
                    alt="thumb"
                    onClick={() => viewHistory(item)}
                  />
                  <div className="agnes-history-info" onClick={() => showDetail(item)}>
                    <div className="agnes-history-prompt">{truncateText(item.prompt, 30)}</div>
                    <div className="agnes-history-tags">
                      <span className="agnes-history-tag">{item.model}</span>
                      <span className="agnes-history-tag">{item.size}{item.ratio ? ` ${item.ratio}` : ''}</span>
                      {item.urls && item.urls.length > 1 && (
                        <span className="agnes-history-tag">{item.urls.length}张</span>
                      )}
                    </div>
                    <div className="agnes-history-meta">{formatTime(item.time)}</div>
                  </div>
                  <div className="agnes-history-delete-btn" onClick={() => deleteHistory(item.id)}>
                    ✕
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
              <span>图片记录详情</span>
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
              {detailItem.urls && detailItem.urls.length > 1 ? (
                <div className="agnes-detail-grid">
                  {detailItem.urls.map((u, idx) => (
                    <div className="agnes-detail-grid-item" key={idx} onClick={() => onDetailGridClick(idx)}>
                      <img className="agnes-detail-grid-image" src={u} alt={`detail-${idx}`} />
                      {isDetailSelectMode && (
                        <div className={`agnes-detail-grid-check ${detailSelectedIndexes.includes(idx) ? 'agnes-detail-grid-checked' : ''}`}>
                          {detailSelectedIndexes.includes(idx) ? '✓' : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <img className="agnes-detail-image" src={detailItem.url} alt="detail" />
              )}

              <div className="agnes-detail-field agnes-detail-prompt-field">
                <div className="agnes-detail-prompt-header">
                  <span className="agnes-detail-label">提示词：</span>
                  <Button size="small" onClick={copyDetailPrompt}>复制</Button>
                </div>
                <div className="agnes-detail-value agnes-detail-value-long">{detailItem.prompt}</div>
              </div>

              <div className="agnes-detail-field">
                <span className="agnes-detail-label">模型：</span>
                <span className="agnes-detail-value">{detailItem.model}</span>
              </div>
              <div className="agnes-detail-field">
                <span className="agnes-detail-label">尺寸：</span>
                <span className="agnes-detail-value">{detailItem.size}{detailItem.ratio ? ` (${detailItem.ratio})` : ''}</span>
              </div>
              {detailItem.urls && detailItem.urls.length > 1 && (
                <div className="agnes-detail-field">
                  <span className="agnes-detail-label">数量：</span>
                  <span className="agnes-detail-value">{detailItem.urls.length} 张</span>
                </div>
              )}
              {detailItem.refImageUrls && detailItem.refImageUrls.length > 0 && (
                <div className="agnes-detail-field">
                  <span className="agnes-detail-label">参考图：</span>
                  <div className="agnes-detail-ref-image-list">
                    {detailItem.refImageUrls.map((url, idx) => (
                      <img
                        key={idx}
                        className="agnes-detail-ref-image"
                        src={url}
                        alt={`ref-${idx}`}
                        onClick={() => setPreviewSrc(url)}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="agnes-detail-field">
                <span className="agnes-detail-label">生成时间：</span>
                <span className="agnes-detail-value">{formatTime(detailItem.time)}</span>
              </div>

              {!!detailItem.responseData && (
                <div className="agnes-detail-section">
                  <div className="agnes-detail-section-title">接口返回数据</div>
                  <div className="agnes-detail-json-area">
                    {formatResponseData(detailItem.responseData)}
                  </div>
                </div>
              )}

            {/* 操作按钮 */}
            <div className="agnes-detail-actions">
              <Button type="primary" onClick={usePrompt}>使用此提示词</Button>
                {!isDetailSelectMode && (
                  <Button onClick={downloadDetailImage}>
                    {detailItem.urls && detailItem.urls.length > 1 ? '全部下载' : '下载图片'}
                  </Button>
                )}
                {isDetailSelectMode && (
                  <>
                    <Button onClick={detailSelectAll}>
                      {detailItem.urls && detailSelectedIndexes.length === detailItem.urls.length ? '取消全选' : '全选'}
                    </Button>
                    <Button type="primary" onClick={downloadDetailSelected}>
                      下载选中（{detailSelectedIndexes.length}）
                    </Button>
                    <Button onClick={copyDetailSelectedUrls}>复制选中地址</Button>
                    <Button onClick={() => { setIsDetailSelectMode(false); setDetailSelectedIndexes([]) }}>
                      取消选择
                    </Button>
                  </>
                )}
                {!isDetailSelectMode && detailItem.urls && detailItem.urls.length > 1 && (
                  <Button onClick={toggleDetailSelectMode}>选择下载/复制地址</Button>
                )}
              </div>
            </div>
          )}
        </Modal>

      <ImagePreview src={previewSrc} images={previewImages} initialIndex={previewIndex} onClose={() => setPreviewSrc('')} />
      </div>
    )
  }
)

ImageGenerate.displayName = 'ImageGenerate'
export default ImageGenerate
