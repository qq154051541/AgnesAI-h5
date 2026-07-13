/**
 * SenseNova API 配置文件
 * 集中管理 SenseNova 接口地址、模型和参数
 */

/** SenseNova API 基础地址
 * 开发环境通过 Vite 代理 /sensenova-api → https://token.sensenova.cn
 * 生产环境需在 Web 服务器（nginx 等）配置相同的代理规则
 */
export const SENSENOVA_BASE_URL = '/sensenova-api/v1'

/** SenseNova 接口路径 */
export const SENSENOVA_PATHS = {
  /** 对话补全（Flash-Lite、DeepSeek V4） */
  CHAT_COMPLETIONS: '/chat/completions',
  /** 图像生成（U1 Fast） */
  IMAGE_GENERATIONS: '/images/generations'
} as const

/** 模型类型 */
export type SenseNovaModelType = 'chat' | 'image'

/** 模型配置项 */
export interface SenseNovaModelItem {
  value: string
  label: string
  type: SenseNovaModelType
  description: string
  contextLength?: string
  maxOutput?: string
  rateLimit?: string
}

/** SenseNova 模型列表 */
export const SENSENOVA_MODELS: SenseNovaModelItem[] = [
  {
    value: 'sensenova-6.7-flash-lite',
    label: 'SenseNova 6.7 Flash-Lite',
    type: 'chat',
    description: '轻量多模态智能体，支持文本对话与图像理解',
    contextLength: '256K',
    maxOutput: '64K',
    rateLimit: '每5小时1500次'
  },
  {
    value: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    type: 'chat',
    description: '高性能对话模型，支持思考模式、1M上下文、工具调用',
    contextLength: '1M',
    maxOutput: '64K',
    rateLimit: '每5小时500次'
  },
  {
    value: 'sensenova-u1-fast',
    label: 'SenseNova U1 Fast',
    type: 'image',
    description: '信息图（Infographics）生成加速版',
    rateLimit: '每5小时1500次'
  }
]

/** U1 Fast 图片尺寸（2K 分辨率，11种比例） */
export const SENSENOVA_U1_SIZES = [
  { value: '2752x1536', label: '2752×1536 (16:9)', ratio: '16:9' },
  { value: '1536x2752', label: '1536×2752 (9:16)', ratio: '9:16' },
  { value: '2048x2048', label: '2048×2048 (1:1)', ratio: '1:1' },
  { value: '2496x1664', label: '2496×1664 (3:2)', ratio: '3:2' },
  { value: '1664x2496', label: '1664×2496 (2:3)', ratio: '2:3' },
  { value: '2368x1760', label: '2368×1760 (4:3)', ratio: '4:3' },
  { value: '1760x2368', label: '1760×2368 (3:4)', ratio: '3:4' },
  { value: '2272x1824', label: '2272×1824 (5:4)', ratio: '5:4' },
  { value: '1824x2272', label: '1824×2272 (4:5)', ratio: '4:5' },
  { value: '3072x1376', label: '3072×1376 (21:9)', ratio: '21:9' },
  { value: '1344x3136', label: '1344×3136 (9:21)', ratio: '9:21' }
]

/** 推理力度选项 */
export const SENSENOVA_REASONING_EFFORTS = [
  { value: 'none', label: '关闭思考' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中（默认）' },
  { value: 'high', label: '高' }
] as const

/** 本地存储 key */
export const SENSENOVA_STORAGE_KEYS = {
  API_KEY: 'sensenova_api_key',
  /** 历史记录（按模型独立） */
  CHAT_HISTORY: 'sensenova_chat_history',
  CHAT_HISTORY_FLASHLITE: 'sensenova_chat_history_flashlite',
  CHAT_HISTORY_DEEPSEEK: 'sensenova_chat_history_deepseek',
  /** 当前对话内容（按模型独立，切换 Tab 不丢失） */
  CHAT_MESSAGES_FLASHLITE: 'sensenova_chat_messages_flashlite',
  CHAT_MESSAGES_DEEPSEEK: 'sensenova_chat_messages_deepseek',
  /** 系统提示词（按模型独立） */
  SYSTEM_PROMPT_FLASHLITE: 'sensenova_system_prompt_flashlite',
  SYSTEM_PROMPT_DEEPSEEK: 'sensenova_system_prompt_deepseek',
  IMAGE_HISTORY: 'sensenova_image_history'
} as const
