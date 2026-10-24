import path from 'node:path'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// GitHub Pages 部署在 /FlowVisionWeb/ 子路径：CI 通过 DEPLOY_BASE 注入，
// 本地 dev 不设置（根路径），保证两种环境构建互不干扰
const base = process.env.DEPLOY_BASE ?? '/'

// 构建期注入版本号（package.json），UI 显示当前版本用
const appVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

// https://vite.dev/config/
export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'FlowVision Web',
        short_name: 'FlowVision',
        description: '瀑布流图片浏览器：四级布局、两级加载、手势导航、文件管理',
        lang: 'zh-CN',
        // 相对作用域：子路径部署（/FlowVisionWeb/）与根部署都正确
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0ea5e9',
        background_color: '#ffffff',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // 文件关联：安装后出现在系统「打开方式」（Chromium 桌面）
        file_handlers: [
          {
            action: './',
            accept: {
              'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.svg'],
            },
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // 字体与图标走缓存优先；HTML/SW 入口默认网络优先由 precache 覆盖
        navigateFallback: 'index.html',
        // 子路径部署时让 Workbox 以相对路径解析（默认用 base）
      },
      devOptions: {
        // 开发模式下启用 SW（http://localhost 可注册），便于联调安装/更新流程
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
