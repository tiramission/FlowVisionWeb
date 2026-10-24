import { LayoutGrid, Rows3, Settings as SettingsIcon } from 'lucide-react'
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
  ['Enter / 双击', '打开（文件夹进入 / 图片大图）'],
  ['←→↑↓', '移动选中（感知布局列数）'],
  ['F2 / Delete', '重命名 / 删除'],
  ['Ctrl+C / X / V', '复制 / 剪切 / 粘贴'],
  ['W / Backspace', '上级目录'],
  ['S / Esc', '返回上一目录'],
  ['Alt+← / Alt+→', '后退 / 前进'],
  ['大图中：滚轮 / 拖拽 / 0 / 1', '缩放 / 平移 / 适应窗口 / 原始大小'],
]

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </div>
  )
}

/** 设置（对标原版 General/Advanced Settings 的 Web 子集），所有项即时生效并持久化 */
export function SettingsDialog() {
  const settings = useAppStore(s => s.settings)
  const setSetting = useAppStore(s => s.setSetting)
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
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>所有设置即时生效并自动保存</DialogDescription>
        </DialogHeader>

        <div className="text-xs font-medium text-muted-foreground">外观</div>
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
        <Row label="画廊纯黑背景" hint="浏览区域使用纯黑背景，适合看图">
          <Switch checked={settings.pureBlack} onCheckedChange={v => setSetting({ pureBlack: v })} aria-label="纯黑背景" />
        </Row>

        <Separator className="my-2" />
        <div className="text-xs font-medium text-muted-foreground">浏览</div>
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
        <Row label="缩略图间距" hint={`${settings.gap} px`}>
          <Slider
            className="w-40"
            min={0}
            max={24}
            step={1}
            value={[settings.gap]}
            onValueChange={vals => setSetting({ gap: vals[0] ?? settings.gap })}
          />
        </Row>
        <Row label="滚动灵敏度" hint={sensitivity === 1 ? '原生滚动' : `${sensitivity.toFixed(2)}x`}>
          <Slider
            className="w-40"
            min={1}
            max={9}
            step={1}
            value={[settings.scrollSensitivity]}
            onValueChange={vals => setSetting({ scrollSensitivity: vals[0] ?? settings.scrollSensitivity })}
          />
        </Row>
        <Row label="缩略图大小" hint={`${settings.columnWidth} px`}>
          <Slider
            className="w-40"
            min={96}
            max={384}
            step={8}
            value={[settings.columnWidth]}
            onValueChange={vals => setSetting({ columnWidth: vals[0] ?? settings.columnWidth })}
          />
        </Row>

        <Separator className="my-2" />
        <div className="text-xs font-medium text-muted-foreground">快捷键</div>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 py-2 text-xs">
          {SHORTCUTS.map(([keys, desc]) => (
            <div key={keys} className="contents">
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap">{keys}</kbd>
              <span className="text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>

        <Separator className="my-2" />
        <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
          <LayoutGrid className="size-3.5" />
          <span>FlowVision Web · 对标 macOS 版 FlowVision · 图片格式取决于浏览器解码能力</span>
        </div>
        <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
          <Rows3 className="size-3.5" />
          <span>RAW / PSD / HEIC 需浏览器支持，目前以可解码格式为准</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
