# FlowVision Web

[![CI](https://github.com/tiramission/FlowVisionWeb/actions/workflows/ci.yml/badge.svg)](https://github.com/tiramission/FlowVisionWeb/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/tiramission/FlowVisionWeb.svg?color=blue)](https://github.com/tiramission/FlowVisionWeb/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![PWA](https://img.shields.io/badge/PWA-%E5%8F%AF%E5%AE%89%E8%A3%85-5A0FC8.svg?logo=pwa)](https://tiramission.github.io/FlowVisionWeb/)

**[在线使用 / 安装为应用](https://tiramission.github.io/FlowVisionWeb/)** —— Chrome / Edge 打开即可安装为桌面应用，支持图片文件关联。

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
- [x] justified 布局（等高行对齐，贪心装行、末行不放大）
- [x] 网格布局（等宽方形）
- [x] detail 布局（列表：名称/相对路径/尺寸/大小/修改日期，吸顶表头）
- [x] 虚拟滚动（TanStack Virtual，大目录只渲染可视区域）
- [x] 缩略图大小调节（工具栏滑块）
- [x] 递归子目录模式（最深 4 层，文件带相对路径，进度不定态显示）
- [x] 文件夹缩略图（目录内首图堆叠预览，双击/Enter 进入）

### 缩略图引擎

- [x] 尺寸头部解析（PNG/GIF/BMP/WebP/JPEG/ICO/SVG，不整图解码）
- [x] 未知格式尺寸回填（缩略图加载后上报 naturalWidth/Height）
- [x] 缩略图缓存（大于 768px 的图 createImageBitmap 缩放 + webp 重编码，IndexedDB 持久化跨会话复用，配额满/私有模式静默降级）
- [x] 内存上限管理（64MB / 600 条目 LRU，引用计数保护可视区条目不被淘汰；GIF/SVG/小图直连原文件）
- [x] 滚动方向预加载窗口（可视区前 20 后 40，低优先级队列，对标原版 PRELOAD_THUMB_RANGE）

### 大图查看器

- [x] 超大图两级加载：缩略图(768px)秒开 → 预览(2560px webp，IDB 持久化) → 缩放超过预览分辨率阈值（±5% 迟滞）才解码全图并淡入，缩回即卸载释放内存；翻图时邻图预览空闲预加载
- [x] 滚轮缩放（以光标为锚点）
- [x] 拖拽平移
- [x] 适应窗口 / 100% 原始大小（按钮与 `0` / `1` 键）
- [x] `←/→` 切换、`Esc` 关闭、双击关闭（对齐原版）
- [x] 长按切换缩放（按住不动 0.4s：左键临时 100%、右键临时适应窗口，松开还原；位移超 8px 视为拖拽/手势自动取消）
- [ ] 高质量缩放（抗摩尔纹）
- [ ] HDR 显示

### 视频播放

- [x] 浏览器原生格式直接播放（mp4/webm/mov 等，原生 `<video>`）
- [x] 播放增强：倍速（0.5x-3x 档位按钮与 `,`/`.` 键）、音量/倍速记忆、断点续播（超过 3 秒才记，按目录+文件+大小+mtime 失效，最多 300 条）、自动连播（均可关）
- [ ] 扩展格式（mkv/avi/flv 等，需 wasm 解码）

### 文件系统导航

- [x] 目录树侧边栏（懒加载、自动展开到当前目录、当前高亮、可拖宽）
- [x] 面包屑路径栏（可点任意层级跳转）
- [x] 前进 / 后退历史栈
- [x] 上级目录
- [x] 收藏夹（星标收藏当前目录，下拉菜单跳转/删除，句柄存 IndexedDB 跨会话恢复，恢复的句柄首次跳转时按需重新授权）
- [x] 上一 / 下一有图文件夹（`A`/`D` 键与右键手势 ←/→，自动跳过空文件夹，对标原版右键手势的查找目标与 WASD 导航）
- [x] 启动恢复上次文件夹（目录链句柄存 IDB；权限仍在则静默恢复，需重新授权时出现恢复横幅点击授权；设置可关）
- [ ] 多窗口 / 标签

### WebDAV 远程浏览（v0.2 预览，feat/webdav 分支）

- [x] 连接管理（服务器/账号/密码，连接测试与分类诊断：CORS / 混合内容 / 认证失败 / 超时均翻译为可读提示；密码默认仅存会话内存，勾选记住才落盘并有明文警告）
- [x] 远程只读浏览（PROPFIND 列目录、递归 BFS 深度 4、文件夹堆叠封面、搜索排序布局全功能复用；写操作菜单自动隐藏）
- [x] 缩略图与大图管线复用（Range 请求只拉文件头部解析尺寸；缩略图 IndexedDB 持久缓存对远程同样生效）
- [x] 远程会话恢复与收藏（重开凭据缺失时横幅 → 连接对话框输入后续接原目录）
- [x] 移动端适配（手机浏览器/PWA 可用：抽屉侧边栏、紧凑工具栏、查看器双指缩放与滑动切换）——手机上浏览 NAS 图片库是 WebDAV 的核心场景
- [ ] WebDAV 写操作（协议支持 MOVE/DELETE/MKCOL，v2 廉价跟进）

### 文件管理

- [x] 重命名 / 删除 / 新建文件夹（右键菜单与 F2/Delete 快捷键，重命名对话框、删除二次确认，写权限按需申请，操作后静默刷新不闪列表）
- [x] 复制 / 剪切 / 粘贴（Ctrl+C/X/V，剪切项变淡对标原版 cutItemPaths，同名自动加序号 `(2)`，移动优先原生 `handle.move` 瞬时完成、不支持时回退复制+删除，目录递归复制）
- [x] 拖拽移动（画廊条目拖到目录树节点或面包屑层级完成移动，目标高亮，防拖入自身子目录）
- [ ] 标记（标签与评分）

### 搜索与排序

- [x] 排序：名称（自然序）/ 大小 / 修改日期 / 类型 / 随机，升降序切换（随机序种子稳定，方向按钮作为重洗；创建日期浏览器 File API 不提供，暂缺）
- [x] 当前目录快速搜索（实时过滤，`Ctrl+F` / `/` 唤起，Enter 选中首个匹配，过滤计数 x/N）
- [x] 正则搜索（输入框内开关，非法正则按不匹配处理）
- [x] 拼音 / 拼音首字母搜索（pinyin-pro 按需加载不进首屏，转换结果缓存，自动与子串匹配叠加）

### 交互

- [x] 单击选中、双击打开、Enter 打开、Esc 关闭
- [x] 方向键移动选中（感知当前布局列数）
- [x] 导航键盘：`Alt+←/→` 前进后退、`W`/`Backspace` 上级、`S`/`Esc` 返回（对标原版 W/S）
- [x] 右键手势（与菜单零冲突的触发设计：快速右键 = 菜单；按住 0.35s 罗盘浮现后拖到外圈才触发，←/→ 上/下一有图文件夹、↑ 上级、↓ 返回，进度环可视化、Ctrl+Z 撤销、设置中可关闭）
- [x] 右键上下文菜单（条目：打开/复制/剪切/重命名/删除；空白区：粘贴/新建文件夹）
- [x] 自动滚动播放（空格键或设置开关，60px/s 匀速，滚轮/点击打断，到底自动停止并提示）
- [x] 触摸手势（查看器双指捏合缩放锚定双指中点、fit 态单指横滑切换；画廊滚动为原生触摸滚动）

### 格式支持

- [x] 浏览器原生图片（JPG/PNG/GIF/WebP/AVIF/BMP/SVG/ICO/APNG）
- [x] 浏览器原生视频
- [ ] RAW / PSD / HEIC（需引入 wasm 解码库）

### 外观与设置

- [x] 亮 / 暗模式（三态：跟随系统/亮/暗，系统切换实时响应，工具栏快切，localStorage 持久化）
- [x] 设置页面（外观/浏览分组 + 快捷键速查，所有项即时生效并自动保存）
- [x] 布局档案配置（缩略图间距 0-24px 即时调节，对标原版 LayoutProfile 的间距项）
- [x] 纯黑背景模式（画廊浏览区纯黑，对标原版 blackBg）
- [x] 滚动灵敏度调节（1-9 档映射 0.25x-4x，公式与原版一致，非 1x 接管滚轮）

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

## 安装为应用（PWA）

Chrome / Edge 访问 [GitHub Pages 线上地址](https://tiramission.github.io/FlowVisionWeb/)，地址栏右侧出现安装图标即可安装为桌面应用；应用内也会弹出安装横幅。

- 独立窗口运行（无浏览器地址栏），应用壳离线可用
- 安装后在系统「打开方式」中可关联 jpg/png/gif/webp/avif/bmp/svg，双击图片直接用本应用打开
- 新版本发布后应用内右下角提示刷新

本地开发联调 PWA： 后在 http://localhost:5199 同样可安装。

## WebDAV 远程浏览

工具栏「WebDAV」按钮添加连接（NAS / Nextcloud / rclone 等），即可像本地文件夹一样浏览远程图片库（只读）。这也是移动端的推荐用法：手机浏览器无本地文件访问能力，连接 WebDAV 即可把本应用当作 NAS 看图客户端。

**服务器要求**：必须 HTTPS + 开启 CORS 跨域响应头。

| 服务端 | 可用性 |
|---|---|
| Nextcloud | 开箱可用 |
| rclone serve webdav | 配置 CORS 后可用 |
| 群晖 DSM 自带 WebDAV | 默认不带跨域头，需反向代理加头 |
| 自建（Apache/Nginx/Caddy） | 配置 CORS 后可用 |

**安全提示**：密码默认只保存在当前会话内存，刷新后需重新输入；勾选「记住密码」会明文存入本机 IndexedDB，仅建议在个人设备开启。

**本地联调**：`node scripts/dev-webdav.mjs <目录> [端口] [--user 用户名 --pass 密码]` 起一个带 CORS / Basic 认证 / Range 的最小 WebDAV 测试服务。

## 开发

```bash
npm install
npm run dev      # 启动开发服务器
npm run build    # 类型检查 + 生产构建
npm run preview  # 预览生产构建
```
