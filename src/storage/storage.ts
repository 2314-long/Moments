/**
 * 存储抽象层。
 *
 * 目标：让「纪念册数据」与「照片二进制」的存放位置可以整体替换，
 * 而业务代码永远只依赖下面这组接口。
 *
 * 现阶段：
 *   ModelStore → IndexedDB（一个 key 存全部纪念册的 JSON 数组）
 *   AssetStore → IndexedDB（key → Blob）
 *
 * 未来接入对象存储时，只需新增一个 S3Storage 实现：
 *   - saveModels  → PUT metadata.json
 *   - putAsset    → PUT 到 bucket，返回 CDN publicUrl
 *   - loadAsset   → 直接返回 publicUrl，无需下载二进制
 * 然后在这里替换 createBrowserStorage() 的实现即可，其余代码零改动。
 */

import type { Album } from '@/types/album'
import { idbAssets, idbModels, isPersistent } from './idb'

/* ------------------------------------------------------------------ *
 * 接口定义
 * ------------------------------------------------------------------ */

export interface ModelStore {
  /** 读取全部纪念册 */
  load(): Promise<Album[]>
  /** 覆盖保存全部纪念册（demo 规模下最简单可靠） */
  save(albums: Album[]): Promise<void>
  /** 清空 */
  clear(): Promise<void>
}

export interface AssetStore {
  /** 写入一张照片，返回可持久化的 key */
  put(key: string, blob: Blob): Promise<{ key: string; publicUrl?: string }>
  /** 读取照片二进制 */
  get(key: string): Promise<Blob | undefined>
  /** 删除照片 */
  remove(key: string): Promise<void>
  /** 列出所有 key，用于「我的照片素材库」 */
  list(): Promise<string[]>
}

export interface StorageAdapter {
  readonly kind: 'indexeddb' | 's3' | 'memory'
  readonly models: ModelStore
  readonly assets: AssetStore
  /** 该后端是否真正持久（隐私模式下 IndexedDB 不可用时为 false） */
  isPersistent(): Promise<boolean>
  /**
   * 可选：带超时的初始化探测。
   *
   * 某些环境（隐私模式、被策略禁用的渲染器、无头浏览器）里
   * IndexedDB 的 open 请求可能永远不 resolve —— 既不给 success 也不给 error。
   * 如果直接 await，启动流程就会永远卡住。因此由适配器提供一个
   * 「超时即视为不可用」的探测方法，保证应用一定能起来。
   */
  probe?(timeoutMs: number): Promise<boolean>
}

/* ------------------------------------------------------------------ *
 * IndexedDB 实现（当前默认）
 * ------------------------------------------------------------------ */

const MODELS_KEY = 'albums:v1'

class IdbModelStore implements ModelStore {
  async load(): Promise<Album[]> {
    const raw = await idbModels.get<Album[]>(MODELS_KEY)
    return Array.isArray(raw) ? raw : []
  }

  async save(albums: Album[]): Promise<void> {
    await idbModels.set(MODELS_KEY, albums)
  }

  async clear(): Promise<void> {
    await idbModels.del(MODELS_KEY)
  }
}

class IdbAssetStore implements AssetStore {
  async put(key: string, blob: Blob): Promise<{ key: string }> {
    await idbAssets.set(key, blob)
    return { key }
  }

  async get(key: string): Promise<Blob | undefined> {
    return idbAssets.get(key)
  }

  async remove(key: string): Promise<void> {
    await idbAssets.del(key)
  }

  async list(): Promise<string[]> {
    return idbAssets.keys()
  }
}

/* ------------------------------------------------------------------ *
 * 内存实现（隐私模式回退 / 测试）
 * ------------------------------------------------------------------ */

class MemoryModelStore implements ModelStore {
  private data: Album[] = []
  async load() {
    return this.data
  }
  async save(albums: Album[]) {
    this.data = albums
  }
  async clear() {
    this.data = []
  }
}

class MemoryAssetStore implements AssetStore {
  private map = new Map<string, Blob>()
  async put(key: string, blob: Blob) {
    this.map.set(key, blob)
    return { key }
  }
  async get(key: string) {
    return this.map.get(key)
  }
  async remove(key: string) {
    this.map.delete(key)
  }
  async list() {
    return [...this.map.keys()]
  }
}

/* ------------------------------------------------------------------ *
 * S3 适配器骨架 —— 预留接口，接入时填充
 * ------------------------------------------------------------------ */

export interface S3StorageConfig {
  bucket: string
  region: string
  /** 通过后端签发的预签名 URL 上传，避免在浏览器里放密钥 */
  signUpload: (key: string, contentType: string) => Promise<{ url: string; publicUrl: string }>
  /** metadata.json 的读写端点 */
  metadataEndpoint: string
  publicBaseUrl: string
}

export function createS3Storage(_config: S3StorageConfig): StorageAdapter {
  // 故意不实现：真实接入需要后端签发预签名 URL。
  // 这里保留完整的形状，确保未来替换时上层代码不需要改动。
  const notImplemented = (): never => {
    throw new Error(
      'S3 存储尚未接入：请实现 signUpload / metadataEndpoint 后替换 createBrowserStorage()',
    )
  }
  return {
    kind: 's3',
    models: {
      load: notImplemented,
      save: notImplemented,
      clear: notImplemented,
    },
    assets: {
      put: notImplemented,
      get: notImplemented,
      remove: notImplemented,
      list: notImplemented,
    },
    async isPersistent() {
      return true
    },
  }
}

/* ------------------------------------------------------------------ *
 * 单例
 * ------------------------------------------------------------------ */

let adapter: StorageAdapter | null = null

export function createBrowserStorage(): StorageAdapter {
  return {
    kind: 'indexeddb',
    models: new IdbModelStore(),
    assets: new IdbAssetStore(),
    isPersistent,
    async probe(timeoutMs) {
      return Promise.race([
        isPersistent(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
      ])
    },
  }
}

export function getStorage(): StorageAdapter {
  if (!adapter) adapter = createBrowserStorage()
  return adapter
}

export function setStorage(next: StorageAdapter): void {
  adapter = next
}

/** 用于在 IndexedDB 完全不可用时兜底 */
export function createMemoryStorage(): StorageAdapter {
  return {
    kind: 'memory',
    models: new MemoryModelStore(),
    assets: new MemoryAssetStore(),
    async isPersistent() {
      return false
    },
  }
}
