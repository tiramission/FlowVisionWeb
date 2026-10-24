import { Fragment, useEffect } from 'react'
import { ArrowLeft, ArrowRight, ArrowUp, ChevronRight, PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

/** 路径栏：侧边栏开关、前进/后退/上级、面包屑（对标原版 CustomPathControl） */
export function PathBar() {
  const dirChain = useAppStore(s => s.dirChain)
  const historyChains = useAppStore(s => s.historyChains)
  const historyIndex = useAppStore(s => s.historyIndex)
  const sidebarOpen = useAppStore(s => s.sidebarOpen)
  const navigateTo = useAppStore(s => s.navigateTo)
  const goUp = useAppStore(s => s.goUp)
  const goBack = useAppStore(s => s.goBack)
  const goForward = useAppStore(s => s.goForward)
  const toggleSidebar = useAppStore(s => s.toggleSidebar)

  // 键盘导航：Alt+←/→ 前进后退，Backspace/W 上级，S/Esc 返回（对标原版 W/S 手势），大图打开时不响应
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useAppStore.getState()
      if (s.viewerId || !s.dirChain.length) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); s.goBack(); return }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); s.goForward(); return }
      if (e.key === 'Backspace') { e.preventDefault(); s.goUp(); return }
      if (e.key === 'Escape') { s.goBack(); return }
      if (e.key === 'w' || e.key === 'W') { s.goUp(); return }
      if (e.key === 's' || e.key === 'S') { s.goBack() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const canBack = historyIndex > 0
  const canForward = historyIndex >= 0 && historyIndex < historyChains.length - 1
  const canUp = dirChain.length > 1

  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 border-b bg-background px-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label="切换侧边栏"
            className={cn(!sidebarOpen && 'text-muted-foreground')}
          >
            <PanelLeft />
          </Button>
        </TooltipTrigger>
        <TooltipContent>侧边栏</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={goBack} disabled={!canBack} aria-label="后退">
            <ArrowLeft />
          </Button>
        </TooltipTrigger>
        <TooltipContent>后退（Alt+← / S）</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={goForward} disabled={!canForward} aria-label="前进">
            <ArrowRight />
          </Button>
        </TooltipTrigger>
        <TooltipContent>前进（Alt+→）</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={goUp} disabled={!canUp} aria-label="上级目录">
            <ArrowUp />
          </Button>
        </TooltipTrigger>
        <TooltipContent>上级目录（W / Backspace）</TooltipContent>
      </Tooltip>

      <nav
        className="ml-2 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto whitespace-nowrap text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="路径"
      >
        {dirChain.map((handle, i) => {
          const isLast = i === dirChain.length - 1
          return (
            <Fragment key={`${i}-${handle.name}`}>
              {i > 0 && <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />}
              <button
                type="button"
                onClick={() => void navigateTo(dirChain.slice(0, i + 1))}
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 hover:bg-accent',
                  isLast ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {handle.name}
              </button>
            </Fragment>
          )
        })}
      </nav>
    </div>
  )
}
