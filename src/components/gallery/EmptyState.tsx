import { FolderOpen, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isFsApiSupported } from '@/lib/fs/directory'
import { useAppStore } from '@/store/useAppStore'

export function EmptyState() {
  const openDirectory = useAppStore(s => s.openDirectory)
  const setDavDialog = useAppStore(s => s.setDavDialog)
  const supported = isFsApiSupported()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <FolderOpen className="size-14 text-muted-foreground/50" strokeWidth={1.2} />
      <div className="text-center">
        <p className="text-lg font-medium">打开一个文件夹开始浏览</p>
        <p className="mt-1 text-sm text-muted-foreground">
          支持 JPG / PNG / GIF / WebP / AVIF / SVG 及常见视频格式
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {supported ? (
          <Button size="lg" onClick={openDirectory}>
            <FolderOpen />
            选择文件夹
          </Button>
        ) : (
          <p className="max-w-md rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            当前浏览器不支持 File System Access API，请使用 Chrome 或 Edge 打开本页面。
          </p>
        )}
        <Button size="lg" variant="outline" onClick={() => setDavDialog(true)}>
          <Globe />
          连接 WebDAV
        </Button>
      </div>
      <div className="mt-4 flex flex-col gap-1 text-center text-xs text-muted-foreground">
        <span>单击选中 · 双击查看大图 · Enter 打开 · Esc 关闭</span>
        <span>大图中：滚轮缩放 · 拖拽平移 · ←/→ 切换 · 0 适应窗口 · 1 原始大小</span>
      </div>
    </div>
  )
}
