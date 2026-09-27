import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  BookMarked,
  FileText,
  Images,
  Layers,
  LayoutTemplate,
  Smile,
  Sparkles,
} from 'lucide-react'
import type { Page } from '@/types/album'
import { useLibraryStore } from '@/store/libraryStore'
import { useEditorStore, type LeftPanel } from '@/store/editorStore'
import { persistAlbum } from '@/persistence'
import { EditorCanvas } from '@/components/editor/EditorCanvas'
import { EditorTopBar } from '@/components/editor/EditorTopBar'
import { PageStrip } from '@/components/editor/PageStrip'
import { Inspector } from '@/components/editor/Inspector'
import { InsertPanel } from '@/components/editor/panels/InsertPanel'
import { PhotoPanel } from '@/components/editor/panels/PhotoPanel'
import { StickerPanel } from '@/components/editor/panels/StickerPanel'
import { PagePanel } from '@/components/editor/panels/PagePanel'
import { Toast, useToast } from '@/components/ui/Toast'
import { debounce } from '@/lib/utils'
import { buildPage } from '@/ai/layoutEngine'

/**
 * 纪念册编辑器 —— 产品最核心的页面。
 *
 * 布局：左侧工具导轨 + 面板 / 中央跨页画布 / 右侧属性面板 / 底部页面条。
 *
 * 状态策略：
 *  - 编辑器持有纪念册的草稿副本（editorStore.album），所有编辑先改草稿；
 *  - 草稿变化后 900ms 防抖自动保存到图书馆 + IndexedDB（「已保存」可见）；
 *  - 撤销栈只记录结构性操作，拖拽过程通过事务合并成一步。
 */
export function EditorPage() {
  const { albumId = '' } = useParams()
  const navigate = useNavigate()
  const album = useEditorStore((state) => state.album)
  const loadAlbum = useEditorStore((state) => state.loadAlbum)
  const closeAlbum = useEditorStore((state) => state.closeAlbum)
  const libraryAlbum = useLibraryStore((state) => state.albums.find((a) => a.id === albumId))
  const libraryReady = useLibraryStore((state) => state.ready)
  const degraded = useLibraryStore((state) => state.degraded)
  const { toast, show } = useToast()

  const [leftPanel, setLeftPanelState] = useState<LeftPanel>('insert')
  const [saveError, setSaveError] = useState(false)

  const activePageId = useEditorStore((state) => state.activePageId)
  const zoom = useEditorStore((state) => state.zoom)
  const showGrid = useEditorStore((state) => state.showGrid)
  const rightPanelOpen = useEditorStore((state) => state.rightPanelOpen)
  const past = useEditorStore((state) => state.past.length)
  const future = useEditorStore((state) => state.future.length)
  const saveState = useEditorStore((state) => state.saveState)
  const lastSavedAt = useEditorStore((state) => state.lastSavedAt)
  const dirty = useEditorStore((state) => state.dirty)

  /* ---------------------------------------------------------- 载入 */

  /**
   * 只在「换了另一本册子」时把存档读进草稿。
   *
   * 这里**刻意不把 libraryAlbum 放进依赖**：自动保存会通过 persistAlbum
   * 把草稿写回 libraryStore，library 里那一本的**对象引用**随之改变，
   * libraryAlbum 于是变成一个「新的」值。若把它列入依赖，每次自动保存
   * 落地都会重跑这个 effect —— 而 cleanup 里的 closeAlbum() 会紧接着
   * 清空撤销栈、清空选中、并把 activePageId 拨回第 1 页，也就是
   * 「编辑后大约 900ms，撤销按钮突然变灰、属性面板被清空、画布跳回封面」。
   *
   * 草稿的所有权属于编辑器：存档只在打开时流入一次，之后由自动保存
   * 单向写回。因此依赖只保留「打开的是哪一本」「存档是否已就绪」
   * 以及两个稳定的 store 方法。
   *
   * libraryReady 参与依赖是必要的：冷启动时 library 里先只有内置 demo
   * （首帧不阻塞渲染的代价），用户自己那本要等 IndexedDB 读完才出现。
   */
  useEffect(() => {
    const source = useLibraryStore.getState().albums.find((a) => a.id === albumId)
    // 存档还没读完时不要急着判定「找不到」，否则硬刷新会永久停在 404
    if (!source) return
    loadAlbum(source)
    return () => closeAlbum()
  }, [albumId, libraryReady, loadAlbum, closeAlbum])

  /* ---------------------------------------------------------- 自动保存 */

  const saveRef = useRef(
    debounce((albumToSave: NonNullable<typeof album>) => {
      const store = useEditorStore.getState()
      store.markSaving()
      persistAlbum(albumToSave)
        .then(() => {
          useEditorStore.getState().markSaved()
          setSaveError(false)
        })
        .catch((error) => {
          console.error(error)
          useEditorStore.getState().markError()
          setSaveError(true)
        })
    }, 900),
  )

  useEffect(() => {
    if (!album || !dirty) return
    saveRef.current(album)
  }, [album, dirty])

  const handleSaveNow = useCallback(() => {
    const current = useEditorStore.getState().album
    if (!current) return
    saveRef.current.flush()
    useEditorStore.getState().markSaving()
    persistAlbum(current)
      .then(() => {
        useEditorStore.getState().markSaved()
        show('已保存', { tone: 'success' })
      })
      .catch(() => show('保存失败', { tone: 'error' }))
  }, [show])

  // 离开页面前把未保存的内容落盘
  useEffect(() => {
    return () => {
      saveRef.current.flush()
    }
  }, [])

  /* ---------------------------------------------------------- 跨页视图 */

  /**
   * 计算当前应该显示哪两页。
   *
   * 规则贴近实体书：封面单独占右侧（左边为空），其余页面按
   * [当前页, 下一页] 成对；但必须保证「当前页」一定可见。
   *
   * 注意：右页永远不是 activePageId，所以 store 里所有按元素 id 定位的
   * 写操作都必须跨页查找（见 editorStore.withPagesOfElements）。
   */
  const visiblePages = useMemo((): [Page | null, Page | null] => {
    if (!album) return [null, null]
    const pages = album.pages
    const index = pages.findIndex((p) => p.id === activePageId)
    if (index === -1) return [pages[0] ?? null, pages[1] ?? null]

    if (album.pageLayout === 'duplex') {
      const current = pages[index]
      const sheets = [...new Map(pages.map((page) => [page.sheetId, page.sheetId])).keys()]
      const sheetIndex = sheets.indexOf(current.sheetId)
      const sheetPages = pages.filter((page) => page.sheetId === current.sheetId)
      const front = sheetPages.find((page) => page.sheetSide === 'front') ?? null
      const back = sheetPages.find((page) => page.sheetSide === 'back') ?? null

      if (current.sheetSide === 'back') {
        const nextSheetId = sheets[sheetIndex + 1]
        const nextFront = pages.find((page) => page.sheetId === nextSheetId && page.sheetSide === 'front') ?? null
        return [back ?? current, nextFront]
      }

      const previousSheetId = sheets[sheetIndex - 1]
      const previousBack = pages.find((page) => page.sheetId === previousSheetId && page.sheetSide === 'back') ?? null
      if (sheetIndex === 0) return [null, front ?? current]
      return [previousBack, front ?? current]
    }

    if (pages[index].role === 'cover') return [null, pages[index]]

    // 高亮页固定放在左页，右侧显示它的下一页
    const left = pages[index]
    const right = pages[index + 1] ?? null
    return [left, right]
  }, [album, activePageId])

  /* ---------------------------------------------------------- 快捷键 */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      const store = useEditorStore.getState()
      const mod = event.metaKey || event.ctrlKey

      // 这些快捷键在输入状态下不拦截，除了保存
      if (typing) {
        if (mod && event.key.toLowerCase() === 's') {
          event.preventDefault()
          handleSaveNow()
        }
        return
      }

      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) store.redo()
        else store.undo()
        return
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        store.redo()
        return
      }
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault()
        handleSaveNow()
        return
      }
      if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        store.selectAllOnPage()
        return
      }
      if (mod && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        store.copySelection()
        return
      }
      if (mod && event.key.toLowerCase() === 'x') {
        event.preventDefault()
        store.cutSelection()
        return
      }
      if (mod && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        store.paste()
        return
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        store.duplicateElements()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (store.selection.length) {
          event.preventDefault()
          // 记下删除前的选中项：撤销会连选择状态一起恢复，这里只是让
          // 撤销之后仍然把你刚删的东西选回来，方便继续操作
          const removed = store.selection
          store.removeElements()
          show('已删除元素', {
            tone: 'default',
            action: {
              label: '撤销',
              run: () => {
                useEditorStore.getState().undo()
                useEditorStore.getState().select(removed)
              },
            },
          })
        }
        return
      }
      if (event.key === 'Escape') {
        store.clearSelection()
        return
      }
      if (event.key === '[' && store.selection.length) {
        store.sendBackward()
        return
      }
      if (event.key === ']' && store.selection.length) {
        store.bringForward()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSaveNow, show])

  /* ---------------------------------------------------------- 未找到 */

  /**
   * 「找不到」是**派生值**，不是一个会锁死的状态。
   *
   * 之前这里用 useState 把 notFound 置 true 后永不复位，于是「用户自己的
   * 纪念册 + 直接访问 /edit 链接（硬刷新 / 新标签）」会永久停在 404：
   * 首帧 library 里只有内置 demo。改成派生之后，存档读完就能自愈
   * （载入 effect 依赖 libraryReady，会再跑一次）。
   */
  const notFound = libraryReady && !libraryAlbum

  if (notFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-ink-300">找不到这本纪念册</p>
        <Link to="/" className="btn-primary">
          返回书架
        </Link>
      </div>
    )
  }

  if (!album) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-xs text-ink-500">正在打开纪念册…</div>
      </div>
    )
  }

  const pageIndex = album.pages.findIndex((p) => p.id === activePageId)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <EditorTopBar
        albumTitle={album.title}
        pageIndex={Math.max(0, pageIndex)}
        pageCount={album.pages.length}
        canUndo={past > 0}
        canRedo={future > 0}
        saveState={saveError ? 'error' : saveState}
        lastSavedAt={lastSavedAt}
        degraded={degraded}
        onUndo={() => useEditorStore.getState().undo()}
        onRedo={() => useEditorStore.getState().redo()}
        onSave={handleSaveNow}
        onShare={() => navigate(`/share/${album.share?.slug ?? album.id}`)}
        onPreview={() => navigate(`/album/${album.id}/read`)}
        onRename={(title) =>
          useEditorStore.getState().setAlbumMeta({ title }, '重命名纪念册')
        }
      />

      <div className="flex min-h-0 flex-1">
        {/* 左侧导轨 */}
        <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-white/[0.06] bg-ink-900/60 py-3">
          <RailButton
            icon={<Sparkles className="h-4 w-4" />}
            label="插入"
            active={leftPanel === 'insert'}
            onClick={() => setLeftPanelState('insert')}
          />
          <RailButton
            icon={<Images className="h-4 w-4" />}
            label="照片"
            active={leftPanel === 'photos'}
            onClick={() => setLeftPanelState('photos')}
          />
          <RailButton
            icon={<Smile className="h-4 w-4" />}
            label="贴纸"
            active={leftPanel === 'stickers'}
            onClick={() => setLeftPanelState('stickers')}
          />
          <RailButton
            icon={<FileText className="h-4 w-4" />}
            label="页面"
            active={leftPanel === 'pages'}
            onClick={() => setLeftPanelState('pages')}
          />
          <RailButton
            icon={<LayoutTemplate className="h-4 w-4" />}
            label="模板"
            active={leftPanel === 'templates'}
            onClick={() => setLeftPanelState('templates')}
          />
          <div className="my-1 h-px w-6 bg-white/10" />
          <RailButton
            icon={<BookMarked className="h-4 w-4" />}
            label="目录"
            active={false}
            onClick={() => show('目录功能规划中：将自动汇总每页标题与日期')}
          />
          <RailButton
            icon={<Layers className="h-4 w-4" />}
            label="图层"
            active={false}
            onClick={() => show('图层面板规划中：可在右侧调整层级')}
          />
        </nav>

        {/* 左侧面板内容 */}
        {leftPanel && (
          <aside className="flex w-[268px] shrink-0 flex-col border-r border-white/[0.06] bg-ink-900/45">
            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-3 py-2">
              <span className="text-[11px] text-ink-200">{panelTitle(leftPanel)}</span>
              <button
                className="text-[10px] text-ink-500 transition-colors hover:text-ink-200"
                onClick={() => setLeftPanelState(null)}
              >
                收起
              </button>
            </div>
            <div className="min-h-0 flex-1">
              {leftPanel === 'insert' && <InsertPanel onSwitch={setLeftPanelState} />}
              {leftPanel === 'photos' && <PhotoPanel />}
              {leftPanel === 'stickers' && <StickerPanel />}
              {leftPanel === 'pages' && <PagePanel />}
              {leftPanel === 'templates' && <TemplateList />}
            </div>
          </aside>
        )}

        {/* 中央画布 */}
        <main className="relative min-w-0 flex-1">
          <EditorCanvas
            album={album}
            visiblePages={visiblePages}
            activePageId={activePageId}
            zoom={zoom}
            showGrid={showGrid}
          />

          {/* 编辑提示 */}
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">
            <div className="rounded-full bg-ink-900/70 px-3 py-1 text-[10px] text-ink-500 backdrop-blur">
              双击文字可直接编辑 · Alt 拖拽复制 · Delete 删除 · Ctrl+Z 撤销
            </div>
          </div>
        </main>

        {/* 右侧属性面板 */}
        {rightPanelOpen && (
          <aside className="flex w-[248px] shrink-0 flex-col border-l border-white/[0.06] bg-ink-900/45">
            <Inspector />
          </aside>
        )}
      </div>

      <PageStrip />

      <Toast toast={toast} />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 小件
 * ------------------------------------------------------------------ */

function RailButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      className="tool-btn group relative h-11 w-11 flex-col gap-0.5"
      data-active={active}
      onClick={onClick}
      title={label}
    >
      {icon}
      <span className="text-[9px] leading-none">{label}</span>
    </button>
  )
}

function panelTitle(panel: LeftPanel): string {
  switch (panel) {
    case 'insert':
      return '插入'
    case 'photos':
      return '照片素材库'
    case 'stickers':
      return '贴纸'
    case 'pages':
      return '页面与版式'
    case 'templates':
      return '模板'
    default:
      return ''
  }
}

/**
 * 模板列表：把「空白页 + 一种版式」做成可复用的一步操作。
 * 这里复用 AI 排版引擎里的版式函数，保证模板与自动生成结果一致。
 */
function TemplateList() {
  const album = useEditorStore((state) => state.album)
  const addPage = useEditorStore((state) => state.addPage)
  const activePageId = useEditorStore((state) => state.activePageId)
  const { show } = useToast()

  const templates = useMemo(() => {
    if (!album) return []
    const base = {
      paperColor: album.pages[0]?.background.color ?? '#f7f3ea',
      paper: album.pages[0]?.background.paper ?? ('plain' as const),
    }
    return [
      {
        id: 'blank',
        name: '空白页',
        desc: '从零开始，自由摆放',
        build: () => null,
      },
      {
        id: 'single',
        name: '单图大图',
        desc: '一张主图 + 标题与文字',
        build: () => 'hero' as const,
      },
      {
        id: 'collage',
        name: '照片拼贴',
        desc: '三到四张错落排布',
        build: () => 'collage' as const,
      },
      {
        id: 'grid',
        name: '四宫格',
        desc: '规整但带轻微倾斜',
        build: () => 'grid' as const,
      },
      {
        id: 'diptych',
        name: '对页双图',
        desc: '两张大图 + 注释',
        build: () => 'diptych' as const,
      },
      {
        id: 'notes',
        name: '手写随笔',
        desc: '大片留白，用来写字',
        build: () => 'text-only' as const,
      },
    ]
    void base
  }, [album])

  return (
    <div className="h-full overflow-y-auto px-3 py-3">
      <div className="mb-2 text-[10px] leading-relaxed text-ink-500">
        模板会新建一页，并使用当前纪念册的照片自动填充版面。
      </div>
      <div className="space-y-1.5">
        {templates.map((template) => (
          <button
            key={template.id}
            onClick={async () => {
              const kind = template.build()
              if (!kind) {
                addPage({ afterPageId: activePageId, title: '空白页' })
                show('已新增空白页')
                return
              }
              const photos = album?.photoIds.slice(0, 4) ?? []
              if (kind !== 'text-only' && photos.length === 0) {
                show('这条模板需要先有照片', { tone: 'error' })
                return
              }
              const page = buildPage(kind, {
                photos: photos.map((photoId) => ({ photoId, width: 1200, height: 900 })),
                title: '新的一页',
                caption: '在这里写下这一页的故事。',
                date: album?.startDate,
                paperColor: album?.pages[0]?.background.color ?? '#f7f3ea',
                paper: album?.pages[0]?.background.paper ?? 'plain',
                variant: Math.floor(Math.random() * 6),
              })
              addPage({ afterPageId: activePageId, template: page, title: page.title })
              show(`已新增「${template.name}」页面`)
            }}
            className="w-full rounded-xl bg-ink-800/50 p-2.5 text-left transition-colors hover:bg-ink-700/60"
          >
            <div className="text-[11px] text-ink-200">{template.name}</div>
            <div className="mt-0.5 text-[10px] text-ink-500">{template.desc}</div>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl bg-ink-800/40 p-2.5 text-[10px] leading-relaxed text-ink-600">
        提示：模板只是起点。生成后每一项都可以继续拖动、替换与删除。
      </div>
    </div>
  )
}
