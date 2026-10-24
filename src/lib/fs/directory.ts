import type { FileModel } from '@/types'
import { readImageDimensions } from '@/lib/image/dimensions'
import { FILE_EXTENSIONS, VIDEO_EXTENSIONS } from './constants'
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

async function collectHandles(dir: FileSystemDirectoryHandle): Promise<FileSystemFileHandle[]> {
  const out: FileSystemFileHandle[] = []
  for await (const handle of (dir as IterableDirectoryHandle).values()) {
    if (handle.kind === 'file' && FILE_EXTENSIONS.has(extOf(handle.name))) {
      out.push(handle as FileSystemFileHandle)
    }
  }
  return out
}

/** 枚举目录内受支持的文件并读取元信息（size/lastModified），getFile 不读文件内容，开销小 */
export async function readDirectory(
  dir: FileSystemDirectoryHandle,
  onProgress: (done: number, total: number) => void,
): Promise<FileModel[]> {
  const handles = await collectHandles(dir)
  const total = handles.length
  onProgress(0, total)
  const models = await runPool(handles, 64, async (handle): Promise<FileModel> => {
    const file = await handle.getFile()
    const ext = extOf(handle.name)
    return {
      id: handle.name,
      name: handle.name,
      ext,
      type: VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image',
      size: file.size,
      lastModified: file.lastModified,
      handle,
    }
  }, done => onProgress(done, total))
  return models.sort((a, b) => a.name.localeCompare(b.name, 'zh', { numeric: true, sensitivity: 'base' }))
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
    if (isCancelled()) return
    try {
      const size = await readImageDimensions(await m.handle.getFile())
      if (size && size.width > 0 && size.height > 0) acc[m.id] = size
    } catch { /* 跳过解析失败的文件 */ }
  }, done => {
    if (done % 100 === 0 || done === images.length) flush()
  })
  flush()
}
