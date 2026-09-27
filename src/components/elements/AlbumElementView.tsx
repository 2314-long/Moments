import { memo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { AlbumElement, ArtTextElement, DateElement, NoteElement, ShapeElement, StampElement, StickerElement, TextElement } from '@/types/album'
import { StickerSvg } from '@/components/stickers/StickerSvg'
import { PhotoView } from './PhotoView'
import { MapView } from './MapView'
import { FONT_STACK } from '@/lib/designTokens'

/**
 * 统一的元素渲染器。
 *
 * 只负责「画出来」：所有交互（选中、拖拽、缩放）由编辑器的
 * ElementShell 在外层处理。这样同一个渲染器可以同时服务于
 * 编辑器画布、翻页预览、分享页和缩略图。
 */

export interface AlbumElementViewProps {
  element: AlbumElement
  /** 缩略图模式下降低渲染开销 */
  thumbnail?: boolean
  className?: string
  style?: CSSProperties
}

/* ------------------------------------------------------------------ *
 * 日期格式化
 * ------------------------------------------------------------------ */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function formatDate(element: DateElement): string {
  const { date, endDate, format } = element.data
  const parse = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
    if (!y || !m || !d) return null
    return { y, m, d, weekday: WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] }
  }
  const start = parse(date)
  if (!start) return date

  const pad = (n: number) => String(n).padStart(2, '0')

  switch (format) {
    case 'cn':
      return `${start.y} 年 ${start.m} 月 ${start.d} 日`
    case 'slash':
      return `${start.y}/${pad(start.m)}/${pad(start.d)}`
    case 'long':
      return `${start.y} 年 ${pad(start.m)} 月 ${pad(start.d)} 日 · 周${start.weekday}`
    case 'range': {
      const end = endDate ? parse(endDate) : null
      if (!end) return `${start.y}.${pad(start.m)}.${pad(start.d)}`
      if (end.y === start.y && end.m === start.m) {
        return `${start.y}.${pad(start.m)}.${pad(start.d)} — ${pad(end.d)}`
      }
      return `${start.y}.${pad(start.m)}.${pad(start.d)} — ${end.y}.${pad(end.m)}.${pad(end.d)}`
    }
    case 'dot':
    default: {
      const end = endDate ? parse(endDate) : null
      if (!end) return `${start.y}.${pad(start.m)}.${pad(start.d)}`
      return `${start.y}.${pad(start.m)}.${pad(start.d)} — ${pad(end.m)}.${pad(end.d)}`
    }
  }
}

/* ------------------------------------------------------------------ *
 * 文字
 * ------------------------------------------------------------------ */

function TextView({ element }: { element: TextElement }) {
  const d = element.data
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        fontFamily: d.fontFamily,
        fontSize: d.fontSize,
        fontWeight: d.fontWeight,
        fontStyle: d.italic ? 'italic' : 'normal',
        letterSpacing: d.letterSpacing,
        lineHeight: d.lineHeight,
        color: d.color,
        textAlign: d.align,
        backgroundColor: d.backgroundColor,
        textDecoration: d.underline ? 'underline' : 'none',
        textDecorationThickness: d.underline ? 1 : undefined,
        textUnderlineOffset: d.underline ? 4 : undefined,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflow: 'hidden',
      }}
    >
      {d.text}
    </div>
  )
}

function ArtTextView({ element }: { element: ArtTextElement }) {
  const d = element.data
  const effects: Record<ArtTextElement['data']['templateId'], CSSProperties> = {
    handwritten: { borderBottom: `2px solid ${d.accentColor}`, textShadow: '1px 1px 0 rgba(255,255,255,.5)' },
    travel: { borderTop: `2px solid ${d.accentColor}`, borderBottom: `2px solid ${d.accentColor}`, textShadow: '0 2px 0 rgba(255,255,255,.45)' },
    cinema: { background: d.accentColor, padding: '10px 14px', letterSpacing: d.letterSpacing + 1 },
    magazine: { borderLeft: `8px solid ${d.accentColor}`, paddingLeft: 12, textTransform: 'uppercase' },
    seal: { border: `5px double ${d.accentColor}`, borderRadius: '50%', padding: 12, color: d.accentColor },
    calligraphy: { textShadow: `2px 3px 0 color-mix(in srgb, ${d.accentColor} 35%, transparent)` },
  }
  return <div style={{ ...effects[d.templateId], width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: d.align === 'left' ? 'flex-start' : d.align === 'right' ? 'flex-end' : 'center', fontFamily: d.fontFamily, fontSize: d.fontSize, fontWeight: d.fontWeight, letterSpacing: d.letterSpacing, lineHeight: d.lineHeight, color: d.color, whiteSpace: 'pre-wrap', textAlign: d.align, overflow: 'hidden' }}>{d.text}</div>
}

/* ------------------------------------------------------------------ *
 * 便签
 * ------------------------------------------------------------------ */

function NoteView({ element }: { element: NoteElement }) {
  const d = element.data
  const isTorn = d.variant === 'torn'
  const isLined = d.variant === 'lined'

  const variantShadow: Record<NoteElement['data']['variant'], string> = {
    sticky: '0 6px 14px -6px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.14)',
    kraft: '0 5px 12px -6px rgba(60,40,20,0.45)',
    lined: '0 4px 12px -6px rgba(0,0,0,0.34)',
    plain: '0 4px 12px -6px rgba(0,0,0,0.34)',
    torn: '0 6px 14px -7px rgba(0,0,0,0.4)',
  }

  return (
    <div
      className="relative h-full w-full"
      style={{
        backgroundColor: d.background,
        boxShadow: element.shadow ? variantShadow[d.variant] : undefined,
        clipPath: isTorn
          ? 'polygon(0% 2%, 8% 0%, 22% 3%, 36% 0%, 52% 3%, 68% 0%, 84% 3%, 100% 1%, 100% 98%, 86% 100%, 70% 97%, 54% 100%, 38% 97%, 22% 100%, 8% 97%, 0% 99%)'
          : undefined,
        borderRadius: isTorn ? 0 : d.variant === 'sticky' ? 2 : 3,
      }}
    >
      {/* 横线便签的格线 */}
      {isLined && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(to bottom, rgba(120,140,160,0.28) 1px, transparent 1px)',
            backgroundSize: `100% ${Math.max(20, d.fontSize * 1.7)}px`,
            backgroundPositionY: '0.9em',
            margin: '0 10px',
          }}
        />
      )}
      {/* 牛皮纸 / 便签的细纹 */}
      {(d.variant === 'kraft' || d.variant === 'plain') && (
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'repeating-linear-gradient(52deg, rgba(120,90,50,0.05) 0 1px, transparent 1px 5px)',
          }}
        />
      )}
      <div className="relative h-full w-full p-3" style={{ fontFamily: d.fontFamily, fontSize: d.fontSize, lineHeight: 1.65, color: d.color, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'hidden' }}>
        {d.text}
      </div>
      {/* 便签左上角的阴影，模拟翘起 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-3"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.05), transparent)' }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 印章
 * ------------------------------------------------------------------ */

function StampView({ element }: { element: StampElement }) {
  const d = element.data
  const size = Math.min(element.width, element.height)
  const distressed = d.distress > 0

  // 用 SVG filter 做斑驳效果，比多张图片叠加更轻量
  const filterId = `distress-${element.id}`

  return (
    <div className="relative h-full w-full" style={{ color: d.color }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${element.width} ${element.height}`} style={{ display: 'block' }}>
        <defs>
          {distressed && (
            <filter id={filterId}>
              <feTurbulence type="fractalNoise" baseFrequency="0.62" numOctaves="4" seed="7" result="noise" />
              <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -1.3 1.15" result="mask" />
              <feComposite in="SourceGraphic" in2="mask" operator="in" />
            </filter>
          )}
        </defs>

        <g filter={distressed ? `url(#${filterId})` : undefined} opacity={1 - d.distress * 0.12}>
          {d.shape === 'circle' && (
            <>
              <circle
                cx={element.width / 2}
                cy={element.height / 2}
                r={size / 2 - 4}
                fill="none"
                stroke="currentColor"
                strokeWidth={size * 0.055}
              />
              <circle
                cx={element.width / 2}
                cy={element.height / 2}
                r={size / 2 - 4 - size * 0.075}
                fill="none"
                stroke="currentColor"
                strokeWidth={size * 0.018}
              />
            </>
          )}
          {d.shape === 'rect' && (
            <>
              <rect
                x={4}
                y={4}
                width={element.width - 8}
                height={element.height - 8}
                fill="none"
                stroke="currentColor"
                strokeWidth={size * 0.05}
              />
              <rect
                x={4 + size * 0.07}
                y={4 + size * 0.07}
                width={element.width - 8 - size * 0.14}
                height={element.height - 8 - size * 0.14}
                fill="none"
                stroke="currentColor"
                strokeWidth={size * 0.016}
              />
            </>
          )}
          {d.shape === 'oval' && (
            <ellipse
              cx={element.width / 2}
              cy={element.height / 2}
              rx={element.width / 2 - 4}
              ry={element.height / 2 - 4}
              fill="none"
              stroke="currentColor"
              strokeWidth={size * 0.05}
            />
          )}

          <text
            x="50%"
            y={d.subText ? '46%' : '54%'}
            textAnchor="middle"
            fill="currentColor"
            fontFamily={FONT_STACK.serif}
            fontWeight="700"
            fontSize={size * 0.28}
            letterSpacing={size * 0.02}
          >
            {d.text}
          </text>
          {d.subText && (
            <text
              x="50%"
              y="66%"
              textAnchor="middle"
              fill="currentColor"
              fontFamily={FONT_STACK.mono}
              fontSize={size * 0.115}
              letterSpacing={size * 0.012}
            >
              {d.subText}
            </text>
          )}
        </g>
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 贴纸
 * ------------------------------------------------------------------ */

function StickerView({ element, thumbnail }: { element: StickerElement; thumbnail?: boolean }) {
  const d = element.data
  if (d.render === 'svg' && d.svgId) {
    return (
      <div
        className="h-full w-full"
        style={{
          filter: element.shadow ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.26))' : undefined,
          opacity: element.opacity,
        }}
      >
        <StickerSvg svgId={d.svgId} tint={d.tint} uid={element.id} />
      </div>
    )
  }
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{
        fontSize: Math.min(element.width, element.height) * 0.9,
        lineHeight: 1,
        filter: element.shadow && !thumbnail ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.24))' : undefined,
        opacity: element.opacity,
      }}
    >
      <span style={{ userSelect: 'none' }}>{d.glyph}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 形状
 * ------------------------------------------------------------------ */

function ShapeView({ element }: { element: ShapeElement }) {
  const d = element.data
  const { width, height } = element
  const strokeDash = d.dash?.length ? d.dash.join(' ') : undefined

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
      {d.shape === 'rect' && (
        <rect x={0.5} y={0.5} width={width - 1} height={height - 1} fill={d.fill} stroke={d.stroke} strokeWidth={d.strokeWidth} strokeDasharray={strokeDash} />
      )}
      {d.shape === 'ellipse' && (
        <ellipse cx={width / 2} cy={height / 2} rx={width / 2 - 0.5} ry={height / 2 - 0.5} fill={d.fill} stroke={d.stroke} strokeWidth={d.strokeWidth} strokeDasharray={strokeDash} />
      )}
      {d.shape === 'line' && (
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={d.stroke} strokeWidth={Math.max(1, d.strokeWidth)} strokeLinecap="round" strokeDasharray={strokeDash} />
      )}
      {d.shape === 'arrow' && (
        <>
          <line x1={0} y1={height / 2} x2={width - 10} y2={height / 2} stroke={d.stroke} strokeWidth={Math.max(1, d.strokeWidth)} strokeLinecap="round" />
          <path
            d={`M ${width - 14} ${height / 2 - 6} L ${width} ${height / 2} L ${width - 14} ${height / 2 + 6}`}
            fill="none"
            stroke={d.stroke}
            strokeWidth={Math.max(1, d.strokeWidth)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {d.shape === 'highlight' && (
        <rect x={0} y={height * 0.22} width={width} height={height * 0.56} fill={d.fill} opacity={0.55} rx={2} />
      )}
    </svg>
  )
}

/* ------------------------------------------------------------------ *
 * 日期
 * ------------------------------------------------------------------ */

function DateView({ element }: { element: DateElement }) {
  const d = element.data
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: d.format === 'cn' || d.format === 'long' ? 'center' : 'flex-start',
        fontFamily: d.fontFamily,
        fontSize: d.fontSize,
        color: d.color,
        letterSpacing: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      {formatDate(element)}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

function AlbumElementViewImpl({ element, thumbnail = false, className, style }: AlbumElementViewProps) {
  let content: ReactNode
  switch (element.kind) {
    case 'photo':
      content = <PhotoView element={element} width={element.width} height={element.height} />
      break
    case 'text':
      content = <TextView element={element} />
      break
    case 'art-text':
      content = <ArtTextView element={element} />
      break
    case 'note':
      content = <NoteView element={element} />
      break
    case 'stamp':
      content = <StampView element={element} />
      break
    case 'sticker':
      content = <StickerView element={element} thumbnail={thumbnail} />
      break
    case 'shape':
      content = <ShapeView element={element} />
      break
    case 'date':
      content = <DateView element={element} />
      break
    case 'map':
      content = thumbnail ? null : <MapView element={element} width={element.width} height={element.height} />
      break
    default:
      content = null
  }

  return (
    <div className={className} style={style}>
      {content}
    </div>
  )
}

export const AlbumElementView = memo(AlbumElementViewImpl)
