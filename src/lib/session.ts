// 上次浏览会话持久化：目录链句柄存 IndexedDB，PWA 重开时恢复
// （对标原版 openLastFolder）。权限注意：恢复的句柄在无用户手势时
// 不能弹授权框，由调用方先静默 query、需要授权时经用户点击后再 request

export interface LastSession {
  chain: FileSystemDirectoryHandle[]
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

export async function saveLastSession(chain: readonly FileSystemDirectoryHandle[]): Promise<void> {
  const db = await openDB()
  if (!db) return
  await new Promise<void>(resolve => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ chain: [...chain] } satisfies LastSession, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
}

export async function loadLastSession(): Promise<LastSession | null> {
  const db = await openDB()
  if (!db) return null
  return new Promise(resolve => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(KEY)
    tx.oncomplete = () => {
      const s = req.result as LastSession | undefined
      resolve(s && Array.isArray(s.chain) && s.chain.length > 0 ? s : null)
    }
    tx.onerror = () => resolve(null)
    tx.onabort = () => resolve(null)
  })
}

export async function clearLastSession(): Promise<void> {
  const db = await openDB()
  if (!db) return
  await new Promise<void>(resolve => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}
