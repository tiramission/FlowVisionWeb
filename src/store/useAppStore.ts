import { create } from 'zustand'
import { fillImageSizes, pickDirectory, readDirectory } from '@/lib/fs/directory'
import type { FileModel, LayoutType, SortType, ThemeMode } from '@/types'

type Status = 'idle' | 'scanning' | 'ready'

const THEME_KEY = 'fv-theme'

function initTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* localStorage 不可用时回退系统偏好 */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

interface AppStore {
  status: Status
  scanProgress: { done: number; total: number } | null
  rootName: string
  files: FileModel[]
  layout: LayoutType
  columnWidth: number
  sortType: SortType
  sortAsc: boolean
  selectedId: string | null
  viewerId: string | null
  theme: ThemeMode
  openDirectory: () => Promise<void>
  setLayout: (layout: LayoutType) => void
  setColumnWidth: (w: number) => void
  setSortType: (t: SortType) => void
  toggleSortAsc: () => void
  select: (id: string | null) => void
  openViewer: (id: string) => void
  setViewerId: (id: string | null) => void
  closeViewer: () => void
  reportSize: (id: string, width: number, height: number) => void
  toggleTheme: () => void
}

/** 目录扫描代数：切换文件夹时递增，旧扫描的回调据此失效 */
let scanGeneration = 0

export const useAppStore = create<AppStore>((set, get) => ({
  status: 'idle',
  scanProgress: null,
  rootName: '',
  files: [],
  layout: 'waterfall',
  columnWidth: 220,
  sortType: 'name',
  sortAsc: true,
  selectedId: null,
  viewerId: null,
  theme: initTheme(),

  openDirectory: async () => {
    const dir = await pickDirectory()
    if (!dir) return
    const gen = ++scanGeneration
    set({ status: 'scanning', files: [], scanProgress: null, rootName: dir.name, selectedId: null, viewerId: null })
    try {
      const models = await readDirectory(dir, (done, total) => {
        if (scanGeneration === gen) set({ scanProgress: { done, total } })
      })
      if (scanGeneration !== gen) return
      set({ files: models, status: 'ready', scanProgress: null })
      // 尺寸解析放扫描完成后分批回填，列表先以上限 1:1 展示
      await fillImageSizes(
        models,
        () => scanGeneration !== gen,
        patch => {
          if (scanGeneration !== gen) return
          set(s => ({ files: s.files.map(f => (patch[f.id] ? { ...f, ...patch[f.id] } : f)) }))
        },
      )
    } catch (err) {
      console.error('读取目录失败:', err)
      if (scanGeneration === gen) set({ status: 'idle', files: [], scanProgress: null })
    }
  },

  setLayout: layout => set({ layout }),
  setColumnWidth: w => set({ columnWidth: w }),
  setSortType: t => set({ sortType: t }),
  toggleSortAsc: () => set(s => ({ sortAsc: !s.sortAsc })),
  select: id => set({ selectedId: id }),
  openViewer: id => set({ viewerId: id, selectedId: id }),
  setViewerId: id => set({ viewerId: id, selectedId: id ?? get().selectedId }),
  closeViewer: () => set({ viewerId: null }),

  reportSize: (id, width, height) => set(s => {
    const i = s.files.findIndex(f => f.id === id)
    if (i === -1 || s.files[i].width) return {}
    const files = s.files.slice()
    files[i] = { ...files[i], width, height }
    return { files }
  }),

  toggleTheme: () => set(s => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
}))
