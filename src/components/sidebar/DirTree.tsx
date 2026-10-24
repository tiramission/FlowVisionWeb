import { useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react'
import { dirKey } from '@/lib/fs/directory'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

interface TreeRow {
  key: string
  name: string
  depth: number
  chain: FileSystemDirectoryHandle[]
  expanded: boolean
  loaded: boolean
  childCount: number
  isCurrent: boolean
}

/** 目录树侧边栏（对标原版 CustomOutlineView + DirTree）：懒加载子目录，点击行导航，
 *  支持从画廊拖入条目完成移动 */
export function DirTree() {
  const rootHandle = useAppStore(s => s.rootHandle)
  const dirChain = useAppStore(s => s.dirChain)
  const treeChildren = useAppStore(s => s.treeChildren)
  const expandedKeys = useAppStore(s => s.expandedKeys)
  const navigateTo = useAppStore(s => s.navigateTo)
  const toggleDir = useAppStore(s => s.toggleDir)
  const moveToDir = useAppStore(s => s.moveToDir)
  const files = useAppStore(s => s.files)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

  const dropTo = (row: TreeRow, e: React.DragEvent) => {
    e.preventDefault()
    setDragOverKey(null)
    const relPath = e.dataTransfer.getData('application/x-fv-move')
    const file = files.find(f => f.relPath === relPath)
    if (file) void moveToDir(file, row.chain)
  }

  if (!rootHandle) return null
  const currentKey = dirKey(dirChain)

  const rows: TreeRow[] = []
  const walk = (key: string, name: string, depth: number, chain: FileSystemDirectoryHandle[]) => {
    const expanded = expandedKeys.includes(key)
    const children = treeChildren[key]
    rows.push({
      key,
      name,
      depth,
      chain,
      expanded,
      loaded: children !== undefined,
      childCount: children?.length ?? 0,
      isCurrent: key === currentKey,
    })
    if (expanded && children) {
      for (const child of children) {
        walk(key + '/' + child.name, child.name, depth + 1, [...chain, child.handle])
      }
    }
  }
  walk(rootHandle.name, rootHandle.name, 0, [rootHandle])

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden p-1">
      {rows.map(row => (
        <div
          key={row.key}
          onClick={() => void navigateTo(row.chain)}
          onDragOver={e => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setDragOverKey(row.key)
          }}
          onDragLeave={() => setDragOverKey(k => (k === row.key ? null : k))}
          onDrop={e => dropTo(row, e)}
          className={cn(
            'flex h-7 cursor-pointer select-none items-center gap-1 rounded-sm pr-2 text-sm',
            row.isCurrent ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-accent/50',
            dragOverKey === row.key && 'ring-2 ring-primary bg-accent/70',
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
              void toggleDir(row.key, row.chain)
            }}
            aria-label={row.expanded ? '折叠' : '展开'}
          >
            {row.expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
          {row.isCurrent
            ? <FolderOpen className="size-4 shrink-0 text-primary" />
            : <Folder className="size-4 shrink-0 text-muted-foreground" />}
          <span className="truncate">{row.name}</span>
        </div>
      ))}
    </div>
  )
}
