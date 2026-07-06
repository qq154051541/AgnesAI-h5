import { useState, useCallback, useRef, useEffect } from 'react'
import { Cursor, Tabs, Button, Input, Card, Notification, Divider, Footer } from 'animal-island-ui'
import type { TabItem } from 'animal-island-ui'
import ImageGenerate from './components/ImageGenerate'
import VideoGenerate from './components/VideoGenerate'
import Img2Prompt from './components/Img2Prompt'
import { STORAGE_KEYS } from './config/api'
import { getStorage, setStorage } from './utils/helpers'

type TabKey = 'image' | 'video' | 'img2prompt'

export default function App() {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('image')
  const [errorMsgs, setErrorMsgs] = useState<Record<string, string>>({
    image: '',
    video: '',
    img2prompt: ''
  })
  const [imageLoading, setImageLoading] = useState(false)
  const [videoLoading, setVideoLoading] = useState(false)
  const [img2promptLoading, setImg2promptLoading] = useState(false)

  const imageGenerateRef = useRef<{ setPrompt: (text: string) => void } | null>(null)

  useEffect(() => {
    const savedKey = getStorage<string>(STORAGE_KEYS.API_KEY)
    if (savedKey) {
      setApiKey(savedKey)
    }
  }, [])

  const onError = useCallback((tab: TabKey, msg: string) => {
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

  const handleSaveApiKey = useCallback(
    (key: string) => {
      const trimmed = key.trim()
      if (trimmed) {
        setStorage(STORAGE_KEYS.API_KEY, trimmed)
      }
    },
    []
  )

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

        <div className="agnes-main">
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

        {/* 底部 */}
        <Footer type="sea" />
      </div>
    </Cursor>
  )
}
