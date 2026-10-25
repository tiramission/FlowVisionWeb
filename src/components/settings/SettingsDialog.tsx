import { useState } from 'react'
import {
  ExternalLink, Images, Info, Keyboard, LayoutGrid, MousePointerClick, Palette, PlaySquare,
  Settings as SettingsIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore, type Settings } from '@/store/useAppStore'
import type { LayoutType } from '@/types'
import { cn } from '@/lib/utils'

const THEME_OPTIONS: { value: Settings['themeMode']; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '亮色' },
  { value: 'dark', label: '暗色' },
]

const LAYOUT_OPTIONS: { value: LayoutType; label: string }[] = [
  { value: 'waterfall', label: '瀑布流' },
  { value: 'justified', label: '等高行' },
  { value: 'grid', label: '网格' },
  { value: 'detail', label: '列表' },
]

const SHORTCUTS: [string, string][] = [
  ['Ctrl+F / /', '聚焦搜索'],
  ['空格', '画廊自动滚动播放 开/关'],
  ['Enter / 双击', '打开（文件夹进入 / 图片大图）'],
  ['←→↑↓', '移动选中（感知布局列数）'],
  ['W / A / S / D', '上级 / 上一有图文件夹 / 返回 / 下一有图文件夹'],
  ['右键按住拖到外圈', '手势：←→ 上/下一有图文件夹，↑ 上级，↓ 返回'],
  ['Ctrl+Z', '撤销手势跳转（可连续撤销）'],
  ['F2 / Delete', '重命名 / 删除'],
  ['Ctrl+C / X / V', '复制 / 剪切 / 粘贴'],
  ['Alt+← / Alt+→', '后退 / 前进'],
  ['大图中：滚轮 / 拖拽 / 0 / 1', '缩放 / 平移 / 适应窗口 / 原始大小'],
]

const REPO_URL = 'https://github.com/tiramission/FlowVisionWeb'

type SectionId = 'appearance' | 'browse' | 'interaction' | 'video' | 'shortcuts' | 'about'
const SECTIONS: { id: SectionId; label: string; icon: React.ReactNode }[] = [
  { id: 'appearance', label: '外观', icon: <Palette className="size-4" /> },
  { id: 'browse', label: '浏览', icon: <LayoutGrid className="size-4" /> },
  { id: 'interaction', label: '交互', icon: <MousePointerClick className="size-4" /> },
  { id: 'video', label: '视频', icon: <PlaySquare className="size-4" /> },
  { id: 'shortcuts', label: '快捷键', icon: <Keyboard className="size-4" /> },
  { id: 'about', label: '关于', icon: <Info className="size-4" /> },
]

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2.5">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </div>
  )
}

/** 设置：侧边导航分栏（对标原版 Settings 多分页），所有项即时生效并持久化 */
export function SettingsDialog() {
  const settings = useAppStore(s => s.settings)
  const setSetting = useAppStore(s => s.setSetting)
  const [section, setSection] = useState<SectionId>('appearance')
  const sensitivity = Math.pow(2, (settings.scrollSensitivity - 5) / 2)

  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="设置">
              <SettingsIcon />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>设置</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>所有设置即时生效并自动保存</DialogDescription>
        </DialogHeader>

        <div className="-mx-1 grid grid-cols-[136px_1fr] gap-3">
          <nav className="flex flex-col gap-0.5 border-r pr-2">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm',
                  section === s.id
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </nav>

          {/* 横向锁定：Switch 等组件内部有数 px 隐形溢出，设置面板横向无需滚动 */}
          <div className="max-h-[62dvh] overflow-y-auto overflow-x-hidden px-1">
            {section === 'appearance' && (
              <div>
                <Row label="主题">
                  <Select value={settings.themeMode} onValueChange={v => setSetting({ themeMode: v as Settings['themeMode'] })}>
                    <SelectTrigger size="sm" className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {THEME_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>
                <Separator />
                <Row label="画廊纯黑背景" hint="浏览区域使用纯黑背景，适合看图">
                  <Switch checked={settings.pureBlack} onCheckedChange={v => setSetting({ pureBlack: v })} aria-label="纯黑背景" />
                </Row>
              </div>
            )}

            {section === 'browse' && (
              <div>
                <Row label="默认布局" hint="应用启动时使用">
                  <Select value={settings.defaultLayout} onValueChange={v => setSetting({ defaultLayout: v as LayoutType })}>
                    <SelectTrigger size="sm" className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LAYOUT_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>
                <Separator />
                <Row label="缩略图大小" hint={`${settings.columnWidth} px`}>
                  <Slider
                    className="w-36"
                    min={96}
                    max={384}
                    step={8}
                    value={[settings.columnWidth]}
                    onValueChange={vals => setSetting({ columnWidth: vals[0] ?? settings.columnWidth })}
                  />
                </Row>
                <Separator />
                <Row label="缩略图间距" hint={`${settings.gap} px`}>
                  <Slider
                    className="w-36"
                    min={0}
                    max={24}
                    step={1}
                    value={[settings.gap]}
                    onValueChange={vals => setSetting({ gap: vals[0] ?? settings.gap })}
                  />
                </Row>
                <Separator />
                <Row label="启动恢复上次文件夹" hint="重开应用时回到上次浏览的目录（需重新授权时出现横幅）">
                  <Switch checked={settings.restoreLastFolder} onCheckedChange={v => setSetting({ restoreLastFolder: v })} aria-label="启动恢复上次文件夹" />
                </Row>
                <Separator />
                <Row label="自动滚动播放" hint="画廊匀速向下滚动浏览（空格键开关），滚轮/点击打断，到底自动停">
                  <Switch checked={settings.autoScroll} onCheckedChange={v => setSetting({ autoScroll: v })} aria-label="自动滚动播放" />
                </Row>
                <Separator />
                <Row label="滚动灵敏度" hint={sensitivity === 1 ? '原生滚动' : `${sensitivity.toFixed(2)}x`}>
                  <Slider
                    className="w-36"
                    min={1}
                    max={9}
                    step={1}
                    value={[settings.scrollSensitivity]}
                    onValueChange={vals => setSetting({ scrollSensitivity: vals[0] ?? settings.scrollSensitivity })}
                  />
                </Row>
              </div>
            )}

            {section === 'interaction' && (
              <div>
                <Row
                  label="右键手势"
                  hint="快速右键 = 菜单；按住约 0.35 秒出现罗盘后拖到外圈触发，Ctrl+Z 撤销"
                >
                  <Switch checked={settings.gestureEnabled} onCheckedChange={v => setSetting({ gestureEnabled: v })} aria-label="右键手势" />
                </Row>
                <Separator />
                <div className="py-2.5 text-xs leading-relaxed text-muted-foreground">
                  <p>方向：← / → 上、下一有图文件夹（跳过空文件夹）· ↑ 上级 · ↓ 返回上一目录</p>
                  <p>关闭手势后，右键仅打开菜单。</p>
                </div>
              </div>
            )}

            {section === 'video' && (
              <div>
                <Row label="记忆播放位置" hint="重新打开视频时从上次位置继续">
                  <Switch checked={settings.rememberVideoPos} onCheckedChange={v => setSetting({ rememberVideoPos: v })} aria-label="记忆播放位置" />
                </Row>
                <Separator />
                <Row label="自动连播" hint="视频播完自动切换到下一个文件">
                  <Switch checked={settings.autoPlayNext} onCheckedChange={v => setSetting({ autoPlayNext: v })} aria-label="自动连播" />
                </Row>
                <Separator />
                <Row label="音量与倍速" hint="音量和倍速自动记忆，下次打开沿用">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {Math.round(settings.videoVolume * 100)}% · {settings.videoPlaybackRate}x
                  </span>
                </Row>
              </div>
            )}

            {section === 'shortcuts' && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 py-1">
                {SHORTCUTS.map(([keys, desc]) => (
                  <div key={keys} className="flex min-w-0 items-center gap-2">
                    <kbd className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap">{keys}</kbd>
                    <span className="truncate text-xs text-muted-foreground" title={desc}>{desc}</span>
                  </div>
                ))}
              </div>
            )}

            {section === 'about' && (
              <div className="flex flex-col gap-4 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Images className="size-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-heading text-base font-medium">FlowVision Web</div>
                    <a
                      href={`${REPO_URL}/releases`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs tabular-nums text-muted-foreground hover:text-foreground"
                      title="查看版本发布记录"
                    >
                      v{__APP_VERSION__}
                    </a>
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground">
                  对标 macOS FlowVision 的图片浏览器：本地文件夹（File System Access API）与
                  WebDAV 远程浏览（NAS / Nextcloud / rclone），瀑布流等四种布局、大图查看、
                  视频播放与右键手势导航。支持安装为 PWA 离线使用。
                </p>

                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'GitHub 仓库', href: REPO_URL },
                    { label: '问题反馈', href: `${REPO_URL}/issues` },
                    { label: '版本发布', href: `${REPO_URL}/releases` },
                  ].map(l => (
                    <Button key={l.label} variant="outline" size="sm" asChild>
                      <a href={l.href} target="_blank" rel="noreferrer">
                        {l.label}
                        <ExternalLink className="size-3" />
                      </a>
                    </Button>
                  ))}
                </div>

                <Separator />
                <div className="text-xs leading-relaxed text-muted-foreground">
                  <p>React 19 · TypeScript · Vite · Tailwind CSS · shadcn/ui</p>
                  <p className="mt-1">基于 MIT 许可开源</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
