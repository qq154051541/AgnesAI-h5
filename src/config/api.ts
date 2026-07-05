/**
 * API 配置文件
 * 集中管理所有接口地址和参数
 */

/** API 基础地址 */
export const API_BASE_URL = 'https://apihub.agnes-ai.com'

/** 图片上传基础地址 */
export const IMGBB_UPLOAD_URL = 'https://imgbb.com/json'

/** imgbb 上传认证 token */
export const IMGBB_AUTH_TOKEN = 'b065dc4094117830e8900b7fa9d2128779736248'

/** 接口路径 */
export const API_PATHS = {
  /** 图片生成 */
  IMAGE_GENERATIONS: '/v1/images/generations',
  /** 视频生成 */
  VIDEOS: '/v1/videos',
  /** 视频查询（需拼接 video_id 参数） */
  VIDEO_QUERY: '/agnesapi',
  /** 对话补全（图转提示词） */
  CHAT_COMPLETIONS: '/v1/chat/completions'
} as const

/** 模型配置 */
export const MODELS = [
  { value: 'agnes-image-2.0-flash', label: 'Agnes Image 2.0 Flash' },
  { value: 'agnes-image-2.1-flash', label: 'Agnes Image 2.1 Flash' }
] as const

/** 图片尺寸配置项 */
export interface SizeItem {
  value: string
  label: string
  model?: string
}

/** 图片尺寸配置 */
export const SIZES: SizeItem[] = [
  { value: '720x1280', label: '720×1280 竖屏（9:16）' },
  { value: '1280x720', label: '1280×720 横屏（16:9）' },
  { value: '1024x1024', label: '1024×1024 （1:1）方形' },
  { value: '512x512', label: '512×512 (小方形)' },
  { value: '768x1344', label: '768×1344 (竖屏)' },
  { value: '1344x768', label: '1344×768 (横屏)' },
  { value: '1792x1024', label: '1792×1024 横屏（最大横版）' },
  { value: '1024x1792', label: '1024×1792 竖屏（最大竖版）' },
  { value: '5248x2944', label: '5248×2944 （4K横屏）', model: 'agnes-image-2.1-flash' },
  { value: '2944x5248', label: '2944×5248 （4K竖屏）', model: 'agnes-image-2.1-flash' }
]

/** 图片生成数量配置 */
export const IMAGE_COUNTS = [
  { value: 1, label: '1 张' },
  { value: 3, label: '3 张' },
  { value: 6, label: '6 张' },
  { value: 9, label: '9 张' }
] as const

/** 视频尺寸配置 */
export const VIDEO_SIZES = [
  { value: '1152x768', label: '1152×768 横屏（3:2）' },
  { value: '768x1152', label: '768×1152 竖屏（2:3）' },
  { value: '1280x720', label: '1280×720 横屏（16:9）' },
  { value: '720x1280', label: '720×1280 竖屏（9:16）' }
] as const

/** 视频时长配置（num_frames 满足 8n+1，frame_rate 固定 24） */
export const VIDEO_DURATIONS = [
  { value: 81, label: '约 3 秒', frameRate: 24 },
  { value: 121, label: '约 5 秒', frameRate: 24 },
  { value: 241, label: '约 10 秒', frameRate: 24 },
  { value: 441, label: '约 18 秒', frameRate: 24 }
] as const

/** 视频生成模型 */
export const VIDEO_MODEL = 'agnes-video-v2.0'

/** 图转提示词模型 */
export const CHAT_MODEL = 'agnes-2.0-flash'

/** 图转提示词 - 中文系统提示词 */
export const IMG2PROMPT_SYSTEM_ZH =
  '你是顶级图片prompt生成小助手，接收参考图片后输出适配Agnes-Image的中文生成提示词，严格按固定结构顺序书写：[主体] + [场景 / 环境] + [艺术风格] + [光照] + [构图] + [质量标准]，描述词汇详尽完整，完整还原原图视觉效果，仅输出纯提示文本，禁止额外说明、注释、多余文字'

/** 图转提示词 - 英文系统提示词 */
export const IMG2PROMPT_SYSTEM_EN =
  'You are a top-tier image prompt generator. After receiving a reference image, output an English generation prompt adapted for Agnes-Image, strictly following this structure: [Subject] + [Scene / Environment] + [Art Style] + [Lighting] + [Composition] + [Quality Standard]. Use exhaustive and complete descriptive vocabulary to fully reproduce the original visual effect. Output only pure prompt text. No additional explanations, annotations, or extra text.'

/** 图转提示词 - 中文用户文本 */
export const IMG2PROMPT_USER_ZH = '将上传参考图片转换为适配Agnes-Image的中文生成提示词'

/** 图转提示词 - 英文用户文本 */
export const IMG2PROMPT_USER_EN = 'Convert the uploaded reference image into an English generation prompt adapted for Agnes-Image'

/** 本地存储 key */
export const STORAGE_KEYS = {
  API_KEY: 'agnes_api_key',
  IMAGE_HISTORY: 'agnes_history',
  VIDEO_HISTORY: 'agnes_video_history',
  IMG2PROMPT_HISTORY: 'agnes_img2prompt_history'
} as const
