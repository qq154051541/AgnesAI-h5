import { useState, useEffect, useCallback, useRef } from 'react'
import { Button, Select, Modal, Notification } from 'animal-island-ui'
import {
  VIDEO_FLASH_MODES,
  VIDEO_FLASH_ASPECT_RATIOS,
  VIDEO_FLASH_DURATIONS,
  VIDEO_FLASH_MAX_IMAGES,
  STORAGE_KEYS
} from '../config/api'
import { createVideoTaskFlash, queryVideoTaskFlash, uploadToImgbb } from '../services/api'
import type { RequestResult, ApiResponse, VideoFlashMode, VideoFlashHistoryItem } from '../types'
import {
  getStorage,
  setStorage,
  copyToClipboard,
  downloadFile,
  formatTime,
  truncateText,
  formatResponseData,
  fileToJpegDataUri,
  normalizeHistoryOnLoad
} from '../utils/helpers'
import ImagePreview from './ImagePreview'

interface VideoGenerateFlashProps {
  apiKey: string
  errorMsg: string
  onError: (msg: string) => void
  onLoadingChange: (loading: boolean) => void
}

const PAGE_SIZE = 10

export default function VideoGenerateFlash({ apiKey, errorMsg, onError, onLoadingChange }: VideoGenerateFlashProps) {
  const [modeIndex, setModeIndex] = useState(0)
  const [aspectRatioIndex, setAspectRatioIndex] = useState(1)
  const [durationIndex, setDurationIndex] = useState(1)
  const [prompt, setPrompt] = useState('')
  const [firstFrame, setFirstFrame] = useState('')
  const [lastFrame, setLastFrame] = useState('')
  const [refImageInput, setRefImageInput] = useState('')
  const [refImageUrls, setRefImageUrls] = useState<string[]>([])
  const [audioInput, setAudioInput] = useState('')
  const [audioUrls, setAudioUrls] = useState<string[]>([])
  const [videoUrl, setVideoUrl] = useState('')
  const [videoTaskId, setVideoTaskId] = useState('')
  const [videoStatus, setVideoStatus] = useState('')
  const [videoProgress, setVideoProgress] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [history, setHistory] = useState<VideoFlashHistoryItem[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyJumpPage, setHistoryJumpPage] = useState('')
  const [detailItem, setDetailItem] = useState<VideoFlashHistoryItem | null>(null)
  const [previewSrc, setPreviewSrc] = useState('')

  const requestRef = useRef<RequestResult<ApiResponse> | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const firstFrameInputRef = useRef<HTMLInputElement>(null)
  const lastFrameInputRef = useRef<HTMLInputElement>(null)
  const refImageInputRef = useRef<HTMLInputElement>(null)
  /** 当前进行中任务对应的历史记录 ID */
  const currentTaskRecordIdRef = useRef<string | null>(null)
  /** saveHistory 的 ref 化，供初始化 effect 使用 */
  const saveHistoryRef = useRef<((items: VideoFlashHistoryItem[]) => void) | null>(null)

  const mode = VIDEO_FLASH_MODES[modeIndex].value as VideoFlashMode
  const pagedHistory = history.slice(
    (historyPage - 1) * PAGE_SIZE,
    historyPage * PAGE_SIZE
  )
  const historyTotalPages = Math.ceil(history.length / PAGE_SIZE)

  useEffect(() => {
    const savedHistory = getStorage<VideoFlashHistoryItem[]>(STORAGE_KEYS.VIDEO_HISTORY_FLASH)
    if (savedHistory) {
      // 上次会话遗留的「生成中」记录统一标记为已中断
      const fixed = normalizeHistoryOnLoad(savedHistory)
      setHistory(fixed)
      saveHistoryRef.current?.(fixed)
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

  const saveHistory = useCallback((items: VideoFlashHistoryItem[]) => {
    setStorage(STORAGE_KEYS.VIDEO_HISTORY_FLASH, items)
  }, [])
  saveHistoryRef.current = saveHistory

  /**
   * 任务开始时立即写入一条「生成中」历史记录，
   * 防止任务进行中切换 tab / 刷新页面导致任务无痕迹地丢失。
   */
  const startTaskRecord = useCallback(
    (
      promptText: string,
      flashMode: VideoFlashMode,
      seconds: string,
      aspectRatio: string,
      firstFrameUrl: string,
      lastFrameUrl: string,
      images: string[],
      audios: string[],
      mIndex: number,
      aIndex: number,
      dIndex: number
    ): string => {
      const record: VideoFlashHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url: '',
        prompt: promptText,
        mode: flashMode,
        seconds,
        aspectRatio,
        firstFrame: firstFrameUrl || undefined,
        lastFrame: lastFrameUrl || undefined,
        images,
        audios,
        modeIndex: mIndex,
        aspectRatioIndex: aIndex,
        durationIndex: dIndex,
        time: Date.now(),
        responseData: null,
        status: 'generating'
      }
      setHistory((prev) => {
        const updated = [record, ...prev].slice(0, 50)
        saveHistory(updated)
        return updated
      })
      return record.id
    },
    [saveHistory]
  )

  /** 任务结束后回写详细结果（成功 / 失败 / 中断） */
  const finishTaskRecord = useCallback(
    (id: string, patch: Partial<VideoFlashHistoryItem>) => {
      setHistory((prev) => {
        const updated = prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
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
      requestRef.current = queryVideoTaskFlash(apiKey.trim(), videoId)
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
              // 视频地址在 remixed_from_video_id 字段
              const rawUrl = String(data.remixed_from_video_id || data.url || '').trim()
              const cleanUrl = rawUrl.replace(/^[\s`]+|[\s`]+$/g, '')
              const recordId = currentTaskRecordIdRef.current
              if (cleanUrl) {
                setVideoUrl(cleanUrl)
                setVideoStatus('生成完成')
                setVideoProgress(100)
                Notification.success('视频生成完成')
                if (recordId) {
                  currentTaskRecordIdRef.current = null
                  finishTaskRecord(recordId, { url: cleanUrl, responseData: data, status: 'success' })
                }
              } else {
                onError('视频生成完成但未获取到视频地址')
                if (recordId) {
                  currentTaskRecordIdRef.current = null
                  finishTaskRecord(recordId, { status: 'failed', failReason: '任务完成但未获取到视频地址' })
                }
              }
            } else if (status === 'failed') {
              stopPolling()
              setIsLoading(false)
              const errMsg =
                (data.error as string) ||
                (data.error as { message?: string })?.message ||
                '未知错误'
              onError('视频生成失败: ' + errMsg)
              const recordId = currentTaskRecordIdRef.current
              if (recordId) {
                currentTaskRecordIdRef.current = null
                finishTaskRecord(recordId, { status: 'failed', failReason: errMsg })
              }
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
  }, [apiKey, stopPolling, finishTaskRecord, onError])

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

    // 模式专用校验
    if (mode === 'keyframe') {
      if (!firstFrame.trim() && !lastFrame.trim()) {
        onError('首尾帧模式需要至少提供首帧或尾帧图片 URL')
        return
      }
    } else if (mode === 'reference') {
      if (refImageUrls.length === 0 && audioUrls.length === 0) {
        onError('参考模式需要至少添加一张图片或一个音频')
        return
      }
      if (refImageUrls.length > VIDEO_FLASH_MAX_IMAGES) {
        onError(`参考图片最多 ${VIDEO_FLASH_MAX_IMAGES} 张`)
        return
      }
    }

    setStorage(STORAGE_KEYS.API_KEY, apiKey.trim())
    onError('')
    setVideoUrl('')
    setVideoProgress(0)
    setVideoStatus('排队中...')
    setIsLoading(true)

    const seconds = VIDEO_FLASH_DURATIONS[durationIndex].value
    const aspectRatio = VIDEO_FLASH_ASPECT_RATIOS[aspectRatioIndex].value

    // 请求开始立即写入「生成中」历史记录，防止切换 tab 导致任务丢失
    currentTaskRecordIdRef.current = startTaskRecord(
      prompt.trim(),
      mode,
      seconds,
      aspectRatio,
      mode === 'keyframe' ? firstFrame.trim() : '',
      mode === 'keyframe' ? lastFrame.trim() : '',
      mode === 'reference' ? refImageUrls : [],
      mode === 'reference' ? audioUrls : [],
      modeIndex,
      aspectRatioIndex,
      durationIndex
    )

    requestRef.current = createVideoTaskFlash(apiKey.trim(), {
      prompt: prompt.trim(),
      mode,
      seconds,
      aspectRatio,
      firstFrame: mode === 'keyframe' ? firstFrame.trim() || undefined : undefined,
      lastFrame: mode === 'keyframe' ? lastFrame.trim() || undefined : undefined,
      images: mode === 'reference' && refImageUrls.length > 0 ? refImageUrls : undefined,
      audios: mode === 'reference' && audioUrls.length > 0 ? audioUrls : undefined
    })

    requestRef.current.promise
      .then((res) => {
        const recordId = currentTaskRecordIdRef.current
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
            if (recordId) {
              currentTaskRecordIdRef.current = null
              finishTaskRecord(recordId, { status: 'failed', failReason: '未获取到任务 ID' })
            }
          }
        } else {
          setIsLoading(false)
          const data = res.data as Record<string, unknown>
          const errMsg =
            (data?.detail as string) ||
            (data?.error as { message?: string })?.message ||
            JSON.stringify(data) ||
            `HTTP ${res.statusCode}`
          onError('创建视频任务失败: ' + errMsg)
          if (recordId) {
            currentTaskRecordIdRef.current = null
            finishTaskRecord(recordId, { status: 'failed', failReason: errMsg })
          }
        }
      })
      .catch((err) => {
        setIsLoading(false)
        const msg = err?.errMsg || err?.message || ''
        onError('网络请求失败: ' + msg)
        const recordId = currentTaskRecordIdRef.current
        currentTaskRecordIdRef.current = null
        if (recordId) {
          finishTaskRecord(recordId, { status: 'failed', failReason: '网络请求失败' + (msg ? '：' + msg : '') })
        }
      })
  }, [isLoading, apiKey, prompt, mode, modeIndex, aspectRatioIndex, durationIndex, firstFrame, lastFrame, refImageUrls, audioUrls, onError, startPolling, startTaskRecord, finishTaskRecord])

  const stopGenerate = useCallback(() => {
    if (requestRef.current) {
      try {
        requestRef.current.abort()
      } catch {
        // 忽略 abort 错误
      }
      requestRef.current = null
    }
    stopPolling()
    setIsLoading(false)
    setVideoStatus('')
    const taskId = currentTaskRecordIdRef.current
    if (taskId) {
      currentTaskRecordIdRef.current = null
      finishTaskRecord(taskId, { status: 'interrupted', failReason: '已手动终止' })
    }
    onError('已终止生成')
  }, [stopPolling, onError, finishTaskRecord])

  const handleCopyPrompt = useCallback(async () => {
    const ok = await copyToClipboard(prompt)
    Notification[ok ? 'success' : 'error'](ok ? '已复制提示词' : '复制失败')
  }, [prompt])

  const handleDownload = useCallback(() => {
    if (!videoUrl) return
    downloadFile(videoUrl, `agnes-video-flash-${Date.now()}.mp4`)
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
    setFirstFrame('')
    setLastFrame('')
    setRefImageInput('')
    setRefImageUrls([])
    setAudioInput('')
    setAudioUrls([])
    stopPolling()
    onError('')
  }, [stopPolling, onError])

  /** 通用：清理 URL 输入 */
  const sanitizeUrl = useCallback((raw: string) => {
    const safe = raw.replace(/[^a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]/g, '')
    const match = safe.match(/https?:\/\/[a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]+/)
    return match ? match[0] : safe
  }, [])

  const addRefImageUrl = useCallback(() => {
    const url = sanitizeUrl(refImageInput)
    if (!url) return
    if (refImageUrls.length >= VIDEO_FLASH_MAX_IMAGES) {
      Notification.warning(`参考图片最多 ${VIDEO_FLASH_MAX_IMAGES} 张`)
      return
    }
    setRefImageUrls((prev) => [...prev, url])
    setRefImageInput('')
  }, [refImageInput, refImageUrls, sanitizeUrl])

  const uploadRefImage = useCallback(() => {
    refImageInputRef.current?.click()
  }, [])

  const handleRefImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (refImageUrls.length >= VIDEO_FLASH_MAX_IMAGES) {
      Notification.warning(`参考图片最多 ${VIDEO_FLASH_MAX_IMAGES} 张`)
      e.target.value = ''
      return
    }
    try {
      const url = await uploadToImgbb(file)
      setRefImageUrls((prev) => [...prev, url])
      Notification.success('上传成功')
    } catch {
      // URL 上传失败时，转 JPEG Data URI（自动处理 HEIC 等格式）
      try {
        const dataUri = await fileToJpegDataUri(file)
        setRefImageUrls((prev) => [...prev, dataUri])
        Notification.warning('URL 上传失败，已转用本地图片')
      } catch {
        Notification.error('图片格式不支持，请使用 JPG 或 PNG 格式')
      }
    }
    e.target.value = ''
  }, [refImageUrls])

  const removeRefImage = useCallback((index: number) => {
    setRefImageUrls((prev) => prev.filter((_, i) => i !== index))
  }, [])

  /** 首帧/尾帧上传（keyframe 模式） */
  const handleFrameUpload = useCallback(async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'first' | 'last'
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const url = await uploadToImgbb(file)
      if (target === 'first') setFirstFrame(url)
      else setLastFrame(url)
      Notification.success('上传成功')
    } catch {
      try {
        const dataUri = await fileToJpegDataUri(file)
        if (target === 'first') setFirstFrame(dataUri)
        else setLastFrame(dataUri)
        Notification.warning('URL 上传失败，已转用本地图片')
      } catch {
        Notification.error('图片格式不支持，请使用 JPG 或 PNG 格式')
      }
    }
    e.target.value = ''
  }, [])

  const addAudioUrl = useCallback(() => {
    const url = sanitizeUrl(audioInput)
    if (!url) return
    setAudioUrls((prev) => [...prev, url])
    setAudioInput('')
  }, [audioInput, sanitizeUrl])

  const removeAudio = useCallback((index: number) => {
    setAudioUrls((prev) => prev.filter((_, i) => i !== index))
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

  const viewHistory = useCallback((item: VideoFlashHistoryItem) => {
    setVideoUrl(item.url)
    setPrompt(item.prompt)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const usePrompt = useCallback(() => {
    if (!detailItem) return
    setPrompt(detailItem.prompt)
    if (detailItem.modeIndex !== undefined) setModeIndex(detailItem.modeIndex)
    if (detailItem.aspectRatioIndex !== undefined) setAspectRatioIndex(detailItem.aspectRatioIndex)
    if (detailItem.durationIndex !== undefined) setDurationIndex(detailItem.durationIndex)
    setFirstFrame(detailItem.firstFrame || '')
    setLastFrame(detailItem.lastFrame || '')
    setRefImageUrls(detailItem.images || [])
    setAudioUrls(detailItem.audios || [])
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
    downloadFile(detailItem.url, `agnes-video-flash-${Date.now()}.mp4`)
  }, [detailItem])


  return (
    <div>
      <input
        ref={firstFrameInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFrameUpload(e, 'first')}
      />
      <input
        ref={lastFrameInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFrameUpload(e, 'last')}
      />
      <input
        ref={refImageInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleRefImageUpload}
      />

      {/* 模式 / 画幅 / 时长 */}
      <div className="agnes-form-row">
        <div className="agnes-form-group">
          <div className="agnes-label-row">
            <span className="agnes-label-icon">🎬</span>
            <span className="agnes-label-text">模式</span>
          </div>
          <Select
            value={String(modeIndex)}
            onChange={(key) => setModeIndex(Number(key))}
            options={VIDEO_FLASH_MODES.map((m, i) => ({ key: String(i), label: m.label }))}
            placeholder="选择模式"
          />
        </div>
        <div className="agnes-form-group">
          <div className="agnes-label-row">
            <span className="agnes-label-icon">📐</span>
            <span className="agnes-label-text">画幅</span>
          </div>
          <Select
            value={String(aspectRatioIndex)}
            onChange={(key) => setAspectRatioIndex(Number(key))}
            options={VIDEO_FLASH_ASPECT_RATIOS.map((r, i) => ({ key: String(i), label: r.label }))}
            placeholder="选择画幅"
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
            options={VIDEO_FLASH_DURATIONS.map((d, i) => ({ key: String(i), label: d.label }))}
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
          placeholder={
            mode === 'reference'
              ? '描述视频内容，可用 <Picture 1>、<Audio 1> 指代参考素材'
              : '描述你想要生成的视频，例如：雨后的未来城市街道，霓虹灯倒映在地面，一辆银色跑车缓慢驶过'
          }
        />
      </div>

      {/* keyframe 模式：首尾帧 */}
      {mode === 'keyframe' && (
        <div className="agnes-form-group">
          <div className="agnes-label-row">
            <span className="agnes-label-icon">🖼️</span>
            <span className="agnes-label-text">首尾帧（至少提供一个）</span>
            <span className="agnes-label-optional">可选，但首尾帧至少一个</span>
          </div>
          <div className="agnes-ref-input-row">
            <input
              className="agnes-textarea agnes-ref-input"
              value={firstFrame}
              onChange={(e) => setFirstFrame(e.target.value)}
              placeholder="首帧图片 URL"
            />
            <Button size="middle" type="dashed" onClick={() => firstFrameInputRef.current?.click()}>上传首帧</Button>
          </div>
          <div className="agnes-ref-input-row">
            <input
              className="agnes-textarea agnes-ref-input"
              value={lastFrame}
              onChange={(e) => setLastFrame(e.target.value)}
              placeholder="尾帧图片 URL"
            />
            <Button size="middle" type="dashed" onClick={() => lastFrameInputRef.current?.click()}>上传尾帧</Button>
          </div>
          <div className="agnes-ref-tips">AI 将基于首帧/尾帧生成帧间过渡动画</div>
          {(firstFrame || lastFrame) && (
            <div className="agnes-ref-preview-list">
              {firstFrame && (
                <div className="agnes-ref-preview-wrap" key="first">
                  <img className="agnes-ref-preview-image" src={firstFrame} alt="first-frame" onClick={() => setPreviewSrc(firstFrame)} />
                  <div className="agnes-ref-preview-delete" onClick={() => setFirstFrame('')}>✕</div>
                </div>
              )}
              {lastFrame && (
                <div className="agnes-ref-preview-wrap" key="last">
                  <img className="agnes-ref-preview-image" src={lastFrame} alt="last-frame" onClick={() => setPreviewSrc(lastFrame)} />
                  <div className="agnes-ref-preview-delete" onClick={() => setLastFrame('')}>✕</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* reference 模式：参考图 + 参考音频 */}
      {mode === 'reference' && (
        <>
          <div className="agnes-form-group">
            <div className="agnes-label-row">
              <span className="agnes-label-icon">🖼️</span>
              <span className="agnes-label-text">参考图</span>
              <span className="agnes-label-optional">最多 {VIDEO_FLASH_MAX_IMAGES} 张</span>
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
            <div className="agnes-ref-tips">在提示词中可用 &lt;Picture N&gt; 指代第 N 张参考图</div>
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
                    <div className="agnes-ref-preview-delete" onClick={() => removeRefImage(index)}>
                      ✕
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="agnes-form-group">
            <div className="agnes-label-row">
              <span className="agnes-label-icon">🎵</span>
              <span className="agnes-label-text">参考音频</span>
              <span className="agnes-label-optional">可选，支持多个</span>
            </div>
            <div className="agnes-ref-input-row">
              <input
                className="agnes-textarea agnes-ref-input"
                value={audioInput}
                onChange={(e) => setAudioInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addAudioUrl()}
                placeholder="输入音频 URL 后点击添加"
              />
              <Button size="middle" onClick={addAudioUrl}>添加</Button>
            </div>
            <div className="agnes-ref-tips">在提示词中可用 &lt;Audio N&gt; 指代第 N 个参考音频</div>
            {audioUrls.length > 0 && (
              <div className="agnes-ref-preview-list">
                {audioUrls.map((url, index) => (
                  <div className="agnes-ref-preview-wrap agnes-ref-audio-item" key={index}>
                    <span className="agnes-ref-audio-label">🎵 Audio {index + 1}</span>
                    <div className="agnes-ref-preview-delete" onClick={() => removeAudio(index)}>
                      ✕
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

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
          {isLoading ? '生成中...' : '✦ 生成视频（Flash）'}
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
          <div className="agnes-loading-text agnes-loading-dots">视频生成中，预计需要 1-5 分钟</div>
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
            <span className="agnes-history-title">🎬 Flash 视频历史</span>
            <Button size="small" type="dashed" danger onClick={clearHistory}>
              清空
            </Button>
          </div>
          <div className="agnes-history-list">
            {pagedHistory.map((item) => (
              <div className="agnes-history-item" key={item.id}>
                {item.url ? (
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
                ) : (
                  <div
                    className="agnes-history-thumb agnes-history-thumb-placeholder"
                    onClick={() => (item.status === 'generating' ? Notification.warning('任务仍在生成中...') : setDetailItem(item))}
                  >
                    {item.status === 'generating' ? '⏳' : '⛔'}
                  </div>
                )}
                <div className="agnes-history-info" onClick={() => setDetailItem(item)}>
                  <div className="agnes-history-prompt">{truncateText(item.prompt, 20)}</div>
                  <div className="agnes-history-tags">
                    {item.status === 'generating' && <span className="agnes-history-tag">⏳ 生成中</span>}
                    {item.status === 'interrupted' && <span className="agnes-history-tag">⛔ 已中断</span>}
                    {item.status === 'failed' && <span className="agnes-history-tag">⚠️ 失败</span>}
                    <span className="agnes-history-tag">{item.mode}</span>
                    <span className="agnes-history-tag">{item.aspectRatio}</span>
                    <span className="agnes-history-tag">{item.seconds}s</span>
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
            <span>Flash 视频记录详情</span>
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
            {detailItem.url ? (
              <video
                className="agnes-detail-video"
                src={detailItem.url}
                controls
              />
            ) : (
              <div className="agnes-history-thumb-placeholder" style={{ width: '100%', height: 200 }}>
                {detailItem.status === 'generating' ? '⏳ 生成中' : detailItem.status === 'failed' ? '⚠️ 生成失败' : '⛔ 已中断'}
                {detailItem.failReason ? `（${detailItem.failReason}）` : ''}
              </div>
            )}
            {detailItem.status && detailItem.status !== 'success' && (
              <div className="agnes-detail-field">
                <span className="agnes-detail-label">状态：</span>
                <span className="agnes-detail-value">
                  {detailItem.status === 'generating' ? '⏳ 生成中' : detailItem.status === 'failed' ? `⚠️ 失败：${detailItem.failReason || '未知原因'}` : '⛔ 已中断'}
                </span>
              </div>
            )}

            <div className="agnes-detail-field agnes-detail-prompt-field">
              <div className="agnes-detail-prompt-header">
                <span className="agnes-detail-label">提示词：</span>
                <Button size="small" onClick={copyDetailPrompt}>复制</Button>
              </div>
              <div className="agnes-detail-value agnes-detail-value-long">{detailItem.prompt}</div>
            </div>

            <div className="agnes-detail-field">
              <span className="agnes-detail-label">模式：</span>
              <span className="agnes-detail-value">{detailItem.mode}</span>
            </div>
            <div className="agnes-detail-field">
              <span className="agnes-detail-label">画幅：</span>
              <span className="agnes-detail-value">{detailItem.aspectRatio}</span>
            </div>
            <div className="agnes-detail-field">
              <span className="agnes-detail-label">时长：</span>
              <span className="agnes-detail-value">{detailItem.seconds} 秒</span>
            </div>
            {detailItem.firstFrame && (
              <div className="agnes-detail-field">
                <span className="agnes-detail-label">首帧：</span>
                <img
                  className="agnes-detail-ref-image"
                  src={detailItem.firstFrame}
                  alt="first-frame"
                  onClick={() => setPreviewSrc(detailItem.firstFrame!)}
                />
              </div>
            )}
            {detailItem.lastFrame && (
              <div className="agnes-detail-field">
                <span className="agnes-detail-label">尾帧：</span>
                <img
                  className="agnes-detail-ref-image"
                  src={detailItem.lastFrame}
                  alt="last-frame"
                  onClick={() => setPreviewSrc(detailItem.lastFrame!)}
                />
              </div>
            )}
            {detailItem.images && detailItem.images.length > 0 && (
              <div className="agnes-detail-field">
                <span className="agnes-detail-label">参考图：</span>
                <div className="agnes-detail-ref-image-list">
                  {detailItem.images.map((url, idx) => (
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
            {detailItem.audios && detailItem.audios.length > 0 && (
              <div className="agnes-detail-field">
                <span className="agnes-detail-label">参考音频：</span>
                <div className="agnes-detail-value">
                  {detailItem.audios.map((_, idx) => `Audio ${idx + 1}`).join('、')}
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