/**
 * API 配置文件
 * 集中管理所有接口地址和参数
 */

/** API 基础地址 */
export const API_BASE_URL = 'https://apihub.agnes-ai.cn'

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

  { value: 'agnes-image-2.1-flash', label: 'Agnes Image 2.1 Flash' },
  { value: 'agnes-image-2.5-flash', label: 'Agnes Image 2.5 Flash' }
] as const

/** 图片尺寸配置项 */
export interface SizeItem {
  /** 尺寸值：精确尺寸（"1024x1024"）或档位（"2K"） */
  value: string
  label: string
  /** 仅限该模型（或模型数组）使用 */
  model?: string | string[]
  /** 宽高比，仅档位式 size（如 "2K"）配合使用 */
  ratio?: string
}

/** 图片尺寸配置
 * 2.1 / 2.5 模型使用档位+宽高比（如 size="2K" ratio="16:9"），输出更可预期
 */
export const SIZES: SizeItem[] = [
  // ===== 2.1 / 2.5 Flash 档位 + 宽高比 =====
  // 1K 档位
  { value: '1K', ratio: '1:1', label: '1K 1024×1024（1:1）⬛ 方形', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  { value: '1K', ratio: '16:9', label: '1K 1312×736（16:9）📺 横屏', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  { value: '1K', ratio: '9:16', label: '1K 736×1312（9:16）📱 竖屏', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  { value: '1K', ratio: '4:3', label: '1K 1152×864（4:3）📺 横屏', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  { value: '1K', ratio: '3:4', label: '1K 864×1152（3:4）📱 竖屏', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  // 2K 档位
  { value: '2K', ratio: '1:1', label: '2K 2048×2048（1:1）⬛ 方形', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  { value: '2K', ratio: '16:9', label: '2K 2624×1472（16:9）📺 横屏', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  { value: '2K', ratio: '9:16', label: '2K 1472×2624（9:16）📱 竖屏', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  { value: '2K', ratio: '4:3', label: '2K 2304×1728（4:3）📺 横屏', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  { value: '2K', ratio: '3:4', label: '2K 1728×2304（3:4）📱 竖屏', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  { value: '2K', ratio: '3:2', label: '2K 2496×1664（3:2）📺 横屏', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  { value: '2K', ratio: '2:3', label: '2K 1664×2496（2:3）📱 竖屏', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  { value: '2K', ratio: '21:9', label: '2K 3136×1344（21:9）↔️ 超宽', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  // 3K 档位
  { value: '3K', ratio: '1:1', label: '3K 3072×3072（1:1）⬛ 方形', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  { value: '3K', ratio: '16:9', label: '3K 3936×2208（16:9）📺 横屏', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  { value: '3K', ratio: '9:16', label: '3K 2208×3936（9:16）📱 竖屏', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  // 4K 档位
  { value: '4K', ratio: '1:1', label: '4K 4096×4096（1:1）⬛ 方形', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  { value: '4K', ratio: '16:9', label: '4K 5248×2944（16:9）📺 横屏', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  { value: '4K', ratio: '9:16', label: '4K 2944×5248（9:16）📱 竖屏', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  { value: '4K', ratio: '4:3', label: '4K 4608×3456（4:3）📺 横屏', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] },
  { value: '4K', ratio: '3:4', label: '4K 3456×4608（3:4）📱 竖屏', model: ['agnes-image-2.1-flash', 'agnes-image-2.5-flash'] }
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
  { value: '1152x768', label: '1152×768 (3:2) 📺 横屏', orientation: 'landscape' as const },
  { value: '768x1152', label: '768×1152 (2:3) 📱 竖屏', orientation: 'portrait' as const },
  { value: '1280x720', label: '1280×720 (16:9) 📺 横屏', orientation: 'landscape' as const },
  { value: '720x1280', label: '720×1280 (9:16) 📱 竖屏', orientation: 'portrait' as const }
] as const

/** 视频时长配置（num_frames 满足 8n+1，frame_rate 固定 24）
 * 注意：720p 分辨率下 num_frames 最大 409；
 * 实际时长 ≈ (num_frames - 1) / frame_rate 秒 */
export const VIDEO_DURATIONS = [
  { value: 73, label: '3 秒', frameRate: 24 },
  { value: 97, label: '4 秒', frameRate: 24 },
  { value: 121, label: '5 秒', frameRate: 24 },
  { value: 145, label: '6 秒', frameRate: 24 },
  { value: 169, label: '7 秒', frameRate: 24 },
  { value: 193, label: '8 秒', frameRate: 24 },
  { value: 217, label: '9 秒', frameRate: 24 },
  { value: 241, label: '10 秒', frameRate: 24 },
  { value: 265, label: '11 秒', frameRate: 24 },
  { value: 289, label: '12 秒', frameRate: 24 },
  { value: 313, label: '13 秒', frameRate: 24 },
  { value: 337, label: '14 秒', frameRate: 24 },
  { value: 361, label: '15 秒', frameRate: 24 },
  { value: 385, label: '16 秒', frameRate: 24 },
  { value: 409, label: '17 秒', frameRate: 24 }
] as const

/** 视频生成模型 */
export const VIDEO_MODEL = 'agnes-video-v2.0'

/* ===== Agnes Video 2.5 Flash 专属配置 ===== */

/** 视频生成模型（Flash 版） */
export const VIDEO_MODEL_FLASH = 'agnes-video-2.5-flash'

/** Flash 固定尺寸档位，仅支持 "720P" */
export const VIDEO_FLASH_SIZE = '720P'

/** Flash 画幅配置（通过 aspect_ratio 选择输出像素，size 固定 720P） */
export const VIDEO_FLASH_ASPECT_RATIOS = [
  { value: '21:9', label: '21:9 (1680×720) ↔️ 超宽', orientation: 'ultrawide' as const },
  { value: '16:9', label: '16:9 (1280×720) 📺 横屏', orientation: 'landscape' as const },
  { value: '4:3', label: '4:3 (960×720) 📺 横屏', orientation: 'landscape' as const },
  { value: '1:1', label: '1:1 (720×720) ⬛ 方形', orientation: 'square' as const },
  { value: '3:4', label: '3:4 (720×960) 📱 竖屏', orientation: 'portrait' as const },
  { value: '9:16', label: '9:16 (720×1280) 📱 竖屏', orientation: 'portrait' as const }
] as const

/** Flash 时长配置（seconds 为字符串 "4"-"12"，默认 "5"） */
export const VIDEO_FLASH_DURATIONS = [
  { value: '4', label: '4 秒' },
  { value: '5', label: '5 秒' },
  { value: '6', label: '6 秒' },
  { value: '7', label: '7 秒' },
  { value: '8', label: '8 秒' },
  { value: '9', label: '9 秒' },
  { value: '10', label: '10 秒' },
  { value: '11', label: '11 秒' },
  { value: '12', label: '12 秒' }

] as const

/** Flash 生成模式 */
export const VIDEO_FLASH_MODES = [
  { value: 'text', label: '文生视频' },
  { value: 'keyframe', label: '首尾帧控制' },
  { value: 'reference', label: '图片/音频参考' }
] as const

/** Flash 参考图最大数量 */
export const VIDEO_FLASH_MAX_IMAGES = 5

/** 图转提示词模型（agnes-2.0-flash 已废弃，不再作为兼容回退） */
export const CHAT_MODEL = 'agnes-2.5-flash'

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
  VIDEO_HISTORY_FLASH: 'agnes_video_history_flash',
  IMG2PROMPT_HISTORY: 'agnes_img2prompt_history',
  THEME: 'agnes_theme'
} as const
