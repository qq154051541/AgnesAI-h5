import { useEffect, useRef, useState, useCallback } from 'react'

interface ImagePreviewProps {
  /** 单张或多张图片 URL */
  src: string
  /** 多图列表（可选），传入后支持左右切换 */
  images?: string[]
  /** 初始展示的图片索引 */
  initialIndex?: number
  onClose: () => void
}

/** 图片页内预览弹窗（支持多图切换 + 缩放） */
export default function ImagePreview({ src, images, initialIndex = 0, onClose }: ImagePreviewProps) {
  const list = images && images.length > 0 ? images : [src]
  const [index, setIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)
  const [translateX, setTranslateX] = useState(0)
  const [translateY, setTranslateY] = useState(0)

  const scaleRef = useRef(1)
  const listRef = useRef(list)
  listRef.current = list
  // touch state
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null)
  const pinchStartRef = useRef<{ dist: number; scale: number } | null>(null)
  const draggingRef = useRef(false)

  const currentSrc = list[index] || src

  const reset = useCallback(() => {
    setScale(1)
    scaleRef.current = 1
    setTranslateX(0)
    setTranslateY(0)
  }, [])

  // 切换图片时重置缩放
  useEffect(() => {
    reset()
  }, [index, reset])

  // src 变化时（打开新预览）重置 index，不依赖 index 避免循环
  useEffect(() => {
    if (!src) return
    setIndex(initialIndex)
    reset()
  }, [src, initialIndex, reset])

  // ESC 关闭 + 键盘左右切换
  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') setIndex((i) => (i > 0 ? i - 1 : i))
      else if (e.key === 'ArrowRight') setIndex((i) => (i < listRef.current.length - 1 ? i + 1 : i))
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [src, onClose])

  const prev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i))
  }, [])

  const next = useCallback(() => {
    setIndex((i) => (i < listRef.current.length - 1 ? i + 1 : i))
  }, [])

  // 双击缩放
  const lastTapRef = useRef(0)
  const onImgClick = useCallback(() => {
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      const newScale = scaleRef.current > 1 ? 1 : 2.5
      setScale(newScale)
      scaleRef.current = newScale
      if (newScale <= 1) {
        setTranslateX(0)
        setTranslateY(0)
      }
    }
    lastTapRef.current = now
  }, [])

  // 触摸事件处理
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const s = scaleRef.current
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      pinchStartRef.current = { dist: Math.hypot(dx, dy), scale: s }
      draggingRef.current = false
    } else if (e.touches.length === 1) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      draggingRef.current = s > 1
    }
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const newScale = Math.max(1, Math.min(5, (pinchStartRef.current.scale * dist) / pinchStartRef.current.dist))
      setScale(newScale)
      scaleRef.current = newScale
      if (newScale <= 1) {
        setTranslateX(0)
        setTranslateY(0)
      }
    } else if (e.touches.length === 1 && draggingRef.current && lastTouchRef.current) {
      e.preventDefault()
      const dx = e.touches[0].clientX - lastTouchRef.current.x
      const dy = e.touches[0].clientY - lastTouchRef.current.y
      setTranslateX((prev) => prev + dx)
      setTranslateY((prev) => prev + dy)
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
  }, [])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      // 滑动切换（仅在未拖拽且未缩放时）
      if (!draggingRef.current && touchStartRef.current && scaleRef.current <= 1) {
        const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartRef.current.x
        if (Math.abs(dx) > 50) {
          if (dx > 0) prev()
          else next()
        }
      }
      touchStartRef.current = null
      lastTouchRef.current = null
      pinchStartRef.current = null
      draggingRef.current = false
    }
  }, [prev, next])

  if (!src) return null

  return (
    <div className="agnes-image-preview-mask" onClick={onClose}>
      <button className="agnes-image-preview-close" onClick={onClose} aria-label="关闭">
        ✕
      </button>

      {/* 左右箭头 */}
      {list.length > 1 && index > 0 && (
        <button
          className="agnes-image-preview-nav agnes-image-preview-prev"
          onClick={(e) => { e.stopPropagation(); prev() }}
          aria-label="上一张"
        >
          ‹
        </button>
      )}
      {list.length > 1 && index < list.length - 1 && (
        <button
          className="agnes-image-preview-nav agnes-image-preview-next"
          onClick={(e) => { e.stopPropagation(); next() }}
          aria-label="下一张"
        >
          ›
        </button>
      )}

      <img
        className="agnes-image-preview-img"
        src={currentSrc}
        alt="preview"
        style={{
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          transition: draggingRef.current ? 'none' : 'transform 0.2s ease'
        }}
        onClick={(e) => { e.stopPropagation(); onImgClick() }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />

      {/* 指示器 */}
      {list.length > 1 && (
        <div className="agnes-image-preview-indicator" onClick={(e) => e.stopPropagation()}>
          {index + 1} / {list.length}
        </div>
      )}
    </div>
  )
}
