import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Modal, Notification } from 'animal-island-ui'
import {
  copyToClipboard,
  downloadFile,
  formatTime
} from '../utils/helpers'
import { useEscapeStack } from '../hooks/useEscapeStack'
import type {
  ImageHistoryItem,
  VideoHistoryItem,
  VideoFlashHistoryItem,
  ZhipuVideoHistoryItem,
  Img2PromptHistoryItem,
  SenseNovaImageHistoryItem
} from '../types'

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
function extractMedia(record: HistoryRecord, recordType: HistoryRecordType): { urls: string[]; isVideo: boolean; isImg2Prompt: boolean } {
  const r = record as unknown as Record<string, unknown>
  const collect = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.length > 0)
    if (typeof v === 'string' && v.length > 0) return [v]
    return []
  }
  const urls = collect(r.urls)?.length
    ? collect(r.urls)
    : collect(r.url)
  const isVideo = recordType !== 'image' && recordType !== 'img2prompt'
  const isImg2Prompt = recordType === 'img2prompt'
  return { urls, isVideo, isImg2Prompt }
}


function recordTypeIsVideo(_record: HistoryRecord, _r: Record<string, unknown>): boolean {
  // 已废弃，保留仅为类型兼容
  return false
}

export default function HistoryDetail({ record, recordType, onClose }: HistoryDetailProps) {
  /** 注册 Modal 关闭到全局 ESC 栈：让弹窗按层级响应 ESC */
  useEscapeStack(() => { if (record) onClose() }, !!record)
  /** 全屏看大图：-1 表示关闭；>=0 表示在 images 数组中的索引 */
  const [fullscreenIndex, setFullscreenIndex] = useState(-1)
  /** 全屏看大图的所有可切换图列表 */
  const [fullscreenImages, setFullscreenImages] = useState<string[]>([])
  /** 多图网格中选中的图片索引集合（用于批量下载） */
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set())

  const { urls: mediaUrls, isVideo, isImg2Prompt } = record
    ? extractMedia(record, recordType)
    : { urls: [] as string[], isVideo: false, isImg2Prompt: false }
  const isFailed = record?.status === 'failed' || record?.status === 'interrupted'
  const isGenerating = record?.status === 'generating'
  const responseData = (record as unknown as { responseData?: unknown } | null)?.responseData
  const fileExt = isVideo ? 'mp4' : 'png'
  /** 是否支持多选下载：多图且非视频 */
  const canMultiSelect = !isVideo && !isImg2Prompt && mediaUrls.length > 1

  /** 记录切换时清空选中状态 */
  useEffect(() => {
    setSelectedIndexes(new Set())
  }, [record?.id])

  /** 切换某张图片的选中状态 */
  const toggleSelect = useCallback((index: number) => {
    setSelectedIndexes((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  /** 全选 / 取消全选 */
  const toggleSelectAll = useCallback(() => {
    setSelectedIndexes((prev) => {
      if (prev.size === mediaUrls.length) return new Set()
      return new Set(mediaUrls.map((_, i) => i))
    })
  }, [mediaUrls])

  /** 下载当前选中的图片 */
  const handleDownloadSelected = useCallback(() => {
    if (!record || selectedIndexes.size === 0) {
      Notification.error('请先勾选要下载的图片')
      return
    }
    const sorted = Array.from(selectedIndexes).sort((a, b) => a - b)
    sorted.forEach((idx, i) => {
      const url = mediaUrls[idx]
      if (!url) return
      setTimeout(
        () => downloadFile(url, `history-${record.id}-${idx + 1}.${fileExt}`),
        i * 200
      )
    })
    Notification.success(`已开始下载 ${sorted.length} 个文件`)
  }, [record, selectedIndexes, mediaUrls, fileExt])

  /** 复制当前选中的图片地址（未选中时退化为复制全部） */
  const handleCopySelected = useCallback(async () => {
    if (mediaUrls.length === 0) {
      Notification.error('没有可复制的地址')
      return
    }
    const list = selectedIndexes.size > 0
      ? Array.from(selectedIndexes).sort((a, b) => a - b).map((i) => mediaUrls[i]).filter(Boolean)
      : mediaUrls
    if (list.length === 0) {
      Notification.error('没有可复制的地址')
      return
    }
    const ok = await copyToClipboard(list.join('\n'))
    if (ok) Notification.success(`已复制 ${list.length} 个地址`)
    else Notification.error('复制失败')
  }, [mediaUrls, selectedIndexes])

  /** 打开全屏看图：传入图片列表和点击的索引 */
  const openImagePreview = useCallback((src: string, images?: string[]) => {
    const list = images && images.length > 0 ? images : [src]
    const idx = list.indexOf(src)
    setFullscreenImages(list)
    setFullscreenIndex(idx >= 0 ? idx : 0)
  }, [])

  const closeFullscreen = useCallback(() => {
    setFullscreenIndex(-1)
    setFullscreenImages([])
  }, [])

  const prevFullscreen = useCallback(() => {
    setFullscreenIndex((i) => (i > 0 ? i - 1 : i))
  }, [])

  const nextFullscreen = useCallback(() => {
    setFullscreenIndex((i) => (i < fullscreenImages.length - 1 ? i + 1 : i))
  }, [fullscreenImages.length])

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
    if (mediaUrls.length === 1) {
      downloadFile(mediaUrls[0], `history-${record.id}.${fileExt}`)
      return
    }
    mediaUrls.forEach((url, i) => {
      setTimeout(() => downloadFile(url, `history-${record.id}-${i + 1}.${fileExt}`), i * 200)
    })
    Notification.success(`已开始下载 ${mediaUrls.length} 个文件`)
  }, [mediaUrls, fileExt, record])

  const handleDownloadOne = useCallback((url: string, index: number) => {
    if (!record) return
    const name = mediaUrls.length === 1
      ? `history-${record.id}.${fileExt}`
      : `history-${record.id}-${index + 1}.${fileExt}`
    downloadFile(url, name)
  }, [mediaUrls.length, fileExt, record])

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
      typewriter={false}
    >
      <div className="agnes-detail-popup-body">
        {/* 醒目关闭按钮 */}
        <button
          type="button"
          className="agnes-detail-close-fab"
          onClick={onClose}
          aria-label="关闭详情"
          title="关闭（Esc）"
        >
          <span className="agnes-detail-close-fab-icon">✕</span>
          <span className="agnes-detail-close-fab-label">关闭</span>
        </button>

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
            poster={(record as unknown as { coverUrl?: string }).coverUrl}
            onPreview={openImagePreview}
            onDownloadOne={handleDownloadOne}
            fileExt={fileExt}
            selectedIndexes={canMultiSelect ? selectedIndexes : undefined}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={canMultiSelect ? toggleSelectAll : undefined}
          />
        )}

        {/* 功能按钮：紧贴媒体下方 */}
        {mediaUrls.length > 0 && (
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
            <button
              type="button"
              className="agnes-result-action-btn"
              onClick={canMultiSelect && selectedIndexes.size > 0 ? handleCopySelected : handleCopyAllUrls}
            >
              <span className="agnes-result-action-icon">🔗</span>
              <span className="agnes-result-action-label">
                {canMultiSelect && selectedIndexes.size > 0
                  ? `复制选中 ${selectedIndexes.size} 个地址`
                  : mediaUrls.length > 1
                    ? `复制 ${mediaUrls.length} 个地址`
                    : '复制地址'}
              </span>
            </button>
            {canMultiSelect && selectedIndexes.size > 0 ? (
              <button
                type="button"
                className="agnes-result-action-btn agnes-result-action-primary"
                onClick={handleDownloadSelected}
              >
                <span className="agnes-result-action-icon">⬇️</span>
                <span className="agnes-result-action-label">
                  下载选中 {selectedIndexes.size} 张
                </span>
              </button>
            ) : (
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
        )}

        {/* 图转提示词：单图 + 提示词 + 复制/下载按钮 */}
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
      </div>

      {/* 全屏看大图：自管理层级，避免嵌套 portal + Modal 冲突 */}
      {fullscreenIndex >= 0 && fullscreenImages[fullscreenIndex] && (
        <FullscreenViewer
          images={fullscreenImages}
          index={fullscreenIndex}
          onPrev={prevFullscreen}
          onNext={nextFullscreen}
          onClose={closeFullscreen}
        />
      )}
    </Modal>,
    document.body
  )
}

interface FullscreenViewerProps {
  images: string[]
  index: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}

function FullscreenViewer({ images, index, onPrev, onNext, onClose }: FullscreenViewerProps) {
  /** 全屏层 ESC 关闭注册到全局栈顶，确保最上层先关 */
  useEscapeStack(onClose, true)
  /** 左右键切换：不入栈（不阻止 ESC 关闭即可） */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.stopPropagation()
        onPrev()
      } else if (e.key === 'ArrowRight') {
        e.stopPropagation()
        onNext()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true } as EventListenerOptions)
  }, [onPrev, onNext])

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        style={{
          position: 'absolute', top: 16, right: 16,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)', color: '#fff',
          border: 'none', cursor: 'pointer', fontSize: 20,
          zIndex: 2
        }}
      >
        ✕
      </button>
      {images.length > 1 && index > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPrev() }}
          aria-label="上一张"
          style={{
            position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
            width: 48, height: 48, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)', color: '#fff',
            border: 'none', cursor: 'pointer', fontSize: 24,
            zIndex: 2
          }}
        >
          ‹
        </button>
      )}
      {images.length > 1 && index < images.length - 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNext() }}
          aria-label="下一张"
          style={{
            position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
            width: 48, height: 48, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)', color: '#fff',
            border: 'none', cursor: 'pointer', fontSize: 24,
            zIndex: 2
          }}
        >
          ›
        </button>
      )}
      <img
        src={images[index]}
        alt={`预览 ${index + 1}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '92vw', maxHeight: '88vh',
          objectFit: 'contain', display: 'block',
          borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
        }}
      />
      {images.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            color: '#fff', background: 'rgba(0,0,0,0.5)',
            padding: '4px 12px', borderRadius: 16, fontSize: 13
          }}
        >
          {index + 1} / {images.length}
        </div>
      )}
    </div>,
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
  poster?: string
  onPreview: (src: string, images?: string[]) => void
  onDownloadOne: (src: string, index: number) => void
  fileExt: string
  selectedIndexes?: Set<number>
  onToggleSelect?: (index: number) => void
  onToggleSelectAll?: () => void
}

function MediaPreview({
  isVideo, urls, poster, onPreview, onDownloadOne, fileExt,
  selectedIndexes, onToggleSelect, onToggleSelectAll
}: MediaPreviewProps) {
  if (isVideo) {
    const first = urls[0]
    return (
      <video
        className="agnes-detail-video"
        src={first}
        poster={poster}
        controls
        playsInline
        preload="metadata"
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
  const selectable = !!selectedIndexes && !!onToggleSelect
  const selectedCount = selectedIndexes?.size ?? 0
  const allSelected = selectedCount === urls.length
  return (
    <>
      {selectable && onToggleSelectAll && (
        <div className="agnes-detail-grid-toolbar">
          <label className="agnes-detail-grid-selectall">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleSelectAll}
            />
            <span>{allSelected ? '取消全选' : `全选（${selectedCount}/${urls.length}）`}</span>
          </label>
        </div>
      )}
      <div className="agnes-detail-grid">
        {urls.map((u, i) => {
          const isSelected = selectedIndexes?.has(i) ?? false
          return (
            <div
              key={`${u}-${i}`}
              className={`agnes-detail-grid-cell${isSelected ? ' agnes-detail-grid-cell-selected' : ''}`}
            >
              <img
                className="agnes-detail-grid-image"
                src={u}
                alt={`result-${i}`}
                onClick={() => onPreview(u, urls)}
              />
              {selectable && onToggleSelect && (
                <label
                  className="agnes-detail-grid-checkbox"
                  title={isSelected ? '取消选中' : '选中以便下载'}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(i)}
                  />
                  <span className="agnes-detail-grid-checkbox-mark">✓</span>
                </label>
              )}

            </div>
          )
        })}
      </div>
    </>
  )
}

interface Img2PromptBodyProps {
  record: Img2PromptHistoryItem
  onPreview: (src: string) => void
}

function Img2PromptBody({ record, onPreview }: Img2PromptBodyProps) {
  const handleCopy = useCallback(async () => {
    if (!record.prompt) {
      Notification.error('该记录没有提示词')
      return
    }
    const ok = await copyToClipboard(record.prompt)
    if (ok) Notification.success('已复制提示词')
    else Notification.error('复制失败')
  }, [record.prompt])

  const handleDownloadImage = useCallback(() => {
    if (!record.imageUrl) {
      Notification.error('没有可下载的图片')
      return
    }
    const ext = record.imageUrl.startsWith('data:') ? 'png' : 'jpg'
    downloadFile(record.imageUrl, `img2prompt-input-${record.id}.${ext}`)
  }, [record.id, record.imageUrl])

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
      {record.imageUrl && (
        <div className="agnes-detail-actions">
          {record.prompt && (
            <button
              type="button"
              className="agnes-result-action-btn"
              onClick={handleCopy}
            >
              <span className="agnes-result-action-icon">📋</span>
              <span className="agnes-result-action-label">复制提示词</span>
            </button>
          )}
          <button
            type="button"
            className="agnes-result-action-btn agnes-result-action-primary"
            onClick={handleDownloadImage}
          >
            <span className="agnes-result-action-icon">⬇️</span>
            <span className="agnes-result-action-label">下载原图</span>
          </button>
        </div>
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
  onPreview: (src: string, images?: string[]) => void
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
  const allUrls = all.map((it) => it.url)
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
              onClick={() => onPreview(it.url, allUrls)}
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