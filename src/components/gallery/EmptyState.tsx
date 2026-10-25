import { useEffect } from 'react'
import { Clock, FolderOpen, Globe, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isFsApiSupported } from '@/lib/fs/directory'
import { useAppStore } from '@/store/useAppStore'

export function EmptyState() {
  const openDirectory = useAppStore(s => s.openDirectory)
  const setDavDialog = useAppStore(s => s.setDavDialog)
  const supported = isFsApiSupported()
  const recents = useAppStore(s => s.recents)
  const recentsLoaded = useAppStore(s => s.recentsLoaded)
  const loadRecents = useAppStore(s => s.loadRecents)
  const openRecent = useAppStore(s => s.openRecent)
  const removeRecentByKey = useAppStore(s => s.removeRecentByKey)

  useEffect(() => {
    if (!recentsLoaded) void loadRecents()
  }, [recentsLoaded, loadRecents])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 overflow-y-auto p-8">
      <FolderOpen className="size-14 shrink-0 text-muted-foreground/50" strokeWidth={1.2} />
      <div className="text-center">
        <p className="text-lg font-medium">{supported ? '打开一个文件夹开始浏览' : '连接 WebDAV 开始浏览'}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {supported
            ? '支持 JPG / PNG / GIF / WebP / AVIF / SVG 及常见视频格式'
            : '当前浏览器不支持本地文件夹访问，可连接 NAS / Nextcloud / rclone 等远程图片库'}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {supported && (
          <Button size="lg" onClick={openDirectory}>
            <FolderOpen />
            选择文件夹
          </Button>
        )}
        <Button size="lg" variant={supported ? 'outline' : 'default'} onClick={() => setDavDialog(true)}>
          <Globe />
          连接 WebDAV
        </Button>
      </div>

      {supported && recents.length > 0 && (
        <div className="mt-2 w-full max-w-sm">
          <div className="mb-1.5 flex items-center justify-between px-1 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="size-3" />最近打开</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {recents.slice(0, 5).map(r => (
              <div key={r.key} className="group flex items-center gap-1 rounded-md border bg-card/50 px-2 py-1.5 hover:bg-accent/50">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => void openRecent(r)}
                  title={r.key}
                >
                  <FolderOpen className="size-4 shrink-0 text-primary/70" />
                  <span className="min-w-0 truncate text-sm">
                    <span className="font-medium">{r.name}</span>
                    {r.subName !== r.name && (
                      <span className="text-muted-foreground"> / {r.subName}</span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive group-hover:opacity-100"
                  onClick={() => void removeRecentByKey(r.key)}
                  aria-label={`移除记录 ${r.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-col gap-1 text-center text-xs text-muted-foreground">
        <span>单击选中 · 双击查看大图 · Enter 打开 · Esc 关闭</span>
        <span>大图中：滚轮缩放 · 拖拽平移 · ←/→ 切换 · 0 适应窗口 · 1 原始大小</span>
      </div>
    </div>
  )
}
