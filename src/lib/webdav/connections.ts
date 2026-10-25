// WebDAV 连接注册表：元数据存 IndexedDB（flowvision-dav）。
// 密码默认只放会话内存（明文落盘有 XSS 暴露风险），勾选「记住密码」才持久化，
// UI 必须显式提示这一点
import type { DavAuth } from './protocol'

export interface DavConnection {
  id: string
  name: string
  /** 根地址，如 https://nas:5006/photos */
  url: string
  user: string
  /** 仅 remember=true 时持久化；否则 null */
  pass: string | null
  remember: boolean
}

const DB_NAME = 'flowvision-dav'
const STORE = 'conns'

/** 会话内密码（不落盘）：优先于持久化值 */
const sessionPass = new Map<string, string>()

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDB(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise(resolve => {
      try {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) {
            req.result.createObjectStore(STORE, { keyPath: 'id' })
          }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
        req.onblocked = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }
  return dbPromise
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise(resolve => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
}

export async function listConnections(): Promise<DavConnection[]> {
  const db = await openDB()
  if (!db) return []
  return new Promise(resolve => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    tx.oncomplete = () => {
      const items = (req.result as DavConnection[]).filter(i => i && typeof i.id === 'string')
      resolve(items.sort((a, b) => a.name.localeCompare(b.name, 'zh')))
    }
    tx.onerror = () => resolve([])
    tx.onabort = () => resolve([])
  })
}

export async function getConnection(id: string): Promise<DavConnection | null> {
  const db = await openDB()
  if (!db) return null
  return new Promise(resolve => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    tx.oncomplete = () => resolve((req.result as DavConnection | undefined) ?? null)
    tx.onerror = () => resolve(null)
    tx.onabort = () => resolve(null)
  })
}

export async function putConnection(conn: DavConnection): Promise<void> {
  const db = await openDB()
  if (!db) return
  // 不记住密码时绝不把密码写进 IDB
  const clean: DavConnection = { ...conn, pass: conn.remember ? conn.pass : null }
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(clean)
  await txDone(tx)
}

export async function deleteConnection(id: string): Promise<void> {
  const db = await openDB()
  if (!db) return
  sessionPass.delete(id)
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(id)
  await txDone(tx)
}

export function setSessionPass(id: string, pass: string): void {
  sessionPass.set(id, pass)
}

export function clearSessionPass(id: string): void {
  sessionPass.delete(id)
}

/** 有效认证：无用户名 = 匿名（null）；密码取会话内存 → 持久值 */
export function authOf(conn: DavConnection): DavAuth | null {
  if (!conn.user) return null
  return { user: conn.user, pass: sessionPass.get(conn.id) ?? conn.pass ?? '' }
}

/** 有用户名且两处都无密码 → 需要弹输入框 */
export function needsPass(conn: DavConnection): boolean {
  return !!conn.user && !sessionPass.has(conn.id) && !conn.pass
}

export function newConnId(): string {
  return `dav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
