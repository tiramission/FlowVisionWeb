import { useMemo } from 'react'
import { sortFiles } from '@/lib/sort'
import { useAppStore } from '@/store/useAppStore'

/** 排序后的文件列表。Gallery 与 Viewer 共用，保证两者顺序一致 */
export function useSortedFiles() {
  const files = useAppStore(s => s.files)
  const sortType = useAppStore(s => s.sortType)
  const sortAsc = useAppStore(s => s.sortAsc)
  return useMemo(() => sortFiles(files, sortType, sortAsc), [files, sortType, sortAsc])
}
