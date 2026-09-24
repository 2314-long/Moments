import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Images, PencilLine, Share2 } from 'lucide-react'
import { useLibraryStore } from '@/store/libraryStore'
import { useEditorStore } from '@/store/editorStore'
import { Reader } from '@/components/reader/Reader'
import { PageThumb } from '@/components/editor/PageThumb'
import { Toast, useToast } from '@/components/ui/Toast'

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

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Reader
        key={initialIndex}
        album={album}
        initialIndex={initialIndex}
        onIndexChange={setCurrent}
      />

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
