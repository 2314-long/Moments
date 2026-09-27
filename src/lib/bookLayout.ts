import type { Page } from '@/types/album'

export type PageSpread = [number | null, number | null]

/** 首张纸右侧单独展开，其余纸张按「上一张背面 + 当前张正面」排列。 */
export function buildDuplexSpreads(pages: Page[]): PageSpread[] {
  if (!pages.length) return [[null, null]]

  const sheets = new Map<string, { front: number | null; back: number | null }>()
  pages.forEach((page, index) => {
    const sheetId = page.sheetId ?? `legacy_${index}`
    const sheet = sheets.get(sheetId) ?? { front: null, back: null }
    sheet[page.sheetSide ?? 'front'] = index
    sheets.set(sheetId, sheet)
  })

  const ordered = [...sheets.values()]
  const spreads: PageSpread[] = [[null, ordered[0].front]]
  for (let index = 1; index < ordered.length; index += 1) {
    spreads.push([ordered[index - 1].back, ordered[index].front])
  }
  const lastBack = ordered.at(-1)?.back ?? null
  if (lastBack !== null) spreads.push([lastBack, null])
  return spreads
}

export function pagesForSheet(pages: Page[], pageId: string): Page[] {
  const page = pages.find((item) => item.id === pageId)
  if (!page) return []
  return page.sheetId ? pages.filter((item) => item.sheetId === page.sheetId) : [page]
}

export function pageIndexAfterSheet(pages: Page[], pageId: string): number {
  const index = pages.findIndex((page) => page.id === pageId)
  if (index === -1) return pages.length
  const sheetId = pages[index].sheetId
  if (!sheetId) return index + 1
  let lastIndex = index
  for (let cursor = index + 1; cursor < pages.length; cursor += 1) {
    if (pages[cursor].sheetId === sheetId) lastIndex = cursor
  }
  return lastIndex + 1
}
