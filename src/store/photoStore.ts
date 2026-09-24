import { create } from 'zustand'
import type { PhotoAsset } from '@/types/album'
import { demoAssets } from '@/data/seed'
import { resolveAssetUrl } from '@/storage/assetResolver'
import { idbModels } from '@/storage/idb'

interface PhotoState {
  assets: PhotoAsset[]
  ready: boolean
  /** 按 id 建索引，渲染时 O(1) 取用 */
  byId: Record<string, PhotoAsset>

  setAssets: (assets: PhotoAsset[]) => void
  addAsset: (asset: PhotoAsset) => void
  addAssets: (assets: PhotoAsset[]) => void
  removeAsset: (photoId: string) => void
  getAsset: (photoId: string) => PhotoAsset | undefined
}

/**
 * 照片素材库。
 *
 * demo 照片走静态资源（url 直接可用），用户上传的照片走
 * 存储层（storageKey）并在渲染时异步解析成 objectURL。
 */
export const usePhotoStore = create<PhotoState>((set, get) => ({
  assets: [],
  byId: {},
  ready: false,

  setAssets: (assets) =>
    set({ assets, byId: Object.fromEntries(assets.map((a) => [a.id, a])), ready: true }),

  addAsset: (asset) =>
    set((state) => ({
      assets: [asset, ...state.assets.filter((a) => a.id !== asset.id)],
      byId: { ...state.byId, [asset.id]: asset },
    })),

  addAssets: (list) =>
    set((state) => {
      const byId = { ...state.byId }
      const incoming: PhotoAsset[] = []
      for (const asset of list) {
        if (byId[asset.id]) continue
        byId[asset.id] = asset
        incoming.push(asset)
      }
      return { assets: [...incoming, ...state.assets], byId }
    }),

  removeAsset: (photoId) =>
    set((state) => {
      const byId = { ...state.byId }
      delete byId[photoId]
      return { assets: state.assets.filter((a) => a.id !== photoId), byId }
    }),

  getAsset: (photoId) => get().byId[photoId],
}))

const PHOTO_META_KEY = 'photos:meta'

/**
 * 初始化素材库：
 *  1. demo 照片永远可用（离线、免存储）；
 *  2. 再读取持久层里用户上传过的照片，重建 PhotoAsset 列表。
 *
 * 元数据读取带超时兜底：与 bootstrapLibrary 同样的原因，
 * 存储层可能永远不返回，但素材库初始化绝不能因此卡住首页。
 */
export async function initPhotoLibrary(): Promise<void> {
  let uploaded: PhotoAsset[] = []
  try {
    uploaded = await Promise.race([
      readPhotoMeta(),
      new Promise<PhotoAsset[]>((resolve) => setTimeout(() => resolve([]), 2500)),
    ])
  } catch {
    uploaded = []
  }

  usePhotoStore.getState().setAssets([...uploaded, ...demoAssets()])

  // 后台预热：把需要 blob 解析的地址提前取好，避免打开编辑器时闪空白
  void Promise.all(uploaded.map((a) => resolveAssetUrl(a)))
}

export async function readPhotoMeta(): Promise<PhotoAsset[]> {
  const raw = await idbModels.get<PhotoAsset[]>(PHOTO_META_KEY)
  return Array.isArray(raw) ? raw : []
}

export async function writePhotoMeta(assets: PhotoAsset[]): Promise<void> {
  await idbModels.set(PHOTO_META_KEY, assets)
}
