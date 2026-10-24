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
import { VIDEO_EXTENSIONS } from '@/lib/fs/constants'
import { useGlobalRightClick } from '@/hooks/useGlobalRightClick'
import { PwaControls } from '@/components/pwa/PwaControls'
import { RestoreBanner, useSessionRestore } from '@/components/pwa/SessionRestore'
import { useTitlebarTheme } from '@/hooks/useTitlebarTheme'
import { useAppStore } from '@/store/useAppStore'
import type { FileModel } from '@/types'

/** PWA file_handler 启动：系统「打开方式」传入图片 → 虚拟目录展示 */
function useLaunchFiles() {
  useEffect(() => {
    const nav = navigator as Navigator & { launchQueue?: { setConsumer: (cb: (params: { files: FileSystemFileHandle[] }) => void) => void } }
    nav.launchQueue?.setConsumer(async params => {
      if (!params.files?.length) return
      const models: FileModel[] = []
      for (const fh of params.files) {
        try {
          const file = await fh.getFile()
          const dot = fh.name.lastIndexOf('.')
          const ext = dot === -1 ? '' : fh.name.slice(dot + 1).toLowerCase()
          if (!FILE_EXT_OK(ext)) continue
          models.push({
            id: fh.name,
            name: fh.name,
            relPath: fh.name,
            ext,
            type: VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image',
            size: file.size,
            lastModified: file.lastModified,
            handle: fh,
          })
        } catch { /* 跳过不可读文件 */ }
      }
      if (models.length) useAppStore.getState().setLaunchFiles(models)
    })
  }, [])
}

function FILE_EXT_OK(ext: string): boolean {
  // 与画廊一致：受支持的图片/视频扩展名
  return VIDEO_EXTENSIONS.has(ext) || ['jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg', 'ico', 'apng'].includes(ext)
}

function MainContent() {
  const status = useAppStore(s => s.status)
  const scanProgress = useAppStore(s => s.scanProgress)
  const launchFiles = useAppStore(s => s.launchFiles)

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
  // PWA 启动文件（系统「打开方式」）：直接进画廊浏览
  if (status === 'idle' && launchFiles.length > 0) return <Gallery />
  if (status === 'ready') return <Gallery />
  return <EmptyState />
}

function App() {
  const status = useAppStore(s => s.status)
  const sidebarOpen = useAppStore(s => s.sidebarOpen)
  const viewerId = useAppStore(s => s.viewerId)
  const theme = useAppStore(s => s.theme)
  const settings = useAppStore(s => s.settings)

  // 全应用右键接管 + 手势（应用全生命周期，含空状态/加载态）
  useGlobalRightClick()
  // PWA 启动文件（系统打开方式）
  useLaunchFiles()
  // 启动恢复上次浏览目录
  useSessionRestore()
  // 标题栏颜色跟随主题
  useTitlebarTheme()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // 设置持久化（theme 由 themeMode 派生，不单独存）
  useEffect(() => {
    try {
      localStorage.setItem('fv-settings', JSON.stringify(settings))
    } catch { /* 隐私模式下 localStorage 可能不可用 */ }
  }, [settings])

  // 跟随系统主题：系统切换时实时响应
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => useAppStore.getState().syncSystemTheme()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

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
        <PwaControls />
        <RestoreBanner />
      </div>
    </TooltipProvider>
  )
}

export default App
