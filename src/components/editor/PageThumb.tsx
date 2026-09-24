import { memo } from 'react'
import type { Page } from '@/types/album'
import { PageSurface } from '@/components/page/PageSurface'

/**
 * 页面缩略图。
 *
 * 直接复用页面渲染器再整体缩放，保证缩略图与真实页面永远一致
 * （这是最容易出现「缩略图和实际不一样」的地方，共用渲染器可以从根本上避免）。
 */

export interface PageThumbProps {
  page: Page
  width: number
  height: number
  /** 页面坐标系尺寸，默认取 720×900 */
  pageSize?: { width: number; height: number }
  className?: string
}

function PageThumbImpl({ page, width, height, pageSize, className }: PageThumbProps) {
  const natural = pageSize ?? { width: 720, height: 900 }
  const scale = Math.min(width / natural.width, height / natural.height)

  return (
    <div
      className={`relative overflow-hidden bg-white ${className ?? ''}`}
      style={{ width, height }}
    >
      <div
        style={{
          width: natural.width,
          height: natural.height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <PageSurface
          page={page}
          width={natural.width}
          height={natural.height}
          transparentBackground={false}
        />
      </div>
    </div>
  )
}

export const PageThumb = memo(PageThumbImpl)
