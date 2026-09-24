import { create } from 'zustand'
import type { Album } from '@/types/album'
import { createDemoAlbum } from '@/data/seed'

/** demo 纪念册的固定 id，便于真实存档加载后精确替换掉它 */
export const SEED_ALBUM_ID = 'alb_demo_jiuzhaigou'

/**
 * 同步生成一份初始数据。
 *
 * 关键取舍：应用一启动就先渲染「一本完整的 demo 纪念册」，
 * 而不是等存储层返回后再渲染。
 *  - 首次访问：立刻就能看到完整效果，没有白屏等待；
 *  - 回访用户：先看到上次的书架，真实的书单在加载完成后无缝替换。
 * 这样无论存储层（IndexedDB）多慢甚至永远不返回，界面都不会卡在启动页。
 */
export function createSeedAlbums(): Album[] {
  const demo = createDemoAlbum()
  demo.id = SEED_ALBUM_ID
  return [demo]
}

interface LibraryState {
  albums: Album[]
  /** 是否已完成首次从持久层加载 */
  ready: boolean
  /** 上次加载是否使用了内存回退（隐私模式） */
  degraded: boolean

  setAlbums: (albums: Album[]) => void
  setReady: (ready: boolean, degraded?: boolean) => void
  /** 新增或整体替换一本纪念册（保持数组顺序） */
  upsertAlbum: (album: Album) => void
  removeAlbum: (albumId: string) => void
  getAlbum: (albumId: string) => Album | undefined
}

/**
 * 纪念册库。
 *
 * 这里只保存「已保存」的纪念册，是持久化的唯一数据源。
 * 编辑器拥有自己的草稿副本（见 editorStore），这样编辑过程中的
 * 每一步都可以撤销，而不会把未提交的中间状态污染到库里。
 */
export const useLibraryStore = create<LibraryState>((set, get) => ({
  // 先用 demo 数据填充，保证首帧就有内容
  albums: createSeedAlbums(),
  ready: false,
  degraded: false,

  setAlbums: (albums) => set({ albums }),
  setReady: (ready, degraded = false) => set({ ready, degraded }),

  upsertAlbum: (album) =>
    set((state) => {
      const index = state.albums.findIndex((a) => a.id === album.id)
      if (index === -1) return { albums: [album, ...state.albums] }
      const next = state.albums.slice()
      next[index] = album
      return { albums: next }
    }),

  removeAlbum: (albumId) =>
    set((state) => ({ albums: state.albums.filter((a) => a.id !== albumId) })),

  getAlbum: (albumId) => get().albums.find((a) => a.id === albumId),
}))
