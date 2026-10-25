// 文件引用门面：FileModel.handle 的统一读取入口。
// 本地 = FileSystemFileHandle（FS API）；远程 = WebDAV 引用（fetch 拉取）。
// ThumbCache / Viewer / 尺寸解析只 import 这里，不感知来源
import { authOf, getConnection } from '@/lib/webdav/connections'
import { davFetchBlob, davFetchHead, davHeaders } from '@/lib/webdav/protocol'

export interface WebDavRef {
  __webdav: true
  connId: string
  /** 完整 URL（保持服务器返回的编码形态） */
  href: string
  name: string
}

export type FileRef = FileSystemFileHandle | WebDavRef

export function isWebDavRef(ref: unknown): ref is WebDavRef {
  return typeof ref === 'object' && ref !== null && (ref as { __webdav?: boolean }).__webdav === true
}

async function authOfConnId(connId: string) {
  const conn = await getConnection(connId)
  return conn ? authOf(conn) : null
}

/** 读取整个文件（缩略图解码 / 大图 / 通用） */
export async function readFileAsFile(ref: FileRef): Promise<File> {
  if (!isWebDavRef(ref)) return ref.getFile()
  const auth = await authOfConnId(ref.connId)
  const blob = await davFetchBlob(ref.href, auth)
  return new File([blob], ref.name, { type: blob.type })
}

export interface RefUrl {
  url: string
  revoke: () => void
}

/** 引用 → 可展示 URL。
 *  本地与带认证远程 = blob URL（必须 revoke）；无认证远程 = 直连 href
 *  （<video> 可流式播放/seek，revoke 为空操作） */
export async function refUrl(ref: FileRef): Promise<RefUrl> {
  if (!isWebDavRef(ref)) {
    const file = await ref.getFile()
    const url = URL.createObjectURL(file)
    return { url, revoke: () => URL.revokeObjectURL(url) }
  }
  const auth = await authOfConnId(ref.connId)
  if (!auth) return { url: ref.href, revoke: () => {} }
  const blob = await davFetchBlob(ref.href, auth)
  const url = URL.createObjectURL(blob)
  return { url, revoke: () => URL.revokeObjectURL(url) }
}

/** 读取文件头部（尺寸解析用）：本地零成本；远程走 Range 避免为读宽高拉全图。
 *  返回 null 表示调用方应回退 readFileAsFile */
export async function readFileHead(ref: FileRef, maxBytes = 262_144): Promise<Blob | null> {
  if (!isWebDavRef(ref)) {
    const file = await ref.getFile()
    return file.size <= maxBytes ? file : file.slice(0, maxBytes)
  }
  const auth = await authOfConnId(ref.connId)
  const head = await davFetchHead(ref.href, auth, maxBytes)
  return head?.blob ?? null
}

export { davHeaders }
