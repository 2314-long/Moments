import { memo } from 'react'
import type { CSSProperties } from 'react'
import type { Page } from '@/types/album'
import { PaperBackground } from '@/components/paper/PaperBackground'
import { AlbumElementView } from '@/components/elements/AlbumElementView'
import { PAGE_HEIGHT } from '@/lib/designTokens'

/**
 * 一页「厚纸板」。
 *
 * ── 这个组件的存在意义 ────────────────────────────────────────
 *
 * 纪念册的每一页不是「一张平面」，而是一块**有厚度的硬质纸板**：
 *
 *      ┌───────────────────────────┐  ← 正面：纸面 + 贴在上面的照片/文字/贴纸
 *      │   ┌─────┐                 │
 *      │   │photo│   写在纸上的字   │
 *      │   └─────┘                 │
 *      ╞═══════════════════════════╡  ← 纸板厚度（向 +Z 挤出的侧面）
 *      │      背面（另一面纸）      │
 *      └───────────────────────────┘
 *
 * 所以层级是：**页面是载体，照片/文字/贴纸都只是「页面内容」**。
 * 页面永远是一个完整、独立的矩形纸板，绝不会随着照片大小而变形。
 *
 * ── 厚度是怎么做出来的 ────────────────────────────────────────
 *
 * 用 CSS 3D 把正面沿 Z 轴挤出 thickness：正面在 translateZ(0)，
 * 背面在 translateZ(-thickness)，四个侧面用同样尺寸的矩形绕对应边
 * 旋转 90° 撑起，于是从侧面看就是一个真正的长方体。
 * 当页面绕书脊旋转到 90° 时，看到的就是这个侧面 —— 这就是
 * 「纸张厚度」最关键的那一帧；如果只画一个平面，那一帧会直接消失。
 */

export type PageSide = 'left' | 'right' | 'single'

export interface BookPageProps {
  page: Page
  size: { width: number; height: number }
  /** 页面在书中的位置，决定装订边在哪一侧 */
  side: PageSide
  /** 纸板厚度（页面坐标系单位）。0 表示不渲染厚度 */
  thickness?: number
  /**
   * 渲染哪一面。
   *  - front：正面（正常阅读时看到的纸面 + 内容）
   *  - back：背面（页面翻过去之后朝上的那一面）
   */
  face?: 'front' | 'back'
  className?: string
  style?: CSSProperties
  /** 薄页面叠层模式下跳过纤维等细节以节省渲染 */
  simple?: boolean
  /**
   * 不渲染**装订侧**的侧面（书脊侧切面）。
   *
   * 用途：正在翻动的那块纸板。书脊侧的切面本应只在纸板立起来（90°）时才可见，
   * 但它自身的 `rotateY(∓90°)` 会与纸叶的旋转**叠加**，于是投影宽度变成
   * `thickness × |sin(angle)|` —— 实测 90° 时是一条 **7.5px 宽、贯穿整页高**的
   * 淡色竖条（`#eae2d2`），位置正好在书脊旁，而且**跟着当前页一起转**，
   * 看起来就像「下一层页面露出一部分、被带着一起翻」。
   *
   * 真实的书里书脊那一侧是装订在一起的，看不到单张纸的切面；那里的厚度
   * 应该由「静态的页面堆叠」表达，而不是由正在翻的这张纸表达。
   */
  hideSpineEdge?: boolean
}

/** 默认纸板厚度占页面高度的比例 —— 对应「精装相册卡纸」的观感 */
export const BOARD_THICKNESS_RATIO = 0.011

function pageThickness(size: { width: number; height: number }): number {
  return Math.max(4, Math.round(size.height * BOARD_THICKNESS_RATIO))
}

/**
 * 纸面内容（正面或背面）+ 纸张质感。
 * 抽出来是为了正反面共用同一套渲染，避免两处不一致。
 */
const PageFaceContent = memo(function PageFaceContent({
  page,
  size,
  side,
  face,
}: {
  page: Page
  size: { width: number; height: number }
  side: PageSide
  face: 'front' | 'back'
}) {
  const isBack = face === 'back'
  // 背面看到的装订侧与正面相反：右页翻过去之后，装订边就到了它的右侧
  const effSide: PageSide =
    side === 'single' ? 'single' : isBack ? (side === 'left' ? 'right' : 'left') : side

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: page.background.color }}>
      <PaperBackground
        background={page.background}
        width={size.width}
        height={size.height}
        side={effSide}
      />

      {/*
        内容层：照片、文字、贴纸、便签 —— 它们都只是「贴在纸板上的东西」。
        内容的方向由调用方的 3D 变换负责摆正，这里不再做任何镜像。
      */}
      <div className="absolute inset-0">
        {page.elements.map((element) => (
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
        ))}
      </div>
    </div>
  )
})

/**
 * 纸板的一个侧面。
 *
 * 尺寸与页面一致，绕对应边旋转 90° 之后自然形成「立起来的那一面」。
 * 加上 `backface-visibility: hidden`：纸板旋转到某一角度时，
 * 朝向观察者的那一面自动显示，背离的自动隐藏 —— 于是翻页过程中
 * 会先看到书口（纸叠的侧边），越过 90° 之后换成书脊侧，
 * 不需要任何额外的逻辑判断。
 */
function EdgeFace({
  size,
  edge,
  thickness,
  tone,
}: {
  size: { width: number; height: number }
  edge: 'top' | 'bottom' | 'left' | 'right'
  thickness: number
  tone: 'spine' | 'fore'
}) {
  const isHorizontal = edge === 'top' || edge === 'bottom'
  const along = isHorizontal ? '90deg' : '0deg'

  // 书口是能看到一张张纸叠起来的那一面 —— 用细密的横向纹路表现
  const stack =
    tone === 'fore'
      ? `repeating-linear-gradient(${along}, rgba(90,78,58,0.22) 0 0.7px, rgba(255,255,255,0.34) 0.7px 1.7px)`
      : `repeating-linear-gradient(${along}, rgba(90,78,58,0.14) 0 1px, rgba(255,255,255,0.22) 1px 2.4px)`

  const base: CSSProperties = {
    position: 'absolute',
    // 比纸面略深，像纸板被切开后的切边
    backgroundColor: tone === 'fore' ? '#e2d9c6' : '#eae2d2',
    // 用 background-image 而不是 backgroundColor 叠加纹理
    backgroundImage: stack,
    boxShadow: 'inset 0 0 0 0.5px rgba(110,95,70,0.20)',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
  }

  const geometry: CSSProperties = isHorizontal
    ? {
        left: 0,
        width: size.width,
        height: thickness,
        top: edge === 'top' ? 0 : undefined,
        bottom: edge === 'bottom' ? 0 : undefined,
        transformOrigin: edge === 'top' ? 'top center' : 'bottom center',
        transform: `rotateX(${edge === 'top' ? 90 : -90}deg)`,
      }
    : {
        top: 0,
        height: size.height,
        width: thickness,
        left: edge === 'left' ? 0 : undefined,
        right: edge === 'right' ? 0 : undefined,
        transformOrigin: edge === 'left' ? 'left center' : 'right center',
        transform: `rotateY(${edge === 'left' ? -90 : 90}deg)`,
      }

  return <div style={{ ...base, ...geometry }} />
}

function BookPageImpl({
  page,
  size,
  side,
  thickness,
  face = 'front',
  className,
  style,
  hideSpineEdge = false,
}: BookPageProps) {
  const t = thickness ?? pageThickness(size)
  const isBack = face === 'back'

  // 厚度为 0：退化成单张平面（列表缩略图等场景）
  if (t <= 0) {
    return (
      <div
        className={className}
        /* 供自动化验收读取几何：翻页是否真的没有位移，比肉眼可靠得多 */
        data-face={face}
        data-side={side}
        style={{ width: size.width, height: size.height, ...style }}
      >
        <PageFaceContent
          page={page}
          size={size}
          side={side}
          face={face}
        />
      </div>
    )
  }

  /**
   * 装订边与书口。
   *
   * 右页：装订边在左，书口在右 —— 从右侧书口能看到下面所有页的纸边。
   * 左页：装订边在右，书口在左。
   * 单页：默认把书口放在右侧。
   */
  const spineEdge = side === 'left' ? 'right' : 'left'
  const foreEdge = side === 'left' ? 'left' : 'right'

  return (
    <div
      className={className}
      /* 供自动化验收读取几何：翻页是否真的没有位移，比肉眼可靠得多 */
      data-face={face}
      data-side={side}
      style={{
        width: size.width,
        height: size.height,
        position: 'relative',
        transformStyle: 'preserve-3d',
        ...style,
      }}
    >
      {/* 厚度侧面：撑起纸板的长方体 */}
      <EdgeFace size={size} edge="top" thickness={t} tone={spineEdge === 'left' ? 'fore' : 'spine'} />
      <EdgeFace size={size} edge="bottom" thickness={t} tone={spineEdge === 'left' ? 'fore' : 'spine'} />
      {!hideSpineEdge && <EdgeFace size={size} edge={spineEdge} thickness={t} tone="spine" />}
      <EdgeFace size={size} edge={foreEdge} thickness={t} tone="fore" />

      {/* 正面 / 背面 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: isBack ? `translateZ(${-t}px)` : 'translateZ(0px)',
          // 背面内容需要在 Z 轴上翻转，否则内外会反
          transformStyle: 'preserve-3d',
        }}
      >
        <PageFaceContent
          page={page}
          size={size}
          side={side}
          face={face}
        />
      </div>
    </div>
  )
}

export const BookPage = memo(BookPageImpl)

export { pageThickness }

/**
 * 一页的「纯渲染」尺寸转换辅助：把页面坐标系换算成给定显示高度下的尺寸。
 * 阅读器用它保证纸板厚度与实际显示尺寸成比例。
 */
export function thicknessFor(height: number): number {
  return Math.max(4, Math.round((height / PAGE_HEIGHT) * PAGE_HEIGHT * BOARD_THICKNESS_RATIO))
}
