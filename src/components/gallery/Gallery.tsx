import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Film, Folder } from 'lucide-react'
import { useFileUrl } from '@/hooks/useFileUrl'
import { useSortedFiles } from '@/hooks/useSortedFiles'
import { formatBytes, formatDate } from '@/lib/format'
import { computeJustifiedRows } from '@/lib/layout/justified'
import { useAppStore } from '@/store/useAppStore'
import { aspectOf, type FileModel } from '@/types'
import { cn } from '@/lib/utils'
import { FolderTile } from './FolderTile'
import { Thumb } from './Thumb'

const PAD = 10
const GAP = 8
const DETAIL_ROW_H = 52

/** detail 布局单行（模块级组件，保证虚拟滚动行不被重挂载） */
function DetailRow({ file, selected, onSelect, onOpen }: {
  file: FileModel
  selected: boolean
  onSelect: () => void
  onOpen: () => void
}) {
  const url = useFileUrl(file.handle)
  return (
    <div
      data-file-id={file.id}
      onClick={onSelect}
      onDoubleClick={onOpen}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-md px-4',
        selected ? 'bg-accent' : 'hover:bg-accent/50',
      )}
      style={{ height: DETAIL_ROW_H }}
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
  const select = useAppStore(s => s.select)
  const openViewer = useAppStore(s => s.openViewer)
  const navigateTo = useAppStore(s => s.navigateTo)

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

  const cols = width > 0
    ? (layout === 'grid'
        ? Math.floor((width - 2 * PAD + GAP) / (columnWidth + GAP))
        : layout === 'detail' ? 1 : Math.round(width / columnWidth))
    : 1
  const colW = width > 0 ? (width - 2 * PAD - GAP * (cols - 1)) / cols : columnWidth

  // justified 行划分（memo：宽高比变化/列宽变化时重算）。传宽高比 w/h（宽度贡献）
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

  // 键盘：方向键移动选中（按布局感知列数），Enter 打开（文件夹则进入）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useAppStore.getState().viewerId) return
      if (e.key === 'Enter') {
        const selected = files.find(f => f.id === selectedId)
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
  }, [cols, moveSelection, selectedId, files, openItem])

  if (!files.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        该文件夹中没有可显示的图片或视频
      </div>
    )
  }

  const gridCell = (f: FileModel) => (
    <TileOrThumb
      key={f.id}
      file={f}
      width={columnWidth}
      height={columnWidth}
      selected={f.id === selectedId}
      onSelect={() => select(f.id)}
      onOpen={() => openItem(f)}
    />
  )

  return (
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
                {files.slice(start, start + cols).map(gridCell)}
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
                <TileOrThumb
                  file={f}
                  selected={f.id === selectedId}
                  onSelect={() => select(f.id)}
                  onOpen={() => openItem(f)}
                />
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
                {rowFiles.map(f => (
                  <TileOrThumb
                    key={f.id}
                    file={f}
                    width={row.height / aspectOf(f)}
                    height={row.height}
                    selected={f.id === selectedId}
                    onSelect={() => select(f.id)}
                    onOpen={() => openItem(f)}
                  />
                ))}
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
                  <DetailRow
                    file={f}
                    selected={f.id === selectedId}
                    onSelect={() => select(f.id)}
                    onOpen={() => openItem(f)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** 文件夹渲染堆叠瓦片，媒体渲染缩略图 */
function TileOrThumb(props: {
  file: FileModel
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  width?: number
  height?: number
}) {
  const { file, ...rest } = props
  if (file.type === 'folder') {
    return <FolderTile file={file} {...rest} />
  }
  return <Thumb file={file} {...rest} />
}
