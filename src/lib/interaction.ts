import type { Rect, Vec2 } from './geometry'
import { boundsOf, distance, hitTestRect, rectCenter, rectsIntersect, rotatePoint, snapAngle } from './geometry'
import type { AlbumElement } from '@/types/album'
import { round } from './utils'

/**
 * 编辑器画布交互引擎。
 *
 * 与 React 解耦：这里只做「指针位置 → 几何结果」的纯计算，
 * Canvas 组件负责把结果写进 store。这样拖拽逻辑可以单独测试，
 * 也避免把大量数学写在组件里。
 *
 * 坐标约定：所有输入输出都是「页面坐标系」，缩放换算由调用方完成。
 */

export type InteractionKind = 'idle' | 'drag' | 'resize' | 'rotate' | 'marquee'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface InteractionSnapshot {
  pointer: Vec2
  elements: Array<{ id: string; rect: Rect; rotation: number }>
  /** 多选时的整体包围盒 */
  bounds: Rect
  boundsRotation: number
  /** 起始时的旋转角度（针对被拖拽的主元素） */
  startAngle: number
}

export interface AlignmentGuide {
  axis: 'x' | 'y'
  /** 页面坐标系中的位置 */
  position: number
  /** 引导线覆盖的范围，用于只画相关的一段 */
  from: number
  to: number
  /** 吸附到的目标元素 id（页面本身为 null） */
  targetId: string | null
}

export interface DragOptions {
  /** 对齐吸附，按住 Alt 可临时关闭 */
  snap: boolean
  /** 位移量，单位页面坐标 */
  delta: Vec2
  /** 被拖拽元素的原始位置 */
  startPositions: Map<string, Vec2>
  /** 页面尺寸，用于吸附到页边与页中心 */
  pageSize: { width: number; height: number }
  /** 页面上其它元素（不参与移动），用于元素间吸附 */
  others: Array<{ id: string; rect: Rect; rotation: number }>
}

const SNAP_THRESHOLD = 6

/* ------------------------------------------------------------------ *
 * 拖拽
 * ------------------------------------------------------------------ */

export interface DragResult {
  positions: Map<string, Vec2>
  guides: AlignmentGuide[]
}

/**
 * 计算拖拽后的位置。
 *
 * 吸附策略：只在「主元素」上吸附（多选时以包围盒为准），
 * 对齐候选包括页面中线、页边距线，以及其它元素的边与中线。
 */
export function computeDrag(start: InteractionSnapshot, options: DragOptions): DragResult {
  const { delta, snap, startPositions, pageSize, others } = options
  const positions = new Map<string, Vec2>()

  // 原始包围盒
  const originBounds = start.bounds
  const rawBounds: Rect = {
    x: originBounds.x + delta.x,
    y: originBounds.y + delta.y,
    width: originBounds.width,
    height: originBounds.height,
  }

  let snapDx = 0
  let snapDy = 0
  const guides: AlignmentGuide[] = []

  if (snap && start.boundsRotation === 0) {
    const targetXs = buildSnapLines(pageSize, others, 'x')
    const targetYs = buildSnapLines(pageSize, others, 'y')

    const sourceXs = [rawBounds.x, rawBounds.x + rawBounds.width / 2, rawBounds.x + rawBounds.width]
    const sourceYs = [rawBounds.y, rawBounds.y + rawBounds.height / 2, rawBounds.y + rawBounds.height]

    const bestX = findSnap(sourceXs, targetXs)
    if (bestX) {
      snapDx = bestX.value - bestX.source
      guides.push({
        axis: 'x',
        position: bestX.value,
        from: Math.min(rawBounds.y, bestX.lineFrom),
        to: Math.max(rawBounds.y + rawBounds.height, bestX.lineTo),
        targetId: bestX.targetId,
      })
    }

    const bestY = findSnap(sourceYs, targetYs)
    if (bestY) {
      snapDy = bestY.value - bestY.source
      guides.push({
        axis: 'y',
        position: bestY.value,
        from: Math.min(rawBounds.x, bestY.lineFrom),
        to: Math.max(rawBounds.x + rawBounds.width, bestY.lineTo),
        targetId: bestY.targetId,
      })
    }
  }

  const finalDelta = { x: delta.x + snapDx, y: delta.y + snapDy }
  for (const [id, origin] of startPositions) {
    positions.set(id, { x: round(origin.x + finalDelta.x), y: round(origin.y + finalDelta.y) })
  }

  return { positions, guides }
}

interface SnapLine {
  value: number
  targetId: string | null
  lineFrom: number
  lineTo: number
}

function buildSnapLines(
  pageSize: { width: number; height: number },
  others: Array<{ id: string; rect: Rect; rotation: number }>,
  axis: 'x' | 'y',
): SnapLine[] {
  const lines: SnapLine[] = []

  // 页面中线与页边
  if (axis === 'x') {
    lines.push({ value: pageSize.width / 2, targetId: null, lineFrom: 0, lineTo: pageSize.height })
    lines.push({ value: 0, targetId: null, lineFrom: 0, lineTo: pageSize.height })
    lines.push({ value: pageSize.width, targetId: null, lineFrom: 0, lineTo: pageSize.height })
  } else {
    lines.push({ value: pageSize.height / 2, targetId: null, lineFrom: 0, lineTo: pageSize.width })
    lines.push({ value: 0, targetId: null, lineFrom: 0, lineTo: pageSize.width })
    lines.push({ value: pageSize.height, targetId: null, lineFrom: 0, lineTo: pageSize.width })
  }

  for (const other of others) {
    const box = boundsOf(other.rect, other.rotation)
    if (axis === 'x') {
      lines.push({ value: box.x, targetId: other.id, lineFrom: box.y, lineTo: box.y + box.height })
      lines.push({ value: box.x + box.width / 2, targetId: other.id, lineFrom: box.y, lineTo: box.y + box.height })
      lines.push({ value: box.x + box.width, targetId: other.id, lineFrom: box.y, lineTo: box.y + box.height })
    } else {
      lines.push({ value: box.y, targetId: other.id, lineFrom: box.x, lineTo: box.x + box.width })
      lines.push({ value: box.y + box.height / 2, targetId: other.id, lineFrom: box.x, lineTo: box.x + box.width })
      lines.push({ value: box.y + box.height, targetId: other.id, lineFrom: box.x, lineTo: box.x + box.width })
    }
  }

  return lines
}

function findSnap(
  sources: number[],
  targets: SnapLine[],
): { source: number; value: number; targetId: string | null; lineFrom: number; lineTo: number } | null {
  let best: { source: number; value: number; targetId: string | null; lineFrom: number; lineTo: number; delta: number } | null =
    null
  for (const source of sources) {
    for (const target of targets) {
      const delta = Math.abs(target.value - source)
      if (delta > SNAP_THRESHOLD) continue
      if (!best || delta < best.delta) {
        best = {
          source,
          value: target.value,
          targetId: target.targetId,
          lineFrom: target.lineFrom,
          lineTo: target.lineTo,
          delta,
        }
      }
    }
  }
  return best
}

/* ------------------------------------------------------------------ *
 * 缩放
 * ------------------------------------------------------------------ */

export interface ResizeResult {
  positions: Map<string, { x: number; y: number; width: number; height: number }>
}

export function computeResize(
  start: InteractionSnapshot,
  options: {
    handle: ResizeHandle
    /** 指针在「起始旋转坐标系」中的位置 */
    pointer: Vec2
    keepAspect: boolean
    fromCenter: boolean
    minSize: number
  },
): ResizeResult {
  const { handle, pointer, keepAspect, fromCenter, minSize } = options
  const rotation = start.boundsRotation
  const origin = start.bounds

  // 把指针反向旋转回未旋转的坐标系
  const local = rotation
    ? rotatePoint(pointer, rectCenter(origin), -rotation)
    : pointer

  const anchor = anchorFor(handle, origin, fromCenter)
  const affectsX = handle !== 'n' && handle !== 's'
  const affectsY = handle !== 'e' && handle !== 'w'

  let left = origin.x
  let top = origin.y
  let right = origin.x + origin.width
  let bottom = origin.y + origin.height

  if (fromCenter) {
    // 围绕中心对称缩放
    const centre = rectCenter(origin)
    if (affectsX) {
      const half = Math.abs(local.x - centre.x)
      left = centre.x - half
      right = centre.x + half
    }
    if (affectsY) {
      const half = Math.abs(local.y - centre.y)
      top = centre.y - half
      bottom = centre.y + half
    }
  } else {
    // 被拖动的边跟随指针，其余边由锚点钉住
    if (affectsX) {
      if (handle.includes('w')) left = local.x
      else right = local.x
    }
    if (affectsY) {
      if (handle.includes('n')) top = local.y
      else bottom = local.y
    }
    if (affectsX) (handle.includes('w') ? (right = anchor.x) : (left = anchor.x))
    if (affectsY) (handle.includes('n') ? (bottom = anchor.y) : (top = anchor.y))
  }

  let width = Math.max(minSize, right - left)
  let height = Math.max(minSize, bottom - top)

  // 保持比例：按指针到锚点的距离反推另一条边，而不是直接套用原始比例，
  // 否则拖拽时元素会突然跳变。
  if (keepAspect && affectsX && affectsY && !fromCenter) {
    const ratio = origin.width / Math.max(1, origin.height)
    const rawWidth = Math.max(minSize, Math.abs(local.x - anchor.x))
    const rawHeight = Math.max(minSize, Math.abs(local.y - anchor.y))
    if (rawWidth / rawHeight > ratio) {
      width = rawWidth
      height = rawWidth / ratio
    } else {
      height = rawHeight
      width = rawHeight * ratio
    }
    if (handle.includes('w')) left = anchor.x - width
    else left = anchor.x
    if (handle.includes('n')) top = anchor.y - height
    else top = anchor.y
  }

  const nextBounds: Rect = { x: left, y: top, width, height }

  // 把包围盒的变化映射回每个元素
  const scaleX = origin.width === 0 ? 1 : width / origin.width
  const scaleY = origin.height === 0 ? 1 : height / origin.height
  const originCenter = rectCenter(origin)
  const nextCenter = rectCenter(nextBounds)

  const positions = new Map<string, { x: number; y: number; width: number; height: number }>()

  if (start.elements.length === 1) {
    const only = start.elements[0]
    // 单元素：直接给出新几何，避免浮点累积误差
    positions.set(only.id, {
      x: round(left),
      y: round(top),
      width: round(width),
      height: round(height),
    })
    return { positions }
  }

  for (const entry of start.elements) {
    // 元素中心相对包围盒中心的位置按比例缩放
    const relative = {
      x: rectCenter(entry.rect).x - originCenter.x,
      y: rectCenter(entry.rect).y - originCenter.y,
    }
    const nextCenterPoint = {
      x: nextCenter.x + relative.x * scaleX,
      y: nextCenter.y + relative.y * scaleY,
    }
    const nextWidth = Math.max(minSize, entry.rect.width * scaleX)
    const nextHeight = Math.max(minSize, entry.rect.height * scaleY)
    positions.set(entry.id, {
      x: round(nextCenterPoint.x - nextWidth / 2),
      y: round(nextCenterPoint.y - nextHeight / 2),
      width: round(nextWidth),
      height: round(nextHeight),
    })
  }

  return { positions }
}

/**
 * 缩放时保持不动的锚点。
 *
 * 注意：返回的是「被拖动手柄的对角（或对边）」，
 * 也就是那个必须保持位置不变的点。写反会让整个元素在缩放时漂移。
 */
function anchorFor(handle: ResizeHandle, rect: Rect, fromCenter: boolean): Vec2 {
  if (fromCenter) return rectCenter(rect)
  switch (handle) {
    case 'nw':
      return { x: rect.x + rect.width, y: rect.y + rect.height }
    case 'ne':
      return { x: rect.x, y: rect.y + rect.height }
    case 'sw':
      return { x: rect.x + rect.width, y: rect.y }
    case 'se':
      return { x: rect.x, y: rect.y }
    case 'n':
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height }
    case 's':
      return { x: rect.x + rect.width / 2, y: rect.y }
    case 'w':
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
    case 'e':
    default:
      return { x: rect.x, y: rect.y + rect.height / 2 }
  }
}

/* ------------------------------------------------------------------ *
 * 旋转
 * ------------------------------------------------------------------ */

export function computeRotation(
  start: InteractionSnapshot,
  pointer: Vec2,
  options: { snap: boolean; step?: number },
): Map<string, number> {
  const center = rectCenter(start.bounds)
  const angle = angleOf(center, pointer)
  const delta = angle - start.startAngle

  const result = new Map<string, number>()
  for (const entry of start.elements) {
    const next = entry.rotation + delta
    result.set(entry.id, options.snap ? snapAngle(next, options.step ?? 15, 3) : round(next, 1))
  }
  return result
}

function angleOf(center: Vec2, point: Vec2): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) / (Math.PI / 180) + 90 + 360) % 360
}

/* ------------------------------------------------------------------ *
 * 框选
 * ------------------------------------------------------------------ */

export function normalizeRect(a: Vec2, b: Vec2): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}

export function elementsInRect(
  elements: AlbumElement[],
  rect: Rect,
): string[] {
  return elements
    .filter(
      (element) =>
        !element.locked &&
        rectsIntersect(
          { x: element.x, y: element.y, width: element.width, height: element.height },
          element.rotation,
          rect,
          0,
        ),
    )
    .map((element) => element.id)
}

/** 命中测试：从最上层往下找第一个命中的元素 */
export function elementAtPoint(
  elements: AlbumElement[],
  point: Vec2,
  options: { ignoreLocked?: boolean } = {},
): AlbumElement | null {
  for (let index = elements.length - 1; index >= 0; index--) {
    const element = elements[index]
    if (options.ignoreLocked && element.locked) continue
    if (
      hitTestRect(
        point,
        { x: element.x, y: element.y, width: element.width, height: element.height },
        element.rotation,
      )
    ) {
      return element
    }
  }
  return null
}

/** 元素包围盒（未旋转） */
export function elementRect(element: AlbumElement): Rect {
  return { x: element.x, y: element.y, width: element.width, height: element.height }
}

/** 多选包围盒 */
export function selectionBounds(elements: AlbumElement[]): Rect | null {
  if (!elements.length) return null
  const boxes = elements.map((e) => boundsOf(elementRect(e), e.rotation))
  const minX = Math.min(...boxes.map((b) => b.x))
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxX = Math.max(...boxes.map((b) => b.x + b.width))
  const maxY = Math.max(...boxes.map((b) => b.y + b.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** 手柄在屏幕上的命中半径换算（页面坐标） */
export function handleHitRadius(scale: number): number {
  return 11 / Math.max(0.15, scale)
}

export { distance }
