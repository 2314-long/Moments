import { useEffect, useState } from 'react'
import type { PhotoAsset } from '@/types/album'
import { peekAssetUrl, resolveAssetUrl, subscribeAssets } from '@/storage/assetResolver'
import { usePhotoStore } from '@/store/photoStore'

/**
 * 把 PhotoAsset 解析成可渲染的地址。
 *
 * demo 照片直接返回静态路径；用户上传的照片需要从 IndexedDB
 * 取出 Blob 并生成 objectURL，因此要异步等待。
 */
export function usePhotoUrl(photoId: string | undefined): {
  url: string | null
  asset: PhotoAsset | undefined
  loading: boolean
} {
  const asset = usePhotoStore((state) => (photoId ? state.byId[photoId] : undefined))
  const [url, setUrl] = useState<string | null>(() => peekAssetUrl(asset))

  useEffect(() => {
    if (!asset) {
      setUrl(null)
      return
    }
    const cached = peekAssetUrl(asset)
    if (cached) {
      setUrl(cached)
      return
    }
    let cancelled = false
    void resolveAssetUrl(asset).then((resolved) => {
      if (!cancelled) setUrl(resolved)
    })
    return () => {
      cancelled = true
    }
  }, [asset])

  // 存储层解析完成后会广播，这里同步刷新
  useEffect(() => {
    if (!asset?.storageKey) return
    return subscribeAssets(() => {
      const next = peekAssetUrl(asset)
      if (next) setUrl(next)
    })
  }, [asset])

  return { url, asset, loading: Boolean(asset) && !url }
}

/**
 * 预解析一批照片的地址。
 *
 * 为什么需要它：翻页时同一页会短暂地出现两份 DOM（正在翻动的纸叶 + 纸叶下方的
 * 静止页）。第二份是**重新挂载**的，而照片地址是异步解析的 —— 如果解析还没完成，
 * 那一份就会先渲染成灰色占位图，于是翻页时照片会闪一下。
 *
 * 解决办法不是在渲染时补救，而是**在打开阅读器之前**就把所有地址解析好：
 * 之后无论挂载多少个副本，都能在首次渲染的同一帧里直接拿到地址。
 */
export function preloadPhotoUrls(assets: PhotoAsset[]): Promise<void> {
  return Promise.all(assets.map((asset) => resolveAssetUrl(asset))).then(() => undefined)
}

/**
 * 等待一批照片的地址就绪。
 *
 * 只等待「地址解析」完成（可以在首帧直接渲染 <img>），
 * 不等浏览器解码 —— 解码由浏览器流水线处理，不需要这里操心。
 */
export function usePhotosReady(assets: PhotoAsset[]): boolean {
  const [ready, setReady] = useState(() =>
    assets.every((asset) => !asset.storageKey || peekAssetUrl(asset) !== null),
  )
  const key = `${assets.length}:${assets[0]?.id ?? ''}:${assets[assets.length - 1]?.id ?? ''}`

  useEffect(() => {
    if (ready) return
    let cancelled = false
    void preloadPhotoUrls(assets).then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
    // key 已经概括了 assets 的身份，避免依赖每次新建的数组本身
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key])

  return ready
}
