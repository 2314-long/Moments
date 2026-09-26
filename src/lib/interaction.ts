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

/** 本地坐标系（元素四边与坐标轴平行）中的一个矩形 + 它的中心 */
interface LocalRect {
  rect: Rect
  centre: Vec2
}

/**
 * 元素在**本地坐标系**里的矩形。
 *
 * `start.bounds` 是旋转后的轴对齐包围盒，不能直接当元素矩形用（AABB 的中心
 * 与元素中心相同，但尺寸不同）。好在快照里已经带了元素**自己**的矩形
 * （`start.elements[i].rect`），直接用它、只把中心换成本地中心即可 ——
 * 这样尺寸永远精确，旋转只在「映射回世界坐标」那一步出现。
 */
function localRectOf(start: InteractionSnapshot): LocalRect {
  const entry = start.elements[0]
  const centre = rectCenter(start.bounds)
  const width = entry.rect.width
  const height = entry.rect.height
  return {
    rect: { x: centre.x - width / 2, y: centre.y - height / 2, width, height },
    centre,
  }
}

/**
 * 单元素缩放。
 *
 * 思路：把初始 AABB 还原成**元素本地矩形**，在本地坐标系里按最朴素的
 * 轴对齐逻辑算出新尺寸，最后再把新中心映射回世界坐标（连同
 * `anchor + rotate(C − anchor, θ)` 的补偿），保证锚点在屏幕上纹丝不动。
 *
 * 之前的实现直接拿 AABB 当元素矩形用，导致「指针一动不动，
 * 旋转 90° 的 200×100 元素也会变成 150×150、锚点漂 50px」。
 */function computeResizeSingle(  start: InteractionSnapshot,
  options: {
    handle: ResizeHandle
    pointer: Vec2
    keepAspect: boolean
    fromCenter: boolean
    minSize: number
  },
): ResizeResult {
  const { handle, pointer, keepAspect, fromCenter, minSize } = options
  const rotation = start.boundsRotation

  const { rect: local, centre: localCentre } = localRectOf(start)

  // 指针 → 本地坐标系（绕 AABB 中心反旋）
  const localPointer = rotation ? rotatePoint(pointer, localCentre, -rotation) : pointer

  const affectsX = handle !== 'n' && handle !== 's'
  const affectsY = handle !== 'e' && handle !== 'w'

  /**
   * ============================ 本地缩放 ============================
   *
   * 约定：本地矩形用 `left / top / width / height` 描述，**不变量**是
   * 「每一边都从锚点那一侧量出去，所以半宽半高永远非负」。
   * 这样锚点在整个手势里都是同一个点，也就真的钉住了。
   */
  const anchorLocal: Vec2 = fromCenter
    ? localCentre
    : {
        x: handle.includes('w') ? local.x + local.width : local.x,
        y: handle.includes('n') ? local.y + local.height : local.y,
      }

  const minHalf = minSize / 2

  /**
   * 逐轴算出「新矩形的哪两条边在哪里」。
   *
   * 语义与历史版本一致：被拖动的那条边跟随指针，另一条边钉在锚点上；
   * 指针越过锚点时（尺寸被拖成负数）夹到最小尺寸，元素**不翻转**。
   * 区别只在于这里算的是**本地坐标**，所以旋转元素也是对的。
   *
   * `t` 是「本地尺寸相对原尺寸的倍数」，用于最后按比例缩放 AABB。
   */
  const axis = (along: 'x' | 'y'): { t: number; half: number } => {
    const affects = along === 'x' ? affectsX : affectsY
    const isLow = along === 'x' ? handle.includes('w') : handle.includes('n')
    const len0 = along === 'x' ? local.width : local.height
    const anchor = along === 'x' ? anchorLocal.x : anchorLocal.y
    const pointerPos = along === 'x' ? localPointer.x : localPointer.y

    if (!affects) return { t: 1, half: len0 / 2 }
    if (isLow) {
      const lo = Math.min(pointerPos, anchor - minSize)
      const len = anchor - lo
      return { t: len / Math.max(1e-9, len0), half: len / 2 }
    }
    const len = Math.max(minSize, pointerPos - anchor)
    return { t: len / Math.max(1e-9, len0), half: len / 2 }
  }

  let axisX = axis('x')
  let axisY = axis('y')
  let hx = axisX.half
  let hy = axisY.half

  const ratio = local.height === 0 ? 1 : local.width / local.height
  /**
   * 保持比例。
   *
   * 不能用「锚点到指针的距离」直接比比例：那个距离是**新尺寸**，
   * 而 ratio 来自**原尺寸**，两者只有未缩放时才相等。正确做法是先算出
   * 两个轴各自的拉伸倍数（×2 就是新尺寸/原尺寸），取变化更大的那个为准，
   * 再让另一轴跟上同一个倍数。
   */
  const applyAspect = () => {
    const sx = (hx * 2) / Math.max(1e-9, local.width)
    const sy = (hy * 2) / Math.max(1e-9, local.height)
    if (!affectsX) hx = hy * ratio
    else if (!affectsY) hy = hx / ratio
    else if (sx >= sy) hy = hx / ratio
    else hx = hy * ratio
  }

  if (keepAspect) {
    hx = Math.max(minHalf, hx)
    hy = Math.max(minHalf, hy)
    applyAspect()
    hx = Math.max(minHalf, hx)
    hy = Math.max(minHalf, hy)
    axisX = { t: (hx * 2) / Math.max(1e-9, local.width), half: hx }
    axisY = { t: (hy * 2) / Math.max(1e-9, local.height), half: hy }
  }

  const localWidth = axisX.half * 2
  const localHeight = axisY.half * 2

  // 指针没动 → 几何必须不变（也是「一碰手柄就跳」的回归基线）
  if (Math.abs(localWidth - local.width) < 1e-9 && Math.abs(localHeight - local.height) < 1e-9) {
    return {
      positions: new Map([
        [
          start.elements[0].id,
          {
            x: round(local.x),
            y: round(local.y),
            width: round(local.width),
            height: round(local.height),
          },
        ],
      ]),
    }
  }

  /**
   * 映射回世界坐标。
   *
   * 分三步，缺一不可：
   *   1. 锚点在**世界**里的位置是 `rotate(anchorLocal, 初始中心, θ)`
   *      —— `anchorLocal` 是本地量，不能直接当世界基准；
   *   2. 新中心 = 世界锚点 + rotate(本地中心偏移, θ)；
   *   3. 新 AABB = 把新矩形绕**新中心**旋转后的外接矩形
   *      （直接按当地宽高投影是错的：AABB 与元素尺寸不是投影关系，
   *        那样会越缩越小、而且回不到原值）。
   */
  const anchorWorld = rotation ? rotatePoint(anchorLocal, localCentre, rotation) : anchorLocal
  const localCenter: Vec2 = fromCenter
    ? localCentre
    : {
        x: handle.includes('w') ? anchorLocal.x - hx : anchorLocal.x + hx,
        y: handle.includes('n') ? anchorLocal.y - hy : anchorLocal.y + hy,
      }
  const offset = { x: localCenter.x - anchorLocal.x, y: localCenter.y - anchorLocal.y }
  const rotatedOffset = rotation ? rotatePoint(offset, { x: 0, y: 0 }, rotation) : offset
  const nextCenter = { x: anchorWorld.x + rotatedOffset.x, y: anchorWorld.y + rotatedOffset.y }

  /**
   * 返回值是**元素自己的矩形**（不是 AABB）：解析式给出的中心已经是元素
   * 中心，宽高就是本地宽高。编辑器的渲染是 `left/top` + 绕中心
   * `rotate(θ)`，所以这里必须回元素尺寸，AABB 只是它的派生量。
   */
  return {
    positions: new Map([
      [
        start.elements[0].id,
        {
          x: round(nextCenter.x - localWidth / 2),
          y: round(nextCenter.y - localHeight / 2),
          width: round(localWidth),
          height: round(localHeight),
        },
      ],
    ]),
  }
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
  const { keepAspect, fromCenter, minSize } = options
  const rotation = start.boundsRotation
  const origin = start.bounds

  // 单元素：走上面的「本地坐标系 + 旋转补偿」路径
  if (start.elements.length === 1) {
    return computeResizeSingle(start, options)
  }

  // 多元素：群组整体缩放（手柄画在群组包围盒上，见 ElementShell/EditorCanvas）
  const local = rotation ? rotatePoint(options.pointer, rectCenter(origin), -rotation) : options.pointer
  const anchor = anchorFor(options.handle, origin, fromCenter)
  const affectsX = options.handle !== 'n' && options.handle !== 's'
  const affectsY = options.handle !== 'e' && options.handle !== 'w'

  let left = origin.x
  let top = origin.y
  let right = origin.x + origin.width
  let bottom = origin.y + origin.height

  if (fromCenter) {
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
    if (affectsX) {
      if (options.handle.includes('w')) left = local.x
      else right = local.x
      if (options.handle.includes('w')) right = anchor.x
      else left = anchor.x
    }
    if (affectsY) {
      if (options.handle.includes('n')) top = local.y
      else bottom = local.y
      if (options.handle.includes('n')) bottom = anchor.y
      else top = anchor.y
    }
  }

  let width = Math.max(minSize, Math.abs(right - left))
  let height = Math.max(minSize, Math.abs(bottom - top))

  if (keepAspect) {
    const ratio = origin.height === 0 ? 1 : origin.width / origin.height
    if (affectsX && affectsY) {
      if (width / Math.max(1, height) > ratio) height = width / ratio
      else width = height * ratio
    } else if (affectsX) {
      height = width / ratio
    } else {
      width = height * ratio
    }
    if (fromCenter) {
      const centre = rectCenter(origin)
      left = centre.x - width / 2
      right = centre.x + width / 2
      top = centre.y - height / 2
      bottom = centre.y + height / 2
    } else {
      if (options.handle.includes('w')) left = anchor.x - width
      else left = anchor.x
      if (options.handle.includes('n')) top = anchor.y - height
      else top = anchor.y
    }
  }

  const nextBounds: Rect = { x: left, y: top, width, height }

  // 把包围盒的变化映射回每个元素
  const scaleX = origin.width === 0 ? 1 : width / origin.width
  const scaleY = origin.height === 0 ? 1 : height / origin.height
  const originCenter = rectCenter(origin)
  const nextCenter = rectCenter(nextBounds)

  const positions = new Map<string, { x: number; y: number; width: number; height: number }>()

  for (const entry of start.elements) {
    // 元素中心相对包围盒中心的位置按比例缩放；群组本身也带旋转时，
    // 这个相对向量同样要跟着转，否则群组旋转后缩放会错位
    const relativeRaw = {
      x: rectCenter(entry.rect).x - originCenter.x,
      y: rectCenter(entry.rect).y - originCenter.y,
    }
    const relative = rotation
      ? rotatePoint(relativeRaw, { x: 0, y: 0 }, rotation)
      : relativeRaw
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
