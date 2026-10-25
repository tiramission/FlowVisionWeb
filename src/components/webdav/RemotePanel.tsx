import { Globe, Info, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'

/** 远程浏览时的侧边栏：连接信息 + 只读说明（目录树为本地句柄专用，远程不适用） */
export function RemotePanel() {
  const remoteConn = useAppStore(s => s.remoteConn)
  const remoteSegments = useAppStore(s => s.remoteSegments)
  const navigateRemote = useAppStore(s => s.navigateRemote)
  if (!remoteConn) return null

  const crumbs = [{ name: remoteConn.name, segments: [] as string[] }]
    .concat(remoteSegments.map((name, i) => ({ name, segments: remoteSegments.slice(0, i + 1) })))
    .reverse()

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2 text-sm">
      <div className="flex items-center gap-2 rounded-md border bg-accent/40 px-2.5 py-2">
        <Globe className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{remoteConn.name}</div>
          <div className="truncate text-xs text-muted-foreground">{remoteConn.url}</div>
        </div>
        <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="断开连接" onClick={() => useAppStore.getState().disconnectDav()}>
          <Unplug className="size-4" />
        </Button>
      </div>

      <div className="text-xs font-medium text-muted-foreground">最近位置</div>
      <div className="flex flex-col gap-0.5">
        {crumbs.map((c, i) => (
          <button
            key={c.segments.join('/')}
            type="button"
            onClick={() => void navigateRemote(c.segments)}
            className={cn(
              'truncate rounded px-2 py-1 text-left text-sm hover:bg-accent',
              i === 0 ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
            style={{ paddingLeft: `${8 + (crumbs.length - 1 - i) * 12}px` }}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="mt-auto flex items-start gap-2 rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>WebDAV 为只读浏览：重命名、删除、移动等文件操作仅支持本地文件夹。</span>
      </div>
    </div>
  )
}
