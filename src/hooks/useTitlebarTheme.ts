import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'

/** 标题栏颜色跟随应用主题：Chrome 93+ 会用页面 meta[name=theme-color]
 *  实时渲染 PWA 窗口标题栏（无需重装/重启）。亮色白、暗色近黑 */
const THEME_COLORS: Record<'light' | 'dark', string> = {
  light: '#ffffff',
  dark: '#18181b', // zinc-900，与暗色 bg-background 一致
}

export function useTitlebarTheme() {
  const theme = useAppStore(s => s.theme)

  useEffect(() => {
    const color = THEME_COLORS[theme]
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'theme-color')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', color)
  }, [theme])
}
