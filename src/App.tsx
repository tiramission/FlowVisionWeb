import { useEffect } from 'react'
import { LoaderCircle } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ActionDialogs } from '@/components/dialogs/ActionDialogs'
import { EmptyState } from '@/components/gallery/EmptyState'
import { Gallery } from '@/components/gallery/Gallery'
import { PathBar } from '@/components/pathbar/PathBar'
import { DirTree } from '@/components/sidebar/DirTree'
import { Toolbar } from '@/components/toolbar/Toolbar'
import { Viewer } from '@/components/viewer/Viewer'
import { PINYIN_READY_EVENT } from '@/lib/search'
import { useAppStore } from '@/store/useAppStore'

const THEME_KEY = 'fv-theme'

function MainContent() {
  const status = useAppStore(s => s.status)
  const scanProgress = useAppStore(s => s.scanProgress)

  if (status === 'scanning') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <LoaderCircle className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {scanProgress
            ? scanProgress.total > 0
              ? `正在扫描 ${scanProgress.done} / ${scanProgress.total}`
              : `已找到 ${scanProgress.done} 个文件…`
            : '正在读取目录…'}
        </p>
      </div>
    )
  }
  if (status === 'ready') return <Gallery />
  return <EmptyState />
}

function App() {
  const status = useAppStore(s => s.status)
  const sidebarOpen = useAppStore(s => s.sidebarOpen)
  const viewerId = useAppStore(s => s.viewerId)
  const theme = useAppStore(s => s.theme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch { /* 隐私模式下 localStorage 可能不可用 */ }
  }, [theme])

  // 拼音字典异步加载完成后触发一次重过滤（拼音匹配从无到有）
  useEffect(() => {
    const onReady = () => useAppStore.getState().setPinyinReady()
    window.addEventListener(PINYIN_READY_EVENT, onReady)
    return () => window.removeEventListener(PINYIN_READY_EVENT, onReady)
  }, [])

  const hasRoot = status !== 'idle'

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <Toolbar />
        {hasRoot && <PathBar />}
        <div className="min-h-0 flex-1">
          {hasRoot && sidebarOpen ? (
            <ResizablePanelGroup orientation="horizontal" className="h-full">
              <ResizablePanel defaultSize="20%" minSize="12%" maxSize="40%" className="min-w-0">
                <DirTree />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel className="min-w-0">
                <main className="relative h-full">
                  <MainContent />
                </main>
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <main className="relative h-full">
              <MainContent />
            </main>
          )}
        </div>
        {viewerId && <Viewer />}
        <ActionDialogs />
      </div>
    </TooltipProvider>
  )
}

export default App
