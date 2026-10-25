import { useEffect } from 'react'
import { FolderOpen, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { loadLastSession } from '@/lib/session'
import { useAppStore } from '@/store/useAppStore'

/** 启动探测：settings.restoreLastFolder 且空闲态时，静默检查上次位置。
 *  本地：granted → 直接恢复；prompt → 挂 restorePending 显示横幅（点击时才带
 *  手势授权——浏览器不允许无用户激活时弹权限框）。
 *  远程：凭据齐全（匿名或已记住密码）→ 直接恢复；否则挂横幅点击后开连接对话框输入密码 */
export function useSessionRestore() {
  useEffect(() => {
    void (async () => {
      const s = useAppStore.getState()
      if (!s.settings.restoreLastFolder || s.status !== 'idle' || s.launchFiles.length > 0) return
      const last = await loadLastSession()
      const loc = last?.location
      if (!loc) return
      const cur = useAppStore.getState()
      if (cur.status !== 'idle') return // 期间用户已打开目录
      if (loc.kind === 'local') {
        const root = loc.chain[0] as unknown as { queryPermission: (d: { mode: 'read' }) => Promise<PermissionState> }
        let state: PermissionState = 'prompt'
        try {
          state = await root.queryPermission({ mode: 'read' })
        } catch { /* 句柄失效按需授权 */ }
        if (state === 'granted') {
          await cur.navigateTo(loc.chain)
        } else {
          // 需要用户手势授权：显示恢复横幅
          useAppStore.setState({ restorePending: loc })
        }
        return
      }
      // 远程位置：匿名或已记住密码的连接直接恢复（连接测试失败再退回横幅/提示）
      const { getConnection, needsPass } = await import('@/lib/webdav/connections')
      const conn = await getConnection(loc.connId)
      if (!conn) return
      if (!needsPass(conn)) {
        const ok = await cur.connectDav(loc.connId)
        if (ok) await useAppStore.getState().navigateRemote(loc.segments)
        return
      }
      useAppStore.setState({ restorePending: { ...loc, name: conn.name } })
    })()
  }, [])
}

/** 恢复横幅：点击 = 授权（本地）/ 重开连接对话框续接（远程） */
export function RestoreBanner() {
  const restorePending = useAppStore(s => s.restorePending)
  const restoreLastSession = useAppStore(s => s.restoreLastSession)
  if (!restorePending) return null
  const isRemote = restorePending.kind === 'remote'
  const dirName = isRemote
    ? `${restorePending.name ?? 'WebDAV'}${restorePending.segments.length ? '/' + restorePending.segments.join('/') : ''}`
    : restorePending.chain[restorePending.chain.length - 1].name

  return (
    <div className="pointer-events-auto fixed bottom-6 left-1/2 z-[75] flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-xl backdrop-blur">
      {isRemote ? <Globe className="size-5 shrink-0 text-primary" /> : <FolderOpen className="size-5 shrink-0 text-primary" />}
      <div className="min-w-0 text-sm">
        <div className="font-medium">恢复上次浏览</div>
        <div className="truncate text-xs text-muted-foreground">
          {dirName}
          {isRemote ? '（需要重新输入连接密码）' : '（需要重新授权文件夹访问）'}
        </div>
      </div>
      <Button size="sm" className="shrink-0" onClick={() => void restoreLastSession()}>恢复</Button>
      <button
        type="button"
        className="shrink-0 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
        onClick={() => useAppStore.setState({ restorePending: null })}
      >
        忽略
      </button>
    </div>
  )
}
