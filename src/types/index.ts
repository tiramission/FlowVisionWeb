// 数据模型（对标 FlowVision 的 DataModel.swift / Enum.swift）
// 注：tsconfig 开启 erasableSyntaxOnly，不允许 enum，统一用字符串联合类型

export type FileType = 'image' | 'video'

export type LayoutType = 'waterfall' | 'grid'

export type SortType = 'name' | 'size' | 'date'

export type ThemeMode = 'light' | 'dark'

export interface FileModel {
  /** 目录内唯一标识（文件名） */
  id: string
  name: string
  ext: string
  type: FileType
  size: number
  lastModified: number
  handle: FileSystemFileHandle
  /** 原始像素宽，未知时省略（布局按 aspectOf 回退） */
  width?: number
  height?: number
}

/** 宽高比（高/宽）。未知尺寸时图片回退 1:1、视频回退 16:9 */
export function aspectOf(file: FileModel): number {
  if (file.width && file.height) return file.height / file.width
  return file.type === 'video' ? 9 / 16 : 1
}
