// 浏览器可直接解码的扩展名集合
// 原版 FlowVision 依赖 macOS 图像引擎支持 RAW/PSD/HEIC 等，Web 版这些格式
// 需引入解码库（wasm）后才能支持，MVP 先限定浏览器原生可显示的范围
export const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg', 'ico', 'apng',
])

export const VIDEO_EXTENSIONS = new Set([
  'mp4', 'webm', 'm4v', 'mov', 'ogv',
])

export const FILE_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS])
