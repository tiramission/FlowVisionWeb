import type { FileModel, SortType } from '@/types'

/** FNV-1a 字符串哈希（随机排序用） */
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * 排序（对标原版 16 种排序的子集），文件夹固定排在文件前。
 * 随机序按种子稳定：切方向/重选时换种子重洗，尺寸回填等重排不会打乱顺序。
 * 注：浏览器 File API 不提供创建时间，创建日期排序暂缺
 */
export function sortFiles(files: FileModel[], sortType: SortType, asc: boolean, randomSeed = 0): FileModel[] {
  const dir = asc ? 1 : -1
  const rank = (f: FileModel) => (f.type === 'folder' ? 0 : 1)
  const byName = (a: FileModel, b: FileModel) =>
    a.name.localeCompare(b.name, 'zh', { numeric: true, sensitivity: 'base' })
  const sorted = [...files]
  sorted.sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    if (sortType === 'random') {
      return hashStr(`${randomSeed}:${a.id}`) - hashStr(`${randomSeed}:${b.id}`)
    }
    if (sortType === 'type') {
      const byExt = a.ext.localeCompare(b.ext)
      return byExt !== 0 ? byExt * dir : byName(a, b)
    }
    if (sortType === 'size') return (a.size - b.size) * dir
    if (sortType === 'date') return (a.lastModified - b.lastModified) * dir
    return byName(a, b) * dir
  })
  return sorted
}
