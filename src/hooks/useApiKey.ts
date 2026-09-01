/**
 * 通用平台 API Key 状态管理
 * 启动时从 localStorage 恢复，变更后自动持久化（仅在非空时写入）
 */
import { useEffect, useCallback } from 'react'
import { useState } from 'react'
import { getStorage, setStorage } from '../utils/helpers'

export interface ApiKeyState {
  value: string
  onChange: (next: string) => void
}

/** 单一 Key：启动恢复 + change 持久化 */
export function useApiKey(storageKey: string): ApiKeyState {
  const [value, setValue] = useState('')

  useEffect(() => {
    const saved = getStorage<string>(storageKey)
    if (saved) setValue(saved)
  }, [storageKey])

  const onChange = useCallback(
    (next: string) => {
      setValue(next)
      const trimmed = next.trim()
      if (trimmed) setStorage(storageKey, trimmed)
    },
    [storageKey]
  )

  return { value, onChange }
}