import { useEffect, useState } from 'react'

/** 阶段性提示文案：按已等待秒数递进 */
const STAGE_HINTS = [
  { until: 8, text: 'AI 正在理解你的描述' },
  { until: 20, text: '正在勾勒画面构图' },
  { until: 40, text: '正在渲染细节与色彩' },
  { until: Infinity, text: '即将完成，请再稍候' }
] as const

interface StageHintResult {
  /** 当前阶段提示文案 */
  hint: string
  /** 已等待秒数 */
  elapsed: number
}

/**
 * 生成等待阶段提示 Hook
 * @param active 是否处于加载中
 */
export function useStageHint(active: boolean): StageHintResult {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!active) {
      setElapsed(0)
      return
    }
    const timer = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => window.clearInterval(timer)
  }, [active])

  const hint = (STAGE_HINTS.find((h) => elapsed < h.until) ?? STAGE_HINTS[STAGE_HINTS.length - 1]).text
  return { hint, elapsed }
}
