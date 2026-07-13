import { useState, useEffect, useCallback, useRef } from 'react'
import { Button, Select, Modal, Notification } from 'animal-island-ui'
import {
  SENSENOVA_U1_SIZES,
  SENSENOVA_STORAGE_KEYS
} from '../config/sensenova'
import { IMAGE_COUNTS } from '../config/api'
import {
  sensenovaGenerateImage
} from '../services/sensenova'
import type { SenseNovaImageHistoryItem, RequestResult, ApiResponse } from '../types'
import {
  getStorage,
  setStorage,
  copyToClipboard,
  downloadFile,
  formatTime,
  truncateText,
  formatResponseData
} from '../utils/helpers'
import ImagePreview from './ImagePreview'

interface SenseNovaImageProps {
  apiKey: string
  errorMsg: string
  onError: (msg: string) => void
  onLoadingChange: (loading: boolean) => void
}

const PAGE_SIZE = 10

export default function SenseNovaImage({ apiKey, errorMsg, onError, onLoadingChange }: SenseNovaImageProps) {
  /* ===== 图片生成状态 ===== */
  const [imgPrompt, setImgPrompt] = useState('')
  const [imgSizeIndex, setImgSizeIndex] = useState(0)
  const [imgCountIndex, setImgCountIndex] = useState(0)
  const [imgResultUrls, setImgResultUrls] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedImageIndexes, setSelectedImageIndexes] = useState<number[]>([])
  const [completedCount, setCompletedCount] = useState(0)

  /* ===== Refs ===== */
  const requestsRef = useRef<RequestResult<ApiResponse>[]>([])
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  /* ===== 历史记录 ===== */
  const [imageHistory, setImageHistory] = useState<SenseNovaImageHistoryItem[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyJumpPage, setHistoryJumpPage] = useState('')
  const [detailItem, setDetailItem] = useState<SenseNovaImageHistoryItem | null>(null)
  const [previewSrc, setPreviewSrc] = useState('')
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewImages, setPreviewImages] = useState<string[] | undefined>(undefined)

  const imageCount = IMAGE_COUNTS[imgCountIndex].value

  /* ===== 初始化 ===== */
  useEffect(() => {
    const savedImg = getStorage<SenseNovaImageHistoryItem[]>(SENSENOVA_STORAGE_KEYS.IMAGE_HISTORY)
    if (savedImg) setImageHistory(savedImg)
  }, [])

  useEffect(() => {
    onLoadingChange(isLoading)
  }, [isLoading, onLoadingChange])

  /* ===== 工具方法 ===== */
  const saveImageHistory = useCallback((items: SenseNovaImageHistoryItem[]) => {
    setStorage(SENSENOVA_STORAGE_KEYS.IMAGE_HISTORY, items)
  }, [])

  /* ===== 图片生成功能 ===== */
  const handleGenerateImage = useCallback(() => {
    if (isLoading) return
    if (!apiKey.trim()) {
      onError('请输入 SenseNova API Key')
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

    const size = SENSENOVA_U1_SIZES[imgSizeIndex].value
    const errorMessages: string[] = []
    const collectedUrls: string[] = []

    const sendRequest = (i: number) => {
      if (i >= imageCount) return
      const request = sensenovaGenerateImage(apiKey.trim(), imgPrompt.trim(), size, 1)
      requestsRef.current.push(request)

      request.promise
        .then((res) => {
          const data = res.data as Record<string, unknown>
          if (res.statusCode === 200 && data && Array.isArray((data as any).data) && (data as any).data.length > 0) {
            const url = (data as any).data[0].url
            if (url) {
              collectedUrls.push(url)
              setImgResultUrls((prev) => [...prev, url])
            }
          } else {
            const errMsg = (data as any)?.error?.message || (data as any)?.message || `HTTP ${res.statusCode}`
            errorMessages.push(errMsg)
          }
        })
        .catch((err) => {
          const errMsg = err?.errMsg || err?.message || '请求超时或网络异常'
          errorMessages.push(errMsg)
        })
        .finally(() => {
          setCompletedCount((prev) => {
            const next = prev + 1
            if (next >= imageCount) {
              setIsLoading(false)
              requestsRef.current = []
              timersRef.current = []

              if (collectedUrls.length === 0) {
                const detail = errorMessages.length > 0 ? '：' + [...new Set(errorMessages)].join('；') : ''
                onError('所有图片生成均失败' + detail)
              } else {
                const responseCopy = { data: collectedUrls.map((u) => ({ url: u })) }
                const record: SenseNovaImageHistoryItem = {
                  id: Date.now().toString(),
                  url: collectedUrls[0],
                  urls: collectedUrls.slice(),
                  prompt: imgPrompt.trim(),
                  size,
                  model: 'sensenova-u1-fast',
                  time: Date.now(),
                  responseData: responseCopy
                }
                setImageHistory((prev) => {
                  const updated = [record, ...prev].slice(0, 50)
                  saveImageHistory(updated)
                  return updated
                })
                if (collectedUrls.length < imageCount) {
                  const detail = errorMessages.length > 0 ? '：' + [...new Set(errorMessages)].join('；') : ''
                  onError(`部分图片生成失败（成功 ${collectedUrls.length}/${imageCount}）` + detail)
                }
              }
            }
            return next
          })
        })
    }

    // 第一张立即请求，后续每隔 5 秒发起
    sendRequest(0)
    for (let i = 1; i < imageCount; i++) {
      const timer = setTimeout(() => sendRequest(i), i * 5000)
      timersRef.current.push(timer)
    }
  }, [isLoading, apiKey, imgPrompt, imgSizeIndex, imageCount, onError, saveImageHistory])

  const stopImageGenerate = useCallback(() => {
    requestsRef.current.forEach((req) => req.abort())
    requestsRef.current = []
    timersRef.current.forEach((t) => clearTimeout(t))
    timersRef.current = []
    setIsLoading(false)
    onError('已终止生成')
  }, [onError])

  /* ===== 图片下载 ===== */
  const downloadSingleImage = useCallback((url: string) => {
    downloadFile(url, `sensenova-u1-${Date.now()}.png`)
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

  /* ===== 选择模式 ===== */
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
  }, [])

  /* ===== 历史记录操作 ===== */
  const pagedImageHistory = imageHistory.slice(
    (historyPage - 1) * PAGE_SIZE,
    historyPage * PAGE_SIZE
  )
  const historyTotalPages = Math.ceil(imageHistory.length / PAGE_SIZE)

  const clearHistory = useCallback(() => {
    setImageHistory([])
    saveImageHistory([])
    setHistoryPage(1)
    setHistoryJumpPage('')
    Notification.success('已清空历史记录')
  }, [saveImageHistory])

  const deleteImageHistory = useCallback((id: string) => {
    setImageHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id)
      saveImageHistory(updated)
      return updated
    })
  }, [saveImageHistory])

  const viewImageHistory = useCallback((item: SenseNovaImageHistoryItem) => {
    const urls = item.urls || [item.url]
    setImgResultUrls(urls)
    setImgPrompt(item.prompt)
    const idx = SENSENOVA_U1_SIZES.findIndex((s) => s.value === item.size)
    if (idx >= 0) setImgSizeIndex(idx)
    const countIdx = IMAGE_COUNTS.findIndex((c) => c.value === urls.length)
    if (countIdx >= 0) setImgCountIndex(countIdx)
    setIsSelectMode(false)
    setSelectedImageIndexes([])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

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
      {/* 模型描述 */}
      <div className="sensenova-model-desc">
        生图加速版，支持 2K 分辨率、11 种比例
      </div>

      {/* 尺寸与数量 */}
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
            options={SENSENOVA_U1_SIZES.map((s, i) => ({ key: String(i), label: s.label }))}
            placeholder="选择尺寸"
          />
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

      {/* 提示词 */}
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
          placeholder="详细描述你想要生成的图片，包括布局、配色、风格、各区块内容等。例如：这是一张关于AI发展历程的图片，采用蓝色科技风格，从左到右分为三个区块..."
        />
        <div className="agnes-ref-tips">
          描述越详细，生成效果越好。支持描述布局结构、配色方案、图标元素、文字内容等
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
          onClick={handleGenerateImage}
        >
          {isLoading ? '生成中...' : `✦ 生成图片${imageCount > 1 ? ' ×' + imageCount : ''}`}
        </Button>
      </div>

      {/* 错误提示 */}
      {errorMsg && <div className="agnes-error-box">{errorMsg}</div>}

      {/* 加载状态 */}
      {isLoading && (
        <div className="agnes-loading-box">
          <div className="agnes-spinner" />
          {imageCount > 1 ? (
            <div className="agnes-loading-text">AI 正在生成图片（{completedCount}/{imageCount}）</div>
          ) : (
            <div className="agnes-loading-text agnes-loading-dots">AI 正在生成图片，请耐心等待</div>
          )}
          <Button type="dashed" danger size="small" onClick={stopImageGenerate}>
            终止生成
          </Button>
        </div>
      )}

      {/* 结果展示 */}
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

          {/* 选择模式操作栏 */}
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

          {/* 普通操作栏 */}
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
            ⚠️ 图片链接有效期为 1 小时，请及时下载保存
          </div>
        </div>
      )}

      {/* 图片历史 */}
      {imageHistory.length > 0 && (
        <div className="agnes-history-box">
          <div className="agnes-history-header">
            <span className="agnes-history-title">📋 生图历史</span>
            <Button size="small" type="dashed" danger onClick={clearHistory}>
              清空
            </Button>
          </div>
          <div className="agnes-history-list">
            {pagedImageHistory.map((imgItem) => {
              const urls = imgItem.urls || [imgItem.url]
              const isMulti = urls.length > 1
              return (
                <div className="agnes-history-item" key={imgItem.id}>
                  {isMulti ? (
                    <div
                      className="agnes-history-thumb-grid"
                      onClick={() => viewImageHistory(imgItem)}
                    >
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
                      src={imgItem.url}
                      alt="thumb"
                      onClick={() => viewImageHistory(imgItem)}
                    />
                  )}
                  <div
                    className="agnes-history-info"
                    onClick={() => setDetailItem(imgItem)}
                  >
                    <div className="agnes-history-prompt">
                      {truncateText(imgItem.prompt, 30)}
                    </div>
                    <div className="agnes-history-tags">
                      <span className="agnes-history-tag">{imgItem.size}</span>
                      {isMulti && (
                        <span className="agnes-history-tag">{urls.length}张</span>
                      )}
                    </div>
                    <div className="agnes-history-meta">{formatTime(imgItem.time)}</div>
                  </div>
                  <div
                    className="agnes-history-delete-btn"
                    onClick={() => deleteImageHistory(imgItem.id)}
                  >
                    ✕
                  </div>
                </div>
              )
            })}
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

      {/* 详情弹窗 */}
      <Modal
        open={!!detailItem}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span>生图记录详情</span>
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
            {/* 多图网格 */}
            {detailItem.urls && detailItem.urls.length > 1 ? (
              <div className="agnes-detail-grid">
                {detailItem.urls.map((url, idx) => (
                  <img
                    key={idx}
                    className="agnes-detail-grid-image"
                    src={url}
                    alt={`detail-${idx}`}
                    onClick={() => {
                      setPreviewImages(detailItem.urls!.length > 1 ? detailItem.urls : undefined)
                      setPreviewIndex(idx)
                      setPreviewSrc(url)
                    }}
                  />
                ))}
              </div>
            ) : (
              <img
                className="agnes-detail-image"
                src={detailItem.url}
                alt="detail"
                onClick={() => setPreviewSrc(detailItem.url)}
              />
            )}
            <div className="agnes-detail-field agnes-detail-prompt-field">
              <div className="agnes-detail-prompt-header">
                <span className="agnes-detail-label">描述：</span>
                <Button size="small" onClick={async () => {
                  const ok = await copyToClipboard(detailItem.prompt)
                  Notification[ok ? 'success' : 'error'](ok ? '已复制' : '复制失败')
                }}>复制</Button>
              </div>
              <div className="agnes-detail-value agnes-detail-value-long">{detailItem.prompt}</div>
            </div>
            <div className="agnes-detail-field">
              <span className="agnes-detail-label">尺寸：</span>
              <span className="agnes-detail-value">{detailItem.size}</span>
            </div>
            <div className="agnes-detail-field">
              <span className="agnes-detail-label">模型：</span>
              <span className="agnes-detail-value">{detailItem.model}</span>
            </div>
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
            <div className="agnes-detail-actions">
              <Button type="primary" onClick={() => {
                setImgPrompt(detailItem.prompt)
                const idx = SENSENOVA_U1_SIZES.findIndex((s) => s.value === detailItem.size)
                if (idx >= 0) setImgSizeIndex(idx)
                const urls = detailItem.urls || [detailItem.url]
                const countIdx = IMAGE_COUNTS.findIndex((c) => c.value === urls.length)
                if (countIdx >= 0) setImgCountIndex(countIdx)
                setDetailItem(null)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}>
                使用此描述
              </Button>
              <Button onClick={() => {
                const urls = detailItem.urls || [detailItem.url]
                urls.forEach((url, idx) => {
                  setTimeout(() => downloadFile(url, `sensenova-u1-${Date.now()}-${idx + 1}.png`), idx * 500)
                })
              }}>
                下载图片
              </Button>
              <Button onClick={async () => {
                const urls = detailItem.urls || [detailItem.url]
                const ok = await copyToClipboard(urls.join(';'))
                Notification[ok ? 'success' : 'error'](ok ? '已复制地址' : '复制失败')
              }}>复制地址</Button>
            </div>
          </div>
        )}
      </Modal>

      <ImagePreview
        src={previewSrc}
        images={previewImages}
        initialIndex={previewIndex}
        onClose={() => { setPreviewSrc(''); setPreviewImages(undefined) }}
      />
    </div>
  )
}
