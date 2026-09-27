import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Images, ImagePlus, PencilLine, Plus, Share2, Sparkles, Type, X } from 'lucide-react'
import { useLibraryStore } from '@/store/libraryStore'
import { useEditorStore } from '@/store/editorStore'
import { Reader } from '@/components/reader/Reader'
import { PageThumb } from '@/components/editor/PageThumb'
import { Toast, useToast } from '@/components/ui/Toast'
import { PAPER_LIST } from '@/lib/designTokens'
import { persistAlbum } from '@/persistence'
import { uploadPhotos } from '@/services/uploadService'
import type { ArtTextTemplate, TextElement, ArtTextElement } from '@/types/album'
import { TEXT_PRESETS } from '@/lib/designTokens'

const ART_TEXT_OPTIONS: Array<{ id: ArtTextTemplate; name: string; sample: string }> = [
  { id: 'handwritten', name: '手写', sample: '写下这一刻' },
  { id: 'travel', name: '旅行', sample: '抵达山海之间' },
  { id: 'cinema', name: '电影', sample: 'THE MOMENT' },
  { id: 'magazine', name: '杂志', sample: 'WEEKEND NOTES' },
  { id: 'seal', name: '印章', sample: '纪念' },
  { id: 'calligraphy', name: '书法', sample: '山川入梦' },
]

/**
 * 沉浸式预览。
 *
 * 桌面端是「书本 + 键盘/点击翻页」，移动端自动退回单页阅读；
 * 底部可以拉出一排缩略图快速跳转。
 *
 * 注意：Reader 用 initialIndex 初始化内部状态，因此这里用 key 控制它的
 * 生命周期 —— 只有从 URL 跳转（缩略图 / 外部链接）时才重新挂载，
 * 正常翻页由 Reader 自己维护状态，避免每次翻页都重挂载导致动画被打断。
 */
export function PreviewPage() {
  const { albumId = '', pageIndex } = useParams()
  const navigate = useNavigate()
  const album = useLibraryStore((state) => state.albums.find((a) => a.id === albumId))
  const closeAlbum = useEditorStore((state) => state.closeAlbum)
  const { toast, show } = useToast()

  const initialIndex = pageIndex ? Math.max(0, Number(pageIndex) || 0) : 0
  const [thumbsOpen, setThumbsOpen] = useState(false)
  const [current, setCurrent] = useState(initialIndex)
  const [navigationRequest, setNavigationRequest] = useState<{ token: number; pageId: string; turn?: boolean }>()
  const [paperPickerOpen, setPaperPickerOpen] = useState(false)
  const [textEditor, setTextEditor] = useState<'text' | 'art' | null>(null)
  const [textDraft, setTextDraft] = useState('')
  const [artTemplate, setArtTemplate] = useState<ArtTextTemplate>('travel')
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  // 离开阅读模式时清理编辑器草稿，避免下次进编辑器带着旧状态
  useEffect(() => () => closeAlbum(), [closeAlbum])

  if (!album) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-ink-300">找不到这本纪念册</p>
        <Link to="/" className="btn-primary">
          返回书架
        </Link>
      </div>
    )
  }

  const slug = album.share?.slug ?? album.id
  const currentPage = album.pages[current] ?? album.pages[0]

  /**
   * 阅读器就是制作器：每次操作先把当前翻开的书载入编辑状态，再立即落盘。
   * 不跳到传统画布页面，Reader 收到 library 的新数据后会原位重绘这张纸。
   */
  const withCurrentPage = async (change: (pageId: string) => void) => {
    if (!currentPage) return
    const editor = useEditorStore.getState()
    editor.loadAlbum(album, currentPage.id)
    change(currentPage.id)
    const changed = useEditorStore.getState().album
    if (changed) await persistAlbum(changed)
  }

  const addPaper = (paper: (typeof PAPER_LIST)[number]) => {
    void (async () => {
      const existingIds = new Set(album.pages.map((page) => page.id))
      await withCurrentPage((pageId) => {
        useEditorStore.getState().addPage({
          afterPageId: pageId,
          title: `${paper.name}新页`,
          background: { color: paper.color, paper: paper.id, lineColor: paper.lineColor, vignette: 0.2 },
        })
      })
      // 从正面翻过去，新纸出现在右侧；末张纸背面则新纸直接展开在右侧。
      const newFront = useEditorStore.getState().album?.pages.find((page) =>
        !existingIds.has(page.id) && (album.pageLayout !== 'duplex' || page.sheetSide === 'front'),
      )
      if (newFront) {
        setNavigationRequest((request) => ({
          token: (request?.token ?? 0) + 1,
          pageId: newFront.id,
          turn: album.pageLayout === 'duplex' && currentPage?.sheetSide !== 'back',
        }))
      }
    })()
    setPaperPickerOpen(false)
  }

  const currentTextElements = (currentPage?.elements ?? []).filter(
    (element): element is TextElement | ArtTextElement => element.kind === 'text' || element.kind === 'art-text',
  )

  const openTextEditor = (kind: 'text' | 'art') => {
    setTextEditor(kind)
    setEditingTextId(null)
    setArtTemplate('travel')
    setTextDraft(kind === 'text' ? TEXT_PRESETS.body.placeholder : ART_TEXT_OPTIONS[1].sample)
  }

  const editExistingText = (element: TextElement | ArtTextElement) => {
    setTextEditor(element.kind === 'art-text' ? 'art' : 'text')
    setEditingTextId(element.id)
    setTextDraft(element.data.text)
    if (element.kind === 'art-text') setArtTemplate(element.data.templateId)
  }

  const saveText = () => {
    const value = textDraft.trim()
    if (!value) {
      show('先输入文字内容', { tone: 'error' })
      return
    }
    void (async () => {
      if (editingTextId) {
        await withCurrentPage(() => {
          useEditorStore.getState().updateElements(
            [editingTextId],
            (element) => {
              if (element.kind === 'text') return { ...element, data: { ...element.data, text: value } }
              if (element.kind === 'art-text') return { ...element, data: { ...element.data, text: value, templateId: artTemplate } }
              return element
            },
            '编辑文字',
          )
        })
        show('文字已更新')
      } else {
        await withCurrentPage((pageId) => {
          const editor = useEditorStore.getState()
          if (textEditor === 'art') editor.addArtTextElement(artTemplate, { pageId, text: value })
          else editor.addTextElement('body', { pageId, text: value })
        })
        show('文字已添加')
      }
      setTextEditor(null)
      setEditingTextId(null)
    })()
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      // 告诉 Reader 左侧要给浮动按钮让出多少位置（避免压住书名）
      style={{ ['--reader-top-inset' as string]: '4.5rem' }}
    >
      <Reader
        key={initialIndex}
        album={album}
        initialIndex={initialIndex}
        onIndexChange={setCurrent}
        navigationRequest={navigationRequest}
        onMoveTextElement={(elementId, x, y) => {
          void withCurrentPage(() => {
            useEditorStore.getState().updateElements(
              [elementId],
              (element) => ({ ...element, x, y }),
              '移动文字',
            )
          })
        }}
      />

      {/* 打开书后的轻量 DIY 工具栏：不离开实体书阅读体验。 */}
      <div className="absolute left-1/2 top-5 z-40 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-ink-850/92 p-1.5 shadow-xl backdrop-blur-xl">
        <button className="reader-diy-btn" onClick={() => setPaperPickerOpen(true)} title="在当前纸张后添加一张双面纸"><Plus className="h-3.5 w-3.5" />添加纸张</button>
        <button className="reader-diy-btn" onClick={() => photoInput.current?.click()} title="上传照片并贴到当前页"><ImagePlus className="h-3.5 w-3.5" />照片</button>
        <button className="reader-diy-btn" onClick={() => openTextEditor('text')} title="输入并添加文字"><Type className="h-3.5 w-3.5" />文字</button>
        <button className="reader-diy-btn" onClick={() => openTextEditor('art')} title="选择样式并编辑艺术字"><Sparkles className="h-3.5 w-3.5" />艺术字</button>
      </div>
      <input ref={photoInput} type="file" accept="image/*" multiple className="hidden" onChange={(event) => {
        const files = Array.from(event.target.files ?? [])
        event.target.value = ''
        if (!files.length) return
        void (async () => {
          try {
            const result = await uploadPhotos(files)
            await withCurrentPage((pageId) => result.assets.forEach((asset, index) => useEditorStore.getState().addPhotoElement(asset, { pageId, x: 150 + index * 20, y: 220 + index * 20 })))
            if (result.failed.length) show(`${result.failed.length} 张照片未能添加`, { tone: 'error' })
          } catch { show('照片上传失败，请重试', { tone: 'error' }) }
        })()
      }} />

      {textEditor && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-ink-850 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-base text-ink-100">{editingTextId ? '编辑文字' : textEditor === 'art' ? '添加艺术字' : '添加文字'}</h2>
                <p className="mt-1 text-xs text-ink-500">输入内容后即可放到当前页。</p>
              </div>
              <button className="tool-btn h-7 w-7" onClick={() => setTextEditor(null)} title="关闭"><X className="h-3.5 w-3.5" /></button>
            </div>

            {textEditor === 'art' && (
              <div className="mb-3 grid grid-cols-3 gap-2">
                {ART_TEXT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => {
                      setArtTemplate(option.id)
                      if (!editingTextId) setTextDraft(option.sample)
                    }}
                    className={`rounded-lg border px-2 py-2 text-left transition ${artTemplate === option.id ? 'border-clay-500 bg-clay-500/10 text-ink-100' : 'border-white/10 bg-ink-800/50 text-ink-400 hover:border-white/20'}`}
                  >
                    <span className="block text-xs">{option.name}</span>
                    <span className="mt-1 block truncate text-[10px] opacity-70">{option.sample}</span>
                  </button>
                ))}
              </div>
            )}

            <textarea
              autoFocus
              value={textDraft}
              onChange={(event) => setTextDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') saveText()
                if (event.key === 'Escape') setTextEditor(null)
              }}
              rows={4}
              placeholder="写下想放在这一页的内容…"
              className="field w-full resize-y text-sm leading-relaxed"
            />

            {currentTextElements.length > 0 && !editingTextId && (
              <div className="mt-4">
                <div className="mb-2 text-[10px] text-ink-500">也可以修改当前页已有文字</div>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                  {currentTextElements.map((element) => (
                    <button
                      key={element.id}
                      onClick={() => editExistingText(element)}
                      className="max-w-full truncate rounded-lg bg-ink-800 px-2.5 py-1.5 text-left text-[11px] text-ink-300 hover:bg-ink-700"
                    >
                      {element.kind === 'art-text' ? '艺术字 · ' : '文字 · '}{element.data.text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setTextEditor(null)}>取消</button>
              <button className="btn-primary" onClick={saveText}>{editingTextId ? '保存修改' : '添加到页面'}</button>
            </div>
          </div>
        </div>
      )}

      {paperPickerOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-ink-850 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between"><div><h2 className="text-base text-ink-100">选择纸张</h2><p className="mt-1 text-xs text-ink-500">新纸有正反两面，会接在当前纸张后。</p></div><button className="tool-btn h-7 w-7" onClick={() => setPaperPickerOpen(false)}><X className="h-3.5 w-3.5" /></button></div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">{PAPER_LIST.map((paper) => <button key={paper.id} className="overflow-hidden rounded-xl border border-white/10 text-left transition hover:border-clay-500" onClick={() => addPaper(paper)}><span className="block h-16" style={{ backgroundColor: paper.color }} /><span className="block px-2 py-1.5 text-xs text-ink-300">{paper.name}</span></button>)}</div>
          </div>
        </div>
      )}

      {/* 浮动操作栏 */}
      <div className="absolute left-5 top-5 z-40 flex items-center gap-1.5">
        <Link to="/" className="tool-btn h-9 w-9 backdrop-blur" title="返回书架">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Link
          to={`/album/${album.id}/edit`}
          className="tool-btn h-9 w-9 backdrop-blur"
          title="继续编辑"
        >
          <PencilLine className="h-4 w-4" />
        </Link>
      </div>

      <div className="absolute right-5 top-5 z-40 flex items-center gap-1.5">
        <button
          className="tool-btn h-9 w-9 backdrop-blur"
          onClick={() => setThumbsOpen((value) => !value)}
          data-active={thumbsOpen}
          title="页面缩略图"
        >
          <Images className="h-4 w-4" />
        </button>
        <button
          className="tool-btn h-9 w-9 backdrop-blur"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(`${window.location.origin}/share/${slug}`)
              .then(() => show('分享链接已复制'))
              .catch(() => show('复制失败，请手动复制地址栏链接', { tone: 'error' }))
          }}
          title="复制分享链接"
        >
          <Share2 className="h-4 w-4" />
        </button>
      </div>

      {/* 缩略图抽屉 */}
      <div
        className={`absolute inset-x-0 bottom-0 z-40 transition-transform duration-300 ${
          thumbsOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto max-w-5xl px-4 pb-3">
          <div className="panel flex gap-3 overflow-x-auto p-3">
            {album.pages.map((page, index) => (
              <button
                key={page.id}
                onClick={() => {
                  navigate(`/album/${album.id}/read/${index}`, { replace: true })
                  setThumbsOpen(false)
                }}
                className={`shrink-0 overflow-hidden rounded-md transition-all ${
                  index === current ? 'ring-2 ring-clay-500' : 'opacity-75 ring-1 ring-white/10 hover:opacity-100'
                }`}
              >
                <PageThumb page={page} width={72} height={90} pageSize={album.pageSize} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <Toast toast={toast} />
    </div>
  )
}
