import { useEffect, useState } from 'react'

/** 从 FileSystemFileHandle 创建对象 URL，组件卸载/句柄变化时自动 revoke */
export function useFileUrl(handle: FileSystemFileHandle | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    setUrl(null)
    if (!handle) return
    let dead = false
    let created: string | null = null
    void (async () => {
      try {
        const file = await handle.getFile()
        const objectUrl = URL.createObjectURL(file)
        if (dead) {
          URL.revokeObjectURL(objectUrl)
        } else {
          created = objectUrl
          setUrl(objectUrl)
        }
      } catch { /* 文件可能已被移动或删除 */ }
    })()
    return () => {
      dead = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [handle])

  return url
}
