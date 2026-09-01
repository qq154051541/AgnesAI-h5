import React from 'react'
import ReactDOM from 'react-dom/client'
import 'animal-island-ui/style'
import App from './App'
import './styles/App.css'
import { STORAGE_KEYS } from './config/api'

// 渲染前同步主题，避免首屏浅色闪烁
try {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME)
  if (savedTheme === '"dark"' || savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark')
  }
} catch {
  // ignore
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
