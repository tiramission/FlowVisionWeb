// 上次浏览会话持久化：位置（本地句柄链 / WebDAV 远程目录）存 IndexedDB，
// PWA 重开时恢复（对标原版 openLastFolder）。
// 权限注意：本地句柄在无用户手势时不能弹授权框，由调用方先静默 query、
// 需要授权时经用户点击后再 request；远程位置凭据缺失时同样延迟到点击

export type LastLocation =
  | { kind: 'local'; chain: FileSystemDirectoryHandle[] }
  | { kind: 'remote'; connId: string; segments: string[]; name?: string }

export interface LastSession {
  location: LastLocation | null
}

const DB_NAME = 'flowvision-session'
const STORE = 'session'
const KEY = 'last'

function openDB(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE)
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

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise(resolve => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
}

export async function saveLastSession(location: LastLocation): Promise<void> {
  const db = await openDB()
  if (!db) return
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put({ location } satisfies LastSession, KEY)
  await txDone(tx)
}

export async function loadLastSession(): Promise<LastSession | null> {
  const db = await openDB()
  if (!db) return null
  return new Promise(resolve => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(KEY)
    tx.oncomplete = () => {
      const raw = req.result as Partial<LastSession & { chain?: FileSystemDirectoryHandle[] }> | undefined
      if (!raw) return resolve(null)
      // 兼容 v1 形状 {chain: [...]}
      if (Array.isArray(raw.chain) && raw.chain.length > 0) {
        return resolve({ location: { kind: 'local', chain: raw.chain } })
      }
      const loc = raw.location
      if (loc && (loc.kind === 'local'
        ? Array.isArray(loc.chain) && loc.chain.length > 0
        : typeof loc.connId === 'string' && Array.isArray(loc.segments))) {
        return resolve({ location: loc })
      }
      resolve(null)
    }
    tx.onerror = () => resolve(null)
    tx.onabort = () => resolve(null)
  })
}
