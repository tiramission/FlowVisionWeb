import { useEffect, useState } from 'react'
import { getFirstImageFile } from '@/lib/fs/directory'

/** 取目录内首个图片生成预览 URL（文件夹堆叠缩略图用），卸载时 revoke */
export function useFolderPreviewUrl(dirHandle: FileSystemDirectoryHandle | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    setUrl(null)
    if (!dirHandle) return
    let dead = false
    let created: string | null = null
    void (async () => {
      try {
        const handle = await getFirstImageFile(dirHandle)
        if (!handle) return
        const file = await handle.getFile()
        const objectUrl = URL.createObjectURL(file)
        if (dead) {
          URL.revokeObjectURL(objectUrl)
        } else {
          created = objectUrl
          setUrl(objectUrl)
        }
      } catch { /* 目录可能已被移动或删除 */ }
    })()
    return () => {
      dead = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [dirHandle])

  return url
}
