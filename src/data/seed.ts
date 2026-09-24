import type { Album, Page, PhotoAsset } from '@/types/album'
import { newAlbumId } from '@/lib/id'
import { PAGE_HEIGHT, PAGE_WIDTH } from '@/lib/designTokens'
import {
  DEMO_PHOTOS,
  JIUZHAIGOU_LOCATION,
  JIUZHAIGOU_ROUTE,
  dateEl,
  demoNatural,
  mapEl,
  note,
  page,
  photo,
  shape,
  stamp,
  sticker,
  text,
} from './demoPhotos'

/** 纸张配色（页面用） */
const PAPER = {
  cream: '#f7f3ea',
  warm: '#f6f1e6',
  cool: '#f2f4f3',
  grid: '#f9f6ef',
  kraft: '#e6d3b3',
  dark: '#1f2b26',
} as const

const g = (id: string) => ({ natural: demoNatural(id) })

/**
 * 生成 demo 纪念册《九寨沟旅行记》。
 *
 * 每次调用都会产生新的 id，因此「重置 demo」可以安全地创建一份全新的册子。
 */
export function createDemoAlbum(): Album {
  const now = new Date().toISOString()
  const pages: Page[] = [
    /* ---------------------------------------------------------- 封面 */
    page(
      '封面',
      'cover',
      { color: PAPER.dark, paper: 'plain', vignette: 0.5 },
      [
        shape('rect', { x: 40, y: 40, width: PAGE_WIDTH - 80, height: PAGE_HEIGHT - 80, stroke: 'rgba(232,220,196,0.28)', strokeWidth: 1 }),
        shape('rect', { x: 48, y: 48, width: PAGE_WIDTH - 96, height: PAGE_HEIGHT - 96, stroke: 'rgba(232,220,196,0.14)', strokeWidth: 1 }),
        text('label', 'TRAVEL ALBUM · NO.01', { x: 80, y: 86, width: 300, color: 'rgba(232,220,196,0.72)' }),
        sticker('travel-compass', { x: 580, y: 74, scale: 0.8, rotation: 6, opacity: 0.5 }),

        photo('ph_lake_02', { x: 110, y: 168, width: 500, height: 400, style: 'plain', ...g('ph_lake_02') }),

        text('title', '九寨沟旅记', { x: 110, y: 596, width: 500, fontSize: 64, color: '#f2ead8', align: 'left' }),
        shape('line', { x: 112, y: 686, width: 180, height: 2, stroke: 'rgba(232,220,196,0.5)', strokeWidth: 2 }),
        text('handen', 'Into the valley of blue water', { x: 110, y: 700, width: 480, fontSize: 32, color: 'rgba(232,220,196,0.82)' }),

        dateEl('2026-08-12', { x: 110, y: 762, endDate: '2026-08-16', format: 'dot', fontSize: 17, color: 'rgba(232,220,196,0.7)' }),
        text('caption', '四川 · 阿坝 · 九寨沟 ｜ 12 个瞬间', { x: 110, y: 796, width: 460, color: 'rgba(232,220,196,0.55)' }),

        stamp('九寨沟', { x: 486, y: 742, subText: '2026.08', width: 132, rotation: -7, color: '#c9705a', distress: 0.42, opacity: 0.92 }),
      ],
    ),

    /* ------------------------------------------------------ 旅行开始 */
    page(
      '旅行开始',
      'content',
      { color: PAPER.cream, paper: 'plain', vignette: 0.25 },
      [
        sticker('tape-washi-warm', { x: 118, y: 34, rotation: -6, scale: 0.92, opacity: 0.9 }),
        photo('ph_road_01', { x: 108, y: 68, width: 504, height: 336, style: 'polaroid', rotation: -1.4, caption: '2026.08.12 · 出发', ...g('ph_road_01') }),

        text('label', 'CHAPTER 01', { x: 108, y: 462, width: 200, color: '#a09080' }),
        text('title', '旅行开始', { x: 104, y: 482, width: 320, fontSize: 40 }),
        shape('line', { x: 110, y: 546, width: 120, height: 2, stroke: '#c2603f', strokeWidth: 2.5 }),

        text('body', '早上六点就醒了。\n把行李塞进后备箱，\n出发的时候天还没完全亮。', { x: 108, y: 570, width: 320 }),
        text('hand', '有点困，但很期待。', { x: 108, y: 700, width: 300, rotation: -1 }),
        sticker('line-arrow-curve', { x: 396, y: 668, scale: 0.86, rotation: 12, opacity: 0.5 }),

        note('记得带：\n· 厚外套\n· 保温杯\n· 相机电池 ×2', {
          x: 452,
          y: 520,
          width: 176,
          height: 168,
          rotation: 3.2,
          variant: 'sticky',
        }),
        sticker('pin-round', { x: 516, y: 500, scale: 0.8, rotation: 18 }),
        sticker('travel-ticket', { x: 448, y: 712, scale: 0.86, rotation: -4, opacity: 0.95 }),
      ],
      { date: '2026-08-12', location: { name: '成都', region: '四川 · 成都', altitude: 500 } },
    ),

    /* ---------------------------------------------------------- 山路 */
    page(
      '山路',
      'content',
      { color: PAPER.grid, paper: 'grid', lineColor: 'rgba(120,140,150,0.16)', vignette: 0.2 },
      [
        text('label', 'CHAPTER 02 · ON THE ROAD', { x: 60, y: 62, width: 320, color: '#9aa4a8' }),
        text('title', '一山放出一山拦', { x: 56, y: 84, width: 460, fontSize: 38 }),

        photo('ph_road_02', { x: 56, y: 156, width: 400, height: 300, style: 'plain', rotation: -1.1, ...g('ph_road_02') }),
        photo('ph_peak_02', { x: 372, y: 236, width: 292, height: 220, style: 'polaroid', rotation: 2.6, caption: '松潘 · 2850m', ...g('ph_peak_02') }),

        sticker('tape-masking', { x: 44, y: 138, rotation: -18, scale: 0.9, opacity: 0.95 }),
        sticker('stamp-postage', { x: 596, y: 118, scale: 0.86, rotation: 6, opacity: 0.94 }),

        text('body', '从成都到九寨沟，四百多公里。\n车一直往上爬，海拔表慢慢跳。\n过了汶川，山就变得又高又近。', { x: 56, y: 486, width: 380 }),

        dateEl('2026-08-12', { x: 56, y: 604, format: 'long', fontSize: 16, color: '#8a9498' }),
        text('caption', '海拔 500m → 2850m ｜ 车程 8 小时', { x: 56, y: 636, width: 400 }),

        sticker('line-divider', { x: 56, y: 688, scale: 1, opacity: 0.7 }),

        note('路上买了一个\n烤红薯，特别甜。', { x: 452, y: 620, width: 190, height: 136, rotation: -2.8, variant: 'kraft' }),
        sticker('pin-map', { x: 640, y: 596, scale: 0.9, rotation: -4 }),
      ],
      { date: '2026-08-12', location: { name: '松潘', region: '四川 · 阿坝 · 松潘', altitude: 2850 } },
    ),

    /* -------------------------------------------------------- 九寨沟 */
    page(
      '九寨沟',
      'content',
      { color: PAPER.cream, paper: 'plain', vignette: 0.3 },
      [
        photo('ph_lake_04', { x: 40, y: 40, width: 640, height: 427, style: 'plain', ...g('ph_lake_04') }),
        sticker('tape-washi-cool', { x: 300, y: 26, rotation: 2, scale: 0.96, opacity: 0.92 }),

        text('title', '抵达九寨沟', { x: 48, y: 502, width: 360, fontSize: 42 }),
        text('handen', 'Finally here', { x: 400, y: 508, width: 220, fontSize: 30, color: '#a09484', align: 'right' }),

        text('body', '水是那种不真实的蓝。\n站在栈道上看了很久，\n才发现自己一直没说话。', { x: 48, y: 570, width: 300 }),

        photo('ph_lake_05', { x: 396, y: 552, width: 276, height: 276, style: 'instant', rotation: 2.2, ...g('ph_lake_05') }),
        sticker('clip-paper', { x: 372, y: 528, scale: 0.6, rotation: -12 }),
      ],
      { date: '2026-08-13', location: { name: '九寨沟', region: '四川 · 阿坝 · 九寨沟', altitude: 2000 } },
    ),

    /* ---------------------------------------------------------- 湖泊 */
    page(
      '湖泊',
      'content',
      { color: PAPER.cool, paper: 'plain', vignette: 0.22 },
      [
        text('label', 'CHAPTER 03 · WATER', { x: 60, y: 58, width: 280, color: '#8fa0a6' }),
        text('title', '只此青绿', { x: 56, y: 80, width: 300, fontSize: 40 }),

        photo('ph_lake_01', { x: 56, y: 150, width: 348, height: 232, style: 'plain', rotation: -1.8, ...g('ph_lake_01') }),
        photo('ph_lake_06', { x: 396, y: 190, width: 268, height: 302, style: 'plain', rotation: 1.6, ...g('ph_lake_06') }),
        photo('ph_lake_03', { x: 84, y: 400, width: 320, height: 214, style: 'polaroid', rotation: 2.4, caption: '长海 · 3060m', ...g('ph_lake_03') }),

        sticker('tape-washi-moss', { x: 370, y: 168, rotation: -8, scale: 0.82, opacity: 0.92 }),

        text('quote', '五花海的水，\n一天里有五种颜色。', { x: 424, y: 512, width: 250, align: 'left', fontSize: 19 }),
        sticker('symbol-quote', { x: 414, y: 492, scale: 0.7, opacity: 0.5 }),
        sticker('line-underline', { x: 424, y: 590, scale: 0.8, opacity: 0.7 }),

        text('caption', 'p1 晨雾 ｜ p2 箭竹海 ｜ p3 长海', { x: 84, y: 640, width: 340 }),
        sticker('travel-film', { x: 566, y: 636, scale: 0.72, opacity: 0.9 }),
      ],
      { date: '2026-08-13', location: { name: '五花海', region: '四川 · 九寨沟 · 五花海', altitude: 2472 } },
    ),

    /* ---------------------------------------------------- 珍珠滩瀑布 */
    page(
      '瀑布',
      'content',
      { color: PAPER.warm, paper: 'plain', vignette: 0.26 },
      [
        photo('ph_falls_01', { x: 52, y: 48, width: 616, height: 462, style: 'plain', ...g('ph_falls_01') }),
        sticker('tape-washi-warm', { x: 268, y: 34, rotation: -3, scale: 1, opacity: 0.9 }),

        text('title', '瀑布之下是我们', { x: 56, y: 538, width: 460, fontSize: 38 }),
        text('hand', '水声太大了，\n说话要用喊的。', { x: 420, y: 596, width: 250, rotation: -2, align: 'right' }),

        photo('ph_falls_02', { x: 56, y: 620, width: 300, height: 200, style: 'plain', rotation: -1.4, ...g('ph_falls_02') }),
        text('body', '站得太近，镜头全是水雾。\n擦了好几次才拍清楚。', { x: 386, y: 640, width: 290 }),

        sticker('clip-tape-corner', { x: 330, y: 594, scale: 0.72, rotation: 0 }),
        sticker('nature-wave', { x: 620, y: 500, scale: 0.66, opacity: 0.8 }),
      ],
      { date: '2026-08-13', location: { name: '珍珠滩瀑布', region: '四川 · 九寨沟 · 珍珠滩', altitude: 2433 } },
    ),

    /* ------------------------------------------------------ 朋友合影 */
    page(
      '朋友合影',
      'content',
      { color: PAPER.cream, paper: 'dot', lineColor: 'rgba(120,130,140,0.28)', vignette: 0.2 },
      [
        sticker('tape-washi-cool', { x: 40, y: 36, rotation: -7, scale: 0.86, opacity: 0.9 }),
        text('label', 'CHAPTER 04 · WITH YOU', { x: 200, y: 62, width: 260, color: '#9aa4a8' }),

        photo('ph_people_01', { x: 190, y: 106, width: 340, height: 340, style: 'polaroid', rotation: 0.8, caption: '树正群海 · 三个人', ...g('ph_people_01') }),

        photo('ph_people_02', { x: 48, y: 236, width: 190, height: 143, style: 'plain', rotation: -5.6, ...g('ph_people_02') }),
        photo('ph_people_05', { x: 508, y: 208, width: 172, height: 229, style: 'plain', rotation: 4.8, ...g('ph_people_05') }),

        sticker('pin-round-blue', { x: 340, y: 92, scale: 0.82, rotation: 14 }),
        sticker('pin-round', { x: 208, y: 96, scale: 0.72, rotation: -20 }),

        text('title', '我们仨', { x: 48, y: 512, width: 260, fontSize: 40 }),
        shape('line', { x: 54, y: 574, width: 100, height: 2, stroke: '#61729f', strokeWidth: 2.5 }),

        text('body', '约了三年，终于凑齐了时间。\n下次还要一起出来。', { x: 48, y: 598, width: 300 }),
        text('handen', 'good friends, good days', { x: 360, y: 616, width: 300, fontSize: 27, color: '#8a94a8', align: 'right' }),

        sticker('symbol-heart', { x: 618, y: 596, scale: 0.72, rotation: -8 }),
        sticker('line-scribble', { x: 456, y: 664, scale: 0.8, rotation: -3, opacity: 0.45 }),
      ],
      { date: '2026-08-15', location: { name: '树正群海', region: '四川 · 九寨沟 · 树正沟' } },
    ),

    /* ---------------------------------------------------------- 森林 */
    page(
      '森林',
      'content',
      { color: PAPER.warm, paper: 'noise', vignette: 0.34 },
      [
        photo('ph_forest_02', { x: 44, y: 44, width: 632, height: 421, style: 'plain', ...g('ph_forest_02') }),
        text('title', '林间有光', { x: 52, y: 492, width: 320, fontSize: 36, color: '#2f3a30' }),

        photo('ph_forest_01', { x: 60, y: 556, width: 196, height: 261, style: 'polaroid', rotation: -2.4, caption: '原始森林', ...g('ph_forest_01') }),
        photo('ph_forest_04', { x: 282, y: 556, width: 200, height: 200, style: 'torn', rotation: 3.2, ...g('ph_forest_04') }),
        photo('ph_forest_03', { x: 508, y: 572, width: 172, height: 129, style: 'plain', rotation: -1.2, ...g('ph_forest_03') }),

        text('hand', '苔藓是软的，\n踩上去没有声音。', { x: 504, y: 716, width: 200, rotation: -1.6 }),

        sticker('nature-fern', { x: 44, y: 508, scale: 0.6, opacity: 0.85 }),
        sticker('nature-leaf', { x: 456, y: 508, scale: 0.62, rotation: 24, opacity: 0.85 }),
        sticker('tape-masking', { x: 168, y: 536, rotation: 4, scale: 0.7, opacity: 0.9 }),
      ],
      { date: '2026-08-14', location: { name: '原始森林', region: '四川 · 九寨沟' } },
    ),

    /* ---------------------------------------------------------- 美食 */
    page(
      '美食',
      'content',
      { color: PAPER.kraft, paper: 'kraft', lineColor: 'rgba(120,90,50,0.14)', vignette: 0.3 },
      [
        text('label', 'CHAPTER 05 · TASTE', { x: 56, y: 58, width: 240, color: '#8a7250' }),
        text('title', '路上吃了什么', { x: 52, y: 80, width: 400, fontSize: 36, color: '#4a3c2a' }),

        photo('ph_food_01', { x: 56, y: 156, width: 268, height: 268, style: 'instant', rotation: -2.2, caption: '松潘 · 第一顿', ...g('ph_food_01') }),
        photo('ph_food_02', { x: 380, y: 200, width: 296, height: 222, style: 'plain', rotation: 2.8, ...g('ph_food_02') }),

        sticker('tape-stripe', { x: 356, y: 176, rotation: 84, scale: 0.76, opacity: 0.92 }),

        note('推荐指数\n★★★★☆\n\n酥油茶比想象中好喝。', {
          x: 380,
          y: 452,
          width: 190,
          height: 150,
          rotation: 2.4,
          variant: 'lined',
        }),

        text('body', '路边小馆子的牦牛肉汤锅，\n两个人吃到扶墙。', { x: 56, y: 480, width: 280, color: '#4a3c2a' }),

        sticker('travel-ticket', { x: 60, y: 600, scale: 1.02, rotation: -3, opacity: 0.96 }),
        sticker('line-arrow-straight', { x: 300, y: 700, scale: 0.8, rotation: -6, opacity: 0.42 }),
        text('handen', 'so good', { x: 300, y: 748, width: 180, fontSize: 28, color: '#8a7250' }),
      ],
      { date: '2026-08-12', location: { name: '松潘', region: '四川 · 阿坝 · 松潘' } },
    ),

    /* ------------------------------------------------------ 旅行路线 */
    page(
      '旅行路线',
      'content',
      { color: PAPER.cream, paper: 'plain', vignette: 0.22 },
      [
        text('label', 'THE ROUTE', { x: 56, y: 56, width: 200, color: '#a09484' }),
        text('title', '我们走过的路', { x: 52, y: 78, width: 400, fontSize: 36 }),

        mapEl('成都 → 九寨沟', JIUZHAIGOU_ROUTE, { x: 56, y: 148, width: 608, height: 452, rotation: -0.6 }),

        sticker('tape-washi-warm', { x: 268, y: 134, rotation: -4, scale: 0.9, opacity: 0.9 }),
        sticker('travel-compass', { x: 580, y: 164, scale: 0.7, rotation: 12, opacity: 0.7 }),

        text('body', '全程 438 公里，翻过两座垭口。\n中途在松潘停了两个小时。', { x: 56, y: 636, width: 400 }),
        dateEl('2026-08-12', { x: 56, y: 726, endDate: '2026-08-16', format: 'slash', fontSize: 16, color: '#8a9498' }),

        sticker('travel-tag', { x: 508, y: 620, scale: 0.88, rotation: 5, opacity: 0.95 }),
      ],
      { date: '2026-08-12', location: JIUZHAIGOU_LOCATION },
    ),

    /* ------------------------------------------------------ 旅行随笔 */
    page(
      '旅行随笔',
      'content',
      { color: PAPER.cream, paper: 'line', lineColor: 'rgba(120,140,160,0.22)', vignette: 0.24 },
      [
        text('label', 'NOTES · 2026.08.15', { x: 60, y: 58, width: 260, color: '#9aa4a8' }),
        text('title', '写在这一天结束', { x: 56, y: 80, width: 420, fontSize: 36 }),
        sticker('symbol-sparkle', { x: 452, y: 78, scale: 0.72, opacity: 0.7 }),

        text(
          'body',
          '本来以为只是一次普通的旅行。\n\n坐了很久的车，走了很多路，\n看了很多水。晚上回到住的地方，\n把照片一张张翻过去，\n才发现记录下来的比记得的多。\n\n也许这就是要做一本册子的原因。',
          { x: 56, y: 156, width: 400, fontSize: 18 },
        ),

        sticker('line-underline', { x: 56, y: 468, scale: 0.9, opacity: 0.6 }),

        photo('ph_night_01', { x: 448, y: 168, width: 228, height: 152, style: 'film', rotation: 1.4, ...g('ph_night_01') }),
        photo('ph_people_03', { x: 452, y: 356, width: 220, height: 165, style: 'polaroid', rotation: -2.6, caption: '傍晚', ...g('ph_people_03') }),

        sticker('clip-paper', { x: 428, y: 348, scale: 0.58, rotation: 8 }),
        sticker('tape-washi-moss', { x: 434, y: 150, rotation: 6, scale: 0.72, opacity: 0.88 }),

        note('明天就回去了。\n想再来一次。', { x: 460, y: 592, width: 200, height: 132, rotation: 3.6, variant: 'sticky' }),

        text('handen', 'to be continued', { x: 56, y: 620, width: 300, fontSize: 32, color: '#a09484' }),
        sticker('nature-sun', { x: 300, y: 604, scale: 0.62, opacity: 0.72 }),
        sticker('line-scribble', { x: 56, y: 692, scale: 0.86, rotation: -2, opacity: 0.4 }),
      ],
      { date: '2026-08-15', location: { name: '九寨沟', region: '四川 · 九寨沟' } },
    ),

    /* ---------------------------------------------------------- 结尾 */
    page(
      '结尾',
      'ending',
      { color: '#243040', paper: 'plain', vignette: 0.55 },
      [
        photo('ph_people_04', { x: 176, y: 128, width: 368, height: 368, style: 'instant', rotation: -1.2, ...g('ph_people_04') }),
        sticker('tape-washi-cool', { x: 300, y: 108, rotation: 3, scale: 0.94, opacity: 0.9 }),

        text('handen', 'The End', { x: 0, y: 528, width: PAGE_WIDTH, fontSize: 46, color: 'rgba(232,220,196,0.9)', align: 'center' }),

        text('quote', '把走过的路，都装订起来。', { x: 0, y: 606, width: PAGE_WIDTH, fontSize: 22, color: 'rgba(232,220,196,0.72)', align: 'center' }),

        shape('line', { x: 300, y: 668, width: 120, height: 2, stroke: 'rgba(232,220,196,0.32)', strokeWidth: 2 }),

        dateEl('2026-08-12', { x: 0, y: 700, endDate: '2026-08-16', format: 'cn', fontSize: 15, color: 'rgba(232,220,196,0.55)', width: PAGE_WIDTH }),

        stamp('时光册', { x: 296, y: 752, subText: 'SHIGUANGCE', width: 128, rotation: 6, color: '#c9705a', distress: 0.4, opacity: 0.9 }),

        text('label', '四川 · 九寨沟 ｜ 438 km ｜ 5 days', { x: 0, y: 848, width: PAGE_WIDTH, color: 'rgba(232,220,196,0.4)', align: 'center' }),
      ],
      { date: '2026-08-16', location: JIUZHAIGOU_LOCATION },
    ),
  ]

  return {
    id: newAlbumId(),
    title: '九寨沟旅行记',
    subtitle: '一段被山水记住的日子',
    theme: 'travel',
    coverPhotoId: 'ph_lake_02',
    startDate: '2026-08-12',
    endDate: '2026-08-16',
    location: JIUZHAIGOU_LOCATION,
    route: JIUZHAIGOU_ROUTE,
    pages,
    photoIds: DEMO_PHOTOS.map((p) => p.id),
    pageSize: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
    author: { name: '我' },
    share: { enabled: true, slug: 'jiuzhaigou-2026', updatedAt: now },
    createdAt: now,
    updatedAt: now,
  }
}

/** 把 demo 照片描述转成 PhotoAsset（source = demo，无需写入 IndexedDB） */
export function demoAssets(): PhotoAsset[] {
  return DEMO_PHOTOS.map((p) => ({
    id: p.id,
    url: p.url,
    source: 'demo' as const,
    name: p.name,
    width: p.width,
    height: p.height,
    takenAt: p.takenAt,
    location: p.location,
    createdAt: '2026-08-16T00:00:00.000Z',
  }))
}
