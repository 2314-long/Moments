import type { Album } from '@/types/album'
import { usePhotoUrl } from '@/hooks/usePhotoUrl'
import { THEMES } from '@/lib/designTokens'

/**
 * 纪念册「实体书封面」。
 *
 * 首页卡片、分享页、创建完成页都用同一个组件，
 * 保证「一本书」的视觉语言在任何地方都一致：
 *   封面底 + 封面照片 + 烫金标题 + 书脊 + 右侧露出的纸页厚度
 */

export interface BookCoverProps {
  album: Album
  width: number
  height: number
  /** 是否显示右侧露出的内页厚度 */
  showPages?: boolean
  className?: string
  /** 精装布面纹理 */
  textured?: boolean
}

export function BookCover({
  album,
  width,
  height,
  showPages = true,
  className,
  textured = true,
}: BookCoverProps) {
  const theme = THEMES[album.theme]
  const { url } = usePhotoUrl(album.coverPhotoId)

  const padding = width * 0.075
  const photoHeight = height * 0.44
  const photoWidth = width - padding * 2

  return (
    <div className={className} style={{ width, height, position: 'relative' }}>
      {/* 右侧露出的内页：制造「这是一本厚书」的错觉 */}
      {showPages && (
        <>
          <div
            className="absolute rounded-r-[3px]"
            style={{
              top: height * 0.015,
              bottom: height * 0.015,
              left: width - 1,
              width: 5,
              background: 'linear-gradient(90deg, #e8e2d4 0%, #d8d1c1 55%, #c4bcab 100%)',
              boxShadow: '1px 0 3px rgba(0,0,0,0.3)',
            }}
          />
          <div
            className="absolute rounded-r-[2px]"
            style={{
              top: height * 0.028,
              bottom: height * 0.028,
              left: width + 4,
              width: 3,
              background: 'linear-gradient(90deg, #ddd6c6 0%, #cbc3b2 100%)',
              opacity: 0.85,
            }}
          />
        </>
      )}

      {/* 封面本体 */}
      <div
        className="relative h-full w-full overflow-hidden rounded-[3px]"
        style={{
          backgroundColor: theme.cover,
          boxShadow:
            '0 26px 44px -20px rgba(0,0,0,0.75), 0 6px 14px -6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)',
        }}
      >
        {/* 布面纹理 */}
        {textured && (
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.5]"
            style={{
              backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.028) 0 1px, transparent 1px 3px),
                repeating-linear-gradient(-45deg, rgba(0,0,0,0.05) 0 1px, transparent 1px 3px)`,
            }}
          />
        )}
        {/* 书脊高光与暗部 */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0"
          style={{
            width: width * 0.11,
            background:
              'linear-gradient(90deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.06) 45%, rgba(255,255,255,0.05) 78%, transparent 100%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 left-0"
          style={{ width: 1.5, background: 'rgba(0,0,0,0.35)' }}
        />
        {/* 顶部光泽 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'linear-gradient(165deg, rgba(255,255,255,0.1) 0%, transparent 34%)',
          }}
        />

        {/* 烫金细框 */}
        <div
          className="pointer-events-none absolute rounded-[2px]"
          style={{
            left: padding * 0.42,
            right: padding * 0.42,
            top: padding * 0.42,
            bottom: padding * 0.42,
            border: `1px solid ${hexAlpha(theme.foil, 0.22)}`,
          }}
        />

        {/* 封面照片 */}
        <div
          className="absolute overflow-hidden"
          style={{
            left: padding,
            top: padding * 1.5,
            width: photoWidth,
            height: photoHeight,
            backgroundColor: 'rgba(0,0,0,0.18)',
            boxShadow: '0 8px 20px -10px rgba(0,0,0,0.7)',
          }}
        >
          {url ? (
            <img src={url} alt="" className="h-full w-full select-none object-cover" draggable={false} />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-white/10 to-transparent" />
          )}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ boxShadow: `inset 0 0 0 1px ${hexAlpha(theme.foil, 0.18)}` }}
          />
        </div>

        {/* 标题区 */}
        <div
          className="absolute"
          style={{ left: padding, right: padding, top: padding * 1.5 + photoHeight + height * 0.045 }}
        >
          <div
            className="font-serif"
            style={{
              fontSize: Math.max(13, width * 0.105),
              lineHeight: 1.24,
              color: theme.foil,
              letterSpacing: width * 0.008,
              textShadow: '0 1px 2px rgba(0,0,0,0.4)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {album.title}
          </div>
          <div
            className="mt-1.5 h-[1.5px]"
            style={{ width: width * 0.22, background: hexAlpha(theme.foil, 0.42) }}
          />
        </div>

        {/* 底部信息 */}
        <div
          className="absolute flex items-end justify-between"
          style={{ left: padding, right: padding, bottom: padding * 1.1 }}
        >
          <div
            className="text-[9px] uppercase tracking-[0.2em]"
            style={{ color: hexAlpha(theme.foil, 0.62) }}
          >
            {album.location?.name ?? formatRange(album.startDate, album.endDate)}
          </div>
          <div
            className="text-[9px] tracking-[0.14em]"
            style={{ color: hexAlpha(theme.foil, 0.5) }}
          >
            {album.pages.length} 页
          </div>
        </div>
      </div>
    </div>
  )
}

export function formatRange(start?: string, end?: string): string {
  if (!start) return ''
  const s = start.slice(0, 10).replace(/-/g, '.')
  if (!end || end.slice(0, 10) === start.slice(0, 10)) return s
  return `${s} — ${end.slice(0, 10).replace(/-/g, '.')}`
}

/** 把 #rrggbb 转成带透明度的 rgba */
export function hexAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized
  const num = Number.parseInt(full.slice(0, 6), 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
