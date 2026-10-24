import type { FileModel } from '@/types'

export const PINYIN_READY_EVENT = 'fv-pinyin-ready'

/** 拼音转换（pinyin-pro 按需加载，字典较大不打入首屏） */
let py: { full: (s: string) => string; first: (s: string) => string } | null = null

export function warmupPinyin(): void {
  if (py) return
  void import('pinyin-pro').then(m => {
    // pinyin-pro 默认在字间输出空格（"feng jing"），去掉空格才能子串匹配
    py = {
      full: s => m.pinyin(s, { toneType: 'none', v: true, nonZh: 'consecutive' }).replace(/\s+/g, ''),
      first: s => m.pinyin(s, { pattern: 'first', toneType: 'none', nonZh: 'consecutive' }).replace(/\s+/g, ''),
    }
    window.dispatchEvent(new Event(PINYIN_READY_EVENT))
  })
}

const CJK = /[\u4e00-\u9fff]/
/** 文件名 → 拼音键缓存（全拼/首字母），目录大时避免每次按键重复转换 */
const memo = new Map<string, { full: string; first: string }>()

function pinyinKeys(fileName: string): { full: string; first: string } | null {
  if (!py || !CJK.test(fileName)) return null
  let keys = memo.get(fileName)
  if (!keys) {
    if (memo.size > 5000) memo.clear()
    const stem = fileName.replace(/\.[^.]+$/, '')
    keys = { full: py.full(stem).toLowerCase(), first: py.first(stem).toLowerCase() }
    memo.set(fileName, keys)
  }
  return keys
}

/**
 * 单文件名匹配：子串（忽略大小写）→ 正则模式 → 拼音全拼/首字母
 * （对标原版 useQuickSearch / forceUseRegex / usePinyinSearch / usePinyinInitialSearch，
 * Web 版自动启用拼音匹配）
 */
export function isSearchMatch(fileName: string, query: string, regexMode: boolean): boolean {
  if (!query) return true
  if (regexMode) {
    try {
      return new RegExp(query, 'i').test(fileName)
    } catch {
      return false // 非法正则按不匹配处理
    }
  }
  const q = query.toLowerCase()
  if (fileName.toLowerCase().includes(q)) return true
  const keys = pinyinKeys(fileName)
  if (keys && (keys.full.includes(q) || keys.first.includes(q))) return true
  return false
}

export function filterFiles(files: FileModel[], query: string, regexMode: boolean): FileModel[] {
  if (!query) return files
  return files.filter(f => isSearchMatch(f.name, query, regexMode))
}
