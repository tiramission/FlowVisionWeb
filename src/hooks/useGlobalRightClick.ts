import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/useAppStore'

/** 按住右键多久后激活手势模式（出现罗盘）；快速右键（不足此时长松开）= 菜单 */
const HOLD_TO_ACTIVATE_MS = 350

/**
 * 全应用右键接管（对标原版全窗口手势）：
 * - 原生右键菜单在任何位置都被接管（豁免输入框保留原生粘贴菜单、
 *   豁免对话框/下拉弹层）
 * - 快速右键（按住不足 350ms 松开）= 打开应用菜单，不出现罗盘
 * - 按住 350ms 激活手势模式：罗盘浮现，拖到外圈（56px）触发动作，
 *   进度环可视化、Ctrl+Z 可撤销；手势模式中松开不弹菜单
 * - 设置中可关闭手势（关闭后右键仅弹菜单）
 *
 * 监听器在 App 挂载时注册一次、应用全生命周期有效。
 */
export function useGlobalRightClick() {
  // armed：已按下且等待 hold 激活；active：手势模式已激活（罗盘可见）
  const gestureRef = useRef({ armed: false, active: false, x: 0, y: 0, fired: false })
  const bypassMenuRef = useRef(false)

  useEffect(() => {
    const SHOW_DIST = 10
    const FIRE_DIST = 56
    const CIRC = 2 * Math.PI * 26 // 与进度环 SVG 的 r=26 一致

    // 8 扇区（屏幕坐标 y 向下）：索引 = round(atan2(dy,dx)/45°)
    const SECTORS: { deg: number; label: string; act: () => void }[] = [
      { deg: 90, label: '下一有图文件夹', act: () => void useAppStore.getState().goSiblingImageDir(1) },
      { deg: 135, label: '', act: () => {} }, // down_right：原版为关闭窗口，浏览态无对应
      { deg: 180, label: '返回', act: () => useAppStore.getState().goBack() },
      { deg: 225, label: '', act: () => {} },
      { deg: 270, label: '上一有图文件夹', act: () => void useAppStore.getState().goSiblingImageDir(-1) },
      { deg: 315, label: '上一有图文件夹', act: () => void useAppStore.getState().goSiblingImageDir(-1) },
      { deg: 0, label: '上级目录', act: () => useAppStore.getState().goUp() },
      { deg: 45, label: '下一有图文件夹', act: () => void useAppStore.getState().goSiblingImageDir(1) },
    ]
    const sectorOf = (dx: number, dy: number) =>
      ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8

    // 轨迹浮层（纯 DOM，避免 mousemove 触发 React 重渲染）
    const ov = document.createElement('div')
    ov.className = 'fixed z-[90] pointer-events-none flex flex-col items-center gap-1.5'
    ov.style.display = 'none'
    ov.innerHTML = `
      <div class="fv-g-ring relative flex size-16 items-center justify-center rounded-full border-2 border-border bg-background/90 shadow-lg backdrop-blur-sm text-muted-foreground">
        <svg class="absolute inset-0" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="26" fill="none" stroke="#888" stroke-opacity="0.25" stroke-width="3"/>
          <circle class="fv-g-bar" cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="${CIRC.toFixed(1)}" stroke-dashoffset="${CIRC.toFixed(1)}" transform="rotate(-90 32 32)"/>
        </svg>
        <svg class="fv-g-arrow relative" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 90ms"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
      </div>
      <div class="fv-g-label rounded bg-foreground/85 px-2 py-0.5 text-xs text-background whitespace-nowrap"></div>`
    document.body.appendChild(ov)
    const ring = ov.querySelector('.fv-g-ring') as HTMLElement
    const arrow = ov.querySelector('.fv-g-arrow') as HTMLElement
    const bar = ov.querySelector('.fv-g-bar') as SVGCircleElement
    const labelEl = ov.querySelector('.fv-g-label') as HTMLElement
    let hideTimer = 0
    const show = (x: number, y: number, sector: number | null, fired: boolean, progress: number) => {
      ov.style.display = 'flex'
      ov.style.left = `${x}px`
      ov.style.top = `${y}px`
      ov.style.transform = 'translate(-50%, calc(-100% - 20px))'
      const s = sector === null ? null : SECTORS[sector]
      arrow.style.transform = `rotate(${s?.deg ?? 0}deg)`
      bar.style.strokeDashoffset = `${(CIRC * (1 - progress)).toFixed(1)}`
      labelEl.textContent = s ? (fired ? `${s.label}（Ctrl+Z 撤销）` : s.label) : '拖动到外圈触发'
      ring.classList.toggle('border-primary', fired)
      ring.classList.toggle('text-primary', fired)
      ring.classList.toggle('bg-primary/10', fired)
    }
    const hide = () => { ov.style.display = 'none' }
    const hideSoon = () => {
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(hide, 900)
    }

    const editable = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')
    /** 对话框/下拉弹层内只接管不手势不弹菜单 */
    const inPopup = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest('[role="dialog"], [data-radix-popper-content-wrapper]')
    const galleryRoot = () => document.querySelector('[data-gallery-root]')

    let holdTimer = 0

    // 区域内原生右键菜单一律接管（合成派发时 bypass 放行给 Radix）
    const onCtx = (e: MouseEvent) => {
      if (bypassMenuRef.current) return
      if (editable(e.target)) return
      e.preventDefault()
      e.stopPropagation()
    }
    const onDown = (e: MouseEvent) => {
      if (e.button !== 2 || editable(e.target) || inPopup(e.target)) return
      e.preventDefault()
      const g = gestureRef.current
      g.armed = true
      g.active = false
      g.fired = false
      g.x = e.clientX
      g.y = e.clientY
      // 按住足够时长才激活手势模式（罗盘浮现）；快速松开则走菜单
      if (useAppStore.getState().settings.gestureEnabled) {
        window.clearTimeout(holdTimer)
        holdTimer = window.setTimeout(() => {
          const cur = gestureRef.current
          if (cur.armed && !cur.active) {
            cur.active = true
            show(cur.x, cur.y, null, false, 0)
          }
        }, HOLD_TO_ACTIVATE_MS)
      }
    }
    const onMove = (e: MouseEvent) => {
      const g = gestureRef.current
      if (!g.active) return
      const dx = e.clientX - g.x
      const dy = e.clientY - g.y
      const dist = Math.hypot(dx, dy)
      if (g.fired) return
      const sector = sectorOf(dx, dy)
      if (dist >= FIRE_DIST) {
        g.fired = true
        const s = SECTORS[sector]
        if (s.label) {
          useAppStore.getState().pushGestureUndo({
            chain: [...useAppStore.getState().dirChain],
            label: s.label,
          })
        }
        s.act()
        show(g.x, g.y, sector, true, 1)
      } else if (dist >= SHOW_DIST) {
        show(g.x, g.y, sector, false, (dist - SHOW_DIST) / (FIRE_DIST - SHOW_DIST))
      }
    }
    const openMenu = (e: MouseEvent) => {
      // 无拖动的快速右键：合成 contextmenu 打开应用菜单（大图内除外）。
      // 命中瓦片 = 条目菜单，否则 = 空白菜单；单一触发器由 ctxMenuTargetId 区分内容
      if (useAppStore.getState().viewerId) return
      if (inPopup(e.target)) return
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-file-id]') as HTMLElement | null
      useAppStore.getState().setCtxMenuTargetId(hit?.getAttribute('data-file-id') ?? null)
      const target = hit ?? galleryRoot()
      if (!target) return // 画廊尚未挂载（空状态）：仅接管，无菜单
      bypassMenuRef.current = true
      try {
        target.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY,
        }))
      } finally {
        bypassMenuRef.current = false
      }
    }
    const onUp = (e: MouseEvent) => {
      const g = gestureRef.current
      if (!g.armed) return
      window.clearTimeout(holdTimer)
      gestureRef.current = { armed: false, active: false, x: 0, y: 0, fired: false }
      if (e.button !== 2) return
      // 手势模式中松开：触发过则延迟收起，未触发视为取消；均不弹菜单
      if (g.active) {
        if (g.fired) hideSoon()
        else hide()
        return
      }
      // 快速右键：菜单
      openMenu(e)
    }
    window.addEventListener('contextmenu', onCtx, true)
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('contextmenu', onCtx, true)
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.clearTimeout(holdTimer)
      window.clearTimeout(hideTimer)
      ov.remove()
    }
  }, [])
}
