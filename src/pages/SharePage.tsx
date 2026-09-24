import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BookHeart, Copy, Check } from 'lucide-react'
import { useLibraryStore } from '@/store/libraryStore'
import { Reader } from '@/components/reader/Reader'
import { BookCover } from '@/components/album/BookCover'
import { Toast, useToast } from '@/components/ui/Toast'

/**
 * 分享页。
 *
 * 定位：别人点开链接后看到的东西。
 * 因此这一页刻意「只读」——没有编辑入口、没有工具栏，
 * 只有一本书和一句话，让注意力全部落在内容上。
 */
export function SharePage() {
  const { slug = '' } = useParams()
  const albums = useLibraryStore((state) => state.albums)
  const { toast, show } = useToast()
  const [copied, setCopied] = useState(false)
  const [reading, setReading] = useState(false)

  const album = useMemo(
    () => albums.find((entry) => entry.share?.slug === slug || entry.id === slug),
    [albums, slug],
  )

  if (!album) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-ink-300">这个分享链接已经失效</p>
        <Link to="/" className="btn-primary">
          去看看时光册
        </Link>
      </div>
    )
  }

  if (reading) {
    return (
      <div className="relative h-full w-full overflow-hidden">
        <Reader album={album} initialIndex={0} />
        <button
          className="absolute left-5 top-5 z-40 tool-btn h-9 w-9 backdrop-blur"
          onClick={() => setReading(false)}
        >
          ←
        </button>
      </div>
    )
  }

  const shareUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/share/${album.share?.slug ?? album.id}`

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-10 px-6 py-14 lg:flex-row lg:gap-16">
        {/* 封面 */}
        <div className="animate-fade-up">
          <BookCover album={album} width={268} height={357} />
        </div>

        {/* 信息 */}
        <div className="w-full max-w-md animate-fade-up text-center lg:text-left">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-ink-850/70 px-3 py-1 text-[10px] text-ink-400">
            <BookHeart className="h-3 w-3" />
            有人和你分享了一本纪念册
          </div>

          <h1 className="mt-4 font-serif text-3xl leading-tight text-ink-100">{album.title}</h1>
          {album.subtitle && (
            <p className="mt-2 font-handen text-xl text-ink-400">{album.subtitle}</p>
          )}

          <div className="mt-5 space-y-1.5 text-xs text-ink-400">
            {album.startDate && (
              <div>
                {album.startDate.replace(/-/g, '.')}
                {album.endDate && album.endDate !== album.startDate
                  ? ` — ${album.endDate.replace(/-/g, '.')}`
                  : ''}
              </div>
            )}
            {album.location?.region && <div>{album.location.region}</div>}
            <div>
              {album.pages.length} 页 · {album.photoIds.length} 张照片
            </div>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-2.5 lg:justify-start">
            <button className="btn-primary" onClick={() => setReading(true)}>
              翻阅这本纪念册
            </button>
            <button
              className="btn-subtle"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(shareUrl)
                  .then(() => {
                    setCopied(true)
                    show('分享链接已复制', { tone: 'success' })
                    setTimeout(() => setCopied(false), 2000)
                  })
                  .catch(() => show('复制失败', { tone: 'error' }))
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? '已复制' : '复制链接'}
            </button>
          </div>

          <p className="mt-8 text-[11px] leading-relaxed text-ink-600">
            时光册 —— 把照片装订成一本可以翻阅、编辑和装饰的回忆。
            <br />
            <Link to="/" className="text-ink-400 underline decoration-ink-600 underline-offset-2 hover:text-ink-200">
              制作我自己的纪念册
            </Link>
          </p>
        </div>
      </div>

      <Toast toast={toast} />
    </div>
  )
}
