/**
 * 工具函数
 */

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

/** 下载单个文件（图片或视频） */
export function downloadFile(url: string, fileName: string): void {
  if (url.startsWith('data:')) {
    const arr = url.split(',')
    const matchResult = arr[0].match(/:(.*?);/)
    const mime = matchResult ? matchResult[1] : 'image/png'
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    const blob = new Blob([u8arr], { type: mime })
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileName
    a.click()
    URL.revokeObjectURL(blobUrl)
    return
  }

  // 通过代理下载图片，绕过跨域限制
  const proxyUrl = url.replace(/^https?:\/\/platform-outputs\.agnes-ai\.space/, '/image-proxy')
  fetch(proxyUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.blob()
    })
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      a.click()
      URL.revokeObjectURL(blobUrl)
    })
    .catch(() => {
      // 代理失败时直接尝试
      fetch(url)
        .then((res) => res.blob())
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = blobUrl
          a.download = fileName
          a.click()
          URL.revokeObjectURL(blobUrl)
        })
        .catch(() => {
          // 最终 fallback：直接打开链接
          const a = document.createElement('a')
          a.href = url
          a.target = '_blank'
          a.download = fileName
          a.click()
        })
    })
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
