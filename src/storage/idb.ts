/**
 * 极简 IndexedDB key-value 封装。
 *
 * 不引入 idb-keyval 这样的依赖，是因为我们只需要 4 个操作，
 * 而且需要自己控制「不支持 IndexedDB 时回退到内存」的行为。
 */

const DB_NAME = 'shiguangce'
const DB_VERSION = 1
const STORE_MODELS = 'models'
const STORE_ASSETS = 'assets'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_MODELS)) db.createObjectStore(STORE_MODELS)
      if (!db.objectStoreNames.contains(STORE_ASSETS)) db.createObjectStore(STORE_ASSETS)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onblocked = () => reject(new Error('IndexedDB blocked'))
  })
  return dbPromise
}

async function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const req = fn(tx.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

/** 内存回退，保证在隐私模式等场景下应用仍然可用（只是不持久） */
const memoryModels = new Map<string, unknown>()
const memoryAssets = new Map<string, Blob>()
let idbAvailable: boolean | null = null

export async function isPersistent(): Promise<boolean> {
  if (idbAvailable !== null) return idbAvailable
  try {
    await openDb()
    idbAvailable = true
  } catch {
    idbAvailable = false
  }
  return idbAvailable
}

export const idbModels = {
  async get<T>(key: string): Promise<T | undefined> {
    if (!(await isPersistent())) return memoryModels.get(key) as T | undefined
    return (await withStore<T | undefined>(STORE_MODELS, 'readonly', (s) => s.get(key))) ?? undefined
  },
  async set(key: string, value: unknown): Promise<void> {
    if (!(await isPersistent())) {
      memoryModels.set(key, value)
      return
    }
    await withStore(STORE_MODELS, 'readwrite', (s) => s.put(value, key))
  },
  async del(key: string): Promise<void> {
    if (!(await isPersistent())) {
      memoryModels.delete(key)
      return
    }
    await withStore(STORE_MODELS, 'readwrite', (s) => s.delete(key))
  },
  async keys(): Promise<string[]> {
    if (!(await isPersistent())) return [...memoryModels.keys()]
    const keys = await withStore<IDBValidKey[]>(STORE_MODELS, 'readonly', (s) => s.getAllKeys())
    return keys.map(String)
  },
}

export const idbAssets = {
  async get(key: string): Promise<Blob | undefined> {
    if (!(await isPersistent())) return memoryAssets.get(key)
    return (await withStore<Blob | undefined>(STORE_ASSETS, 'readonly', (s) => s.get(key))) ?? undefined
  },
  async set(key: string, blob: Blob): Promise<void> {
    if (!(await isPersistent())) {
      memoryAssets.set(key, blob)
      return
    }
    await withStore(STORE_ASSETS, 'readwrite', (s) => s.put(blob, key))
  },
  async del(key: string): Promise<void> {
    if (!(await isPersistent())) {
      memoryAssets.delete(key)
      return
    }
    await withStore(STORE_ASSETS, 'readwrite', (s) => s.delete(key))
  },
  async keys(): Promise<string[]> {
    if (!(await isPersistent())) return [...memoryAssets.keys()]
    const keys = await withStore<IDBValidKey[]>(STORE_ASSETS, 'readonly', (s) => s.getAllKeys())
    return keys.map(String)
  },
}
