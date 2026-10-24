import { Folder } from 'lucide-react'
import { useFolderPreviewUrl } from '@/hooks/useFolderPreviewUrl'
import type { FileModel } from '@/types'
import { cn } from '@/lib/utils'

interface FolderTileProps extends React.HTMLAttributes<HTMLDivElement> {
  file: FileModel
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  /** 网格模式下的固定尺寸；瀑布流模式留空则填满定位容器 */
  width?: number
  height?: number
}

/** 文件夹瓦片：以目录内首个图片做堆叠式缩略图（对标原版 thumbnailOfFolderUseStacking） */
// 透传 ...rest（含 ContextMenuTrigger asChild 注入的事件处理器与 ref）。
// style 必须显式解构合并：Radix Slot 会注入 style 键（可能为空对象），
// 放在 rest 里展开会覆盖下面的定位尺寸，导致瓦片高度塌陷
export function FolderTile({ file, selected, onSelect, onOpen, width, height, className, style, ...rest }: FolderTileProps) {
  const url = useFolderPreviewUrl(file.dirHandle)

  return (
    <div
      data-file-id={file.id}
      title={file.name}
      onClick={onSelect}
      onDoubleClick={onOpen}
      className={cn(
        'relative cursor-pointer rounded-md',
        selected ? 'ring-2 ring-primary ring-offset-1' : 'hover:ring-2 hover:ring-ring',
        className,
      )}
      style={{ width: width ?? '100%', height: height ?? '100%', ...style }}
      {...rest}
    >
      {/* 堆叠卡片：全部收在瓦片边界内，顶部露出边缘；微旋转角度已按
          边距校算过，任何尺寸下不会溢出盖住选中圈或相邻瓦片 */}
      <div
        className="absolute top-1 bottom-4 left-3 right-3 rounded-md border bg-muted shadow-sm"
        style={{ transform: 'rotate(-1.5deg)' }}
      />
      <div
        className="absolute top-2 bottom-2 left-1.5 right-1.5 rounded-md border bg-muted shadow-sm"
        style={{ transform: 'rotate(1deg)' }}
      />
      <div className="absolute top-4 bottom-0 left-0 right-0 overflow-hidden rounded-md border bg-muted">
        {url ? (
          <img src={url} alt={file.name} draggable={false} decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Folder className="size-8 text-muted-foreground" />
          </div>
        )}
      </div>
      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-black/20 px-1.5 pb-1 pt-2 text-center text-[11px] text-white">
        {file.name}
      </span>
    </div>
  )
}
