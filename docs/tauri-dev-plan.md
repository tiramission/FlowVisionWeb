# Tauri 桌面版开发计划（feat/tauri-packaging）

> 探索已证实 WebView2 下 FS API 可用，但每次重启需重新授权、无创建时间元数据、无法文件监听。
> 方案：双模式——`isTauri()` 走原生适配器，否则走现有 FS API。目标 **v0.2.0**，Web 版零影响。

## 核心决策

- 适配层收口在 `src/lib/fs/`（adapter.ts 唯一平台分叉点），`FileModel.handle` 泛化为文件引用，ThumbCache/Viewer 只改取 File/URL 的几行
- 自写 Rust 命令（`#[tauri::command]`），不用 `tauri-plugin-fs` 静态 scope；dialog 插件只管选目录
- 文件读取：图片走 IPC 传 bytes；视频走 asset 协议直连（Range，seek 必须）
- 持久化：句柄 IDB → **路径字符串**，会话恢复/收藏夹恒无需授权，授权横幅流程整体删除
- 权限弹窗在 Tauri 下全部消失（capabilities 一次声明），`ensureWritePermission` 等短路

## 里程碑

| 里程碑 | 内容 | 工期 | 产出 |
|--------|------|------|------|
| M1 | 核心浏览闭环 | ~1 天 | Tauri 版可日常看图 |
| M2 | 文件管理 | ~0.5 天 | 与 Web 版功能对齐 |
| M3 | 收尾 + CI + 发布 | ~1 天 | **v0.2.0**（MSI/NSIS） |
| M4 | 原生红利 | 按需 | 见下 |

节奏：M1+M2 完成即合并一次主线（Web 回归全绿），M3 在主线上发布。

### M1 核心浏览闭环

- [ ] 1.1 适配器骨架：adapter.ts 接口 + isTauri 探测，现有 FS API 逻辑包成 web 实现（纯搬家）
- [ ] 1.2 Rust 读命令：list_dir（walkdir，返回 size/modified/created/尺寸）/ list_subdirs（带 hasMedia）/ first_image / exists
- [ ] 1.3 dialog 插件选目录 + capabilities 配置
- [ ] 1.4 读文件门面：缩略图 decodeScaled 与 Viewer useFileUrl 切换
- [ ] 1.5 会话恢复 + 收藏夹路径化
- [ ] 1.6 dirKey 路径规范化（小写、`/`），视频记忆 key 随迁

**验收**：选目录零弹窗 → 瀑布流 → 大图（上万像素无黑块）→ 视频 seek 流畅 → 重启直接恢复（无横幅）→ 收藏夹跨会话可用。

### M2 文件管理

- [ ] 2.1 Rust 写命令：rename / remove / mkdir / copy / move（跨卷回退在 Rust 侧）
- [ ] 2.2 operations.ts 切适配器，权限函数短路
- [ ] 2.3 Ctrl+Z 撤销栈回归

**验收**：重命名/删除/新建/复制/移动（同卷+跨卷）全通零弹窗，撤销逐项生效。

### M3 桌面化收尾 + 发布 v0.2.0

- [ ] 3.1 PWA 控件条件渲染、launchQueue 挂空
- [ ] 3.2 productName 定名（去空格）、真实图标、devtools: false（消灭 F12 黑屏）
- [ ] 3.3 CI：release.yml 加 tauri 构建 job（Cargo 缓存，产物挂 Release）
- [ ] 3.4 README 桌面版章节
- [ ] 3.5 合并主线 → tag v0.2.0 → 手动写 release notes

**发布门禁**：干净沙箱装 MSI 全流程通过；Web 回归全绿；CI 全绿；体积记录（debug 参考 MSI 4.5MB / NSIS 2.8MB）。

### M4 原生红利（按体感排期）

- [ ] 4.1 创建日期排序（list_dir 顺带返回 created，成本≈0，**建议 M3 前顺手做**）
- [ ] 4.2 删除进回收站（trash crate）
- [ ] 4.3 文件夹监听（notify + event 增量刷新）
- [ ] 4.4 文件关联 / 多窗口（远期挂账）

## Web 回归清单（每里程碑收尾必跑）

- [ ] 选目录、递归扫描、四布局
- [ ] 缩略图两级加载、大图三层、上万像素无黑块
- [ ] 视频控制栏、播放记忆
- [ ] 文件管理五种操作 + 撤销
- [ ] 右键手势、搜索（拼音）、会话恢复横幅、收藏夹

## 主要风险

| 风险 | 缓解 |
|------|------|
| 适配层改坏 Web 路径 | 每里程碑跑回归清单，门面保持现有签名 |
| asset 协议动态 scope 踩坑 | 受阻则视频降级全量读；Rust 侧 allow_directory 动态扩 |
| CI Tauri 构建失败 | workflow 先单独 PR 验证，不绑 tag |
| 大目录单次 IPC 过大 | 几万条实测，超限上 Channel 分批 |
