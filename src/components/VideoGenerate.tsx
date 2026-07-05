import { useState, useEffect, useCallback, useRef } from 'react'
import { Button, Select, Modal, Notification } from 'animal-island-ui'
import { VIDEO_SIZES, VIDEO_DURATIONS, STORAGE_KEYS } from '../config/api'
import { createVideoTask, queryVideoTask, uploadToImgbb } from '../services/api'
import type { RequestResult, ApiResponse } from '../types'
import type { VideoHistoryItem } from '../types'
import { getStorage, setStorage, copyToClipboard, downloadFile, formatTime, truncateText, formatResponseData } from '../utils/helpers'
import ImagePreview from './ImagePreview'

interface VideoGenerateProps {
  apiKey: string
  errorMsg: string
  onError: (msg: string) => void
  onLoadingChange: (loading: boolean) => void
}

const PAGE_SIZE = 10

export default function VideoGenerate({ apiKey, errorMsg, onError, onLoadingChange }: VideoGenerateProps) {
  const [sizeIndex, setSizeIndex] = useState(0)
  const [durationIndex, setDurationIndex] = useState(0)
  const [prompt, setPrompt] = useState('')
  const [refImageInput, setRefImageInput] = useState('')
  const [refImageUrls, setRefImageUrls] = useState<string[]>([])
  const [isKeyframeMode, setIsKeyframeMode] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [videoTaskId, setVideoTaskId] = useState('')
  const [videoStatus, setVideoStatus] = useState('')
  const [videoProgress, setVideoProgress] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [history, setHistory] = useState<VideoHistoryItem[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyJumpPage, setHistoryJumpPage] = useState('')
  const [detailItem, setDetailItem] = useState<VideoHistoryItem | null>(null)
  const [previewSrc, setPreviewSrc] = useState('')

  const requestRef = useRef<RequestResult<ApiResponse> | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const pagedHistory = history.slice(
    (historyPage - 1) * PAGE_SIZE,
    historyPage * PAGE_SIZE
  )
  const historyTotalPages = Math.ceil(history.length / PAGE_SIZE)

  useEffect(() => {
    const savedHistory = getStorage<VideoHistoryItem[]>(STORAGE_KEYS.VIDEO_HISTORY)
    if (savedHistory) {
      setHistory(savedHistory)
    }
  }, [])

  useEffect(() => {
    onLoadingChange(isLoading)
  }, [isLoading, onLoadingChange])

  // 清理轮询定时器
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [])

  const saveHistory = useCallback((items: VideoHistoryItem[]) => {
    setStorage(STORAGE_KEYS.VIDEO_HISTORY, items)
  }, [])

  const addToHistory = useCallback(
    (
      url: string,
      promptText: string,
      size: string,
      duration: string,
      responseData: unknown,
      refImgs: string[],
      sIndex: number,
      dIndex: number,
      keyframeMode: boolean
    ) => {
      const record: VideoHistoryItem = {
        id: Date.now().toString(),
        url,
        prompt: promptText,
        size,
        duration,
        refImageUrls: refImgs,
        isKeyframeMode: keyframeMode,
        sizeIndex: sIndex,
        durationIndex: dIndex,
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

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const startPolling = useCallback((videoId: string) => {
    stopPolling()
    pollTimerRef.current = setInterval(() => {
      if (!videoId) return
      requestRef.current = queryVideoTask(apiKey.trim(), videoId)
      requestRef.current.promise
        .then((res) => {
          if (res.statusCode === 200) {
            const data = res.data as Record<string, unknown>
            // 优先使用 status，回退到 internal_status
            const status = (data.status as string) || (data.internal_status as string) || ''
            // 优先使用 progress，回退到 internal_progress
            const progress =
              (data.progress as number) ?? (data.internal_progress as number) ?? 0
            setVideoProgress(progress)

            if (status === 'completed') {
              stopPolling()
              setIsLoading(false)
              // 新接口返回的 url 字段直接是视频地址
              const rawUrl = String(data.url || '').trim()
              const cleanUrl = rawUrl.replace(/^[\s`]+|[\s`]+$/g, '')
              if (cleanUrl) {
                setVideoUrl(cleanUrl)
                setVideoStatus('生成完成')
                setVideoProgress(100)
                Notification.success('视频生成完成')
                const sizeVal = VIDEO_SIZES[sizeIndex].value
                const durationLabel = VIDEO_DURATIONS[durationIndex].label
                addToHistory(
                  cleanUrl,
                  prompt.trim(),
                  sizeVal,
                  durationLabel,
                  data,
                  refImageUrls,
                  sizeIndex,
                  durationIndex,
                  isKeyframeMode
                )
              } else {
                onError('视频生成完成但未获取到视频地址')
              }
            } else if (status === 'failed') {
              stopPolling()
              setIsLoading(false)
              const errMsg =
                (data.error as string) ||
                (data.error as { message?: string })?.message ||
                '未知错误'
              onError('视频生成失败: ' + errMsg)
            } else if (status === 'in_progress' || status === 'processing') {
              setVideoStatus(progress > 0 ? `生成中 ${progress}%` : '生成中...')
            } else if (status === 'queued' || status === 'pending') {
              setVideoStatus('排队中...')
            } else if (status) {
              setVideoStatus(status)
            }
          }
        })
        .catch(() => {
          // 轮询失败不中断，继续尝试
        })
    }, 10000)
  }, [apiKey, stopPolling, sizeIndex, durationIndex, prompt, refImageUrls, isKeyframeMode, addToHistory, onError])

  const handleGenerate = useCallback(() => {
    if (isLoading) return
    if (!apiKey.trim()) {
      onError('请输入 API Key')
      return
    }
    if (!prompt.trim()) {
      onError('请输入视频描述')
      return
    }

    // 关键帧模式需要至少 2 张参考图
    if (isKeyframeMode && refImageUrls.length < 2) {
      onError('关键帧模式需要至少添加 2 张参考图作为关键帧')
      return
    }

    setStorage(STORAGE_KEYS.API_KEY, apiKey.trim())
    onError('')
    setVideoUrl('')
    setVideoProgress(0)
    setVideoStatus('排队中...')
    setIsLoading(true)

    const sizeVal = VIDEO_SIZES[sizeIndex].value
    const width = parseInt(sizeVal.split('x')[0])
    const height = parseInt(sizeVal.split('x')[1])
    const duration = VIDEO_DURATIONS[durationIndex]

    requestRef.current = createVideoTask(
      apiKey.trim(),
      prompt.trim(),
      width,
      height,
      duration.value,
      duration.frameRate,
      refImageUrls,
      isKeyframeMode
    )

    requestRef.current.promise
      .then((res) => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          const data = res.data as Record<string, unknown>
          const videoId = (data.video_id || data.id || data.task_id || '') as string
          if (videoId) {
            setVideoTaskId(videoId)
            setVideoStatus('任务已提交，等待处理...')
            startPolling(videoId)
          } else {
            setIsLoading(false)
            onError('未获取到任务 ID')
          }
        } else {
          setIsLoading(false)
          const data = res.data as Record<string, unknown>
          const errMsg =
            (data?.error as { message?: string })?.message ||
            JSON.stringify(data) ||
            `HTTP ${res.statusCode}`
          onError('创建视频任务失败: ' + errMsg)
        }
      })
      .catch((err) => {
        setIsLoading(false)
        onError('网络请求失败: ' + (err?.errMsg || err?.message || ''))
      })
  }, [isLoading, apiKey, prompt, sizeIndex, durationIndex, refImageUrls, isKeyframeMode, onError, startPolling])

  const stopGenerate = useCallback(() => {
    if (requestRef.current) {
      requestRef.current.abort()
      requestRef.current = null
    }
    stopPolling()
    setIsLoading(false)
    setVideoStatus('')
    onError('已终止生成')
  }, [stopPolling, onError])

  const handleCopyPrompt = useCallback(async () => {
    const ok = await copyToClipboard(prompt)
    Notification[ok ? 'success' : 'error'](ok ? '已复制提示词' : '复制失败')
  }, [prompt])

  const handleDownload = useCallback(() => {
    if (!videoUrl) return
    downloadFile(videoUrl, `agnes-ai-video-${Date.now()}.mp4`)
  }, [videoUrl])

  const copyUrl = useCallback(async () => {
    if (!videoUrl) return
    const ok = await copyToClipboard(videoUrl)
    Notification[ok ? 'success' : 'error'](ok ? '已复制视频地址' : '复制失败')
  }, [videoUrl])

  const resetVideo = useCallback(() => {
    setVideoUrl('')
    setVideoTaskId('')
    setVideoStatus('')
    setVideoProgress(0)
    setRefImageInput('')
    setRefImageUrls([])
    setIsKeyframeMode(false)
    stopPolling()
  }, [stopPolling])

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
      Notification.error('上传失败')
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

  const viewHistory = useCallback((item: VideoHistoryItem) => {
    setVideoUrl(item.url)
    setPrompt(item.prompt)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const usePrompt = useCallback(() => {
    if (!detailItem) return
    setPrompt(detailItem.prompt)
    if (detailItem.sizeIndex !== undefined) {
      setSizeIndex(detailItem.sizeIndex)
    }
    if (detailItem.durationIndex !== undefined) {
      setDurationIndex(detailItem.durationIndex)
    }
    setRefImageUrls(detailItem.refImageUrls || [])
    setIsKeyframeMode(detailItem.isKeyframeMode || false)
    setDetailItem(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [detailItem])

  const copyDetailPrompt = useCallback(async () => {
    if (!detailItem?.prompt) return
    const ok = await copyToClipboard(detailItem.prompt)
    Notification[ok ? 'success' : 'error'](ok ? '已复制提示词' : '复制失败')
  }, [detailItem])

  const copyDetailUrl = useCallback(async () => {
    if (!detailItem?.url) return
    const ok = await copyToClipboard(detailItem.url)
    Notification[ok ? 'success' : 'error'](ok ? '已复制视频地址' : '复制失败')
  }, [detailItem])

  const downloadDetailVideo = useCallback(() => {
    if (!detailItem?.url) return
    downloadFile(detailItem.url, `agnes-ai-video-${Date.now()}.mp4`)
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

      {/* 尺寸与时长 */}
      <div className="agnes-form-row">
        <div className="agnes-form-group">
          <div className="agnes-label-row">
            <span className="agnes-label-icon">📐</span>
            <span className="agnes-label-text">尺寸</span>
          </div>
          <Select
            value={String(sizeIndex)}
            onChange={(key) => setSizeIndex(Number(key))}
            options={VIDEO_SIZES.map((s, i) => ({ key: String(i), label: s.label }))}
            placeholder="选择尺寸"
          />
        </div>
        <div className="agnes-form-group">
          <div className="agnes-label-row">
            <span className="agnes-label-icon">⏱️</span>
            <span className="agnes-label-text">时长</span>
          </div>
          <Select
            value={String(durationIndex)}
            onChange={(key) => setDurationIndex(Number(key))}
            options={VIDEO_DURATIONS.map((d, i) => ({ key: String(i), label: d.label }))}
            placeholder="选择时长"
          />
        </div>
      </div>

      {/* 视频提示词 */}
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
          placeholder="描述你想要生成的视频，例如：一只柴犬在樱花树下奔跑，阳光温暖，花瓣飘落"
        />
      </div>

      {/* 参考图（图生视频） */}
      <div className="agnes-form-group">
        <div className="agnes-label-row">
          <span className="agnes-label-icon">🖼️</span>
          <span className="agnes-label-text">参考图（图生视频）</span>
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
        <div className="agnes-ref-tips">添加参考图后，AI 将基于参考图生成视频，支持多张参考图</div>
        {refImageUrls.length > 0 && (
          <>
            <div className="agnes-ref-mode-row">
              <Button
                size="small"
                type={isKeyframeMode ? 'primary' : 'dashed'}
                onClick={() => setIsKeyframeMode(!isKeyframeMode)}
              >
                {isKeyframeMode ? '🔑 关键帧模式：开' : '🔑 关键帧模式：关'}
              </Button>
              {isKeyframeMode && (
                <span className="agnes-ref-mode-tip">
                  {refImageUrls.length < 2
                    ? `⚠️ 关键帧模式需要至少 2 张图片（当前 ${refImageUrls.length} 张）`
                    : `${refImageUrls.length} 张参考图将作为关键帧，AI 生成帧间过渡动画`}
                </span>
              )}
            </div>
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
          </>
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
          {isLoading ? '生成中...' : '✦ 生成视频'}
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
          <div className="agnes-loading-text agnes-loading-dots">视频生成中，预计需要 5-10 分钟</div>
          {videoProgress > 0 && (
            <div className="agnes-video-progress-bar">
              <div
                className="agnes-video-progress-fill"
                style={{ width: `${videoProgress}%` }}
              />
            </div>
          )}
          {videoStatus && <div className="agnes-video-status-text">{videoStatus}</div>}
          <Button type="dashed" danger size="small" onClick={stopGenerate}>
            终止生成
          </Button>
        </div>
      )}

      {/* 视频展示区 */}
      {videoUrl && (
        <div className="agnes-result-box">
          <div className="agnes-result-header">
            <span className="agnes-result-title">🎬 视频结果</span>
          </div>
          <video
            className="agnes-result-image"
            src={videoUrl}
            controls
            autoPlay
          />
          <div className="agnes-result-actions">
            <div className="agnes-result-action-btn" onClick={handleDownload}>
              <span className="agnes-result-action-icon">⬇</span>
              <span className="agnes-result-action-label">下载视频</span>
            </div>
            <div className="agnes-result-action-btn" onClick={copyUrl}>
              <span className="agnes-result-action-icon">📋</span>
              <span className="agnes-result-action-label">复制地址</span>
            </div>
            <div className="agnes-result-action-btn agnes-result-action-danger" onClick={resetVideo}>
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
            <span className="agnes-history-title">🎬 视频历史</span>
            <Button size="small" type="dashed" danger onClick={clearHistory}>
              清空
            </Button>
          </div>
          <div className="agnes-history-list">
            {pagedHistory.map((item) => (
              <div className="agnes-history-item" key={item.id}>
                <div
                  className="agnes-history-video-thumb-wrap"
                  onClick={() => viewHistory(item)}
                >
                  <video
                    className="agnes-history-video-thumb"
                    src={item.url}
                    muted
                  />
                  <div className="agnes-history-video-play-icon">
                    <span className="agnes-history-video-play">▶</span>
                  </div>
                </div>
                <div className="agnes-history-info" onClick={() => setDetailItem(item)}>
                  <div className="agnes-history-prompt">{truncateText(item.prompt, 20)}</div>
                  <div className="agnes-history-tags">
                    <span className="agnes-history-tag">{item.size}</span>
                    <span className="agnes-history-tag">{item.duration}</span>
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
            <span>视频记录详情</span>
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
            <video
              className="agnes-detail-video"
              src={detailItem.url}
              controls
            />

            <div className="agnes-detail-field agnes-detail-prompt-field">
              <div className="agnes-detail-prompt-header">
                <span className="agnes-detail-label">提示词：</span>
                <Button size="small" onClick={copyDetailPrompt}>复制</Button>
              </div>
              <div className="agnes-detail-value agnes-detail-value-long">{detailItem.prompt}</div>
            </div>

            <div className="agnes-detail-field">
              <span className="agnes-detail-label">尺寸：</span>
              <span className="agnes-detail-value">{detailItem.size}</span>
            </div>
            <div className="agnes-detail-field">
              <span className="agnes-detail-label">时长：</span>
              <span className="agnes-detail-value">{detailItem.duration}</span>
            </div>
            {detailItem.isKeyframeMode && (
              <div className="agnes-detail-field">
                <span className="agnes-detail-label">模式：</span>
                <span className="agnes-detail-value">关键帧模式</span>
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
              <Button onClick={downloadDetailVideo}>下载视频</Button>
              <Button onClick={copyDetailUrl}>复制地址</Button>
            </div>
          </div>
        )}
      </Modal>
      <ImagePreview src={previewSrc} onClose={() => setPreviewSrc('')} />
    </div>
  )
}
