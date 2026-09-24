import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  Check,
  Cloud,
  CloudOff,
  Grid3x3,
  Loader2,
  PanelRight,
  Redo2,
  Save,
  Share2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'

/**
 * 编辑器顶部工具栏。
 *
 * 信息层级：左边「我在哪」(返回 + 册名)，中间「我在第几页」，
 * 右边「我能做什么」(撤销重做 / 预览 / 保存 / 分享)。
 * 保存状态常驻显示，避免用户不确定内容有没有存下来。
 */

export interface EditorTopBarProps {
  albumTitle: string
  pageIndex: number
  pageCount: number
  canUndo: boolean
  canRedo: boolean
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  lastSavedAt: string | null
  degraded: boolean
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  onShare: () => void
  onPreview: () => void
  onRename: (title: string) => void
}

export function EditorTopBar({
  albumTitle,
  pageIndex,
  pageCount,
  canUndo,
  canRedo,
  saveState,
  lastSavedAt,
  degraded,
  onUndo,
  onRedo,
  onSave,
  onShare,
  onPreview,
  onRename,
}: EditorTopBarProps) {
  const zoom = useEditorStore((state) => state.zoom)
  const setZoom = useEditorStore((state) => state.setZoom)
  const showGrid = useEditorStore((state) => state.showGrid)
  const toggleGrid = useEditorStore((state) => state.toggleGrid)
  const toggleRightPanel = useEditorStore((state) => state.toggleRightPanel)

  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(albumTitle)

  return (
    <header className="relative z-30 flex shrink-0 items-center gap-3 border-b border-white/[0.06] bg-ink-900/80 px-3 py-2.5 backdrop-blur-xl">
      {/* 左：返回 + 标题 */}
      <Link to="/" className="tool-btn h-8 w-8" title="返回书架">
        <ArrowLeft className="h-4 w-4" />
      </Link>

      <div className="flex min-w-0 items-center gap-2">
        {editingTitle ? (
          <input
            autoFocus
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={() => {
              setEditingTitle(false)
              if (draftTitle.trim() && draftTitle !== albumTitle) onRename(draftTitle.trim())
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                setDraftTitle(albumTitle)
                setEditingTitle(false)
              }
            }}
            className="field !w-48 !py-1 text-xs"
          />
        ) : (
          <button
            className="max-w-[220px] truncate rounded-lg px-2 py-1 text-left text-[13px] text-ink-100 transition-colors hover:bg-ink-800"
            onClick={() => {
              setDraftTitle(albumTitle)
              setEditingTitle(true)
            }}
            title="点击重命名"
          >
            {albumTitle}
          </button>
        )}
      </div>

      {/* 中：页码 */}
      <div className="hidden flex-1 items-center justify-center gap-2 md:flex">
        <span className="chip !py-1 !text-[10px] tabular-nums">
          第 {pageIndex + 1} / {pageCount} 页
        </span>
      </div>
      <div className="flex-1 md:hidden" />

      {/* 右：操作 */}
      <div className="flex items-center gap-1">
        <SaveIndicator saveState={saveState} lastSavedAt={lastSavedAt} degraded={degraded} />

        <div className="mx-1 h-5 w-px bg-white/10" />

        <button
          className="tool-btn h-8 w-8 disabled:opacity-30"
          onClick={onUndo}
          disabled={!canUndo}
          title="撤销 (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          className="tool-btn h-8 w-8 disabled:opacity-30"
          onClick={onRedo}
          disabled={!canRedo}
          title="重做 (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" />
        </button>

        <div className="mx-1 h-5 w-px bg-white/10" />

        {/* 缩放 */}
        <div className="hidden items-center gap-0.5 rounded-lg bg-ink-800/60 px-1 lg:flex">
          <button
            className="flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:bg-ink-700 hover:text-ink-100"
            onClick={() => setZoom(zoom - 0.08)}
            title="缩小"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            className="min-w-[38px] text-center text-[10px] tabular-nums text-ink-300 hover:text-ink-100"
            onClick={() => setZoom(0.72)}
            title="恢复默认缩放"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:bg-ink-700 hover:text-ink-100"
            onClick={() => setZoom(zoom + 0.08)}
            title="放大"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          className="tool-btn h-8 w-8"
          onClick={toggleGrid}
          data-active={showGrid}
          title="网格辅助线"
        >
          <Grid3x3 className="h-4 w-4" />
        </button>
        <button className="tool-btn h-8 w-8" onClick={toggleRightPanel} title="显示/隐藏属性面板">
          <PanelRight className="h-4 w-4" />
        </button>

        <div className="mx-1 h-5 w-px bg-white/10" />

        <button className="btn-ghost !py-1.5 !text-xs" onClick={onPreview}>
          <BookOpen className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">预览</span>
        </button>
        <button className="btn-subtle !py-1.5 !text-xs" onClick={onShare} title="分享">
          <Share2 className="h-3.5 w-3.5" />
        </button>
        <button className="btn-primary !py-1.5 !text-xs" onClick={onSave}>
          <Save className="h-3.5 w-3.5" />
          保存
        </button>
      </div>
    </header>
  )
}

function SaveIndicator({
  saveState,
  lastSavedAt,
  degraded,
}: {
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  lastSavedAt: string | null
  degraded: boolean
}) {
  if (degraded) {
    return (
      <span className="hidden items-center gap-1.5 text-[10px] text-clay-400 sm:flex" title="IndexedDB 不可用，本次编辑不会被保存">
        <CloudOff className="h-3.5 w-3.5" />
        临时模式
      </span>
    )
  }

  const text =
    saveState === 'saving'
      ? '保存中…'
      : saveState === 'error'
        ? '保存失败'
        : saveState === 'saved'
          ? `已保存 ${formatTime(lastSavedAt)}`
          : '已自动保存'

  return (
    <span
      className={`hidden items-center gap-1.5 text-[10px] sm:flex ${
        saveState === 'error' ? 'text-clay-400' : 'text-ink-500'
      }`}
    >
      {saveState === 'saving' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : saveState === 'saved' ? (
        <Check className="h-3 w-3 text-moss-500" />
      ) : (
        <Cloud className="h-3 w-3" />
      )}
      {text}
    </span>
  )
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
