import { Fragment, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUp, ChevronRight, ClipboardPaste, FolderPlus, PanelLeft, Star, StarOff, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { dirKey } from '@/lib/fs/directory'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

/** 路径栏：侧边栏开关、前进/后退/上级、新建文件夹/粘贴、面包屑（可拖入条目移动，对标原版 CustomPathControl） */
export function PathBar() {
  const dirChain = useAppStore(s => s.dirChain)
  const historyChains = useAppStore(s => s.historyChains)
  const historyIndex = useAppStore(s => s.historyIndex)
  const sidebarOpen = useAppStore(s => s.sidebarOpen)
  const clipboard = useAppStore(s => s.clipboard)
  const files = useAppStore(s => s.files)
  const navigateTo = useAppStore(s => s.navigateTo)
  const goUp = useAppStore(s => s.goUp)
  const goBack = useAppStore(s => s.goBack)
  const goForward = useAppStore(s => s.goForward)
  const toggleSidebar = useAppStore(s => s.toggleSidebar)
  const createFolderInCurrent = useAppStore(s => s.createFolderInCurrent)
  const pasteIntoCurrent = useAppStore(s => s.pasteIntoCurrent)
  const moveToDir = useAppStore(s => s.moveToDir)
  const favorites = useAppStore(s => s.favorites)
  const favoritesLoaded = useAppStore(s => s.favoritesLoaded)
  const loadFavorites = useAppStore(s => s.loadFavorites)
  const toggleFavoriteCurrent = useAppStore(s => s.toggleFavoriteCurrent)
  const removeFavoriteByKey = useAppStore(s => s.removeFavoriteByKey)
  const openFavorite = useAppStore(s => s.openFavorite)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  // 收藏夹懒加载（首次挂载时读一次 IDB）
  useEffect(() => {
    if (!favoritesLoaded) void loadFavorites()
  }, [favoritesLoaded, loadFavorites])

  const currentKey = dirChain.length ? dirKey(dirChain) : ''
  const isFaved = favorites.some(f => f.key === currentKey)

  const crumbDrop = (i: number) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDragOverIdx(i)
    },
    onDragLeave: () => setDragOverIdx(n => (n === i ? null : n)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDragOverIdx(null)
      const relPath = e.dataTransfer.getData('application/x-fv-move')
      const file = files.find(f => f.relPath === relPath)
      if (file) void moveToDir(file, dirChain.slice(0, i + 1))
    },
  })

  // 键盘导航：Alt+←/→ 前进后退，Backspace/W 上级，A/D 上/下一有图文件夹，S/Esc 返回
  // （对标原版 W/A/S/D 右键手势），大图或弹出层（菜单/对话框/下拉）打开时不响应，
  // 否则关闭菜单的 Esc 会连带触发导航
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useAppStore.getState()
      if (s.viewerId || !s.dirChain.length) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      // 撤销手势跳转（菜单打开时也允许）
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (s.gestureUndoStack.length) {
          e.preventDefault()
          s.undoLastGesture()
        }
        return
      }
      if (document.querySelector('[role="menu"], [role="dialog"], [role="listbox"], [role="alertdialog"]')) return
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); s.goBack(); return }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); s.goForward(); return }
      if (e.key === 'Backspace') { e.preventDefault(); s.goUp(); return }
      if (e.key === 'Escape') { s.goBack(); return }
      if (e.key === 'w' || e.key === 'W') { s.goUp(); return }
      if (e.key === 's' || e.key === 'S') { s.goBack(); return }
      if (e.key === 'a' || e.key === 'A') { void s.goSiblingImageDir(-1); return }
      if (e.key === 'd' || e.key === 'D') { void s.goSiblingImageDir(1) }
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

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={!dirChain.length}
            onClick={() => void toggleFavoriteCurrent()}
            aria-label="收藏当前文件夹"
          >
            {isFaved ? <Star className="fill-current text-amber-400" /> : <StarOff className="text-muted-foreground" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isFaved ? '从收藏夹移除' : '收藏当前文件夹'}</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="收藏夹">
                <Star />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>收藏夹</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="min-w-52">
          {favorites.length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              还没有收藏，点击星标收藏当前文件夹
            </div>
          )}
          {favorites.map((fav, i) => (
            <Fragment key={fav.key}>
              {i > 0 && <DropdownMenuSeparator />}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className={cn(
                    'min-w-0 flex-1 truncate rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                    fav.key === currentKey && 'text-primary',
                  )}
                  onClick={() => void openFavorite(fav)}
                  title={fav.key}
                >
                  {fav.name}
                  <span className="ml-1 text-[10px] text-muted-foreground">{fav.key.split('/').slice(0, -1).join('/')}</span>
                </button>
                <button
                  type="button"
                  className="mr-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                  onClick={() => void removeFavoriteByKey(fav.key)}
                  aria-label={`删除收藏 ${fav.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={!clipboard}
            onClick={() => void pasteIntoCurrent()}
            aria-label="粘贴"
          >
            <ClipboardPaste />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {clipboard
            ? `粘贴（${clipboard.mode === 'cut' ? '剪切' : '复制'} ${clipboard.entries.length} 项）`
            : '粘贴（剪贴板为空）'}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={() => void createFolderInCurrent()} aria-label="新建文件夹">
            <FolderPlus />
          </Button>
        </TooltipTrigger>
        <TooltipContent>新建文件夹</TooltipContent>
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
                {...(isLast ? {} : crumbDrop(i))}
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 hover:bg-accent',
                  isLast ? 'font-medium text-foreground' : 'text-muted-foreground',
                  dragOverIdx === i && 'ring-2 ring-primary bg-accent',
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
