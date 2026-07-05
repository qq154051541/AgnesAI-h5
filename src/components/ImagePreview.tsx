import { useEffect } from 'react'

interface ImagePreviewProps {
  src: string
  onClose: () => void
}

/** 图片页内预览弹窗 */
export default function ImagePreview({ src, onClose }: ImagePreviewProps) {
  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [src, onClose])

  if (!src) return null

  return (
    <div className="agnes-image-preview-mask" onClick={onClose}>
      <button className="agnes-image-preview-close" onClick={onClose} aria-label="关闭">
        ✕
      </button>
      <img
        className="agnes-image-preview-img"
        src={src}
        alt="preview"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
