// WebDAV 目录扫描：PROPFIND 条目 → FileModel（对齐 lib/fs/directory.ts 的产物形态）
// 供 store 远程浏览调用；递归模式为逐层 BFS，深度对齐本地 RECURSIVE_DEPTH
import { FILE_EXTENSIONS, VIDEO_EXTENSIONS } from '@/lib/fs/constants'
import { RECURSIVE_DEPTH } from '@/lib/fs/directory'
import type { FileModel } from '@/types'
import { davList, type DavAuth, type DavEntry } from './protocol'

function extOfName(name: string): string {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i + 1).toLowerCase()
}

function fileModelOf(e: DavEntry, connId: string, prefix: string): FileModel {
  const ext = extOfName(e.name)
  return {
    id: prefix + e.name,
    name: e.name,
    relPath: prefix + e.name,
    ext,
    type: VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image',
    size: e.size,
    lastModified: e.lastModified,
    handle: { __webdav: true, connId, href: e.href, name: e.name },
  }
}

/** 非递归：媒体文件 + 子文件夹（文件夹带 remoteDirHref 供下钻与堆叠封面） */
export function davEntriesToModels(entries: readonly DavEntry[], connId: string, prefix = ''): FileModel[] {
  const folders: FileModel[] = []
  const files: FileModel[] = []
  for (const e of entries) {
    if (e.isDir) {
      folders.push({
        id: prefix + e.name,
        name: e.name,
        relPath: prefix + e.name,
        ext: '',
        type: 'folder',
        size: 0,
        lastModified: e.lastModified,
        handle: null,
        remoteDir: { connId, href: e.href },
      })
      continue
    }
    const ext = extOfName(e.name)
    if (!FILE_EXTENSIONS.has(ext)) continue
    files.push(fileModelOf(e, connId, prefix))
  }
  return [...folders, ...files]
}

export interface DavScanOptions {
  recursive: boolean
  /** 与本地 readDirectory 相同：total=0 表示总量未知（递归模式） */
  onProgress: (done: number, total: number) => void
}

/** 扫描远程目录（对齐 readDirectory 语义：非递归含文件夹，递归只出文件） */
export async function davReadDirectory(url: string, connId: string, auth: DavAuth | null, opts: DavScanOptions): Promise<FileModel[]> {
  if (!opts.recursive) {
    const entries = await davList(url, auth)
    opts.onProgress(0, entries.length)
    return davEntriesToModels(entries, connId)
  }
  const out: FileModel[] = []
  let found = 0
  const report = () => opts.onProgress(found, 0)
  report()
  const pending: { url: string; prefix: string; depth: number }[] = [{ url, prefix: '', depth: 0 }]
  while (pending.length > 0) {
    const batch = pending.splice(0, pending.length)
    await Promise.all(batch.map(async ({ url, prefix, depth }) => {
      try {
        const entries = await davList(url, auth)
        for (const e of entries) {
          if (e.isDir) {
            if (depth + 1 < RECURSIVE_DEPTH) pending.push({ url: e.href, prefix: prefix + e.name + '/', depth: depth + 1 })
          } else if (FILE_EXTENSIONS.has(extOfName(e.name))) {
            out.push(fileModelOf(e, connId, prefix))
            found++
          }
        }
      } catch (err) {
        // 单个子目录失败（权限/网络）不拖垮整个扫描
        console.warn('WebDAV 子目录读取失败:', url, err)
      }
      report()
    }))
  }
  return out
}
