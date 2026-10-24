// 缩略图持久缓存（IndexedDB）。缓存键内含格式版本号，生成逻辑升级后旧记录自动失效

const DB_NAME = 'flowvision-thumbs'
const STORE = 'thumbs'
/** 每写入 N 条触发一次数量清理 */
const PRUNE_AFTER_PUTS = 512
/** 持久缓存保留条数上限（超限按写入时间淘汰最旧的） */
const PRUNE_KEEP = 4000

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
        // 私有模式等场景下静默降级为纯内存缓存
        req.onerror = () => resolve(null)
        req.onblocked = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }
  return dbPromise
}

interface ThumbRecord {
  blob: Blob
  t: number
}

export async function idbGetThumb(key: string): Promise<Blob | null> {
  const db = await openDB()
  if (!db) return null
  return new Promise(resolve => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    tx.oncomplete = () => resolve((req.result as ThumbRecord | undefined)?.blob ?? null)
    tx.onerror = () => resolve(null)
    tx.onabort = () => resolve(null)
  })
}

let putCount = 0

export async function idbPutThumb(key: string, blob: Blob): Promise<void> {
  const db = await openDB()
  if (!db) return
  const ok = await new Promise<boolean>(resolve => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ blob, t: Date.now() } satisfies ThumbRecord, key)
    tx.oncomplete = () => resolve(true)
    // 配额满时放弃写入，缓存尽力而为
    tx.onerror = () => resolve(false)
    tx.onabort = () => resolve(false)
  })
  if (ok && ++putCount % PRUNE_AFTER_PUTS === 0) {
    void idbPrune(PRUNE_KEEP)
  }
}

async function idbPrune(keep: number): Promise<void> {
  const db = await openDB()
  if (!db) return
  const { keys, records } = await new Promise<{ keys: IDBValidKey[]; records: ThumbRecord[] }>(resolve => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const kreq = store.getAllKeys()
    const vreq = store.getAll()
    tx.oncomplete = () => resolve({ keys: kreq.result, records: vreq.result })
    tx.onerror = () => resolve({ keys: [], records: [] })
    tx.onabort = () => resolve({ keys: [], records: [] })
  })
  if (keys.length <= keep) return
  const oldest = keys
    .map((k, i) => ({ k, t: records[i]?.t ?? 0 }))
    .sort((a, b) => a.t - b.t)
    .slice(0, keys.length - keep)
  await new Promise<void>(resolve => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const { k } of oldest) store.delete(k)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
}
