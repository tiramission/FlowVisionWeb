// 数据模型（对标 FlowVision 的 DataModel.swift / Enum.swift）
// 注：tsconfig 开启 erasableSyntaxOnly，不允许 enum，统一用字符串联合类型
import type { FileRef } from '@/lib/fs/ref'

export type FileType = 'image' | 'video' | 'folder'

export type LayoutType = 'waterfall' | 'justified' | 'grid' | 'detail'

export type SortType = 'name' | 'size' | 'date' | 'type' | 'random'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface FileModel {
  /** 当前目录内唯一标识（递归模式下为相对路径） */
  id: string
  name: string
  /** 相对当前目录的路径（顶层文件等于文件名，递归模式含子目录前缀） */
  relPath: string
  ext: string
  type: FileType
  size: number
  lastModified: number
  /** 文件条目的读取引用（本地句柄 / WebDAV 远程引用）；文件夹条目为 null */
  handle: FileRef | null
  /** 仅本地文件夹条目：用于进入导航与堆叠缩略图 */
  dirHandle?: FileSystemDirectoryHandle
  /** 仅远程文件夹条目：下钻与堆叠封面用的目录引用 */
  remoteDir?: { connId: string; href: string }
  /** 原始像素宽，未知时省略（布局按 aspectOf 回退） */
  width?: number
  height?: number
}

/** 宽高比（高/宽）。未知尺寸时图片/文件夹回退 1:1、视频回退 16:9 */
export function aspectOf(file: FileModel): number {
  if (file.width && file.height) return file.height / file.width
  if (file.type === 'video') return 9 / 16
  return 1
}
