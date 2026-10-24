import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize, X, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useFileUrl } from '@/hooks/useFileUrl'
import { useSortedFiles } from '@/hooks/useSortedFiles'
import { useAppStore } from '@/store/useAppStore'

const MIN_SCALE = 0.05
const MAX_SCALE = 32
const WHEEL_FACTOR = 0.0015

export function Viewer() {
  const viewerId = useAppStore(s => s.viewerId)
  const closeViewer = useAppStore(s => s.closeViewer)
  const setViewerId = useAppStore(s => s.setViewerId)
  const files = useSortedFiles()

  const index = viewerId ? files.findIndex(f => f.id === viewerId) : -1
  const file = index >= 0 ? files[index] : null
  const url = useFileUrl(file?.handle)

  const containerRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(
    file?.width && file?.height ? { width: file.width, height: file.height } : null,
  )
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  // 滚轮等非 React 事件里读取最新视图状态
  const viewRef = useRef({ scale: 1, offset: { x: 0, y: 0 } })
  viewRef.current = { scale, offset }

  const fitScale = () => {
    const el = containerRef.current
    if (!el || !natural) return 1
    return Math.min(el.clientWidth / natural.width, el.clientHeight / natural.height)
  }

  const resetView = () => {
    setScale(fitScale())
    setOffset({ x: 0, y: 0 })
  }

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const el = containerRef.current
    if (!el || !natural) return
    const rect = el.getBoundingClientRect()
    // 以光标为锚点缩放：保持光标处的图像坐标不动
    const px = clientX - rect.left - rect.width / 2
    const py = clientY - rect.top - rect.height / 2
    const { scale: s, offset: o } = viewRef.current
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor))
    const k = next / s
    setScale(next)
    setOffset({ x: px - (px - o.x) * k, y: py - (py - o.y) * k })
  }
  const zoomAtRef = useRef(zoomAt)
  zoomAtRef.current = zoomAt

  const zoomCenter = (factor: number) => {
    const el = containerRef.current
    if (!el) return
    zoomAtRef.current(el.clientWidth / 2, el.clientHeight / 2, factor)
  }

  const nav = (delta: number) => {
    const next = files[index + delta]
    if (next) setViewerId(next.id)
  }

  // 切换图片时重置
  useEffect(() => {
    setNatural(file?.width && file?.height ? { width: file.width, height: file.height } : null)
  }, [file?.id])
  // 尺寸就绪后适配窗口
  useLayoutEffect(() => { resetView() }, [file?.id, natural])

  // 滚轮缩放需要非 passive 监听才能 preventDefault
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAtRef.current(e.clientX, e.clientY, Math.exp(-e.deltaY * WHEEL_FACTOR))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // 键盘：Esc 关闭、←/→ 切换、+/- 缩放、0 适应窗口、1 原始大小
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeViewer(); return }
      if (e.key === 'ArrowLeft') { nav(-1); return }
      if (e.key === 'ArrowRight') { nav(1); return }
      if (e.key === '+' || e.key === '=') { zoomCenter(1.25); return }
      if (e.key === '-') { zoomCenter(1 / 1.25); return }
      if (e.key === '0') { resetView(); return }
      if (e.key === '1' && natural) { setScale(1); setOffset({ x: 0, y: 0 }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // 拖拽平移
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, ox: viewRef.current.offset.x, oy: viewRef.current.offset.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    setOffset({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y })
  }
  const onPointerUp = () => { dragRef.current = null }

  if (!file) return null

  const stopForControls = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation()

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex select-none flex-col bg-black/95 text-white cursor-grab active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={closeViewer}
    >
      <div
        className="relative z-10 flex h-12 shrink-0 items-center gap-2 px-3"
        onPointerDown={stopForControls}
        onDoubleClick={stopForControls}
      >
        <span className="min-w-0 truncate text-sm" title={file.name}>{file.name}</span>
        {natural && <span className="shrink-0 text-xs text-white/60">{natural.width}×{natural.height}</span>}
        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={() => zoomCenter(1 / 1.25)} aria-label="缩小">
                <ZoomOut />
              </Button>
            </TooltipTrigger>
            <TooltipContent>缩小</TooltipContent>
          </Tooltip>
          <button
            type="button"
            className="h-8 min-w-14 rounded-md px-2 text-xs tabular-nums hover:bg-white/10"
            onClick={resetView}
            title="点击适应窗口"
          >
            {Math.round(scale * 100)}%
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={() => zoomCenter(1.25)} aria-label="放大">
                <ZoomIn />
              </Button>
            </TooltipTrigger>
            <TooltipContent>放大</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={resetView} aria-label="适应窗口">
                <Maximize />
              </Button>
            </TooltipTrigger>
            <TooltipContent>适应窗口</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={() => natural && (setScale(1), setOffset({ x: 0, y: 0 }))} aria-label="原始大小">
                <span className="text-xs font-medium">1:1</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>原始大小</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={closeViewer} aria-label="关闭">
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>关闭（Esc）</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          className="absolute left-1/2 top-1/2 will-change-transform"
          style={{ transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        >
          {file.type === 'video'
            ? url && (
              <video
                src={url}
                controls
                autoPlay
                className="max-h-[80dvh] max-w-[90vw] outline-none"
                onLoadedMetadata={e => {
                  const el = e.currentTarget
                  if (el.videoWidth > 0) setNatural(n => n ?? { width: el.videoWidth, height: el.videoHeight })
                }}
              />
            )
            : url && (
              <img
                src={url}
                alt={file.name}
                draggable={false}
                decoding="async"
                className={natural ? '' : 'max-h-[80dvh] max-w-[90vw] object-contain'}
                onLoad={e => {
                  const img = e.currentTarget
                  if (img.naturalWidth <= 0) return
                  setNatural(n => n ?? { width: img.naturalWidth, height: img.naturalHeight })
                  useAppStore.getState().reportSize(file.id, img.naturalWidth, img.naturalHeight)
                }}
              />
            )}
        </div>

        {index > 0 && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute left-3 top-1/2 size-9 -translate-y-1/2 rounded-full"
            onClick={() => nav(-1)}
            onPointerDown={stopForControls}
            onDoubleClick={stopForControls}
            aria-label="上一张"
          >
            <ChevronLeft />
          </Button>
        )}
        {index >= 0 && index < files.length - 1 && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-3 top-1/2 size-9 -translate-y-1/2 rounded-full"
            onClick={() => nav(1)}
            onPointerDown={stopForControls}
            onDoubleClick={stopForControls}
            aria-label="下一张"
          >
            <ChevronRight />
          </Button>
        )}
      </div>

      <div className="flex h-10 shrink-0 items-center justify-center gap-3 text-[11px] text-white/50">
        <span className="tabular-nums">{index + 1} / {files.length}</span>
        <span>双击关闭 · 滚轮缩放 · 拖拽平移 · ←/→ 切换 · 0 适应窗口 · 1 原始大小</span>
      </div>
    </div>
  )
}
