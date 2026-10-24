import { Film } from 'lucide-react'
import { useFileUrl } from '@/hooks/useFileUrl'
import { useAppStore } from '@/store/useAppStore'
import type { FileModel } from '@/types'
import { cn } from '@/lib/utils'

interface ThumbProps {
  file: FileModel
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  /** 网格模式下的固定尺寸；瀑布流模式留空则填满定位容器 */
  width?: number
  height?: number
}

export function Thumb({ file, selected, onSelect, onOpen, width, height }: ThumbProps) {
  const url = useFileUrl(file.handle)
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
      )}
      style={{ width: width ?? '100%', height: height ?? '100%' }}
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
