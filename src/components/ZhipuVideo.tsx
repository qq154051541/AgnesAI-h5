import { useState, useEffect, useCallback, useRef } from 'react'
import { Button, Select, Notification } from 'animal-island-ui'
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
import type { RequestResult, ApiResponse, ZhipuVideoHistoryItem } from '../types'
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

const PAGE_SIZE = 10
const POLL_TIMEOUT_MS = 30 * 60 * 1000

interface ZhipuVideoProps {
  apiKey: string

  modelDescription: string
  errorMsg: string
  onError: (msg: string) => void
  onLoadingChange: (loading: boolean) => void
}

export default function ZhipuVideo({
  apiKey,

  modelDescription,
  errorMsg,
  onError,
  onLoadingChange
}: ZhipuVideoProps) {
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
  const [previewSrc, setPreviewSrc] = useState('')
  const [detailRecord, setDetailRecord] = useState<ZhipuVideoHistoryItem | null>(null)

  const requestRef = useRef<RequestResult<ApiResponse> | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentTaskRecordIdRef = useRef<string | null>(null)
  const pollStartTimeRef = useRef(0)
  const stoppedRef = useRef(false)

  const historyCtrl = useHistory<ZhipuVideoHistoryItem>(ZHIPU_STORAGE_KEYS.VIDEO_HISTORY)
  const paging = useHistoryPagination(historyCtrl.history, PAGE_SIZE)

  useEffect(() => {
    onLoadingChange(isLoading)
  }, [isLoading, onLoadingChange])

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const startPolling = useCallback(
    (taskId: string) => {
      stopPolling()
      pollStartTimeRef.current = Date.now()
      const tick = () => {
        if (stoppedRef.current) return
        if (Date.now() - pollStartTimeRef.current > POLL_TIMEOUT_MS) {
          stopPolling()
          setIsLoading(false)
          onError('视频生成超时（30 分钟），请重试')
          const recordId = currentTaskRecordIdRef.current
          if (recordId) {
            currentTaskRecordIdRef.current = null
            historyCtrl.finishTaskRecord(recordId, { status: 'interrupted', failReason: '轮询超时' })
          }
          return
        }
        requestRef.current = zhipuQueryVideoTask(apiKey.trim(), taskId)
        requestRef.current.promise
          .then((res) => {
            if (stoppedRef.current) return
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
                  const recordId = currentTaskRecordIdRef.current
                  if (recordId) {
                    currentTaskRecordIdRef.current = null
                    historyCtrl.finishTaskRecord(recordId, {
                      url,
                      coverUrl: cover,
                      responseData: data,
                      status: 'success'
                    } as Partial<ZhipuVideoHistoryItem>)
                  }
                } else {
                  onError('视频生成完成但未获取到视频地址')
                  const recordId = currentTaskRecordIdRef.current
                  if (recordId) {
                    currentTaskRecordIdRef.current = null
                    historyCtrl.finishTaskRecord(recordId, { status: 'failed', failReason: '任务完成但未获取到视频地址' })
                  }
                }
                return
              } else if (status === 'FAIL') {
                stopPolling()
                setIsLoading(false)
                const errMsg =
                  (data.error as { message?: string })?.message ||
                  (data.error as string) ||
                  '未知错误'
                onError('视频生成失败: ' + errMsg)
                setVideoStatus('生成失败')
                const recordId = currentTaskRecordIdRef.current
                if (recordId) {
                  currentTaskRecordIdRef.current = null
                  historyCtrl.finishTaskRecord(recordId, { status: 'failed', failReason: errMsg })
                }
                return
              } else if (status === 'PROCESSING') {
                setVideoStatus('生成中...')
              } else if (status) {
                setVideoStatus(status)
              }
            }
          })
          .catch(() => {
            // 单次轮询失败继续尝试
          })
        if (!stoppedRef.current) {
          pollTimerRef.current = setTimeout(tick, ZHIPU_VIDEO_POLL_INTERVAL)
        }
      }
      pollTimerRef.current = setTimeout(tick, ZHIPU_VIDEO_POLL_INTERVAL)
    },
    [apiKey, stopPolling, historyCtrl, onError]
  )

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
    if (isKeyframeMode && refImageUrls.length !== 2) {
      onError('首尾帧模式需要添加 2 张参考图（首帧 + 尾帧）')
      return
    }

    onError('')
    setVideoUrl('')
    setVideoCoverUrl('')
    setVideoStatus('任务提交中...')
    setIsLoading(true)
    stoppedRef.current = false

    const sizeVal = ZHIPU_VIDEO_SIZES[sizeIndex].value
    const durationVal = ZHIPU_VIDEO_DURATIONS[durationIndex].value
    const fpsVal = ZHIPU_VIDEO_FPS[fpsIndex].value
    const qualityVal = ZHIPU_VIDEO_QUALITY[qualityIndex].value

    let imageUrl: string | string[] | undefined
    if (refImageUrls.length > 0) {
      imageUrl = isKeyframeMode ? refImageUrls.slice(0, 2) : refImageUrls[0]
    }

    const taskRecordId = historyCtrl.startTaskRecord({
      taskId: '',
      url: '',
      coverUrl: '',
      prompt: prompt.trim() || '让画面动起来',
      model: ZHIPU_VIDEO_MODEL,
      size: sizeVal,
      duration: durationVal,
      fps: fpsVal,
      quality: qualityVal,
      withAudio,
      refImageUrls,
      isKeyframeMode,
      sizeIndex,
      durationIndex,
      fpsIndex,
      qualityIndex,
      responseData: null
    } as unknown as Omit<ZhipuVideoHistoryItem, 'id' | 'time' | 'status'>)
    currentTaskRecordIdRef.current = taskRecordId

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
        if (stoppedRef.current) return
        const recordId = currentTaskRecordIdRef.current
        const data = res.data as Record<string, unknown>
        const apiError = data?.error as { code?: string; message?: string } | undefined
        if (apiError && apiError.message) {
          setIsLoading(false)
          const codeStr = apiError.code ? `（${apiError.code}）` : ''
          onError(`创建视频任务失败${codeStr}：${apiError.message}`)
          if (recordId) {
            currentTaskRecordIdRef.current = null
            historyCtrl.finishTaskRecord(recordId, { status: 'failed', failReason: `${apiError.message}${codeStr}` })
          }
          return
        }
        if (res.statusCode === 200 || res.statusCode === 201) {
          const taskId = (data.id || data.task_id || '') as string
          if (taskId) {
            setVideoTaskId(taskId)
            setVideoStatus('任务已提交，等待处理...')
            if (recordId) {
              historyCtrl.finishTaskRecord(recordId, { taskId } as Partial<ZhipuVideoHistoryItem>)
            }
            startPolling(taskId)
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
          const errMsg =
            apiError?.message ||
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
        if (stoppedRef.current) return
        setIsLoading(false)
        const msg = err?.errMsg || err?.message || ''
        onError('网络请求失败: ' + msg)
        const recordId = currentTaskRecordIdRef.current
        currentTaskRecordIdRef.current = null
        if (recordId) {
          historyCtrl.finishTaskRecord(recordId, { status: 'failed', failReason: '网络请求失败' + (msg ? '：' + msg : '') })
        }
      })
  }, [isLoading, apiKey, prompt, sizeIndex, durationIndex, fpsIndex, qualityIndex, withAudio, refImageUrls, isKeyframeMode, onError, startPolling, historyCtrl])

  const stopGenerate = useCallback(() => {
    stoppedRef.current = true
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
    onError('')
  }, [stopPolling, onError])

  const addRefImageUrl = useCallback(() => {
    const safe = refImageInput.replace(/[^a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]/g, '')
    const match = safe.match(/https?:\/\/[a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]+/)
    const url = match ? match[0] : safe
    if (!url) return
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

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      <div className="sensenova-model-desc">{modelDescription}</div>

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
          {(() => {
            const o = getOrientation(ZHIPU_VIDEO_SIZES[sizeIndex]?.value)
            return o ? <span className={`agnes-orientation-badge agnes-orientation-${o}`}>{ORIENTATION_LABELS[o].icon} {ORIENTATION_LABELS[o].text}</span> : null
          })()}
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

      {errorMsg && <div className="agnes-error-box">{errorMsg}</div>}

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

      {historyCtrl.history.length > 0 && (
        <div className="agnes-history-box">
          <div className="agnes-history-header">
            <span className="agnes-history-title">🎬 视频历史</span>
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
                {item.url || item.coverUrl ? (
                  <div className="agnes-history-video-thumb-wrap">
                    {item.coverUrl ? (
                      <img className="agnes-history-thumb" src={item.coverUrl} alt="cover" />
                    ) : (
                      <video className="agnes-history-video-thumb" src={item.url} muted />
                    )}
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
                    <span className="agnes-history-tag">{item.size}</span>
                    {(() => {
                      const o = getOrientation(item.size)
                      return o ? <span className="agnes-history-tag agnes-orientation-tag" data-orientation={o}>{ORIENTATION_LABELS[o].icon} {ORIENTATION_LABELS[o].text}</span> : null
                    })()}
                    <span className="agnes-history-tag">{item.duration}s</span>
                    <span className="agnes-history-tag">{item.fps}fps</span>
                    {item.isKeyframeMode && <span className="agnes-history-tag">首尾帧</span>}
                    {item.withAudio && <span className="agnes-history-tag">音效</span>}
                  </div>
                  <div className="agnes-history-meta">{formatTime(item.time)}</div>
                </div>
                <div
                  className="agnes-history-delete-btn"
                  onClick={(e) => { e.stopPropagation(); historyCtrl.deleteHistory(item.id!) }}
                >
                  ✕
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
        recordType={'zhipuVideo' as HistoryRecordType}
        onClose={() => setDetailRecord(null)}
      />
    </div>
  )
}
