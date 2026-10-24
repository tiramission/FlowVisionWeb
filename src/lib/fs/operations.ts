// 文件管理操作（对标原版 FileOperation.swift）：重命名/删除/复制/移动/新建文件夹
// 建立在 File System Access API 写能力上；move() 是 Chrome 扩展 API，
// lib.dom 未收录需自行声明，且不可用时自动回退为复制+删除

type AnyHandle = FileSystemFileHandle | FileSystemDirectoryHandle

// Chrome 扩展：FileSystemHandle.move()，重命名 / 移动到目标目录
interface MovableHandle {
  move(newName: string): Promise<void>
  move(dest: FileSystemDirectoryHandle, newName?: string): Promise<void>
}

// lib.dom 未收录的权限查询/申请（File System Access API 标准部分）
interface PermissionHandle {
  queryPermission(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemHandle>
}

/** 写操作前申请写权限（read 模式打开的目录首次写时由用户手势触发授权弹窗） */
export async function ensureWritePermission(dir: FileSystemDirectoryHandle): Promise<boolean> {
  const h = dir as unknown as PermissionHandle
  if (await h.queryPermission({ mode: 'readwrite' }) === 'granted') return true
  return await h.requestPermission({ mode: 'readwrite' }) === 'granted'
}

/** 会话恢复的句柄首次访问前申请读权限（收藏夹跨会话跳转用） */
export async function ensureReadPermission(dir: FileSystemDirectoryHandle): Promise<boolean> {
  const h = dir as unknown as PermissionHandle
  if (await h.queryPermission({ mode: 'read' }) === 'granted') return true
  return await h.requestPermission({ mode: 'read' }) === 'granted'
}

async function entryExists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name)
    return true
  } catch { /* 不是文件 */ }
  try {
    await dir.getDirectoryHandle(name)
    return true
  } catch {
    return false
  }
}

/** 目标已有同名时自动加序号：name (2).ext、name (3).ext … */
export async function uniqueName(dir: FileSystemDirectoryHandle, desired: string): Promise<string> {
  if (!(await entryExists(dir, desired))) return desired
  const dot = desired.lastIndexOf('.')
  const stem = dot > 0 ? desired.slice(0, dot) : desired
  const ext = dot > 0 ? desired.slice(dot) : ''
  for (let i = 2; ; i++) {
    const candidate = `${stem} (${i})${ext}`
    if (!(await entryExists(dir, candidate))) return candidate
  }
}

/** 从当前目录沿 relPath 的目录部分下钻，得到条目的父目录句柄 */
export async function resolveParentDir(current: FileSystemDirectoryHandle, relPath: string): Promise<FileSystemDirectoryHandle> {
  const parts = relPath.split('/')
  parts.pop()
  let dir = current
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part)
  }
  return dir
}

/** 重命名（优先原生 move，仅改名） */
export async function renameEntry(handle: AnyHandle, newName: string): Promise<void> {
  await (handle as unknown as MovableHandle).move(newName)
}

/** 删除条目（recursive 删目录） */
export async function deleteEntry(parent: FileSystemDirectoryHandle, name: string): Promise<void> {
  await parent.removeEntry(name, { recursive: true })
}

/** 新建文件夹，baseName 冲突时自动加序号，返回最终名字 */
export async function createDirectory(parent: FileSystemDirectoryHandle, baseName = '新建文件夹'): Promise<string> {
  const name = await uniqueName(parent, baseName)
  await parent.getDirectoryHandle(name, { create: true })
  return name
}

async function copyFileInto(src: FileSystemFileHandle, destDir: FileSystemDirectoryHandle, name: string): Promise<void> {
  const file = await src.getFile()
  const target = await destDir.getFileHandle(name, { create: true })
  const writable = await target.createWritable()
  await writable.write(file)
  await writable.close()
}

async function copyDirRecursive(src: FileSystemDirectoryHandle, destDir: FileSystemDirectoryHandle): Promise<void> {
  for await (const entry of (src as IterableDirectoryHandle).values()) {
    if (entry.kind === 'file') {
      await copyFileInto(entry as FileSystemFileHandle, destDir, entry.name)
    } else {
      const sub = await destDir.getDirectoryHandle(entry.name, { create: true })
      await copyDirRecursive(entry as FileSystemDirectoryHandle, sub)
    }
  }
}

/** 复制条目到目标目录（目录递归），返回落地名字 */
export async function copyEntry(src: AnyHandle, destDir: FileSystemDirectoryHandle): Promise<string> {
  const name = await uniqueName(destDir, src.name)
  if (src.kind === 'file') {
    await copyFileInto(src as FileSystemFileHandle, destDir, name)
  } else {
    const newDir = await destDir.getDirectoryHandle(name, { create: true })
    await copyDirRecursive(src as FileSystemDirectoryHandle, newDir)
  }
  return name
}

/**
 * 移动条目到目标目录：优先原生 move（瞬时、不复制数据），
 * 不支持（如 Firefox）或失败时回退为复制 + 从源目录删除
 */
export async function moveEntry(src: AnyHandle, sourceDir: FileSystemDirectoryHandle, destDir: FileSystemDirectoryHandle): Promise<string> {
  const name = await uniqueName(destDir, src.name)
  try {
    const movable = src as unknown as MovableHandle
    if (name === src.name) {
      await movable.move(destDir)
    } else {
      await movable.move(destDir, name)
    }
    return name
  } catch {
    // 回退路径：复制后删除源
    const copied = await copyEntry(src, destDir)
    await deleteEntry(sourceDir, src.name)
    return copied
  }
}
