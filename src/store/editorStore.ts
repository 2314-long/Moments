import { create } from 'zustand'
import type {
  Album,
  AlbumElement,
  GeoPoint,
  Page,
  PageRole,
  PhotoAsset,
  PhotoStyle,
  ArtTextTemplate,
  TextPreset,
} from '@/types/album'
import { FONT_STACK, HISTORY_LIMIT, PAGE_HEIGHT, PAGE_WIDTH, TEXT_PRESETS } from '@/lib/designTokens'
import { defaultPhotoSize } from '@/lib/frame'
import { newElementId, newPageId } from '@/lib/id'
import { pageIndexAfterSheet, pagesForSheet } from '@/lib/bookLayout'
import { STICKER_LIBRARY } from '@/lib/stickerLibrary'
import { deepClone } from '@/lib/utils'

const STICKER_INDEX = new Map(STICKER_LIBRARY.map((s) => [s.id, s]))

/* ------------------------------------------------------------------ *
 * 类型
 * ------------------------------------------------------------------ */

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export interface EditorTransaction {
  /** 事务开始时的相册快照 */
  snapshot: Album
  selection: string[]
  activePageId: string
}

export interface EditorState {
  /* ---- 文档 ---- */
  album: Album | null
  /** 当前编辑页（单页） */
  activePageId: string
  /** 同时可见的对开页（第二个页面 id），null 表示只显示单页 */
  spreadSecondPageId: string | null
  /** 选中的元素 id 列表 */
  selection: string[]
  /** 历史栈（保存「变更前」的快照） */
  past: Array<{ album: Album; selection: string[]; activePageId: string; label: string }>
  future: Array<{ album: Album; selection: string[]; activePageId: string; label: string }>
  /** 正在进行的事务（拖拽 / 输入），只在提交时写入历史 */
  transaction: EditorTransaction | null
  clipboard: AlbumElement[]

  /* ---- 视图 ---- */
  zoom: number
  showGrid: boolean
  showRulers: boolean
  leftPanel: LeftPanel
  rightPanelOpen: boolean
  activePhotoStyle: PhotoStyle
  activeTextPreset: TextPreset

  /* ---- 保存 ---- */
  dirty: boolean
  saveState: SaveState
  lastSavedAt: string | null

  /* ---- 加载 ---- */
  loadAlbum: (album: Album, pageId?: string) => void
  closeAlbum: () => void

  /* ---- 选择 ---- */
  select: (elementIds: string[], additive?: boolean) => void
  clearSelection: () => void
  selectAllOnPage: () => void
  /**
   * 解析「元素要加到哪一页」：优先用调用方指定的页面（拖放落点），
   * 否则用当前激活页。若指定页不是激活页，会顺带把它切为激活页，
   * 保证新建的元素立刻可见。
   */
  resolveTargetPage: (pageId?: string) => string | null

  /* ---- 历史 ---- */
  commit: (label: string, mutator: (album: Album) => void) => void
  beginTransaction: () => void
  commitTransaction: (label: string) => void
  cancelTransaction: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  /* ---- 元素 ---- */
  addElement: (element: AlbumElement, label?: string) => void
  addElements: (elements: AlbumElement[], label?: string) => void
  addPhotoElement: (
    asset: PhotoAsset,
    opts?: { x?: number; y?: number; style?: PhotoStyle; pageId?: string },
  ) => void
  addTextElement: (preset: TextPreset, opts?: { x?: number; y?: number; pageId?: string; text?: string }) => void
  addArtTextElement: (templateId?: ArtTextTemplate, opts?: { x?: number; y?: number; pageId?: string; text?: string }) => void
  addStickerElement: (
    stickerId: string,
    opts?: { x?: number; y?: number; pageId?: string },
  ) => void
  addNoteElement: (opts?: { x?: number; y?: number; pageId?: string }) => void
  addStampElement: (opts?: { x?: number; y?: number; pageId?: string }) => void
  addDateElement: (opts?: { x?: number; y?: number; pageId?: string }) => void
  addMapElement: (opts?: { x?: number; y?: number; pageId?: string; points?: GeoPoint[] }) => void
  updateElements: (
    elementIds: string[],
    updater: (element: AlbumElement) => AlbumElement,
    label: string,
  ) => void
  updateSelected: (updater: (element: AlbumElement) => AlbumElement, label: string) => void
  patchElements: (
    elementIds: string[],
    patch: Record<string, unknown>,
    label: string,
  ) => void
  patchElementData: (elementId: string, patch: Record<string, unknown>, label: string) => void
  removeElements: (elementIds?: string[]) => void
  duplicateElements: (elementIds?: string[]) => void
  /** 把元素从一个页面移动到另一个页面（跨页拖拽），x 会加上 offsetX 换算到新页面坐标系 */
  moveElementToPage: (elementId: string, targetPageId: string, offsetX: number) => void
  copySelection: () => void
  cutSelection: () => void
  paste: () => void
  bringForward: (elementIds?: string[]) => void
  sendBackward: (elementIds?: string[]) => void
  bringToFront: (elementIds?: string[]) => void
  sendToBack: (elementIds?: string[]) => void
  toggleLock: (elementIds?: string[]) => void
  nudge: (dx: number, dy: number) => void

  /* ---- 页面 ---- */
  setActivePage: (pageId: string) => void
  addPage: (opts?: { role?: PageRole; title?: string; afterPageId?: string; template?: Page; background?: Page['background'] }) => void
  duplicatePage: (pageId: string) => void
  removePage: (pageId: string) => void
  movePage: (fromIndex: number, toIndex: number) => void
  updatePage: (pageId: string, patch: Partial<Page>, label: string) => void
  setPageBackground: (pageId: string, background: Page['background'], label: string) => void
  setAlbumMeta: (patch: Partial<Album>, label: string) => void

  /* ---- 视图 ---- */
  setZoom: (zoom: number) => void
  setLeftPanel: (panel: LeftPanel) => void
  toggleRightPanel: () => void
  toggleGrid: () => void
  setActivePhotoStyle: (style: PhotoStyle) => void
  setActiveTextPreset: (preset: TextPreset) => void

  /* ---- 保存状态 ---- */
  markSaving: () => void
  markSaved: () => void
  markError: () => void
}

export type LeftPanel = 'insert' | 'photos' | 'stickers' | 'text' | 'pages' | 'templates' | null

/* ------------------------------------------------------------------ *
 * 不可变更新辅助
 * ------------------------------------------------------------------ */

/** 在指定页面上做不可变更新，未被修改的页面保持同一引用（结构共享） */
/**
 * 对「包含指定元素 id 的那些页面」做不可变更新。
 *
 * 为什么需要它：编辑器同时显示跨页的左右两页，但 `activePageId` 只有一个
 * （永远是左槽，见 EditorPage 的 visiblePages）。若按 activePageId 写回，
 * 用户在**右页**上拖动 / 缩放 / 删除元素时改动会被静默丢弃
 * （找不到元素 → 返回同一引用 → store 返回 {}）。
 * 元素 id 全局唯一，因此这里按 id 反查页面，左右页都能正确落盘。
 */
function withPagesOfElements(
  album: Album,
  elementIds: string[],
  fn: (page: Page, ids: string[]) => Page,
): Album {
  if (!elementIds.length) return album
  const wanted = new Set(elementIds)
  let changed = false
  const pages = album.pages.map((page) => {
    const ids = page.elements.filter((e) => wanted.has(e.id)).map((e) => e.id)
    if (!ids.length) return page
    const next = fn(page, ids)
    if (next !== page) changed = true
    return next
  })
  if (!changed) return album
  return { ...album, pages, updatedAt: new Date().toISOString() }
}

function mapElements(
  page: Page,
  elementIds: string[],
  fn: (element: AlbumElement) => AlbumElement,
): Page {
  const idSet = new Set(elementIds)
  let changed = false
  const elements = page.elements.map((element) => {
    if (!idSet.has(element.id)) return element
    const next = fn(element)
    if (next !== element) changed = true
    return next
  })
  return changed ? { ...page, elements } : page
}

/** 深拷贝元素并重新分配 id，用于复制 / 粘贴 */
function cloneElements(elements: AlbumElement[], offset = 16): AlbumElement[] {
  return elements.map((element) => {
    const copy = deepClone(element)
    copy.id = newElementId()
    copy.x += offset
    copy.y += offset
    return copy
  })
}

function defaultPage(
  album: Album,
  role: PageRole = 'content',
  title?: string,
  background?: Page['background'],
): Page {
  return {
    id: newPageId(),
    title: title ?? `第 ${album.pages.length} 页`,
    role,
    background: background ?? {
      color: '#f7f3ea',
      paper: 'plain',
      vignette: 0.22,
    },
    elements: [],
  }
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

export const useEditorStore = create<EditorState>((set, get) => ({
  album: null,
  activePageId: '',
  spreadSecondPageId: null,
  selection: [],
  past: [],
  future: [],
  transaction: null,
  clipboard: [],

  zoom: 0.72,
  showGrid: false,
  showRulers: false,
  leftPanel: 'insert',
  rightPanelOpen: true,
  activePhotoStyle: 'plain',
  activeTextPreset: 'body',

  dirty: false,
  saveState: 'idle',
  lastSavedAt: null,

  /* ------------------------------------------------------------ 加载 */

  loadAlbum: (album, pageId) =>
    set({
      album,
      activePageId: pageId ?? album.pages[0]?.id ?? '',
      spreadSecondPageId: null,
      selection: [],
      past: [],
      future: [],
      transaction: null,
      clipboard: [],
      dirty: false,
      saveState: 'idle',
      lastSavedAt: null,
      zoom: 0.72,
      leftPanel: 'insert',
    }),

  closeAlbum: () =>
    set({
      album: null,
      activePageId: '',
      spreadSecondPageId: null,
      selection: [],
      past: [],
      future: [],
      transaction: null,
      clipboard: [],
    }),

  /* ------------------------------------------------------------ 选择 */

  select: (elementIds, additive = false) =>
    set((state) => {
      if (!additive) return { selection: elementIds }
      const merged = new Set(state.selection)
      for (const id of elementIds) {
        if (merged.has(id)) merged.delete(id)
        else merged.add(id)
      }
      return { selection: [...merged] }
    }),

  clearSelection: () => set({ selection: [] }),

  selectAllOnPage: () =>
    set((state) => {
      const page = state.album?.pages.find((p) => p.id === state.activePageId)
      if (!page) return {}
      return { selection: page.elements.filter((e) => !e.locked).map((e) => e.id) }
    }),

  resolveTargetPage: (pageId) => {
    const state = get()
    if (!state.album) return null
    const target = pageId ?? state.activePageId
    if (!state.album.pages.some((p) => p.id === target)) return null
    if (target !== state.activePageId) set({ activePageId: target, selection: [] })
    return target
  },

  /* ------------------------------------------------------------ 历史 */

  commit: (label, mutator) =>
    set((state) => {
      if (!state.album) return {}
      const before = state.album
      const draft = deepClone(before)
      mutator(draft)
      const entry = {
        album: before,
        selection: state.selection,
        activePageId: state.activePageId,
        label,
      }
      const past = [...state.past, entry].slice(-HISTORY_LIMIT)
      return {
        album: draft,
        past,
        future: [],
        dirty: true,
        saveState: 'idle',
      }
    }),

  beginTransaction: () =>
    set((state) => {
      if (!state.album || state.transaction) return {}
      return {
        transaction: {
          snapshot: state.album,
          selection: state.selection,
          activePageId: state.activePageId,
        },
      }
    }),

  commitTransaction: (label) =>
    set((state) => {
      const tx = state.transaction
      if (!tx || !state.album) return { transaction: null }
      // 事务期间没有实际改动就不写历史
      if (tx.snapshot === state.album) return { transaction: null }
      const entry = {
        album: tx.snapshot,
        selection: tx.selection,
        activePageId: tx.activePageId,
        label,
      }
      return {
        transaction: null,
        past: [...state.past, entry].slice(-HISTORY_LIMIT),
        future: [],
        dirty: true,
        saveState: 'idle',
      }
    }),

  cancelTransaction: () =>
    set((state) => {
      const tx = state.transaction
      if (!tx) return {}
      return {
        transaction: null,
        album: tx.snapshot,
        selection: tx.selection,
        activePageId: tx.activePageId,
      }
    }),

  undo: () =>
    set((state) => {
      const entry = state.past[state.past.length - 1]
      if (!entry || !state.album) return {}
      const futureEntry = {
        album: state.album,
        selection: state.selection,
        activePageId: state.activePageId,
        label: entry.label,
      }
      return {
        album: entry.album,
        selection: entry.selection,
        activePageId: entry.activePageId,
        past: state.past.slice(0, -1),
        future: [...state.future, futureEntry].slice(-HISTORY_LIMIT),
        dirty: true,
        saveState: 'idle',
      }
    }),

  redo: () =>
    set((state) => {
      const entry = state.future[state.future.length - 1]
      if (!entry || !state.album) return {}
      const pastEntry = {
        album: state.album,
        selection: state.selection,
        activePageId: state.activePageId,
        label: entry.label,
      }
      return {
        album: entry.album,
        selection: entry.selection,
        activePageId: entry.activePageId,
        past: [...state.past, pastEntry].slice(-HISTORY_LIMIT),
        future: state.future.slice(0, -1),
        dirty: true,
        saveState: 'idle',
      }
    }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  /* ------------------------------------------------------------ 元素 */

  addElement: (element, label = '添加元素') => {
    const pageId = get().activePageId
    get().commit(label, (album) => {
      const page = album.pages.find((p) => p.id === pageId)
      if (!page) return
      page.elements.push(element)
    })
    set({ selection: [element.id] })
  },

  addElements: (elements, label = '添加元素') => {
    if (!elements.length) return
    const pageId = get().activePageId
    get().commit(label, (album) => {
      const page = album.pages.find((p) => p.id === pageId)
      if (!page) return
      page.elements.push(...elements)
    })
    set({ selection: elements.map((e) => e.id) })
  },

  addPhotoElement: (asset, opts = {}) => {
    const pageId = get().resolveTargetPage(opts.pageId)
    if (!pageId) return
    const style = opts.style ?? get().activePhotoStyle
    const size = defaultPhotoSize(style, asset.width, asset.height, 340)
    const element: AlbumElement = {
      id: newElementId(),
      kind: 'photo',
      x: opts.x ?? Math.round((PAGE_WIDTH - size.width) / 2),
      y: opts.y ?? Math.round((PAGE_HEIGHT - size.height) / 2),
      width: size.width,
      height: size.height,
      rotation: 0,
      opacity: 1,
      locked: false,
      shadow: 0.55,
      data: {
        photoId: asset.id,
        style,
        fit: 'cover',
        focusX: 0.5,
        focusY: 0.5,
        filterStrength: 1,
      },
    }
    // 添加元素与登记照片清单属于同一次用户操作，合并为一条历史记录
    get().commit('添加照片', (album) => {
      const page = album.pages.find((p) => p.id === pageId)
      if (!page) return
      page.elements.push(element)
      if (!album.photoIds.includes(asset.id)) album.photoIds.push(asset.id)
    })
    set({ selection: [element.id] })
  },

  addTextElement: (preset, opts = {}) => {
    const pageId = get().resolveTargetPage(opts.pageId)
    if (!pageId) return
    const token = TEXT_PRESETS[preset]
    const text = opts.text ?? token.placeholder
    const lineCount = text.split('\n').length
    const height = Math.ceil(token.fontSize * token.lineHeight * lineCount + 8)
    const element: AlbumElement = {
      id: newElementId(),
      kind: 'text',
      x: opts.x ?? 96,
      y: opts.y ?? 360,
      width: preset === 'title' ? 460 : 340,
      height,
      rotation: 0,
      opacity: 1,
      locked: false,
      data: {
        text,
        preset,
        fontFamily: FONT_STACK[token.fontFamily],
        fontSize: token.fontSize,
        fontWeight: token.fontWeight,
        italic: token.italic ?? false,
        letterSpacing: token.letterSpacing,
        lineHeight: token.lineHeight,
        color: token.color,
        align: token.align,
        underline: token.underline,
      },
    }
    appendToPage(get, pageId, element, '添加文字')
  },

  addArtTextElement: (templateId = 'travel', opts = {}) => {
    const pageId = get().resolveTargetPage(opts.pageId)
    if (!pageId) return
    const byTemplate = {
      handwritten: { text: '写下这一刻', font: FONT_STACK.hand, color: '#394a67', accent: '#a66c50', rotation: -2 },
      travel: { text: '抵达山海之间', font: FONT_STACK.hand, color: '#31566a', accent: '#c78b4d', rotation: -1 },
      cinema: { text: 'THE MOMENT', font: FONT_STACK.sans, color: '#f2e5c8', accent: '#9b3f3d', rotation: 0 },
      magazine: { text: 'WEEKEND NOTES', font: FONT_STACK.sans, color: '#252525', accent: '#e6b8a2', rotation: 0 },
      seal: { text: '纪念', font: FONT_STACK.serif, color: '#9e3d32', accent: '#9e3d32', rotation: -4 },
      calligraphy: { text: '山川入梦', font: FONT_STACK.hand, color: '#2b3025', accent: '#9b6d36', rotation: -3 },
    }[templateId]
    const element: AlbumElement = {
      id: newElementId(), kind: 'art-text', x: opts.x ?? 110, y: opts.y ?? 300,
      width: templateId === 'seal' ? 180 : 430, height: templateId === 'seal' ? 180 : 104,
      rotation: byTemplate.rotation, opacity: 1, locked: false, shadow: 0.18,
      data: {
        text: opts.text ?? byTemplate.text, preset: 'title', fontFamily: byTemplate.font, fontSize: templateId === 'seal' ? 58 : 42,
        fontWeight: templateId === 'magazine' ? 800 : 700, italic: false, letterSpacing: templateId === 'cinema' ? 5 : 1.5,
        lineHeight: 1.25, color: byTemplate.color, align: 'center', templateId, accentColor: byTemplate.accent,
      },
    }
    appendToPage(get, pageId, element, '添加艺术字')
  },

  addStickerElement: (stickerId, opts = {}) => {
    const pageId = get().resolveTargetPage(opts.pageId)
    if (!pageId) return
    const element = buildStickerElement(stickerId, opts)
    if (element) appendToPage(get, pageId, element, '添加贴纸')
  },

  addNoteElement: (opts = {}) => {
    const pageId = get().resolveTargetPage(opts.pageId)
    if (!pageId) return
    const element: AlbumElement = {
      id: newElementId(),
      kind: 'note',
      x: opts.x ?? 260,
      y: opts.y ?? 300,
      width: 200,
      height: 160,
      rotation: -1.6,
      opacity: 1,
      locked: false,
      shadow: 0.45,
      data: {
        text: '写点什么…',
        variant: 'sticky',
        fontFamily: '"Ma Shan Zheng", "LXGW WenKai", KaiTi, cursive',
        fontSize: 17,
        color: '#4a4436',
        background: '#f6e7a8',
      },
    }
    appendToPage(get, pageId, element, '添加便签')
  },

  addStampElement: (opts = {}) => {
    const pageId = get().resolveTargetPage(opts.pageId)
    if (!pageId) return
    const element: AlbumElement = {
      id: newElementId(),
      kind: 'stamp',
      x: opts.x ?? 280,
      y: opts.y ?? 320,
      width: 120,
      height: 120,
      rotation: -8,
      opacity: 0.9,
      locked: false,
      shadow: 0,
      data: {
        text: '纪念',
        subText: new Date().getFullYear().toString(),
        shape: 'circle',
        color: '#9c4a3c',
        distress: 0.35,
      },
    }
    appendToPage(get, pageId, element, '添加印章')
  },

  addDateElement: (opts = {}) => {
    const pageId = get().resolveTargetPage(opts.pageId)
    if (!pageId) return
    const today = new Date().toISOString().slice(0, 10)
    const element: AlbumElement = {
      id: newElementId(),
      kind: 'date',
      x: opts.x ?? 96,
      y: opts.y ?? 420,
      width: 260,
      height: 34,
      rotation: 0,
      opacity: 1,
      locked: false,
      data: {
        date: today,
        format: 'dot',
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 18,
        color: '#7a7a7a',
      },
    }
    appendToPage(get, pageId, element, '添加日期')
  },

  addMapElement: (opts = {}) => {
    const pageId = get().resolveTargetPage(opts.pageId)
    if (!pageId) return
    const album = get().album
    const routePoints =
      opts.points ??
      album?.route?.map((p) => ({
        name: p.name,
        region: p.note,
        lat: p.lat,
        lng: p.lng,
      })) ??
      []

    const element: AlbumElement = {
      id: newElementId(),
      kind: 'map',
      x: opts.x ?? 80,
      y: opts.y ?? 240,
      width: 560,
      height: 420,
      rotation: 0,
      opacity: 1,
      locked: false,
      shadow: 0.3,
      data: {
        title: '旅行路线',
        points: routePoints.length
          ? routePoints.map((p) => ({
              name: p.name,
              lat: p.lat ?? 0,
              lng: p.lng ?? 0,
              note: p.region,
            }))
          : [
              { name: '成都', lat: 30.5728, lng: 104.0668, note: '出发' },
              { name: '九寨沟', lat: 33.2601, lng: 103.9178, note: '抵达' },
            ],
        ink: '#5c6b7a',
        accent: '#a8503a',
        showLabels: true,
      },
    }
    appendToPage(get, pageId, element, '添加地图')
  },

  updateElements: (elementIds, updater, label) => {
    if (!elementIds.length) return
    get().commit(label, (album) => {
      // 按元素 id 反查所在页：跨页布局下右页的元素也要能改
      const next = withPagesOfElements(album, elementIds, (page, ids) =>
        mapElements(page, ids, updater),
      )
      if (next !== album) {
        album.pages = next.pages
        album.updatedAt = next.updatedAt
      }
    })
  },

  updateSelected: (updater, label) => {
    const ids = get().selection
    if (!ids.length) return
    get().updateElements(ids, updater, label)
  },

  /**
   * 高频路径：拖拽过程中直接修改当前相册，不写历史。
   * 调用方需要在开始前 beginTransaction()、结束后 commitTransaction()。
   */
  patchElements: (elementIds, patch, label) => {
    void label
    if (!elementIds.length) return
    set((state) => {
      if (!state.album) return {}
      const album = withPagesOfElements(state.album, elementIds, (page, ids) =>
        mapElements(page, ids, (element) => ({ ...element, ...patch }) as AlbumElement),
      )
      return album === state.album ? {} : { album }
    })
  },

  patchElementData: (elementId, patch, label) => {
    void label
    set((state) => {
      if (!state.album) return {}
      const album = withPagesOfElements(state.album, [elementId], (page, ids) =>
        mapElements(
          page,
          ids,
          (element) => ({ ...element, data: { ...element.data, ...patch } }) as AlbumElement,
        ),
      )
      return album === state.album ? {} : { album }
    })
  },

  removeElements: (elementIds) => {
    const ids = elementIds ?? get().selection
    if (!ids.length) return
    const idSet = new Set(ids)
    get().commit('删除元素', (album) => {
      // 从所有页面里删除（跨页多选时可能同时命中左右两页）
      for (const page of album.pages) {
        const next = page.elements.filter((e) => !idSet.has(e.id))
        if (next.length !== page.elements.length) page.elements = next
      }
    })
    set({ selection: [] })
  },

  duplicateElements: (elementIds) => {
    const ids = elementIds ?? get().selection
    if (!ids.length) return
    const album = get().album
    if (!album) return
    const idSet = new Set(ids)
    // 每个元素复制到它自己所在的那一页，跨页多选也能各自落到对的位置
    const groups: Array<{ pageId: string; copies: AlbumElement[] }> = []
    for (const page of album.pages) {
      const picked = page.elements.filter((e) => idSet.has(e.id))
      if (picked.length) groups.push({ pageId: page.id, copies: cloneElements(picked) })
    }
    if (!groups.length) return
    get().commit('复制元素', (draft) => {
      for (const group of groups) {
        const page = draft.pages.find((p) => p.id === group.pageId)
        if (page) page.elements.push(...group.copies)
      }
    })
    set({ selection: groups.flatMap((g) => g.copies.map((c) => c.id)) })
  },

  copySelection: () => {
    const { album, selection } = get()
    if (!album || !selection.length) return
    const picked: AlbumElement[] = []
    for (const page of album.pages) {
      for (const element of page.elements) {
        if (selection.includes(element.id)) picked.push(element)
      }
    }
    if (picked.length) set({ clipboard: deepClone(picked) })
  },

  cutSelection: () => {
    get().copySelection()
    get().removeElements()
  },

  paste: () => {
    const { clipboard, activePageId, album } = get()
    if (!clipboard.length || !album) return
    const page = album.pages.find((p) => p.id === activePageId)
    if (!page) return
    // 粘贴时给一点偏移，避免完全重叠在原件上
    const copies = cloneElements(clipboard, 24)
    get().commit('粘贴元素', (draft) => {
      const target = draft.pages.find((p) => p.id === activePageId)
      if (!target) return
      target.elements.push(...copies)
    })
    set({ selection: copies.map((c) => c.id) })
  },

  bringForward: (elementIds) => reorder(get, elementIds, '上移一层', 'forward'),
  sendBackward: (elementIds) => reorder(get, elementIds, '下移一层', 'backward'),
  bringToFront: (elementIds) => reorder(get, elementIds, '置于顶层', 'front'),
  sendToBack: (elementIds) => reorder(get, elementIds, '置于底层', 'back'),

  toggleLock: (elementIds) => {
    const ids = elementIds ?? get().selection
    if (!ids.length) return
    const album = get().album
    if (!album) return
    const idSet = new Set(ids)
    let anyUnlocked = false
    for (const page of album.pages) {
      for (const element of page.elements) {
        if (idSet.has(element.id) && !element.locked) anyUnlocked = true
      }
    }
    get().commit(anyUnlocked ? '锁定元素' : '解锁元素', (draft) => {
      const next = withPagesOfElements(draft, ids, (page, pageIds) =>
        mapElements(page, pageIds, (element) => ({ ...element, locked: anyUnlocked })),
      )
      if (next !== draft) draft.pages = next.pages
    })
  },

  nudge: (dx, dy) => {
    const ids = get().selection
    if (!ids.length) return
    get().commit('移动元素', (album) => {
      const next = withPagesOfElements(album, ids, (page, pageIds) =>
        mapElements(page, pageIds, (element) =>
          element.locked ? element : { ...element, x: element.x + dx, y: element.y + dy },
        ),
      )
      if (next !== album) album.pages = next.pages
    })
  },

  /* ------------------------------------------------------------ 页面 */

  setActivePage: (pageId) => set({ activePageId: pageId, selection: [] }),

  addPage: (opts = {}) => {
    const album = get().album
    if (!album) return
    const duplex = album.pageLayout === 'duplex'
    const sheetId = duplex ? `sheet_${newPageId()}` : undefined
    const page = opts.template
      ? {
          ...deepClone(opts.template),
          id: newPageId(),
          ...(sheetId ? { sheetId, sheetSide: 'front' as const } : {}),
          title: opts.title ?? opts.template.title,
          elements: cloneElements(opts.template.elements, 0),
        }
      : defaultPage(album, opts.role ?? 'content', opts.title, opts.background)
    if (opts.template && opts.role) page.role = opts.role

    const backPage: Page | null = duplex && sheetId
      ? {
          ...deepClone(page),
          id: newPageId(),
          sheetId,
          sheetSide: 'back',
          title: `${page.title}（背面）`,
          elements: [],
        }
      : null
    if (duplex && sheetId) {
      page.sheetId = sheetId
      page.sheetSide = 'front'
    }

    get().commit('新增页面', (draft) => {
      const insertAt = opts.afterPageId
        ? pageIndexAfterSheet(draft.pages, opts.afterPageId)
        : draft.pages.length
      draft.pages.splice(insertAt, 0, page, ...(backPage ? [backPage] : []))
    })
    set({ activePageId: page.id, selection: [] })
  },

  duplicatePage: (pageId) => {
    const album = get().album
    if (!album) return
    const index = album.pages.findIndex((p) => p.id === pageId)
    if (index === -1) return
    const sourcePages = album.pageLayout === 'duplex' ? pagesForSheet(album.pages, pageId) : [album.pages[index]]
    const copySheetId = album.pageLayout === 'duplex' ? `sheet_${newPageId()}` : undefined
    const copies = sourcePages.map((source) => ({
      ...deepClone(source),
      id: newPageId(),
      ...(copySheetId ? { sheetId: copySheetId } : {}),
      title: `${source.title} 副本`,
      elements: cloneElements(source.elements, 0),
    }))
    get().commit('复制页面', (draft) => {
      const lastSource = sourcePages.at(-1)?.id
      const lastIndex = lastSource ? draft.pages.findIndex((page) => page.id === lastSource) : index
      draft.pages.splice(lastIndex + 1, 0, ...copies)
    })
    set({ activePageId: copies.find((page) => page.sheetSide === 'front')?.id ?? copies[0].id, selection: [] })
  },

  removePage: (pageId) => {
    const album = get().album
    if (!album) return
    const sheetCount = album.pageLayout === 'duplex'
      ? new Set(album.pages.map((page) => page.sheetId)).size
      : album.pages.length
    if (sheetCount <= 1) return
    const index = album.pages.findIndex((p) => p.id === pageId)
    if (index === -1) return
    const removedIds = new Set(
      album.pageLayout === 'duplex'
        ? pagesForSheet(album.pages, pageId).map((page) => page.id)
        : [pageId],
    )
    get().commit('删除页面', (draft) => {
      draft.pages = draft.pages.filter((page) => !removedIds.has(page.id))
    })
    const next = get().album
    if (!next) return
    const fallback = next.pages[Math.min(index, next.pages.length - 1)]
    set({ activePageId: fallback?.id ?? next.pages[0].id, selection: [] })
  },

  movePage: (fromIndex, toIndex) => {
    get().commit('调整页面顺序', (draft) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= draft.pages.length ||
        toIndex >= draft.pages.length
      ) {
        return
      }
      if (draft.pageLayout === 'duplex') {
        const pages = draft.pages
        const movingSheet = pages[fromIndex].sheetId
        const targetSheet = pages[toIndex].sheetId
        if (!movingSheet || !targetSheet || movingSheet === targetSheet) return
        const sheets = [...new Set(pages.map((page) => page.sheetId))]
        const fromSheet = sheets.indexOf(movingSheet)
        const toSheet = sheets.indexOf(targetSheet)
        const [movedSheet] = sheets.splice(fromSheet, 1)
        sheets.splice(toSheet, 0, movedSheet)
        draft.pages = sheets.flatMap((sheetId) => pages.filter((page) => page.sheetId === sheetId))
        return
      }
      const [moved] = draft.pages.splice(fromIndex, 1)
      draft.pages.splice(toIndex, 0, moved)
    })
  },

  moveElementToPage: (elementId, targetPageId, offsetX) => {
    const album = get().album
    if (!album) return
    const sourcePage = album.pages.find((p) => p.elements.some((e) => e.id === elementId))
    if (!sourcePage || sourcePage.id === targetPageId) return

    get().commit('移动到另一页', (draft) => {
      const from = draft.pages.find((p) => p.id === sourcePage.id)
      const to = draft.pages.find((p) => p.id === targetPageId)
      if (!from || !to) return
      const index = from.elements.findIndex((e) => e.id === elementId)
      if (index === -1) return
      const [element] = from.elements.splice(index, 1)
      // 换算到目标页的坐标系
      element.x += offsetX
      to.elements.push(element)
    })
  },

  updatePage: (pageId, patch, label) => {
    get().commit(label, (album) => {
      const index = album.pages.findIndex((p) => p.id === pageId)
      if (index === -1) return
      album.pages[index] = { ...album.pages[index], ...patch }
    })
  },

  setPageBackground: (pageId, background, label) => {
    get().commit(label, (album) => {
      const index = album.pages.findIndex((p) => p.id === pageId)
      if (index === -1) return
      album.pages[index] = { ...album.pages[index], background: { ...background } }
    })
  },

  setAlbumMeta: (patch, label) => {
    get().commit(label, (album) => {
      Object.assign(album, patch, { updatedAt: new Date().toISOString() })
    })
  },

  /* ------------------------------------------------------------ 视图 */

  setZoom: (zoom) => set({ zoom: Math.max(0.2, Math.min(2, zoom)) }),
  setLeftPanel: (leftPanel) => set({ leftPanel }),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  setActivePhotoStyle: (activePhotoStyle) => set({ activePhotoStyle }),
  setActiveTextPreset: (activeTextPreset) => set({ activeTextPreset }),

  markSaving: () => set({ saveState: 'saving' }),
  markSaved: () => set({ saveState: 'saved', dirty: false, lastSavedAt: new Date().toISOString() }),
  markError: () => set({ saveState: 'error' }),
}))

/* ------------------------------------------------------------------ *
 * 辅助实现
 * ------------------------------------------------------------------ */

type Getter = () => EditorState

/** 把元素直接追加到指定页面（不依赖 activePageId），并选中它 */
function appendToPage(
  get: Getter,
  pageId: string,
  element: AlbumElement,
  label: string,
): void {
  get().commit(label, (album) => {
    const page = album.pages.find((p) => p.id === pageId)
    if (!page) return
    page.elements.push(element)
  })
  useEditorStore.setState({ selection: [element.id] })
}

/**
 * 调整层级。
 *
 * 多个元素同时选中时必须保持它们彼此的相对顺序，因此分两步：
 * 先抽出选中的元素（保持原顺序），再整体插入到目标位置。
 *
 * 导出以便单元测试（这是编辑器里最容易写错、也最难靠肉眼发现的一处逻辑）。
 */
export function reorderElements(
  elements: AlbumElement[],
  selectedIds: string[],
  mode: 'front' | 'back' | 'forward' | 'backward',
): AlbumElement[] {
  const idSet = new Set(selectedIds)
  const moving = elements.filter((e) => idSet.has(e.id))
  if (!moving.length) return elements

  const rest = elements.filter((e) => !idSet.has(e.id))
  const firstIndex = elements.findIndex((e) => idSet.has(e.id))

  let insertAt: number
  switch (mode) {
    case 'front':
      insertAt = rest.length
      break
    case 'back':
      insertAt = 0
      break
    case 'forward':
      // 整体上移一层：在「未选中元素中的原位置 + 1」处插回
      insertAt = Math.min(rest.length, firstIndex + 1)
      break
    case 'backward':
    default:
      // 整体下移一层：在「未选中元素中的原位置 - 1」处插回
      insertAt = Math.max(0, firstIndex - 1)
      break
  }

  const next = [...rest]
  next.splice(Math.max(0, Math.min(next.length, insertAt)), 0, ...moving)
  return next
}

function reorder(
  get: Getter,
  elementIds: string[] | undefined,
  label: string,
  mode: 'front' | 'back' | 'forward' | 'backward',
): void {
  const ids = elementIds ?? get().selection
  if (!ids.length) return

  get().commit(label, (album) => {
    // 层级是「页内」概念：每个元素在它自己所在的那一页里调整
    const next = withPagesOfElements(album, ids, (page, pageIds) => {
      const elements = reorderElements(page.elements, pageIds, mode)
      return elements === page.elements ? page : { ...page, elements }
    })
    if (next !== album) album.pages = next.pages
  })
}

function buildStickerElement(
  stickerId: string,
  opts: { x?: number; y?: number },
): AlbumElement | null {
  const def = STICKER_INDEX.get(stickerId)
  if (!def) return null
  return {
    id: newElementId(),
    kind: 'sticker',
    x: opts.x ?? 280,
    y: opts.y ?? 320,
    width: def.width,
    height: def.height,
    rotation: 0,
    opacity: 1,
    locked: false,
    shadow: 0.3,
    data: {
      glyph: def.glyph ?? '',
      render: def.render,
      svgId: def.svgId,
      category: def.category,
      tint: def.tint,
    },
  }
}
