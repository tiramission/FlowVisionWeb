import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Download, MonitorSmartphone, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isFsApiSupported } from '@/lib/fs/directory'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** 已安装判定（含各平台口径） */
function useInstalled(): boolean {
  const [installed, setInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches || navigator.userAgent.includes('Electron'),
  )
  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)')
    const onChange = () => setInstalled(mq.matches)
    mq.addEventListener('change', onChange)
    const onAppInstalled = () => setInstalled(true)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      mq.removeEventListener('change', onChange)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])
  return installed
}

/**
 * 安装横幅 + 更新提示（PWA）：
 * - 未安装且浏览器发出 beforeinstallprompt 时，在空状态上方提示「安装为应用」
 * - SW 检测到新版本时右下角提示刷新（registerType: prompt，不强制刷新）
 */
export function PwaControls() {
  const installed = useInstalled()
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const doInstall = async () => {
    if (!installEvt) return
    await installEvt.prompt()
    setInstallEvt(null)
  }

  const showInstall = installEvt && !installed && !dismissed && isFsApiSupported()
  const showUpdate = needRefresh

  return (
    <>
      {showInstall && (
        <div className="pointer-events-auto fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-xl backdrop-blur">
          <MonitorSmartphone className="size-5 text-primary" />
          <div className="text-sm">
            <div className="font-medium">安装为桌面应用</div>
            <div className="text-xs text-muted-foreground">独立窗口运行，支持图片文件关联打开</div>
          </div>
          <Button size="sm" onClick={() => void doInstall()}>
            <Download />
            安装
          </Button>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-accent"
            onClick={() => setDismissed(true)}
            aria-label="关闭安装提示"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {showUpdate && (
        <div className="pointer-events-auto fixed bottom-6 right-6 z-[80] flex items-center gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-xl backdrop-blur">
          <RefreshCw className="size-4 text-primary" />
          <span className="text-sm">新版本已就绪</span>
          <Button size="sm" variant="outline" onClick={() => void updateServiceWorker(true)}>
            刷新
          </Button>
        </div>
      )}
    </>
  )
}
