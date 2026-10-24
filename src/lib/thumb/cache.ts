import type { FileModel } from '@/types'
import { idbGetThumb, idbPutThumb } from './idb'

/** 缩略图最长边（覆盖最大列宽 384px × 2x DPR） */
export const THUMB_MAX_SIDE = 768
/** 内存缓存字节上限（仅统计生成的小图 blob；对标原版 memUseLimit 的缩略图部分） */
const MEMORY_CAP_BYTES = 64 << 20
/** 内存缓存条目上限（含小图直连的对象 URL 条目） */
const MEMORY_MAX_ENTRIES = 600
/** 生成并发数（对标原版 thumbThreadNum，浏览器侧重解码内存适当调低） */
const CONCURRENCY = 4
/** 滚动方向预加载窗口（对标原版 PRELOAD_THUMB_RANGE_PRE / NEXT） */
export const PRELOAD_PRE = 20
export const PRELOAD_NEXT = 40

const KEY_PREFIX = 'v1'
const WEBP_QUALITY = 0.82

/** 这些类型不生成缩略图：GIF 保留动画，SVG 无法 createImageBitmap，直接引用原文件 */
export const DIRECT_EXTS = new Set(['gif', 'svg'])

export interface ThumbStats {
  memory: number
  active: number
  queued: number
  hits: number
  misses: number
  generated: number
  persistedHits: number
  preloaded: number
  evicted: number
}

interface Entry {
  url: string
  /** 生成的小图 blob 大小；直连原文件的条目记 0（原文件由句柄按需读取，不占缓存内存） */
  bytes: number
}

function cacheKeyOf(f: FileModel): string {
  return `${KEY_PREFIX}:${f.relPath}:${f.size}:${f.lastModified}`
}

/** 解码并缩放到最长边 maxSide，编码为 webp；webp 不可用时返回 null */
async function decodeScaled(file: File, known: { w: number; h: number } | null): Promise<Blob | null> {
  let bmp: ImageBitmap
  if (known && Math.max(known.w, known.h) > THUMB_MAX_SIDE) {
    // 只给一边时浏览器按比例缩放另一边
    const opts: ImageBitmapOptions = known.w >= known.h
      ? { resizeWidth: THUMB_MAX_SIDE, imageOrientation: 'from-image' }
      : { resizeHeight: THUMB_MAX_SIDE, imageOrientation: 'from-image' }
    bmp = await createImageBitmap(file, opts)
  } else {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  }
  try {
    if (bmp.width <= THUMB_MAX_SIDE && bmp.height <= THUMB_MAX_SIDE) {
      // 小图无需缩放重编码，调用方直接引用原文件
      return null
    }
    const scale = THUMB_MAX_SIDE / Math.max(bmp.width, bmp.height)
    const tw = Math.max(1, Math.round(bmp.width * scale))
    const th = Math.max(1, Math.round(bmp.height * scale))
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(tw, th)
      canvas.getContext('2d')!.drawImage(bmp, 0, 0, tw, th)
      try {
        return await canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY })
      } catch {
        return null
      }
    }
    const canvas = document.createElement('canvas')
    canvas.width = tw
    canvas.height = th
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, tw, th)
    return await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/webp', WEBP_QUALITY))
  } finally {
    bmp.close()
  }
}

class ThumbCache {
  /** 插入序即 LRU 序（touch 时 delete+set 移到末尾） */
  private memory = new Map<string, Entry>()
  /** 条目引用计数：可视区挂载中的条目不可淘汰 */
  private refs = new Map<string, number>()
  private inflight = new Map<string, Promise<Entry | null>>()
  private hi: (() => void)[] = []
  private lo: (() => void)[] = []
  private queuedKeys = new Set<string>()
  private activeCount = 0
  private totalBytes = 0
  stats: ThumbStats = {
    memory: 0, active: 0, queued: 0,
    hits: 0, misses: 0, generated: 0, persistedHits: 0, preloaded: 0, evicted: 0,
  }

  /** 订阅一个文件的缩略图；命中内存时同步回调。返回取消引用函数 */
  acquire(f: FileModel, onReady: (url: string | null) => void): () => void {
    const key = cacheKeyOf(f)
    this.refs.set(key, (this.refs.get(key) ?? 0) + 1)
    const entry = this.memory.get(key)
    if (entry) {
      this.memory.delete(key)
      this.memory.set(key, entry)
      this.stats.hits++
      onReady(entry.url)
    } else {
      this.stats.misses++
      void this.ensure(f).then(e => onReady(e ? e.url : null))
    }
    return () => {
      const n = (this.refs.get(key) ?? 1) - 1
      if (n <= 0) this.refs.delete(key)
      else this.refs.set(key, n)
      this.sweep()
    }
  }

  /** 预加载：低优先级生成，滚进可视区时直接命中内存（null 表示生成失败，调用方回退原图） */
  preload(files: readonly FileModel[]): void {
    for (const f of files) {
      if (f.type !== 'image' || !f.handle) continue
      const key = cacheKeyOf(f)
      if (this.memory.has(key) || this.inflight.has(key) || this.queuedKeys.has(key)) continue
      this.queuedKeys.add(key)
      this.lo.push(() => {
        this.queuedKeys.delete(key)
        void this.ensure(f).then(e => {
          if (e) this.stats.preloaded++
        })
      })
    }
    this.pump()
  }

  private ensure(f: FileModel): Promise<Entry | null> {
    const key = cacheKeyOf(f)
    const running = this.inflight.get(key)
    if (running) return running
    const p = new Promise<Entry | null>(resolve => {
      this.hi.push(async () => {
        try {
          const entry = await this.generate(f)
          if (entry) this.setEntry(key, entry)
          resolve(entry)
        } catch {
          resolve(null)
        } finally {
          this.inflight.delete(key)
        }
      })
      this.pump()
    })
    this.inflight.set(key, p)
    return p
  }

  private async generate(f: FileModel): Promise<Entry | null> {
    if (!f.handle) return null
    const key = cacheKeyOf(f)
    const known = f.width && f.height ? { w: f.width, h: f.height } : null
    // 大图先查持久缓存
    if (!known || Math.max(known.w, known.h) > THUMB_MAX_SIDE) {
      const cached = await idbGetThumb(key)
      if (cached) {
        this.stats.persistedHits++
        return { url: URL.createObjectURL(cached), bytes: cached.size }
      }
    }
    const file = await f.handle.getFile()
    try {
      const blob = await decodeScaled(file, known)
      if (blob === null) {
        // 小图或 webp 不可用：直接引用原文件
        return { url: URL.createObjectURL(file), bytes: 0 }
      }
      this.stats.generated++
      void idbPutThumb(key, blob)
      return { url: URL.createObjectURL(blob), bytes: blob.size }
    } catch {
      // 解码失败（损坏文件等）：交由调用方回退
      return null
    }
  }

  private setEntry(key: string, entry: Entry): void {
    this.totalBytes += entry.bytes
    this.memory.set(key, entry)
    this.stats.memory = this.memory.size
    this.sweep()
  }

  /** 内存上限管理：超出字节/条目上限时从最旧开始淘汰未被引用的条目 */
  private sweep(): void {
    if (this.totalBytes <= MEMORY_CAP_BYTES && this.memory.size <= MEMORY_MAX_ENTRIES) return
    for (const [key, entry] of this.memory) {
      if (this.totalBytes <= MEMORY_CAP_BYTES && this.memory.size <= MEMORY_MAX_ENTRIES) break
      if ((this.refs.get(key) ?? 0) > 0) continue
      URL.revokeObjectURL(entry.url)
      this.totalBytes -= entry.bytes
      this.memory.delete(key)
      this.stats.evicted++
    }
    this.stats.memory = this.memory.size
  }

  private pump(): void {
    while (this.activeCount < CONCURRENCY) {
      const task = this.hi.shift() ?? this.lo.shift()
      if (!task) break
      this.activeCount++
      void Promise.resolve(task())
        .catch(() => { /* 任务内部已处理错误 */ })
        .finally(() => {
          this.activeCount--
          this.pump()
        })
    }
    this.stats.active = this.activeCount
    this.stats.queued = this.hi.length + this.lo.length
  }
}

export const thumbCache = new ThumbCache()
