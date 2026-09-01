import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Modal, Notification } from 'animal-island-ui'
import {
  copyToClipboard,
  downloadFile,
  formatTime
} from '../utils/helpers'
import type {
  ImageHistoryItem,
  VideoHistoryItem,
  VideoFlashHistoryItem,
  ZhipuVideoHistoryItem,
  Img2PromptHistoryItem,
  SenseNovaImageHistoryItem
} from '../types'
import ImagePreview from './ImagePreview'

export type HistoryRecord =
  | ImageHistoryItem
  | VideoHistoryItem
  | VideoFlashHistoryItem
  | ZhipuVideoHistoryItem
  | Img2PromptHistoryItem
  | SenseNovaImageHistoryItem

export type HistoryRecordType = 'image' | 'video' | 'videoFlash' | 'zhipuVideo' | 'img2prompt'

interface HistoryDetailProps {
  record: HistoryRecord | null
  recordType: HistoryRecordType
  onClose: () => void
}

/** 从记录中安全提取主图/视频地址（不同类型字段不一致） */
function extractMedia(record: HistoryRecord): { urls: string[]; isVideo: boolean } {
  const r = record as unknown as Record<string, unknown>
  const collect = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.length > 0)
    if (typeof v === 'string' && v.length > 0) return [v]
    return []
  }
  const urls = collect(r.urls)?.length
    ? collect(r.urls)
    : collect(r.url)
  const isVideo = recordTypeIsVideo(record, r)
  return { urls, isVideo }
}

function recordTypeIsVideo(_record: HistoryRecord, r: Record<string, unknown>): boolean {
  return Boolean(r.url) && (
    'duration' in r ||
    'seconds' in r ||
    'coverUrl' in r ||
    'taskId' in r
  )
}

export default function HistoryDetail({ record, recordType, onClose }: HistoryDetailProps) {
  const [previewSrc, setPreviewSrc] = useState('')
  const [previewImages, setPreviewImages] = useState<string[] | undefined>(undefined)

  const { urls: mediaUrls, isVideo } = record
    ? extractMedia(record)
    : { urls: [] as string[], isVideo: false }
  const isImg2Prompt = recordType === 'img2prompt'
  const isFailed = record?.status === 'failed' || record?.status === 'interrupted'
  const isGenerating = record?.status === 'generating'
  const responseData = (record as unknown as { responseData?: unknown } | null)?.responseData

  const openImagePreview = useCallback((src: string, images?: string[]) => {
    setPreviewImages(images)
    setPreviewSrc(src)
  }, [])

  const handleCopyPrompt = useCallback(async () => {
    if (!record?.prompt) {
      Notification.error('该记录没有提示词')
      return
    }
    const ok = await copyToClipboard(record.prompt)
    if (ok) Notification.success('已复制提示词')
    else Notification.error('复制失败')
  }, [record?.prompt])

  const handleCopyAllUrls = useCallback(async () => {
    if (mediaUrls.length === 0) {
      Notification.error('没有可复制的地址')
      return
    }
    const ok = await copyToClipboard(mediaUrls.join('\n'))
    if (ok) Notification.success(`已复制 ${mediaUrls.length} 个地址`)
    else Notification.error('复制失败')
  }, [mediaUrls])

  const handleDownloadAll = useCallback(() => {
    if (mediaUrls.length === 0 || !record) {
      Notification.error('没有可下载的文件')
      return
    }
    const ext = isVideo ? 'mp4' : 'png'
    if (mediaUrls.length === 1) {
      downloadFile(mediaUrls[0], `history-${record.id}.${ext}`)
      return
    }
    mediaUrls.forEach((url, i) => {
      setTimeout(() => downloadFile(url, `history-${record.id}-${i + 1}.${ext}`), i * 200)
    })
    Notification.success(`已开始下载 ${mediaUrls.length} 个文件`)
  }, [mediaUrls, isVideo, record])

  const handleDownloadJson = useCallback(() => {
    if (!record) return
    const json = JSON.stringify(responseData ?? null, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `history-${record.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [record, responseData])

  if (!record) return null

  return createPortal(
    <Modal
      open={!!record}
      onClose={onClose}
      footer={null}
      width="min(680px, 92vw)"
      title={renderTitle(recordType, record)}
    >
      <div className="agnes-detail-popup-body">
        {isFailed && record.failReason && (
          <div className="agnes-error-box">
            <strong>任务未完成：</strong>{record.failReason}
          </div>
        )}
        {isGenerating && (
          <div className="agnes-error-box" style={{ background: 'var(--agnes-primary-bg)', borderColor: 'var(--agnes-primary)', color: 'var(--agnes-primary)' }}>
            ⏳ 任务仍在生成中…
          </div>
        )}

        {/* 媒体预览：视频或图片（含多图） */}
        {!isImg2Prompt && mediaUrls.length > 0 && (
          <MediaPreview
            isVideo={isVideo}
            urls={mediaUrls}
            onPreview={openImagePreview}
          />
        )}

        {/* 图转提示词：单图 + 提示词 */}
        {isImg2Prompt && (
          <Img2PromptBody record={record as Img2PromptHistoryItem} onPreview={openImagePreview} />
        )}

        {/* 通用元信息 */}
        <DetailFields record={record} recordType={recordType} />

        {/* 参考图（仅 Agnes 图片 / Agnes 视频 / 智谱视频） */}
        <RefImages record={record} onPreview={openImagePreview} />

        {/* 原始响应数据（折叠区） */}
        {responseData !== undefined && responseData !== null && (
          <div className="agnes-detail-section">
            <div className="agnes-detail-section-title">📦 原始响应数据</div>
            <div className="agnes-detail-json-area">
              {formatJson(responseData)}
            </div>
            <div className="agnes-detail-actions">
              <button
                type="button"
                className="agnes-result-action-btn"
                onClick={handleDownloadJson}
              >
                <span className="agnes-result-action-icon">💾</span>
                <span className="agnes-result-action-label">下载 JSON</span>
              </button>
            </div>
          </div>
        )}

        {/* 底部操作 */}
        <div className="agnes-detail-actions">
          {record.prompt && (
            <button
              type="button"
              className="agnes-result-action-btn"
              onClick={handleCopyPrompt}
            >
              <span className="agnes-result-action-icon">📋</span>
              <span className="agnes-result-action-label">复制提示词</span>
            </button>
          )}
          {mediaUrls.length > 0 && (
            <button
              type="button"
              className="agnes-result-action-btn"
              onClick={handleCopyAllUrls}
            >
              <span className="agnes-result-action-icon">🔗</span>
              <span className="agnes-result-action-label">
                {mediaUrls.length > 1 ? `复制 ${mediaUrls.length} 个地址` : '复制地址'}
              </span>
            </button>
          )}
          {mediaUrls.length > 0 && (
            <button
              type="button"
              className="agnes-result-action-btn agnes-result-action-primary"
              onClick={handleDownloadAll}
            >
              <span className="agnes-result-action-icon">⬇️</span>
              <span className="agnes-result-action-label">
                {mediaUrls.length > 1 ? `下载 ${mediaUrls.length} 个` : '下载'}
              </span>
            </button>
          )}
        </div>
      </div>

      <ImagePreview
        src={previewSrc}
        images={previewImages}
        onClose={() => { setPreviewSrc('') }}
      />
    </Modal>,
    document.body
  )
}

function renderTitle(type: HistoryRecordType, record: HistoryRecord): string {
  const map: Record<HistoryRecordType, string> = {
    image: '🖼️ 图片详情',
    video: '🎬 Agnes V2.0 视频详情',
    videoFlash: '🎥 Agnes 2.5 Flash 视频详情',
    zhipuVideo: '🎬 智谱视频详情',
    img2prompt: '🔍 图转提示词详情'
  }
  return `${map[type]} · ${formatTime(record.time)}`
}

interface MediaPreviewProps {
  isVideo: boolean
  urls: string[]
  onPreview: (src: string, images?: string[]) => void
}

function MediaPreview({ isVideo, urls, onPreview }: MediaPreviewProps) {
  if (isVideo) {
    const first = urls[0]
    return (
      <video
        className="agnes-detail-video"
        src={first}
        poster={(first as unknown as Record<string, string>).poster}
        controls
        playsInline
        preload="metadata"
        onClick={(e) => { e.stopPropagation(); onPreview(first) }}
      />
    )
  }
  if (urls.length === 1) {
    return (
      <img
        className="agnes-detail-image"
        src={urls[0]}
        alt="result"
        onClick={() => onPreview(urls[0])}
      />
    )
  }
  return (
    <div className="agnes-detail-grid">
      {urls.map((u, i) => (
        <img
          key={`${u}-${i}`}
          className="agnes-detail-grid-image"
          src={u}
          alt={`result-${i}`}
          onClick={() => onPreview(u, urls)}
        />
      ))}
    </div>
  )
}

interface Img2PromptBodyProps {
  record: Img2PromptHistoryItem
  onPreview: (src: string) => void
}

function Img2PromptBody({ record, onPreview }: Img2PromptBodyProps) {
  return (
    <>
      {record.imageUrl && (
        <img
          className="agnes-detail-image"
          src={record.imageUrl}
          alt="input"
          onClick={() => onPreview(record.imageUrl)}
        />
      )}
      {record.prompt && (
        <div className="agnes-detail-field agnes-detail-prompt-field">
          <div className="agnes-detail-prompt-header">
            <span className="agnes-detail-label">📝 生成的提示词</span>
          </div>
          <div className="agnes-detail-value-long">{record.prompt}</div>
        </div>
      )}
    </>
  )
}

interface DetailFieldsProps {
  record: HistoryRecord
  recordType: HistoryRecordType
}

function DetailFields({ record, recordType }: DetailFieldsProps) {
  const fields: Array<{ label: string; value: string }> = []

  if (recordType === 'image') {
    const r = record as ImageHistoryItem
    fields.push({ label: '模型', value: r.model })
    fields.push({ label: '尺寸', value: r.size + (r.ratio ? ` · ${r.ratio}` : '') })
    if (r.urls && r.urls.length > 1) fields.push({ label: '数量', value: `${r.urls.length} 张` })
  } else if (recordType === 'video') {
    const r = record as VideoHistoryItem
    fields.push({ label: '尺寸', value: r.size })
    fields.push({ label: '时长', value: `${r.duration} 秒` })
    if (r.isKeyframeMode) fields.push({ label: '模式', value: '关键帧' })
  } else if (recordType === 'videoFlash') {
    const r = record as VideoFlashHistoryItem
    fields.push({ label: '模式', value: renderFlashMode(r.mode) })
    fields.push({ label: '画幅', value: r.aspectRatio })
    fields.push({ label: '时长', value: `${r.seconds} 秒` })
  } else if (recordType === 'zhipuVideo') {
    const r = record as ZhipuVideoHistoryItem
    fields.push({ label: '模型', value: r.model })
    fields.push({ label: '尺寸', value: r.size })
    fields.push({ label: '时长', value: `${r.duration} 秒` })
    fields.push({ label: '帧率', value: `${r.fps} fps` })
    fields.push({ label: '质量', value: r.quality })
    fields.push({ label: '音频', value: r.withAudio ? '开启' : '关闭' })
  } else if (recordType === 'img2prompt') {
    const r = record as Img2PromptHistoryItem
    if (r.lang) fields.push({ label: '语言', value: r.lang })
  }

  if (fields.length === 0 && !record.prompt) return null

  return (
    <>
      {fields.length > 0 && (
        <div className="agnes-detail-section">
          <div className="agnes-detail-section-title">⚙️ 生成参数</div>
          {fields.map((f) => (
            <div key={f.label} className="agnes-detail-field">
              <span className="agnes-detail-label">{f.label}：</span>
              <span className="agnes-detail-value">{f.value}</span>
            </div>
          ))}
        </div>
      )}
      {recordType !== 'img2prompt' && record.prompt && (
        <div className="agnes-detail-section">
          <div className="agnes-detail-section-title">📝 提示词</div>
          <div className="agnes-detail-value-long">{record.prompt}</div>
        </div>
      )}
      {(record as VideoHistoryItem).negativePrompt && (
        <div className="agnes-detail-section">
          <div className="agnes-detail-section-title">🚫 负向提示词</div>
          <div className="agnes-detail-value-long">{(record as VideoHistoryItem).negativePrompt}</div>
        </div>
      )}
    </>
  )
}

function renderFlashMode(mode: string): string {
  return { text: '文生视频', keyframe: '关键帧', reference: '参考图' }[mode] || mode
}

interface RefImagesProps {
  record: HistoryRecord
  onPreview: (src: string) => void
}

function RefImages({ record, onPreview }: RefImagesProps) {
  const r = record as unknown as Record<string, unknown>
  const collect = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.length > 0)
    if (typeof v === 'string' && v.length > 0) return [v]
    return []
  }
  const flash = record as VideoFlashHistoryItem
  const firstFrame = collect(flash.firstFrame)
  const lastFrame = collect(flash.lastFrame)
  const refImages = collect(r.refImageUrls)
  const flashImages = collect(flash.images)

  const all = [
    ...refImages.map((u) => ({ url: u, label: '参考图' })),
    ...flashImages.map((u) => ({ url: u, label: '参考图' })),
    ...firstFrame.map((u) => ({ url: u, label: '首帧' })),
    ...lastFrame.map((u) => ({ url: u, label: '尾帧' }))
  ]
  if (all.length === 0) return null
  return (
    <div className="agnes-detail-section">
      <div className="agnes-detail-section-title">🖼️ 参考素材（{all.length}）</div>
      <div className="agnes-detail-ref-image-list">
        {all.map((it, i) => (
          <div key={`${it.url}-${i}`} style={{ position: 'relative' }}>
            <img
              className="agnes-detail-ref-image"
              src={it.url}
              alt={it.label}
              onClick={() => onPreview(it.url)}
            />
            <span style={{
              position: 'absolute', bottom: 2, left: 2,
              fontSize: 10, padding: '1px 4px',
              background: 'rgba(0,0,0,0.6)', color: '#fff',
              borderRadius: 4
            }}>{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatJson(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}