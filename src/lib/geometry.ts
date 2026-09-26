/**
 * 几何计算 —— 编辑器拖拽 / 缩放 / 旋转的数学核心。
 *
 * 坐标约定：
 *  - 元素位置 (x, y) 为「未旋转时」的左上角，位于页面坐标系。
 *  - 旋转围绕元素中心进行。
 *  - 所有命中测试与手柄计算都基于这两个约定。
 */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Vec2 {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export const DEG = Math.PI / 180

export function rotatePoint(point: Vec2, origin: Vec2, degrees: number): Vec2 {
  const rad = degrees * DEG
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  }
}

export function rectCenter(rect: Rect): Vec2 {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

/** 元素旋转后的四个角（页面坐标，顺序：左上 右上 右下 左下） */
export function rectCorners(rect: Rect, rotation: number): Vec2[] {
  const c = rectCenter(rect)
  const pts: Vec2[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ]
  return rotation === 0 ? pts : pts.map((p) => rotatePoint(p, c, rotation))
}

/** 旋转后元素的轴对齐包围盒 */
export function boundsOf(rect: Rect, rotation: number): Rect {
  if (!rotation) return { ...rect }
  const corners = rectCorners(rect, rotation)
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  }
}

/**
 * 一个点是否落在（可能被旋转的）矩形内。
 * 做法是把点反向旋转回元素本地坐标系再比较。
 */
export function hitTestRect(point: Vec2, rect: Rect, rotation: number): boolean {
  const c = rectCenter(rect)
  const local = rotation ? rotatePoint(point, c, -rotation) : point
  return (
    local.x >= rect.x &&
    local.x <= rect.x + rect.width &&
    local.y >= rect.y &&
    local.y <= rect.y + rect.height
  )
}

/** 矩形是否与矩形相交（两者都可能是旋转过的） */
export function rectsIntersect(a: Rect, aRot: number, b: Rect, bRot: number): boolean {
  if (!aRot && !bRot) {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    )
  }
  const pa = rectCorners(a, aRot)
  const pb = rectCorners(b, bRot)
  return polygonIntersect(pa, pb) || pointInPolygon(pa[0], pb) || pointInPolygon(pb[0], pa)
}

function polygonIntersect(a: Vec2[], b: Vec2[]): boolean {
  const edges = [...a.map((p, i) => [p, a[(i + 1) % a.length]] as const), ...b.map((p, i) => [p, b[(i + 1) % b.length]] as const)]
  for (const [p1, p2] of edges) {
    const axis = { x: -(p2.y - p1.y), y: p2.x - p1.x }
    if (!overlapsOnAxis(a, b, axis)) return false
  }
  return true
}

function overlapsOnAxis(a: Vec2[], b: Vec2[], axis: Vec2): boolean {
  const proj = (pts: Vec2[]) => {
    const values = pts.map((p) => p.x * axis.x + p.y * axis.y)
    return { min: Math.min(...values), max: Math.max(...values) }
  }
  const ra = proj(a)
  const rb = proj(b)
  return ra.max >= rb.min && rb.max >= ra.min
}

function pointInPolygon(point: Vec2, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    const intersect =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (intersect) inside = !inside
  }
  return inside
}

/** 角度吸附（每 15°，接近 0/90/180/270 时更积极） */
export function snapAngle(angle: number, step = 15, tolerance = 4): number {
  const normalized = ((angle % 360) + 360) % 360
  const nearest = Math.round(normalized / step) * step
  const diff = Math.abs(normalized - nearest)
  if (diff <= tolerance) return nearest >= 360 ? 0 : nearest
  return Math.round(normalized * 10) / 10
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** 屏幕坐标 → 页面坐标 */
export function toPageSpace(
  client: Vec2,
  containerRect: Rect,
  scale: number,
): Vec2 {
  return {
    x: (client.x - containerRect.x) / scale,
    y: (client.y - containerRect.y) / scale,
  }
}
