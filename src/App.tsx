import { useState, useCallback, useRef, useEffect } from 'react'
import { Cursor, Drawer, Tabs, Button, Input, Card, Notification, Divider, Footer } from 'animal-island-ui'
import type { TabItem } from 'animal-island-ui'
import ImageGenerate from './components/ImageGenerate'
import VideoGenerate from './components/VideoGenerate'
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
import { STORAGE_KEYS } from './config/api'
import { SENSENOVA_STORAGE_KEYS, SENSENOVA_MODELS } from './config/sensenova'
import { ZHIPU_STORAGE_KEYS, ZHIPU_MODELS } from './config/zhipu'
import { getStorage, setStorage } from './utils/helpers'

type TabKey = 'image' | 'video' | 'img2prompt'
type SenseNovaTabKey = 'flashlite' | 'deepseek' | 'u1image'
type ZhipuTabKey = 'glm' | 'video' | 'cogview' | 'img2prompt'

export default function App() {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('image')
  const [errorMsgs, setErrorMsgs] = useState<Record<string, string>>({
    image: '',
    video: '',
    img2prompt: '',
    sensenova: '',
    zhipu: ''
  })
  const [imageLoading, setImageLoading] = useState(false)
  const [videoLoading, setVideoLoading] = useState(false)
  const [img2promptLoading, setImg2promptLoading] = useState(false)
  const [sensenovaFlashliteLoading, setSensenovaFlashliteLoading] = useState(false)
  const [sensenovaDeepseekLoading, setSensenovaDeepseekLoading] = useState(false)
  const [sensenovaImageLoading, setSensenovaImageLoading] = useState(false)
  const [zhipuGlmLoading, setZhipuGlmLoading] = useState(false)
  const [zhipuVideoLoading, setZhipuVideoLoading] = useState(false)
  const [zhipuImageLoading, setZhipuImageLoading] = useState(false)
  const [zhipuImg2PromptLoading, setZhipuImg2PromptLoading] = useState(false)

  /* ===== SenseNova 状态 ===== */
  const [sensenovaApiKey, setSensenovaApiKey] = useState('')
  const [sensenovaShowKey, setSensenovaShowKey] = useState(false)
  const [sensenovaActiveTab, setSensenovaActiveTab] = useState<SenseNovaTabKey>('flashlite')

  /* ===== 智谱 AI 状态 ===== */
  const [zhipuApiKey, setZhipuApiKey] = useState('')
  const [zhipuShowKey, setZhipuShowKey] = useState(false)
  const [zhipuActiveTab, setZhipuActiveTab] = useState<ZhipuTabKey>('glm')

  /* 抽屉状态 */
  const [agnesDrawerOpen, setAgnesDrawerOpen] = useState(false)
  const [sensenovaDrawerOpen, setSensenovaDrawerOpen] = useState(false)
  const [zhipuDrawerOpen, setZhipuDrawerOpen] = useState(false)

const imageGenerateRef = useRef<{ setPrompt: (text: string) => void } | null>(null)
const zhipuImageRef = useRef<ZhipuImageHandle | null>(null)
const sensenovaImageRef = useRef<SenseNovaImageHandle | null>(null)

  useEffect(() => {
    const savedKey = getStorage<string>(STORAGE_KEYS.API_KEY)
    if (savedKey) {
      setApiKey(savedKey)
    }
    const savedSensenovaKey = getStorage<string>(SENSENOVA_STORAGE_KEYS.API_KEY)
    if (savedSensenovaKey) {
      setSensenovaApiKey(savedSensenovaKey)
    }
    const savedZhipuKey = getStorage<string>(ZHIPU_STORAGE_KEYS.API_KEY)
    if (savedZhipuKey) {
      setZhipuApiKey(savedZhipuKey)
    }
  }, [])

  const onError = useCallback((tab: TabKey | 'sensenova' | 'zhipu', msg: string) => {
    setErrorMsgs((prev) => ({ ...prev, [tab]: msg }))
  }, [])

  const handleUsePrompt = useCallback(
    (prompt: string) => {
      setActiveTab('image')
      setTimeout(() => {
        if (imageGenerateRef.current) {
          imageGenerateRef.current.setPrompt(prompt)
        }
      }, 100)
      Notification.success('已填入图片提示词')
    },
    []
  )

/** 智谱图转提示词 → CogView-3-Flash 文生图 */
const handleZhipuUsePrompt = useCallback(
(prompt: string) => {
setZhipuActiveTab('cogview')
setTimeout(() => {
if (zhipuImageRef.current) {
zhipuImageRef.current.setPrompt(prompt)
}
}, 100)
Notification.success('已填入 CogView-3-Flash 生图描述')
},
[]
)

/** SenseNova 图转提示词 → U1 Fast 文生图 */
const handleSensenovaUsePrompt = useCallback(
(prompt: string) => {
setSensenovaActiveTab('u1image')
setTimeout(() => {
if (sensenovaImageRef.current) {
sensenovaImageRef.current.setPrompt(prompt)
}
}, 100)
Notification.success('已填入 U1 Fast 生图描述')
},
[]
)

  const handleSaveApiKey = useCallback(
    (key: string) => {
      const trimmed = key.trim()
      if (trimmed) {
        setStorage(STORAGE_KEYS.API_KEY, trimmed)
      }
    },
    []
  )

  const handleSaveSensenovaApiKey = useCallback(
    (key: string) => {
      const trimmed = key.trim()
      if (trimmed) {
        setStorage(SENSENOVA_STORAGE_KEYS.API_KEY, trimmed)
      }
    },
    []
  )

  const handleSaveZhipuApiKey = useCallback(
    (key: string) => {
      const trimmed = key.trim()
      if (trimmed) {
        setStorage(ZHIPU_STORAGE_KEYS.API_KEY, trimmed)
      }
    },
    []
  )

  const sensenovaLoading = sensenovaFlashliteLoading || sensenovaDeepseekLoading || sensenovaImageLoading
  const zhipuLoading = zhipuGlmLoading || zhipuVideoLoading || zhipuImageLoading || zhipuImg2PromptLoading

  const flashLiteModel = SENSENOVA_MODELS[0]
  const deepSeekModel = SENSENOVA_MODELS[1]
  const glmModel = ZHIPU_MODELS[0]
  const cogviewModel = ZHIPU_MODELS[2]
  const cogvideoModel = ZHIPU_MODELS[3]

  const sensenovaTabItems: TabItem[] = [
    {
      key: 'flashlite',
      label: (
        <span>
          🔍 图转提示词
          {sensenovaFlashliteLoading && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <SenseNovaImg2Prompt
          apiKey={sensenovaApiKey}
          errorMsg={errorMsgs.sensenova}
          onError={(msg) => onError('sensenova', msg)}
          onLoadingChange={setSensenovaFlashliteLoading}
          onUsePrompt={handleSensenovaUsePrompt}
        />
      )
    },
    {
      key: 'deepseek',
      label: (
        <span>
          🧩 DeepSeek V4
          {sensenovaDeepseekLoading && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <SenseNovaChat
          apiKey={sensenovaApiKey}
          modelValue={deepSeekModel.value}
          modelLabel={deepSeekModel.label}
          modelDescription={deepSeekModel.description}
          errorMsg={errorMsgs.sensenova}
          onError={(msg) => onError('sensenova', msg)}
          onLoadingChange={setSensenovaDeepseekLoading}
        />
      )
    },
    {
      key: 'u1image',
      label: (
        <span>
          📊 U1 生图
          {sensenovaImageLoading && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
<SenseNovaImage
ref={sensenovaImageRef}
apiKey={sensenovaApiKey}
errorMsg={errorMsgs.sensenova}
onError={(msg) => onError('sensenova', msg)}
onLoadingChange={setSensenovaImageLoading}
/>
      )
    }
  ]

  const zhipuTabItems: TabItem[] = [
    {
      key: 'glm',
      label: (
        <span>
          🚀 GLM-4.7-Flash
          {zhipuGlmLoading && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <ZhipuChat
          apiKey={zhipuApiKey}
          modelValue={glmModel.value}
          modelLabel={glmModel.label}
          modelDescription={glmModel.description}
          errorMsg={errorMsgs.zhipu}
          onError={(msg) => onError('zhipu', msg)}
          onLoadingChange={setZhipuGlmLoading}
        />
      )
    },
    {
      key: 'video',
      label: (
        <span>
          🎬 cogvideox-flash
          {zhipuVideoLoading && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <ZhipuVideo
          apiKey={zhipuApiKey}
          modelLabel={cogvideoModel.label}
          modelDescription={cogvideoModel.description}
          errorMsg={errorMsgs.zhipu}
          onError={(msg) => onError('zhipu', msg)}
          onLoadingChange={setZhipuVideoLoading}
        />
      )
    },
    {
      key: 'cogview',
      label: (
        <span>
          🎨 CogView-3-Flash
          {zhipuImageLoading && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <ZhipuImage
          ref={zhipuImageRef}
          apiKey={zhipuApiKey}
          modelLabel={cogviewModel.label}
          modelDescription={cogviewModel.description}
          errorMsg={errorMsgs.zhipu}
          onError={(msg) => onError('zhipu', msg)}
          onLoadingChange={setZhipuImageLoading}
        />
      )
    },
    {
      key: 'img2prompt',
      label: (
        <span>
          🔍 图转提示词
          {zhipuImg2PromptLoading && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <ZhipuImg2Prompt
          apiKey={zhipuApiKey}
          errorMsg={errorMsgs.zhipu}
          onError={(msg) => onError('zhipu', msg)}
          onLoadingChange={setZhipuImg2PromptLoading}
          onUsePrompt={handleZhipuUsePrompt}
        />
      )
    }
  ]

  const tabItems: TabItem[] = [
    {
      key: 'image',
      label: (
        <span>
          🖼️ 图片生成
          {imageLoading && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <ImageGenerate
          ref={imageGenerateRef}
          apiKey={apiKey}
          errorMsg={errorMsgs.image}
          onError={(msg) => onError('image', msg)}
          onLoadingChange={setImageLoading}
        />
      )
    },
    {
      key: 'video',
      label: (
        <span>
          🎬 视频生成
          {videoLoading && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <VideoGenerate
          apiKey={apiKey}
          errorMsg={errorMsgs.video}
          onError={(msg) => onError('video', msg)}
          onLoadingChange={setVideoLoading}
        />
      )
    },
    {
      key: 'img2prompt',
      label: (
        <span>
          🔍 图转提示词
          {img2promptLoading && <span className="agnes-tab-loading-dot" />}
        </span>
      ),
      children: (
        <Img2Prompt
          apiKey={apiKey}
          errorMsg={errorMsgs.img2prompt}
          onError={(msg) => onError('img2prompt', msg)}
          onLoadingChange={setImg2promptLoading}
          onUsePrompt={handleUsePrompt}
        />
      )
    }
  ]

  return (
    <Cursor>
      <div className="agnes-page">
        {/* 头部 */}
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

        {/* 主内容区 - 双卡片入口 */}
        <div className="agnes-main agnes-home-main">
            <div className="agnes-home-intro">
            <h2 className="agnes-home-title">选择创作平台</h2>
            <p className="agnes-home-desc">三大 AI 平台，覆盖图像、视频、对话与智能编码</p>
          </div>

          <div className="agnes-home-cards">
            {/* Agnes AI 卡片 */}
            <div
              className={`agnes-home-card agnes-home-card-agnes ${imageLoading || videoLoading || img2promptLoading ? 'agnes-home-card-busy' : ''}`}
              onClick={() => setAgnesDrawerOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAgnesDrawerOpen(true) } }}
            >
              <div className="agnes-home-card-icon">🎨</div>
              <div className="agnes-home-card-body">
                <div className="agnes-home-card-title">Agnes AI 创作工坊</div>
                <div className="agnes-home-card-subtitle">图片生成 · 视频生成 · 图转提示词</div>
                <div className="agnes-home-card-tags">
                  <span className="agnes-home-card-tag">🖼️ 图片生成</span>
                  <span className="agnes-home-card-tag">🎬 视频生成</span>
                  <span className="agnes-home-card-tag">🔍 图转提示词</span>
                </div>
              </div>
              <div className="agnes-home-card-arrow">›</div>
              {(imageLoading || videoLoading || img2promptLoading) && (
                <span className="agnes-home-card-dot" />
              )}
            </div>

            {/* SenseNova 卡片 */}
            <div
              className={`agnes-home-card agnes-home-card-sensenova ${sensenovaLoading ? 'agnes-home-card-busy' : ''}`}
              onClick={() => setSensenovaDrawerOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSensenovaDrawerOpen(true) } }}
            >
              <div className="agnes-home-card-icon">🧠</div>
              <div className="agnes-home-card-body">
                <div className="agnes-home-card-title">SenseNova 实验室</div>
                <div className="agnes-home-card-subtitle">多模态对话 · 深度思考 · 信息图生成</div>
                <div className="agnes-home-card-tags">
                  <span className="agnes-home-card-tag">⚡ Flash-Lite</span>
                  <span className="agnes-home-card-tag">🧩 DeepSeek V4</span>
                  <span className="agnes-home-card-tag">📊 U1 生图</span>
                </div>
              </div>
              <div className="agnes-home-card-arrow">›</div>
              {sensenovaLoading && (
                <span className="agnes-home-card-dot" />
              )}
            </div>

            {/* 智谱 AI 卡片 */}
            <div
              className={`agnes-home-card agnes-home-card-zhipu ${zhipuLoading ? 'agnes-home-card-busy' : ''}`}
              onClick={() => setZhipuDrawerOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setZhipuDrawerOpen(true) } }}
            >
              <div className="agnes-home-card-icon">🚀</div>
              <div className="agnes-home-card-body">
                <div className="agnes-home-card-title">智谱 AI 智能体</div>
                <div className="agnes-home-card-subtitle">Agentic Coding · 文生图 · 视频生成 · 图转提示词</div>
                <div className="agnes-home-card-tags">
                  <span className="agnes-home-card-tag">🚀 GLM-4.7-Flash</span>
                  <span className="agnes-home-card-tag">🎨 CogView-3-Flash</span>
                  <span className="agnes-home-card-tag">🎬 cogvideox-flash</span>
                  <span className="agnes-home-card-tag">🔍 图转提示词</span>
                </div>
              </div>
              <div className="agnes-home-card-arrow">›</div>
              {zhipuLoading && (
                <span className="agnes-home-card-dot" />
              )}
            </div>
          </div>

          <Divider type="wave-yellow" />

          <div className="agnes-home-links">
            <a
              className="agnes-home-link-item"
              href="https://platform.agnes-ai.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="agnes-home-link-icon">🔑</span>
              <span className="agnes-home-link-text">获取 Agnes AI API Key</span>
              <span className="agnes-home-link-arrow">↗</span>
            </a>
            <a
              className="agnes-home-link-item"
              href="https://platform.sensenova.cn/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="agnes-home-link-icon">🔑</span>
              <span className="agnes-home-link-text">获取 SenseNova API Key</span>
              <span className="agnes-home-link-arrow">↗</span>
            </a>
            <a
              className="agnes-home-link-item"
              href="https://open.bigmodel.cn/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="agnes-home-link-icon">🔑</span>
              <span className="agnes-home-link-text">获取智谱 AI API Key</span>
              <span className="agnes-home-link-arrow">↗</span>
            </a>
          </div>
        </div>

        {/* 底部 */}
        <Footer type="sea" />
      </div>

      {/* ===== Agnes AI 抽屉 ===== */}
      <Drawer
        open={agnesDrawerOpen}
        title={<span className="agnes-drawer-title">🎨 Agnes AI 创作工坊</span>}
        placement="right"
        width="100%"
        onClose={() => setAgnesDrawerOpen(false)}
        className="agnes-drawer"
      >
        <div className="agnes-drawer-content">
          {/* API Key 输入 */}
          <Card className="agnes-apikey-section">
            <div className="agnes-apikey-row">
              <span className="agnes-label-icon">🔑</span>
              <span className="agnes-apikey-label">API Key</span>
              <span className="agnes-apikey-required">*</span>
            </div>
            <div className="agnes-apikey-input-row">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  handleSaveApiKey(e.target.value)
                }}
                placeholder="输入你的 Agnes AI API Key"
                allowClear
              />
              <Button
                size="middle"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? '隐藏' : '显示'}
              </Button>
            </div>
            <div className="agnes-apikey-tips">
              前往{' '}
              <span
                className="agnes-apikey-tips-link"
                onClick={() => window.open('https://platform.agnes-ai.com/', '_blank')}
              >
                platform.agnes-ai.com
              </span>{' '}
              注册登录 → 设置 → API 秘钥 → 创建新的秘钥
            </div>
          </Card>

          <Divider type="wave-yellow" />

          {/* 功能 Tab 切换 */}
          <div className="agnes-tabs-wrapper">
            <Tabs
              items={tabItems}
              activeKey={activeTab}
              onChange={(key) => setActiveTab(key as TabKey)}
            />
          </div>
        </div>
      </Drawer>

      {/* ===== SenseNova 抽屉 ===== */}
      <Drawer
        open={sensenovaDrawerOpen}
        title={<span className="agnes-drawer-title">🧠 SenseNova 实验室</span>}
        placement="right"
        width="100%"
        onClose={() => setSensenovaDrawerOpen(false)}
        className="agnes-drawer"
      >
        <div className="agnes-drawer-content">
          {/* SenseNova API Key 输入 */}
          <Card className="agnes-apikey-section">
            <div className="agnes-apikey-row">
              <span className="agnes-label-icon">🔑</span>
              <span className="agnes-apikey-label">SenseNova API Key</span>
              <span className="agnes-apikey-required">*</span>
            </div>
            <div className="agnes-apikey-input-row">
              <Input
                type={sensenovaShowKey ? 'text' : 'password'}
                value={sensenovaApiKey}
                onChange={(e) => {
                  setSensenovaApiKey(e.target.value)
                  handleSaveSensenovaApiKey(e.target.value)
                }}
                placeholder="输入你的 SenseNova API Key (sk- 开头)"
                allowClear
              />
              <Button
                size="middle"
                onClick={() => setSensenovaShowKey(!sensenovaShowKey)}
              >
                {sensenovaShowKey ? '隐藏' : '显示'}
              </Button>
            </div>
            <div className="agnes-apikey-tips">
              前往{' '}
              <span
                className="agnes-apikey-tips-link"
                onClick={() => window.open('https://platform.sensenova.cn/', '_blank')}
              >
                platform.sensenova.cn
              </span>{' '}
              注册登录 → 控制台 → API Keys → 创建密钥
            </div>
          </Card>

          <Divider type="wave-yellow" />

          {/* 功能 Tab 切换 */}
          <div className="agnes-tabs-wrapper">
            <Tabs
              items={sensenovaTabItems}
              activeKey={sensenovaActiveTab}
              onChange={(key) => setSensenovaActiveTab(key as SenseNovaTabKey)}
            />
          </div>
        </div>
      </Drawer>

      {/* ===== 智谱 AI 抽屉 ===== */}
      <Drawer
        open={zhipuDrawerOpen}
        title={<span className="agnes-drawer-title">🚀 智谱 AI 智能体</span>}
        placement="right"
        width="100%"
        onClose={() => setZhipuDrawerOpen(false)}
        className="agnes-drawer"
      >
        <div className="agnes-drawer-content">
          {/* 智谱 AI API Key 输入 */}
          <Card className="agnes-apikey-section">
            <div className="agnes-apikey-row">
              <span className="agnes-label-icon">🔑</span>
              <span className="agnes-apikey-label">智谱 AI API Key</span>
              <span className="agnes-apikey-required">*</span>
            </div>
            <div className="agnes-apikey-input-row">
              <Input
                type={zhipuShowKey ? 'text' : 'password'}
                value={zhipuApiKey}
                onChange={(e) => {
                  setZhipuApiKey(e.target.value)
                  handleSaveZhipuApiKey(e.target.value)
                }}
                placeholder="输入你的智谱 AI API Key"
                allowClear
              />
              <Button
                size="middle"
                onClick={() => setZhipuShowKey(!zhipuShowKey)}
              >
                {zhipuShowKey ? '隐藏' : '显示'}
              </Button>
            </div>
            <div className="agnes-apikey-tips">
              前往{' '}
              <span
                className="agnes-apikey-tips-link"
                onClick={() => window.open('https://open.bigmodel.cn/', '_blank')}
              >
                open.bigmodel.cn
              </span>{' '}
              注册登录 → API Keys → 创建密钥
            </div>
          </Card>

          <Divider type="wave-yellow" />

          {/* 功能 Tab 切换 */}
          <div className="agnes-tabs-wrapper">
            <Tabs
              items={zhipuTabItems}
              activeKey={zhipuActiveTab}
              onChange={(key) => setZhipuActiveTab(key as ZhipuTabKey)}
            />
          </div>
        </div>
      </Drawer>
    </Cursor>
  )
}
