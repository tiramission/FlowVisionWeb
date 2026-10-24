// 收藏夹持久化（对标原版 myFavoritesArray）
// FileSystemDirectoryHandle 可结构化克隆存入 IndexedDB，跨会话恢复；
// 恢复的句柄首次使用时需要重新授权（在用户手势中 requestPermission）

export interface FavItem {
  /** dirKey：从根到目录的名字路径 */
  key: string
  name: string
  chain: FileSystemDirectoryHandle[]
}

const DB_NAME = 'flowvision-fav'
const STORE = 'favs'

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDB(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise(resolve => {
      try {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) {
            req.result.createObjectStore(STORE, { keyPath: 'key' })
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

export async function listFavorites(): Promise<FavItem[]> {
  const db = await openDB()
  if (!db) return []
  return new Promise(resolve => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    tx.oncomplete = () => {
      const items = (req.result as FavItem[]).filter(i => Array.isArray(i.chain) && i.chain.length > 0)
      // 收藏按加入顺序展示（getAll 主键序即写入序）
      resolve(items)
    }
    tx.onerror = () => resolve([])
    tx.onabort = () => resolve([])
  })
}

export async function addFavorite(item: FavItem): Promise<void> {
  const db = await openDB()
  if (!db) return
  await new Promise<void>(resolve => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(item)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
}

export async function removeFavorite(key: string): Promise<void> {
  const db = await openDB()
  if (!db) return
  await new Promise<void>(resolve => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
}
