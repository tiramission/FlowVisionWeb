import type { FileModel, SortType } from '@/types'

/** 排序（对标原版 16 种排序的 MVP 子集），Array.prototype.sort 稳定 */
export function sortFiles(files: FileModel[], sortType: SortType, asc: boolean): FileModel[] {
  const dir = asc ? 1 : -1
  const sorted = [...files]
  sorted.sort((a, b) => {
    if (sortType === 'size') return (a.size - b.size) * dir
    if (sortType === 'date') return (a.lastModified - b.lastModified) * dir
    return a.name.localeCompare(b.name, 'zh', { numeric: true, sensitivity: 'base' }) * dir
  })
  return sorted
}
