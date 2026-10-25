// 最近打开的文件夹（本地）：按根目录去重，记录每个根的最后浏览位置，
// 句柄链存 IndexedDB 跨会话恢复（同收藏夹/会话恢复机制）；
// 跳转时句柄需在用户手势中重新授权

export interface RecentItem {
  /** 完整目录链键（dirKey）：同根导航到子目录后键变化，条目按根去重整体替换 */
  key: string
  /** 根目录名 */
  name: string
  /** 最后所在的目录名（根级浏览时与 name 相同） */
  subName: string
  chain: FileSystemDirectoryHandle[]
  /** 最后访问时间戳 */
  at: number
}

const DB_NAME = 'flowvision-recents'
const STORE = 'recents'
const KEY = 'list'
const MAX_ITEMS = 8

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDB(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise(resolve => {
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
  return dbPromise
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise(resolve => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
}

export async function loadRecents(): Promise<RecentItem[]> {
  const db = await openDB()
  if (!db) return []
  return new Promise(resolve => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(KEY)
    tx.oncomplete = () => {
      const items = req.result as RecentItem[] | undefined
      resolve(Array.isArray(items) ? items.filter(i => Array.isArray(i.chain) && i.chain.length > 0) : [])
    }
    tx.onerror = () => resolve([])
    tx.onabort = () => resolve([])
  })
}

export async function saveRecents(items: readonly RecentItem[]): Promise<void> {
  const db = await openDB()
  if (!db) return
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put([...items], KEY)
  await txDone(tx)
}

async function sameRoot(a: FileSystemDirectoryHandle | undefined, b: FileSystemDirectoryHandle | undefined): Promise<boolean> {
  if (!a || !b) return false
  try {
    return await a.isSameEntry(b)
  } catch {
    return false
  }
}

/** 记录/更新一条：同根目录（isSameEntry 判定）只保留最新位置并置顶，返回新列表 */
export async function pushRecent(chain: readonly FileSystemDirectoryHandle[], dirKeyStr: string): Promise<RecentItem[]> {
  if (chain.length === 0) return loadRecents()
  const root = chain[0]
  const items = await loadRecents()
  const kept: RecentItem[] = []
  for (const it of items) {
    if (await sameRoot(it.chain[0], root)) continue
    kept.push(it)
  }
  kept.unshift({
    key: dirKeyStr,
    name: root.name,
    subName: chain[chain.length - 1].name,
    chain: [...chain],
    at: Date.now(),
  })
  const next = kept.slice(0, MAX_ITEMS)
  await saveRecents(next)
  return next
}

export async function removeRecent(key: string): Promise<RecentItem[]> {
  const items = (await loadRecents()).filter(i => i.key !== key)
  await saveRecents(items)
  return items
}
