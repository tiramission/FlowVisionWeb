import { cloneElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Film, Folder } from 'lucide-react'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { useFileUrl } from '@/hooks/useFileUrl'
import { useSortedFiles } from '@/hooks/useSortedFiles'
import { useThumbUrl } from '@/hooks/useThumbUrl'
import { dirKey } from '@/lib/fs/directory'
import { formatBytes, formatDate } from '@/lib/format'
import { computeJustifiedRows } from '@/lib/layout/justified'
import { DIRECT_EXTS, PRELOAD_NEXT, PRELOAD_PRE, thumbCache } from '@/lib/thumb/cache'
import { useAppStore, type ClipEntry } from '@/store/useAppStore'
import { aspectOf, type FileModel } from '@/types'
import { cn } from '@/lib/utils'
import { FolderTile } from './FolderTile'
import { Thumb } from './Thumb'

const PAD = 10
const GAP = 8
const DETAIL_ROW_H = 52

function clipEntryOf(file: FileModel): ClipEntry | null {
  const handle = file.handle ?? file.dirHandle
  return handle ? { name: file.name, handle } : null
}

/** 条目右键菜单（打开/复制/剪切/重命名/删除）。children 必须是透传 HTML 属性的瓦片组件，
 *  asChild 才能把 contextmenu 事件挂到真实 DOM 上；变淡用 cloneElement 注入 className */
function ItemMenu({ file, onOpen, dimmed, children }: {
  file: FileModel
  onOpen: () => void
  dimmed: boolean
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>
}) {
  const copyEntries = useAppStore(s => s.copyEntries)
  const cutEntries = useAppStore(s => s.cutEntries)
  const setRenameTarget = useAppStore(s => s.setRenameTarget)
  const setDeleteTarget = useAppStore(s => s.setDeleteTarget)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {dimmed
          ? cloneElement(children, { className: `${children.props.className ?? ''} opacity-50`.trim() })
          : children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onOpen}>
          {file.type === 'folder' ? '打开' : '查看大图'}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => { const e = clipEntryOf(file); if (e) copyEntries([e]) }}
        >
          复制
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => { const e = clipEntryOf(file); if (e) cutEntries([e]) }}
        >
          剪切
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => setRenameTarget(file)}>重命名…</ContextMenuItem>
        <ContextMenuItem className="text-destructive" onClick={() => setDeleteTarget(file)}>
          删除…
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** detail 布局单行（模块级组件，保证虚拟滚动行不被重挂载；透传属性供 asChild 挂事件） */
function DetailRow({ file, selected, dimmed, onSelect, onOpen, className, ...rest }: {
  file: FileModel
  selected: boolean
  dimmed: boolean
  onSelect: () => void
  onOpen: () => void
} & React.HTMLAttributes<HTMLDivElement>) {
  const thumbable = file.type === 'image' && !DIRECT_EXTS.has(file.ext)
  const thumb = useThumbUrl(thumbable ? file : null)
  const direct = useFileUrl(!thumbable && file.type === 'image' ? file.handle : null)
  const url = thumb.url ?? direct
  return (
    <div
      data-file-id={file.id}
      onClick={onSelect}
      onDoubleClick={onOpen}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-md px-4',
        selected ? 'bg-accent' : 'hover:bg-accent/50',
        dimmed && 'opacity-50',
        className,
      )}
      style={{ height: DETAIL_ROW_H }}
      {...rest}
    >
      <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
        {file.type === 'folder' ? (
          <Folder className="size-5 text-primary" />
        ) : file.type === 'video' ? (
          <Film className="size-5 text-muted-foreground" />
        ) : url ? (
          <img src={url} alt={file.name} draggable={false} decoding="async" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{file.name}</div>
        {file.relPath !== file.name && (
          <div className="truncate text-xs text-muted-foreground">{file.relPath}</div>
        )}
      </div>
      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {file.width && file.height ? `${file.width}×${file.height}` : '—'}
      </span>
      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {formatBytes(file.size)}
      </span>
      <span className="w-36 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {formatDate(file.lastModified)}
      </span>
    </div>
  )
}

export function Gallery() {
  const files = useSortedFiles()
  const layout = useAppStore(s => s.layout)
  const columnWidth = useAppStore(s => s.columnWidth)
  const selectedId = useAppStore(s => s.selectedId)
  const dirChain = useAppStore(s => s.dirChain)
  const totalFiles = useAppStore(s => s.files.length)
  const searchQuery = useAppStore(s => s.searchQuery)
  const clipboard = useAppStore(s => s.clipboard)
  const select = useAppStore(s => s.select)
  const openViewer = useAppStore(s => s.openViewer)
  const navigateTo = useAppStore(s => s.navigateTo)
  const pasteIntoCurrent = useAppStore(s => s.pasteIntoCurrent)
  const createFolderInCurrent = useAppStore(s => s.createFolderInCurrent)
  const setRenameTarget = useAppStore(s => s.setRenameTarget)
  const setDeleteTarget = useAppStore(s => s.setDeleteTarget)
  const copyEntries = useAppStore(s => s.copyEntries)
  const cutEntries = useAppStore(s => s.cutEntries)

  // 剪切中的条目变淡（对标原版 cutItemPaths 变淡效果）
  const cutNames = useMemo(() => {
    if (clipboard?.mode !== 'cut' || !dirChain.length) return null
    if (clipboard.sourceDirKey !== dirKey(dirChain)) return null
    return new Set(clipboard.entries.map(e => e.name))
  }, [clipboard, dirChain])

  const scrollRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [dirChain])

  // 网格：按目标列宽取整；瀑布流：四舍五入；justified/detail 同瀑布流（键盘导航用）
  const cols = width > 0
    ? (layout === 'grid'
        ? Math.floor((width - 2 * PAD + GAP) / (columnWidth + GAP))
        : Math.round(width / columnWidth))
    : 1
  const colW = width > 0 ? (width - 2 * PAD - GAP * (cols - 1)) / cols : columnWidth

  const justRows = useMemo(() => {
    if (layout !== 'justified' || width <= 0) return []
    return computeJustifiedRows(files.map(f => 1 / aspectOf(f)), width - 2 * PAD, columnWidth, GAP)
  }, [layout, width, columnWidth, files])

  // 网格：按行虚拟化，行高 = 单元格 + 间距
  const rowVirtualizer = useVirtualizer({
    count: layout === 'grid' ? Math.ceil(files.length / cols) : 0,
    estimateSize: () => columnWidth + GAP,
    getScrollElement: () => scrollRef.current,
    overscan: 5,
  })
  // 瀑布流：lanes 模式（masonry），尺寸由宽高比精确估算
  const laneVirtualizer = useVirtualizer({
    count: layout === 'waterfall' ? files.length : 0,
    estimateSize: i => colW * aspectOf(files[i]) + GAP,
    lanes: cols,
    getScrollElement: () => scrollRef.current,
    overscan: 8,
  })
  // justified：按行虚拟化，行高不均匀
  const justVirtualizer = useVirtualizer({
    count: justRows.length,
    estimateSize: i => (justRows[i]?.height ?? columnWidth) + GAP,
    getScrollElement: () => scrollRef.current,
    overscan: 6,
  })
  // detail：统一行高
  const detailVirtualizer = useVirtualizer({
    count: layout === 'detail' ? files.length : 0,
    estimateSize: () => DETAIL_ROW_H,
    getScrollElement: () => scrollRef.current,
    overscan: 10,
  })

  useEffect(() => { rowVirtualizer.measure() }, [width, columnWidth, layout, rowVirtualizer])
  useEffect(() => { laneVirtualizer.measure() }, [files, width, cols, colW, layout, laneVirtualizer])
  useEffect(() => { justVirtualizer.measure() }, [justRows, justVirtualizer])
  useEffect(() => { detailVirtualizer.measure() }, [layout, detailVirtualizer])

  // 滚动方向预加载窗口（对标原版 PRELOAD_THUMB_RANGE_PRE/NEXT）
  const visibleRange = (() => {
    if (layout === 'grid') {
      const items = rowVirtualizer.getVirtualItems()
      if (!items.length) return null
      return {
        first: items[0].index * cols,
        last: Math.min(files.length - 1, (items[items.length - 1].index + 1) * cols - 1),
      }
    }
    if (layout === 'justified') {
      const items = justVirtualizer.getVirtualItems()
      if (!items.length || !justRows.length) return null
      const firstRow = justRows[items[0].index]
      const lastRow = justRows[items[items.length - 1].index]
      if (!firstRow || !lastRow) return null
      return { first: firstRow.start, last: lastRow.start + lastRow.count - 1 }
    }
    const items = layout === 'waterfall' ? laneVirtualizer.getVirtualItems() : detailVirtualizer.getVirtualItems()
    if (!items.length) return null
    return { first: items[0].index, last: items[items.length - 1].index }
  })()

  useEffect(() => {
    if (!visibleRange || !files.length) return
    const lo = Math.max(0, visibleRange.first - PRELOAD_PRE)
    const hi = Math.min(files.length - 1, visibleRange.last + PRELOAD_NEXT)
    if (lo > hi) return
    thumbCache.preload(files.slice(lo, hi + 1))
  }, [visibleRange?.first, visibleRange?.last, files])

  // 选中项滚动到可见区域
  useEffect(() => {
    if (!selectedId) return
    const el = scrollRef.current?.querySelector(`[data-file-id="${CSS.escape(selectedId)}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selectedId])

  const openItem = useCallback((file: FileModel) => {
    if (file.type === 'folder' && file.dirHandle) {
      void navigateTo([...dirChain, file.dirHandle])
    } else {
      openViewer(file.id)
    }
  }, [dirChain, navigateTo, openViewer])

  const moveSelection = useCallback((delta: number) => {
    if (!files.length) return
    const cur = files.findIndex(f => f.id === selectedId)
    const next = Math.min(files.length - 1, Math.max(0, (cur === -1 ? 0 : cur) + delta))
    select(files[next].id)
  }, [files, selectedId, select])

  // 键盘：方向键移动选中（感知布局列数）、Enter 打开、文件管理快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useAppStore.getState().viewerId) return
      const target = e.target as HTMLElement | null
      const inField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      const selected = selectedId ? files.find(f => f.id === selectedId) : undefined

      if ((e.ctrlKey || e.metaKey) && !inField) {
        if (e.key.toLowerCase() === 'c' && selected) {
          const entry = clipEntryOf(selected)
          if (entry) { e.preventDefault(); copyEntries([entry]) }
          return
        }
        if (e.key.toLowerCase() === 'x' && selected) {
          const entry = clipEntryOf(selected)
          if (entry) { e.preventDefault(); cutEntries([entry]) }
          return
        }
        if (e.key.toLowerCase() === 'v') {
          e.preventDefault()
          void pasteIntoCurrent()
          return
        }
      }
      if (inField) return
      if (e.key === 'F2' && selected) {
        e.preventDefault()
        setRenameTarget(selected)
        return
      }
      if (e.key === 'Delete' && selected) {
        e.preventDefault()
        setDeleteTarget(selected)
        return
      }
      if (e.key === 'Enter') {
        if (selected) openItem(selected)
        return
      }
      const deltas: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -cols,
        ArrowDown: cols,
      }
      const delta = deltas[e.key]
      if (delta) {
        e.preventDefault()
        moveSelection(delta)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cols, moveSelection, selectedId, files, openItem, copyEntries, cutEntries, pasteIntoCurrent, setRenameTarget, setDeleteTarget])

  if (!files.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {searchQuery && totalFiles > 0
          ? `没有匹配「${searchQuery}」的文件`
          : '该文件夹中没有可显示的图片或视频'}
      </div>
    )
  }

  const withMenu = (f: FileModel, node: React.ReactElement<React.HTMLAttributes<HTMLElement>>) => (
    <ItemMenu key={f.id} file={f} dimmed={!!cutNames?.has(f.name)} onOpen={() => openItem(f)}>
      {node}
    </ItemMenu>
  )

  const tile = (f: FileModel, size?: { width?: number; height?: number }) => (
    <TileOrThumb
      file={f}
      width={size?.width}
      height={size?.height}
      selected={f.id === selectedId}
      onSelect={() => select(f.id)}
      onOpen={() => openItem(f)}
    />
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain">
          {layout === 'grid' && (
            <div className="relative" style={{ height: rowVirtualizer.getTotalSize() + PAD * 2 }}>
              {rowVirtualizer.getVirtualItems().map(vr => {
                const start = vr.index * cols
                return (
                  <div
                    key={vr.key}
                    className="absolute top-0 flex"
                    style={{ left: PAD, right: PAD, gap: GAP, transform: `translateY(${vr.start + PAD}px)` }}
                  >
                    {files.slice(start, start + cols).map(f => withMenu(f, tile(f, { width: columnWidth, height: columnWidth })))}
                  </div>
                )
              })}
            </div>
          )}

          {layout === 'waterfall' && (
            <div className="relative" style={{ height: laneVirtualizer.getTotalSize() + PAD * 2 }}>
              {laneVirtualizer.getVirtualItems().map(v => {
                const f = files[v.index]
                if (!f) return null
                return (
                  <div
                    key={v.key}
                    className="absolute left-0 top-0"
                    style={{
                      width: colW,
                      height: Math.max(1, v.size - GAP),
                      transform: `translate(${PAD + v.lane * (colW + GAP)}px, ${v.start + PAD}px)`,
                    }}
                  >
                    {withMenu(f, tile(f))}
                  </div>
                )
              })}
            </div>
          )}

          {layout === 'justified' && (
            <div className="relative" style={{ height: justVirtualizer.getTotalSize() + PAD * 2 }}>
              {justVirtualizer.getVirtualItems().map(v => {
                const row = justRows[v.index]
                if (!row) return null
                const rowFiles = files.slice(row.start, row.start + row.count)
                return (
                  <div
                    key={v.key}
                    className="absolute top-0 flex"
                    style={{ left: PAD, right: PAD, gap: GAP, height: row.height, transform: `translateY(${v.start + PAD}px)` }}
                  >
                    {rowFiles.map(f => withMenu(f, tile(f, {
                      width: row.height / aspectOf(f),
                      height: row.height,
                    })))}
                  </div>
                )
              })}
            </div>
          )}

          {layout === 'detail' && (
            <div>
              <div className="sticky top-0 z-10 flex h-9 items-center gap-3 border-b bg-background px-4 text-xs text-muted-foreground">
                <span className="w-11 shrink-0" />
                <span className="min-w-0 flex-1">名称</span>
                <span className="w-24 shrink-0 text-right">尺寸</span>
                <span className="w-20 shrink-0 text-right">大小</span>
                <span className="w-36 shrink-0 text-right">修改日期</span>
              </div>
              <div className="relative" style={{ height: detailVirtualizer.getTotalSize() + PAD, paddingTop: PAD }}>
                {detailVirtualizer.getVirtualItems().map(v => {
                  const f = files[v.index]
                  if (!f) return null
                  return (
                    <div
                      key={v.key}
                      className="absolute left-0 right-0"
                      style={{ transform: `translateY(${v.start}px)` }}
                    >
                      {withMenu(f, (
                        <DetailRow
                          file={f}
                          selected={f.id === selectedId}
                          dimmed={!!cutNames?.has(f.name)}
                          onSelect={() => select(f.id)}
                          onOpen={() => openItem(f)}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={!clipboard}
          onClick={() => void pasteIntoCurrent()}
        >
          粘贴{clipboard ? `（${clipboard.entries.length} 项）` : ''}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void createFolderInCurrent()}>新建文件夹</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** 文件夹渲染堆叠瓦片，媒体渲染缩略图（透传属性供 asChild 挂事件） */
function TileOrThumb(props: {
  file: FileModel
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  width?: number
  height?: number
} & React.HTMLAttributes<HTMLDivElement>) {
  const { file, ...rest } = props
  if (file.type === 'folder') {
    return <FolderTile file={file} {...rest} />
  }
  return <Thumb file={file} {...rest} />
}
