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

## 功能完成情况

对标原版 FlowVision 的功能清单。勾选 = 已完成；未勾选中标注"部分"的为已有基础实现、尚不完整。

### 核心浏览

- [x] 文件夹选择（File System Access API，带浏览器支持检测）
- [x] 目录扫描（64 并发读元信息，进度显示）
- [x] 瀑布流布局（多列 masonry，列数随宽度自适应）
- [x] 网格布局（等宽方形）
- [ ] justified 布局（等高行对齐）
- [ ] detail 布局（详情列表）
- [x] 虚拟滚动（TanStack Virtual，大目录只渲染可视区域）
- [x] 缩略图大小调节（工具栏滑块）
- [ ] 递归子目录模式
- [ ] 文件夹缩略图（堆叠预览）

### 缩略图引擎

- [x] 尺寸头部解析（PNG/GIF/BMP/WebP/JPEG/ICO/SVG，不整图解码）
- [x] 未知格式尺寸回填（缩略图加载后上报 naturalWidth/Height）
- [ ] 缩略图缓存（生成小图 + LRU/IndexedDB）
- [ ] 内存上限管理
- [ ] 滚动方向预加载窗口

### 大图查看器

- [x] 滚轮缩放（以光标为锚点）
- [x] 拖拽平移
- [x] 适应窗口 / 100% 原始大小（按钮与 `0` / `1` 键）
- [x] `←/→` 切换、`Esc` 关闭、双击关闭（对齐原版）
- [ ] 长按切换缩放（原版：长按左键 100%、长按右键适应）
- [ ] 高质量缩放（抗摩尔纹）
- [ ] HDR 显示

### 视频播放

- [x] 浏览器原生格式直接播放（mp4/webm/mov 等，原生 `<video>`）
- [ ] 播放增强（倍速、音量记忆、断点续播、顺序播放）
- [ ] 扩展格式（mkv/avi/flv 等，需 wasm 解码）

### 文件系统导航

- [x] 目录树侧边栏（懒加载、自动展开到当前目录、当前高亮、可拖宽）
- [x] 面包屑路径栏（可点任意层级跳转）
- [x] 前进 / 后退历史栈
- [x] 上级目录
- [ ] 收藏夹
- [ ] 上一 / 下一有图文件夹（对标原版右键手势的查找目标）
- [ ] 多窗口 / 标签

### 文件管理

- [ ] 重命名 / 删除 / 新建文件夹
- [ ] 复制 / 剪切 / 粘贴
- [ ] 拖拽移动
- [ ] 标记（标签与评分）

### 搜索与排序

- [x] 排序：名称（自然序）/ 大小 / 修改日期，升降序切换
- [ ] 排序：创建日期 / 类型 / EXIF 日期 / 随机（原版共 16 种）
- [ ] 当前目录快速搜索（过滤）
- [ ] 正则搜索
- [ ] 拼音 / 拼音首字母搜索

### 交互

- [x] 单击选中、双击打开、Enter 打开、Esc 关闭
- [x] 方向键移动选中（感知当前布局列数）
- [x] 导航键盘：`Alt+←/→` 前进后退、`W`/`Backspace` 上级、`S`/`Esc` 返回（对标原版 W/S）
- [ ] 右键手势（8 方向切换文件夹/关闭）
- [ ] 右键上下文菜单
- [ ] 自动滚动播放

### 格式支持

- [x] 浏览器原生图片（JPG/PNG/GIF/WebP/AVIF/BMP/SVG/ICO/APNG）
- [x] 浏览器原生视频
- [ ] RAW / PSD / HEIC（需引入 wasm 解码库）

### 外观与设置

- [x] 亮 / 暗模式（跟随系统初始化 + 手动切换 + localStorage 持久化）
- [ ] 设置页面
- [ ] 布局档案配置（缩略图尺寸/间距/边框等组合）
- [ ] 纯黑背景模式
- [ ] 滚动灵敏度调节

## 目录结构

```
src/
├── components/
│   ├── ui/            # shadcn/ui 生成的基础组件
│   ├── toolbar/       # 顶部工具栏：布局切换、缩略图大小、排序、主题
│   ├── pathbar/       # 路径栏：面包屑、前进/后退/上级、导航键盘
│   ├── sidebar/       # 目录树侧边栏（懒加载）
│   ├── gallery/       # 瀑布流/网格画廊（虚拟滚动）、空状态
│   └── viewer/        # 大图查看器：缩放、平移、原生视频播放
├── hooks/             # useSortedFiles / useFileUrl
├── lib/
│   ├── fs/            # File System Access API 封装（目录/子目录扫描、并发池）
│   ├── image/         # 图片尺寸头部解析
│   ├── sort.ts        # 排序
│   └── utils.ts       # cn() 等通用工具
├── store/             # zustand 全局状态（导航历史、目录树、浏览状态）
└── types/             # FileModel 等数据模型（对标原版 DataModel.swift / Enum.swift）
```

## 开发

```bash
npm install
npm run dev      # 启动开发服务器
npm run build    # 类型检查 + 生产构建
npm run preview  # 预览生产构建
```
