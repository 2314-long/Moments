import { useState } from 'react'
import { Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { BACKGROUND_PRESETS, PAPERS, PAPER_LIST } from '@/lib/designTokens'
import { PageThumb } from '@/components/editor/PageThumb'

/**
 * 页面管理 + 版式面板。
 *
 * 「页面」与「版式」放在同一个面板里，是因为它们服务同一个意图：
 * 调整这本册子的结构。用户不需要在两个概念之间来回切换。
 */
export function PagePanel() {
  const album = useEditorStore((state) => state.album)
  const activePageId = useEditorStore((state) => state.activePageId)
  const setActivePage = useEditorStore((state) => state.setActivePage)
  const addPage = useEditorStore((state) => state.addPage)
  const duplicatePage = useEditorStore((state) => state.duplicatePage)
  const removePage = useEditorStore((state) => state.removePage)
  const movePage = useEditorStore((state) => state.movePage)
  const setPageBackground = useEditorStore((state) => state.setPageBackground)
  const updatePage = useEditorStore((state) => state.updatePage)

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  if (!album) return null

  const activePage = album.pages.find((p) => p.id === activePageId)

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* 页面列表 */}
      <div className="px-3 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] tracking-wider text-ink-500">页面 · {album.pages.length}</span>
          <button
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-ink-400 transition-colors hover:bg-ink-700 hover:text-ink-100"
            onClick={() => addPage({ afterPageId: activePageId })}
          >
            <Plus className="h-3 w-3" />
            新增
          </button>
        </div>

        <div className="space-y-1">
          {album.pages.map((page, index) => {
            const active = page.id === activePageId
            return (
              <div
                key={page.id}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => {
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  setOverIndex(index)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (dragIndex !== null && dragIndex !== index) movePage(dragIndex, index)
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                onClick={() => setActivePage(page.id)}
                className={`group flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 transition-all ${
                  active ? 'bg-ink-700/80' : 'hover:bg-ink-800/70'
                } ${overIndex === index && dragIndex !== null && dragIndex !== index ? 'ring-1 ring-clay-500/70' : ''}`}
              >
                <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-ink-600 group-hover:text-ink-400" />
                <PageThumb page={page} width={26} height={32} className="shrink-0 rounded-[2px] shadow-sm" />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[11px] ${active ? 'text-ink-100' : 'text-ink-300'}`}>
                    {page.title}
                  </span>
                  <span className="block text-[9px] text-ink-600">
                    {index + 1} · {page.elements.length} 个元素
                  </span>
                </span>
                <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    className="flex h-5 w-5 items-center justify-center rounded text-ink-400 hover:bg-ink-600 hover:text-ink-100"
                    title="复制这一页"
                    onClick={(e) => {
                      e.stopPropagation()
                      duplicatePage(page.id)
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <button
                    className="flex h-5 w-5 items-center justify-center rounded text-ink-400 hover:bg-clay-600 hover:text-white disabled:opacity-30"
                    title="删除这一页"
                    disabled={album.pages.length <= 1}
                    onClick={(e) => {
                      e.stopPropagation()
                      removePage(page.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 当前页设置 */}
      {activePage && (
        <>
          <div className="mt-4 px-3">
            <div className="mb-2 text-[10px] tracking-wider text-ink-500">当前页标题</div>
            <input
              value={activePage.title}
              onChange={(event) => updatePage(activePage.id, { title: event.target.value }, '修改页标题')}
              className="field !py-1.5 text-xs"
              placeholder="页面标题"
            />
          </div>

          <div className="mt-4 px-3">
            <div className="mb-2 text-[10px] tracking-wider text-ink-500">纸张</div>
            <div className="flex flex-wrap gap-1">
              {PAPER_LIST.map((paper) => (
                <button
                  key={paper.id}
                  onClick={() =>
                    setPageBackground(
                      activePage.id,
                      {
                        ...activePage.background,
                        paper: paper.id,
                        lineColor: paper.lineColor,
                      },
                      '更换纸张',
                    )
                  }
                  className={`rounded-lg px-2 py-1 text-[10px] transition-colors ${
                    activePage.background.paper === paper.id
                      ? 'bg-ink-700 text-ink-100'
                      : 'bg-ink-800/50 text-ink-400 hover:bg-ink-700/60'
                  }`}
                >
                  {paper.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 px-3">
            <div className="mb-2 text-[10px] tracking-wider text-ink-500">底色</div>
            <div className="grid grid-cols-5 gap-1.5">
              {BACKGROUND_PRESETS.map((preset) => {
                const active =
                  activePage.background.color === preset.color &&
                  activePage.background.paper === preset.paper
                return (
                  <button
                    key={preset.name}
                    title={preset.name}
                    onClick={() =>
                      setPageBackground(
                        activePage.id,
                        {
                          ...activePage.background,
                          color: preset.color,
                          paper: preset.paper,
                          lineColor: PAPERS[preset.paper].lineColor,
                        },
                        '更换底色',
                      )
                    }
                    className={`aspect-square rounded-lg border transition-all ${
                      active ? 'border-clay-500 ring-1 ring-clay-500/40' : 'border-white/10 hover:border-white/25'
                    }`}
                    style={{ backgroundColor: preset.color }}
                  />
                )
              })}
            </div>
          </div>

          <div className="mt-4 px-3">
            <label className="flex items-center justify-between rounded-xl bg-ink-800/50 px-2.5 py-2">
              <span className="text-[11px] text-ink-300">页面暗角</span>
              <input
                type="range"
                min={0}
                max={0.7}
                step={0.02}
                value={activePage.background.vignette ?? 0}
                onChange={(event) =>
                  setPageBackground(
                    activePage.id,
                    { ...activePage.background, vignette: Number(event.target.value) },
                    '调整暗角',
                  )
                }
                className="w-24"
              />
            </label>
          </div>
        </>
      )}

      <div className="mt-4 px-3 pb-3">
        <div className="rounded-xl bg-ink-800/40 p-2.5 text-[10px] leading-relaxed text-ink-600">
          拖拽页面条目可以调整顺序；页面顺序会直接决定翻页顺序。
        </div>
      </div>
    </div>
  )
}
