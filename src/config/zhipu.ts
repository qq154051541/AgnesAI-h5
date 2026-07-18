/**
 * 智谱 AI（ZhipuAI / BigModel）配置文件
 * 集中管理 GLM 系列模型的接口地址、模型和参数
 * 文档：https://docs.bigmodel.cn/llms.txt
 */

/** 智谱 AI API 基础地址
 * 开发环境通过 Vite 代理 /zhipu-api → https://open.bigmodel.cn
 * 生产环境需在 Web 服务器（nginx 等）配置相同的代理规则
 */
export const ZHIPU_BASE_URL = '/zhipu-api/api/paas/v4'

/** 智谱 AI 接口路径 */
export const ZHIPU_PATHS = {
  /** 对话补全（GLM-4.7-Flash 等） */
  CHAT_COMPLETIONS: '/chat/completions',
  /** 图片生成（CogView-3-Flash） */
  IMAGE_GENERATIONS: '/images/generations',
  /** 视频生成（cogvideox-flash，异步） */
  VIDEO_GENERATIONS: '/videos/generations',
  /** 查询异步任务结果 */
  ASYNC_RESULT: '/async-result'
} as const

/** 模型类型 */
export type ZhipuModelType = 'chat' | 'vision' | 'image' | 'video'

/** 模型配置项 */
export interface ZhipuModelItem {
  value: string
  label: string
  type: ZhipuModelType
  description: string
  contextLength?: string
  maxOutput?: string
  /** 是否支持图片输入（多模态） */
  supportsImage?: boolean
}

/** 智谱 AI 模型列表 */
export const ZHIPU_MODELS: ZhipuModelItem[] = [
  {
    value: 'glm-4.7-flash',
    label: 'GLM-4.7-Flash',
    type: 'chat',
    description:
      '30B 级 SOTA 模型，面向 Agentic Coding 场景强化了编码能力、长程任务规划与工具协同。支持深度思考模式、流式输出、Function Call 与结构化输出。',
    contextLength: '200K',
    maxOutput: '128K'
  },
  {
    value: 'glm-4.6v-flash',
    label: 'GLM-4.6V-Flash',
    type: 'vision',
    description:
      '多模态视觉理解模型，支持图片/视频/文件输入，视觉理解精度达同参数规模 SOTA。支持深度思考模式、流式输出与原生 Function Call，适用于图片 OCR、视频理解、文档问答等场景。',
    contextLength: '128K',
    supportsImage: true
  },
  {
    value: 'cogview-3-flash',
    label: 'CogView-3-Flash',
    type: 'image',
    description:
      '免费文生图模型，根据文本描述生成高质量图像，支持多种分辨率。推理速度快，适用于艺术创作、设计参考、PPT 配图、游戏开发等场景。'
  },
  {
    value: 'cogvideox-flash',
    label: 'cogvideox-flash',
    type: 'video',
    description:
      '视频生成模型（异步），支持文生视频、图生视频、首尾帧生视频。最高支持 4K 分辨率，可选 30/60 FPS、5/10 秒时长，支持 AI 音效生成。'
  }
]

/** 思考模式选项
 * thinking.type: enabled 启用深度思考 / disabled 关闭
 */
export const ZHIPU_THINKING_MODES = [
  { value: 'disabled', label: '关闭思考' },
  { value: 'enabled', label: '启用深度思考' }
] as const

/** 本地存储 key */
export const ZHIPU_STORAGE_KEYS = {
  API_KEY: 'zhipu_api_key',
  /** GLM-4.7-Flash 聊天历史 */
  CHAT_HISTORY_GLM47: 'zhipu_chat_history',
  /** GLM-4.6V-Flash 聊天历史 */
  CHAT_HISTORY_GLM46V: 'zhipu_chat_history_glm46v',
  /** GLM-4.7-Flash 当前对话内容（切换 Tab 不丢失） */
  CHAT_MESSAGES_GLM47: 'zhipu_chat_messages',
  /** GLM-4.6V-Flash 当前对话内容 */
  CHAT_MESSAGES_GLM46V: 'zhipu_chat_messages_glm46v',
  /** GLM-4.7-Flash 系统提示词 */
  SYSTEM_PROMPT_GLM47: 'zhipu_system_prompt',
  /** GLM-4.6V-Flash 系统提示词 */
  SYSTEM_PROMPT_GLM46V: 'zhipu_system_prompt_glm46v',
  /** CogView-3-Flash 生图历史 */
  IMAGE_HISTORY: 'zhipu_image_history',
  /** GLM-4.6V-Flash 图转提示词历史 */
  IMG2PROMPT_HISTORY: 'zhipu_img2prompt_history',
  /** cogvideox-flash 视频生成历史 */
  VIDEO_HISTORY: 'zhipu_video_history'
} as const

/** 根据模型 value 获取对应的存储 key */
export function getZhipuStorageKeys(modelValue: string) {
  const isVision = modelValue === 'glm-4.6v-flash'
  return {
    historyKey: isVision ? ZHIPU_STORAGE_KEYS.CHAT_HISTORY_GLM46V : ZHIPU_STORAGE_KEYS.CHAT_HISTORY_GLM47,
    chatMessagesKey: isVision ? ZHIPU_STORAGE_KEYS.CHAT_MESSAGES_GLM46V : ZHIPU_STORAGE_KEYS.CHAT_MESSAGES_GLM47,
    systemPromptKey: isVision ? ZHIPU_STORAGE_KEYS.SYSTEM_PROMPT_GLM46V : ZHIPU_STORAGE_KEYS.SYSTEM_PROMPT_GLM47
  }
}

/** CogView-3-Flash 图片尺寸配置（支持多种分辨率） */
export const ZHIPU_IMAGE_SIZES = [
  { value: '1024x1024', label: '1024×1024 （1:1）方形', ratio: '1:1' },
  { value: '768x1344', label: '768×1344 （9:16）竖屏', ratio: '9:16' },
  { value: '864x1152', label: '864×1152 （3:4）竖屏', ratio: '3:4' },
  { value: '1344x768', label: '1344×768 （16:9）横屏', ratio: '16:9' },
  { value: '1152x864', label: '1152×864 （4:3）横屏', ratio: '4:3' },
  { value: '1440x720', label: '1440×720 （2:1）横屏', ratio: '2:1' },
  { value: '720x1440', label: '720×1440 （1:2）竖屏', ratio: '1:2' }
]

/** CogView-3-Flash 图片生成模型 */
export const ZHIPU_IMAGE_MODEL = 'cogview-3-flash'

/** cogvideox-flash 视频生成模型（异步接口） */
export const ZHIPU_VIDEO_MODEL = 'cogvideox-flash'

/** cogvideox-flash 视频尺寸配置（支持多种分辨率，最高 4K） */
export const ZHIPU_VIDEO_SIZES = [
  { value: '1920x1080', label: '1920×1080（16:9）横屏', ratio: '16:9' },
  { value: '1080x1920', label: '1080×1920（9:16）竖屏', ratio: '9:16' },
  { value: '1024x1024', label: '1024×1024（1:1）方形', ratio: '1:1' },
  { value: '1280x720', label: '1280×720（16:9）横屏', ratio: '16:9' },
  { value: '720x1280', label: '720×1280（9:16）竖屏', ratio: '9:16' },
  { value: '2048x1080', label: '2048×1080（17:9）超宽', ratio: '17:9' },
  { value: '3840x2160', label: '3840×2160（16:9）4K', ratio: '16:9' }
]

/** cogvideox-flash 视频时长配置 */
export const ZHIPU_VIDEO_DURATIONS = [
  { value: 5, label: '约 5 秒' },
  { value: 10, label: '约 10 秒' }
]

/** cogvideox-flash 视频帧率配置 */
export const ZHIPU_VIDEO_FPS = [
  { value: 30, label: '30 FPS' },
  { value: 60, label: '60 FPS' }
]

/** cogvideox-flash 输出模式 */
export const ZHIPU_VIDEO_QUALITY = [
  { value: 'speed', label: '速度优先' },
  { value: 'quality', label: '质量优先' }
] as const

/** cogvideox-flash 视频生成轮询间隔（毫秒） */
export const ZHIPU_VIDEO_POLL_INTERVAL = 5000

/** GLM-4.6V-Flash 视觉理解模型（图转提示词使用） */
export const ZHIPU_VISION_MODEL = 'glm-4.6v-flash'

/** 图转提示词 - 中文系统提示词
 * 适配 CogView-3-Flash 文生图模型，输出结构化提示词
 */
export const ZHIPU_IMG2PROMPT_SYSTEM_ZH =
  '你是顶级图片prompt生成小助手，接收参考图片后输出适配CogView-3-Flash的中文生成提示词，严格按固定结构顺序书写：[主体] + [场景 / 环境] + [艺术风格] + [光照] + [构图] + [质量标准]，描述词汇详尽完整，完整还原原图视觉效果，仅输出纯提示文本，禁止额外说明、注释、多余文字'

/** 图转提示词 - 英文系统提示词 */
export const ZHIPU_IMG2PROMPT_SYSTEM_EN =
  'You are a top-tier image prompt generator. After receiving a reference image, output an English generation prompt adapted for CogView-3-Flash, strictly following this structure: [Subject] + [Scene / Environment] + [Art Style] + [Lighting] + [Composition] + [Quality Standard]. Use exhaustive and complete descriptive vocabulary to fully reproduce the original visual effect. Output only pure prompt text. No additional explanations, annotations, or extra text.'

/** 图转提示词 - 中文用户文本 */
export const ZHIPU_IMG2PROMPT_USER_ZH = '将上传参考图片转换为适配CogView-3-Flash的中文生成提示词'

/** 图转提示词 - 英文用户文本 */
export const ZHIPU_IMG2PROMPT_USER_EN = 'Convert the uploaded reference image into an English generation prompt adapted for CogView-3-Flash'

/** 智谱 AI 接口并发限制
 * CogView-3-Flash、GLM-4.6V-Flash、GLM-4.7-Flash 三个模型均限制并发数为 1：
 * - 图片生成（CogView-3-Flash）：多张图串行请求，前一张完成后再发下一张
 * - 对话（GLM-4.7-Flash / GLM-4.6V-Flash）：流式输出期间禁止发送新消息（isStreaming 保护）
 */
export const ZHIPU_MAX_CONCURRENCY = 1

/** 智谱 AI 最小请求间隔（毫秒）
 * 串行生成多图时，两次请求之间至少间隔此值
 * 注意：实际发送还受滑动窗口约束（见 ZHIPU_RATE_LIMIT_WINDOW）
 */
export const ZHIPU_REQUEST_INTERVAL = 3000

/** 智谱 AI 速率限制自动重试次数上限
 * 遇到 429 / 速率限制错误时，自动等待后重试，而非直接失败
 */
export const ZHIPU_MAX_RETRIES = 4

/** 智谱 AI 速率限制重试基础延迟（毫秒）
 * 采用指数退避：首次重试等待 15s，第二次 30s，第三次 60s，第四次 120s
 */
export const ZHIPU_RETRY_BASE_DELAY = 15000

/** 智谱 AI 滑动窗口限流配置
 * CogView-3-Flash 免费版实际速率限制远低于官方宣称的 40 RPM，
 * 采用保守的滑动窗口策略：60 秒内最多发送 N 次请求，从根源上避免 429。
 * 5 次/分钟 → 9 张图约需 2 分钟完成，可接受。
 */
export const ZHIPU_RATE_LIMIT_WINDOW_MS = 60000
export const ZHIPU_RATE_LIMIT_MAX_REQUESTS = 5
