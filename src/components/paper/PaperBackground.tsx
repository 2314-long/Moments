import { memo } from 'react'
import type { CSSProperties } from 'react'
import type { PageBackground } from '@/types/album'
import { PAPERS } from '@/lib/designTokens'

/**
 * 纸张背景。
 *
 * 不用纯色矩形，而是「底色 + 纹理 + 轻微明暗」三层叠加，
 * 让页面看起来像真的纸。
 */

export interface PaperBackgroundProps {
  background: PageBackground
  width: number
  height: number
  /**
   * 页面在书里的位置。
   *
   * 目前**不参与渲染** —— 纸张两侧的折痕由 BookSpread 的 PageFoldShade 负责，
   * 因为只有页面容器知道纸边真正在哪里（还要考虑书脊侧切面与翻页旋转）。
   * 这里保留字段是为了不破坏调用方签名，也给未来的「左侧纸纹理」留位置。
   */
  side?: 'left' | 'right' | 'single'
  className?: string
  style?: CSSProperties
}

function textureStyle(background: PageBackground): CSSProperties {
  const paper = PAPERS[background.paper]
  const line = background.lineColor ?? paper.lineColor
  const gap = paper.gap || 24

  switch (background.paper) {
    case 'grid':
      return {
        backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
        backgroundSize: `${gap}px ${gap}px`,
      }
    case 'dot':
      return {
        backgroundImage: `radial-gradient(${line} 1.1px, transparent 1.2px)`,
        backgroundSize: `${gap}px ${gap}px`,
      }
    case 'line':
      return {
        backgroundImage: `linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
        backgroundSize: `100% ${gap}px`,
      }
    case 'kraft':
      // 牛皮纸：细密斜纹 + 随机色斑
      return {
        backgroundImage: `repeating-linear-gradient(48deg, rgba(120,90,50,0.07) 0 2px, transparent 2px 6px),
          repeating-linear-gradient(-42deg, rgba(120,90,50,0.05) 0 2px, transparent 2px 7px)`,
      }
    case 'noise':
      return {
        backgroundImage: `radial-gradient(circle at 20% 18%, rgba(120,130,140,0.05) 0, transparent 42%),
          radial-gradient(circle at 78% 72%, rgba(120,130,140,0.05) 0, transparent 38%)`,
      }
    case 'plain':
    default:
      return {}
  }
}

function PaperBackgroundImpl({
  background,
  width,
  height,
  side: _side,
  className,
  style,
}: PaperBackgroundProps) {
  const showGrain = background.paper !== 'plain' || Boolean(background.vignette)
  const vignette = background.vignette ?? 0

  return (
    <div
      className={`absolute inset-0 overflow-hidden ${showGrain ? 'paper-grain' : ''} ${className ?? ''}`}
      style={{ width, height, backgroundColor: background.color, ...textureStyle(background), ...style }}
    >
      {/* 纸张纤维（仅浅色纸） */}
      {background.paper !== 'plain' && <div className="paper-fiber absolute inset-0" />}

      {/* 整页底图 */}
      {background.imageUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${background.imageUrl})` }}
        />
      )}

      {/*
        注意：这里**不再**画装订侧暗部。

        折痕必须贴着「纸张真正的内边缘」，而这条纸边只有页面容器自己知道
        （还要考虑书脊侧切面、翻页时的旋转）。早先这里按 side 画过一条
        `w-16` 的内侧暗部，同时 BookSpread 又叠了一条跨页的书脊渐变 ——
        两条几何互不相干的暗带叠在一起，中缝就成了「第三张纸」。
        现在统一由 BookSpread 的 PageFoldShade 负责，且长在页面自己的矩形里。
      */}

      {/* 环境光：左上偏亮、右下偏暗 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(160deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0) 38%, rgba(0,0,0,0.05) 100%)',
        }}
      />

      {/* 暗角 */}
      {vignette > 0 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(120% 110% at 50% 46%, transparent 52%, rgba(0,0,0,${vignette * 0.55}) 100%)`,
          }}
        />
      )}
    </div>
  )
}

export const PaperBackground = memo(PaperBackgroundImpl)
