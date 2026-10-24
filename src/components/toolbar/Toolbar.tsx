import { ArrowUpDown, Columns3, FolderOpen, LayoutGrid, LoaderCircle, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/useAppStore'
import type { LayoutType, SortType } from '@/types'
import { cn } from '@/lib/utils'

const SORT_OPTIONS: { value: SortType; label: string }[] = [
  { value: 'name', label: '名称' },
  { value: 'size', label: '大小' },
  { value: 'date', label: '修改日期' },
]

function ToolButton(props: React.ComponentProps<typeof Button> & { tip: string }) {
  const { tip, children, ...rest } = props
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" {...rest}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

export function Toolbar() {
  const status = useAppStore(s => s.status)
  const scanProgress = useAppStore(s => s.scanProgress)
  const fileCount = useAppStore(s => s.files.length)
  const layout = useAppStore(s => s.layout)
  const columnWidth = useAppStore(s => s.columnWidth)
  const sortType = useAppStore(s => s.sortType)
  const sortAsc = useAppStore(s => s.sortAsc)
  const theme = useAppStore(s => s.theme)
  const openDirectory = useAppStore(s => s.openDirectory)
  const setLayout = useAppStore(s => s.setLayout)
  const setColumnWidth = useAppStore(s => s.setColumnWidth)
  const setSortType = useAppStore(s => s.setSortType)
  const toggleSortAsc = useAppStore(s => s.toggleSortAsc)
  const toggleTheme = useAppStore(s => s.toggleTheme)

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
      <Button size="sm" variant="outline" onClick={openDirectory} disabled={status === 'scanning'}>
        {status === 'scanning'
          ? <LoaderCircle className="animate-spin" />
          : <FolderOpen />}
        打开文件夹
      </Button>
      {status === 'scanning' && (
        <span className="text-xs text-muted-foreground">
          {scanProgress ? `扫描中 ${scanProgress.done}/${scanProgress.total}` : '读取目录…'}
        </span>
      )}
      {status === 'ready' && (
        <span className="text-xs text-muted-foreground">{fileCount} 个文件</span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <Select value={sortType} onValueChange={v => setSortType(v as SortType)}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToolButton
          tip={sortAsc ? '升序（点击切换降序）' : '降序（点击切换升序）'}
          onClick={toggleSortAsc}
          aria-label="切换排序方向"
        >
          <ArrowUpDown className={cn('transition-transform', !sortAsc && 'rotate-180')} />
        </ToolButton>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ToggleGroup
          type="single"
          variant="outline"
          value={layout}
          onValueChange={v => { if (v) setLayout(v as LayoutType) }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem value="waterfall" aria-label="瀑布流布局">
                <Columns3 />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>瀑布流</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem value="grid" aria-label="网格布局">
                <LayoutGrid />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>网格</TooltipContent>
          </Tooltip>
        </ToggleGroup>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex w-28 items-center gap-2 px-1" aria-label="缩略图大小">
              <Slider
                min={96}
                max={384}
                step={8}
                value={[columnWidth]}
                onValueChange={vals => setColumnWidth(vals[0] ?? columnWidth)}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>缩略图大小</TooltipContent>
        </Tooltip>

        <ToolButton tip={theme === 'dark' ? '切换到亮色' : '切换到暗色'} onClick={toggleTheme} aria-label="切换主题">
          {theme === 'dark' ? <Sun /> : <Moon />}
        </ToolButton>
      </div>
    </header>
  )
}
