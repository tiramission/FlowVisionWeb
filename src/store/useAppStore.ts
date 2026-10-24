import { create } from 'zustand'
import { addFavorite, listFavorites, removeFavorite, type FavItem } from '@/lib/favorites'
import { dirKey, fillImageSizes, hasMedia, pickDirectory, readDirectory, readSubdirs, type SubdirEntry } from '@/lib/fs/directory'
import { copyEntry, createDirectory, deleteEntry, ensureReadPermission, ensureWritePermission, moveEntry, renameEntry, resolveParentDir } from '@/lib/fs/operations'
import type { FileModel, LayoutType, SortType, ThemeMode } from '@/types'

type Status = 'idle' | 'scanning' | 'ready'

/** 可持久化偏好（对标原版各 Settings 页），localStorage 键 fv-settings */
export interface Settings {
  /** 主题模式：system 跟随系统 */
  themeMode: ThemeMode
  /** 滚动灵敏度 1-9，5 = 1x，公式 2^((s-5)/2)（对标原版） */
  scrollSensitivity: number
  /** 缩略图间距 px */
  gap: number
  /** 画廊纯黑背景（对标原版 blackBg） */
  pureBlack: boolean
  /** 默认布局（应用启动时） */
  defaultLayout: LayoutType
  /** 缩略图大小 */
  columnWidth: number
  /** 视频断点续播（对标原版 videoPlayRememberPosition，默认开） */
  rememberVideoPos: boolean
  /** 视频顺序连播（对标原版 videoPlaySequentialPlay） */
  autoPlayNext: boolean
  /** 视频音量与倍速记忆（对标原版 videoVolume / videoPlaybackRate） */
  videoVolume: number
  videoPlaybackRate: number
}

const DEFAULT_SETTINGS: Settings = {
  themeMode: 'system',
  scrollSensitivity: 5,
  gap: 8,
  pureBlack: false,
  defaultLayout: 'waterfall',
  columnWidth: 220,
  rememberVideoPos: true,
  autoPlayNext: false,
  videoVolume: 1,
  videoPlaybackRate: 1,
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('fv-settings')
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) as Partial<Settings> }
    // 兼容旧版独立的主题持久化
    const oldTheme = localStorage.getItem('fv-theme')
    if (oldTheme === 'light' || oldTheme === 'dark') {
      return { ...DEFAULT_SETTINGS, themeMode: oldTheme }
    }
  } catch { /* 解析失败回退默认 */ }
  return DEFAULT_SETTINGS
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export interface ClipEntry {
  name: string
  handle: FileSystemFileHandle | FileSystemDirectoryHandle
}

export interface Clipboard {
  mode: 'copy' | 'cut'
  /** 源父目录（剪切移动回退删除用）与源目录键（变淡显示与同目录判断用） */
  sourceDir: FileSystemDirectoryHandle
  sourceDirKey: string
  entries: ClipEntry[]
}

export interface Toast {
  text: string
  kind: 'info' | 'error'
}

const initialSettings = loadSettings()

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
  /** 递归子目录模式：扫描当前目录下所有子目录（对标原版 Recursive mode） */
  recursive: boolean
  sortType: SortType
  sortAsc: boolean
  /** 随机排序种子，切方向/重选随机时更新以重洗 */
  randomSeed: number
  searchQuery: string
  searchRegex: boolean
  /** 拼音字典按需加载完成（就绪后需重新过滤一次） */
  pinyinReady: boolean
  selectedId: string | null
  viewerId: string | null
  /** 偏好设置（持久化），theme 为 themeMode 的解析结果 */
  settings: Settings
  theme: 'light' | 'dark'
  /** 文件管理：剪贴板 / 对话框目标 / 轻提示（对标原版 isCutMode、cutItemPaths、operationLogs） */
  clipboard: Clipboard | null
  renameTarget: FileModel | null
  deleteTarget: FileModel | null
  toast: Toast | null
  /** 收藏夹（对标原版 myFavoritesArray），IDB 持久化 */
  favorites: FavItem[]
  favoritesLoaded: boolean
  openDirectory: () => Promise<void>
  /** 导航到目标目录链并扫描，push=true 时写入历史 */
  navigateTo: (chain: readonly FileSystemDirectoryHandle[]) => Promise<void>
  /** 按当前设置重新扫描当前目录（不写历史）；silent 不清列表避免闪烁（文件操作后刷新） */
  rescan: (silent?: boolean) => void
  goUp: () => void
  goBack: () => void
  goForward: () => void
  /** 切换递归模式并立即重扫 */
  toggleRecursive: () => void
  /** 跳到父目录中上/下一个含有媒体文件的兄弟目录（对标原版 A/D 手势） */
  goSiblingImageDir: (delta: 1 | -1) => Promise<void>
  setSearchQuery: (q: string) => void
  setSearchRegex: (b: boolean) => void
  setPinyinReady: () => void
  copyEntries: (entries: ClipEntry[]) => void
  cutEntries: (entries: ClipEntry[]) => void
  pasteIntoCurrent: () => Promise<void>
  renameInCurrent: (file: FileModel, newName: string) => Promise<void>
  deleteInCurrent: (file: FileModel) => Promise<void>
  createFolderInCurrent: () => Promise<void>
  /** 拖拽移动条目到目标目录链（目录树/面包屑 drop） */
  moveToDir: (file: FileModel, targetChain: readonly FileSystemDirectoryHandle[]) => Promise<void>
  loadFavorites: () => Promise<void>
  toggleFavoriteCurrent: () => Promise<void>
  removeFavoriteByKey: (key: string) => Promise<void>
  openFavorite: (item: FavItem) => Promise<void>
  setRenameTarget: (f: FileModel | null) => void
  setDeleteTarget: (f: FileModel | null) => void
  showToast: (text: string, kind?: Toast['kind']) => void
  /** 展开/折叠目录树节点，首次展开时懒加载子目录 */
  toggleDir: (key: string, chain: readonly FileSystemDirectoryHandle[]) => Promise<void>
  toggleSidebar: () => void
  setLayout: (layout: LayoutType) => void
  /** 更新偏好设置（themeMode 变化时同步解析 theme），由 App 层持久化 */
  setSetting: (partial: Partial<Settings>) => void
  /** 系统主题变化时重算（仅 themeMode=system 生效） */
  syncSystemTheme: () => void
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
/** toast 自动消失计时器 */
let toastTimer: number | null = null

export const useAppStore = create<AppStore>((set, get) => {
  /** 扫描 chain 末端目录的文件并进入浏览状态；silent 保留现有列表（文件操作后平滑刷新） */
  const browse = async (chain: readonly FileSystemDirectoryHandle[], push: boolean, silent = false) => {
    const gen = ++scanGeneration
    const dir = chain[chain.length - 1]
    set(s => {
      const truncated = push ? s.historyChains.slice(0, s.historyIndex + 1) : s.historyChains
      const historyChains = push ? [...truncated, [...chain]] : s.historyChains
      return {
        status: silent ? s.status : 'scanning',
        files: silent ? s.files : [],
        scanProgress: null,
        rootHandle: chain[0],
        dirChain: [...chain],
        selectedId: silent ? s.selectedId : null,
        viewerId: s.viewerId,
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
    layout: initialSettings.defaultLayout,
    recursive: false,
    sortType: 'name',
    sortAsc: true,
    randomSeed: 1,
    searchQuery: '',
    searchRegex: false,
    pinyinReady: false,
    selectedId: null,
    viewerId: null,
    settings: initialSettings,
    theme: resolveTheme(initialSettings.themeMode),
    clipboard: null,
    renameTarget: null,
    deleteTarget: null,
    toast: null,
    favorites: [],
    favoritesLoaded: false,

    openDirectory: async () => {
      const dir = await pickDirectory()
      if (!dir) return
      set({ treeChildren: {}, expandedKeys: [], historyChains: [], historyIndex: -1, sidebarOpen: true, clipboard: null })
      await browse([dir], true)
    },

    navigateTo: async chain => { await browse(chain, true) },

    rescan: (silent = false) => {
      const { dirChain } = get()
      if (dirChain.length > 0) void browse(dirChain, false, silent)
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

    goSiblingImageDir: async delta => {
      const s = get()
      if (s.dirChain.length < 2) {
        s.showToast('已在根目录，没有同级文件夹')
        return
      }
      const parentChain = s.dirChain.slice(0, -1)
      const parent = s.dirChain[s.dirChain.length - 2]
      const siblings = await readSubdirs(parent)
      const curName = s.dirChain[s.dirChain.length - 1].name
      const curIdx = siblings.findIndex(e => e.name === curName)
      const start = curIdx === -1 ? (delta === 1 ? -1 : siblings.length) : curIdx
      for (let i = start + delta; i >= 0 && i < siblings.length; i += delta) {
        const candidate = siblings[i]
        if (await hasMedia(candidate.handle)) {
          await get().navigateTo([...parentChain, candidate.handle])
          return
        }
      }
      s.showToast(delta === 1 ? '后面没有包含图片的文件夹了' : '前面没有包含图片的文件夹了')
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

    setSearchQuery: q => set({ searchQuery: q }),
    setSearchRegex: b => set({ searchRegex: b }),
    setPinyinReady: () => set({ pinyinReady: true }),

    showToast: (text, kind = 'info') => {
      if (toastTimer !== null) window.clearTimeout(toastTimer)
      set({ toast: { text, kind } })
      toastTimer = window.setTimeout(() => {
        set(s => (s.toast?.text === text && s.toast.kind === kind ? { toast: null } : {}))
        toastTimer = null
      }, 2600)
    },
    loadFavorites: async () => {
      set({ favorites: await listFavorites(), favoritesLoaded: true })
    },

    toggleFavoriteCurrent: async () => {
      const s = get()
      if (!s.dirChain.length) return
      const key = dirKey(s.dirChain)
      if (s.favorites.some(f => f.key === key)) {
        await removeFavorite(key)
        await s.loadFavorites()
        s.showToast('已从收藏夹移除')
        return
      }
      const last = s.dirChain[s.dirChain.length - 1]
      await addFavorite({ key, name: last.name, chain: [...s.dirChain] })
      await s.loadFavorites()
      s.showToast('已加入收藏夹')
    },

    removeFavoriteByKey: async key => {
      await removeFavorite(key)
      await get().loadFavorites()
      get().showToast('已从收藏夹移除')
    },

    openFavorite: async item => {
      // 会话恢复的句柄需要重新授权（此刻处于用户手势中，可弹授权框）
      const root = item.chain[0]
      if (!(await ensureReadPermission(root))) {
        get().showToast('未获得文件夹访问权限', 'error')
        return
      }
      await get().navigateTo(item.chain)
    },

    setRenameTarget: f => set({ renameTarget: f }),
    setDeleteTarget: f => set({ deleteTarget: f }),

    copyEntries: entries => {
      const { dirChain } = get()
      if (!entries.length || !dirChain.length) return
      set({
        clipboard: {
          mode: 'copy',
          sourceDir: dirChain[dirChain.length - 1],
          sourceDirKey: dirKey(dirChain),
          entries,
        },
      })
      get().showToast(`已复制 ${entries.length} 项`)
    },

    cutEntries: entries => {
      const { dirChain } = get()
      if (!entries.length || !dirChain.length) return
      set({
        clipboard: {
          mode: 'cut',
          sourceDir: dirChain[dirChain.length - 1],
          sourceDirKey: dirKey(dirChain),
          entries,
        },
      })
      get().showToast(`已剪切 ${entries.length} 项`)
    },

    pasteIntoCurrent: async () => {
      const s = get()
      const clip = s.clipboard
      const cur = s.dirChain[s.dirChain.length - 1]
      if (!clip || !cur) return
      if (clip.mode === 'cut' && clip.sourceDirKey === dirKey(s.dirChain)) {
        set({ clipboard: null })
        s.showToast('源目录与目标相同，已清空剪贴板')
        return
      }
      if (!(await ensureWritePermission(cur))) {
        s.showToast('未获得写入权限，粘贴取消', 'error')
        return
      }
      try {
        for (const entry of clip.entries) {
          if (clip.mode === 'copy') await copyEntry(entry.handle, cur)
          else await moveEntry(entry.handle, clip.sourceDir, cur)
        }
        if (clip.mode === 'cut') set({ clipboard: null })
        set(st => {
          const treeChildren = { ...st.treeChildren }
          delete treeChildren[dirKey(st.dirChain)]
          return { treeChildren }
        })
        get().rescan(true)
        get().showToast(`已粘贴 ${clip.entries.length} 项`)
      } catch (err) {
        console.error('粘贴失败:', err)
        get().showToast('粘贴失败，详见控制台', 'error')
      }
    },

    renameInCurrent: async (file, newName) => {
      const s = get()
      const cur = s.dirChain[s.dirChain.length - 1]
      if (!cur) return
      const handle = file.handle ?? file.dirHandle
      if (!handle) return
      try {
        const parent = await resolveParentDir(cur, file.relPath)
        if (!(await ensureWritePermission(parent))) {
          s.showToast('未获得写入权限，重命名取消', 'error')
          return
        }
        await renameEntry(handle, newName)
        set(st => {
          const treeChildren = { ...st.treeChildren }
          delete treeChildren[dirKey(st.dirChain)]
          return { treeChildren, clipboard: null }
        })
        get().rescan(true)
        get().showToast(`已重命名为 ${newName}`)
      } catch (err) {
        console.error('重命名失败:', err)
        get().showToast('重命名失败（浏览器可能不支持）', 'error')
      }
    },

    deleteInCurrent: async file => {
      const s = get()
      const cur = s.dirChain[s.dirChain.length - 1]
      if (!cur) return
      try {
        const parent = await resolveParentDir(cur, file.relPath)
        if (!(await ensureWritePermission(parent))) {
          s.showToast('未获得写入权限，删除取消', 'error')
          return
        }
        await deleteEntry(parent, file.name)
        set(st => {
          const treeChildren = { ...st.treeChildren }
          delete treeChildren[dirKey(st.dirChain)]
          return {
            treeChildren,
            clipboard: null,
            viewerId: st.viewerId === file.id ? null : st.viewerId,
            selectedId: st.selectedId === file.id ? null : st.selectedId,
          }
        })
        get().rescan(true)
        get().showToast(`已删除 ${file.name}`)
      } catch (err) {
        console.error('删除失败:', err)
        get().showToast('删除失败，详见控制台', 'error')
      }
    },

    createFolderInCurrent: async () => {
      const s = get()
      const cur = s.dirChain[s.dirChain.length - 1]
      if (!cur) return
      try {
        if (!(await ensureWritePermission(cur))) {
          s.showToast('未获得写入权限，新建取消', 'error')
          return
        }
        const name = await createDirectory(cur)
        set(st => {
          const treeChildren = { ...st.treeChildren }
          delete treeChildren[dirKey(st.dirChain)]
          return { treeChildren }
        })
        get().rescan(true)
        get().showToast(`已创建文件夹 ${name}`)
      } catch (err) {
        console.error('新建文件夹失败:', err)
        get().showToast('新建文件夹失败', 'error')
      }
    },

    moveToDir: async (file, targetChain) => {
      const s = get()
      const cur = s.dirChain[s.dirChain.length - 1]
      const handle = file.handle ?? file.dirHandle
      const target = targetChain[targetChain.length - 1]
      if (!cur || !handle || !target) return
      const targetKey = dirKey(targetChain)
      // 拖到自身所在目录、或拖文件夹到自己里面，都无意义
      if (targetKey === dirKey(s.dirChain)) return
      if (file.type === 'folder' && (dirKey(s.dirChain) + '/').startsWith(targetKey + '/')) {
        s.showToast('不能把文件夹移动到它自己的子目录', 'error')
        return
      }
      if (!(await ensureWritePermission(target))) {
        s.showToast('未获得写入权限，移动取消', 'error')
        return
      }
      try {
        const sourceDir = await resolveParentDir(cur, file.relPath)
        await moveEntry(handle, sourceDir, target)
        set(st => {
          const treeChildren = { ...st.treeChildren }
          delete treeChildren[dirKey(st.dirChain)]
          delete treeChildren[targetKey]
          return {
            treeChildren,
            clipboard: null,
            selectedId: st.selectedId === file.id ? null : st.selectedId,
            viewerId: st.viewerId === file.id ? null : st.viewerId,
          }
        })
        get().rescan(true)
        get().showToast(`已移动 ${file.name}`)
      } catch (err) {
        console.error('移动失败:', err)
        get().showToast('移动失败，详见控制台', 'error')
      }
    },

    toggleSortAsc: () => set(s => ({
      sortAsc: !s.sortAsc,
      // 随机排序没有方向语义，方向按钮作为重洗触发
      randomSeed: s.sortType === 'random' ? s.randomSeed + 1 : s.randomSeed,
    })),

    toggleRecursive: () => {
      set(s => ({ recursive: !s.recursive }))
      get().rescan()
    },

    setLayout: layout => set({ layout }),

    setSetting: partial => set(s => ({
      settings: { ...s.settings, ...partial },
      theme: partial.themeMode ? resolveTheme(partial.themeMode) : s.theme,
    })),

    syncSystemTheme: () => set(s => (
      s.settings.themeMode === 'system' && s.theme !== resolveTheme('system')
        ? { theme: resolveTheme('system') }
        : {}
    )),
    setSortType: t => set({ sortType: t }),
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

    // 工具栏快切：写入显式主题模式（system 模式下点按切到显式值）
    toggleTheme: () => set(s => {
      const nextMode = s.theme === 'dark' ? 'light' : 'dark'
      return { settings: { ...s.settings, themeMode: nextMode }, theme: nextMode }
    }),
  }
})
