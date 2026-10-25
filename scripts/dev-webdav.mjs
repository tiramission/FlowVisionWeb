// 开发用最小 WebDAV 服务器：PROPFIND / GET(Range) / Basic 认证 / 全开放 CORS
// 用法：node scripts/dev-webdav.mjs <rootDir> [port] [--user u --pass p]
// 供 WebDAV 远程浏览功能本地联调（无需真实 NAS）
import { createServer } from 'node:http'
import { readFile, stat, readdir } from 'node:fs/promises'
import { join, normalize, resolve, sep } from 'node:path'

const args = process.argv.slice(2)
const rootArg = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a)) ?? '.'
const port = Number(args.find(a => /^\d+$/.test(a)) ?? 8099)
const userIdx = args.indexOf('--user')
const passIdx = args.indexOf('--pass')
const USER = userIdx >= 0 ? args[userIdx + 1] : undefined
const PASS = passIdx >= 0 ? args[passIdx + 1] : undefined

const ROOT = resolve(rootArg)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PROPFIND, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Depth, Content-Type, Range',
  'Access-Control-Max-Age': '86400',
}

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif',
  ico: 'image/x-icon', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
}

function xmlEscape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function hrefOf(relPath) {
  // 编码每个路径段（保持 '/' ），与真实服务器行为一致
  return '/' + relPath.split('/').map(encodeURIComponent).join('/')
}

function authenticated(req) {
  if (USER === undefined) return true
  const h = req.headers.authorization ?? ''
  if (!h.startsWith('Basic ')) return false
  const expect = Buffer.from(`${USER}:${PASS}`).toString('base64')
  return h.slice(6) === expect
}

async function resolvePath(urlPath) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const rootNorm = ROOT.replace(/[\\/]+$/, '')
  // resolve 识别绝对路径并消除 ..，统一去尾分隔符后再做根内校验
  const full = resolve(ROOT, '.' + decoded.replace(/[\\/]+$/, '')).replace(/[\\/]+$/, '')
  if (full !== rootNorm && !full.startsWith(rootNorm + sep)) return null
  return full
}

async function propfindEntry(relPath, name, isDir, size, mtime) {
  const mod = new Date(mtime).toUTCString()
  return (
    '<D:response>' +
    `<D:href>${xmlEscape(hrefOf(relPath))}</D:href>` +
    '<D:propstat><D:prop>' +
    `<D:displayname>${xmlEscape(name)}</D:displayname>` +
    '<D:resourcetype>' + (isDir ? '<D:collection/>' : '') + '</D:resourcetype>' +
    (isDir ? '' : `<D:getcontentlength>${size}</D:getcontentlength>`) +
    `<D:getlastmodified>${mod}</D:getlastmodified>` +
    '</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>' +
    '</D:response>'
  )
}

async function handlePropfind(req, res, urlPath) {
  const full = await resolvePath(urlPath)
  if (!full) { res.writeHead(404, CORS); res.end(); return }
  let st
  try {
    st = await stat(full)
  } catch {
    res.writeHead(404, CORS); res.end(); return
  }
  if (!st.isDirectory()) { res.writeHead(405, CORS); res.end(); return }

  const relRoot = full === ROOT.replace(/[\\/]+$/, '') ? '' : full.slice(ROOT.replace(/[\\/]+$/, '').length).replace(/\\/g, '/').replace(/^\//, '')
  const parts = []
  const selfName = relRoot === '' ? (rootArg.replace(/\\/g, '/')) : relRoot.split('/').pop()
  parts.push(await propfindEntry(relRoot, selfName, true, 0, st.mtimeMs))

  const depth = String(req.headers.depth ?? '1')
  if (depth !== '0') {
    const entries = await readdir(full, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name, 'zh', { numeric: true }))
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const childRel = relRoot === '' ? e.name : `${relRoot}/${e.name}`
      if (e.isDirectory()) {
        const cst = await stat(join(full, e.name))
        parts.push(await propfindEntry(childRel, e.name, true, 0, cst.mtimeMs))
      } else if (e.isFile()) {
        const cst = await stat(join(full, e.name))
        parts.push(await propfindEntry(childRel, e.name, false, cst.size, cst.mtimeMs))
      }
    }
  }

  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<D:multistatus xmlns:D="DAV:">' + parts.join('') + '</D:multistatus>'
  res.writeHead(207, { ...CORS, 'Content-Type': 'application/xml; charset=utf-8' })
  res.end(body)
}

async function handleGet(req, res, urlPath) {
  const full = await resolvePath(urlPath)
  if (!full) { res.writeHead(404, CORS); res.end(); return }
  let st
  try {
    st = await stat(full)
  } catch {
    res.writeHead(404, CORS); res.end(); return
  }
  if (st.isDirectory()) { res.writeHead(405, CORS); res.end(); return }

  const buf = await readFile(full)
  const ext = full.slice(full.lastIndexOf('.') + 1).toLowerCase()
  const type = MIME[ext] ?? 'application/octet-stream'
  const range = req.headers.range
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null
  if (m) {
    const start = m[1] === '' ? 0 : Number(m[1])
    const end = m[2] === '' ? Math.min(buf.length - 1, start + 262_143) : Math.min(Number(m[2]), buf.length - 1)
    const slice = buf.subarray(start, end + 1)
    res.writeHead(206, {
      ...CORS,
      'Content-Type': type,
      'Content-Length': slice.length,
      'Content-Range': `bytes ${start}-${end}/${buf.length}`,
      'Accept-Ranges': 'bytes',
    })
    res.end(slice)
    return
  }
  res.writeHead(200, {
    ...CORS,
    'Content-Type': type,
    'Content-Length': buf.length,
    'Accept-Ranges': 'bytes',
  })
  res.end(buf)
}

const server = createServer((req, res) => {
  const urlPath = (req.url ?? '/').split('?')[0].replace(/\/+$/, '') || '/'
  Promise.resolve().then(async () => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...CORS, Allow: 'GET, PROPFIND, OPTIONS' })
      res.end()
      return
    }
    if (!authenticated(req)) {
      res.writeHead(401, { ...CORS, 'WWW-Authenticate': 'Basic realm="fv-dev"' })
      res.end()
      return
    }
    if (req.method === 'PROPFIND') {
      req.on('data', () => {}) // 丢弃请求体
      await new Promise(r => req.on('end', r))
      await handlePropfind(req, res, urlPath)
      return
    }
    if (req.method === 'GET') {
      await handleGet(req, res, urlPath)
      return
    }
    res.writeHead(405, CORS)
    res.end()
  }).catch(err => {
    console.error(err)
    if (!res.headersSent) res.writeHead(500, CORS)
    res.end()
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`dev WebDAV: http://127.0.0.1:${port}/  root=${ROOT}  auth=${USER ? `${USER}:***` : '匿名'}`)
})
