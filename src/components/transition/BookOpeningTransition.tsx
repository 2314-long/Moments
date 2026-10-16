import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Album } from '@/types/album'
import { BookCover, BookCoverInside } from '@/components/album/BookCover'
import { BOOK_GAP } from '@/components/book/BookSpread'

type OpeningPhase = 'focus' | 'center' | 'opening' | 'pages' | 'handoff'

interface OpeningRequest {
  album: Album
  rect: { left: number; top: number; width: number; height: number }
}

interface OpeningContextValue {
  opening: boolean
  openingPhase: OpeningPhase | null
  openAlbum: (album: Album, source: HTMLElement) => void
}

const OpeningContext = createContext<OpeningContextValue | null>(null)

export function useBookOpening() {
  const value = useContext(OpeningContext)
  if (!value) throw new Error('useBookOpening must be used inside BookOpeningProvider')
  return value
}

export function BookOpeningProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<OpeningRequest | null>(null)
  const [phase, setPhase] = useState<OpeningPhase>('focus')

  const openAlbum = useCallback((album: Album, source: HTMLElement) => {
    if (request) return
    const rect = source.getBoundingClientRect()
    setPhase('focus')
    setRequest({ album, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } })
  }, [request])

  useEffect(() => {
    if (!request) return
    const timers = [
      window.setTimeout(() => setPhase('center'), 70),
      window.setTimeout(() => setPhase('opening'), 580),
      window.setTimeout(() => setPhase('pages'), 1240),
      window.setTimeout(() => setPhase('handoff'), 1740),
      window.setTimeout(() => setRequest(null), 1980),
    ]
    return () => timers.forEach(window.clearTimeout)
  }, [request])

  const value = useMemo(
    () => ({ opening: Boolean(request), openingPhase: request ? phase : null, openAlbum }),
    [openAlbum, phase, request],
  )

  return (
    <OpeningContext.Provider value={value}>
      {children}
      {request && <OpeningOverlay request={request} phase={phase} />}
    </OpeningContext.Provider>
  )
}

function OpeningOverlay({ request, phase }: { request: OpeningRequest; phase: OpeningPhase }) {
  const { album, rect } = request
  // 与 Reader.useFitScale 完全一致：BookSpread 使用原始页面坐标，
  // 只在外层缩放。不能把缩放后的尺寸传进 BookSpread，否则元素仍按
  // 720×900 页面坐标绘制，会造成图片/文字与页面几何错位。
  const baseSpreadWidth = album.pageSize.width * 2 + BOOK_GAP
  const fitScale = Math.max(
    0.15,
    Math.min(
      (window.innerWidth - 172) / baseSpreadWidth,
      (window.innerHeight - 172) / album.pageSize.height,
      1.3,
    ),
  )
  const centeredWidth = baseSpreadWidth * fitScale
  const centeredHeight = album.pageSize.height * fitScale
  // 首页封面预览是 196×261，阅读器页面是 720×900，二者纵横比不同。
  // 必须分别按目标页面的宽、高缩放，不能只按宽度等比放大。
  const coverScaleX = (album.pageSize.width / 196) * fitScale
  const coverScaleY = (album.pageSize.height / 261) * fitScale
  const startTransform = `translate(${rect.left}px, ${rect.top}px) rotate(-0.7deg) scale(${rect.width / 196})`
  const isCenter = phase !== 'focus'
  const isOpening = phase === 'opening' || phase === 'pages'
  const isPages = phase === 'pages' || phase === 'handoff'
  const isHandoff = phase === 'handoff'

  return (
    <div
      className={`book-opening-overlay ${isHandoff ? 'is-handoff' : ''}`}
      aria-live="polite"
      aria-label={`正在打开《${album.title}》`}
    >
      <div className={`book-opening-backdrop ${isCenter ? 'is-centered' : ''} ${isOpening ? 'is-opening' : ''} ${isPages ? 'is-pages' : ''}`} />
      <div
        className={`book-opening-stage ${isCenter ? 'is-centered' : ''} ${isOpening ? 'is-opening' : ''} ${isPages ? 'is-pages' : ''}`}
        style={{
          '--book-start-transform': startTransform,
          '--book-centered-width': `${centeredWidth}px`,
          '--book-centered-height': `${centeredHeight}px`,
          '--book-cover-scale-x': String(coverScaleX),
          '--book-cover-scale-y': String(coverScaleY),
        } as React.CSSProperties}
      >
        <div className="book-opening-cover">
          <div className="book-opening-cover-turn">
            <div className="book-opening-cover-front">
              <BookCover album={album} width={196} height={261} showPages={false} />
            </div>
            <div className="book-opening-cover-back">
              <BookCoverInside album={album} width={196} height={261} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
