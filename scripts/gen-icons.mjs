// 生成 PWA 全套图标：简洁的瀑布流标识（三条错落色带 + 圆角底）
// 用法：node scripts/gen-icons.mjs（在浏览器外用 node-canvas 不可行，
// 这里用纯 PNG 编码器太复杂——改为生成 SVG，由构建期 sharp 转换。
// 实际方案：直接手写 SVG 源 + @vite-pwa/assets-generator 生成位图）
import { writeFileSync, mkdirSync } from 'node:fs'

mkdirSync('scripts/icons-src', { recursive: true })

const gradient = (id, from, to) => `
  <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${from}"/>
    <stop offset="1" stop-color="${to}"/>
  </linearGradient>`

// 普通图标（含安全边距，中央视觉区 ~80%）
const normal = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>${gradient('bg', '#1e6fd9', '#0ea5e9')}</defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <g>
    <rect x="116" y="116" width="72" height="180" rx="16" fill="#ffffff" opacity="0.55"/>
    <rect x="220" y="156" width="72" height="220" rx="16" fill="#ffffff" opacity="0.8"/>
    <rect x="324" y="96"  width="72" height="160" rx="16" fill="#ffffff" opacity="0.55"/>
  </g>
  <g>
    <rect x="116" y="328" width="72" height="68" rx="16" fill="#ffffff"/>
    <rect x="220" y="404" width="72" height="12" rx="6" fill="#ffffff" opacity="0.9"/>
    <rect x="324" y="284" width="72" height="112" rx="16" fill="#ffffff" opacity="0.9"/>
  </g>
</svg>`

// maskable（视觉区收缩到 60% 圆内）
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>${gradient('bg', '#1e6fd9', '#0ea5e9')}</defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(96 96) scale(0.625)">
    <rect x="16" y="16" width="72" height="180" rx="16" fill="#ffffff" opacity="0.55"/>
    <rect x="120" y="56" width="72" height="220" rx="16" fill="#ffffff" opacity="0.8"/>
    <rect x="224" y="0" width="72" height="160" rx="16" fill="#ffffff" opacity="0.55"/>
    <rect x="16" y="228" width="72" height="68" rx="16" fill="#ffffff"/>
    <rect x="224" y="184" width="72" height="112" rx="16" fill="#ffffff" opacity="0.9"/>
  </g>
</svg>`

writeFileSync('scripts/icons-src/icon.svg', normal)
writeFileSync('scripts/icons-src/maskable.svg', maskable)
console.log('SVG 源已生成 scripts/icons-src/')
