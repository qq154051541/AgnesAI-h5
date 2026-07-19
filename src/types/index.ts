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
  /** 精确尺寸（如 "1024x1024"）或档位（如 "2K"） */
  size: string
  /** 宽高比，仅档位式 size 时存在 */
  ratio?: string
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

/* ===== SenseNova 相关类型 ===== */

/** 内容块类型（多模态消息） */
export interface SenseNovaContentBlock {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

/** SenseNova 消息 */
export interface SenseNovaMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | SenseNovaContentBlock[]
}

/** 聊天历史中的单条展示消息 */
export interface SenseNovaChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  imageUrl?: string
  reasoningContent?: string
  model: string
  time: number
}

/** SenseNova 聊天历史记录 */
export interface SenseNovaChatHistoryItem {
  id: string
  model: string
  messages: SenseNovaChatMessage[]
  reasoningEffort: string
  time: number
}

/** SenseNova 图片历史记录 */
export interface SenseNovaImageHistoryItem {
  id: string
  url: string
  urls?: string[]
  prompt: string
  size: string
  model: string
  time: number
  responseData: unknown
}

/** 智谱视频生成历史记录 */
export interface ZhipuVideoHistoryItem {
  id: string
  taskId: string
  url: string
  coverUrl?: string
  prompt: string
  model: string
  size: string
  duration: number
  fps: number
  quality: string
  withAudio: boolean
  refImageUrls: string[]
  isKeyframeMode: boolean
  sizeIndex: number
  durationIndex: number
  fpsIndex: number
  qualityIndex: number
  time: number
  responseData: unknown
}

/** 流式回调 */
export interface StreamCallbacks {
  onContent: (chunk: string) => void
  onReasoning?: (chunk: string) => void
  onDone?: () => void
  onError?: (err: string) => void
}
