import { useCallback, useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useSortedFiles } from '@/hooks/useSortedFiles'
import { useAppStore } from '@/store/useAppStore'
import { aspectOf } from '@/types'
import { Thumb } from './Thumb'

const PAD = 10
const GAP = 8

export function Gallery() {
  const files = useSortedFiles()
  const layout = useAppStore(s => s.layout)
  const columnWidth = useAppStore(s => s.columnWidth)
  const selectedId = useAppStore(s => s.selectedId)
  const dirChain = useAppStore(s => s.dirChain)
  const select = useAppStore(s => s.select)
  const openViewer = useAppStore(s => s.openViewer)

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

  // 网格：按固定列宽取整；瀑布流：按目标列宽四舍五入
  const cols = width > 0
    ? (layout === 'grid'
        ? Math.floor((width - 2 * PAD + GAP) / (columnWidth + GAP))
        : Math.round(width / columnWidth))
    : 1
  const colW = width > 0 ? (width - 2 * PAD - GAP * (cols - 1)) / cols : columnWidth
  const rowCount = Math.ceil(files.length / cols)

  // 网格：按行虚拟化，行高 = 单元格 + 间距
  const rowVirtualizer = useVirtualizer({
    count: layout === 'grid' ? rowCount : 0,
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

  // 估算值变化（列宽/列数/尺寸回填）后重算布局
  useEffect(() => { rowVirtualizer.measure() }, [width, columnWidth, layout, rowVirtualizer])
  useEffect(() => { laneVirtualizer.measure() }, [files, width, cols, colW, layout, laneVirtualizer])

  // 选中项滚动到可见区域
  useEffect(() => {
    if (!selectedId) return
    const el = scrollRef.current?.querySelector(`[data-file-id="${CSS.escape(selectedId)}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selectedId])

  const moveSelection = useCallback((delta: number) => {
    if (!files.length) return
    const cur = files.findIndex(f => f.id === selectedId)
    const next = Math.min(files.length - 1, Math.max(0, (cur === -1 ? 0 : cur) + delta))
    select(files[next].id)
  }, [files, selectedId, select])

  // 键盘：方向键移动选中（按布局感知列数），Enter 打开大图
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useAppStore.getState().viewerId) return
      if (e.key === 'Enter') {
        if (selectedId) openViewer(selectedId)
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
  }, [cols, moveSelection, selectedId, openViewer])

  if (!files.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        该文件夹中没有可显示的图片或视频
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain">
      {layout === 'grid' ? (
        <div className="relative" style={{ height: rowVirtualizer.getTotalSize() + PAD * 2 }}>
          {rowVirtualizer.getVirtualItems().map(vr => {
            const start = vr.index * cols
            const rowFiles = files.slice(start, start + cols)
            return (
              <div
                key={vr.key}
                className="absolute top-0 flex"
                style={{ left: PAD, right: PAD, gap: GAP, transform: `translateY(${vr.start + PAD}px)` }}
              >
                {rowFiles.map(f => (
                  <Thumb
                    key={f.id}
                    file={f}
                    width={columnWidth}
                    height={columnWidth}
                    selected={f.id === selectedId}
                    onSelect={() => select(f.id)}
                    onOpen={() => openViewer(f.id)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      ) : (
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
                <Thumb
                  file={f}
                  selected={f.id === selectedId}
                  onSelect={() => select(f.id)}
                  onOpen={() => openViewer(f.id)}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
