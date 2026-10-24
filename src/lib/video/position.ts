// 视频播放位置记忆（对标原版 videoPlayRememberPosition）
// 键为「目录链 + 相对路径 + 文件大小 + 修改时间」，文件变更自动失效

const POS_KEY = 'fv-video-pos'
/** 最多保留条数，超出按写入序淘汰 */
const MAX_ENTRIES = 300

type PosMap = Record<string, number>

function loadMap(): PosMap {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY) ?? '{}') as PosMap
  } catch {
    return {}
  }
}

function saveMap(m: PosMap): void {
  try {
    const keys = Object.keys(m)
    if (keys.length > MAX_ENTRIES) {
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete m[k]
    }
    localStorage.setItem(POS_KEY, JSON.stringify(m))
  } catch { /* 配额满或隐私模式：位置记忆静默失效 */ }
}

export function getVideoPos(key: string): number {
  const pos = loadMap()[key]
  return typeof pos === 'number' && pos > 0 ? pos : 0
}

export function setVideoPos(key: string, seconds: number): void {
  if (seconds < 3) {
    // 开头几秒不记，避免误标已看
    const m = loadMap()
    if (m[key] !== undefined) {
      delete m[key]
      saveMap(m)
    }
    return
  }
  const m = loadMap()
  delete m[key]
  m[key] = Math.floor(seconds)
  saveMap(m)
}

export function clearVideoPos(key: string): void {
  const m = loadMap()
  if (m[key] !== undefined) {
    delete m[key]
    saveMap(m)
  }
}
