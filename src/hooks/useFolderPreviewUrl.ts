import { useEffect, useState } from 'react'
import { IMAGE_EXTENSIONS } from '@/lib/fs/constants'
import { getFirstImage } from '@/lib/fs/directory'
import { refUrl, type WebDavRef } from '@/lib/fs/ref'
import { authOf, getConnection } from '@/lib/webdav/connections'
import { davList } from '@/lib/webdav/protocol'
import { DIRECT_EXTS, thumbCache } from '@/lib/thumb/cache'
import type { FileModel } from '@/types'

export interface RemoteFolderRef {
  connId: string
  /** 目录 URL */
  href: string
}

function extOfName(name: string): string {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i + 1).toLowerCase()
}

/** 目录内首个图片生成预览 URL（文件夹堆叠缩略图用）：优先走缩略图缓存，gif/svg 直连。
 *  本地走句柄枚举；远程走 PROPFIND 后经统一 FileRef 管线 */
export function useFolderPreviewUrl(dirHandle: FileSystemDirectoryHandle | null | undefined, remote: RemoteFolderRef | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    setUrl(null)
    let active = true
    let release: (() => void) | null = null
    let revoke: (() => void) | null = null

    const finish = (ref: WebDavRef | FileSystemFileHandle, ext: string, id: string, size: number, lastModified: number) => {
      if (!active) return
      if (DIRECT_EXTS.has(ext)) {
        void refUrl(ref).then(r => {
          if (active) {
            revoke = r.revoke
            setUrl(r.url)
          } else {
            r.revoke()
          }
        })
        return
      }
      const model: FileModel = {
        id: `folder-preview:${id}`,
        name: ref.name,
        relPath: `__folder__/${id}/${ref.name}`,
        ext,
        type: 'image',
        size,
        lastModified,
        handle: ref,
      }
      release = thumbCache.acquire(model, u => {
        if (active) setUrl(u)
      })
    }

    if (dirHandle) {
      void (async () => {
        try {
          const first = await getFirstImage(dirHandle)
          if (first) finish(first.handle, first.ext, dirHandle.name, first.file.size, first.file.lastModified)
        } catch { /* 目录可能已被移动或删除 */ }
      })()
    } else if (remote) {
      void (async () => {
        try {
          const conn = await getConnection(remote.connId)
          if (!conn || !active) return
          const entries = await davList(remote.href, authOf(conn))
          if (!active) return
          const first = entries
            .filter(e => !e.isDir && IMAGE_EXTENSIONS.has(extOfName(e.name)))
            .sort((a, b) => a.name.localeCompare(b.name, 'zh', { numeric: true, sensitivity: 'base' }))[0]
          if (!first) return
          finish(
            { __webdav: true, connId: remote.connId, href: first.href, name: first.name },
            extOfName(first.name),
            `${remote.connId}/${first.href}`,
            first.size,
            first.lastModified,
          )
        } catch { /* 远程目录读取失败：无封面 */ }
      })()
    }

    return () => {
      active = false
      release?.()
      revoke?.()
    }
  }, [dirHandle, remote?.connId, remote?.href])

  return url
}
