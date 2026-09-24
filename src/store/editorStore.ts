import { create } from 'zustand'
import type {
  Album,
  AlbumElement,
  GeoPoint,
  Page,
  PageRole,
  PhotoAsset,
  PhotoStyle,
  TextPreset,
} from '@/types/album'
import { FONT_STACK, HISTORY_LIMIT, PAGE_HEIGHT, PAGE_WIDTH, TEXT_PRESETS } from '@/lib/designTokens'
import { defaultPhotoSize } from '@/lib/frame'
import { newElementId, newPageId } from '@/lib/id'
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
  addTextElement: (preset: TextPreset, opts?: { x?: number; y?: number; pageId?: string }) => void
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
  setSpread: (primaryPageId: string, secondaryPageId: string | null) => void
  addPage: (opts?: { role?: PageRole; title?: string; afterPageId?: string; template?: Page }) => void
  duplicatePage: (pageId: string) => void
  removePage: (pageId: string) => void
  movePage: (fromIndex: number, toIndex: number) => void
  updatePage: (pageId: string, patch: Partial<Page>, label: string) => void
  setPageBackground: (pageId: string, background: Page['background'], label: string) => void
  setAlbumMeta: (patch: Partial<Album>, label: string) => void
  replacePages: (pages: Page[], label: string) => void

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
function withPage(album: Album, pageId: string, fn: (page: Page) => Page): Album {
  let changed = false
  const pages = album.pages.map((page) => {
    if (page.id !== pageId) return page
    const next = fn(page)
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

function defaultPage(album: Album, role: PageRole = 'content', title?: string): Page {
  return {
    id: newPageId(),
    title: title ?? `第 ${album.pages.length} 页`,
    role,
    background: {
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
    const text = token.placeholder
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
    const pageId = get().activePageId
    get().commit(label, (album) => {
      const pageIndex = album.pages.findIndex((p) => p.id === pageId)
      if (pageIndex === -1) return
      const page = album.pages[pageIndex]
      const next = mapElements(page, elementIds, updater)
      if (next !== page) album.pages[pageIndex] = next
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
    set((state) => {
      if (!state.album) return {}
      const album = withPage(state.album, state.activePageId, (page) =>
        mapElements(page, elementIds, (element) => ({ ...element, ...patch }) as AlbumElement),
      )
      return album === state.album ? {} : { album }
    })
  },

  patchElementData: (elementId, patch, label) => {
    void label
    set((state) => {
      if (!state.album) return {}
      const album = withPage(state.album, state.activePageId, (page) =>
        mapElements(
          page,
          [elementId],
          (element) => ({ ...element, data: { ...element.data, ...patch } }) as AlbumElement,
        ),
      )
      return album === state.album ? {} : { album }
    })
  },

  removeElements: (elementIds) => {
    const ids = elementIds ?? get().selection
    if (!ids.length) return
    const pageId = get().activePageId
    get().commit('删除元素', (album) => {
      const page = album.pages.find((p) => p.id === pageId)
      if (!page) return
      const idSet = new Set(ids)
      page.elements = page.elements.filter((e) => !idSet.has(e.id))
    })
    set({ selection: [] })
  },

  duplicateElements: (elementIds) => {
    const ids = elementIds ?? get().selection
    if (!ids.length) return
    const pageId = get().activePageId
    const copies = cloneElements(
      get()
        .album?.pages.find((p) => p.id === pageId)
        ?.elements.filter((e) => ids.includes(e.id)) ?? [],
    )
    if (!copies.length) return
    get().commit('复制元素', (album) => {
      const page = album.pages.find((p) => p.id === pageId)
      if (!page) return
      page.elements.push(...copies)
    })
    set({ selection: copies.map((c) => c.id) })
  },

  copySelection: () => {
    const { album, activePageId, selection } = get()
    const page = album?.pages.find((p) => p.id === activePageId)
    if (!page) return
    const picked = page.elements.filter((e) => selection.includes(e.id))
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
    const pageId = get().activePageId
    const page = get().album?.pages.find((p) => p.id === pageId)
    if (!page) return
    const anyUnlocked = page.elements.some((e) => ids.includes(e.id) && !e.locked)
    get().commit(anyUnlocked ? '锁定元素' : '解锁元素', (album) => {
      const target = album.pages.find((p) => p.id === pageId)
      if (!target) return
      target.elements = target.elements.map((e) =>
        ids.includes(e.id) ? { ...e, locked: anyUnlocked } : e,
      )
    })
  },

  nudge: (dx, dy) => {
    const ids = get().selection
    if (!ids.length) return
    const pageId = get().activePageId
    get().commit('移动元素', (album) => {
      const page = album.pages.find((p) => p.id === pageId)
      if (!page) return
      const idSet = new Set(ids)
      page.elements = page.elements.map((e) =>
        idSet.has(e.id) && !e.locked ? { ...e, x: e.x + dx, y: e.y + dy } : e,
      )
    })
  },

  /* ------------------------------------------------------------ 页面 */

  setActivePage: (pageId) => set({ activePageId: pageId, selection: [] }),

  setSpread: (primaryPageId, secondaryPageId) =>
    set({ activePageId: primaryPageId, spreadSecondPageId: secondaryPageId }),

  addPage: (opts = {}) => {
    const album = get().album
    if (!album) return
    const page = opts.template
      ? {
          ...deepClone(opts.template),
          id: newPageId(),
          title: opts.title ?? opts.template.title,
          elements: cloneElements(opts.template.elements, 0),
        }
      : defaultPage(album, opts.role ?? 'content', opts.title)
    if (opts.template && opts.role) page.role = opts.role

    get().commit('新增页面', (draft) => {
      if (opts.afterPageId) {
        const index = draft.pages.findIndex((p) => p.id === opts.afterPageId)
        draft.pages.splice(index === -1 ? draft.pages.length : index + 1, 0, page)
      } else {
        draft.pages.push(page)
      }
    })
    set({ activePageId: page.id, selection: [] })
  },

  duplicatePage: (pageId) => {
    const album = get().album
    if (!album) return
    const index = album.pages.findIndex((p) => p.id === pageId)
    if (index === -1) return
    const source = album.pages[index]
    const copy: Page = {
      ...deepClone(source),
      id: newPageId(),
      title: `${source.title} 副本`,
      elements: cloneElements(source.elements, 0),
    }
    get().commit('复制页面', (draft) => {
      draft.pages.splice(index + 1, 0, copy)
    })
    set({ activePageId: copy.id, selection: [] })
  },

  removePage: (pageId) => {
    const album = get().album
    if (!album || album.pages.length <= 1) return
    const index = album.pages.findIndex((p) => p.id === pageId)
    if (index === -1) return
    get().commit('删除页面', (draft) => {
      draft.pages.splice(index, 1)
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

  replacePages: (pages, label) => {
    get().commit(label, (album) => {
      album.pages = pages
    })
    set({ activePageId: pages[0]?.id ?? '', selection: [] })
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
  const pageId = get().activePageId

  get().commit(label, (album) => {
    const page = album.pages.find((p) => p.id === pageId)
    if (!page) return
    page.elements = reorderElements(page.elements, ids, mode)
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
