/**
 * 工具函数
 */

import { Notification } from 'animal-island-ui'
import type { TaskStatus } from '../types'

/** 格式化时间 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const y = date.getFullYear()
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const d = date.getDate().toString().padStart(2, '0')
  const h = date.getHours().toString().padStart(2, '0')
  const min = date.getMinutes().toString().padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}`
}

/** 截断文本 */
export function truncateText(text: string, maxLen: number): string {
  if (!text) return ''
  if (text.length <= maxLen) return text
  return text.substring(0, maxLen) + '...'
}

/** 格式化 JSON 数据 */
export function formatResponseData(data: unknown): string {
  if (!data) return ''
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

/** 复制文本到剪贴板 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
    // Fallback
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.opacity = '0'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textArea)
    return success
  } catch {
    return false
  }
}

/** 判断是否为移动端（含 iPadOS 桌面 UA 模式） */
export function isMobileDevice(): boolean {
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    return true
  }
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/** 下载选项 */
export interface DownloadOptions {
  /** 批量下载场景：静默处理（不弹结果提示、不调用系统分享面板，避免连环弹窗） */
  silent?: boolean
}

/**
 * 下载单个文件（图片或视频）
 *
 * 体验策略：
 * - 移动端：先弹出系统分享面板（Web Share），用户确认后可直接「存储图像/视频」到相册；
 *   不支持分享则回退浏览器下载并提示保存位置
 * - PC 端：直接走浏览器下载，并 toast 告知下载已开始
 */
export async function downloadFile(url: string, fileName: string, options: DownloadOptions = {}): Promise<void> {
  const { silent = false } = options
  const isMobile = isMobileDevice()
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)
  const isVideo = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)
  const mime = isImage
    ? `image/${ext === 'jpg' ? 'jpeg' : ext || 'png'}`
    : isVideo
      ? `video/${ext || 'mp4'}`
      : 'application/octet-stream'
  const mediaLabel = isImage ? '图片' : '视频'

  // 1. 获取内容 Blob：data: URL 直接解码；远程地址优先走代理绕跨域
  let blob: Blob
  try {
    if (url.startsWith('data:')) {
      const arr = url.split(',')
      const matchResult = arr[0].match(/:(.*?);/)
      const dataMime = matchResult ? matchResult[1] : mime
      const bstr = atob(arr[1])
      let n = bstr.length
      const u8arr = new Uint8Array(n)
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n)
      }
      blob = new Blob([u8arr], { type: dataMime })
    } else {
      const proxyUrl = url.replace(/^https?:\/\/platform-outputs\.agnes-ai\.space/, '/image-proxy')
      try {
        const res = await fetch(proxyUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        blob = await res.blob()
      } catch {
        const res = await fetch(url)
        blob = await res.blob()
      }
    }
  } catch (err) {
    console.error('获取文件内容失败:', err)
    if (!silent) Notification.error('下载失败：无法获取文件内容')
    return
  }

  // 2. 移动端：优先系统分享面板（用户确认后可存储到相册）
  if (isMobile && !silent && navigator.canShare) {
    try {
      const file = new File([blob], fileName, { type: mime })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `保存${mediaLabel}` })
        Notification.success('已调出保存面板，选择「存储照片/视频」即可保存到相册')
        return
      }
    } catch (shareErr) {
      // 用户取消分享属正常行为，静默返回
      if ((shareErr as Error).name === 'AbortError') return
      // 其他错误继续走浏览器下载兜底
    }
  }

  // 3. 通用浏览器下载
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)

  if (!silent) {
    Notification.success(
      isMobile
        ? `${mediaLabel}已开始下载，可在浏览器「下载记录」中查看；安卓用户可在相册找到`
        : `已开始下载：${fileName}`
    )
  }
}

/** 修复从 localStorage 恢复的历史状态：残留「生成中」标记为「已中断」（刷新或关闭页面所致） */
export function normalizeHistoryOnLoad<T extends { status?: TaskStatus; failReason?: string }>(items: T[]): T[] {
  return items.map((item) =>
    item.status === 'generating'
      ? { ...item, status: 'interrupted' as TaskStatus, failReason: item.failReason || '页面刷新或关闭导致中断' }
      : item
  )
}

/** localStorage 读取 */
export function getStorage<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key)
    if (value) {
      return JSON.parse(value) as T
    }
  } catch {
    // ignore
  }
  return null
}

/** localStorage 写入 */
export function setStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

/** 图片最大边长（超过则等比缩放），避免 Data URI 过大 */
const MAX_IMAGE_DIMENSION = 4096

/**
 * 通过 Image 元素 + Canvas 将图片转换为 JPEG Data URI
 * 适用于浏览器原生支持的格式（JPEG/PNG/WebP/GIF 以及 Safari 上的 HEIC）
 */
function convertViaCanvas(file: File, maxDimension = MAX_IMAGE_DIMENSION): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        URL.revokeObjectURL(objectUrl)
        let { naturalWidth: w, naturalHeight: h } = img
        // 等比缩放，确保不超过最大边长
        if (w > maxDimension || h > maxDimension) {
          if (w >= h) {
            h = Math.round((h / w) * maxDimension)
            w = maxDimension
          } else {
            w = Math.round((w / h) * maxDimension)
            h = maxDimension
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('无法获取 Canvas 上下文'))
          return
        }
        // 白色背景（处理透明 PNG）
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        const dataUri = canvas.toDataURL('image/jpeg', 0.92)
        if (dataUri && dataUri.length > 100) {
          resolve(dataUri)
        } else {
          reject(new Error('Canvas 转换结果为空'))
        }
      } catch (err) {
        URL.revokeObjectURL(objectUrl)
        reject(err)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('浏览器无法解码该图片格式'))
    }
    img.src = objectUrl
  })
}

/**
 * 检查文件是否为 HEIC/HEIF 格式
 * 通过读取文件头 magic bytes 判断（不依赖 file.type，因为某些系统会误报为 image/jpeg）
 */
async function isHeicFile(file: File): Promise<boolean> {
  // 1. 检查文件扩展名
  const ext = file.name.toLowerCase().split('.').pop() || ''
  if (ext === 'heic' || ext === 'heif') return true

  // 2. 检查 MIME 类型
  if (file.type === 'image/heic' || file.type === 'image/heif') return true

  // 3. 检查文件头 magic bytes（最可靠）
  try {
    const buffer = await file.slice(0, 16).arrayBuffer()
    const bytes = new Uint8Array(buffer)
    // HEIC/HEIF ftyp box: 偏移 4-7 为 "ftyp"，偏移 8-11 为 brand
    if (bytes.length >= 12) {
      const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7])
      const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
      if (ftyp === 'ftyp' && ['heic', 'heix', 'mif1', 'hevc', 'hevx', 'msf1'].includes(brand)) {
        return true
      }
    }
  } catch {
    // 读取失败，忽略
  }

  return false
}

/**
 * 将任意图片文件转换为 JPEG 格式的 Data URI
 *
 * 转换流程：
 * 1. 先尝试 Canvas 方式（适用于 JPEG/PNG/WebP/GIF 以及 Safari 上的 HEIC）
 * 2. 如果 Canvas 失败，检测是否为 HEIC 格式
 * 3. 如果是 HEIC，动态加载 heic2any 库进行转换
 * 4. 如果以上都失败，回退到 FileReader（可能仍然失败，但保留原始数据）
 *
 * @param file 图片文件
 * @param maxDimension 最大边长（默认 4096），超过会等比缩放
 * @returns JPEG 格式的 Data URI 字符串
 */
export async function fileToJpegDataUri(
  file: File,
  maxDimension = MAX_IMAGE_DIMENSION
): Promise<string> {
  // 1. 尝试 Canvas 转换
  try {
    return await convertViaCanvas(file, maxDimension)
  } catch {
    // Canvas 失败，继续尝试 HEIC 专用解码
  }

  // 2. 检测 HEIC 格式
  if (await isHeicFile(file)) {
    try {
      // 动态加载 heic2any（仅在需要时加载，不影响首屏体积）
      const heic2any = (await import('heic2any')).default
      const result = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.92
      })
      const blob = Array.isArray(result) ? result[0] : result
      // 如果 heic2any 输出的图片仍然过大，再用 Canvas 缩放
      try {
        return await convertViaCanvas(blob as File, maxDimension)
      } catch {
        // Canvas 缩放失败，直接用 FileReader 读取
      }
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('HEIC 转换后读取失败'))
        reader.readAsDataURL(blob)
      })
    } catch {
      throw new Error('HEIC 图片转换失败，请尝试使用 JPG 或 PNG 格式')
    }
  }

  // 3. 最终回退：直接用 FileReader（保留原始数据，虽然服务端可能仍然无法识别）
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}
