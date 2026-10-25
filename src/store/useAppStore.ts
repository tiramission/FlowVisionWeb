import { create } from 'zustand'
import { saveLastSession, type LastLocation } from '@/lib/session'
import { addFavorite, listFavorites, removeFavorite, type FavItem } from '@/lib/favorites'
import { dirKey, fillImageSizes, hasMedia, pickDirectory, readDirectory, readSubdirs, type SubdirEntry } from '@/lib/fs/directory'
import { copyEntry, createDirectory, deleteEntry, ensureReadPermission, ensureWritePermission, moveEntry, renameEntry, resolveParentDir } from '@/lib/fs/operations'
import { isWebDavRef } from '@/lib/fs/ref'
import { davReadDirectory } from '@/lib/webdav/browse'
import {
  authOf, deleteConnection, getConnection, listConnections, needsPass, putConnection,
  setSessionPass, type DavConnection,
} from '@/lib/webdav/connections'
import { DavError, davHrefOf, davTest, remoteDirKey } from '@/lib/webdav/protocol'
import type { FileModel, LayoutType, SortType, ThemeMode } from '@/types'

type Status = 'idle' | 'scanning' | 'ready'

type Source = 'local' | 'remote'

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
  /** 启动时恢复上次浏览的文件夹（对标原版 openLastFolder） */
  restoreLastFolder: boolean
  /** 右键手势（按住右键 350ms 激活罗盘后拖动触发），关闭后右键仅弹菜单 */
  gestureEnabled: boolean
  /** 画廊自动滚动播放（空格键切换，滚轮/点击打断，到底自动停） */
  autoScroll: boolean
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
  restoreLastFolder: true,
  gestureEnabled: false,
  autoScroll: false,
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

/** 手势跳转撤销条目：触发前的目录链 + 动作名 */
export interface GestureUndoEntry {
  chain: FileSystemDirectoryHandle[]
  label: string
}

const initialSettings = loadSettings()

interface AppStore {
  status: Status
  scanProgress: { done: number; total: number } | null
  /** 浏览来源：本地 FS API / WebDAV 远程 */
  source: Source
  /** 根目录句柄；idle（本地）时为 null；远程模式下保留上次本地状态供断开恢复 */
  rootHandle: FileSystemDirectoryHandle | null
  /** 当前目录链（根在前），File System Access API 没有取父目录的能力，导航靠维护这条链 */
  dirChain: FileSystemDirectoryHandle[]
  /** 远程浏览：活动连接与目录名链（已解码） */
  remoteConn: DavConnection | null
  remoteSegments: string[]
  /** 远程浏览历史（目录名链数组），与 historyIndex 共用下标 */
  remoteHistory: string[][]
  /** WebDAV 连接管理 */
  davConnections: DavConnection[]
  davConnectionsLoaded: boolean
  davDialogOpen: boolean
  setDavDialog: (open: boolean) => void
  loadDavConnections: () => Promise<void>
  saveDavConnection: (conn: DavConnection, sessionPass?: string) => Promise<void>
  removeDavConnection: (id: string) => Promise<void>
  /** 连接并进入远程浏览；pass 用于会话内密码（不落盘）。失败返回 false 并 toast 诊断 */
  connectDav: (connId: string, pass?: string) => Promise<boolean>
  disconnectDav: () => void
  /** 远程导航到目录名链并扫描 */
  navigateRemote: (segments: readonly string[], push?: boolean, silent?: boolean) => Promise<void>
  /** 待恢复的远程位置（凭据缺失时挂横幅，点击重新连接） */
  davRestore: { connId: string; segments: string[] } | null
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
  /** 上次会话恢复：待授权/重连的位置（显示恢复横幅）与恢复动作 */
  restorePending: LastLocation | null
  restoreLastSession: () => Promise<void>
  /** PWA file_handler 启动传入的文件（无目录链，画廊直接展示） */
  launchFiles: FileModel[]
  setLaunchFiles: (files: FileModel[]) => void
  /** 右键手势跳转撤销栈（Ctrl+Z 逐级回退），最多 30 条 */
  gestureUndoStack: GestureUndoEntry[]
  pushGestureUndo: (entry: GestureUndoEntry) => void
  undoLastGesture: () => void
  /** 右键菜单命中的条目 id（null = 空白区域），由全局右键 hook 在派发前设置 */
  ctxMenuTargetId: string | null
  setCtxMenuTargetId: (id: string | null) => void
  openDirectory: () => Promise<void>
  /** 导航到目标目录链并扫描，push=true 时写入历史；silent 平滑刷新不闪列表 */
  navigateTo: (chain: readonly FileSystemDirectoryHandle[], silent?: boolean) => Promise<void>
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
    // 会话持久化（对标原版 openLastFolder）：导航即记录，重开恢复
    void saveLastSession({ kind: 'local', chain: [...chain] })
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

  /** 远程版 browse：语义与本地 browse 对齐（历史/静默刷新/尺寸回填共用一套状态域） */
  const browseRemote = async (segments: readonly string[], push: boolean, silent = false) => {
    const conn = get().remoteConn
    if (!conn) return
    const gen = ++scanGeneration
    const href = davHrefOf(conn.url, segments)
    void saveLastSession({ kind: 'remote', connId: conn.id, segments: [...segments], name: conn.name })
    set(s => {
      const truncated = push ? s.remoteHistory.slice(0, s.historyIndex + 1) : s.remoteHistory
      return {
        status: silent ? s.status : 'scanning',
        files: silent ? s.files : [],
        scanProgress: null,
        selectedId: silent ? s.selectedId : null,
        viewerId: s.viewerId,
        remoteSegments: [...segments],
        remoteHistory: push ? [...truncated, [...segments]] : s.remoteHistory,
        historyIndex: push ? truncated.length : s.historyIndex,
      }
    })
    try {
      const models = await davReadDirectory(href, conn.id, authOf(conn), {
        recursive: get().recursive,
        onProgress: (done, total) => {
          if (scanGeneration === gen) set({ scanProgress: { done, total } })
        },
      })
      if (scanGeneration !== gen) return
      set({ files: models, status: 'ready', scanProgress: null })
      await fillImageSizes(
        models,
        () => scanGeneration !== gen,
        patch => {
          if (scanGeneration !== gen) return
          set(s => ({ files: s.files.map(f => (patch[f.id] ? { ...f, ...patch[f.id] } : f)) }))
        },
      )
    } catch (err) {
      console.error('WebDAV 读取失败:', err)
      if (scanGeneration !== gen) return
      set({ status: 'ready', files: [], scanProgress: null })
      get().showToast(err instanceof DavError ? err.message : 'WebDAV 连接失败', 'error')
    }
  }

  return {
    status: 'idle',
    scanProgress: null,
    source: 'local',
    rootHandle: null,
    dirChain: [],
    remoteConn: null,
    remoteSegments: [],
    remoteHistory: [],
    davConnections: [],
    davConnectionsLoaded: false,
    davDialogOpen: false,
    davRestore: null,
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
    launchFiles: [],
    restorePending: null,
    gestureUndoStack: [],
    ctxMenuTargetId: null,

    openDirectory: async () => {
      const dir = await pickDirectory()
      if (!dir) return
      // 切回本地浏览：丢弃远程会话（连接配置保留，可随时重连）
      set({
        source: 'local',
        remoteConn: null,
        remoteSegments: [],
        remoteHistory: [],
        davRestore: null,
        treeChildren: {},
        expandedKeys: [],
        historyChains: [],
        historyIndex: -1,
        sidebarOpen: true,
        clipboard: null,
      })
      await browse([dir], true)
    },

    navigateTo: async (chain, silent = false) => { await browse(chain, true, silent) },

    navigateRemote: async (segments, push = true, silent = false) => { await browseRemote(segments, push, silent) },

    rescan: (silent = false) => {
      const s = get()
      if (s.source === 'remote') {
        if (s.remoteConn) void browseRemote(s.remoteSegments, false, silent)
        return
      }
      if (s.dirChain.length > 0) void browse(s.dirChain, false, silent)
    },

    goUp: () => {
      const s = get()
      if (s.source === 'remote') {
        if (s.remoteSegments.length > 0) void browseRemote(s.remoteSegments.slice(0, -1), true)
        return
      }
      if (s.dirChain.length > 1) void browse(s.dirChain.slice(0, -1), true)
    },

    goBack: () => {
      const s = get()
      if (s.historyIndex <= 0) return
      const index = s.historyIndex - 1
      set({ historyIndex: index })
      if (s.source === 'remote') void browseRemote(s.remoteHistory[index], false)
      else void browse(s.historyChains[index], false)
    },

    goForward: () => {
      const s = get()
      if (s.historyIndex >= (s.source === 'remote' ? s.remoteHistory : s.historyChains).length - 1) return
      const index = s.historyIndex + 1
      set({ historyIndex: index })
      if (s.source === 'remote') void browseRemote(s.remoteHistory[index], false)
      else void browse(s.historyChains[index], false)
    },

    goSiblingImageDir: async delta => {
      const s = get()
      if (s.source === 'remote') {
        s.showToast('远程模式暂不支持该手势')
        return
      }
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
          // silent 仅在浏览态：保持画廊挂载让确认浮层淡出；大图打开时
          // 非 silent 关闭查看器（对标原版手势切换文件夹关闭大图）
          const silent = !get().viewerId
          await get().navigateTo([...parentChain, candidate.handle], silent)
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

    setDavDialog: open => set({ davDialogOpen: open }),

    loadDavConnections: async () => {
      set({ davConnections: await listConnections(), davConnectionsLoaded: true })
    },

    saveDavConnection: async (conn, sessionPass) => {
      if (sessionPass) setSessionPass(conn.id, sessionPass)
      await putConnection(conn)
      await get().loadDavConnections()
    },

    removeDavConnection: async id => {
      await deleteConnection(id)
      const s = get()
      if (s.remoteConn?.id === id) {
        // 删除正在浏览的连接：断开远程，有本地状态则回本地
        s.disconnectDav()
      }
      await get().loadDavConnections()
      get().showToast('已删除连接')
    },

    connectDav: async (connId, pass) => {
      const conn = await getConnection(connId)
      if (!conn) {
        get().showToast('连接配置不存在', 'error')
        return false
      }
      if (pass) setSessionPass(connId, pass)
      const test = await davTest(conn.url, authOf(conn))
      if (!test.ok) {
        get().showToast(test.error.message, 'error')
        return false
      }
      // 挂起的远程会话恢复：连上后直达原目录
      const restore = get().davRestore
      set({
        source: 'remote',
        remoteConn: conn,
        remoteSegments: [],
        remoteHistory: [],
        historyIndex: -1,
        davDialogOpen: false,
        davRestore: null,
        clipboard: null,
        sidebarOpen: true,
      })
      if (restore?.connId === connId) await browseRemote(restore.segments, true)
      else await browseRemote([], true)
      return true
    },

    disconnectDav: () => {
      const s = get()
      set({ source: 'local', remoteConn: null, remoteSegments: [], remoteHistory: [], davRestore: null, files: [], scanProgress: null })
      // 本地目录链还在：静默回到原目录；否则回空状态
      if (s.dirChain.length > 0) void browse(s.dirChain, false)
      else set({ status: 'idle', rootHandle: null })
    },

    toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),

    setSearchQuery: q => set({ searchQuery: q }),
    setSearchRegex: b => set({ searchRegex: b }),
    setPinyinReady: () => set({ pinyinReady: true }),

    setLaunchFiles: files => set({ launchFiles: files }),

    restoreLastSession: async () => {
      const s = get()
      const loc = s.restorePending
      if (!loc) return
      set({ restorePending: null })
      if (loc.kind === 'remote') {
        const conn = await getConnection(loc.connId)
        if (!conn) {
          s.showToast('上次浏览的连接配置已不存在', 'error')
          return
        }
        // 凭据缺失（未记住密码）：打开连接对话框输入后自动续接
        if (needsPass(conn)) {
          set({ davRestore: { connId: loc.connId, segments: loc.segments }, davDialogOpen: true })
          return
        }
        const ok = await get().connectDav(loc.connId)
        if (ok) await get().navigateRemote(loc.segments)
        return
      }
      const chain = loc.chain
      const root = chain[0]
      if (!(await ensureReadPermission(root))) {
        s.showToast('未获得文件夹访问权限', 'error')
        return
      }
      await get().navigateTo(chain)
    },

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

    pushGestureUndo: entry => set(s => ({
      gestureUndoStack: [...s.gestureUndoStack.slice(-29), entry],
    })),

    undoLastGesture: () => {
      const stack = get().gestureUndoStack
      const entry = stack[stack.length - 1]
      if (!entry) {
        get().showToast('没有可撤销的手势')
        return
      }
      set({ gestureUndoStack: stack.slice(0, -1) })
      void get().navigateTo(entry.chain, true)
        .then(() => get().showToast(`已撤销：${entry.label}`))
    },

    setCtxMenuTargetId: id => set({ ctxMenuTargetId: id }),

    toggleFavoriteCurrent: async () => {
      const s = get()
      if (s.source === 'remote' && s.remoteConn) {
        const key = remoteDirKey(s.remoteConn.id, davHrefOf(s.remoteConn.url, s.remoteSegments))
        if (s.favorites.some(f => f.key === key)) {
          await removeFavorite(key)
          await s.loadFavorites()
          s.showToast('已从收藏夹移除')
          return
        }
        await addFavorite({
          key,
          name: s.remoteSegments[s.remoteSegments.length - 1] ?? s.remoteConn.name,
          remote: { connId: s.remoteConn.id, segments: [...s.remoteSegments] },
        })
        await s.loadFavorites()
        s.showToast('已加入收藏夹')
        return
      }
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
      // 远程收藏：连上后直达目录（凭据缺失由连接对话框处理）
      if (item.remote) {
        const conn = await getConnection(item.remote.connId)
        if (!conn) {
          get().showToast('收藏的连接配置已不存在', 'error')
          return
        }
        if (needsPass(conn)) {
          set({ davRestore: { connId: item.remote.connId, segments: item.remote.segments }, davDialogOpen: true })
          return
        }
        const ok = await get().connectDav(item.remote.connId)
        if (ok) await get().navigateRemote(item.remote.segments)
        return
      }
      // 会话恢复的句柄需要重新授权（此刻处于用户手势中，可弹授权框）
      const chain = item.chain
      const root = chain?.[0]
      if (!chain || !root) return
      if (!(await ensureReadPermission(root))) {
        get().showToast('未获得文件夹访问权限', 'error')
        return
      }
      await get().navigateTo(chain)
    },

    setRenameTarget: f => set({ renameTarget: f }),
    setDeleteTarget: f => set({ deleteTarget: f }),

    copyEntries: entries => {
      const { dirChain, source } = get()
      if (source !== 'local') { get().showToast('WebDAV 连接为只读浏览', 'error'); return }
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
      const { dirChain, source } = get()
      if (source !== 'local') { get().showToast('WebDAV 连接为只读浏览', 'error'); return }
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
      if (s.source !== 'local') return
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
      if (s.source !== 'local') { s.showToast('WebDAV 连接为只读浏览', 'error'); return }
      const cur = s.dirChain[s.dirChain.length - 1]
      if (!cur) return
      if (isWebDavRef(file.handle)) return
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
      if (s.source !== 'local') { s.showToast('WebDAV 连接为只读浏览', 'error'); return }
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
      if (s.source !== 'local') { s.showToast('WebDAV 连接为只读浏览', 'error'); return }
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
      if (s.source !== 'local') return
      const cur = s.dirChain[s.dirChain.length - 1]
      if (isWebDavRef(file.handle)) return
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

/** 当前目录键（本地 dirKey / 远程 remoteDirKey）：视频记忆位置等跨来源键 */
export function currentDirKey(): string {
  const s = useAppStore.getState()
  if (s.source === 'remote' && s.remoteConn) {
    return remoteDirKey(s.remoteConn.id, davHrefOf(s.remoteConn.url, s.remoteSegments))
  }
  return dirKey(s.dirChain)
}
