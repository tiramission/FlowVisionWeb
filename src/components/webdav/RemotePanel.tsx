import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown, ChevronRight, Folder, FolderOpen, Globe, Info, LoaderCircle, Unplug,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { authOf } from '@/lib/webdav/connections'
import { DavError, davHrefOf, davList } from '@/lib/webdav/protocol'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

const collator = new Intl.Collator('zh', { numeric: true, sensitivity: 'base' })

/** 目录树节点：segments 即跳转参数（与画廊/面包屑同一坐标体系），key 用 '/' 连接 */
interface RemoteDir {
  name: string
  segments: string[]
}

const keyOf = (segments: readonly string[]) => segments.join('/')

interface TreeRow {
  key: string
  name: string
  segments: string[]
  depth: number
  expanded: boolean
  loaded: boolean
  childCount: number
  isCurrent: boolean
}

/** 远程浏览时的侧边栏：连接信息 + WebDAV 目录树（懒加载 PROPFIND depth 1，
 *  自动展开当前路径，与本地 DirTree 同一套交互）+ 只读说明 */
export function RemotePanel() {
  const remoteConn = useAppStore(s => s.remoteConn)
  const remoteSegments = useAppStore(s => s.remoteSegments)
  const navigateRemote = useAppStore(s => s.navigateRemote)

  const [tree, setTree] = useState<Record<string, RemoteDir[]>>({})
  const [expanded, setExpanded] = useState<string[]>([])
  const [loading, setLoading] = useState<Set<string>>(() => new Set())
  /** 进行中的请求（StrictMode 双跑/展开连点去重；失败后移除以便重试） */
  const inflight = useRef(new Set<string>())

  const loadChildren = async (key: string, segments: string[]) => {
    if (inflight.current.has(key)) return
    inflight.current.add(key)
    setLoading(s => new Set(s).add(key))
    const conn = useAppStore.getState().remoteConn
    try {
      if (!conn) return
      const entries = await davList(davHrefOf(conn.url, segments), authOf(conn), { depth: 1 })
      // 等待期间可能已断开/换连接，丢弃过期结果
      if (useAppStore.getState().remoteConn?.id !== conn.id) return
      const dirs = entries
        .filter(e => e.isDir)
        .map(e => ({ name: e.name, segments: [...segments, e.name] }))
        .sort((a, b) => collator.compare(a.name, b.name))
      setTree(t => ({ ...t, [key]: dirs }))
    } catch (err) {
      useAppStore.getState().showToast(
        err instanceof DavError ? err.message : '读取远程目录失败', 'error')
    } finally {
      inflight.current.delete(key)
      setLoading(s => {
        const next = new Set(s)
        next.delete(key)
        return next
      })
    }
  }

  /** 展开到当前目录：画廊双击/面包屑跳转后树上同步展开祖先（含根）。
   *  tree 仅用于判断缺哪些子列表，变化会重跑但 inflight 去重兜底 */
  useEffect(() => {
    if (!remoteConn) return
    const prefixes: string[] = []
    for (let i = 0; i <= remoteSegments.length; i++) {
      prefixes.push(keyOf(remoteSegments.slice(0, i)))
    }
    setExpanded(prev => (prefixes.every(k => prev.includes(k))
      ? prev
      : Array.from(new Set([...prev, ...prefixes]))))
    for (const key of prefixes) {
      if (tree[key] === undefined) void loadChildren(key, key ? key.split('/') : [])
    }
  }, [remoteConn?.id, remoteSegments, tree])

  if (!remoteConn) return null

  const toggle = (row: TreeRow) => {
    if (expanded.includes(row.key)) {
      setExpanded(e => e.filter(k => k !== row.key))
      return
    }
    setExpanded(e => [...e, row.key])
    if (tree[row.key] === undefined) void loadChildren(row.key, row.segments)
  }

  const currentKey = keyOf(remoteSegments)
  const rows: TreeRow[] = []
  const walk = (key: string, name: string, segments: string[], depth: number) => {
    const children = tree[key]
    const isExpanded = expanded.includes(key)
    rows.push({
      key,
      name,
      segments,
      depth,
      expanded: isExpanded,
      loaded: children !== undefined,
      childCount: children?.length ?? 0,
      isCurrent: key === currentKey,
    })
    if (isExpanded && children) {
      for (const child of children) {
        walk(keyOf(child.segments), child.name, child.segments, depth + 1)
      }
    }
  }
  walk('', remoteConn.name, [], 0)

  return (
    <div className="flex h-full flex-col">
      <div className="p-2 pb-0">
        <div className="flex items-center gap-2 rounded-md border bg-accent/40 px-2.5 py-2 text-sm">
          <Globe className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{remoteConn.name}</div>
            <div className="truncate text-xs text-muted-foreground">{remoteConn.url}</div>
          </div>
          <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="断开连接" onClick={() => useAppStore.getState().disconnectDav()}>
            <Unplug className="size-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-1">
        {rows.map(row => (
          <div
            key={row.segments.length === 0 ? '::root::' : row.key}
            onClick={() => void navigateRemote(row.segments)}
            className={cn(
              'flex h-7 cursor-pointer select-none items-center gap-1 rounded-sm pr-2 text-sm',
              row.isCurrent ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-accent/50',
            )}
            style={{ paddingLeft: 4 + row.depth * 14 }}
            title={row.name}
          >
            <button
              type="button"
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground',
                row.loaded && row.childCount === 0 && 'invisible',
              )}
              onClick={e => {
                e.stopPropagation()
                toggle(row)
              }}
              aria-label={row.expanded ? '折叠' : '展开'}
            >
              {loading.has(row.key)
                ? <LoaderCircle className="size-3 animate-spin" />
                : row.expanded
                  ? <ChevronDown className="size-3.5" />
                  : <ChevronRight className="size-3.5" />}
            </button>
            {row.isCurrent
              ? <FolderOpen className="size-4 shrink-0 text-primary" />
              : <Folder className="size-4 shrink-0 text-muted-foreground" />}
            <span className="truncate">{row.name}</span>
          </div>
        ))}
      </div>

      <div className="p-2 pt-0">
        <div className="flex items-start gap-2 rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>WebDAV 为只读浏览：重命名、删除、移动等文件操作仅支持本地文件夹。</span>
        </div>
      </div>
    </div>
  )
}
