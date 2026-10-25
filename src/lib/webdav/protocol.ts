// WebDAV 协议层：PROPFIND 目录列举 / GET 取文件 / 连接测试与诊断
// 纯 fetch 实现。跨域（CORS）与 HTTPS 由目标服务器负责——诊断函数把
// 常见失败翻译成可读中文，是远程功能可用性的第一道防线

export interface DavAuth {
  user: string
  pass: string
}

export interface DavEntry {
  /** 解码后的条目名 */
  name: string
  /** 绝对 URL（保持服务器返回的编码形态，GET / 下钻直接使用） */
  href: string
  isDir: boolean
  size: number
  lastModified: number
}

export type DavErrorKind =
  | 'auth' | 'forbidden' | 'notfound' | 'notdav'
  | 'cors' | 'mixed' | 'network' | 'server' | 'unknown'

export class DavError extends Error {
  kind: DavErrorKind
  status?: number
  constructor(kind: DavErrorKind, message: string, status?: number) {
    super(message)
    this.kind = kind
    this.status = status
  }
}

const TIMEOUT_MS = 12_000

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(TIMEOUT_MS)
}

/** UTF-8 安全的 Basic 头（btoa 不认非拉丁字符的用户名/密码） */
function basicHeader(auth: DavAuth): string {
  const bytes = new TextEncoder().encode(`${auth.user}:${auth.pass}`)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return `Basic ${btoa(bin)}`
}

export function davHeaders(auth: DavAuth | null, extra?: Record<string, string>): Record<string, string> {
  return auth
    ? { Authorization: basicHeader(auth), ...extra }
    : { ...extra }
}

/** PROPFIND 请求体：只要资源类型 / 大小 / 修改时间 / 显示名 */
const PROPFIND_BODY =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<D:propfind xmlns:D="DAV:">' +
  '<D:prop><D:resourcetype/><D:getcontentlength/><D:getlastmodified/><D:displayname/></D:prop>' +
  '</D:propfind>'

/** XML 命名空间前缀不定（D:/d:/无前缀），一律按 localName 匹配 */
function descendants(root: Element | Document, localName: string): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter(el => el.localName === localName)
}

function textOf(parent: Element, localName: string): string | null {
  const el = descendants(parent, localName)[0]
  const text = el?.textContent?.trim()
  return text || null
}

function decodeSegment(seg: string): string {
  try {
    return decodeURIComponent(seg)
  } catch {
    return seg
  }
}

function entryName(hrefEl: string, display: string | null): string {
  if (display) return display
  const raw = hrefEl.replace(/\/+$/, '')
  const seg = raw.slice(raw.lastIndexOf('/') + 1)
  return decodeSegment(seg)
}

/** 解析 207 multistatus；requestUrl 用于剔除目录自身条目 */
function parseMultistatus(text: string, requestUrl: string): DavEntry[] {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  if (descendants(doc, 'parsererror').length > 0) {
    throw new DavError('notdav', '响应不是合法的 WebDAV 数据（XML 解析失败）')
  }
  let selfPath: string
  try {
    selfPath = new URL(requestUrl).pathname.replace(/\/+$/, '')
  } catch {
    selfPath = requestUrl
  }
  const out: DavEntry[] = []
  for (const resp of descendants(doc, 'response')) {
    const hrefRaw = textOf(resp, 'href')
    if (!hrefRaw) continue
    // href 可能是绝对地址也可能是站内路径，统一解析成绝对 URL
    let href: string
    try {
      href = new URL(hrefRaw, requestUrl).href
    } catch {
      continue
    }
    let path: string
    try {
      path = new URL(href).pathname.replace(/\/+$/, '')
    } catch {
      path = href
    }
    if (path === selfPath) continue // 目录自身
    const resourcetype = descendants(resp, 'resourcetype')[0]
    const isDir = !!resourcetype && descendants(resourcetype, 'collection').length > 0
    const size = parseInt(textOf(resp, 'getcontentlength') ?? '', 10)
    const modifiedRaw = textOf(resp, 'getlastmodified')
    out.push({
      name: entryName(hrefRaw, textOf(resp, 'displayname')),
      href,
      isDir,
      size: Number.isFinite(size) ? size : 0,
      lastModified: modifiedRaw ? Date.parse(modifiedRaw) || 0 : 0,
    })
  }
  return out
}

function statusToError(status: number): DavError {
  if (status === 401) return new DavError('auth', '认证失败：用户名或密码错误（401）', 401)
  if (status === 403) return new DavError('forbidden', '服务器拒绝访问（403）', 403)
  if (status === 404) return new DavError('notfound', '地址不存在（404）', 404)
  if (status === 405) return new DavError('notdav', '该地址不支持 WebDAV（405）', 405)
  return new DavError('server', `服务器错误（${status}）`, status)
}

export interface ListOptions {
  depth?: 0 | 1
  signal?: AbortSignal
}

/** PROPFIND 列举目录（depth 1 含子条目；depth 0 仅探测自身） */
export async function davList(url: string, auth: DavAuth | null, opts?: ListOptions): Promise<DavEntry[]> {
  const res = await fetch(url, {
    method: 'PROPFIND',
    headers: davHeaders(auth, {
      Depth: String(opts?.depth ?? 1),
      'Content-Type': 'application/xml',
    }),
    body: PROPFIND_BODY,
    signal: opts?.signal ?? timeoutSignal(),
  })
  if (!res.ok && res.status !== 207) throw statusToError(res.status)
  const text = await res.text()
  return parseMultistatus(text, url)
}

/** GET 拉取整个文件（缩略图解码 / 带认证直连用） */
export async function davFetchBlob(href: string, auth: DavAuth | null, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(href, { headers: davHeaders(auth), signal: signal ?? timeoutSignal() })
  if (!res.ok) throw statusToError(res.status)
  return res.blob()
}

export interface HeadBlob {
  blob: Blob
  /** true = 服务器支持 Range，返回的是头部片段 */
  partial: boolean
}

/** GET 文件头部（尺寸解析用，Range 避免为读宽高拉全图）。
 *  服务器忽略 Range 返回 200 时退化为完整文件，调用方读头部即可 */
export async function davFetchHead(href: string, auth: DavAuth | null, maxBytes = 262_144): Promise<HeadBlob | null> {
  const res = await fetch(href, {
    headers: davHeaders(auth, { Range: `bytes=0-${maxBytes - 1}` }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok && res.status !== 206) return null
  return { blob: await res.blob(), partial: res.status === 206 }
}

async function probeReachable(url: string): Promise<boolean> {
  // no-cors 拿不到状态码，但能区分「网络可达却被 CORS 拦」与「根本连不上」
  try {
    await fetch(url, { mode: 'no-cors', signal: timeoutSignal() })
    return true
  } catch {
    return false
  }
}

export type DavTestResult = { ok: true } | { ok: false; error: DavError }

/** 连接测试：PROPFIND depth 0 探测，失败时给出分类诊断 */
export async function davTest(url: string, auth: DavAuth | null): Promise<DavTestResult> {
  if (typeof location !== 'undefined'
    && location.protocol === 'https:'
    && url.trim().toLowerCase().startsWith('http://')) {
    return { ok: false, error: new DavError('mixed', '混合内容被拦截：本站是 HTTPS，服务器地址必须也是 https://') }
  }
  try {
    await davList(url, auth, { depth: 0 })
    return { ok: true }
  } catch (err) {
    if (err instanceof DavError) return { ok: false, error: err }
    if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      return { ok: false, error: new DavError('network', '连接超时：检查地址与网络') }
    }
    if (err instanceof TypeError) {
      const reachable = await probeReachable(url)
      return {
        ok: false,
        error: reachable
          ? new DavError('cors', '连接被跨域策略（CORS）拦截：需在服务器上配置 Access-Control-Allow-Origin 等响应头')
          : new DavError('network', '无法连接服务器：检查地址、网络与证书（自签证书不受浏览器信任）'),
      }
    }
    return { ok: false, error: new DavError('unknown', err instanceof Error ? err.message : '未知错误') }
  }
}

/** 连接根地址 + 已解码的目录名链 → 目录 URL */
export function davHrefOf(rootUrl: string, segments: readonly string[]): string {
  const u = new URL(rootUrl)
  const base = u.pathname.replace(/\/+$/, '')
  const enc = segments.map(s => encodeURIComponent(s)).join('/')
  u.pathname = enc ? `${base}/${enc}` : (base || '/')
  return u.href
}

/** 远程目录唯一键（缓存 / 收藏夹 / 视频记忆共用） */
export function remoteDirKey(connId: string, href: string): string {
  try {
    const u = new URL(href)
    return `dav:${connId}:${u.host.toLowerCase()}${u.pathname}`
  } catch {
    return `dav:${connId}:${href}`
  }
}
