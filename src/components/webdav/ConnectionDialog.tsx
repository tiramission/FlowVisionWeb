import { useEffect, useState } from 'react'
import { Globe, LoaderCircle, Pencil, Plus, Trash2, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { newConnId, type DavConnection } from '@/lib/webdav/connections'
import { davTest, type DavErrorKind } from '@/lib/webdav/protocol'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

/** 按错误类型给排查提示 */
const HINTS: Partial<Record<DavErrorKind, string>> = {
  mixed: 'HTTPS 页面只能连接 https:// 服务器（浏览器禁止降级）',
  cors: '常见于群晖等成品 NAS：需在服务器或反向代理上配置 Access-Control-Allow-Origin 等跨域响应头',
  network: '检查地址拼写、服务器是否在线、证书是否受信任（自签证书不可用）',
  auth: '检查用户名密码；部分服务需使用「应用专用密码」而非登录密码',
  notdav: '确认地址指向 WebDAV 服务端口/路径（如群晖 :5006、Nextcloud /remote.php/dav）',
}

type TestState =
  | { phase: 'idle' }
  | { phase: 'testing' }
  | { phase: 'ok' }
  | { phase: 'fail'; message: string; hint?: string }

const EMPTY_FORM = { id: '', name: '', url: '', user: '', pass: '', remember: false }

/** WebDAV 连接管理：已存连接列表 + 新建/编辑表单 + 连接测试（诊断文案） */
export function ConnectionDialog() {
  const open = useAppStore(s => s.davDialogOpen)
  const setDavDialog = useAppStore(s => s.setDavDialog)
  const connections = useAppStore(s => s.davConnections)
  const connectionsLoaded = useAppStore(s => s.davConnectionsLoaded)
  const loadDavConnections = useAppStore(s => s.loadDavConnections)
  const saveDavConnection = useAppStore(s => s.saveDavConnection)
  const removeDavConnection = useAppStore(s => s.removeDavConnection)
  const connectDav = useAppStore(s => s.connectDav)
  const davRestore = useAppStore(s => s.davRestore)
  const remoteConn = useAppStore(s => s.remoteConn)

  const [form, setForm] = useState(EMPTY_FORM)
  const [test, setTest] = useState<TestState>({ phase: 'idle' })
  const [connectingId, setConnectingId] = useState<string | null>(null)

  useEffect(() => {
    if (!connectionsLoaded) void loadDavConnections()
  }, [connectionsLoaded, loadDavConnections])

  // 因凭据缺失被拉起（会话恢复/收藏跳转）：定位到该连接的编辑态
  useEffect(() => {
    if (open && davRestore) {
      const conn = connections.find(c => c.id === davRestore.connId)
      if (conn) {
        setForm({ id: conn.id, name: conn.name, url: conn.url, user: conn.user, pass: '', remember: conn.remember })
        setTest({ phase: 'idle' })
      }
    }
  }, [open, davRestore, connections])

  const editForm = (conn: DavConnection) => {
    setForm({ id: conn.id, name: conn.name, url: conn.url, user: conn.user, pass: '', remember: conn.remember })
    setTest({ phase: 'idle' })
  }

  const runTest = async () => {
    if (!form.url.trim()) return
    setTest({ phase: 'testing' })
    const auth = form.user ? { user: form.user, pass: form.pass } : null
    const result = await davTest(form.url.trim(), auth)
    setTest(result.ok
      ? { phase: 'ok' }
      : { phase: 'fail', message: result.error.message, hint: HINTS[result.error.kind] })
  }

  const submit = async (connectAfterSave: boolean) => {
    const url = form.url.trim().replace(/\/+$/, '')
    if (!url) return
    const id = form.id || newConnId()
    const conn: DavConnection = {
      id,
      name: form.name.trim() || new URL(url).host,
      url,
      user: form.user.trim(),
      // 记住密码才持久化；否则密码只进会话内存
      pass: form.remember ? form.pass : null,
      remember: form.remember,
    }
    // 会话密码：不记住时也带上本次输入的密码
    await saveDavConnection(conn, form.pass && !form.remember ? form.pass : undefined)
    setForm(EMPTY_FORM)
    setTest({ phase: 'idle' })
    if (connectAfterSave) {
      setConnectingId(id)
      await connectDav(id, form.pass || undefined)
      setConnectingId(null)
    }
  }

  const connect = async (conn: DavConnection) => {
    setConnectingId(conn.id)
    await connectDav(conn.id)
    setConnectingId(null)
  }

  return (
    <Dialog open={open} onOpenChange={v => setDavDialog(v)}>
      <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="size-4 text-primary" />
            WebDAV 远程浏览
          </DialogTitle>
          <DialogDescription>
            连接 NAS / Nextcloud / rclone 等 WebDAV 服务浏览远程图片库（只读）
          </DialogDescription>
        </DialogHeader>

        {remoteConn && (
          <div className="flex items-center justify-between rounded-md border bg-accent/40 px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="font-medium">当前连接：{remoteConn.name}</div>
              <div className="truncate text-xs text-muted-foreground">{remoteConn.url}</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => useAppStore.getState().disconnectDav()}>
              <Unplug className="size-3.5" />
              断开
            </Button>
          </div>
        )}

        {connections.length > 0 && (
          <div className="flex flex-col gap-1">
            {connections.map(conn => (
              <div
                key={conn.id}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-2',
                  remoteConn?.id === conn.id && 'border-primary/60 bg-accent/40',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{conn.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {conn.url}{conn.user ? ` · ${conn.user}` : ' · 匿名'}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="size-7" aria-label={`编辑 ${conn.name}`} onClick={() => editForm(conn)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" aria-label={`删除 ${conn.name}`} onClick={() => void removeDavConnection(conn.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
                <Button size="sm" disabled={connectingId === conn.id} onClick={() => void connect(conn)}>
                  {connectingId === conn.id ? <LoaderCircle className="size-3.5 animate-spin" /> : '连接'}
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">{form.id ? '编辑连接' : '新建连接'}</span>
            {form.id && (
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setForm(EMPTY_FORM); setTest({ phase: 'idle' }) }}>
                <Plus className="mr-1 inline size-3" />改为新建
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="col-span-1 flex flex-col gap-1 text-xs text-muted-foreground">
              名称
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="我的 NAS"
                className="h-8"
              />
            </label>
            <label className="col-span-1 flex flex-col gap-1 text-xs text-muted-foreground">
              服务器地址
              <Input
                value={form.url}
                onChange={e => { setForm(f => ({ ...f, url: e.target.value })); setTest({ phase: 'idle' }) }}
                placeholder="https://nas:5006/photos"
                inputMode="url"
                className="h-8"
              />
            </label>
            <label className="col-span-1 flex flex-col gap-1 text-xs text-muted-foreground">
              用户名（可留空）
              <Input
                value={form.user}
                onChange={e => setForm(f => ({ ...f, user: e.target.value }))}
                autoComplete="off"
                className="h-8"
              />
            </label>
            <label className="col-span-1 flex flex-col gap-1 text-xs text-muted-foreground">
              密码
              <Input
                type="password"
                value={form.pass}
                onChange={e => setForm(f => ({ ...f, pass: e.target.value }))}
                autoComplete="new-password"
                className="h-8"
              />
            </label>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Switch
              id="dav-remember"
              checked={form.remember}
              onCheckedChange={v => setForm(f => ({ ...f, remember: v }))}
            />
            <label htmlFor="dav-remember" className="text-xs text-muted-foreground">
              记住密码（明文保存在本机 IndexedDB，仅建议个人设备开启）
            </label>
          </div>

          {test.phase !== 'idle' && (
            <div className={cn(
              'mt-2 rounded-md border px-3 py-2 text-xs',
              test.phase === 'ok' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
              test.phase === 'fail' && 'border-destructive/40 bg-destructive/10 text-destructive',
            )}>
              {test.phase === 'testing' && <span className="flex items-center gap-1.5"><LoaderCircle className="size-3 animate-spin" />正在测试连接…</span>}
              {test.phase === 'ok' && '连接成功，可以保存并连接了'}
              {test.phase === 'fail' && (
                <>
                  <div className="font-medium">{test.message}</div>
                  {test.hint && <div className="mt-0.5 opacity-80">{test.hint}</div>}
                </>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={!form.url.trim() || test.phase === 'testing'} onClick={() => void runTest()}>
              {test.phase === 'testing' ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              测试连接
            </Button>
            <Button size="sm" disabled={!form.url.trim()} onClick={() => void submit(true)}>
              保存并连接
            </Button>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          浏览器限制：服务器需启用 HTTPS 与跨域（CORS）响应头。Nextcloud、rclone（serve webdav）、
          配置过反向代理的 NAS 可用；群晖 DSM 自带 WebDAV 默认不带跨域头，需自行配置。
        </p>
      </DialogContent>
    </Dialog>
  )
}
