# WebDAV 远程浏览开发计划（feat/webdav）

> 定位：纯 Web/PWA 的远程图片库浏览（NAS / Nextcloud / rclone），移动端一等公民。
> 不依赖 Tauri 分支的任何决定；Tauri 若日后落地，本功能的 UI 与缓存全部复用、只换传输层。
> v1 = 只读浏览 + 图片全管线 + 视频降级；写操作与 MSE 流式见"不做清单"。

## 核心决策

- **读取路径收口**：`FileModel.handle` 泛化为 `FileSystemFileHandle | WebDavRef`，新增 `readFileAsFile(ref)` / `refUrl(ref)` 门面（`lib/fs/ref.ts`）；ThumbCache / useFileUrl / fillImageSizes 切门面，本地路径行为零变化
- **远程域独立**：store 新增 `remote` 状态域（连接列表 + 活动连接 + 远程路径链），不把远程硬塞进 handle 形态的 `dirChain`；画廊与大图查看器只消费 FileModel，天然共享
- **协议层**：`lib/webdav/client.ts`，PROPFIND `Depth:1` 逐层列举（不依赖 `Depth: infinity` 扩展），DOMParser 解 XML，GET 走 fetch→blob
- **连接管理**：IDB 存连接配置（名称 / URL / 用户名 / 密码可选记住），明文存储风险在 UI 显式警告、默认不记密码
- **缓存键**：远程 dirKey = 规范化 URL（主机小写 + 解码路径）；ThumbCache / previewCache / 视频记忆位置全部沿用现有机制
- **视频降级**：无认证连接直连 URL 播放（服务器 Range 即可 seek）；带认证连接 UI 明确标注"暂不支持流式"
- **诊断优先**：连接测试把 CORS 拦截 / 混合内容 / 401 / 超时翻译成可读中文；README 列服务器支持矩阵（Nextcloud ✓ / rclone 可配 / 群晖默认 ✗）

## 里程碑

### M1 读取路径收口（~0.5 天）

- [x] 1.1 FileRef 类型 + 门面函数（本地实现，纯搬家）
- [x] 1.2 ThumbCache `decodeScaled` / `useFileUrl` / `fillImageSizes` 切门面
- [x] 1.3 桌面 Web 回归（缩略图/大图/视频/会话恢复）

### M2 WebDAV 协议层（~1 天）

- [x] 2.1 `client.ts`：PROPFIND / GET / Basic 认证 / 连接测试
- [x] 2.2 目录元数据：子目录列举 + hasMedia（兄弟跳转用）+ dirKey 规范化
- [x] 2.3 错误分类与中文诊断文案

### M3 远程浏览集成（~1 天）

- [x] 3.1 store `remote` 域：连接 CRUD + remoteBrowse / navigateToRemote
- [x] 3.2 连接管理器对话框（测试按钮 + 诊断展示）+ 侧边栏远程入口
- [x] 3.3 会话 / 收藏夹容纳远程位置（存 `{connId, path}`，非句柄）
- [x] 3.4 递归模式：远程 BFS（逐层 PROPFIND，深度 4 对齐本地）

**验收**：Nextcloud + rclone 实测连通浏览；图片全管线（缩略图 / 三层大图 / 上万像素无黑块）；重启恢复远程位置；CORS 失败时诊断可读；本地模式回归全绿。

### M4 移动端（~1.5-2 天）

- [x] 4.1 响应式：侧边栏抽屉化、工具栏折叠、连接 UI 移动布局（瀑布流天然自适应，列宽机制现成）
- [x] 4.2 触摸交互：大图双指缩放 / 拖拽 / 滑动切换、长按出菜单
- [x] 4.3 手机视口实测（390×844 模拟：空状态/连接/画廊/抽屉全流程；Android/iOS 真机待日常使用验证）

## 主要风险

| 风险 | 缓解 |
|------|------|
| CORS 命中率低（成品 NAS 默认不带跨域头） | 诊断信息前置；文档给 Nextcloud/rclone/反代配置示例 |
| PROPFIND 方言差异（各服务器 XML 属性不一致） | M2 起用 rclone + Nextcloud 双服务器做测试矩阵 |
| 大目录逐层列举慢 | onProgress 对齐现有进度 UI；缓存目录元数据（会话内） |
| 凭据明文 | 默认不记住 + UI 警告；文档说明仅建议个人设备使用 |

## 不做清单（v1 明确排除）

- MSE / MediaSource 分块流式（救带认证视频，复杂度不成比例）
- Web 端 FTP / SMB / NFS / 自建中继（浏览器做不到或违背纯前端）
- WebDAV 写操作（MOVE/DELETE/MKCOL 协议上可行，v2 廉价跟进）
- 手机本地文件夹（平台无 FS API，one-shot 导入体验割裂）

## 开发环境备忘

- 本地测试无需真 NAS：`rclone serve webdav` 一行起服务，`--user/--pass` 加认证场景
- 与 Tauri 分支的关系：本分支先行落地读取收口（FileRef），Tauri 分支 rebase 后其 `list_dir`/asset 协议作为第三种 FileRef 实现接入，无冲突
