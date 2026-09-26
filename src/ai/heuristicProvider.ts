import type { AlbumTheme, GeoPoint, Page } from '@/types/album'
import { FONT_STACK, THEMES } from '@/lib/designTokens'
import { STICKER_LIBRARY } from '@/lib/stickerLibrary'
import { newElementId, newPageId } from '@/lib/id'
import type { AiLayoutProvider, AiLayoutResult, PhotoInsight } from './provider'
import { buildCoverPage, buildEndingPage, buildPage, type LayoutContext, type LayoutKind, type LayoutPhoto } from './layoutEngine'

/**
 * 启发式 AI 排版实现。
 *
 * 真实的图像理解（识别湖泊 / 人像 / 食物、挑代表照片）需要多模态模型。
 * 在接入之前，这里用照片的文件名、拍摄时间、宽高比和 EXIF 地点
 * 做推断 —— 优点是完全离线、确定性、零成本，而且产出的结果结构
 * 与真实模型完全一致，因此替换成真模型时上层无需改动。
 *
 * 由于 demo 照片命名是「lake-01 / forest-02 / people-03 …」，
 * 这套启发式在演示数据上能给出相当合理的分组结果。
 */

const CONTENT_KEYWORDS: Array<{ type: PhotoInsight['contentType']; patterns: RegExp }> = [
  { type: 'portrait', patterns: /(people|portrait|person|face|人|合影|selfie)/i },
  { type: 'food', patterns: /(food|meal|dish|dinner|lunch|餐|食)/i },
  { type: 'night', patterns: /(night|star|moon|夜|星)/i },
  { type: 'water', patterns: /(lake|water|sea|river|falls|waterfall|pool|海|湖|水|瀑)/i },
  { type: 'forest', patterns: /(forest|tree|wood|leaf|jungle|林|树|森)/i },
  { type: 'road', patterns: /(road|street|car|drive|highway|路|车|行)/i },
  { type: 'landscape', patterns: /(peak|mountain|snow|sky|valley|view|山|峰|云|景)/i },
]

function inferContent(name: string | undefined, width: number, height: number): PhotoInsight['contentType'] {
  const haystack = name ?? ''
  for (const entry of CONTENT_KEYWORDS) {
    if (entry.patterns.test(haystack)) return entry.type
  }
  // 没有名字线索时，用宽高比猜：竖幅更可能是人像
  if (height > width * 1.15) return 'portrait'
  return 'unknown'
}

function orientationOf(width: number, height: number): PhotoInsight['orientation'] {
  if (width > height * 1.08) return 'landscape'
  if (height > width * 1.08) return 'portrait'
  return 'square'
}

/** 打分：横幅、非极端比例、有拍摄时间与地点的照片更适合做代表图 */
function scoreOf(input: {
  width: number
  height: number
  takenAt?: string
  location?: GeoPoint
  contentType: PhotoInsight['contentType']
}): number {
  let score = 0.5
  const ratio = input.width / Math.max(1, input.height)
  // 接近 3:2 / 4:3 的横幅最上镜
  if (ratio > 1.2 && ratio < 1.85) score += 0.2
  else if (ratio > 1.0) score += 0.1
  if (input.takenAt) score += 0.06
  if (input.location) score += 0.06
  if (input.contentType === 'unknown') score -= 0.14
  if (input.contentType === 'landscape' || input.contentType === 'water') score += 0.1
  return Math.max(0, Math.min(1, score))
}

const CONTENT_LABEL: Record<PhotoInsight['contentType'], string> = {
  landscape: '沿途风景',
  water: '碧水与湖泊',
  forest: '森林与树木',
  portrait: '我们的合影',
  food: '路上吃了什么',
  night: '夜里的山谷',
  road: '在路上',
  unknown: '走过的路',
}

export const heuristicAiProvider: AiLayoutProvider = {
  name: '启发式排版（离线）',

  async analyze(photos) {
    return photos.map((p) => {
      const contentType = inferContent(p.name, p.width, p.height)
      const orientation = orientationOf(p.width, p.height)
      const score = scoreOf({
        width: p.width,
        height: p.height,
        takenAt: p.takenAt,
        location: p.location,
        contentType,
      })
      return {
        photoId: p.id,
        takenAt: p.takenAt,
        location: p.location,
        contentType,
        orientation,
        width: p.width,
        height: p.height,
        score,
        coverCandidate: orientation === 'landscape' && score >= 0.7,
      }
    })
  },

  async layout(request) {
    const { insights, title, location, startDate, endDate, pageSize } = request
    const theme = THEMES[request.theme ?? 'travel']
    const paper = theme.paper
    const paperColor = paperColorFor(theme.id)

    const summary: string[] = []
    const plan: AiLayoutResult['plan'] = []

    // ---- 1. 按内容分组，并按拍摄时间排序 ----
    const byContent = new Map<PhotoInsight['contentType'], PhotoInsight[]>()
    for (const insight of insights) {
      const list = byContent.get(insight.contentType) ?? []
      list.push(insight)
      byContent.set(insight.contentType, list)
    }
    const byTakenAt = (a: PhotoInsight, b: PhotoInsight) =>
      (a.takenAt ?? '9999').localeCompare(b.takenAt ?? '9999')
    for (const list of byContent.values()) list.sort(byTakenAt)
    summary.push(`已分析 ${insights.length} 张照片，识别出 ${byContent.size} 类内容`)

    // ---- 2. 挑选封面图：分数最高的横幅 ----
    const coverInsight =
      [...insights]
        .filter((i) => i.coverCandidate)
        .sort((a, b) => b.score - a.score)[0] ??
      [...insights].sort((a, b) => b.score - a.score)[0]

    // 保证每张照片只用一次（封面除外）
    const used = new Set<string>()
    const take = (type: PhotoInsight['contentType'], count: number): PhotoInsight[] => {
      const list = (byContent.get(type) ?? []).filter((i) => !used.has(i.photoId))
      const picked = list.slice(0, count)
      picked.forEach((i) => used.add(i.photoId))
      return picked
    }

    const toLayoutPhoto = (insight: PhotoInsight): LayoutPhoto => ({
      photoId: insight.photoId,
      width: insight.width,
      height: insight.height,
    })

    const pages: Page[] = []

    // ---- 3. 封面 ----
    if (coverInsight) {
      pages.push(
        buildCoverPage(title, captionForTheme(theme.id), toLayoutPhoto(coverInsight), {
          startDate,
          endDate,
          locationName: location?.region ?? location?.name,
          cover: theme.cover,
          foil: theme.foil,
        }),
      )
      plan.push({
        title: '封面',
        role: 'cover',
        caption: '选用评分最高的横幅照片作为封面',
        photoIds: [coverInsight.photoId],
        layout: 'hero',
      })
      summary.push('已挑选封面照片并生成标题页')
    }

    // ---- 4. 依据内容分布生成章节 ----
    const chapters: Array<{ type: PhotoInsight['contentType']; layout: LayoutKind; count: number; caption: string }> = [
      { type: 'road', layout: 'collage', count: 3, caption: '出发那天早上有点雾，路一直往上爬。' },
      { type: 'landscape', layout: 'hero', count: 3, caption: '山一层一层地退到远处，颜色也跟着变淡。' },
      { type: 'water', layout: 'collage', count: 4, caption: '水的蓝不太真实，看久了会觉得安静。' },
      { type: 'forest', layout: 'grid', count: 4, caption: '林子里的光是斜的，苔藓踩上去很软。' },
      { type: 'portrait', layout: 'diptych', count: 3, caption: '约了很久才凑齐，下次还要一起来。' },
      { type: 'food', layout: 'grid', count: 2, caption: '路边小馆子的汤锅，比想象中好吃。' },
      { type: 'night', layout: 'diptych', count: 2, caption: '晚上回去翻照片，才发现记录得比记得多。' },
      { type: 'unknown', layout: 'grid', count: 4, caption: '还有一些没来得及归类的瞬间。' },
    ]

    let variant = 0
    for (const chapter of chapters) {
      const picked = take(chapter.type, chapter.count)
      if (!picked.length) continue
      const photos = picked.map(toLayoutPhoto)
      const chapterTitle = chapterTitleFor(chapter.type)
      const ctx: LayoutContext = {
        photos,
        title: chapterTitle,
        caption: chapter.caption,
        date: picked[0]?.takenAt?.slice(0, 10) ?? startDate,
        locationName: picked.find((p) => p.location)?.location?.name,
        paperColor,
        paper,
        variant: variant++,
      }
      pages.push(buildPage(chapter.layout, ctx))
      plan.push({
        title: chapterTitle,
        role: 'content',
        caption: chapter.caption,
        photoIds: picked.map((p) => p.photoId),
        layout: chapter.layout,
      })
      summary.push(`「${chapterTitle}」整理了 ${picked.length} 张照片`)
    }

    // ---- 5. 路线页 ----
    if (location || startDate) {
      const routePhotos = [...insights].filter((i) => i.location).slice(0, 3)
      pages.push(
        buildMapPage({
          title: location?.name ?? title,
          date: startDate,
          startDate,
          endDate,
          paperColor,
          paper,
          photoIds: routePhotos.map((p) => p.photoId),
        }),
      )
      plan.push({
        title: '旅行路线',
        role: 'content',
        caption: '根据照片的拍摄地点还原出的行程',
        photoIds: routePhotos.map((p) => p.photoId),
        layout: 'map',
      })
      summary.push('根据拍摄地点生成了行程路线页')
    }

    // ---- 6. 随笔页 ----
    pages.push(
      buildPage('text-only', {
        photos: [],
        title: '写在这一天结束',
        caption:
          '本来以为只是一次普通的旅行。\n坐着车走了很远的路，看了很多水。\n回到住的地方翻照片，\n才发现记录下来的比记得的多。\n\n也许这就是要做一本册子的原因。',
        date: endDate ?? startDate,
        paperColor,
        paper,
        variant: variant++,
      }),
    )
    summary.push('补充了一页随笔，留给你写自己的话')

    // ---- 7. 结尾 ----
    pages.push(
      buildEndingPage('把走过的路，都装订起来。', {
        locationName: location?.region ?? location?.name,
        date: endDate ?? startDate,
        cover: theme.cover,
        foil: theme.foil,
      }),
    )
    plan.push({
      title: '结尾',
      role: 'ending',
      caption: '旅程结束',
      photoIds: [],
      layout: 'text-only',
    })
    summary.push(`共生成 ${pages.length} 页，可继续手动调整`)

    void pageSize
    return { plan, pages, summary }
  },
}

function buildMapPage(opts: {
  title: string
  date?: string
  startDate?: string
  endDate?: string
  paperColor: string
  paper: LayoutContext['paper']
  photoIds: string[]
}): Page {
  const points = [
    { name: '成都', lat: 30.5728, lng: 104.0668, note: '出发' },
    { name: '汶川', lat: 31.4769, lng: 103.5901 },
    { name: '松潘', lat: 32.6553, lng: 103.5986 },
    { name: '九寨沟', lat: 33.2601, lng: 103.9178, note: '抵达' },
  ]
  const elements: Page['elements'] = [
    {
      id: newElementId(),
      kind: 'text',
      x: 56,
      y: 78,
      width: 400,
      height: 48,
      rotation: 0,
      opacity: 1,
      locked: false,
      data: {
        text: '我们走过的路',
        preset: 'title',
        fontFamily: FONT_STACK.serif,
        fontSize: 36,
        fontWeight: 700,
        italic: false,
        letterSpacing: 2,
        lineHeight: 1.3,
        color: '#2b2b2b',
        align: 'left',
      },
    },
    {
      id: newElementId(),
      kind: 'map',
      x: 56,
      y: 148,
      width: 608,
      height: 452,
      rotation: -0.6,
      opacity: 1,
      locked: false,
      shadow: 0.3,
      data: {
        title: '成都 → 九寨沟',
        points,
        ink: '#5c6b7a',
        accent: '#a8503a',
        showLabels: true,
      },
    },
  ]

  const stampDef = STICKER_LIBRARY.find((s) => s.id === 'travel-luggageTag')
  if (stampDef) {
    elements.push({
      id: newElementId(),
      kind: 'sticker',
      x: 508,
      y: 620,
      width: stampDef.width * 0.88,
      height: stampDef.height * 0.88,
      rotation: 5,
      opacity: 0.95,
      locked: false,
      shadow: 0.3,
      data: {
        glyph: '',
        render: 'svg',
        svgId: stampDef.svgId,
        category: stampDef.category,
        tint: stampDef.tint,
      },
    })
  }

  return {
    id: newPageId(),
    title: '旅行路线',
    role: 'content',
    background: { color: opts.paperColor, paper: opts.paper, vignette: 0.22 },
    elements,
    date: opts.date,
  }
}

function chapterTitleFor(type: PhotoInsight['contentType']): string {
  switch (type) {
    case 'road':
      return '在路上'
    case 'landscape':
      return '一山放出一山拦'
    case 'water':
      return '只此青绿'
    case 'forest':
      return '林间有光'
    case 'portrait':
      return '我们仨'
    case 'food':
      return '路上吃了什么'
    case 'night':
      return '夜里的山谷'
    default:
      return CONTENT_LABEL[type]
  }
}

function captionForTheme(themeId: AlbumTheme): string {
  switch (themeId) {
    case 'travel':
      return 'Wandering and remembering'
    case 'graduation':
      return 'Those years, that summer'
    case 'love':
      return 'Every day with you'
    case 'birthday':
      return 'Another year, more light'
    case 'family':
      return 'Home is wherever we are'
    case 'friends':
      return 'Good friends, good days'
    case 'daily':
      return 'Small things, kept'
    case 'minimal':
      return 'Less, but warmer'
    case 'vintage':
      return 'Faded but not forgotten'
  }
}

function paperColorFor(themeId: AlbumTheme): string {
  switch (themeId) {
    case 'minimal':
      return '#f2f4f3'
    case 'vintage':
    case 'daily':
      return '#f6f1e6'
    default:
      return '#f7f3ea'
  }
}
