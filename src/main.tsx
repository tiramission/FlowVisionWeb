import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useAppStore } from './store/useAppStore.ts'
import { thumbCache } from './lib/thumb/cache.ts'

// 开发模式下暴露 store 与缩略图缓存，便于在浏览器控制台调试与自动化验证
if (import.meta.env.DEV) {
  const w = window as unknown as { __store: typeof useAppStore; __thumbCache: typeof thumbCache }
  w.__store = useAppStore
  w.__thumbCache = thumbCache
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
