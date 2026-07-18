import { useState, useEffect, useCallback, useRef } from 'react'
import { Button, Select, Modal, Notification } from 'animal-island-ui'
import {
  ZHIPU_VIDEO_SIZES,
  ZHIPU_VIDEO_DURATIONS,
  ZHIPU_VIDEO_FPS,
  ZHIPU_VIDEO_QUALITY,
  ZHIPU_VIDEO_POLL_INTERVAL,
  ZHIPU_STORAGE_KEYS,
  ZHIPU_VIDEO_MODEL
} from '../config/zhipu'
import { zhipuCreateVideoTask, zhipuQueryVideoTask, uploadToImgbbZhipu } from '../services/zhipu'
import type { RequestResult, ApiResponse } from '../types'
import type { ZhipuVideoHistoryItem } from '../types'
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

interface ZhipuVideoProps {
  apiKey: string
  modelLabel: string
  modelDescription: string
  errorMsg: string
  onError: (msg: string) => void
  onLoadingChange: (loading: boolean) => void
}

const PAGE_SIZE = 10

export default function ZhipuVideo({
  apiKey,
  modelLabel,
  modelDescription,
  errorMsg,
  onError,
  onLoadingChange
}: ZhipuVideoProps) {
  /* ===== 视频生成状态 ===== */
  const [sizeIndex, setSizeIndex] = useState(0)
  const [durationIndex, setDurationIndex] = useState(0)
  const [fpsIndex, setFpsIndex] = useState(0)
  const [qualityIndex, setQualityIndex] = useState(0)
  const [withAudio, setWithAudio] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [refImageInput, setRefImageInput] = useState('')
  const [refImageUrls, setRefImageUrls] = useState<string[]>([])
  const [isKeyframeMode, setIsKeyframeMode] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [videoCoverUrl, setVideoCoverUrl] = useState('')
  const [videoTaskId, setVideoTaskId] = useState('')
  const [videoStatus, setVideoStatus] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  /* ===== 历史记录 ===== */
  const [history, setHistory] = useState<ZhipuVideoHistoryItem[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyJumpPage, setHistoryJumpPage] = useState('')
  const [detailItem, setDetailItem] = useState<ZhipuVideoHistoryItem | null>(null)
  const [previewSrc, setPreviewSrc] = useState('')

  /* ===== Refs ===== */
  const requestRef = useRef<RequestResult<ApiResponse> | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const pagedHistory = history.slice(
    (historyPage - 1) * PAGE_SIZE,
    historyPage * PAGE_SIZE
  )
  const historyTotalPages = Math.ceil(history.length / PAGE_SIZE)

  /* ===== 初始化 ===== */
  useEffect(() => {
    const savedHistory = getStorage<ZhipuVideoHistoryItem[]>(ZHIPU_STORAGE_KEYS.VIDEO_HISTORY)
    if (savedHistory) setHistory(savedHistory)
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

  const saveHistory = useCallback((items: ZhipuVideoHistoryItem[]) => {
    setStorage(ZHIPU_STORAGE_KEYS.VIDEO_HISTORY, items)
  }, [])

  const addToHistory = useCallback(
    (
      taskId: string,
      url: string,
      coverUrl: string,
      promptText: string,
      sizeVal: string,
      durationVal: number,
      fpsVal: number,
      qualityVal: string,
      audioFlag: boolean,
      refImgs: string[],
      keyframeMode: boolean,
      sIndex: number,
      dIndex: number,
      fIndex: number,
      qIndex: number,
      responseData: unknown
    ) => {
      const record: ZhipuVideoHistoryItem = {
        id: Date.now().toString(),
        taskId,
        url,
        coverUrl,
        prompt: promptText,
        model: ZHIPU_VIDEO_MODEL,
        size: sizeVal,
        duration: durationVal,
        fps: fpsVal,
        quality: qualityVal,
        withAudio: audioFlag,
        refImageUrls: refImgs,
        isKeyframeMode: keyframeMode,
        sizeIndex: sIndex,
        durationIndex: dIndex,
        fpsIndex: fIndex,
        qualityIndex: qIndex,
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

  /* ===== 轮询查询任务状态 ===== */
  const startPolling = useCallback(
    (taskId: string) => {
      stopPolling()
      pollTimerRef.current = setInterval(() => {
        if (!taskId) return
        requestRef.current = zhipuQueryVideoTask(apiKey.trim(), taskId)
        requestRef.current.promise
          .then((res) => {
            if (res.statusCode === 200) {
              const data = res.data as Record<string, unknown>
              const status = (data.task_status as string) || ''
              const videoResult = data.video_result as
                | Array<{ url?: string; cover_image_url?: string }>
                | undefined

              if (status === 'SUCCESS') {
                stopPolling()
                setIsLoading(false)
                if (videoResult && videoResult.length > 0 && videoResult[0].url) {
                  const url = videoResult[0].url
                  const cover = videoResult[0].cover_image_url || ''
                  setVideoUrl(url)
                  setVideoCoverUrl(cover)
                  setVideoStatus('生成完成')
                  Notification.success('视频生成完成')
                  const sizeVal = ZHIPU_VIDEO_SIZES[sizeIndex].value
                  const durationVal = ZHIPU_VIDEO_DURATIONS[durationIndex].value
                  const fpsVal = ZHIPU_VIDEO_FPS[fpsIndex].value
                  const qualityVal = ZHIPU_VIDEO_QUALITY[qualityIndex].value
                  addToHistory(
                    taskId,
                    url,
                    cover,
                    prompt.trim(),
                    sizeVal,
                    durationVal,
                    fpsVal,
                    qualityVal,
                    withAudio,
                    refImageUrls,
                    isKeyframeMode,
                    sizeIndex,
                    durationIndex,
                    fpsIndex,
                    qualityIndex,
                    data
                  )
                } else {
                  onError('视频生成完成但未获取到视频地址')
                }
              } else if (status === 'FAIL') {
                stopPolling()
                setIsLoading(false)
                const errMsg =
                  (data.error as { message?: string })?.message ||
                  (data.error as string) ||
                  '未知错误'
                onError('视频生成失败: ' + errMsg)
                setVideoStatus('生成失败')
              } else if (status === 'PROCESSING') {
                setVideoStatus('生成中...')
              } else if (status) {
                setVideoStatus(status)
              }
            }
          })
          .catch(() => {
            // 轮询失败不中断，继续尝试
          })
      }, ZHIPU_VIDEO_POLL_INTERVAL)
    },
    [apiKey, stopPolling, sizeIndex, durationIndex, fpsIndex, qualityIndex, prompt, withAudio, refImageUrls, isKeyframeMode, addToHistory, onError]
  )

  /* ===== 生成视频 ===== */
  const handleGenerate = useCallback(() => {
    if (isLoading) return
    if (!apiKey.trim()) {
      onError('请输入智谱 AI API Key')
      return
    }
    if (!prompt.trim() && refImageUrls.length === 0) {
      onError('请输入视频描述或添加参考图')
      return
    }

    // 首尾帧模式需要正好 2 张参考图
    if (isKeyframeMode && refImageUrls.length !== 2) {
      onError('首尾帧模式需要添加 2 张参考图（首帧 + 尾帧）')
      return
    }

    onError('')
    setVideoUrl('')
    setVideoCoverUrl('')
    setVideoStatus('任务提交中...')
    setIsLoading(true)

    const sizeVal = ZHIPU_VIDEO_SIZES[sizeIndex].value
    const durationVal = ZHIPU_VIDEO_DURATIONS[durationIndex].value
    const fpsVal = ZHIPU_VIDEO_FPS[fpsIndex].value
    const qualityVal = ZHIPU_VIDEO_QUALITY[qualityIndex].value

    // 构造图片参数：首尾帧模式传数组，图生视频传字符串
    let imageUrl: string | string[] | undefined
    if (refImageUrls.length > 0) {
      imageUrl = isKeyframeMode ? refImageUrls.slice(0, 2) : refImageUrls[0]
    }

    requestRef.current = zhipuCreateVideoTask(apiKey.trim(), {
      prompt: prompt.trim() || '让画面动起来',
      imageUrl,
      size: sizeVal,
      duration: durationVal,
      fps: fpsVal,
      quality: qualityVal,
      withAudio
    })

    requestRef.current.promise
      .then((res) => {
        const data = res.data as Record<string, unknown>
        // 优先检查业务错误（即使 HTTP 200 也可能返回 error 字段）
        const apiError = data?.error as { code?: string; message?: string } | undefined
        if (apiError && apiError.message) {
          setIsLoading(false)
          const codeStr = apiError.code ? `（${apiError.code}）` : ''
          onError(`创建视频任务失败${codeStr}：${apiError.message}`)
          return
        }
        if (res.statusCode === 200 || res.statusCode === 201) {
          const taskId = (data.id || data.task_id || '') as string
          if (taskId) {
            setVideoTaskId(taskId)
            setVideoStatus('任务已提交，等待处理...')
            startPolling(taskId)
          } else {
            setIsLoading(false)
            onError('未获取到任务 ID')
          }
        } else {
          setIsLoading(false)
          const errMsg =
            apiError?.message ||
            JSON.stringify(data) ||
            `HTTP ${res.statusCode}`
          onError('创建视频任务失败: ' + errMsg)
        }
      })
      .catch((err) => {
        setIsLoading(false)
        onError('网络请求失败: ' + (err?.errMsg || err?.message || ''))
      })
  }, [isLoading, apiKey, prompt, sizeIndex, durationIndex, fpsIndex, qualityIndex, withAudio, refImageUrls, isKeyframeMode, onError, startPolling])

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
    downloadFile(videoUrl, `cogvideox-flash-${Date.now()}.mp4`)
  }, [videoUrl])

  const copyUrl = useCallback(async () => {
    if (!videoUrl) return
    const ok = await copyToClipboard(videoUrl)
    Notification[ok ? 'success' : 'error'](ok ? '已复制视频地址' : '复制失败')
  }, [videoUrl])

  const resetVideo = useCallback(() => {
    setVideoUrl('')
    setVideoCoverUrl('')
    setVideoTaskId('')
    setVideoStatus('')
    stopPolling()
  }, [stopPolling])

  const addRefImageUrl = useCallback(() => {
    const safe = refImageInput.replace(/[^a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]/g, '')
    const match = safe.match(/https?:\/\/[a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]+/)
    const url = match ? match[0] : safe
    if (!url) return
    // 首尾帧模式最多 2 张，图生视频最多 1 张
    const maxCount = isKeyframeMode ? 2 : 1
    setRefImageUrls((prev) => (prev.length >= maxCount ? [...prev.slice(0, maxCount - 1), url] : [...prev, url]))
    setRefImageInput('')
  }, [refImageInput, isKeyframeMode])

  const uploadRefImage = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const url = await uploadToImgbbZhipu(file)
      const maxCount = isKeyframeMode ? 2 : 1
      setRefImageUrls((prev) => (prev.length >= maxCount ? [...prev.slice(0, maxCount - 1), url] : [...prev, url]))
      Notification.success('上传成功')
    } catch {
      Notification.error('上传失败')
    }
    e.target.value = ''
  }, [isKeyframeMode])

  const removeRefImage = useCallback((index: number) => {
    setRefImageUrls((prev) => prev.filter((_, i) => i !== index))
  }, [])

  /* ===== 历史记录操作 ===== */
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

  const viewHistory = useCallback((item: ZhipuVideoHistoryItem) => {
    setVideoUrl(item.url)
    setVideoCoverUrl(item.coverUrl || '')
    setPrompt(item.prompt)
    if (item.sizeIndex !== undefined) setSizeIndex(item.sizeIndex)
    if (item.durationIndex !== undefined) setDurationIndex(item.durationIndex)
    if (item.fpsIndex !== undefined) setFpsIndex(item.fpsIndex)
    if (item.qualityIndex !== undefined) setQualityIndex(item.qualityIndex)
    setWithAudio(item.withAudio || false)
    setRefImageUrls(item.refImageUrls || [])
    setIsKeyframeMode(item.isKeyframeMode || false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const usePrompt = useCallback(() => {
    if (!detailItem) return
    setPrompt(detailItem.prompt)
    if (detailItem.sizeIndex !== undefined) setSizeIndex(detailItem.sizeIndex)
    if (detailItem.durationIndex !== undefined) setDurationIndex(detailItem.durationIndex)
    if (detailItem.fpsIndex !== undefined) setFpsIndex(detailItem.fpsIndex)
    if (detailItem.qualityIndex !== undefined) setQualityIndex(detailItem.qualityIndex)
    setWithAudio(detailItem.withAudio || false)
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
    downloadFile(detailItem.url, `cogvideox-flash-${Date.now()}.mp4`)
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

      {/* 模型描述 */}
      <div className="sensenova-model-desc">
        {modelDescription}
      </div>

      {/* 尺寸、时长、帧率、质量 */}
      <div className="agnes-form-row">
        <div className="agnes-form-group">
          <div className="agnes-label-row">
            <span className="agnes-label-icon">📐</span>
            <span className="agnes-label-text">尺寸</span>
          </div>
          <Select
            value={String(sizeIndex)}
            onChange={(key) => setSizeIndex(Number(key))}
            options={ZHIPU_VIDEO_SIZES.map((s, i) => ({ key: String(i), label: s.label }))}
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
            options={ZHIPU_VIDEO_DURATIONS.map((d, i) => ({ key: String(i), label: d.label }))}
            placeholder="选择时长"
          />
        </div>
      </div>

      <div className="agnes-form-row">
        <div className="agnes-form-group">
          <div className="agnes-label-row">
            <span className="agnes-label-icon">🎞️</span>
            <span className="agnes-label-text">帧率</span>
          </div>
          <Select
            value={String(fpsIndex)}
            onChange={(key) => setFpsIndex(Number(key))}
            options={ZHIPU_VIDEO_FPS.map((f, i) => ({ key: String(i), label: f.label }))}
            placeholder="选择帧率"
          />
        </div>
        <div className="agnes-form-group">
          <div className="agnes-label-row">
            <span className="agnes-label-icon">⚡</span>
            <span className="agnes-label-text">输出模式</span>
          </div>
          <Select
            value={String(qualityIndex)}
            onChange={(key) => setQualityIndex(Number(key))}
            options={ZHIPU_VIDEO_QUALITY.map((q, i) => ({ key: String(i), label: q.label }))}
            placeholder="选择模式"
          />
        </div>
      </div>

      {/* 音效开关 */}
      <div className="agnes-form-group">
        <div className="agnes-label-row">
          <span className="agnes-label-icon">🔊</span>
          <span className="agnes-label-text">AI 音效</span>
          <span className="agnes-label-optional">可选</span>
        </div>
        <div className="sensenova-reasoning-row">
          <button
            className={`sensenova-reasoning-btn ${!withAudio ? 'sensenova-reasoning-active' : ''}`}
            onClick={() => setWithAudio(false)}
          >
            不生成音效
          </button>
          <button
            className={`sensenova-reasoning-btn ${withAudio ? 'sensenova-reasoning-active' : ''}`}
            onClick={() => setWithAudio(true)}
          >
            生成音效
          </button>
        </div>
      </div>

      {/* 视频提示词 */}
      <div className="agnes-form-group">
        <div className="agnes-label-row">
          <span className="agnes-label-icon">✨</span>
          <span className="agnes-label-text">视频描述</span>
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
          style={{ minHeight: '120px' }}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="描述你想要生成的视频，例如：一只柴犬在樱花树下奔跑，阳光温暖，花瓣飘落，电影级画质"
        />
        <div className="agnes-ref-tips">
          描述越详细，生成效果越好。不填描述时需添加参考图（图生视频模式）
        </div>
      </div>

      {/* 参考图（图生视频 / 首尾帧） */}
      <div className="agnes-form-group">
        <div className="agnes-label-row">
          <span className="agnes-label-icon">🖼️</span>
          <span className="agnes-label-text">参考图</span>
          <span className="agnes-label-optional">可选</span>
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
        <div className="agnes-ref-tips">
          添加 1 张参考图 → 图生视频；添加 2 张参考图 → 首尾帧生视频
        </div>
        {refImageUrls.length > 0 && (
          <>
            <div className="agnes-ref-mode-row">
              <Button
                size="small"
                type={isKeyframeMode ? 'primary' : 'dashed'}
                onClick={() => setIsKeyframeMode(!isKeyframeMode)}
              >
                {isKeyframeMode ? '🔑 首尾帧模式：开' : '🔑 首尾帧模式：关'}
              </Button>
              {isKeyframeMode && (
                <span className="agnes-ref-mode-tip">
                  {refImageUrls.length < 2
                    ? `⚠️ 首尾帧模式需要 2 张图片（当前 ${refImageUrls.length} 张）`
                    : '第 1 张作为首帧，第 2 张作为尾帧，AI 生成帧间过渡动画'}
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
      {errorMsg && <div className="agnes-error-box">{errorMsg}</div>}

      {/* 加载状态 */}
      {isLoading && (
        <div className="agnes-loading-box">
          <div className="agnes-spinner" />
          <div className="agnes-loading-text agnes-loading-dots">cogvideox-flash 视频生成中，预计需要 2-5 分钟</div>
          {videoStatus && <div className="agnes-video-status-text">{videoStatus}</div>}
          {videoTaskId && (
            <div className="agnes-video-status-text" style={{ fontSize: '12px', opacity: 0.6 }}>
              任务 ID：{videoTaskId}
            </div>
          )}
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
            poster={videoCoverUrl || undefined}
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
                  {item.coverUrl ? (
                    <img
                      className="agnes-history-thumb"
                      src={item.coverUrl}
                      alt="cover"
                    />
                  ) : (
                    <video
                      className="agnes-history-video-thumb"
                      src={item.url}
                      muted
                    />
                  )}
                  <div className="agnes-history-video-play-icon">
                    <span className="agnes-history-video-play">▶</span>
                  </div>
                </div>
                <div className="agnes-history-info" onClick={() => setDetailItem(item)}>
                  <div className="agnes-history-prompt">{truncateText(item.prompt, 20)}</div>
                  <div className="agnes-history-tags">
                    <span className="agnes-history-tag">{item.size}</span>
                    <span className="agnes-history-tag">{item.duration}s</span>
                    <span className="agnes-history-tag">{item.fps}fps</span>
                    {item.isKeyframeMode && <span className="agnes-history-tag">首尾帧</span>}
                    {item.withAudio && <span className="agnes-history-tag">音效</span>}
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
              poster={detailItem.coverUrl || undefined}
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
              <span className="agnes-detail-label">模型：</span>
              <span className="agnes-detail-value">{detailItem.model}</span>
            </div>
            <div className="agnes-detail-field">
              <span className="agnes-detail-label">尺寸：</span>
              <span className="agnes-detail-value">{detailItem.size}</span>
            </div>
            <div className="agnes-detail-field">
              <span className="agnes-detail-label">时长：</span>
              <span className="agnes-detail-value">{detailItem.duration} 秒</span>
            </div>
            <div className="agnes-detail-field">
              <span className="agnes-detail-label">帧率：</span>
              <span className="agnes-detail-value">{detailItem.fps} FPS</span>
            </div>
            <div className="agnes-detail-field">
              <span className="agnes-detail-label">输出模式：</span>
              <span className="agnes-detail-value">{detailItem.quality === 'quality' ? '质量优先' : '速度优先'}</span>
            </div>
            <div className="agnes-detail-field">
              <span className="agnes-detail-label">音效：</span>
              <span className="agnes-detail-value">{detailItem.withAudio ? '已生成' : '无'}</span>
            </div>
            {detailItem.isKeyframeMode && (
              <div className="agnes-detail-field">
                <span className="agnes-detail-label">模式：</span>
                <span className="agnes-detail-value">首尾帧模式</span>
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
              <span className="agnes-detail-label">任务 ID：</span>
              <span className="agnes-detail-value" style={{ fontSize: '12px', wordBreak: 'break-all' }}>{detailItem.taskId}</span>
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

            {/* 操作按钮 */}
            <div className="agnes-detail-actions">
              <Button type="primary" onClick={usePrompt}>使用此配置</Button>
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
