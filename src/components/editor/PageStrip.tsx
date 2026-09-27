import { useEffect, useRef, useState } from 'react'
import { BookOpen, Copy, Plus, Trash2 } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { PageThumb } from './PageThumb'
import { PAPER_LIST } from '@/lib/designTokens'

/**
 * 底部页面缩略图条。
 *
 * 支持：点击切换、拖拽排序、复制、删除、新增。
 * 当前页会滚入可视区域，避免页数多的时候「找不到自己在哪」。
 */

export function PageStrip() {
  const album = useEditorStore((state) => state.album)
  const activePageId = useEditorStore((state) => state.activePageId)
  const setActivePage = useEditorStore((state) => state.setActivePage)
  const addPage = useEditorStore((state) => state.addPage)
  const duplicatePage = useEditorStore((state) => state.duplicatePage)
  const removePage = useEditorStore((state) => state.removePage)
  const movePage = useEditorStore((state) => state.movePage)
  const [choosingPaper, setChoosingPaper] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  const dragIndex = useRef<number | null>(null)

  // 当前页始终可见
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [activePageId])

  if (!album) return null
  const sheetCount = album.pageLayout === 'duplex'
    ? new Set(album.pages.map((page) => page.sheetId)).size
    : album.pages.length

  return (
    <div className="relative z-20 shrink-0 border-t border-white/[0.06] bg-ink-900/80 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-ink-500">
          <BookOpen className="h-3.5 w-3.5" />
          <span className="tabular-nums">
            {album.pages.findIndex((p) => p.id === activePageId) + 1}/{album.pages.length}
          </span>
        </div>

        <div
          ref={scrollRef}
          className="no-scrollbar flex min-w-0 flex-1 items-end gap-2 overflow-x-auto pb-0.5"
        >
          {album.pages.map((page, index) => {
            const active = page.id === activePageId
            return (
              <div
                key={page.id}
                className="group relative shrink-0"
                draggable
                onDragStart={() => {
                  dragIndex.current = index
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const from = dragIndex.current
                  if (from !== null && from !== index) movePage(from, index)
                  dragIndex.current = null
                }}
                onDragEnd={() => {
                  dragIndex.current = null
                }}
              >
                <button
                  ref={active ? activeRef : undefined}
                  onClick={() => setActivePage(page.id)}
                  className={`block overflow-hidden rounded-md transition-all duration-200 ${
                    active
                      ? 'ring-2 ring-clay-500'
                      : 'opacity-70 ring-1 ring-white/10 hover:opacity-100 hover:ring-white/25'
                  }`}
                  title={`${index + 1}. ${page.title}`}
                >
                  <PageThumb page={page} width={54} height={68} pageSize={album.pageSize} />
                </button>

                <div
                  className={`mt-1 max-w-[54px] truncate text-center text-[9px] ${
                    active ? 'text-ink-200' : 'text-ink-600'
                  }`}
                >
                  {page.title}
                </div>

                {/* 悬停操作 */}
                <div className="absolute -top-1 right-0 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    className="flex h-5 w-5 items-center justify-center rounded bg-ink-800/95 text-ink-300 shadow hover:bg-ink-600 hover:text-white"
                    title="复制页面"
                    onClick={(event) => {
                      event.stopPropagation()
                      duplicatePage(page.id)
                    }}
                  >
                    <Copy className="h-2.5 w-2.5" />
                  </button>
                  {sheetCount > 1 && (
                    <button
                      className="flex h-5 w-5 items-center justify-center rounded bg-ink-800/95 text-ink-300 shadow hover:bg-clay-600 hover:text-white"
                      title="删除页面"
                      onClick={(event) => {
                        event.stopPropagation()
                        removePage(page.id)
                      }}
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* 新增页面 */}
          <button
            onClick={() => setChoosingPaper(true)}
            className="flex h-[68px] w-[54px] shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-ink-600 text-ink-500 transition-all hover:border-clay-500/60 hover:bg-ink-800/50 hover:text-ink-200"
            title="添加一张纸"
          >
            <Plus className="h-4 w-4" />
            <span className="text-[9px]">添纸</span>
          </button>
        </div>

        <div className="hidden shrink-0 text-[10px] leading-relaxed text-ink-600 lg:block">
          拖拽缩略图
          <br />
          可调整顺序
        </div>
      </div>
      {choosingPaper && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 w-[420px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border border-white/10 bg-ink-850 p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between"><div><div className="text-sm text-ink-100">选择一张纸</div><div className="mt-0.5 text-[10px] text-ink-500">这会接在当前页面之后，你之后也可以随时更换。</div></div><button className="text-xs text-ink-500 hover:text-ink-200" onClick={() => setChoosingPaper(false)}>取消</button></div>
          <div className="grid grid-cols-4 gap-2">{PAPER_LIST.map((paper) => <button key={paper.id} onClick={() => { addPage({ afterPageId: activePageId, title: paper.name + '新页', background: { color: paper.color, paper: paper.id, lineColor: paper.lineColor, vignette: 0.2 } }); setChoosingPaper(false) }} className="overflow-hidden rounded-lg border border-white/10 text-left hover:border-clay-500"><span className="block h-11" style={{ backgroundColor: paper.color, backgroundImage: paper.id === 'grid' ? `linear-gradient(to right, ${paper.lineColor} 1px, transparent 1px), linear-gradient(to bottom, ${paper.lineColor} 1px, transparent 1px)` : undefined, backgroundSize: '10px 10px' }} /><span className="block px-1.5 py-1 text-[10px] text-ink-300">{paper.name}</span></button>)}</div>
        </div>
      )}
    </div>
  )
}
