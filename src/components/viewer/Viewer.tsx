import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Maximize, Pause, Play, Volume2, VolumeX, X, ZoomIn, ZoomOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
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

  // 视频播放器状态（自定义控制栏，固定尺寸不随视频缩放/全屏变化）
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = () => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen().catch(() => {})
  }
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // 控制栏自动隐藏：视频播放中鼠标静止 2.8s 淡出，移动/操作即唤醒
  const [controlsVisible, setControlsVisible] = useState(true)
  const controlsTimerRef = useRef(0)
  const wakeControls = () => {
    setControlsVisible(true)
    window.clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = window.setTimeout(() => {
      const v = videoRef.current
      if (v && !v.paused && !v.ended) setControlsVisible(false)
    }, 2800)
  }
  useEffect(() => () => window.clearTimeout(controlsTimerRef.current), [])
  // 打开/切换视频即启动首次倒计时（否则鼠标不动永远不会触发隐藏）
  useEffect(() => {
    if (isVideo) wakeControls()
    // eslint 无配置，忽略 exhausive-deps
  }, [file?.id, isVideo])

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

  // 实时层级标注：顶层可见的渲染层（全图层挂载但解码中仍算预览层在显示）
  const layerBadge = (() => {
    if (!file || file.type === 'video') return null
    if (!previewable) {
      return { text: '原图直连', tip: '小图/GIF/SVG/未知尺寸，直接解码原图显示', cls: 'bg-zinc-500/25 text-zinc-200' }
    }
    if (fullOn && fullReady) {
      return { text: 'L3 原图', tip: '原图已解码，完整分辨率显示', cls: 'bg-emerald-500/25 text-emerald-300' }
    }
    if (fullOn) {
      return { text: 'L2 预览 · 解码原图', tip: '已放大超过预览档分辨率，原图后台解码中，完成后淡入替换', cls: 'bg-sky-500/25 text-sky-300' }
    }
    if (preview.url) {
      return { text: 'L2 预览 2560px', tip: '预览层显示（放大超过阈值会自动切换原图）', cls: 'bg-sky-500/25 text-sky-300' }
    }
    if (thumb.url) {
      return { text: 'L1 缩略图 768px', tip: '预览生成中，暂以缩略图显示', cls: 'bg-amber-500/25 text-amber-300' }
    }
    return { text: '加载中…', tip: '正在读取文件', cls: 'bg-zinc-500/25 text-zinc-200' }
  })()

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

  // 滚轮缩放需要非 passive 监听才能 preventDefault（视频不做缩放，滚轮留给系统/未来音量）
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (useAppStore.getState().viewerId && document.querySelector('[data-viewer-root] video')) return
      e.preventDefault()
      zoomAtRef.current(e.clientX, e.clientY, Math.exp(-e.deltaY * WHEEL_FACTOR))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // 键盘：Esc 关闭、←/→ 切换、+/- 缩放、0 适应窗口、1 原始大小、</>（Shift+,/.）视频倍速、空格播放/暂停
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 全屏中 Esc 先退全屏，不连带关闭查看器
        if (document.fullscreenElement) { void document.exitFullscreen(); return }
        closeViewer(); return
      }
      if (e.key === 'ArrowLeft') { nav(-1); return }
      if (e.key === 'ArrowRight') { nav(1); return }
      if (e.key === ' ') {
        const v = videoRef.current
        if (v) {
          e.preventDefault()
          if (v.paused) void v.play()
          else v.pause()
        }
        return
      }
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

  // 拖拽平移（仅左键；右键保留给手势）。
  // 长按临时缩放（对标原版）：按住不动 400ms——左键切 100%、右键切适应窗口，
  // 松开还原原视图；期间位移超过 8px 视为拖拽/手势，取消长按
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const holdRef = useRef<{
    timer: number
    button: number
    x: number
    y: number
    saved: { scale: number; offset: { x: number; y: number } } | null
  }>({ timer: 0, button: -1, x: 0, y: 0, saved: null })
  const clearHoldTimer = () => window.clearTimeout(holdRef.current.timer)
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 0) {
      // 合成/失效指针（如自动化事件）调用 capture 会抛 NotFoundError 中断后续逻辑
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch { /* 指针不可捕获时拖拽降级为无捕获模式 */ }
      dragRef.current = { x: e.clientX, y: e.clientY, ox: viewRef.current.offset.x, oy: viewRef.current.offset.y }
    }
    if ((e.button === 0 || e.button === 2) && natural && !isVideo) {
      clearHoldTimer()
      holdRef.current = { timer: 0, button: e.button, x: e.clientX, y: e.clientY, saved: null }
      holdRef.current.timer = window.setTimeout(() => {
        const h = holdRef.current
        const el = canvasRef.current
        if (!el || !natural) return
        const { scale: s, offset: o } = viewRef.current
        // 以按下的指针位置为锚点缩放（与滚轮缩放同数学）：
        // 指针下的图像点在新缩放下保持原位，不产生内容跳移
        const rect = el.getBoundingClientRect()
        const px = h.x - rect.left - rect.width / 2
        const py = h.y - rect.top - rect.height / 2
        const next = h.button === 0 ? 1 : fitScale() // 左键 100% / 右键适应
        const k = next / s
        h.saved = { scale: s, offset: { ...o } }
        setScale(next)
        setOffset({ x: px - (px - o.x) * k, y: py - (py - o.y) * k })
      }, 400)
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (d) setOffset({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y })
    const h = holdRef.current
    if (h.timer && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 8) clearHoldTimer()
  }
  const onPointerUp = () => {
    dragRef.current = null
    const h = holdRef.current
    if (h.timer) clearHoldTimer()
    if (h.saved) {
      // 松开还原长按前的视图
      setScale(h.saved.scale)
      setOffset(h.saved.offset)
      h.saved = null
    }
  }

  if (!file) return null

  const stopForControls = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation()

  return (
    <div
      ref={containerRef}
      data-viewer-root
      className="fixed inset-0 z-50 flex select-none flex-col bg-black/95 text-white cursor-grab active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={e => { onPointerMove(e); if (isVideo) wakeControls() }}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={isVideo ? toggleFullscreen : closeViewer}
    >
      {/* 视频全屏时隐藏顶栏/底栏，画面独占整屏 */}
      <div
        className={`relative z-10 flex h-12 shrink-0 items-center gap-2 px-3 ${isVideo && isFullscreen ? 'hidden' : ''}`}
        onPointerDown={stopForControls}
        onDoubleClick={stopForControls}
      >
        <span className="min-w-0 truncate text-sm" title={file.name}>{file.name}</span>
        {natural && <span className="shrink-0 text-xs text-white/60">{natural.width}×{natural.height}</span>}
        {layerBadge && (
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${layerBadge.cls}`}
            title={`当前渲染层级：${layerBadge.tip}`}
          >
            {layerBadge.text}
          </span>
        )}
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
        {isVideo && url ? (
          // 视频独立布局：CSS contain 居中（不走 transform 缩放，控制栏尺寸不受影响），
          // 底部自定义控制栏固定高度，大图与全屏下尺寸一致
          <div className="absolute inset-0 flex flex-col">
            <video
              ref={videoRef}
              src={url}
              autoPlay
              className="min-h-0 w-full flex-1 bg-black object-contain outline-none"
              onLoadedMetadata={e => {
                const el = e.currentTarget
                if (el.videoWidth > 0) {
                  setNatural(n => n ?? { width: el.videoWidth, height: el.videoHeight })
                  setDuration(el.duration || 0)
                }
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
              onPlay={() => setPlaying(true)}
              onTimeUpdate={e => {
                const el = e.currentTarget
                setCurrentTime(el.currentTime)
                // 节流保存播放位置
                if (!settings.rememberVideoPos || !posKey) return
                const now = Date.now()
                if (now - lastSaveRef.current < 3000) return
                lastSaveRef.current = now
                setVideoPos(posKey, el.currentTime)
              }}
              onPause={e => {
                setPlaying(false)
                if (settings.rememberVideoPos && posKey) setVideoPos(posKey, e.currentTarget.currentTime)
              }}
              onEnded={() => {
                setPlaying(false)
                if (posKey) clearVideoPos(posKey)
                // 顺序连播（对标原版 videoPlaySequentialPlay）
                if (settings.autoPlayNext && files[index + 1]) setViewerId(files[index + 1].id)
              }}
              onVolumeChange={e => {
                const el = e.currentTarget
                setMuted(el.muted)
                const v = el.volume
                if (!el.muted && v !== settings.videoVolume) setSetting({ videoVolume: v })
              }}
            />
            <VideoControls
              videoRef={videoRef}
              playing={playing}
              currentTime={currentTime}
              duration={duration}
              muted={muted}
              volume={settings.videoVolume}
              rate={settings.videoPlaybackRate}
              isFullscreen={isFullscreen}
              visible={controlsVisible}
              onTogglePlay={() => {
                const v = videoRef.current
                if (!v) return
                if (v.paused) void v.play()
                else v.pause()
              }}
              onSeek={t => { if (videoRef.current) videoRef.current.currentTime = t }}
              onVolumeChange={v => {
                if (!videoRef.current) return
                videoRef.current.volume = v
                videoRef.current.muted = v === 0
                setSetting({ videoVolume: v })
              }}
              onToggleMute={() => {
                const v = videoRef.current
                if (!v) return
                v.muted = !v.muted
                setMuted(v.muted)
              }}
              onToggleFullscreen={toggleFullscreen}
            />
          </div>
        ) : null}
        <div
          className={`absolute left-1/2 top-1/2 will-change-transform ${isVideo ? 'hidden' : ''}`}
          style={{ transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        >
          {file.type !== 'video' && (
            previewable && natural ? (
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
            ))}
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

      <div className={`flex h-10 shrink-0 items-center justify-center gap-3 text-[11px] text-white/50 ${isVideo && isFullscreen ? 'hidden' : ''}`}>
        <span className="tabular-nums">{index + 1} / {files.length}</span>
        <span>
          {isVideo
            ? '双击全屏 · 空格播放/暂停 · ←/→ 切换 · ,/. 倍速 · Esc 退出'
            : '双击关闭 · 滚轮缩放 · 拖拽平移 · 长按左键 100% · 长按右键适应 · ←/→ 切换 · 0/1 视图'}
        </span>
      </div>
    </div>
  )
}

function fmtTime(t: number): string {
  if (!Number.isFinite(t) || t < 0) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** 视频自定义控制栏（对标原版 VideoPlayerControlsView 的精简版）：
 *  固定 48px 高且悬浮于画面底部（不占视频空间），不随视频缩放/全屏变化
 *  ——原生 controls 会随视频元素缩放（大图时过小、全屏时过大）且无法用
 *  CSS 调整。高亮用白色系：控制栏底是黑色半透明，主题 primary 在亮色
 *  模式下接近黑灰会看不清 */
function VideoControls(props: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  playing: boolean
  currentTime: number
  duration: number
  muted: boolean
  volume: number
  rate: number
  isFullscreen: boolean
  visible: boolean
  onTogglePlay: () => void
  onSeek: (t: number) => void
  onVolumeChange: (v: number) => void
  onToggleMute: () => void
  onToggleFullscreen: () => void
}) {
  const {
    playing, currentTime, duration, muted, volume, rate, isFullscreen, visible,
    onTogglePlay, onSeek, onVolumeChange, onToggleMute, onToggleFullscreen,
  } = props
  const barRef = useRef<HTMLDivElement>(null)
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  // 拖动只更新预览，松手才真正 seek，避免拖动中频繁跳帧
  const shown = dragRatio !== null ? dragRatio * duration : currentTime
  const ratio = duration > 0 ? Math.min(1, shown / duration) : 0

  const ratioAt = (clientX: number) => {
    const bar = barRef.current
    if (!bar) return 0
    const r = bar.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width))
  }

  const btn = 'flex size-8 shrink-0 items-center justify-center rounded-md text-white/90 hover:bg-white/15 hover:text-white'

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-10 flex h-12 items-center gap-2 bg-gradient-to-t from-black/85 to-black/30 px-3 backdrop-blur-[2px] select-none transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onPointerMove={e => e.stopPropagation()}
    >
      <button type="button" className={btn} onClick={onTogglePlay} aria-label={playing ? '暂停' : '播放'}>
        {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
      </button>

      <div className="w-14 shrink-0 text-center text-xs tabular-nums text-white/75">{fmtTime(shown)}</div>

      <div
        ref={barRef}
        className="group relative flex h-5 min-w-0 flex-1 cursor-pointer items-center"
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragRatio(ratioAt(e.clientX))
        }}
        onPointerMove={e => {
          if (dragRatio === null) return
          setDragRatio(ratioAt(e.clientX))
        }}
        onPointerUp={e => {
          if (dragRatio === null) return
          onSeek(ratioAt(e.clientX) * duration)
          setDragRatio(null)
        }}
      >
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white" style={{ width: `${ratio * 100}%` }} />
        </div>
        <div
          className="absolute size-3 rounded-full bg-white shadow ring-2 ring-black/40 transition-transform group-hover:scale-110"
          style={{ left: `calc(${ratio * 100}% - 6px)` }}
        />
      </div>

      <div className="w-14 shrink-0 text-center text-xs tabular-nums text-white/75">{fmtTime(duration)}</div>

      <button type="button" className={btn} onClick={onToggleMute} aria-label="静音">
        {muted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
      </button>
      <Slider
        className="w-20 shrink-0 [&_[data-slot=slider-range]]:bg-white [&_[data-slot=slider-track]]:bg-white/25 [&_[data-slot=slider-thumb]]:border-white [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-thumb]]:ring-white/40"
        min={0}
        max={1}
        step={0.01}
        value={[muted ? 0 : volume]}
        onValueChange={vals => onVolumeChange(vals[0] ?? 0)}
        aria-label="音量"
      />

      <span className="w-10 shrink-0 text-center text-xs tabular-nums text-white/75">{rate}x</span>

      <button type="button" className={btn} onClick={onToggleFullscreen} aria-label="全屏">
        <Maximize className={`size-5 ${isFullscreen ? 'rotate-180' : ''}`} />
      </button>
    </div>
  )
}
