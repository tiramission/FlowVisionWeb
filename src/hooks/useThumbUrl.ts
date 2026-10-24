import { useEffect, useState } from 'react'
import { previewCache, thumbCache, type ThumbCache } from '@/lib/thumb/cache'
import type { FileModel } from '@/types'

export interface ThumbState {
  url: string | null
  /** 生成失败（解码不了的文件），调用方应回退原图直连 */
  failed: boolean
}

/** 订阅缓存条目；内存命中同步返回，否则等生成/持久缓存读取 */
function useCacheUrl(file: FileModel | null, cache: ThumbCache): ThumbState {
  const [state, setState] = useState<ThumbState>({ url: null, failed: false })

  useEffect(() => {
    if (!file || file.type !== 'image') {
      setState({ url: null, failed: false })
      return
    }
    let active = true
    const release = cache.acquire(file, url => {
      if (active) setState(url ? { url, failed: false } : { url: null, failed: true })
    })
    return () => {
      active = false
      release()
    }
  }, [file, cache])

  return state
}

/** 画廊缩略图（768px 档） */
export function useThumbUrl(file: FileModel | null): ThumbState {
  return useCacheUrl(file, thumbCache)
}

/** 大图查看器预览（2560px 档） */
export function usePreviewUrl(file: FileModel | null): ThumbState {
  return useCacheUrl(file, previewCache)
}
