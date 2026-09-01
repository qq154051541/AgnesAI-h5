/**
 * 通用 HTTP 工具
 * 集中维护跨平台的 fetch 封装、请求头、URL 清洗、imgbb 上传
 */

import { IMGBB_UPLOAD_URL, IMGBB_AUTH_TOKEN } from '../config/api'
import type { RequestResult, ApiResponse } from '../types'

/**
 * 清理 URL，提取纯净的 http/https 地址
 * 注意：Data URI (data:image/...;base64,...) 直接原样返回，不做清理
 */
export function cleanUrl(url: string): string {
  if (url.startsWith('data:')) return url
  const safe = String(url).replace(/[^a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]/g, '')
  const match = safe.match(/https?:\/\/[a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]+/)
  return match ? match[0] : safe
}

/**
 * 构造标准 JSON 请求头（Bearer Token）
 */
export function buildJsonHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }
}

/**
 * 通用 fetch 请求封装，支持 AbortController + 超时
 */
export function fetchWithAbort(
  url: string,
  options: RequestInit,
  timeout = 120000
): RequestResult<ApiResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  const promise = fetch(url, { ...options, signal: controller.signal })
    .then(async (res) => {
      clearTimeout(timeoutId)
      const contentType = res.headers.get('content-type') || ''
      let data: unknown
      if (contentType.includes('application/json')) {
        data = await res.json()
      } else {
        const text = await res.text()
        try {
          data = JSON.parse(text)
        } catch {
          data = text
        }
      }
      return { statusCode: res.status, data }
    })
    .catch((err) => {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        throw { errMsg: '请求超时或已取消' }
      }
      throw { errMsg: err.message || '网络请求失败' }
    })

  return {
    promise,
    abort: () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }
}

/**
 * 上传图片到 imgbb，返回可直接引用的 URL
 * Data URI (base64) 直接被 imgbb 接受，无需本地中转
 */
export async function uploadToImgbb(file: File | Blob): Promise<string> {
  const formData = new FormData()
  formData.append('source', file)
  formData.append('type', 'file')
  formData.append('action', 'upload')
  formData.append('timestamp', Date.now().toString())
  formData.append('auth_token', IMGBB_AUTH_TOKEN)

  const res = await fetch(IMGBB_UPLOAD_URL, {
    method: 'POST',
    body: formData
  })

  if (res.ok) {
    const data = await res.json()
    if (data && data.image && data.image.url) {
      return cleanUrl(data.image.url)
    }
    throw new Error('上传返回数据异常')
  }
  throw new Error(`上传失败 (${res.status})`)
}