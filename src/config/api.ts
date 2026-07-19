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
  /** 尺寸值：精确尺寸（"1024x1024"）或档位（"2K"） */
  value: string
  label: string
  /** 仅限该模型使用 */
  model?: string
  /** 宽高比，仅档位式 size（如 "2K"）配合使用 */
  ratio?: string
}

/** 图片尺寸配置
 * 2.0 模型使用精确尺寸（如 1024x1024）
 * 2.1 模型使用档位+宽高比（如 size="2K" ratio="16:9"），输出更可预期
 */
export const SIZES: SizeItem[] = [
  // ===== 2.0 Flash 精确尺寸 =====
  { value: '720x1280', label: '720×1280 竖屏（9:16）' },
  { value: '1280x720', label: '1280×720 横屏（16:9）' },
  { value: '1024x1024', label: '1024×1024 （1:1）方形' },
  { value: '512x512', label: '512×512 (小方形)' },
  { value: '768x1344', label: '768×1344 (竖屏)' },
  { value: '1344x768', label: '1344×768 (横屏)' },
  { value: '1792x1024', label: '1792×1024 横屏（最大横版）' },
  { value: '1024x1792', label: '1024×1792 竖屏（最大竖版）' },
  // ===== 2.1 Flash 档位 + 宽高比 =====
  // 1K 档位
  { value: '1K', ratio: '1:1', label: '1K 1024×1024（1:1）', model: 'agnes-image-2.1-flash' },
  { value: '1K', ratio: '16:9', label: '1K 1312×736（16:9）', model: 'agnes-image-2.1-flash' },
  { value: '1K', ratio: '9:16', label: '1K 736×1312（9:16）', model: 'agnes-image-2.1-flash' },
  { value: '1K', ratio: '4:3', label: '1K 1152×864（4:3）', model: 'agnes-image-2.1-flash' },
  { value: '1K', ratio: '3:4', label: '1K 864×1152（3:4）', model: 'agnes-image-2.1-flash' },
  // 2K 档位
  { value: '2K', ratio: '1:1', label: '2K 2048×2048（1:1）', model: 'agnes-image-2.1-flash' },
  { value: '2K', ratio: '16:9', label: '2K 2624×1472（16:9）', model: 'agnes-image-2.1-flash' },
  { value: '2K', ratio: '9:16', label: '2K 1472×2624（9:16）', model: 'agnes-image-2.1-flash' },
  { value: '2K', ratio: '4:3', label: '2K 2304×1728（4:3）', model: 'agnes-image-2.1-flash' },
  { value: '2K', ratio: '3:4', label: '2K 1728×2304（3:4）', model: 'agnes-image-2.1-flash' },
  { value: '2K', ratio: '3:2', label: '2K 2496×1664（3:2）', model: 'agnes-image-2.1-flash' },
  { value: '2K', ratio: '2:3', label: '2K 1664×2496（2:3）', model: 'agnes-image-2.1-flash' },
  { value: '2K', ratio: '21:9', label: '2K 3136×1344（21:9）', model: 'agnes-image-2.1-flash' },
  // 3K 档位
  { value: '3K', ratio: '1:1', label: '3K 3072×3072（1:1）', model: 'agnes-image-2.1-flash' },
  { value: '3K', ratio: '16:9', label: '3K 3936×2208（16:9）', model: 'agnes-image-2.1-flash' },
  { value: '3K', ratio: '9:16', label: '3K 2208×3936（9:16）', model: 'agnes-image-2.1-flash' },
  // 4K 档位
  { value: '4K', ratio: '1:1', label: '4K 4096×4096（1:1）', model: 'agnes-image-2.1-flash' },
  { value: '4K', ratio: '16:9', label: '4K 5248×2944（16:9）', model: 'agnes-image-2.1-flash' },
  { value: '4K', ratio: '9:16', label: '4K 2944×5248（9:16）', model: 'agnes-image-2.1-flash' },
  { value: '4K', ratio: '4:3', label: '4K 4608×3456（4:3）', model: 'agnes-image-2.1-flash' },
  { value: '4K', ratio: '3:4', label: '4K 3456×4608（3:4）', model: 'agnes-image-2.1-flash' }
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

/** 视频时长配置（num_frames 满足 8n+1，frame_rate 固定 24）
 * 注意：720p 分辨率下 num_frames 最大 409 */
export const VIDEO_DURATIONS = [
  { value: 81, label: '约 3 秒', frameRate: 24 },
  { value: 121, label: '约 5 秒', frameRate: 24 },
  { value: 241, label: '约 10 秒', frameRate: 24 },
  { value: 409, label: '约 17 秒', frameRate: 24 }
] as const

/** 视频生成模型 */
export const VIDEO_MODEL = 'agnes-video-v2.0'

/** 图转提示词模型（主） */
export const CHAT_MODEL = 'agnes-2.5-flash'

/** 图转提示词模型（回退） */
export const CHAT_MODEL_FALLBACK = 'agnes-2.0-flash'

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
