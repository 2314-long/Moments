import type {
  AlbumElement,
  DateElement,
  GeoPoint,
  MapElement,
  NoteElement,
  Page,
  PhotoElement,
  PhotoStyle,
  ShapeElement,
  StampElement,
  StickerElement,
  TextElement,
  TextPreset,
} from '@/types/album'
import { newElementId } from '@/lib/id'
import { TEXT_PRESETS, FONT_STACK } from '@/lib/designTokens'
import { defaultPhotoSize } from '@/lib/frame'
import { STICKER_LIBRARY } from '@/lib/stickerLibrary'

/**
 * demo 纪念册的页面构建 DSL。
 *
 * 手写 12 页 × 每页 8~14 个元素的字面量会有近千行且难以维护，
 * 因此这里提供一组小构造函数：每个元素只声明「是什么、在哪、多大」，
 * 其余（字体、相框内边距、旋转抖动）由设计 token 统一决定。
 *
 * 关键点：旋转角度必须是确定性的常量，不能用 Math.random()，
 * 否则每次刷新页面手账元素的倾斜都会变化。
 */

/* ------------------------------------------------------------------ *
 * 元素构造
 * ------------------------------------------------------------------ */

export function photo(
  photoId: string,
  opts: {
    x: number
    y: number
    width?: number
    height?: number
    style?: PhotoStyle
    rotation?: number
    caption?: string
    natural?: [number, number]
    z?: never
  },
): PhotoElement {
  const style = opts.style ?? 'plain'
  const natural = opts.natural ?? [1200, 900]
  let width = opts.width
  let height = opts.height
  if (!width || !height) {
    const auto = defaultPhotoSize(style, natural[0], natural[1], Math.max(width ?? 0, height ?? 0) || 320)
    width = width ?? auto.width
    height = height ?? auto.height
  }
  return {
    id: newElementId(),
    kind: 'photo',
    x: opts.x,
    y: opts.y,
    width,
    height,
    rotation: opts.rotation ?? 0,
    opacity: 1,
    locked: false,
    radius: undefined,
    shadow: 0.55,
    data: {
      photoId,
      style,
      fit: 'cover',
      caption: opts.caption,
      focusX: 0.5,
      focusY: 0.5,
      filterStrength: 1,
    },
  }
}

export function text(
  preset: TextPreset,
  content: string,
  opts: {
    x: number
    y: number
    width?: number
    height?: number
    rotation?: number
    color?: string
    align?: TextElement['data']['align']
    fontSize?: number
  },
): TextElement {
  const token = TEXT_PRESETS[preset]
  const fontSize = opts.fontSize ?? token.fontSize
  const lineCount = content.split('\n').length
  return {
    id: newElementId(),
    kind: 'text',
    x: opts.x,
    y: opts.y,
    width: opts.width ?? 320,
    height: opts.height ?? Math.ceil(fontSize * token.lineHeight * lineCount + 8),
    rotation: opts.rotation ?? 0,
    opacity: 1,
    locked: false,
    data: {
      text: content,
      preset,
      fontFamily: FONT_STACK[token.fontFamily],
      fontSize,
      fontWeight: token.fontWeight,
      italic: token.italic ?? false,
      letterSpacing: token.letterSpacing,
      lineHeight: token.lineHeight,
      color: opts.color ?? token.color,
      align: opts.align ?? token.align,
      underline: token.underline,
    },
  }
}

function stickerById(id: string): StickerElement | null {
  const def = STICKER_LIBRARY.find((s) => s.id === id)
  if (!def) return null
  return {
    id: newElementId(),
    kind: 'sticker',
    x: 0,
    y: 0,
    width: def.width,
    height: def.height,
    rotation: 0,
    opacity: 1,
    locked: false,
    shadow: 0.3,
    data: {
      glyph: def.glyph ?? '',
      render: def.render,
      svgId: def.svgId,
      category: def.category,
      tint: def.tint,
    },
  }
}

export function sticker(
  stickerId: string,
  opts: { x: number; y: number; rotation?: number; scale?: number; opacity?: number; width?: number; height?: number },
): StickerElement {
  const el = stickerById(stickerId)
  if (!el) throw new Error(`未知贴纸: ${stickerId}`)
  const scale = opts.scale ?? 1
  el.x = opts.x
  el.y = opts.y
  el.width = (opts.width ?? el.width) * scale
  el.height = (opts.height ?? el.height) * scale
  el.rotation = opts.rotation ?? 0
  el.opacity = opts.opacity ?? 1
  return el
}

export function note(
  content: string,
  opts: {
    x: number
    y: number
    width?: number
    height?: number
    rotation?: number
    variant?: NoteElement['data']['variant']
    background?: string
    color?: string
    fontSize?: number
  },
): NoteElement {
  const variant = opts.variant ?? 'sticky'
  const backgrounds: Record<NoteElement['data']['variant'], string> = {
    sticky: '#f6e7a8',
    kraft: '#e3d0ae',
    lined: '#fbf7ec',
    plain: '#f4f1e8',
    torn: '#f0e9db',
  }
  return {
    id: newElementId(),
    kind: 'note',
    x: opts.x,
    y: opts.y,
    width: opts.width ?? 200,
    height: opts.height ?? 160,
    rotation: opts.rotation ?? -1.6,
    opacity: 1,
    locked: false,
    shadow: 0.45,
    data: {
      text: content,
      variant,
      fontFamily: FONT_STACK.hand,
      fontSize: opts.fontSize ?? 17,
      color: opts.color ?? '#4a4436',
      background: opts.background ?? backgrounds[variant],
    },
  }
}

export function stamp(
  content: string,
  opts: {
    x: number
    y: number
    subText?: string
    width?: number
    height?: number
    rotation?: number
    shape?: StampElement['data']['shape']
    color?: string
    distress?: number
    opacity?: number
  },
): StampElement {
  const shape = opts.shape ?? 'circle'
  const width = opts.width ?? 118
  return {
    id: newElementId(),
    kind: 'stamp',
    x: opts.x,
    y: opts.y,
    width,
    height: opts.height ?? width,
    rotation: opts.rotation ?? -8,
    opacity: opts.opacity ?? 0.88,
    locked: false,
    shadow: 0,
    data: {
      text: content,
      subText: opts.subText,
      shape,
      color: opts.color ?? '#9c4a3c',
      distress: opts.distress ?? 0.35,
    },
  }
}

export function dateEl(
  iso: string,
  opts: {
    x: number
    y: number
    format?: DateElement['data']['format']
    endDate?: string
    fontSize?: number
    color?: string
    align?: DateElement['data']['format']
    width?: number
    rotation?: number
  },
): DateElement {
  const fontSize = opts.fontSize ?? 18
  return {
    id: newElementId(),
    kind: 'date',
    x: opts.x,
    y: opts.y,
    width: opts.width ?? 260,
    height: Math.ceil(fontSize * 1.8),
    rotation: opts.rotation ?? 0,
    opacity: 1,
    locked: false,
    data: {
      date: iso,
      endDate: opts.endDate,
      format: opts.format ?? 'dot',
      fontFamily: FONT_STACK.mono,
      fontSize,
      color: opts.color ?? '#7a7a7a',
    },
  }
}

export function shape(
  kind: ShapeElement['data']['shape'],
  opts: { x: number; y: number; width: number; height: number; fill?: string; stroke?: string; strokeWidth?: number; rotation?: number; opacity?: number },
): ShapeElement {
  return {
    id: newElementId(),
    kind: 'shape',
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    rotation: opts.rotation ?? 0,
    opacity: opts.opacity ?? 1,
    locked: false,
    shadow: 0,
    data: {
      shape: kind,
      fill: opts.fill ?? 'transparent',
      stroke: opts.stroke ?? '#8a8578',
      strokeWidth: opts.strokeWidth ?? 1.5,
    },
  }
}

export function mapEl(
  title: string,
  points: MapElement['data']['points'],
  opts: { x: number; y: number; width?: number; height?: number; ink?: string; accent?: string; rotation?: number },
): MapElement {
  return {
    id: newElementId(),
    kind: 'map',
    x: opts.x,
    y: opts.y,
    width: opts.width ?? 560,
    height: opts.height ?? 420,
    rotation: opts.rotation ?? 0,
    opacity: 1,
    locked: false,
    shadow: 0.3,
    data: {
      title,
      points,
      ink: opts.ink ?? '#5c6b7a',
      accent: opts.accent ?? '#a8503a',
      showLabels: true,
    },
  }
}

/* ------------------------------------------------------------------ *
 * 页面构造
 * ------------------------------------------------------------------ */

export function page(
  title: string,
  role: Page['role'],
  background: Page['background'],
  elements: Array<AlbumElement | null | undefined>,
  extra?: Partial<Pick<Page, 'date' | 'location' | 'memo'>>,
): Page {
  return {
    id: `pg_${role}_${Math.abs(hashString(title))}`,
    title,
    role,
    background,
    elements: elements.filter((e): e is AlbumElement => Boolean(e)),
    ...extra,
  }
}

function hashString(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0
  return h
}

/* ------------------------------------------------------------------ *
 * demo 行程数据
 * ------------------------------------------------------------------ */

export const JIUZHAIGOU_ROUTE: Array<{ name: string; lat: number; lng: number; note?: string }> = [
  { name: '成都', lat: 30.5728, lng: 104.0668, note: '出发 · 海拔 500m' },
  { name: '汶川', lat: 31.4769, lng: 103.5901, note: '山路开始' },
  { name: '松潘', lat: 32.6553, lng: 103.5986, note: '午餐 · 海拔 2850m' },
  { name: '九寨沟', lat: 33.2601, lng: 103.9178, note: '抵达 · 海拔 2000m' },
]

export const JIUZHAIGOU_LOCATION: GeoPoint = {
  name: '九寨沟',
  region: '四川 · 阿坝 · 九寨沟',
  lat: 33.2601,
  lng: 103.9178,
  altitude: 2000,
}

/** demo 照片清单：id → 静态资源 + 尺寸，供 seed 与素材库共用 */
export interface DemoPhoto {
  id: string
  url: string
  name: string
  width: number
  height: number
  takenAt: string
  location?: GeoPoint
  alt: string
}

export const DEMO_PHOTOS: DemoPhoto[] = [
  { id: 'ph_lake_01', url: '/demo/lake-01.png', name: 'lake-01.png', width: 1280, height: 854, takenAt: '2026-08-13T09:12:00+08:00', location: { name: '五花海', region: '四川 · 九寨沟 · 五花海', altitude: 2472 }, alt: '晨雾中的湖面' },
  { id: 'ph_lake_02', url: '/demo/lake-02.png', name: 'lake-02.png', width: 1200, height: 900, takenAt: '2026-08-13T09:40:00+08:00', location: { name: '五花海', region: '四川 · 九寨沟 · 五花海', altitude: 2472 }, alt: '孔雀蓝的湖水' },
  { id: 'ph_lake_03', url: '/demo/lake-03.png', name: 'lake-03.png', width: 1280, height: 854, takenAt: '2026-08-13T11:05:00+08:00', location: { name: '长海', region: '四川 · 九寨沟 · 长海', altitude: 3060 }, alt: '长海的深蓝' },
  { id: 'ph_lake_04', url: '/demo/lake-04.png', name: 'lake-04.png', width: 1280, height: 854, takenAt: '2026-08-13T14:20:00+08:00', location: { name: '树正群海', region: '四川 · 九寨沟 · 树正沟', altitude: 2187 }, alt: '俯瞰群海' },
  { id: 'ph_lake_05', url: '/demo/lake-05.png', name: 'lake-05.png', width: 1000, height: 1000, takenAt: '2026-08-13T15:02:00+08:00', location: { name: '五花海', region: '四川 · 九寨沟 · 五花海' }, alt: '水边的倒影' },
  { id: 'ph_lake_06', url: '/demo/lake-06.png', name: 'lake-06.png', width: 1280, height: 854, takenAt: '2026-08-14T10:15:00+08:00', location: { name: '箭竹海', region: '四川 · 九寨沟 · 箭竹海', altitude: 2618 }, alt: '箭竹海的清晨' },
  { id: 'ph_forest_01', url: '/demo/forest-01.png', name: 'forest-01.png', width: 900, height: 1200, takenAt: '2026-08-14T08:30:00+08:00', location: { name: '原始森林', region: '四川 · 九寨沟' }, alt: '林间的光' },
  { id: 'ph_forest_02', url: '/demo/forest-02.png', name: 'forest-02.png', width: 1280, height: 854, takenAt: '2026-08-14T09:00:00+08:00', location: { name: '原始森林', region: '四川 · 九寨沟' }, alt: '层叠的树冠' },
  { id: 'ph_forest_03', url: '/demo/forest-03.png', name: 'forest-03.png', width: 1200, height: 900, takenAt: '2026-08-14T09:25:00+08:00', location: { name: '原始森林', region: '四川 · 九寨沟' }, alt: '森林深处' },
  { id: 'ph_forest_04', url: '/demo/forest-04.png', name: 'forest-04.png', width: 1000, height: 1000, takenAt: '2026-08-14T09:48:00+08:00', location: { name: '原始森林', region: '四川 · 九寨沟' }, alt: '苔藓与落叶' },
  { id: 'ph_falls_01', url: '/demo/falls-01.png', name: 'falls-01.png', width: 1200, height: 900, takenAt: '2026-08-13T16:10:00+08:00', location: { name: '珍珠滩瀑布', region: '四川 · 九寨沟 · 珍珠滩', altitude: 2433 }, alt: '珍珠滩瀑布' },
  { id: 'ph_falls_02', url: '/demo/falls-02.png', name: 'falls-02.png', width: 1280, height: 854, takenAt: '2026-08-13T16:32:00+08:00', location: { name: '珍珠滩瀑布', region: '四川 · 九寨沟 · 珍珠滩' }, alt: '水雾里的彩虹' },
  { id: 'ph_peak_01', url: '/demo/peak-01.png', name: 'peak-01.png', width: 1280, height: 854, takenAt: '2026-08-14T13:40:00+08:00', location: { name: '黄龙', region: '四川 · 阿坝 · 黄龙', altitude: 3550 }, alt: '雪山垭口' },
  { id: 'ph_peak_02', url: '/demo/peak-02.png', name: 'peak-02.png', width: 1200, height: 900, takenAt: '2026-08-14T14:05:00+08:00', location: { name: '黄龙', region: '四川 · 阿坝 · 黄龙' }, alt: '云上的山脊' },
  { id: 'ph_peak_03', url: '/demo/peak-03.png', name: 'peak-03.png', width: 900, height: 1200, takenAt: '2026-08-14T14:30:00+08:00', location: { name: '黄龙', region: '四川 · 阿坝 · 黄龙' }, alt: '竖幅山景' },
  { id: 'ph_road_01', url: '/demo/road-01.png', name: 'road-01.png', width: 1280, height: 854, takenAt: '2026-08-12T10:20:00+08:00', location: { name: '汶川', region: '四川 · 阿坝 · 汶川' }, alt: '盘山公路' },
  { id: 'ph_road_02', url: '/demo/road-02.png', name: 'road-02.png', width: 1200, height: 900, takenAt: '2026-08-12T13:45:00+08:00', location: { name: '松潘', region: '四川 · 阿坝 · 松潘', altitude: 2850 }, alt: '路上的风景' },
  { id: 'ph_people_01', url: '/demo/people-01.png', name: 'people-01.png', width: 1000, height: 1000, takenAt: '2026-08-15T11:00:00+08:00', location: { name: '树正群海', region: '四川 · 九寨沟' }, alt: '三个人的合影' },
  { id: 'ph_people_02', url: '/demo/people-02.png', name: 'people-02.png', width: 1200, height: 900, takenAt: '2026-08-15T11:20:00+08:00', location: { name: '树正群海', region: '四川 · 九寨沟' }, alt: '湖边合影' },
  { id: 'ph_people_03', url: '/demo/people-03.png', name: 'people-03.png', width: 1200, height: 900, takenAt: '2026-08-15T16:40:00+08:00', location: { name: '九寨沟', region: '四川 · 九寨沟' }, alt: '夕阳下的合影' },
  { id: 'ph_people_04', url: '/demo/people-04.png', name: 'people-04.png', width: 1000, height: 1000, takenAt: '2026-08-15T17:05:00+08:00', location: { name: '九寨沟', region: '四川 · 九寨沟' }, alt: '两个人的背影' },
  { id: 'ph_people_05', url: '/demo/people-05.png', name: 'people-05.png', width: 900, height: 1200, takenAt: '2026-08-15T17:30:00+08:00', location: { name: '九寨沟', region: '四川 · 九寨沟' }, alt: '竖幅人像' },
  { id: 'ph_food_01', url: '/demo/food-01.png', name: 'food-01.png', width: 1000, height: 1000, takenAt: '2026-08-12T18:30:00+08:00', location: { name: '松潘', region: '四川 · 阿坝 · 松潘' }, alt: '路上的第一顿饭' },
  { id: 'ph_food_02', url: '/demo/food-02.png', name: 'food-02.png', width: 1200, height: 900, takenAt: '2026-08-14T19:10:00+08:00', location: { name: '九寨沟', region: '四川 · 九寨沟' }, alt: '当地的晚餐' },
  { id: 'ph_night_01', url: '/demo/night-01.png', name: 'night-01.png', width: 1280, height: 854, takenAt: '2026-08-14T21:40:00+08:00', location: { name: '九寨沟', region: '四川 · 九寨沟' }, alt: '星空下的山谷' },
  { id: 'ph_night_02', url: '/demo/night-02.png', name: 'night-02.png', width: 1200, height: 900, takenAt: '2026-08-14T22:05:00+08:00', location: { name: '九寨沟', region: '四川 · 九寨沟' }, alt: '夜里的小镇' },
]

export const DEMO_PHOTO_MAP = new Map(DEMO_PHOTOS.map((p) => [p.id, p]))

/** 查一张 demo 照片的原始宽高 */
export function demoNatural(id: string): [number, number] {
  const found = DEMO_PHOTO_MAP.get(id)
  return found ? [found.width, found.height] : [1200, 900]
}
