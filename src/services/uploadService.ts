import type { PhotoAsset } from '@/types/album'
import { getStorage } from '@/storage/storage'
import { primeAssetUrl } from '@/storage/assetResolver'
import { inspectFile } from '@/storage/upload'
import { newAssetKey, newPhotoId } from '@/lib/id'
import { usePhotoStore, readPhotoMeta, writePhotoMeta } from '@/store/photoStore'

/**
 * 照片上传管道。
 *
 * 流程：File → 读取尺寸 → 写入 AssetStore(Blob) → 生成 PhotoAsset
 *       → 更新素材库 store → 更新持久化的元数据索引
 *
 * 所有存储访问都通过 StorageAdapter，因此未来把 AssetStore 换成
 * S3 实现时，这个文件不需要修改（put 会返回 publicUrl 而不是本地 key）。
 */

export interface UploadProgress {
  /** 已处理数量 */
  done: number
  /** 总数 */
  total: number
  /** 当前文件名 */
  current: string
}

export interface UploadResult {
  assets: PhotoAsset[]
  failed: Array<{ name: string; reason: string }>
}

export async function uploadPhotos(
  files: File[],
  onProgress?: (progress: UploadProgress) => void,
): Promise<UploadResult> {
  const storage = getStorage()
  const assets: PhotoAsset[] = []
  const failed: UploadResult['failed'] = []
  const total = files.length

  for (let index = 0; index < files.length; index++) {
    const file = files[index]
    onProgress?.({ done: index, total, current: file.name })
    try {
      const inspected = await inspectFile(file)
      const storageKey = newAssetKey()
      const { publicUrl } = await storage.assets.put(storageKey, inspected.blob)

      const asset: PhotoAsset = {
        id: newPhotoId(),
        // 有远程地址就直接用它（S3 场景），否则用本地 objectURL
        url: publicUrl ?? inspected.previewUrl,
        storageKey: publicUrl ? undefined : storageKey,
        source: publicUrl ? 'remote' : 'local',
        name: inspected.name,
        width: inspected.width,
        height: inspected.height,
        size: file.size,
        mimeType: file.type || undefined,
        takenAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
        createdAt: new Date().toISOString(),
      }

      // 立即把地址写入缓存，渲染时无需等待异步解析
      primeAssetUrl(storageKey, asset.url)
      assets.push(asset)
    } catch (error) {
      failed.push({
        name: file.name,
        reason: error instanceof Error ? error.message : '未知错误',
      })
    }
  }

  onProgress?.({ done: total, total, current: '' })

  if (assets.length) {
    usePhotoStore.getState().addAssets(assets)
    // 元数据索引单独落盘，重启后可恢复
    try {
      const existing = await readPhotoMeta()
      const merged = [...assets, ...existing.filter((e) => !assets.some((a) => a.id === e.id))]
      await writePhotoMeta(merged)
    } catch (error) {
      console.warn('[时光册] 照片元数据保存失败', error)
    }
  }

  return { assets, failed }
}

/** 从素材库移除一张照片（同时清理二进制） */
export async function deletePhoto(photoId: string): Promise<void> {
  const store = usePhotoStore.getState()
  const asset = store.byId[photoId]
  if (!asset) return

  if (asset.storageKey) {
    try {
      await getStorage().assets.remove(asset.storageKey)
    } catch {
      /* 二进制已被清理时忽略 */
    }
  }
  store.removeAsset(photoId)

  const remaining = usePhotoStore.getState().assets.filter((a) => a.source !== 'demo')
  try {
    await writePhotoMeta(remaining)
  } catch {
    /* 忽略 */
  }
}
