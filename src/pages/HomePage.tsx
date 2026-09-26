import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BookPlus,
  Images,
  Search,
  MoreHorizontal,
  Trash2,
  PencilLine,
  Settings2,
  X,
  Sparkles,
} from 'lucide-react'
import { useLibraryStore } from '@/store/libraryStore'
import { usePhotoStore } from '@/store/photoStore'
import { deleteAlbum, persistAlbum, resetLibrary } from '@/persistence'
import { BookCover, formatRange } from '@/components/album/BookCover'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Toast, useToast } from '@/components/ui/Toast'
import type { Album } from '@/types/album'
import { useBookOpening } from '@/components/transition/BookOpeningTransition'

/**
 * 首页 —— 「我的纪念册」。
 *
 * 刻意不做成 Dashboard：没有统计卡片、没有图表。
 * 这里应该像一个书架：每本册子都以实体书封面呈现，
 * 鼠标悬停时书本轻轻抬起，暗示「可以打开」。
 */
export function HomePage() {
  const albums = useLibraryStore((state) => state.albums)
  const photoCount = usePhotoStore((state) => state.assets.length)
  const navigate = useNavigate()
  const { openAlbum, opening } = useBookOpening()
  const { toast, show } = useToast()

  const [query, setQuery] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [deleting, setDeleting] = useState<Album | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return albums
    return albums.filter((album) =>
      [album.title, album.subtitle, album.location?.name, album.location?.region]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q)),
    )
  }, [albums, query])

  const totalPages = albums.reduce((sum, album) => sum + album.pages.length, 0)

  async function handleRename() {
    if (!renaming) return
    const title = renaming.value.trim()
    if (!title) return
    const album = albums.find((a) => a.id === renaming.id)
    if (album) {
      await persistAlbum({ ...album, title, updatedAt: new Date().toISOString() })
      show('已重命名')
    }
    setRenaming(null)
  }

  async function handleDelete() {
    if (!deleting) return
    await deleteAlbum(deleting.id)
    show(`已删除《${deleting.title}》`)
    setDeleting(null)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* -------------------------------- 顶部栏 */}
      <header className="relative z-20 flex shrink-0 items-center gap-4 px-7 py-4">
        <Link to="/" className="group flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-clay-500 to-clay-600 shadow-lg">
            <span className="font-serif text-base leading-none text-white">时</span>
          </div>
          <div className="leading-tight">
            <div className="font-serif text-[15px] tracking-[0.16em] text-ink-100">时光册</div>
            <div className="text-[9px] tracking-[0.24em] text-ink-500">SHIGUANGCE</div>
          </div>
        </Link>

        <div className="ml-4 hidden items-baseline gap-2 md:flex">
          <h1 className="text-sm text-ink-300">我的纪念册</h1>
          <span className="text-[11px] text-ink-500">
            {albums.length} 本 · {totalPages} 页
          </span>
        </div>

        <div className="flex-1" />

        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索纪念册"
            className="field w-56 pl-8 pr-7"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-200"
              aria-label="清空搜索"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Link to="/photos" className="btn-ghost hidden md:inline-flex" title="我的照片素材库">
          <Images className="h-4 w-4" />
          <span className="hidden lg:inline">素材库</span>
          <span className="chip !px-1.5 !py-0 !text-[10px]">{photoCount}</span>
        </Link>

        <button className="tool-btn h-9 w-9" onClick={() => setSettingsOpen(true)} title="设置">
          <Settings2 className="h-4 w-4" />
        </button>

        <div className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-ink-700 text-xs text-ink-200 ring-1 ring-white/10">
          我
        </div>
      </header>

      {/* -------------------------------- 书架 */}
      <main className="relative flex-1 overflow-y-auto px-7 pb-16 pt-2">
        {/* 背景光束，极弱 */}
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2 opacity-40"
          style={{
            background: 'radial-gradient(ellipse at top, rgba(120,140,180,0.16), transparent 68%)',
          }}
        />

        <div className="relative mx-auto max-w-[1500px]">
          {/* 新建卡片 */}
          <div className="mb-6 flex items-center gap-4">
            <Link
              to="/create"
              className="group inline-flex items-center gap-2.5 rounded-2xl border border-dashed border-ink-600 bg-ink-850/50 px-5 py-3 text-sm text-ink-300 transition-all hover:border-clay-500/60 hover:bg-ink-800/70 hover:text-ink-100"
            >
              <BookPlus className="h-4 w-4 transition-transform group-hover:scale-110" />
              创建纪念册
            </Link>
            <span className="hidden text-[11px] text-ink-500 sm:block">
              上传一组照片，剩下的交给时光册
            </span>
          </div>

          {filtered.length === 0 ? (
            <EmptyShelf
              hasQuery={Boolean(query)}
              onCreate={() => navigate('/create')}
              onReset={async () => {
                await resetLibrary()
                show('已恢复演示纪念册')
              }}
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-x-7 gap-y-10">
              {filtered.map((album, index) => (
                <AlbumBookCard
                  key={album.id}
                  album={album}
                  index={index}
                  onOpen={(source) => {
                    if (opening) return
                    openAlbum(album, source)
                    // 先切到阅读路由，让 Reader 在过渡层下面提前挂载、解析照片。
                    // 用户在整个过程中只看到上面的共享书本视觉层。
                    navigate(`/album/${album.id}/read`)
                  }}
                  onEdit={() => navigate(`/album/${album.id}/edit`)}
                  menuOpen={menuFor === album.id}
                  onToggleMenu={() => setMenuFor(menuFor === album.id ? null : album.id)}
                  onRename={() => {
                    setRenaming({ id: album.id, value: album.title })
                    setMenuFor(null)
                  }}
                  onDelete={() => {
                    setDeleting(album)
                    setMenuFor(null)
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* -------------------------------- 弹层 */}
      {renaming && (
        <Modal onClose={() => setRenaming(null)} title="重命名纪念册">
          <input
            autoFocus
            value={renaming.value}
            onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleRename()
              if (e.key === 'Escape') setRenaming(null)
            }}
            className="field"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setRenaming(null)}>
              取消
            </button>
            <button className="btn-primary" onClick={() => void handleRename()}>
              保存
            </button>
          </div>
        </Modal>
      )}

      {settingsOpen && (
        <Modal onClose={() => setSettingsOpen(false)} title="设置">
          <div className="space-y-4 text-sm text-ink-300">
            <div className="flex items-center justify-between rounded-xl bg-ink-800/60 px-3.5 py-3">
              <div>
                <div className="text-ink-100">照片素材库</div>
                <div className="mt-0.5 text-[11px] text-ink-500">{photoCount} 张照片</div>
              </div>
              <Link to="/photos" className="btn-subtle" onClick={() => setSettingsOpen(false)}>
                管理
              </Link>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-ink-800/60 px-3.5 py-3">
              <div>
                <div className="text-ink-100">恢复演示数据</div>
                <div className="mt-0.5 text-[11px] text-ink-500">
                  重新生成《九寨沟旅行记》，不会删除已有纪念册之外的内容
                </div>
              </div>
              <button
                className="btn-subtle"
                onClick={async () => {
                  await resetLibrary()
                  setSettingsOpen(false)
                  show('已恢复演示纪念册')
                }}
              >
                恢复
              </button>
            </div>
            <p className="px-1 text-[11px] leading-relaxed text-ink-500">
              所有数据保存在本机浏览器（IndexedDB）。照片原文件与纪念册数据都不会上传到服务器，
              可以离线使用。
            </p>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`删除《${deleting?.title ?? ''}》？`}
        description="删除后无法恢复（可以用 Ctrl + Z 撤回上一次编辑，但删除纪念册不可撤销）。"
        confirmText="删除"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
      />

      <Toast toast={toast} />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 书架卡片
 * ------------------------------------------------------------------ */

function AlbumBookCard({
  album,
  index,
  onOpen,
  onEdit,
  menuOpen,
  onToggleMenu,
  onRename,
  onDelete,
}: {
  album: Album
  index: number
  onOpen: (source: HTMLElement) => void
  onEdit: () => void
  menuOpen: boolean
  onToggleMenu: () => void
  onRename: () => void
  onDelete: () => void
}) {
  // 每本书有一点固定的倾斜，让书架看起来是「摆上去的」而不是网格
  const tilt = ((index % 3) - 1) * 0.7

  return (
    <div className="group relative animate-fade-up" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <div
        className="relative cursor-pointer transition-transform duration-300 ease-out will-change-transform group-hover:-translate-y-2"
        style={{ transform: `rotate(${tilt}deg)` }}
        onClick={(event) => onOpen(event.currentTarget)}
        onDoubleClick={onEdit}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpen(e.currentTarget)
        }}
      >
        <div className="transition-transform duration-300 group-hover:rotate-[0.6deg]">
          <BookCover album={album} width={196} height={261} />
        </div>

        {/* Hover 遮罩 + 打开提示 */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[3px] bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="translate-y-2 rounded-full bg-white/92 px-3.5 py-1.5 text-[11px] font-medium text-ink-900 shadow-xl transition-transform duration-300 group-hover:translate-y-0">
            打开纪念册
          </span>
        </div>
      </div>

      {/* 书本下方的投影，增强「放在桌面上」的感觉 */}
      <div
        className="pointer-events-none mx-auto h-3 w-[86%] rounded-[50%] bg-black/40 blur-md transition-all duration-300 group-hover:w-[92%] group-hover:bg-black/50"
        style={{ marginTop: -6 }}
      />

      {/* 文字信息 */}
      <div className="mt-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-ink-100">{album.title}</div>
          <div className="mt-0.5 truncate text-[11px] text-ink-500">
            {formatRange(album.startDate, album.endDate)}
            {album.location?.name ? ` · ${album.location.name}` : ''}
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            className="tool-btn h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              onToggleMenu()
            }}
            aria-label="更多操作"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={onToggleMenu} />
              <div className="panel absolute right-0 top-7 z-40 w-36 animate-pop-in overflow-hidden p-1">
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-ink-300 hover:bg-ink-700/70 hover:text-ink-100"
                  onClick={onEdit}
                >
                  <PencilLine className="h-3.5 w-3.5" />
                  编辑内容
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-ink-300 hover:bg-ink-700/70 hover:text-ink-100"
                  onClick={onRename}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  重命名
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-clay-400 hover:bg-clay-600/20"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-1 text-[10px] text-ink-600">
        {album.pages.length} 页 · {album.photoIds.length} 张照片
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 空状态
 * ------------------------------------------------------------------ */

function EmptyShelf({
  hasQuery,
  onCreate,
  onReset,
}: {
  hasQuery: boolean
  onCreate: () => void
  onReset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-ink-700 bg-ink-850/60">
        <BookPlus className="h-6 w-6 text-ink-400" />
      </div>
      {hasQuery ? (
        <>
          <p className="text-sm text-ink-300">没有找到匹配的纪念册</p>
          <p className="mt-1 text-xs text-ink-500">换个关键词试试</p>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-300">书架还是空的</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-500">
            上传一组照片，时光册会把它们整理成一本可以翻阅、编辑和装饰的纪念册。
          </p>
          <div className="mt-5 flex gap-2">
            <button className="btn-primary" onClick={onCreate}>
              创建第一本纪念册
            </button>
            <button className="btn-ghost" onClick={() => void onReset()}>
              载入演示数据
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 通用弹窗
 * ------------------------------------------------------------------ */

export function Modal({
  title,
  children,
  onClose,
  width = 380,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  width?: number
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="panel relative animate-pop-in p-5" style={{ width }}>
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink-100">{title}</h2>
          <button className="tool-btn h-7 w-7" onClick={onClose} aria-label="关闭">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
