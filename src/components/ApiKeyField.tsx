import { useState } from 'react'
import { Button, Input, Card } from 'animal-island-ui'

interface ApiKeyFieldProps {
  /** 当前 API Key 值 */
  value: string
  /** Key 变更回调 */
  onChange: (key: string) => void
  /** 字段名称，如 "API Key"、"SenseNova API Key" */
  label: string
  /** 输入框占位文案 */
  placeholder: string
  /** 平台官网地址 */
  platformUrl: string
  /** 平台域名展示文案 */
  platformName: string
  /** 获取 Key 的操作路径说明 */
  steps: string
}

/** API Key 脱敏展示：保留前 3 位与后 4 位 */
function maskKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length <= 10) return '••••••••'
  return `${trimmed.slice(0, 3)}••••${trimmed.slice(-4)}`
}

/**
 * API Key 配置组件
 * 已配置时折叠为状态条，减少视觉干扰；未配置时展开完整引导
 */
export default function ApiKeyField({
  value,
  onChange,
  label,
  placeholder,
  platformUrl,
  platformName,
  steps
}: ApiKeyFieldProps) {
  const [showKey, setShowKey] = useState(false)
  // 手动展开/收起状态；null 表示跟随默认（未配置展开、已配置收起）
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null)
  const configured = value.trim().length > 0
  const expanded = manualExpanded ?? !configured

  // 已配置折叠态：一行状态条，点击进入编辑
  if (!expanded && configured) {
    return (
      <div
        className="agnes-apikey-collapsed"
        role="button"
        tabIndex={0}
        aria-label={`${label} 已配置，点击修改`}
        onClick={() => setManualExpanded(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setManualExpanded(true)
          }
        }}
      >
        <span className="agnes-apikey-status-icon">✓</span>
        <span className="agnes-apikey-status-text">{label} 已配置</span>
        <span className="agnes-apikey-mask">{maskKey(value)}</span>
        <span className="agnes-apikey-edit">修改</span>
      </div>
    )
  }

  return (
    <Card className={`agnes-apikey-section ${configured ? '' : 'agnes-apikey-section-empty'}`}>
      {/* 未配置时的步骤引导 */}
      {!configured && (
        <div className="agnes-apikey-guide">
          <span className="agnes-apikey-guide-badge">第一步</span>
          <span className="agnes-apikey-guide-text">配置 {label}，即可开始创作</span>
        </div>
      )}
      <div className="agnes-apikey-row">
        <span className="agnes-label-icon">🔑</span>
        <span className="agnes-apikey-label">{label}</span>
        <span className="agnes-apikey-required">*</span>
        {configured && (
          <button
            type="button"
            className="agnes-apikey-collapse"
            onClick={() => setManualExpanded(false)}
          >
            收起
          </button>
        )}
      </div>
      <div className="agnes-apikey-input-row">
        <Input
          type={showKey ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          allowClear
        />
        <Button size="middle" onClick={() => setShowKey(!showKey)}>
          {showKey ? '隐藏' : '显示'}
        </Button>
      </div>
      <div className="agnes-apikey-tips">
        前往{' '}
        <span
          className="agnes-apikey-tips-link"
          onClick={() => window.open(platformUrl, '_blank')}
        >
          {platformName}
        </span>{' '}
        {steps}
      </div>
    </Card>
  )
}
