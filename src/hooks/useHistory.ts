/**
 * 历史记录通用能力
 * - 启动从 localStorage 恢复（自动把"生成中"标记为"已中断"）
 * - saveHistory：变更后写入 localStorage
 * - startTaskRecord / finishTaskRecord：构造、写入、终态回写历史条目
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Notification } from 'animal-island-ui'
import { getStorage, setStorage, normalizeHistoryOnLoad } from '../utils/helpers'
import type { TaskStatus } from '../types'

export interface UseHistoryResult<T extends { id?: string; status?: TaskStatus }> {
  history: T[]
  setHistory: React.Dispatch<React.SetStateAction<T[]>>
  saveHistory: (items: T[]) => void
  clearHistory: () => void
  deleteHistory: (id: string) => void
  startTaskRecord: (record: Omit<T, 'id' | 'time' | 'status'>) => string
  finishTaskRecord: (id: string, patch: Partial<T>) => void
}

export function useHistory<T extends { id?: string; time: number; status?: TaskStatus }>(
  storageKey: string
): UseHistoryResult<T> {
  const [history, setHistory] = useState<T[]>([])
  /** saveHistory 的 ref 化，供初始化 effect 使用 */
  const saveHistoryRef = useRef<((items: T[]) => void) | null>(null)

  useEffect(() => {
    const saved = getStorage<T[]>(storageKey)
    if (saved && Array.isArray(saved)) {
      // 旧记录无 id 字段时，用 time 兜底，确保 deleteHistory/finishTaskRecord 可用
      const withIds = saved.map((it) => it.id ? it : ({ ...it, id: `legacy-${it.time}` } as T))
      const fixed = normalizeHistoryOnLoad(withIds) as T[]
      setHistory(fixed)
      saveHistoryRef.current?.(fixed)
    }
  }, [storageKey])

  const saveHistory = useCallback((items: T[]) => {
    setStorage(storageKey, items)
  }, [storageKey])
  saveHistoryRef.current = saveHistory

  const clearHistory = useCallback(() => {
    setHistory([])
    saveHistory([])
    Notification.success('已清空历史记录')
  }, [saveHistory])

  const deleteHistory = useCallback(
    (id: string) => {
      setHistory((prev) => {
        const next = prev.filter((it) => it.id !== id)
        saveHistory(next)
        return next
      })
    },
    [saveHistory]
  )

  /** 任务开始时立即写入一条「生成中」历史，防止任务丢失 */
  const startTaskRecord = useCallback(
    (record: Omit<T, 'id' | 'time' | 'status'>): string => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const full = { ...record, id, time: Date.now(), status: 'generating' as TaskStatus } as unknown as T
      setHistory((prev) => {
        const next = [full, ...prev].slice(0, 50)
        saveHistory(next)
        return next
      })
      return id
    },
    [saveHistory]
  )

  /** 任务结束后回写状态（成功 / 失败 / 中断） */
  const finishTaskRecord = useCallback(
    (id: string, patch: Partial<T>) => {
      setHistory((prev) => {
        const next = prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
        saveHistory(next)
        return next
      })
    },
    [saveHistory]
  )

  return { history, setHistory, saveHistory, clearHistory, deleteHistory, startTaskRecord, finishTaskRecord }
}