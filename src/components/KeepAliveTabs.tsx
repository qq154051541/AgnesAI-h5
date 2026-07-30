import { useMemo } from 'react'
import { Tabs } from 'animal-island-ui'
import type { ReactNode } from 'react'

export interface KeepAliveTabItem {
  key: string
  label: ReactNode
  children: ReactNode
}

interface KeepAliveTabsProps {
  items: KeepAliveTabItem[]
  activeKey: string
  onChange: (key: string) => void
}

/**
 * KeepAlive 版本的 Tabs。
 *
 * 组件库的 Tabs 只渲染当前激活面板，切换 Tab 会直接把旧面板卸载，
 * 导致进行中的生成任务（请求 / 轮询 / 计时器）状态全部丢失。
 * 这里把「Tab 栏」与「内容面板」分离：所有面板保持挂载，仅通过 CSS 控制显隐，
 * 以保证任务在后台 tab 中继续执行，切回时进度、结果均完整保留。
 */
export default function KeepAliveTabs({ items, activeKey, onChange }: KeepAliveTabsProps) {
  // 仅传 key/label 给组件库 Tabs（不渲染其自带的内容容器；children 置空满足类型）
  const barItems = useMemo(
    () => items.map((t) => ({ key: t.key, label: t.label, children: null })),
    [items]
  )

  return (
    <>
      <Tabs items={barItems} activeKey={activeKey} onChange={onChange} />
      <div className="agnes-tab-panels">
        {items.map((t) => (
          <div
            key={t.key}
            className={`agnes-tab-panel${t.key === activeKey ? ' agnes-tab-panel-active' : ''}`}
            aria-hidden={t.key !== activeKey}
          >
            {t.children}
          </div>
        ))}
      </div>
    </>
  )
}
