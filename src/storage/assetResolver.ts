/**
 * 照片地址解析。
 *
 * PhotoAsset 里保存的是「引用」，不是可直接渲染的地址：
 *   - storageKey 存在时 → 需要从存储层取出 Blob 并生成 objectURL
 *   - 否则 → 直接使用 asset.url（demo 静态资源 / 远程 CDN）
 *
 * 解析结果会被缓存，并通过订阅通知 React 重新渲染，
 * 这样元素渲染层可以保持同步、纯粹。
 */

import type { PhotoAsset } from '@/types/album'
import { getStorage } from './storage'

const urlCache = new Map<string, string>()
const pending = new Map<string, Promise<string | null>>()
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function subscribeAssets(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 同步取缓存，未解析时返回 null */
export function peekAssetUrl(asset: PhotoAsset | undefined): string | null {
  if (!asset) return null
  if (!asset.storageKey) return asset.url || null
  return urlCache.get(asset.storageKey) ?? null
}

/** 异步解析（幂等，重复调用共享同一个 Promise） */
export function resolveAssetUrl(asset: PhotoAsset): Promise<string | null> {
  if (!asset.storageKey) return Promise.resolve(asset.url || null)
  const cached = urlCache.get(asset.storageKey)
  if (cached) return Promise.resolve(cached)
  const inflight = pending.get(asset.storageKey)
  if (inflight) return inflight

  const task = (async () => {
    try {
      const blob = await getStorage().assets.get(asset.storageKey as string)
      if (!blob) return null
      const objectUrl = URL.createObjectURL(blob)
      urlCache.set(asset.storageKey as string, objectUrl)
      notify()
      return objectUrl
    } catch {
      return null
    } finally {
      pending.delete(asset.storageKey as string)
    }
  })()

  pending.set(asset.storageKey, task)
  return task
}

/** 上传完成后立刻把地址灌进缓存，避免解引用时闪一下空白 */
export function primeAssetUrl(storageKey: string, url: string): void {
  urlCache.set(storageKey, url)
  notify()
}

export function forgetAssetUrl(storageKey: string): void {
  const url = urlCache.get(storageKey)
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
  urlCache.delete(storageKey)
  notify()
}

/** 一次性解析多张照片（素材库用） */
export async function resolveMany(assets: PhotoAsset[]): Promise<void> {
  await Promise.all(assets.map((a) => resolveAssetUrl(a)))
}
