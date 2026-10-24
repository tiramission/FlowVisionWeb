import { create } from 'zustand'
import { dirKey, fillImageSizes, pickDirectory, readDirectory, readSubdirs, type SubdirEntry } from '@/lib/fs/directory'
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
  /** 根目录句柄；idle 时为 null */
  rootHandle: FileSystemDirectoryHandle | null
  /** 当前目录链（根在前），File System Access API 没有取父目录的能力，导航靠维护这条链 */
  dirChain: FileSystemDirectoryHandle[]
  /** 目录树子节点缓存（懒加载），键为 dirKey */
  treeChildren: Record<string, SubdirEntry[]>
  /** 展开的目录键 */
  expandedKeys: string[]
  sidebarOpen: boolean
  /** 浏览历史（目录链数组）与当前下标，支持前进/后退 */
  historyChains: FileSystemDirectoryHandle[][]
  historyIndex: number
  files: FileModel[]
  layout: LayoutType
  columnWidth: number
  /** 递归子目录模式：扫描当前目录下所有子目录（对标原版 Recursive mode） */
  recursive: boolean
  sortType: SortType
  sortAsc: boolean
  selectedId: string | null
  viewerId: string | null
  theme: ThemeMode
  openDirectory: () => Promise<void>
  /** 导航到目标目录链并扫描，push=true 时写入历史 */
  navigateTo: (chain: readonly FileSystemDirectoryHandle[]) => Promise<void>
  /** 按当前设置重新扫描当前目录（不写历史） */
  rescan: () => void
  goUp: () => void
  goBack: () => void
  goForward: () => void
  /** 切换递归模式并立即重扫 */
  toggleRecursive: () => void
  /** 展开/折叠目录树节点，首次展开时懒加载子目录 */
  toggleDir: (key: string, chain: readonly FileSystemDirectoryHandle[]) => Promise<void>
  toggleSidebar: () => void
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

/** 目录扫描代数：导航/切换根目录时递增，旧扫描的回调据此失效 */
let scanGeneration = 0

export const useAppStore = create<AppStore>((set, get) => {
  /** 扫描 chain 末端目录的文件并进入浏览状态 */
  const browse = async (chain: readonly FileSystemDirectoryHandle[], push: boolean) => {
    const gen = ++scanGeneration
    const dir = chain[chain.length - 1]
    set(s => {
      const truncated = push ? s.historyChains.slice(0, s.historyIndex + 1) : s.historyChains
      const historyChains = push ? [...truncated, [...chain]] : s.historyChains
      return {
        status: 'scanning',
        files: [],
        scanProgress: null,
        rootHandle: chain[0],
        dirChain: [...chain],
        selectedId: null,
        viewerId: null,
        // 自动展开祖先节点，让当前目录在树上可见（对标原版 dirTreeAutoExpand）
        expandedKeys: Array.from(new Set([
          ...s.expandedKeys,
          ...Array.from({ length: chain.length - 1 }, (_, i) => dirKey(chain.slice(0, i + 1))),
        ])),
        historyChains,
        historyIndex: push ? truncated.length : s.historyIndex,
      }
    })
    try {
      const models = await readDirectory(dir, {
        recursive: get().recursive,
        onProgress: (done, total) => {
          if (scanGeneration === gen) set({ scanProgress: { done, total } })
        },
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
      if (scanGeneration === gen) set({ status: 'ready', files: [], scanProgress: null })
    }
  }

  return {
    status: 'idle',
    scanProgress: null,
    rootHandle: null,
    dirChain: [],
    treeChildren: {},
    expandedKeys: [],
    sidebarOpen: true,
    historyChains: [],
    historyIndex: -1,
    files: [],
    layout: 'waterfall',
    columnWidth: 220,
    recursive: false,
    sortType: 'name',
    sortAsc: true,
    selectedId: null,
    viewerId: null,
    theme: initTheme(),

    openDirectory: async () => {
      const dir = await pickDirectory()
      if (!dir) return
      set({ treeChildren: {}, expandedKeys: [], historyChains: [], historyIndex: -1, sidebarOpen: true })
      await browse([dir], true)
    },

    navigateTo: async chain => { await browse(chain, true) },

    rescan: () => {
      const { dirChain } = get()
      if (dirChain.length > 0) void browse(dirChain, false)
    },

    goUp: () => {
      const { dirChain } = get()
      if (dirChain.length > 1) void browse(dirChain.slice(0, -1), true)
    },

    goBack: () => {
      const s = get()
      if (s.historyIndex <= 0) return
      const index = s.historyIndex - 1
      set({ historyIndex: index })
      void browse(s.historyChains[index], false)
    },

    goForward: () => {
      const s = get()
      if (s.historyIndex >= s.historyChains.length - 1) return
      const index = s.historyIndex + 1
      set({ historyIndex: index })
      void browse(s.historyChains[index], false)
    },

    toggleDir: async (key, chain) => {
      const s = get()
      if (s.expandedKeys.includes(key)) {
        set({ expandedKeys: s.expandedKeys.filter(k => k !== key) })
        return
      }
      set({ expandedKeys: [...s.expandedKeys, key] })
      if (!s.treeChildren[key]) {
        const rootAtRequest = s.rootHandle
        try {
          const children = await readSubdirs(chain[chain.length - 1])
          // 等待期间可能已切换根目录，丢弃过期结果
          if (get().rootHandle !== rootAtRequest) return
          set(st => ({ treeChildren: { ...st.treeChildren, [key]: children } }))
        } catch (err) {
          console.warn('读取子目录失败:', err)
        }
      }
    },

    toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),

    toggleRecursive: () => {
      set(s => ({ recursive: !s.recursive }))
      get().rescan()
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
  }
})
