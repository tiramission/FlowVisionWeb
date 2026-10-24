import { useEffect, useState } from 'react'
import { thumbCache } from '@/lib/thumb/cache'
import type { FileModel } from '@/types'

export interface ThumbState {
  url: string | null
  /** 生成失败（解码不了的文件），调用方应回退原图直连 */
  failed: boolean
}

/** 订阅缩略图缓存；内存命中同步返回，否则等生成/持久缓存读取 */
export function useThumbUrl(file: FileModel | null): ThumbState {
  const [state, setState] = useState<ThumbState>({ url: null, failed: false })

  useEffect(() => {
    if (!file || file.type !== 'image') {
      setState({ url: null, failed: false })
      return
    }
    let active = true
    const release = thumbCache.acquire(file, url => {
      if (active) setState(url ? { url, failed: false } : { url: null, failed: true })
    })
    return () => {
      active = false
      release()
    }
  }, [file])

  return state
}
