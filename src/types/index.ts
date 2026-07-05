/**
 * 类型定义
 */

/** 图片历史记录 */
export interface ImageHistoryItem {
  id: string
  url: string
  urls: string[]
  prompt: string
  model: string
  size: string
  refImageUrls: string[]
  time: number
  responseData: unknown
}

/** 视频历史记录 */
export interface VideoHistoryItem {
  id: string
  url: string
  prompt: string
  size: string
  duration: string
  refImageUrls: string[]
  isKeyframeMode: boolean
  sizeIndex: number
  durationIndex: number
  time: number
  responseData: unknown
}

/** 图转提示词历史记录 */
export interface Img2PromptHistoryItem {
  prompt: string
  imageUrl: string
  lang: string
  time: number
}

/** 请求结果（带 abort 能力） */
export interface RequestResult<T = unknown> {
  promise: Promise<T>
  abort: () => void
}

/** API 响应基础类型 */
export interface ApiResponse<T = unknown> {
  statusCode: number
  data: T
}

/** 图片生成响应 */
export interface ImageGenerationResponse {
  data?: Array<{ url?: string; b64_json?: string }>
  error?: { message?: string }
  message?: string
}

/** 视频创建响应 */
export interface VideoCreateResponse {
  video_id?: string
  id?: string
  task_id?: string
  error?: { message?: string }
}

/** 视频查询响应 */
export interface VideoQueryResponse {
  status?: string
  progress?: number
  video_url?: string
  url?: string
  remixed_from_video_id?: string
  error?: string
}

/** Chat 响应（图转提示词） */
export interface ChatResponse {
  choices?: Array<{
    message?: { content?: string }
  }>
  error?: { message?: string }
}
