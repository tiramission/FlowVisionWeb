import { useEffect } from 'react'
import { FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { loadLastSession } from '@/lib/session'
import { useAppStore } from '@/store/useAppStore'

/** 启动探测：settings.restoreLastFolder 且空闲态时，静默检查上次会话权限。
 *  granted → 直接恢复；prompt → 挂 restorePending 显示横幅（点击时才带
 *  手势授权——浏览器不允许无用户激活时弹权限框） */
export function useSessionRestore() {
  useEffect(() => {
    void (async () => {
      const s = useAppStore.getState()
      if (!s.settings.restoreLastFolder || s.status !== 'idle' || s.launchFiles.length > 0) return
      const last = await loadLastSession()
      if (!last || last.chain.length === 0) return
      const cur = useAppStore.getState()
      if (cur.status !== 'idle') return // 期间用户已打开目录
      const root = last.chain[0] as unknown as { queryPermission: (d: { mode: 'read' }) => Promise<PermissionState> }
      let state: PermissionState = 'prompt'
      try {
        state = await root.queryPermission({ mode: 'read' })
      } catch { /* 句柄失效按需授权 */ }
      if (state === 'granted') {
        await cur.navigateTo(last.chain)
      } else {
        // 需要用户手势授权：显示恢复横幅
        useAppStore.setState({ restorePending: last.chain })
      }
    })()
  }, [])
}

/** 恢复横幅：点击 = 带手势授权并回到上次目录 */
export function RestoreBanner() {
  const restorePending = useAppStore(s => s.restorePending)
  const restoreLastSession = useAppStore(s => s.restoreLastSession)
  if (!restorePending) return null
  const dirName = restorePending[restorePending.length - 1].name

  return (
    <div className="pointer-events-auto fixed bottom-6 left-1/2 z-[75] flex -translate-x-1/2 items-center gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-xl backdrop-blur">
      <FolderOpen className="size-5 text-primary" />
      <div className="text-sm">
        <div className="font-medium">恢复上次浏览</div>
        <div className="text-xs text-muted-foreground">{dirName}（需要重新授权文件夹访问）</div>
      </div>
      <Button size="sm" onClick={() => void restoreLastSession()}>恢复</Button>
      <button
        type="button"
        className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
        onClick={() => useAppStore.setState({ restorePending: null })}
      >
        忽略
      </button>
    </div>
  )
}
