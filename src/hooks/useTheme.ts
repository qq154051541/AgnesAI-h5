/**
 * 平台主题状态：light / dark
 * 启动从 localStorage 恢复；变更后写入 <html data-theme> 与 localStorage
 */
import { useEffect, useState, useCallback } from 'react'
import { STORAGE_KEYS } from '../config/api'
import { getStorage, setStorage } from '../utils/helpers'

export type Theme = 'light' | 'dark'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    getStorage<string>(STORAGE_KEYS.THEME) === 'dark' ? 'dark' : 'light'
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    setStorage(STORAGE_KEYS.THEME, theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, setTheme, toggle }
}