import { Film } from 'lucide-react'
import { useFileUrl } from '@/hooks/useFileUrl'
import { useThumbUrl } from '@/hooks/useThumbUrl'
import { DIRECT_EXTS } from '@/lib/thumb/cache'
import { useAppStore } from '@/store/useAppStore'
import type { FileModel } from '@/types'
import { cn } from '@/lib/utils'

interface ThumbProps extends React.HTMLAttributes<HTMLDivElement> {
  file: FileModel
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  /** 网格模式下的固定尺寸；瀑布流模式留空则填满定位容器 */
  width?: number
  height?: number
}

// 透传 ...rest（含 ContextMenuTrigger asChild 注入的事件处理器与 ref）。
// style 必须显式解构合并：Radix Slot 会注入 style 键（可能为空对象），放在
// rest 里展开会覆盖下面的定位尺寸，导致瓦片高度塌陷
export function Thumb({ file, selected, onSelect, onOpen, width, height, className, style, ...rest }: ThumbProps) {
  // GIF（保留动画）/ SVG（无法位图化）直连原文件；其余走缩略图缓存，失败回退原文件
  const thumbable = file.type === 'image' && !DIRECT_EXTS.has(file.ext)
  const thumb = useThumbUrl(thumbable ? file : null)
  const direct = useFileUrl(!thumbable ? file.handle : null)
  const fallback = useFileUrl(thumb.failed ? file.handle : null)
  const url = thumb.url ?? direct ?? fallback
  // 缩略图的 natural 尺寸是缩放后的，尺寸回填只能用原图
  const isOriginal = url !== null && (!thumbable || thumb.failed) && !!url
  const reportSize = useAppStore(s => s.reportSize)

  return (
    <div
      data-file-id={file.id}
      title={file.name}
      onClick={onSelect}
      onDoubleClick={onOpen}
      className={cn(
        'relative cursor-pointer overflow-hidden rounded-md border bg-muted transition-shadow',
        selected ? 'border-primary ring-2 ring-primary' : 'border-border hover:ring-2 hover:ring-ring',
        className,
      )}
      style={{ width: width ?? '100%', height: height ?? '100%', ...style }}
      {...rest}
    >
      {file.type === 'video' ? (
        <div className="flex h-full w-full items-center justify-center">
          <Film className="size-8 text-muted-foreground" />
        </div>
      ) : url ? (
        <img
          src={url}
          alt={file.name}
          draggable={false}
          decoding="async"
          className="h-full w-full object-cover"
          onLoad={e => {
            if (!isOriginal) return
            // 头部解析失败的格式（AVIF 等）在这里回填真实尺寸，驱动瀑布流重排
            const img = e.currentTarget
            if (img.naturalWidth > 0) reportSize(file.id, img.naturalWidth, img.naturalHeight)
          }}
        />
      ) : (
        <div className="h-full w-full animate-pulse bg-muted" />
      )}
      {file.type === 'video' && (
        <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          <Film className="size-3" />
          视频
        </span>
      )}
    </div>
  )
}
