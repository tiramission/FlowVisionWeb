import { useEffect, useState } from 'react'
import { refUrl, type FileRef } from '@/lib/fs/ref'

/** 从文件引用创建展示 URL（本地 blob / 远程直连或 blob），卸载/引用变化时自动 revoke */
export function useFileUrl(handle: FileRef | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    setUrl(null)
    if (!handle) return
    let dead = false
    let revoke: (() => void) | null = null
    void (async () => {
      try {
        const r = await refUrl(handle)
        if (dead) {
          r.revoke()
        } else {
          revoke = r.revoke
          setUrl(r.url)
        }
      } catch { /* 文件可能已被移动删除，或网络失败 */ }
    })()
    return () => {
      dead = true
      revoke?.()
    }
  }, [handle])

  return url
}
