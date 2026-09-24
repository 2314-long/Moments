import type { StickerCategory } from '@/types/album'

/**
 * 贴纸库。
 *
 * 两类贴纸：
 *  - render: 'svg'  内置矢量图形（胶带、回形针、图钉、邮票……），
 *                   可着色、可无损缩放，是「手账感」的主要来源。
 *  - render: 'glyph' 使用 emoji 字形，作为轻量的自然 / 符号装饰。
 *
 * 设计上刻意保持克制：每个分类只放少量真正会用的元素，
 * 避免变成一个儿童贴纸 App。
 */

export interface StickerDef {
  id: string
  name: string
  category: StickerCategory
  render: 'svg' | 'glyph'
  /** render === 'glyph' 时使用 */
  glyph?: string
  /** render === 'svg' 时使用，指向 STICKER_SVGS 的 key */
  svgId?: string
  /** 默认尺寸（页面坐标） */
  width: number
  height: number
  /** 默认色，用户可在属性面板里改 */
  tint?: string
}

export const STICKER_CATEGORY_LABEL: Record<StickerCategory, string> = {
  tape: '胶带',
  stamp: '邮票',
  clip: '夹子',
  pin: '图钉',
  nature: '自然',
  symbol: '符号',
  travel: '旅行',
  line: '线条',
}

export const STICKER_LIBRARY: StickerDef[] = [
  /* ---------------- 胶带 ---------------- */
  { id: 'tape-washi-warm', name: '和纸胶带 · 暖', category: 'tape', render: 'svg', svgId: 'tapeWashi', width: 190, height: 46, tint: '#e7c9a9' },
  { id: 'tape-washi-cool', name: '和纸胶带 · 冷', category: 'tape', render: 'svg', svgId: 'tapeWashi', width: 190, height: 46, tint: '#a9c0cf' },
  { id: 'tape-washi-moss', name: '和纸胶带 · 苔', category: 'tape', render: 'svg', svgId: 'tapeWashi', width: 190, height: 46, tint: '#b3c6ab' },
  { id: 'tape-stripe', name: '条纹胶带', category: 'tape', render: 'svg', svgId: 'tapeStripe', width: 180, height: 42, tint: '#d9b8a3' },
  { id: 'tape-masking', name: '美纹纸', category: 'tape', render: 'svg', svgId: 'tapeMasking', width: 170, height: 40, tint: '#e3d9c3' },

  /* ---------------- 邮票 ---------------- */
  { id: 'stamp-postage', name: '邮票', category: 'stamp', render: 'svg', svgId: 'postageStamp', width: 130, height: 150, tint: '#cfd8cf' },
  { id: 'stamp-postage-alt', name: '邮票 · 砖红', category: 'stamp', render: 'svg', svgId: 'postageStamp', width: 130, height: 150, tint: '#e0c3bb' },

  /* ---------------- 夹子 ---------------- */
  { id: 'clip-paper', name: '回形针', category: 'clip', render: 'svg', svgId: 'paperClip', width: 54, height: 120, tint: '#9aa3ad' },
  { id: 'clip-binder', name: '长尾夹', category: 'clip', render: 'svg', svgId: 'binderClip', width: 76, height: 84, tint: '#6f747c' },
  { id: 'clip-tape-corner', name: '角贴', category: 'clip', render: 'svg', svgId: 'cornerTape', width: 92, height: 92, tint: '#dcc9a8' },

  /* ---------------- 图钉 ---------------- */
  { id: 'pin-round', name: '圆图钉', category: 'pin', render: 'svg', svgId: 'pushPin', width: 60, height: 66, tint: '#b4533f' },
  { id: 'pin-round-blue', name: '圆图钉 · 蓝', category: 'pin', render: 'svg', svgId: 'pushPin', width: 60, height: 66, tint: '#4a6b8a' },
  { id: 'pin-map', name: '地图钉', category: 'pin', render: 'svg', svgId: 'mapPin', width: 58, height: 74, tint: '#a8503a' },

  /* ---------------- 自然 ---------------- */
  { id: 'nature-leaf', name: '叶子', category: 'nature', render: 'glyph', glyph: '🍃', width: 74, height: 74 },
  { id: 'nature-fern', name: '蕨叶', category: 'nature', render: 'glyph', glyph: '🌿', width: 80, height: 80 },
  { id: 'nature-flower', name: '小花', category: 'nature', render: 'glyph', glyph: '🌸', width: 72, height: 72 },
  { id: 'nature-daisy', name: '雏菊', category: 'nature', render: 'glyph', glyph: '🌼', width: 72, height: 72 },
  { id: 'nature-mountain', name: '山峰', category: 'nature', render: 'glyph', glyph: '⛰️', width: 90, height: 90 },
  { id: 'nature-wave', name: '水波', category: 'nature', render: 'glyph', glyph: '🌊', width: 90, height: 90 },
  { id: 'nature-sun', name: '太阳', category: 'nature', render: 'svg', svgId: 'sun', width: 84, height: 84, tint: '#d9a441' },
  { id: 'nature-cloud', name: '云', category: 'nature', render: 'svg', svgId: 'cloud', width: 110, height: 66, tint: '#cfd6dd' },

  /* ---------------- 符号 ---------------- */
  { id: 'symbol-heart', name: '爱心', category: 'symbol', render: 'svg', svgId: 'heart', width: 64, height: 58, tint: '#c2603f' },
  { id: 'symbol-heart-soft', name: '爱心 · 淡', category: 'symbol', render: 'svg', svgId: 'heart', width: 58, height: 52, tint: '#d99a95' },
  { id: 'symbol-star', name: '星星', category: 'symbol', render: 'svg', svgId: 'star', width: 60, height: 60, tint: '#c9a227' },
  { id: 'symbol-sparkle', name: '闪光', category: 'symbol', render: 'svg', svgId: 'sparkle', width: 52, height: 52, tint: '#b9a06a' },
  { id: 'symbol-quote', name: '引号', category: 'symbol', render: 'svg', svgId: 'quoteMark', width: 70, height: 52, tint: '#8a8578' },

  /* ---------------- 旅行 ---------------- */
  { id: 'travel-ticket', name: '票根', category: 'travel', render: 'svg', svgId: 'ticket', width: 190, height: 84, tint: '#e9d9bd' },
  { id: 'travel-tag', name: '行李牌', category: 'travel', render: 'svg', svgId: 'luggageTag', width: 110, height: 150, tint: '#d8c6a6' },
  { id: 'travel-compass', name: '罗盘', category: 'travel', render: 'svg', svgId: 'compass', width: 88, height: 88, tint: '#7d7f83' },
  { id: 'travel-plane', name: '飞机', category: 'travel', render: 'glyph', glyph: '✈️', width: 84, height: 84 },
  { id: 'travel-camera', name: '相机', category: 'travel', render: 'glyph', glyph: '📷', width: 80, height: 80 },
  { id: 'travel-film', name: '胶卷', category: 'travel', render: 'glyph', glyph: '🎞️', width: 92, height: 92 },
  { id: 'travel-coffee', name: '咖啡', category: 'travel', render: 'glyph', glyph: '☕', width: 76, height: 76 },

  /* ---------------- 线条 ---------------- */
  { id: 'line-arrow-curve', name: '手绘箭头', category: 'line', render: 'svg', svgId: 'arrowCurve', width: 150, height: 80, tint: '#4a4a4a' },
  { id: 'line-arrow-straight', name: '直箭头', category: 'line', render: 'svg', svgId: 'arrowStraight', width: 160, height: 40, tint: '#4a4a4a' },
  { id: 'line-underline', name: '手绘下划线', category: 'line', render: 'svg', svgId: 'roughUnderline', width: 200, height: 26, tint: '#3a4a6b' },
  { id: 'line-divider', name: '分割线', category: 'line', render: 'svg', svgId: 'divider', width: 220, height: 24, tint: '#b0a99b' },
  { id: 'line-scribble', name: '涂鸦线', category: 'line', render: 'svg', svgId: 'scribble', width: 170, height: 60, tint: '#8a8578' },
]

export const STICKER_CATEGORIES: StickerCategory[] = [
  'tape',
  'stamp',
  'clip',
  'pin',
  'travel',
  'nature',
  'symbol',
  'line',
]

/** 各分类的代表贴纸，供左侧工具栏的快速入口使用 */
export const STICKER_QUICK_PICKS = [
  'tape-washi-warm',
  'tape-washi-cool',
  'stamp-postage',
  'clip-paper',
  'pin-round',
  'travel-ticket',
  'line-underline',
  'symbol-heart',
]
