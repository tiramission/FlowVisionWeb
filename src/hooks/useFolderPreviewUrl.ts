import { useEffect, useState } from 'react'
import { getFirstImage } from '@/lib/fs/directory'
import { DIRECT_EXTS, thumbCache } from '@/lib/thumb/cache'
import type { FileModel } from '@/types'

/** 目录内首个图片生成预览 URL（文件夹堆叠缩略图用）：优先走缩略图缓存，gif/svg 直连 */
export function useFolderPreviewUrl(dirHandle: FileSystemDirectoryHandle | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    setUrl(null)
    if (!dirHandle) return
    let active = true
    let release: (() => void) | null = null
    void (async () => {
      try {
        const first = await getFirstImage(dirHandle)
        if (!first || !active) return
        if (DIRECT_EXTS.has(first.ext)) {
          const objectUrl = URL.createObjectURL(first.file)
          if (active) setUrl(objectUrl)
          else URL.revokeObjectURL(objectUrl)
          return
        }
        const model: FileModel = {
          id: `folder-preview:${dirHandle.name}/${first.handle.name}`,
          name: first.handle.name,
          relPath: `__folder__/${dirHandle.name}/${first.handle.name}`,
          ext: first.ext,
          type: 'image',
          size: first.file.size,
          lastModified: first.file.lastModified,
          handle: first.handle,
        }
        release = thumbCache.acquire(model, u => {
          if (active) setUrl(u)
        })
      } catch { /* 目录可能已被移动或删除 */ }
    })()
    return () => {
      active = false
      release?.()
    }
  }, [dirHandle])

  return url
}
