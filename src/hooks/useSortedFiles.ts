import { useMemo } from 'react'
import { filterFiles } from '@/lib/search'
import { sortFiles } from '@/lib/sort'
import { useAppStore } from '@/store/useAppStore'

/** 搜索过滤 + 排序后的可见文件列表。Gallery 与 Viewer 共用；
 *  未打开目录时合并 PWA file_handler 传入的启动文件 */
export function useSortedFiles() {
  const files = useAppStore(s => s.files)
  const launchFiles = useAppStore(s => s.launchFiles)
  const rootHandle = useAppStore(s => s.rootHandle)
  const searchQuery = useAppStore(s => s.searchQuery)
  const searchRegex = useAppStore(s => s.searchRegex)
  const sortType = useAppStore(s => s.sortType)
  const sortAsc = useAppStore(s => s.sortAsc)
  const randomSeed = useAppStore(s => s.randomSeed)
  // 拼音字典异步加载完成后需要重算一次（拼音匹配从无到有）
  const pinyinReady = useAppStore(s => s.pinyinReady)
  const effective = rootHandle ? files : launchFiles
  return useMemo(
    () => sortFiles(filterFiles(effective, searchQuery, searchRegex), sortType, sortAsc, randomSeed),
    [effective, searchQuery, searchRegex, sortType, sortAsc, randomSeed, pinyinReady],
  )
}
