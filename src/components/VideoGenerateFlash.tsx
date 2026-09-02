import { useState, useEffect, useCallback, useRef } from 'react'
import { Button, Select, Notification } from 'animal-island-ui'
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
  copyToClipboard,
  downloadFile,
  formatTime,
  truncateText,
  fileToJpegDataUri,
  getOrientationFromRatio,
  ORIENTATION_LABELS
} from '../utils/helpers'
import { useHistoryPagination } from '../hooks/useHistoryPagination'
import { useHistory } from '../hooks/useHistory'
import HistoryPagination from './HistoryPagination'
import HistoryDetail from './HistoryDetail'
import type { HistoryRecordType } from './HistoryDetail'
import ImagePreview from './ImagePreview'

interface VideoGenerateFlashProps {
  apiKey: string
  errorMsg: string
  onError: (msg: string) => void
  onLoadingChange: (loading: boolean) => void
}

const PAGE_SIZE = 10
const POLL_TIMEOUT_MS = 30 * 60 * 1000

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
  const [, setVideoTaskId] = useState('')

  const [videoStatus, setVideoStatus] = useState('')
  const [videoProgress, setVideoProgress] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [previewSrc, setPreviewSrc] = useState('')
  const [detailRecord, setDetailRecord] = useState<VideoFlashHistoryItem | null>(null)

  const requestRef = useRef<RequestResult<ApiResponse> | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollStartedAtRef = useRef<number>(0)
  const firstFrameInputRef = useRef<HTMLInputElement>(null)
  const lastFrameInputRef = useRef<HTMLInputElement>(null)
  const refImageInputRef = useRef<HTMLInputElement>(null)
  const currentTaskRecordIdRef = useRef<string | null>(null)

  const mode = VIDEO_FLASH_MODES[modeIndex].value as VideoFlashMode

  const historyCtrl = useHistory<VideoFlashHistoryItem>(STORAGE_KEYS.VIDEO_HISTORY_FLASH)
  const paging = useHistoryPagination(historyCtrl.history, PAGE_SIZE)

  useEffect(() => {
    onLoadingChange(isLoading)
  }, [isLoading, onLoadingChange])

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const startPolling = useCallback((videoId: string) => {
    stopPolling()
    pollStartedAtRef.current = Date.now()

    const tick = () => {
      if (!videoId) return
      if (Date.now() - pollStartedAtRef.current > POLL_TIMEOUT_MS) {
        stopPolling()
        setIsLoading(false)
        const recordId = currentTaskRecordIdRef.current
        currentTaskRecordIdRef.current = null
        const reason = '轮询超时（30 分钟未完成）'
        if (recordId) historyCtrl.finishTaskRecord(recordId, { status: 'failed', failReason: reason })
        onError(reason)
        return
      }

      requestRef.current = queryVideoTaskFlash(apiKey.trim(), videoId)
      requestRef.current.promise
        .then((res) => {
          if (res.statusCode === 200) {
            const data = res.data as Record<string, unknown>
            const status = (data.status as string) || (data.internal_status as string) || ''
            const progress = (data.progress as number) ?? (data.internal_progress as number) ?? 0
            setVideoProgress(progress)

            if (status === 'completed') {
              stopPolling()
              setIsLoading(false)
              // 视频地址可能在 data.url（直接返回）或 data.metadata.url（嵌套），兼容两种格式
              const metadata = (data.metadata as Record<string, unknown> | undefined) || {}
              const urlTop = typeof data.url === 'string' ? data.url : ''
              const urlMeta = typeof metadata.url === 'string' ? metadata.url : ''
              const rawUrl = String(urlTop || urlMeta || '').trim()
              const cleanUrl = rawUrl.replace(/^[\s`]+|[\s`]+$/g, '')
              const recordId = currentTaskRecordIdRef.current
              if (cleanUrl) {
                setVideoUrl(cleanUrl)
                setVideoStatus('生成完成')
                setVideoProgress(100)
                Notification.success('视频生成完成')
                if (recordId) {
                  currentTaskRecordIdRef.current = null
                  historyCtrl.finishTaskRecord(recordId, { url: cleanUrl, responseData: data, status: 'success' })
                }
              } else {
                onError('视频生成完成但未获取到视频地址')
                if (recordId) {
                  currentTaskRecordIdRef.current = null
                  historyCtrl.finishTaskRecord(recordId, { status: 'failed', failReason: '任务完成但未获取到视频地址' })
                }
              }
              return
            }
            if (status === 'failed') {
              stopPolling()
              setIsLoading(false)
              const errMsg = (data.error as string) || (data.error as { message?: string })?.message || '未知错误'
              onError('视频生成失败: ' + errMsg)
              const recordId = currentTaskRecordIdRef.current
              if (recordId) {
                currentTaskRecordIdRef.current = null
                historyCtrl.finishTaskRecord(recordId, { status: 'failed', failReason: errMsg })
              }
              return
            }
            if (status === 'in_progress' || status === 'processing') {
              setVideoStatus(progress > 0 ? `生成中 ${progress}%` : '生成中...')
            } else if (status === 'queued' || status === 'pending') {
              setVideoStatus('排队中...')
            } else if (status) {
              setVideoStatus(status)
            }
          }
        })
        .catch(() => { /* ignore */ })
        .finally(() => {
          if (pollTimerRef.current) pollTimerRef.current = setTimeout(tick, 10000)
        })
    }

    pollTimerRef.current = setTimeout(tick, 0)
  }, [apiKey, stopPolling, historyCtrl, onError])

  const handleGenerate = useCallback(() => {
    if (isLoading) return
    if (!apiKey.trim()) { onError('请输入 API Key'); return }
    if (!prompt.trim()) { onError('请输入视频描述'); return }

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


    onError('')
    setVideoUrl('')
    setVideoProgress(0)
    setVideoStatus('排队中...')
    setIsLoading(true)

    const seconds = VIDEO_FLASH_DURATIONS[durationIndex].value
    const aspectRatio = VIDEO_FLASH_ASPECT_RATIOS[aspectRatioIndex].value

    const recordInput: Omit<VideoFlashHistoryItem, 'id' | 'time' | 'status'> = {
      url: '',
      prompt: prompt.trim(),
      mode,
      seconds,
      aspectRatio,
      firstFrame: mode === 'keyframe' ? firstFrame.trim() || undefined : undefined,
      lastFrame: mode === 'keyframe' ? lastFrame.trim() || undefined : undefined,
      images: mode === 'reference' ? refImageUrls : [],
      audios: mode === 'reference' ? audioUrls : [],
      modeIndex,
      aspectRatioIndex,
      durationIndex,
      responseData: null
    } as Omit<VideoFlashHistoryItem, 'id' | 'time' | 'status'>
    currentTaskRecordIdRef.current = historyCtrl.startTaskRecord(recordInput)

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
              historyCtrl.finishTaskRecord(recordId, { status: 'failed', failReason: '未获取到任务 ID' })
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
            historyCtrl.finishTaskRecord(recordId, { status: 'failed', failReason: errMsg })
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
          historyCtrl.finishTaskRecord(recordId, { status: 'failed', failReason: '网络请求失败' + (msg ? '：' + msg : '') })
        }
      })
  }, [isLoading, apiKey, prompt, mode, modeIndex, aspectRatioIndex, durationIndex, firstFrame, lastFrame, refImageUrls, audioUrls, onError, startPolling, historyCtrl])

  const stopGenerate = useCallback(() => {
    if (requestRef.current) {
      try { requestRef.current.abort() } catch { /* ignore */ }
      requestRef.current = null
    }
    stopPolling()
    setIsLoading(false)
    setVideoStatus('')
    const taskId = currentTaskRecordIdRef.current
    if (taskId) {
      currentTaskRecordIdRef.current = null
      historyCtrl.finishTaskRecord(taskId, { status: 'interrupted', failReason: '已手动终止' })
    }
    onError('已终止生成')
  }, [stopPolling, onError, historyCtrl])

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

  const uploadRefImage = useCallback(() => { refImageInputRef.current?.click() }, [])

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

  const handleFrameUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, target: 'first' | 'last') => {
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

      <div className="agnes-flash-card">
        <div className="agnes-flash-card-header">
          <span className="agnes-label-icon">🎬</span>
          <span className="agnes-flash-card-title">生成模式</span>
          <span className="agnes-flash-card-tip">
            {mode === 'text' && '纯文本描述生成'}
            {mode === 'keyframe' && '首尾帧过渡生成'}
            {mode === 'reference' && '图片 / 音频参考生成'}
          </span>
        </div>
        <div className="agnes-segment">
          {VIDEO_FLASH_MODES.map((m, i) => (
            <button
              key={m.value}
              type="button"
              className={`agnes-segment-item ${modeIndex === i ? 'agnes-segment-item-active' : ''}`}
              onClick={() => setModeIndex(i)}
            >
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        <div className="agnes-attr-row">
          <div className="agnes-attr-block">
            <div className="agnes-attr-label">
              <span className="agnes-attr-label-icon">📐</span>
              <span>画幅</span>
            </div>
            <Select
              value={String(aspectRatioIndex)}
              onChange={(key) => setAspectRatioIndex(Number(key))}
              options={VIDEO_FLASH_ASPECT_RATIOS.map((r, i) => ({ key: String(i), label: r.label }))}
              placeholder="选择画幅"
            />
            {(() => {
              const o = getOrientationFromRatio(VIDEO_FLASH_ASPECT_RATIOS[aspectRatioIndex]?.value)
              return o ? <span className={`agnes-orientation-badge agnes-orientation-${o}`}>{ORIENTATION_LABELS[o].icon} {ORIENTATION_LABELS[o].text}</span> : null
            })()}
          </div>
          <div className="agnes-attr-block">
            <div className="agnes-attr-label">
              <span className="agnes-attr-label-icon">⏱️</span>
              <span>时长</span>
            </div>
            <Select
              value={String(durationIndex)}
              onChange={(key) => setDurationIndex(Number(key))}
              options={VIDEO_FLASH_DURATIONS.map((d, i) => ({ key: String(i), label: d.label }))}
              placeholder="选择时长"
            />
          </div>
        </div>
      </div>

      <div className="agnes-flash-card">
        <div className="agnes-flash-card-header">
          <span className="agnes-label-icon">✨</span>
          <span className="agnes-flash-card-title">提示词</span>
          <span className="agnes-label-required">*</span>
          <span className="agnes-flash-card-tip">
            {mode === 'reference' ? '可用 <Picture N>、<Audio N> 指代素材' : '描述视频内容、风格、运镜'}
          </span>
          {prompt && (
            <div className="agnes-prompt-actions" style={{ marginLeft: 'auto' }}>
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

      {mode === 'keyframe' && (
        <div className="agnes-flash-card">
          <div className="agnes-flash-card-header">
            <span className="agnes-label-icon">🖼️</span>
            <span className="agnes-flash-card-title">首尾帧</span>
            <span className="agnes-flash-card-tip">至少提供一个，AI 生成帧间过渡</span>
          </div>
          <div className="agnes-attr-row" style={{ marginBottom: 0 }}>
            <div className="agnes-attr-block">
              <div className="agnes-attr-label">
                <span className="agnes-attr-label-icon">🎞</span>
                <span>首帧</span>
              </div>
              <div className="agnes-ref-input-row">
                <input
                  className="agnes-textarea agnes-ref-input"
                  value={firstFrame}
                  onChange={(e) => setFirstFrame(e.target.value)}
                  placeholder="首帧图片 URL"
                />
                <Button size="middle" type="dashed" onClick={() => firstFrameInputRef.current?.click()}>上传</Button>
              </div>
            </div>
            <div className="agnes-attr-block">
              <div className="agnes-attr-label">
                <span className="agnes-attr-label-icon">🎬</span>
                <span>尾帧</span>
              </div>
              <div className="agnes-ref-input-row">
                <input
                  className="agnes-textarea agnes-ref-input"
                  value={lastFrame}
                  onChange={(e) => setLastFrame(e.target.value)}
                  placeholder="尾帧图片 URL"
                />
                <Button size="middle" type="dashed" onClick={() => lastFrameInputRef.current?.click()}>上传</Button>
              </div>
            </div>
          </div>
          {(firstFrame || lastFrame) && (
            <div className="agnes-media-grid">
              {firstFrame ? (
                <div className="agnes-media-tile">
                  <img src={firstFrame} alt="first-frame" onClick={() => setPreviewSrc(firstFrame)} />
                  <div className="agnes-media-tile-remove" onClick={() => setFirstFrame('')} title="删除首帧">✕</div>
                </div>
              ) : (
                <div className="agnes-media-tile agnes-media-tile-empty" title="未设置首帧">＋</div>
              )}
              {lastFrame ? (
                <div className="agnes-media-tile">
                  <img src={lastFrame} alt="last-frame" onClick={() => setPreviewSrc(lastFrame)} />
                  <div className="agnes-media-tile-remove" onClick={() => setLastFrame('')} title="删除尾帧">✕</div>
                </div>
              ) : (
                <div className="agnes-media-tile agnes-media-tile-empty" title="未设置尾帧">＋</div>
              )}
            </div>
          )}
        </div>
      )}

      {mode === 'reference' && (
        <div className="agnes-flash-card">
          <div className="agnes-flash-card-header">
            <span className="agnes-label-icon">🎨</span>
            <span className="agnes-flash-card-title">参考素材</span>
            <span className="agnes-flash-card-tip">
              图片 {refImageUrls.length}/{VIDEO_FLASH_MAX_IMAGES} · 音频 {audioUrls.length}
            </span>
          </div>

          <div className="agnes-attr-label" style={{ marginTop: 0 }}>
            <span className="agnes-attr-label-icon">🖼️</span>
            <span>参考图</span>
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
          {refImageUrls.length > 0 ? (
            <div className="agnes-media-grid">
              {refImageUrls.map((url, index) => (
                <div className="agnes-media-tile" key={index}>
                  <img src={url} alt={`ref-${index}`} onClick={() => setPreviewSrc(url)} />
                  <div className="agnes-media-tile-remove" onClick={() => removeRefImage(index)} title="删除">✕</div>
                </div>
              ))}
              {Array.from({ length: Math.max(0, VIDEO_FLASH_MAX_IMAGES - refImageUrls.length) }).map((_, i) => (
                <div className="agnes-media-tile agnes-media-tile-empty" key={`empty-${i}`}>＋</div>
              ))}
            </div>
          ) : (
            <div className="agnes-media-grid">
              {Array.from({ length: VIDEO_FLASH_MAX_IMAGES }).map((_, i) => (
                <div className="agnes-media-tile agnes-media-tile-empty" key={`empty-${i}`}>＋</div>
              ))}
            </div>
          )}

          <div className="agnes-attr-label" style={{ marginTop: 'var(--agnes-space-md)' }}>
            <span className="agnes-attr-label-icon">🎵</span>
            <span>参考音频</span>
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
            <div className="agnes-media-grid">
              {audioUrls.map((_url, index) => (
                <div className="agnes-media-tile agnes-media-tile-empty agnes-media-tile-audio" key={index} title={`Audio ${index + 1}`}>
                  🎵
                  <span>Audio {index + 1}</span>
                  <div className="agnes-media-tile-remove" onClick={() => removeAudio(index)} title="删除">✕</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

      {errorMsg && <div className="agnes-error-box">{errorMsg}</div>}

      {isLoading && (
        <div className="agnes-loading-box">
          <div className="agnes-spinner" />
          <div className="agnes-loading-text agnes-loading-dots">视频生成中，预计需要 1-5 分钟</div>
          {videoProgress > 0 && (
            <div className="agnes-video-progress-bar" style={{ width: '100%' }}>
              <div className="agnes-video-progress-fill" style={{ width: `${videoProgress}%` }} />
            </div>
          )}
          {videoStatus && <div className="agnes-loading-status">{videoStatus}</div>}
          <Button type="dashed" danger size="small" onClick={stopGenerate}>终止生成</Button>
        </div>
      )}

      {videoUrl && (
        <div className="agnes-result-box">
          <div className="agnes-result-header">
            <span className="agnes-result-title">🎬 视频结果</span>
          </div>
          <video className="agnes-result-image" src={videoUrl} controls autoPlay />
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

      {historyCtrl.history.length > 0 && (
        <div className="agnes-history-box">
          <div className="agnes-header-row">
            <span className="agnes-history-title">🎬 Flash 视频历史</span>
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
                {item.url ? (
                  <div className="agnes-history-video-thumb-wrap">
                    <video className="agnes-history-video-thumb" src={item.url} muted />
                    <div className="agnes-history-video-play-icon">
                      <span className="agnes-history-video-play">▶</span>
                    </div>
                  </div>
                ) : (
                  <div className="agnes-history-thumb agnes-history-thumb-placeholder">
                    {item.status === 'generating' ? '⏳' : '⛔'}
                  </div>
                )}
                <div className="agnes-history-info">
                  <div className="agnes-history-prompt">{truncateText(item.prompt, 20)}</div>
                  <div className="agnes-history-tags">
                    {item.status === 'generating' && <span className="agnes-history-tag">⏳ 生成中</span>}
                    {item.status === 'interrupted' && <span className="agnes-history-tag">⛔ 已中断</span>}
                    {item.status === 'failed' && <span className="agnes-history-tag">⚠️ 失败</span>}
                    <span className="agnes-history-tag">{item.mode}</span>
                    <span className="agnes-history-tag">{item.aspectRatio}</span>
                    {(() => {
                      const o = getOrientationFromRatio(item.aspectRatio)
                      return o ? <span className="agnes-history-tag agnes-orientation-tag" data-orientation={o}>{ORIENTATION_LABELS[o].icon} {ORIENTATION_LABELS[o].text}</span> : null
                    })()}
                    <span className="agnes-history-tag">{item.seconds}s</span>
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

      <ImagePreview src={previewSrc} onClose={() => setPreviewSrc('')} />
      <HistoryDetail
        record={detailRecord}
        recordType={'videoFlash' as HistoryRecordType}
        onClose={() => setDetailRecord(null)}
      />
    </div>
  )
}