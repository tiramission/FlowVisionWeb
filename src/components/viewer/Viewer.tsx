import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize, X, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useFileUrl } from '@/hooks/useFileUrl'
import { usePreviewUrl, useThumbUrl } from '@/hooks/useThumbUrl'
import { useSortedFiles } from '@/hooks/useSortedFiles'
import { dirKey } from '@/lib/fs/directory'
import { DIRECT_EXTS, PREVIEW_MAX_SIDE, previewCache } from '@/lib/thumb/cache'
import { clearVideoPos, getVideoPos, setVideoPos } from '@/lib/video/position'
import { useAppStore } from '@/store/useAppStore'

const MIN_SCALE = 0.05
const MAX_SCALE = 32
const WHEEL_FACTOR = 0.0015

/**
 * 尺寸已知时用显式像素尺寸渲染，交给外层 transform 缩放。
 * 不能依赖自然尺寸布局：Tailwind preflight 的 img { max-width: 100% } 会与
 * 绝对定位 shrink-to-fit 容器 + transform 循环求解，把布局尺寸错误压缩，
 * 导致"适应窗口"显示尺寸不对（过大被裁或过小）
 */
function explicitSize(natural: { width: number; height: number }): React.CSSProperties {
  return {
    width: natural.width,
    height: natural.height,
    maxWidth: 'none',
    maxHeight: 'none',
  }
}

export function Viewer() {
  const viewerId = useAppStore(s => s.viewerId)
  const closeViewer = useAppStore(s => s.closeViewer)
  const setViewerId = useAppStore(s => s.setViewerId)
  const files = useSortedFiles()
  const settings = useAppStore(s => s.settings)
  const setSetting = useAppStore(s => s.setSetting)
  const showToast = useAppStore(s => s.showToast)

  const index = viewerId ? files.findIndex(f => f.id === viewerId) : -1
  const file = index >= 0 ? files[index] : null
  const url = useFileUrl(file?.handle)
  const isVideo = file?.type === 'video'
  const videoRef = useRef<HTMLVideoElement>(null)
  const posKey = file && file.handle ? `${dirKey(useAppStore.getState().dirChain)}/${file.relPath}:${file.size}` : ''

  // 视频倍速档位（对标原版 videoPlaybackRate），[ ] 或 </> 键调节
  const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]
  const stepRate = (delta: number) => {
    const cur = settings.videoPlaybackRate
    const i = RATES.findIndex(r => r >= cur - 0.01)
    const next = RATES[Math.min(RATES.length - 1, Math.max(0, (i === -1 ? 2 : i) + delta))]
    setSetting({ videoPlaybackRate: next })
    if (videoRef.current) videoRef.current.playbackRate = next
  }

  const containerRef = useRef<HTMLDivElement>(null)
  // 画布区域（不含顶栏/底栏），fit 与缩放锚点都基于它，避免图片被栏遮挡
  const canvasRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(
    file?.width && file?.height ? { width: file.width, height: file.height } : null,
  )
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  // 滚轮等非 React 事件里读取最新视图状态
  const viewRef = useRef({ scale: 1, offset: { x: 0, y: 0 } })
  viewRef.current = { scale, offset }

  // 超大图两级加载：缩略图(768)秒开 → 预览(2560) → 缩放超过预览分辨率才解码全图。
  // 仅对「尺寸已知且最长边 > 2560」的位图启用（GIF/SVG/小图/未知尺寸走单层直连）
  const previewable = !!file && file.type === 'image' && !DIRECT_EXTS.has(file.ext)
    && !!file.width && !!file.height && Math.max(file.width, file.height) > PREVIEW_MAX_SIDE
  const thumb = useThumbUrl(previewable ? file : null)
  const preview = usePreviewUrl(previewable ? file : null)
  const fullUrl = useFileUrl(previewable ? file.handle : null) // 仅创建 URL，渲染才解码
  const [fullOn, setFullOn] = useState(false) // 是否需要全图层（缩放超阈值，带迟滞防抖动）
  const [fullReady, setFullReady] = useState(false) // 全图是否解码完成（淡入）
  useEffect(() => { setFullOn(false); setFullReady(false) }, [file?.id])

  // 预览档能支撑的最大缩放 = 预览长边 / 原图长边；超过 5% 即需全图，缩回 95% 以下释放
  const capScale = file?.width && file?.height ? PREVIEW_MAX_SIDE / Math.max(file.width, file.height) : Infinity
  useEffect(() => {
    if (!previewable) return
    if (scale > capScale * 1.05) setFullOn(true)
    else if (scale < capScale * 0.95) setFullOn(false)
  }, [scale, capScale, previewable])

  // 邻图预览预加载：翻图时下一张/上一张的预览层已就绪
  useEffect(() => {
    if (!file || !previewable) return
    const t = window.setTimeout(() => {
      previewCache.preload([files[index - 1], files[index + 1]].filter(Boolean))
    }, 300)
    return () => window.clearTimeout(t)
  }, [file?.id, index, files, previewable])

  const fitScale = () => {
    const el = canvasRef.current
    if (!el || !natural) return 1
    return Math.min(el.clientWidth / natural.width, el.clientHeight / natural.height)
  }

  const resetView = () => {
    setScale(fitScale())
    setOffset({ x: 0, y: 0 })
  }

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const el = canvasRef.current
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
    const el = canvasRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    zoomAtRef.current(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
  }

  const nav = (delta: number) => {
    const next = files[index + delta]
    if (next) setViewerId(next.id)
  }
  // 播放位置节流保存时间戳
  const lastSaveRef = useRef(0)

  // 切换图片时重置
  useEffect(() => {
    setNatural(file?.width && file?.height ? { width: file.width, height: file.height } : null)
  }, [file?.id])
  // 尺寸就绪后适配窗口
  useLayoutEffect(() => { resetView() }, [file?.id, natural])

  // 卸载或切走时保存视频播放位置
  useEffect(() => {
    return () => {
      const el = videoRef.current
      if (el && settings.rememberVideoPos && posKey && el.currentTime > 3 && !el.ended) {
        setVideoPos(posKey, el.currentTime)
      }
    }
  }, [posKey])

  // 窗口尺寸变化时重新适应窗口
  useEffect(() => {
    const onResize = () => resetView()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  })

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

  // 键盘：Esc 关闭、←/→ 切换、+/- 缩放、0 适应窗口、1 原始大小、</>（Shift+,/.）视频倍速
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeViewer(); return }
      if (e.key === 'ArrowLeft') { nav(-1); return }
      if (e.key === 'ArrowRight') { nav(1); return }
      if (e.key === '+' || e.key === '=') { zoomCenter(1.25); return }
      if (e.key === '-') { zoomCenter(1 / 1.25); return }
      if (e.key === '0') { resetView(); return }
      if (e.key === '1' && natural) { setScale(1); setOffset({ x: 0, y: 0 }) }
      if (e.key === '<' || e.key === ',') { stepRate(-1); return }
      if (e.key === '>' || e.key === '.') { stepRate(1); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // 拖拽平移（仅左键；右键保留给手势）
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
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
      data-viewer-root
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
          {isVideo && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10 hover:text-white min-w-11 w-11"
                  onClick={() => {
                    const i = RATES.findIndex(r => r >= settings.videoPlaybackRate - 0.01)
                    const next = RATES[(i + 1) % RATES.length]
                    setSetting({ videoPlaybackRate: next })
                    if (videoRef.current) videoRef.current.playbackRate = next
                  }}
                  aria-label="切换倍速"
                >
                  <span className="text-xs font-medium tabular-nums">{settings.videoPlaybackRate}x</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{'倍速（. / , 键）'}</TooltipContent>
            </Tooltip>
          )}
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

      <div ref={canvasRef} className="relative min-h-0 flex-1">
        <div
          className="absolute left-1/2 top-1/2 will-change-transform"
          style={{ transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        >
          {file.type === 'video'
            ? url && (
              <video
                ref={videoRef}
                src={url}
                controls
                autoPlay
                className={natural ? 'outline-none' : 'max-h-[80dvh] max-w-[90vw] outline-none'}
                style={natural ? explicitSize(natural) : undefined}
                onLoadedMetadata={e => {
                  const el = e.currentTarget
                  if (el.videoWidth > 0) setNatural(n => n ?? { width: el.videoWidth, height: el.videoHeight })
                  // 应用记忆的音量/倍速/播放位置（对标原版记忆设置）
                  el.volume = Math.min(1, Math.max(0, settings.videoVolume))
                  el.playbackRate = settings.videoPlaybackRate
                  if (settings.rememberVideoPos && posKey) {
                    const saved = getVideoPos(posKey)
                    if (saved > 0 && el.duration > 0 && saved < el.duration - 5) {
                      el.currentTime = saved
                      showToast(`已恢复到 ${Math.floor(saved / 60)}:${String(Math.floor(saved % 60)).padStart(2, '0')}`)
                    }
                  }
                }}
                onTimeUpdate={e => {
                  // 节流保存播放位置
                  const el = e.currentTarget
                  if (!settings.rememberVideoPos || !posKey) return
                  const now = Date.now()
                  if (now - lastSaveRef.current < 3000) return
                  lastSaveRef.current = now
                  setVideoPos(posKey, el.currentTime)
                }}
                onPause={e => {
                  if (settings.rememberVideoPos && posKey) setVideoPos(posKey, e.currentTarget.currentTime)
                }}
                onEnded={() => {
                  if (posKey) clearVideoPos(posKey)
                  // 顺序连播（对标原版 videoPlaySequentialPlay）
                  if (settings.autoPlayNext && files[index + 1]) setViewerId(files[index + 1].id)
                }}
                onVolumeChange={e => {
                  const v = e.currentTarget.volume
                  if (v !== settings.videoVolume) setSetting({ videoVolume: v })
                }}
              />
            )
            : previewable && natural ? (
              // 三层堆叠：缩略图秒开 → 预览 → 缩放超阈值后全图淡入。
              // 同宽高比，外层 transform 数学对三层一致，替换无缝。
              // 不依赖全图 URL，首帧不等原图读取
              <div className="relative" style={explicitSize(natural)}>
                {thumb.url && (
                  <img
                    src={thumb.url}
                    alt={file.name}
                    draggable={false}
                    decoding="async"
                    className="absolute inset-0 h-full w-full"
                  />
                )}
                {preview.url && (
                  <img
                    src={preview.url}
                    alt={file.name}
                    draggable={false}
                    decoding="async"
                    className="absolute inset-0 h-full w-full"
                  />
                )}
                {fullOn && fullUrl && (
                  <img
                    src={fullUrl}
                    alt={file.name}
                    draggable={false}
                    decoding="async"
                    className="absolute inset-0 h-full w-full transition-opacity duration-300"
                    style={{ opacity: fullReady ? 1 : 0 }}
                    ref={el => {
                      // onLoad 可能错过挂载前已完成的加载，ref 挂载时补检一次
                      if (el && el.complete && el.naturalWidth > 0) setFullReady(true)
                    }}
                    onLoad={e => {
                      const img = e.currentTarget
                      setFullReady(true)
                      if (img.naturalWidth > 0) {
                        useAppStore.getState().reportSize(file.id, img.naturalWidth, img.naturalHeight)
                      }
                    }}
                  />
                )}
              </div>
            ) : url && (
              <img
                src={url}
                alt={file.name}
                draggable={false}
                decoding="async"
                className={natural ? '' : 'max-h-[80dvh] max-w-[90vw] object-contain'}
                style={natural ? explicitSize(natural) : undefined}
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
        <span>双击关闭 · 滚轮缩放 · 拖拽平移 · ←/→ 切换 · 0 适应窗口 · 1 原始大小{isVideo ? ' · ,/. 倍速' : ''}</span>
      </div>
    </div>
  )
}
