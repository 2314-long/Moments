import { memo, useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { PhotoElement } from '@/types/album'
import { PHOTO_STYLES } from '@/lib/designTokens'
import { frameBox } from '@/lib/frame'
import { usePhotoUrl } from '@/hooks/usePhotoUrl'

/**
 * 照片渲染。
 *
 * 结构上分两层：
 *   外层 = 相框（白边 / 黑边 / 纸边 + 阴影 + 旋转承接）
 *   内层 = 图片（cover 裁切 + 滤镜）
 *
 * 相框几何统一由 frame.ts 计算，保证拍立得的下方留白
 * 在任意尺寸下都按比例。
 */

export interface PhotoViewProps {
  element: PhotoElement
  width: number
  height: number
  className?: string
  style?: CSSProperties
}

function PhotoViewImpl({ element, width, height, className, style }: PhotoViewProps) {
  const { url, loading } = usePhotoUrl(element.data.photoId)
  const token = PHOTO_STYLES[element.data.style]
  const box = frameBox(element.data.style, width, height, element.data.frameWidth)
  const caption = element.data.caption?.trim()

  const innerWidth = Math.max(1, width - box.left - box.right)
  const innerHeight = Math.max(1, height - box.top - box.bottom)

  const filters = useMemo(() => {
    const list: string[] = []
    if (token.filter && token.filter !== 'none') list.push(token.filter)
    if (element.data.grayscale) list.push('grayscale(1)')
    if (element.data.sepia) list.push('sepia(0.6)')
    return list.length ? list.join(' ') : undefined
  }, [token.filter, element.data.grayscale, element.data.sepia])

  // 胶片齿孔：上下两排小孔
  const filmHoles = element.data.style === 'film'
  const holeCount = filmHoles ? Math.max(4, Math.round(innerWidth / 22)) : 0

  return (
    <div
      className={`relative overflow-hidden ${className ?? ''}`}
      style={{
        width,
        height,
        backgroundColor: token.background,
        borderRadius: element.radius ?? token.radius,
        boxShadow: element.shadow && element.shadow > 0 ? token.shadow : undefined,
        opacity: element.opacity,
        ...style,
      }}
    >
      {/* 照片本体 */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: box.left,
          top: box.top,
          width: innerWidth,
          height: innerHeight,
          borderRadius: element.data.style === 'plain' ? (element.radius ?? 1) : 0,
          backgroundColor: 'rgba(0,0,0,0.06)',
        }}
      >
        {url ? (
          <img
            src={url}
            alt={caption ?? ''}
            draggable={false}
            className="h-full w-full select-none"
            style={{
              objectFit: element.data.fit,
              objectPosition: `${(element.data.focusX ?? 0.5) * 100}% ${(element.data.focusY ?? 0.5) * 100}%`,
              filter: filters,
            }}
          />
        ) : (
          <div
            className={`h-full w-full ${loading ? 'animate-pulse' : ''}`}
            style={{
              background: 'linear-gradient(135deg, #d9d3c6 0%, #c3bcae 60%, #ada596 100%)',
            }}
          />
        )}

        {/* 复古褪色叠加 */}
        {element.data.style === 'vintage' && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, rgba(255,236,200,0.18), rgba(120,90,50,0.14))',
              mixBlendMode: 'multiply',
            }}
          />
        )}
        {/* 玻璃反光 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(118deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 34%, rgba(255,255,255,0) 68%, rgba(255,255,255,0.07) 100%)',
          }}
        />
      </div>

      {/* 胶片齿孔 */}
      {filmHoles && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[6px]">
            <div className="flex h-full items-center justify-between px-[3px]">
              {Array.from({ length: holeCount }).map((_, i) => (
                <span
                  key={i}
                  className="block rounded-[1px]"
                  style={{ width: 5, height: 3.5, backgroundColor: 'rgba(247,243,234,0.82)' }}
                />
              ))}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[6px]">
            <div className="flex h-full items-center justify-between px-[3px]">
              {Array.from({ length: holeCount }).map((_, i) => (
                <span
                  key={i}
                  className="block rounded-[1px]"
                  style={{ width: 5, height: 3.5, backgroundColor: 'rgba(247,243,234,0.82)' }}
                />
              ))}
            </div>
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-[2px]"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          />
        </>
      )}

      {/* 撕纸边：用极淡的锯齿阴影模拟手撕纸的毛边 */}
      {element.data.style === 'torn' && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            boxShadow: 'inset 0 0 0 1px rgba(160,145,120,0.25)',
            borderRadius: 0,
          }}
        />
      )}

      {/* 拍立得手写注释 */}
      {caption && token.hasCaption && (
        <div
          className="pointer-events-none absolute flex items-center justify-center"
          style={{
            left: box.left * 0.6,
            right: box.right * 0.6,
            top: height - box.bottom,
            height: box.bottom,
          }}
        >
          <span
            className="truncate text-center"
            style={{
              fontFamily: '"Ma Shan Zheng", "LXGW WenKai", KaiTi, cursive',
              fontSize: Math.max(9, Math.min(17, width * 0.055)),
              color: element.data.style === 'film' ? '#e8e2d4' : '#5b5348',
              letterSpacing: 0.6,
            }}
          >
            {caption}
          </span>
        </div>
      )}

      {/* 极淡的内描边，避免浅色照片与纸面糊在一起 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: element.radius ?? token.radius,
          boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.08)',
        }}
      />
    </div>
  )
}

export const PhotoView = memo(PhotoViewImpl)
