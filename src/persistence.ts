import type { Album } from '@/types/album'
import { createMemoryStorage, getStorage, setStorage } from '@/storage/storage'
import { SEED_ALBUM_ID, createSeedAlbums, useLibraryStore } from '@/store/libraryStore'
import { initPhotoLibrary } from '@/store/photoStore'

/** IndexedDB 探测超时：超过这个时间就认为不可用，回退到内存存储 */
const STORAGE_PROBE_TIMEOUT = 2500

/**
 * 持久化编排。
 *
 * 设计取舍：
 *  - 图书馆 store 是唯一数据源，所有保存都经过 persistAlbum；
 *  - 编辑器持有草稿副本，保存时把草稿 upsert 回图书馆并落盘；
 *  - 落盘采用「整体覆盖」策略：demo 规模（几十本册子、几千个元素）
 *    下一次 IndexedDB 写入远快于做增量 diff 的复杂度；
 *  - 未来换成 S3/数据库时，只需要替换 getStorage() 的实现。
 */

let saveQueue: Promise<void> = Promise.resolve()

/** 串行化写入，避免快速连续保存导致互相覆盖 */
function enqueue(task: () => Promise<void>): Promise<void> {
  saveQueue = saveQueue.then(task, task)
  return saveQueue
}

export async function bootstrapLibrary(): Promise<void> {
  const library = useLibraryStore.getState()

  try {
    // 先探测存储是否可用。这一步必须带超时 —— 在某些环境里
    // IndexedDB 的 open 请求会永远挂着，不能让它拖死启动流程。
    // 注意：界面此时已经用 demo 数据渲染出来了，这里只做同步与替换。
    const adapter = getStorage()
    const persistent = await (adapter.probe
      ? adapter.probe(STORAGE_PROBE_TIMEOUT)
      : adapter.isPersistent().catch(() => false))

    if (!persistent) {
      // 回退到内存存储：功能全部可用，只是关掉标签页后不保留
      setStorage(createMemoryStorage())
    }

    const storage = getStorage()
    const albums = await storage.models.load()

    if (albums.length) {
      // 回访用户：用真实存档替换掉启动时的 demo 数据
      library.setAlbums(albums)
    } else {
      // 首次运行：把当前展示的 demo 纪念册落盘，保证下次打开还能看到
      await storage.models.save(library.albums)
    }

    library.setReady(true, !persistent)
  } catch (error) {
    console.error('[时光册] 加载存档失败，保留内置 demo 数据', error)
    setStorage(createMemoryStorage())
    library.setReady(true, true)
  }

  // 素材库独立初始化，不阻塞任何渲染
  void initPhotoLibrary()
}

/** 保存一本纪念册（先更新内存，再串行落盘） */
export async function persistAlbum(album: Album): Promise<void> {
  const library = useLibraryStore.getState()
  const next = library.albums.some((a) => a.id === album.id)
    ? library.albums.map((a) => (a.id === album.id ? album : a))
    : [album, ...library.albums]

  library.setAlbums(next)
  await enqueue(() => getStorage().models.save(next))
}

/** 删除一本纪念册 */
export async function deleteAlbum(albumId: string): Promise<void> {
  const library = useLibraryStore.getState()
  const next = library.albums.filter((a) => a.id !== albumId)
  library.setAlbums(next)
  await enqueue(() => getStorage().models.save(next))
}

/**
 * 重置 demo 纪念册。
 *
 * 只重建 demo 那一本，用户自己创建的纪念册不受影响
 * （设置面板里就是这么向用户承诺的）。
 */
export async function resetLibrary(): Promise<void> {
  const [demo] = createSeedAlbums()
  const library = useLibraryStore.getState()

  const exists = library.albums.some((album) => album.id === SEED_ALBUM_ID)
  const next = exists
    ? library.albums.map((album) => (album.id === SEED_ALBUM_ID ? demo : album))
    : [...library.albums, demo]

  library.setAlbums(next)
  await enqueue(() => getStorage().models.save(next))
}
