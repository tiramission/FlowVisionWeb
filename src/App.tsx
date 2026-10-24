import { useEffect } from 'react'
import { LoaderCircle } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EmptyState } from '@/components/gallery/EmptyState'
import { Gallery } from '@/components/gallery/Gallery'
import { Toolbar } from '@/components/toolbar/Toolbar'
import { Viewer } from '@/components/viewer/Viewer'
import { useAppStore } from '@/store/useAppStore'

const THEME_KEY = 'fv-theme'

function App() {
  const status = useAppStore(s => s.status)
  const scanProgress = useAppStore(s => s.scanProgress)
  const viewerId = useAppStore(s => s.viewerId)
  const theme = useAppStore(s => s.theme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch { /* 隐私模式下 localStorage 可能不可用 */ }
  }, [theme])

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <Toolbar />
        <main className="relative min-h-0 flex-1">
          {status === 'idle' && <EmptyState />}
          {status === 'scanning' && (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <LoaderCircle className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {scanProgress ? `正在扫描 ${scanProgress.done} / ${scanProgress.total}` : '正在读取目录…'}
              </p>
            </div>
          )}
          {status === 'ready' && <Gallery />}
        </main>
        {viewerId && <Viewer />}
      </div>
    </TooltipProvider>
  )
}

export default App
