import { useState, useCallback, useRef, useMemo } from 'react'
import { Cursor, Drawer, Notification, Divider, Footer } from 'animal-island-ui'
import KeepAliveTabs from './components/KeepAliveTabs'
import type { KeepAliveTabItem } from './components/KeepAliveTabs'
import ApiKeyField from './components/ApiKeyField'
import ImageGenerate from './components/ImageGenerate'
import VideoGenerate from './components/VideoGenerate'
import VideoGenerateFlash from './components/VideoGenerateFlash'
import Img2Prompt from './components/Img2Prompt'
import SenseNovaChat from './components/SenseNovaChat'
import SenseNovaImage from './components/SenseNovaImage'
import SenseNovaImg2Prompt from './components/SenseNovaImg2Prompt'
import type { SenseNovaImageHandle } from './components/SenseNovaImage'
import ZhipuChat from './components/ZhipuChat'
import ZhipuImage from './components/ZhipuImage'
import ZhipuVideo from './components/ZhipuVideo'
import ZhipuImg2Prompt from './components/ZhipuImg2Prompt'
import type { ZhipuImageHandle } from './components/ZhipuImage'
import { SENSENOVA_STORAGE_KEYS, SENSENOVA_MODELS } from './config/sensenova'
import { ZHIPU_STORAGE_KEYS, ZHIPU_MODELS } from './config/zhipu'
import { useApiKey } from './hooks/useApiKey'
import { useEscapeStack } from './hooks/useEscapeStack'
import { useTheme } from './hooks/useTheme'

type AgnesTabKey = 'image' | 'video' | 'videoFlash' | 'img2prompt'
type SenseNovaTabKey = 'flashlite' | 'deepseek' | 'u1image'
type ZhipuTabKey = 'glm' | 'video' | 'cogview' | 'img2prompt'
type DrawerKey = 'agnes' | 'sensenova' | 'zhipu'

interface PlatformCard {
  key: DrawerKey
  icon: string
  title: string
  subtitle: string
  tags: string[]
  loading: boolean
  ariaLabel: string
}

interface ApiKeyLink {
  href: string
  text: string
}

interface DrawerConfig {
  key: DrawerKey
  title: string
  icon: string
  apiKeyValue: string
  onApiKeyChange: (v: string) => void
  apiKeyLabel: string
  apiKeyPlaceholder: string
  platformUrl: string
  platformName: string
  steps: string
}

const PLATFORM_CARDS: PlatformCard[] = [
  {
    key: 'agnes',
    icon: '🎨',
    title: 'Agnes AI 创作工坊',
    subtitle: '图片生成 · 视频生成 · Video 2.5 Flash · 图转提示词',
    tags: ['🖼️ 图片生成', '🎬 视频生成', '🎥 Video 2.5 Flash', '🔍 图转提示词'],
    loading: false,
    ariaLabel: '进入 Agnes AI 创作工坊'
  },
  {
    key: 'sensenova',
    icon: '🧠',
    title: 'SenseNova 实验室',
    subtitle: '多模态对话 · 深度思考 · 信息图生成',
    tags: ['⚡ Flash-Lite', '🧩 DeepSeek V4', '📊 U1 生图'],
    loading: false,
    ariaLabel: '进入 SenseNova 实验室'
  },
  {
    key: 'zhipu',
    icon: '🚀',
    title: '智谱 AI 智能体',
    subtitle: 'Agentic Coding · 文生图 · 视频生成 · 图转提示词',
    tags: ['🚀 GLM-4.7-Flash', '🎨 CogView-3-Flash', '🎬 cogvideox-flash', '🔍 图转提示词'],
    loading: false,
    ariaLabel: '进入智谱 AI 智能体'
  }
]

const API_KEY_LINKS: ApiKeyLink[] = [
  { href: 'https://platform.agnes-ai.com/', text: '获取 Agnes AI API Key' },
  { href: 'https://platform.sensenova.cn/', text: '获取 SenseNova API Key' },
  { href: 'https://open.bigmodel.cn/', text: '获取智谱 AI API Key' }
]

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme()

  /* ===== API Keys（启动恢复 + 变更持久化） ===== */
  const agnesKey = useApiKey('agnes_api_key')
  const sensenovaKey = useApiKey(SENSENOVA_STORAGE_KEYS.API_KEY)
  const zhipuKey = useApiKey(ZHIPU_STORAGE_KEYS.API_KEY)

  /* ===== Tab / Loading / Drawer ===== */
  const [agnesTab, setAgnesTab] = useState<AgnesTabKey>('image')
  const [sensenovaTab, setSensenovaTab] = useState<SenseNovaTabKey>('flashlite')
  const [zhipuTab, setZhipuTab] = useState<ZhipuTabKey>('glm')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const setError = useCallback((tab: string, msg: string) => {
    setErrors((prev) => ({ ...prev, [tab]: msg }))
  }, [])

  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const setLoadingFlag = useCallback((tab: string, val: boolean) => {
    setLoading((prev) => ({ ...prev, [tab]: val }))
  }, [])

  const [drawerOpen, setDrawerOpen] = useState<Record<DrawerKey, boolean>>({
    agnes: false,
    sensenova: false,
    zhipu: false
  })
  const openDrawer = useCallback((k: DrawerKey) => {
    setDrawerOpen((prev) => ({ ...prev, [k]: true }))
  }, [])
  const closeDrawer = useCallback((k: DrawerKey) => {
    setDrawerOpen((prev) => ({ ...prev, [k]: false }))
  }, [])

  /* 跨组件联动 ref */
  const imageGenerateRef = useRef<{ setPrompt: (text: string) => void } | null>(null)
  const zhipuImageRef = useRef<ZhipuImageHandle | null>(null)
  const sensenovaImageRef = useRef<SenseNovaImageHandle | null>(null)

  /* ===== 稳定的 onError / onLoadingChange 集合（避免 inline 函数触发子组件 effect 死循环） ===== */
  const sensenovaHandlers = useMemo(
    () => ({
      onError: (msg: string) => setError('sensenovaFlashlite', msg),
      onLoadingFlashlite: (v: boolean) => setLoadingFlag('sensenovaFlashlite', v),
      onErrorDeepseek: (msg: string) => setError('sensenovaDeepseek', msg),
      onLoadingDeepseek: (v: boolean) => setLoadingFlag('sensenovaDeepseek', v),
      onErrorImage: (msg: string) => setError('sensenovaImage', msg),
      onLoadingImage: (v: boolean) => setLoadingFlag('sensenovaImage', v)
    }),
    [setError, setLoadingFlag]
  )
  const zhipuHandlers = useMemo(
    () => ({
      onErrorGlm: (msg: string) => setError('zhipuGlm', msg),
      onLoadingGlm: (v: boolean) => setLoadingFlag('zhipuGlm', v),
      onErrorVideo: (msg: string) => setError('zhipuVideo', msg),
      onLoadingVideo: (v: boolean) => setLoadingFlag('zhipuVideo', v),
      onErrorImage: (msg: string) => setError('zhipuImage', msg),
      onLoadingImage: (v: boolean) => setLoadingFlag('zhipuImage', v),
      onErrorImg2Prompt: (msg: string) => setError('zhipuImg2Prompt', msg),
      onLoadingImg2Prompt: (v: boolean) => setLoadingFlag('zhipuImg2Prompt', v)
    }),
    [setError, setLoadingFlag]
  )
  const agnesHandlers = useMemo(
    () => ({
      onErrorImage: (msg: string) => setError('image', msg),
      onLoadingImage: (v: boolean) => setLoadingFlag('image', v),
      onErrorVideo: (msg: string) => setError('video', msg),
      onLoadingVideo: (v: boolean) => setLoadingFlag('video', v),
      onErrorVideoFlash: (msg: string) => setError('videoFlash', msg),
      onLoadingVideoFlash: (v: boolean) => setLoadingFlag('videoFlash', v),
      onErrorImg2Prompt: (msg: string) => setError('img2prompt', msg),
      onLoadingImg2Prompt: (v: boolean) => setLoadingFlag('img2prompt', v)
    }),
    [setError, setLoadingFlag]
  )

  /* ===== 跨页面"使用此提示词"回调 ===== */
  const usePromptInAgnes = useCallback((prompt: string) => {
    setAgnesTab('image')
    setTimeout(() => imageGenerateRef.current?.setPrompt(prompt), 100)
    Notification.success('已填入图片提示词')
  }, [])

  const usePromptInZhipuCogview = useCallback((prompt: string) => {
    setZhipuTab('cogview')
    setTimeout(() => zhipuImageRef.current?.setPrompt(prompt), 100)
    Notification.success('已填入 CogView-3-Flash 生图描述')
  }, [])

  const usePromptInSenseNovaU1 = useCallback((prompt: string) => {
    setSensenovaTab('u1image')
    setTimeout(() => sensenovaImageRef.current?.setPrompt(prompt), 100)
    Notification.success('已填入 U1 Fast 生图描述')
  }, [])

  /* 汇总 loading：用于平台卡片"创作中"徽标 */
  const agnesLoading = !!(
    loading.image || loading.video || loading.videoFlash || loading.img2prompt
  )
  const sensenovaLoading = !!(
    loading.sensenovaFlashlite || loading.sensenovaDeepseek || loading.sensenovaImage
  )
  const zhipuLoading = !!(
    loading.zhipuGlm ||
    loading.zhipuVideo ||
    loading.zhipuImage ||
    loading.zhipuImg2Prompt
  )

  const loadingMap: Record<DrawerKey, boolean> = {
    agnes: agnesLoading,
    sensenova: sensenovaLoading,
    zhipu: zhipuLoading
  }
  const platformCards = PLATFORM_CARDS.map((c) => ({ ...c, loading: loadingMap[c.key] }))

  const deepSeekModel = SENSENOVA_MODELS[1]
  const glmModel = ZHIPU_MODELS[0]
  const cogviewModel = ZHIPU_MODELS[2]
  const cogvideoModel = ZHIPU_MODELS[3]

  /* ===== Tab 配置 ===== */
  const sensenovaTabs: KeepAliveTabItem[] = [
    {
      key: 'flashlite',
      label: (
        <span>
          🔍 图转提示词
          {loading.sensenovaFlashlite && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <SenseNovaImg2Prompt
          apiKey={sensenovaKey.value}
          errorMsg={errors.sensenovaFlashlite || ''}
          onError={sensenovaHandlers.onError}
          onLoadingChange={sensenovaHandlers.onLoadingFlashlite}
          onUsePrompt={usePromptInSenseNovaU1}
        />
      )
    },
    {
      key: 'deepseek',
      label: (
        <span>
          🧩 DeepSeek V4
          {loading.sensenovaDeepseek && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <SenseNovaChat
          apiKey={sensenovaKey.value}
          modelValue={deepSeekModel.value}
          modelLabel={deepSeekModel.label}
          modelDescription={deepSeekModel.description}
          errorMsg={errors.sensenovaDeepseek || ''}
          onError={sensenovaHandlers.onErrorDeepseek}
          onLoadingChange={sensenovaHandlers.onLoadingDeepseek}
        />
      )
    },
    {
      key: 'u1image',
      label: (
        <span>
          📊 U1 生图
          {loading.sensenovaImage && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <SenseNovaImage
          ref={sensenovaImageRef}
          apiKey={sensenovaKey.value}
          errorMsg={errors.sensenovaImage || ''}
          onError={sensenovaHandlers.onErrorImage}
          onLoadingChange={sensenovaHandlers.onLoadingImage}
        />
      )
    }
  ]

  const zhipuTabs: KeepAliveTabItem[] = [
    {
      key: 'glm',
      label: (
        <span>
          🚀 GLM-4.7-Flash
          {loading.zhipuGlm && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <ZhipuChat
          apiKey={zhipuKey.value}
          modelValue={glmModel.value}
          modelLabel={glmModel.label}
          modelDescription={glmModel.description}
          errorMsg={errors.zhipuGlm || ''}
          onError={zhipuHandlers.onErrorGlm}
          onLoadingChange={zhipuHandlers.onLoadingGlm}
        />
      )
    },
    {
      key: 'video',
      label: (
        <span>
          🎬 cogvideox-flash
          {loading.zhipuVideo && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <ZhipuVideo
          apiKey={zhipuKey.value}
          modelDescription={cogvideoModel.description}
          errorMsg={errors.zhipuVideo || ''}
          onError={zhipuHandlers.onErrorVideo}
          onLoadingChange={zhipuHandlers.onLoadingVideo}
        />
      )
    },
    {
      key: 'cogview',
      label: (
        <span>
          🎨 CogView-3-Flash
          {loading.zhipuImage && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <ZhipuImage
          ref={zhipuImageRef}
          apiKey={zhipuKey.value}
          modelDescription={cogviewModel.description}
          errorMsg={errors.zhipuImage || ''}
          onError={zhipuHandlers.onErrorImage}
          onLoadingChange={zhipuHandlers.onLoadingImage}
        />
      )
    },
    {
      key: 'img2prompt',
      label: (
        <span>
          🔍 图转提示词
          {loading.zhipuImg2Prompt && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <ZhipuImg2Prompt
          apiKey={zhipuKey.value}
          errorMsg={errors.zhipuImg2Prompt || ''}
          onError={zhipuHandlers.onErrorImg2Prompt}
          onLoadingChange={zhipuHandlers.onLoadingImg2Prompt}
          onUsePrompt={usePromptInZhipuCogview}
        />
      )
    }
  ]

  const agnesTabs: KeepAliveTabItem[] = [
    {
      key: 'image',
      label: (
        <span>
          🖼️ 图片生成
          {loading.image && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <ImageGenerate
          ref={imageGenerateRef}
          apiKey={agnesKey.value}
          errorMsg={errors.image || ''}
          onError={agnesHandlers.onErrorImage}
          onLoadingChange={agnesHandlers.onLoadingImage}
        />
      )
    },
    {
      key: 'video',
      label: (
        <span>
          🎬 Video V2.0
          {loading.video && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <VideoGenerate
          apiKey={agnesKey.value}
          errorMsg={errors.video || ''}
          onError={agnesHandlers.onErrorVideo}
          onLoadingChange={agnesHandlers.onLoadingVideo}
        />
      )
    },
    {
      key: 'videoFlash',
      label: (
        <span>
          🎥 Video 2.5 Flash
          {loading.videoFlash && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <VideoGenerateFlash
          apiKey={agnesKey.value}
          errorMsg={errors.videoFlash || ''}
          onError={agnesHandlers.onErrorVideoFlash}
          onLoadingChange={agnesHandlers.onLoadingVideoFlash}
        />
      )
    },
    {
      key: 'img2prompt',
      label: (
        <span>
          🔍 图转提示词
          {loading.img2prompt && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <Img2Prompt
          apiKey={agnesKey.value}
          errorMsg={errors.img2prompt || ''}
          onError={agnesHandlers.onErrorImg2Prompt}
          onLoadingChange={agnesHandlers.onLoadingImg2Prompt}
          onUsePrompt={usePromptInAgnes}
        />
      )
    }
  ]

  const anyKeyConfigured = !!(
    agnesKey.value || sensenovaKey.value || zhipuKey.value
  )
  const configuredCount = [agnesKey.value, sensenovaKey.value, zhipuKey.value].filter(
    Boolean
  ).length

  const drawerConfigs: DrawerConfig[] = [
    {
      key: 'agnes',
      title: 'Agnes AI 创作工坊',
      icon: '🎨',
      apiKeyValue: agnesKey.value,
      onApiKeyChange: agnesKey.onChange,
      apiKeyLabel: 'API Key',
      apiKeyPlaceholder: '输入你的 Agnes AI API Key',
      platformUrl: 'https://platform.agnes-ai.com/',
      platformName: 'platform.agnes-ai.com',
      steps: '注册登录 → 设置 → API 秘钥 → 创建新的协议'
    },
    {
      key: 'sensenova',
      title: 'SenseNova 实验室',
      icon: '🧠',
      apiKeyValue: sensenovaKey.value,
      onApiKeyChange: sensenovaKey.onChange,
      apiKeyLabel: 'SenseNova API Key',
      apiKeyPlaceholder: '输入你的 SenseNova API Key (sk- 开头)',
      platformUrl: 'https://platform.sensenova.cn/',
      platformName: 'platform.sensenova.cn',
      steps: '注册登录 → 控制台 → API 密钥 → 创建密钥'
    },
    {
      key: 'zhipu',
      title: '智谱 AI 智能体',
      icon: '🚀',
      apiKeyValue: zhipuKey.value,
      onApiKeyChange: zhipuKey.onChange,
      apiKeyLabel: '智谱 AI API Key',
      apiKeyPlaceholder: '输入你的智谱 AI API Key',
      platformUrl: 'https://open.bigmodel.cn/',
      platformName: 'open.bigmodel.cn',
      steps: '注册登录 → API 密钥 → 创建密钥'
    }
  ]

  const drawerContentMap: Record<DrawerKey, KeepAliveTabItem[]> = {
    agnes: agnesTabs,
    sensenova: sensenovaTabs,
    zhipu: zhipuTabs
  }
  const drawerActiveMap: Record<DrawerKey, string> = {
    agnes: agnesTab,
    sensenova: sensenovaTab,
    zhipu: zhipuTab
  }
  const drawerSetActiveMap: Record<DrawerKey, (k: string) => void> = {
    agnes: (k) => setAgnesTab(k as AgnesTabKey),
    sensenova: (k) => setSensenovaTab(k as SenseNovaTabKey),
    zhipu: (k) => setZhipuTab(k as ZhipuTabKey)
  }

  return (
    <Cursor>
      <div className="agnes-page">
        <header className="agnes-header">
          <div className="agnes-header-inner">
            <div className="agnes-logo-wrap">
              <img className="agnes-logo" src={`${import.meta.env.BASE_URL}logo.webp`} alt="logo" />
            </div>
            <div className="agnes-header-info">
              <div className="agnes-title-row">
                <span className="agnes-title">绘境</span>
                <span className="agnes-title-divider" />
                <span className="agnes-title-en">DrawScape</span>
              </div>
              <span className="agnes-subtitle">一言绘境，万象由生</span>
            </div>
            <button
              className="agnes-theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到暗黑模式'}
              title={theme === 'dark' ? '浅色模式' : '暗黑模式'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <a
              className="agnes-github-link"
              href="https://github.com/qq154051541/AgnesAI-h5"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </a>
          </div>
          <div className="agnes-header-deco" />
        </header>

        <div className="agnes-main agnes-home-main">
          <div className="agnes-home-intro">
            <h2 className="agnes-home-title">选择创作平台</h2>
            <p className="agnes-home-desc">三大 AI 平台，覆盖图像、视频、对话与智能编码</p>
          </div>

          {!anyKeyConfigured && (
            <div className="agnes-home-guide">
              <span className="agnes-home-guide-icon">👋</span>
              <div className="agnes-home-guide-body">
                <div className="agnes-home-guide-title">欢迎使用绘境</div>
                <div className="agnes-home-guide-text">选择下方任一平台，进入后先配置 API Key 即可开始创作</div>
              </div>
            </div>
          )}
          {anyKeyConfigured && (
            <div className="agnes-home-guide agnes-home-guide-status">
              <span className="agnes-home-guide-icon">🔑</span>
              <div className="agnes-home-guide-body">
                <div className="agnes-home-guide-title">已配置 {configuredCount} / 3 个平台</div>
                <div className="agnes-home-guide-text">点击卡片继续创作，或配置更多平台</div>
              </div>
            </div>
          )}

          <div className="agnes-home-cards">
            {platformCards.map((card) => (
              <div
                key={card.key}
                className={`agnes-home-card agnes-home-card-${card.key} ${card.loading ? 'agnes-home-card-busy' : ''}`}
                onClick={() => openDrawer(card.key)}
                role="button"
                tabIndex={0}
                aria-label={card.ariaLabel}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(card.key) } }}
              >
                <div className="agnes-home-card-icon">{card.icon}</div>
                <div className="agnes-home-card-body">
                  <div className="agnes-home-card-title">{card.title}</div>
                  <div className="agnes-home-card-subtitle">{card.subtitle}</div>
                  <div className="agnes-home-card-tags">
                    {card.tags.map((tag) => (
                      <span key={tag} className="agnes-home-card-tag">{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="agnes-home-card-arrow">›</div>
                {card.loading && <span className="agnes-home-card-busy-badge">● 创作中</span>}
              </div>
            ))}
          </div>

          <Divider type="wave-yellow" />

          <div className="agnes-home-links-title">🔑 快速获取 API Key</div>
          <div className="agnes-home-links">
            {API_KEY_LINKS.map((link) => (
              <a
                key={link.href}
                className="agnes-home-link-item"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="agnes-home-link-icon">🔑</span>
                <span className="agnes-home-link-text">{link.text}</span>
                <span className="agnes-home-link-arrow">↗</span>
              </a>
            ))}
          </div>
        </div>

        <Footer type="sea" />
      </div>

      {drawerConfigs.map((cfg) => (
        <DrawerWithEscape
          key={cfg.key}
          open={drawerOpen[cfg.key]}
          icon={cfg.icon}
          title={cfg.title}
          onClose={() => closeDrawer(cfg.key)}
          apiKeyValue={cfg.apiKeyValue}
          onApiKeyChange={cfg.onApiKeyChange}
          apiKeyLabel={cfg.apiKeyLabel}
          apiKeyPlaceholder={cfg.apiKeyPlaceholder}
          platformUrl={cfg.platformUrl}
          platformName={cfg.platformName}
          steps={cfg.steps}
          contentItems={drawerContentMap[cfg.key]}
          activeKey={drawerActiveMap[cfg.key]}
          onTabChange={drawerSetActiveMap[cfg.key]}
        />

      ))}
    </Cursor>
  )
}

interface DrawerWithEscapeProps {
  open: boolean
  icon: React.ReactNode
  title: string
  onClose: () => void
  apiKeyValue: string
  onApiKeyChange: (v: string) => void
  apiKeyLabel: string
  apiKeyPlaceholder: string
  platformUrl: string
  platformName: string
  steps: string
  contentItems: KeepAliveTabItem[]
  activeKey: string
  onTabChange: (k: string) => void
}

function DrawerWithEscape({
  open, icon, title, onClose,
  apiKeyValue, onApiKeyChange, apiKeyLabel, apiKeyPlaceholder, platformUrl, platformName, steps,
  contentItems, activeKey, onTabChange
}: DrawerWithEscapeProps) {
  useEscapeStack(onClose, open)
  return (
    <Drawer
      open={open}
      title={<span className="agnes-drawer-title">{icon} {title}</span>}
      placement="right"
      width="100%"
      onClose={onClose}
      className="agnes-drawer"
    >
      <div className="agnes-drawer-content">
        <ApiKeyField
          value={apiKeyValue}
          onChange={onApiKeyChange}
          label={apiKeyLabel}
          placeholder={apiKeyPlaceholder}
          platformUrl={platformUrl}
          platformName={platformName}
          steps={steps}
        />
        <Divider type="wave-yellow" />
        <div className="agnes-tabs-wrapper">
          <KeepAliveTabs
            items={contentItems}
            activeKey={activeKey}
            onChange={onTabChange}
          />
        </div>
      </div>
    </Drawer>
  )
}
