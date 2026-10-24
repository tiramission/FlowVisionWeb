import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useAppStore } from './store/useAppStore.ts'

// 开发模式下暴露 store，便于在浏览器控制台调试与自动化验证
if (import.meta.env.DEV) {
  ;(window as unknown as { __store: typeof useAppStore }).__store = useAppStore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
