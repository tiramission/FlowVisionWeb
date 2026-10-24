# FlowVision Web

[FlowVision](https://github.com/netdcy/FlowVision)（macOS 瀑布流图片查看器）的 Web 版实现。

## 技术栈

| 决策点 | 选型 | 说明 |
|--------|------|------|
| 架构 | 纯前端 SPA | 通过 File System Access API 直接读取本地文件夹，无需后端，可静态部署；要求 Chrome/Edge 等 Chromium 浏览器 |
| 框架 | React 19 + TypeScript | Vite 8 构建 |
| 样式 | Tailwind CSS 4 + shadcn/ui（radix） | 亮/暗模式走 CSS 变量 |
| 虚拟滚动 | @tanstack/react-virtual | 大目录性能保障（对标原版 5000+ 文件优化） |
| 状态管理 | zustand | 轻量全局状态（浏览目录、布局模式、选中项） |

## 当前状态

MVP（核心浏览）已实现：

- 文件夹选择（File System Access API）与目录扫描，带进度显示
- 瀑布流 / 网格两种布局，均基于 TanStack Virtual 虚拟滚动（大目录可用）
- 缩略图尺寸头部解析（PNG/GIF/BMP/WebP/JPEG/ICO/SVG，不整图解码），未知格式由图片加载后回填
- 大图查看器：滚轮缩放（以光标为锚点）、拖拽平移、←/→ 切换、0 适应窗口、1 原始大小、双击关闭（对齐原版）
- 浏览器可解码的视频（mp4/webm 等）直接用原生 `<video>` 播放
- 排序：名称（自然序）/ 大小 / 修改日期，可切换升降序
- 亮 / 暗模式，跟随系统偏好初始化，localStorage 持久化
- 键盘：方向键移动选中（感知布局列数）、Enter 打开、Esc 关闭

后续按原版功能逐步补齐：justified/detail 布局、子文件夹导航与目录树侧边栏、搜索（正则/拼音）、文件管理操作、右键手势、收藏夹、RAW/PSD/HEIC 解码（wasm）、缩略图缓存等。

## 目录结构

```
src/
├── components/
│   ├── ui/            # shadcn/ui 生成的基础组件
│   ├── toolbar/       # 顶部工具栏：布局切换、缩略图大小、排序
│   ├── gallery/       # 缩略图网格/瀑布流视图（虚拟滚动）
│   ├── viewer/        # 大图查看器：缩放、平移
│   └── sidebar/       # 侧边栏（目录树，后续）
├── hooks/             # useDirectory / useThumbnail / useTheme 等
├── lib/
│   ├── fs/            # File System Access API 封装（目录扫描、句柄管理）
│   └── layout/        # 布局算法：waterfall / justified / grid 行高计算
├── store/             # zustand 全局状态
├── types/             # FileModel 等数据模型（对标原版 DataModel.swift / Enum.swift）
└── lib/utils.ts       # cn() 等通用工具
```

## 开发

```bash
npm install
npm run dev      # 启动开发服务器
npm run build    # 类型检查 + 生产构建
npm run preview  # 预览生产构建
```
