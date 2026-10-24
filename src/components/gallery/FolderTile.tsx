import { Folder } from 'lucide-react'
import { useFolderPreviewUrl } from '@/hooks/useFolderPreviewUrl'
import type { FileModel } from '@/types'
import { cn } from '@/lib/utils'

interface FolderTileProps {
  file: FileModel
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  /** 网格模式下的固定尺寸；瀑布流模式留空则填满定位容器 */
  width?: number
  height?: number
}

/** 文件夹瓦片：以目录内首个图片做堆叠式缩略图（对标原版 thumbnailOfFolderUseStacking） */
export function FolderTile({ file, selected, onSelect, onOpen, width, height }: FolderTileProps) {
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
      )}
      style={{ width: width ?? '100%', height: height ?? '100%' }}
    >
      <div className="absolute inset-0 rounded-md border bg-muted shadow-sm" style={{ transform: 'translate(-5%, -6%) rotate(-4deg)' }} />
      <div className="absolute inset-0 rounded-md border bg-muted shadow-sm" style={{ transform: 'translate(5%, -3%) rotate(3deg)' }} />
      <div className="absolute inset-0 overflow-hidden rounded-md border bg-muted">
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
