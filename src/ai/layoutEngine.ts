import type { Page } from '@/types/album'
import { newElementId } from '@/lib/id'
import { FONT_STACK, PAGE_HEIGHT, PAGE_WIDTH, PAPERS, PHOTO_STYLES, TEXT_PRESETS } from '@/lib/designTokens'
import { defaultPhotoSize } from '@/lib/frame'
import { STICKER_LIBRARY } from '@/lib/stickerLibrary'

/**
 * AI 排版使用的布局生成器。
 *
 * 与 demo 的手写页面不同，这里必须由数据驱动：任意数量、任意比例的
 * 照片都要能排出「不整齐但仍然像手账」的版面。因此每种版式都
 * 带有一点确定性的倾斜与错位，而不是整齐的网格。
 */

export type LayoutKind = 'hero' | 'collage' | 'grid' | 'diptych' | 'text-only' | 'map'

export interface LayoutPhoto {
  photoId: string
  width: number
  height: number
  caption?: string
}

export interface LayoutContext {
  photos: LayoutPhoto[]
  title: string
  caption: string
  date?: string
  locationName?: string
  /** 页面纸色 */
  paperColor: string
  paper: keyof typeof PAPERS
  /** 版式序号，用于让同一版式在不同页面产生不同的倾斜方向 */
  variant: number
}

const MARGIN = 56

/** 确定性伪随机：同一 variant 永远产生同样的倾斜 */
function jitter(seed: number, amplitude: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return ((x - Math.floor(x)) * 2 - 1) * amplitude
}

function textElement(
  preset: keyof typeof TEXT_PRESETS,
  content: string,
  x: number,
  y: number,
  width: number,
  overrides: { fontSize?: number; color?: string; align?: 'left' | 'center' | 'right' } = {},
): Page['elements'][number] {
  const token = TEXT_PRESETS[preset]
  const fontSize = overrides.fontSize ?? token.fontSize
  const lines = content.split('\n').length
  return {
    id: newElementId(),
    kind: 'text',
    x,
    y,
    width,
    height: Math.ceil(fontSize * token.lineHeight * lines + 8),
    rotation: 0,
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
      color: overrides.color ?? token.color,
      align: overrides.align ?? token.align,
    },
  }
}

function photoElement(
  entry: LayoutPhoto,
  opts: { x: number; y: number; width: number; height: number; style: keyof typeof PHOTO_STYLES; rotation: number; caption?: string },
): Page['elements'][number] {
  return {
    id: newElementId(),
    kind: 'photo',
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    rotation: opts.rotation,
    opacity: 1,
    locked: false,
    shadow: 0.55,
    data: {
      photoId: entry.photoId,
      style: opts.style,
      fit: 'cover',
      caption: opts.caption,
      focusX: 0.5,
      focusY: 0.5,
      filterStrength: 1,
    },
  }
}

function stickerElement(
  stickerId: string,
  x: number,
  y: number,
  rotation: number,
  scale = 1,
): Page['elements'][number] | null {
  const def = STICKER_LIBRARY.find((s) => s.id === stickerId)
  if (!def) return null
  return {
    id: newElementId(),
    kind: 'sticker',
    x,
    y,
    width: def.width * scale,
    height: def.height * scale,
    rotation,
    opacity: 0.92,
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

function dateElement(date: string | undefined, x: number, y: number, width: number): Page['elements'][number] | null {
  if (!date) return null
  return {
    id: newElementId(),
    kind: 'date',
    x,
    y,
    width,
    height: 32,
    rotation: 0,
    opacity: 1,
    locked: false,
    data: {
      date,
      format: 'dot',
      fontFamily: FONT_STACK.mono,
      fontSize: 15,
      color: '#8f8a80',
    },
  }
}

/** 保证照片在给定框内按 cover 裁切时不会严重变形 */
function fitBox(entry: LayoutPhoto, maxW: number, maxH: number, style: keyof typeof PHOTO_STYLES) {
  const natural = defaultPhotoSize(style, entry.width, entry.height, Math.max(maxW, maxH))
  const ratio = natural.width / natural.height
  let width = maxW
  let height = maxW / ratio
  if (height > maxH) {
    height = maxH
    width = maxH * ratio
  }
  return { width: Math.round(width), height: Math.round(height) }
}

/* ------------------------------------------------------------------ *
 * 各版式
 * ------------------------------------------------------------------ */

function layoutHero(ctx: LayoutContext): Page['elements'][number][] {
  const [first, ...rest] = ctx.photos
  if (!first) return []
  const elements: Page['elements'][number][] = []

  const box = fitBox(first, PAGE_WIDTH - MARGIN * 2, PAGE_HEIGHT * 0.52, 'plain')
  const x = Math.round((PAGE_WIDTH - box.width) / 2)
  const y = 72 + Math.abs(jitter(ctx.variant, 6))

  elements.push(photoElement(first, { x, y, ...box, style: 'plain', rotation: jitter(ctx.variant + 1, 1.1) }))
  elements.push(stickerElement('tape-washi-warm', x + box.width * 0.34, y - 20, jitter(ctx.variant + 2, 5), 0.92)!)
  elements.push(textElement('title', ctx.title, MARGIN - 4, y + box.height + 42, 460, { fontSize: 38 }))
  elements.push(textElement('body', ctx.caption, MARGIN, y + box.height + 104, 340))
  const d = dateElement(ctx.date, MARGIN, y + box.height + 4, 240)
  if (d) elements.push(d)

  // 余下照片在下方错落排布
  rest.slice(0, 2).forEach((entry, index) => {
    const style: keyof typeof PHOTO_STYLES = index === 0 ? 'polaroid' : 'plain'
    const b = fitBox(entry, 230, 210, style)
    const px = index === 0 ? 400 + index * 24 : 596
    const py = y + box.height + 40 + index * 26
    elements.push(
      photoElement(entry, { x: px, y: py, ...b, style, rotation: jitter(ctx.variant + 10 + index, 4) }),
    )
  })

  if (ctx.locationName) {
    elements.push(textElement('label', ctx.locationName, MARGIN, PAGE_HEIGHT - 92, 300))
  }
  return elements
}

function layoutCollage(ctx: LayoutContext): Page['elements'][number][] {
  const elements: Page['elements'][number][] = []
  const photos = ctx.photos.slice(0, 4)

  elements.push(textElement('title', ctx.title, MARGIN - 4, 66, 420, { fontSize: 34 }))
  const d = dateElement(ctx.date, PAGE_WIDTH - MARGIN - 180, 74, 180)
  if (d) elements.push(d)

  const slots = [
    { x: MARGIN, y: 148, w: 300, h: 240, style: 'plain' as const, rot: -2.2 },
    { x: 388, y: 176, w: 270, h: 300, style: 'plain' as const, rot: 1.6 },
    { x: MARGIN + 26, y: 424, w: 260, h: 200, style: 'polaroid' as const, rot: 2.6 },
    { x: 372, y: 508, w: 286, h: 210, style: 'plain' as const, rot: -1.8 },
  ]

  photos.forEach((entry, index) => {
    const slot = slots[index]
    if (!slot) return
    const box = fitBox(entry, slot.w, slot.h, slot.style)
    // 在槽位内居中，并加入确定性抖动，避免看起来像网格
    const x = Math.round(slot.x + (slot.w - box.width) / 2 + jitter(ctx.variant + index * 3, 10))
    const y = Math.round(slot.y + (slot.h - box.height) / 2 + jitter(ctx.variant + index * 5, 10))
    elements.push(
      photoElement(entry, {
        x,
        y,
        ...box,
        style: slot.style,
        rotation: slot.rot + jitter(ctx.variant + index, 0.8),
      }),
    )
  })

  elements.push(stickerElement('tape-masking', 60, 130, -16, 0.86)!)
  if (photos.length >= 3) elements.push(stickerElement('clip-paper', 356, 158, -10, 0.6)!)

  elements.push(textElement('body', ctx.caption, MARGIN, PAGE_HEIGHT - 150, 520))
  if (ctx.locationName) {
    elements.push(textElement('label', ctx.locationName, MARGIN, PAGE_HEIGHT - 84, 300))
  }
  return elements
}

function layoutGrid(ctx: LayoutContext): Page['elements'][number][] {
  const elements: Page['elements'][number][] = []
  const photos = ctx.photos.slice(0, 4)
  const cols = 2
  const cellW = (PAGE_WIDTH - MARGIN * 2 - 28) / cols
  const cellH = 250

  elements.push(textElement('title', ctx.title, MARGIN - 4, 62, 420, { fontSize: 34 }))

  photos.forEach((entry, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const style: keyof typeof PHOTO_STYLES = index % 3 === 1 ? 'polaroid' : 'plain'
    const box = fitBox(entry, cellW, cellH, style)
    const x = Math.round(MARGIN + col * (cellW + 28) + (cellW - box.width) / 2 + jitter(ctx.variant + index, 6))
    const y = Math.round(152 + row * (cellH + 34) + jitter(ctx.variant + index * 2, 6))
    elements.push(
      photoElement(entry, { x, y, ...box, style, rotation: jitter(ctx.variant + index * 7, 2.2) }),
    )
  })

  elements.push(textElement('caption', ctx.caption, MARGIN, PAGE_HEIGHT - 118, 560))
  if (ctx.locationName) {
    elements.push(textElement('label', ctx.locationName, MARGIN, PAGE_HEIGHT - 78, 300))
  }
  return elements
}

function layoutDiptych(ctx: LayoutContext): Page['elements'][number][] {
  const elements: Page['elements'][number][] = []
  const [a, b] = ctx.photos
  if (!a) return []

  elements.push(textElement('title', ctx.title, MARGIN - 4, 60, 420, { fontSize: 34 }))
  const d = dateElement(ctx.date, PAGE_WIDTH - MARGIN - 180, 68, 180)
  if (d) elements.push(d)

  const boxA = fitBox(a, PAGE_WIDTH - MARGIN * 2, 330, 'plain')
  elements.push(
    photoElement(a, {
      x: Math.round((PAGE_WIDTH - boxA.width) / 2 + jitter(ctx.variant, 8)),
      y: 132,
      ...boxA,
      style: 'plain',
      rotation: jitter(ctx.variant + 1, 1.2),
    }),
  )

  if (b) {
    const rotate = jitter(ctx.variant + 2, 3)
    const boxB = fitBox(b, 400, 260, 'polaroid')
    elements.push(
      photoElement(b, {
        x: 300 + Math.round(jitter(ctx.variant + 3, 14)),
        y: 486,
        ...boxB,
        style: 'polaroid',
        rotation: rotate,
        caption: ctx.locationName,
      }),
    )
  }

  elements.push(textElement('body', ctx.caption, MARGIN, 500, 220))
  elements.push(stickerElement('tape-washi-cool', 40, 114, -8, 0.86)!)
  elements.push(stickerElement('line-underline', MARGIN, PAGE_HEIGHT - 108, -2, 0.8)!)
  return elements
}

function layoutTextOnly(ctx: LayoutContext): Page['elements'][number][] {
  const elements: Page['elements'][number][] = []
  elements.push(textElement('label', ctx.date ?? 'NOTES', MARGIN, 62, 260))
  elements.push(textElement('title', ctx.title, MARGIN - 4, 86, 460, { fontSize: 34 }))
  elements.push(textElement('body', ctx.caption, MARGIN, 190, 520, { fontSize: 18 }))
  elements.push(stickerElement('symbol-quote', MARGIN - 8, 160, 0, 0.7)!)
  elements.push(stickerElement('line-scribble', MARGIN, PAGE_HEIGHT - 200, -2, 0.8)!)
  const d = dateElement(ctx.date, MARGIN, PAGE_HEIGHT - 110, 240)
  if (d) elements.push(d)
  return elements
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

export function buildPage(kind: LayoutKind, ctx: LayoutContext): Page {
  const elements =
    kind === 'hero'
      ? layoutHero(ctx)
      : kind === 'collage'
        ? layoutCollage(ctx)
        : kind === 'grid'
          ? layoutGrid(ctx)
          : kind === 'diptych'
            ? layoutDiptych(ctx)
            : layoutTextOnly(ctx)

  return {
    id: newElementId().replace('el_', 'pg_'),
    title: ctx.title,
    role: 'content',
    background: {
      color: ctx.paperColor,
      paper: ctx.paper,
      vignette: 0.24,
    },
    elements: elements.filter(Boolean) as Page['elements'],
    date: ctx.date,
  }
}

export function buildCoverPage(
  title: string,
  subtitle: string,
  coverPhoto: LayoutPhoto | undefined,
  opts: { startDate?: string; endDate?: string; locationName?: string; cover: string; foil: string },
): Page {
  const elements: Page['elements'][number][] = []
  const frame = {
    x: 52,
    y: 52,
    width: PAGE_WIDTH - 104,
    height: PAGE_HEIGHT - 104,
  }

  elements.push({
    id: newElementId(),
    kind: 'shape',
    ...frame,
    rotation: 0,
    opacity: 1,
    locked: false,
    shadow: 0,
    data: { shape: 'rect', fill: 'transparent', stroke: 'rgba(232,220,196,0.26)', strokeWidth: 1 },
  })

  if (coverPhoto) {
    const box = fitBox(coverPhoto, 440, 380, 'plain')
    elements.push(
      photoElement(coverPhoto, {
        x: Math.round((PAGE_WIDTH - box.width) / 2),
        y: 170,
        ...box,
        style: 'plain',
        rotation: 0,
      }),
    )
  }

  elements.push(textElement('label', 'TRAVEL ALBUM', 80, 84, 300, { color: 'rgba(232,220,196,0.7)' }))
  elements.push(textElement('title', title, 0, 588, PAGE_WIDTH, { fontSize: 60, color: opts.foil, align: 'center' }))
  elements.push(textElement('handen', subtitle, 0, 686, PAGE_WIDTH, { fontSize: 30, color: 'rgba(232,220,196,0.78)', align: 'center' }))

  const range = opts.startDate
    ? {
        id: newElementId(),
        kind: 'date' as const,
        x: 0,
        y: 756,
        width: PAGE_WIDTH,
        height: 32,
        rotation: 0,
        opacity: 1,
        locked: false,
        data: {
          date: opts.startDate,
          endDate: opts.endDate,
          format: 'dot' as const,
          fontFamily: FONT_STACK.mono,
          fontSize: 16,
          color: 'rgba(232,220,196,0.62)',
        },
      }
    : null
  if (range) elements.push(range)

  if (opts.locationName) {
    elements.push(
      textElement('caption', opts.locationName, 0, 792, PAGE_WIDTH, {
        color: 'rgba(232,220,196,0.5)',
        align: 'center',
      }),
    )
  }

  return {
    id: newElementId().replace('el_', 'pg_'),
    title: '封面',
    role: 'cover',
    background: { color: opts.cover, paper: 'plain', vignette: 0.5 },
    elements,
    date: opts.startDate,
  }
}

export function buildEndingPage(
  subtitle: string,
  opts: { locationName?: string; date?: string; cover: string; foil: string },
): Page {
  const elements: Page['elements'][number][] = [
    textElement('handen', 'The End', 0, 320, PAGE_WIDTH, {
      fontSize: 46,
      color: 'rgba(232,220,196,0.9)',
      align: 'center',
    }),
    textElement('quote', subtitle, 0, 396, PAGE_WIDTH, {
      fontSize: 22,
      color: 'rgba(232,220,196,0.72)',
      align: 'center',
    }),
  ]

  const d = dateElement(opts.date, 0, 486, PAGE_WIDTH)
  if (d) elements.push(d)

  if (opts.locationName) {
    elements.push(
      textElement('label', opts.locationName, 0, 620, PAGE_WIDTH, {
        color: 'rgba(232,220,196,0.44)',
        align: 'center',
      }),
    )
  }

  return {
    id: newElementId().replace('el_', 'pg_'),
    title: '结尾',
    role: 'ending',
    background: { color: opts.cover, paper: 'plain', vignette: 0.55 },
    elements,
  }
}
