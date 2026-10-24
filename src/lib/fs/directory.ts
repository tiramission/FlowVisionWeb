import type { FileModel } from '@/types'
import { readImageDimensions } from '@/lib/image/dimensions'
import { FILE_EXTENSIONS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from './constants'
import { runPool } from './pool'

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
  }
}

// lib.dom 的 FileSystemDirectoryHandle 迭代方法声明不全，补一个精确签名
type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemHandle>
}

/** 递归模式最大深度（对标原版 folderSearchDepth 默认值 4） */
export const RECURSIVE_DEPTH = 4

export function isFsApiSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

/** 打开系统文件夹选择框；用户取消时返回 null */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFsApiSupported()) return null
  try {
    return await window.showDirectoryPicker!({ mode: 'read' })
  } catch (err) {
    if ((err as DOMException)?.name !== 'AbortError') console.warn('选择文件夹失败:', err)
    return null
  }
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i + 1).toLowerCase()
}

function makeFile(handle: FileSystemFileHandle, file: File, prefix: string): FileModel {
  const ext = extOf(handle.name)
  const relPath = prefix + handle.name
  return {
    id: relPath,
    name: handle.name,
    relPath,
    ext,
    type: VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image',
    size: file.size,
    lastModified: file.lastModified,
    handle,
  }
}

function makeFolder(handle: FileSystemDirectoryHandle): FileModel {
  return {
    id: handle.name,
    name: handle.name,
    relPath: handle.name,
    ext: '',
    type: 'folder',
    size: 0,
    lastModified: 0,
    handle: null,
    dirHandle: handle,
  }
}

export interface ScanOptions {
  recursive: boolean
  /** total=0 表示总量未知（递归模式），done 为已发现数 */
  onProgress: (done: number, total: number) => void
}

/**
 * 枚举目录内受支持的文件。非递归模式同时返回直接子文件夹条目（画廊中显示堆叠缩略图）；
 * 递归模式广度优先下探到 RECURSIVE_DEPTH，文件带相对路径，不再包含文件夹条目
 */
export async function readDirectory(dir: FileSystemDirectoryHandle, opts: ScanOptions): Promise<FileModel[]> {
  const files: FileModel[] = []
  const folders: FileModel[] = []

  if (!opts.recursive) {
    const fileHandles: FileSystemFileHandle[] = []
    for await (const handle of (dir as IterableDirectoryHandle).values()) {
      if (handle.kind === 'file') {
        if (FILE_EXTENSIONS.has(extOf(handle.name))) fileHandles.push(handle as FileSystemFileHandle)
      } else {
        folders.push(makeFolder(handle as FileSystemDirectoryHandle))
      }
    }
    const total = fileHandles.length
    opts.onProgress(0, total)
    await runPool(fileHandles, 64, async handle => {
      files.push(makeFile(handle, await handle.getFile(), ''))
    }, done => opts.onProgress(done, total))
  } else {
    let found = 0
    const report = () => opts.onProgress(found, 0)
    report()
    const pending: { handle: FileSystemDirectoryHandle; depth: number; prefix: string }[] = [
      { handle: dir, depth: 0, prefix: '' },
    ]
    while (pending.length > 0) {
      const batch = pending.splice(0, pending.length)
      await runPool(batch, 8, async ({ handle, depth, prefix }) => {
        for await (const entry of (handle as IterableDirectoryHandle).values()) {
          if (entry.kind === 'file') {
            if (!FILE_EXTENSIONS.has(extOf(entry.name))) continue
            files.push(makeFile(entry as FileSystemFileHandle, await (entry as FileSystemFileHandle).getFile(), prefix))
            found++
          } else if (depth + 1 < RECURSIVE_DEPTH) {
            const sub = entry as FileSystemDirectoryHandle
            pending.push({ handle: sub, depth: depth + 1, prefix: prefix + sub.name + '/' })
          }
        }
        report()
      })
    }
  }

  return [...folders, ...files]
}

/** 取目录内第一个图片（文件夹堆叠缩略图预览用），带元信息供缓存键使用 */
export async function getFirstImage(dir: FileSystemDirectoryHandle): Promise<{ handle: FileSystemFileHandle; file: File; ext: string } | null> {
  for await (const handle of (dir as IterableDirectoryHandle).values()) {
    if (handle.kind === 'file' && IMAGE_EXTENSIONS.has(extOf(handle.name))) {
      const fh = handle as FileSystemFileHandle
      return { handle: fh, file: await fh.getFile(), ext: extOf(handle.name) }
    }
  }
  return null
}

/** 子目录项（目录树懒加载用） */
export interface SubdirEntry {
  name: string
  handle: FileSystemDirectoryHandle
}

/** 枚举直接子目录，按名称自然序排序 */
export async function readSubdirs(dir: FileSystemDirectoryHandle): Promise<SubdirEntry[]> {
  const out: SubdirEntry[] = []
  for await (const handle of (dir as IterableDirectoryHandle).values()) {
    if (handle.kind === 'directory') {
      out.push({ name: handle.name, handle: handle as FileSystemDirectoryHandle })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'zh', { numeric: true, sensitivity: 'base' }))
}

/** 目录链的唯一键：从根到当前目录的名字路径 */
export function dirKey(chain: readonly FileSystemDirectoryHandle[]): string {
  return chain.map(h => h.name).join('/')
}

/** 并发解析图片尺寸，分批回调更新（供瀑布流布局用），对标原版多线程缩略图元数据读取 */
export async function fillImageSizes(
  models: FileModel[],
  isCancelled: () => boolean,
  onBatch: (patch: Record<string, { width: number; height: number }>) => void,
): Promise<void> {
  const images = models.filter(m => m.type === 'image')
  let acc: Record<string, { width: number; height: number }> = {}
  const flush = () => {
    if (Object.keys(acc).length > 0) {
      onBatch(acc)
      acc = {}
    }
  }
  await runPool(images, 8, async m => {
    if (isCancelled() || !m.handle) return
    try {
      const size = await readImageDimensions(await m.handle.getFile())
      if (size && size.width > 0 && size.height > 0) acc[m.id] = size
    } catch { /* 跳过解析失败的文件 */ }
  }, done => {
    if (done % 100 === 0 || done === images.length) flush()
  })
  flush()
}
