import { useMemo } from 'react'
import { filterFiles } from '@/lib/search'
import { sortFiles } from '@/lib/sort'
import { useAppStore } from '@/store/useAppStore'

/** 搜索过滤 + 排序后的可见文件列表。Gallery 与 Viewer 共用，保证两者顺序一致 */
export function useSortedFiles() {
  const files = useAppStore(s => s.files)
  const searchQuery = useAppStore(s => s.searchQuery)
  const searchRegex = useAppStore(s => s.searchRegex)
  const sortType = useAppStore(s => s.sortType)
  const sortAsc = useAppStore(s => s.sortAsc)
  const randomSeed = useAppStore(s => s.randomSeed)
  // 拼音字典异步加载完成后需要重算一次（拼音匹配从无到有）
  const pinyinReady = useAppStore(s => s.pinyinReady)
  return useMemo(
    () => sortFiles(filterFiles(files, searchQuery, searchRegex), sortType, sortAsc, randomSeed),
    [files, searchQuery, searchRegex, sortType, sortAsc, randomSeed, pinyinReady],
  )
}
