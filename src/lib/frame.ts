import type { PhotoStyle } from '@/types/album'
import { PHOTO_STYLES } from './designTokens'

/**
 * 相框几何计算。
 *
 * 这是「照片元素的外框」与「实际图片显示区域」之间的唯一换算来源。
 * 渲染组件与 demo 布局 DSL 都调用这里的函数，避免两处算法不一致导致
 * 拍立得白边宽度看起来和导出结果对不上。
 */

export interface FrameBox {
  /** 图片区域相对元素左上角的偏移 */
  left: number
  top: number
  right: number
  bottom: number
}

export function frameBox(
  style: PhotoStyle,
  width: number,
  height: number,
  frameWidth?: number,
): FrameBox {
  const token = PHOTO_STYLES[style]
  const base = frameWidth ?? Math.max(2, width * token.padRatio)
  const bottom = token.hasCaption
    ? Math.max(base, height * (token.padRatio * (token.bottomRatio - 1)))
    : base
  return { left: base, top: base, right: base, bottom }
}

/** 给定元素尺寸，算出照片实际显示区域的宽高 */
export function innerSize(
  style: PhotoStyle,
  width: number,
  height: number,
  frameWidth?: number,
): { width: number; height: number } {
  const box = frameBox(style, width, height, frameWidth)
  return {
    width: Math.max(1, width - box.left - box.right),
    height: Math.max(1, height - box.top - box.bottom),
  }
}

/**
 * 新建照片元素时的默认尺寸：
 * 保持照片原始比例，并让长边落在给定范围内。
 */
export function defaultPhotoSize(
  style: PhotoStyle,
  naturalWidth: number,
  naturalHeight: number,
  targetLongEdge = 320,
): { width: number; height: number } {
  const ratio = naturalWidth / Math.max(1, naturalHeight)
  const token = PHOTO_STYLES[style]
  // 相框会额外占用空间，先把相框算进去再反推总尺寸
  const padRatio = token.padRatio
  const bottomFactor = token.hasCaption ? token.bottomRatio : 1
  const pad = padRatio
  // 图片区宽高比 与 总宽高比 的关系：
  //   innerW = W(1 - 2p),  innerH = H(1 - p(1 + bottomFactor))
  const innerRatio = ratio
  const totalRatio =
    (innerRatio * (1 - pad * (1 + bottomFactor))) / (1 - 2 * pad)

  let width: number
  let height: number
  if (totalRatio >= 1) {
    width = targetLongEdge
    height = Math.round(targetLongEdge / totalRatio)
  } else {
    height = targetLongEdge
    width = Math.round(targetLongEdge * totalRatio)
  }
  return { width: Math.max(80, width), height: Math.max(80, height) }
}
