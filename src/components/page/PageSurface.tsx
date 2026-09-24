import { memo } from 'react'
import type { AlbumElement, Page } from '@/types/album'
import { PaperBackground } from '@/components/paper/PaperBackground'
import { AlbumElementView } from '@/components/elements/AlbumElementView'

/**
 * 单页渲染（只读 + 可交互层分离）。
 *
 * 页面在「页面坐标系」里以真实尺寸渲染（默认 720×900），
 * 由外层容器统一缩放。这样所有元素的 left/top/width 都可以
 * 直接使用数据里的数值，不需要到处做 scale 换算。
 */

export interface PageSurfaceProps {
  page: Page
  width: number
  height: number
  /** 页面在书中的位置，决定装订侧阴影方向 */
  side?: 'left' | 'right' | 'single'
  /** 页面背景是否允许透明（预览时整个跨页共用一张纸） */
  transparentBackground?: boolean
  /** 网格辅助线 */
  showGrid?: boolean
  className?: string
  /** 渲染单个元素时的额外包裹（编辑器用来叠加交互手柄） */
  renderElement?: (element: AlbumElement, index: number) => React.ReactNode
}

function PageSurfaceImpl({
  page,
  width,
  height,
  side = 'single',
  transparentBackground = false,
  showGrid = false,
  className,
  renderElement,
}: PageSurfaceProps) {
  return (
    <div
      className={`relative overflow-hidden ${className ?? ''}`}
      style={{ width, height }}
      data-page-id={page.id}
    >
      {!transparentBackground && (
        <PaperBackground background={page.background} width={width} height={height} side={side} />
      )}

      {/* 元素层 */}
      <div className="absolute inset-0">
        {page.elements.map((element, index) =>
          renderElement ? (
            <div key={element.id}>{renderElement(element, index)}</div>
          ) : (
            <div
              key={element.id}
              style={{
                position: 'absolute',
                left: element.x,
                top: element.y,
                width: element.width,
                height: element.height,
                transform: `rotate(${element.rotation}deg)`,
                transformOrigin: 'center center',
                opacity: element.opacity,
              }}
            >
              <AlbumElementView element={element} />
            </div>
          ),
        )}
      </div>

      {/* 网格辅助 */}
      {showGrid && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(90,140,200,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(90,140,200,0.16) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      )}
    </div>
  )
}

export const PageSurface = memo(PageSurfaceImpl)
