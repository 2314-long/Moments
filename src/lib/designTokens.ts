import type { AlbumTheme, ElementKind, GeoPoint, PaperKind, PhotoStyle, TextPreset } from '@/types/album'

/** 页面坐标系尺寸 —— 4:5 的竖版书页，接近真实手账本 */
export const PAGE_WIDTH = 720
export const PAGE_HEIGHT = 900
export const PAGE_ASPECT = PAGE_WIDTH / PAGE_HEIGHT
export const PAGE_GAP = 0 // 左右页之间的装订缝由书脊组件单独绘制

/** 元素最小尺寸 */
export const MIN_ELEMENT_SIZE = 28

/** 历史记录上限 */
export const HISTORY_LIMIT = 60

/* ------------------------------------------------------------------ *
 * 照片相框
 * ------------------------------------------------------------------ */

export interface PhotoStyleToken {
  id: PhotoStyle
  name: string
  /** 相框内边距占元素宽度的比例 */
  padRatio: number
  /** 拍立得类：底部留白倍数 */
  bottomRatio: number
  background: string
  radius: number
  shadow: string
  /** 图片自身的 CSS 滤镜 */
  filter: string
  hasCaption: boolean
  desc: string
}

export const PHOTO_STYLES: Record<PhotoStyle, PhotoStyleToken> = {
  plain: {
    id: 'plain',
    name: '普通',
    padRatio: 0.014,
    bottomRatio: 1,
    background: '#ffffff',
    radius: 2,
    shadow: '0 5px 14px -6px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.18)',
    filter: 'none',
    hasCaption: false,
    desc: '细白边，最克制',
  },
  polaroid: {
    id: 'polaroid',
    name: '拍立得',
    padRatio: 0.045,
    bottomRatio: 3.1,
    background: '#fbfaf7',
    radius: 1,
    shadow: '0 8px 20px -8px rgba(0,0,0,0.48), 0 2px 4px rgba(0,0,0,0.16)',
    filter: 'saturate(1.02)',
    hasCaption: true,
    desc: '下方留白可写日期',
  },
  film: {
    id: 'film',
    name: '胶片',
    padRatio: 0.028,
    bottomRatio: 1,
    background: '#171513',
    radius: 3,
    shadow: '0 6px 18px -8px rgba(0,0,0,0.55)',
    filter: 'contrast(1.06) saturate(0.95)',
    hasCaption: false,
    desc: '黑边齿孔，电影感',
  },
  instant: {
    id: 'instant',
    name: '宝丽来',
    padRatio: 0.07,
    bottomRatio: 4.2,
    background: '#fdfcf9',
    radius: 6,
    shadow: '0 12px 26px -10px rgba(0,0,0,0.5), 0 2px 5px rgba(0,0,0,0.14)',
    filter: 'sepia(0.12) saturate(1.05) contrast(1.02)',
    hasCaption: true,
    desc: '厚重白边，复古显影',
  },
  vintage: {
    id: 'vintage',
    name: '复古',
    padRatio: 0.02,
    bottomRatio: 1,
    background: '#efe7d8',
    radius: 2,
    shadow: '0 6px 16px -8px rgba(60,40,20,0.5)',
    filter: 'sepia(0.28) saturate(0.86) contrast(0.95) brightness(1.03)',
    hasCaption: false,
    desc: '褪色暖调，旧照片',
  },
  torn: {
    id: 'torn',
    name: '撕纸',
    padRatio: 0.03,
    bottomRatio: 1.6,
    background: '#faf6ee',
    radius: 0,
    shadow: '0 7px 16px -8px rgba(0,0,0,0.42)',
    filter: 'saturate(1.03)',
    hasCaption: true,
    desc: '不规则手撕纸边',
  },
}

export const PHOTO_STYLE_LIST = Object.values(PHOTO_STYLES)

/* ------------------------------------------------------------------ *
 * 字体与文字
 * ------------------------------------------------------------------ */

export const FONT_STACK = {
  sans: '"Inter", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif',
  serif: '"Noto Serif SC", "Songti SC", "SimSun", Georgia, serif',
  hand: '"Ma Shan Zheng", "LXGW WenKai", "Kaiti SC", "STKaiti", KaiTi, cursive',
  handen: '"Caveat", "Segoe Script", cursive',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const

export type FontKey = keyof typeof FONT_STACK

export const FONT_OPTIONS: Array<{ key: FontKey; name: string; sample: string }> = [
  { key: 'serif', name: '宋体 · 稳重', sample: '山川湖海' },
  { key: 'sans', name: '黑体 · 干净', sample: '山川湖海' },
  { key: 'hand', name: '手写 · 温柔', sample: '山川湖海' },
  { key: 'handen', name: '英文手写', sample: 'Travel Notes' },
  { key: 'mono', name: '等宽 · 标签', sample: '2026.08' },
]

export interface TextPresetToken {
  id: TextPreset
  name: string
  fontFamily: FontKey
  fontSize: number
  fontWeight: number
  lineHeight: number
  letterSpacing: number
  color: string
  align: 'left' | 'center' | 'right'
  italic?: boolean
  underline?: boolean
  /** 新建时的默认文案 */
  placeholder: string
}

export const TEXT_PRESETS: Record<TextPreset, TextPresetToken> = {
  title: {
    id: 'title',
    name: '标题',
    fontFamily: 'serif',
    fontSize: 44,
    fontWeight: 700,
    lineHeight: 1.3,
    letterSpacing: 2,
    color: '#2b2b2b',
    align: 'left',
    placeholder: '九寨沟旅记',
  },
  subtitle: {
    id: 'subtitle',
    name: '副标题',
    fontFamily: 'serif',
    fontSize: 26,
    fontWeight: 500,
    lineHeight: 1.4,
    letterSpacing: 1,
    color: '#4a4a4a',
    align: 'left',
    placeholder: '一段被山水记住的日子',
  },
  body: {
    id: 'body',
    name: '正文',
    fontFamily: 'sans',
    fontSize: 17,
    fontWeight: 400,
    lineHeight: 1.9,
    letterSpacing: 0.6,
    color: '#3c3c3c',
    align: 'left',
    placeholder: '写点什么，让这页有温度。',
  },
  caption: {
    id: 'caption',
    name: '注释',
    fontFamily: 'sans',
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.7,
    letterSpacing: 0.4,
    color: '#6b6b6b',
    align: 'left',
    placeholder: '图注 / 小字说明',
  },
  hand: {
    id: 'hand',
    name: '手写',
    fontFamily: 'hand',
    fontSize: 24,
    fontWeight: 400,
    lineHeight: 1.7,
    letterSpacing: 1.5,
    color: '#3a4a6b',
    align: 'left',
    placeholder: '那天下了一点小雨。',
  },
  handen: {
    id: 'handen',
    name: '英文手写',
    fontFamily: 'handen',
    fontSize: 30,
    fontWeight: 600,
    lineHeight: 1.5,
    letterSpacing: 0.5,
    color: '#5a5a5a',
    align: 'left',
    placeholder: 'In memory of the days',
  },
  label: {
    id: 'label',
    name: '标签',
    fontFamily: 'mono',
    fontSize: 11,
    fontWeight: 500,
    lineHeight: 1.5,
    letterSpacing: 1.6,
    color: '#8a8a8a',
    align: 'left',
    placeholder: 'SICHUAN · 2026',
  },
  quote: {
    id: 'quote',
    name: '引语',
    fontFamily: 'serif',
    fontSize: 20,
    fontWeight: 400,
    lineHeight: 2,
    letterSpacing: 1.2,
    color: '#55504a',
    align: 'center',
    italic: true,
    placeholder: '一山放出一山拦，只此青绿。',
  },
}

export const TEXT_PRESET_LIST = Object.values(TEXT_PRESETS)

/* ------------------------------------------------------------------ *
 * 纸张
 * ------------------------------------------------------------------ */

export interface PaperToken {
  id: PaperKind
  name: string
  color: string
  lineColor: string
  /** 生成 CSS background-image 的辅助函数参数 */
  gap: number
}

export const PAPERS: Record<PaperKind, PaperToken> = {
  plain: { id: 'plain', name: '素纸', color: '#f7f3ea', lineColor: 'transparent', gap: 0 },
  grid: { id: 'grid', name: '方格', color: '#f9f6ef', lineColor: 'rgba(120,130,140,0.18)', gap: 24 },
  dot: { id: 'dot', name: '点阵', color: '#f9f6ef', lineColor: 'rgba(120,130,140,0.32)', gap: 22 },
  line: { id: 'line', name: '横线', color: '#faf7f0', lineColor: 'rgba(120,140,160,0.22)', gap: 30 },
  kraft: { id: 'kraft', name: '牛皮', color: '#e6d3b3', lineColor: 'rgba(120,90,50,0.16)', gap: 26 },
  noise: { id: 'noise', name: '手账', color: '#f6f1e6', lineColor: 'rgba(120,130,140,0.12)', gap: 20 },
  ivory: { id: 'ivory', name: '米白', color: '#f2ead9', lineColor: 'transparent', gap: 0 },
  letter: { id: 'letter', name: '信纸', color: '#fffaf0', lineColor: 'rgba(104,143,184,0.22)', gap: 30 },
  travel: { id: 'travel', name: '旅行记录', color: '#f4ecd9', lineColor: 'rgba(155,116,73,0.17)', gap: 28 },
  film: { id: 'film', name: '胶片', color: '#252320', lineColor: 'rgba(243,224,180,0.16)', gap: 22 },
  vintage: { id: 'vintage', name: '复古', color: '#e8d5ae', lineColor: 'rgba(116,76,41,0.16)', gap: 24 },
  minimal: { id: 'minimal', name: '简约', color: '#f6f6f2', lineColor: 'rgba(55,55,55,0.08)', gap: 0 },
}

export const PAPER_LIST = Object.values(PAPERS)

/* ------------------------------------------------------------------ *
 * 主题
 * ------------------------------------------------------------------ */

export interface ThemeToken {
  id: AlbumTheme
  name: string
  /** 封面主色 */
  cover: string
  coverAccent: string
  /** 封面上的烫金 / 文字色 */
  foil: string
  paper: PaperKind
  /** 主题对应的默认装饰倾向 */
  mood: string
}

export const THEMES: Record<AlbumTheme, ThemeToken> = {
  travel: { id: 'travel', name: '旅行', cover: '#3d5a6c', coverAccent: '#6d8fa3', foil: '#e8dcc4', paper: 'plain', mood: '地图 / 车票 / 邮戳' },
  graduation: { id: 'graduation', name: '毕业', cover: '#2f4858', coverAccent: '#5b7a8c', foil: '#f0e6cf', paper: 'grid', mood: '学士帽 / 纸条 / 手写祝福' },
  love: { id: 'love', name: '恋爱', cover: '#8c5a5a', coverAccent: '#b98383', foil: '#f6e7dd', paper: 'dot', mood: '爱心 / 花 / 双人合影' },
  birthday: { id: 'birthday', name: '生日', cover: '#8a6a3d', coverAccent: '#b98f5e', foil: '#faf1dd', paper: 'noise', mood: '蜡烛 / 彩带 / 票根' },
  family: { id: 'family', name: '家庭', cover: '#4a5d4e', coverAccent: '#75907a', foil: '#eef0e6', paper: 'line', mood: '全家福 / 便签 / 日期' },
  friends: { id: 'friends', name: '朋友', cover: '#4b4f7a', coverAccent: '#767bb0', foil: '#e9e6f7', paper: 'grid', mood: '拍立得 / 掌印 / 涂鸦' },
  daily: { id: 'daily', name: '日常', cover: '#6b6357', coverAccent: '#948a7b', foil: '#f4efe6', paper: 'kraft', mood: '便签 / 胶带 / 小物' },
  minimal: { id: 'minimal', name: '极简', cover: '#3a3d42', coverAccent: '#6a6f76', foil: '#f2f2f0', paper: 'plain', mood: '大量留白 / 单图 / 细线' },
  vintage: { id: 'vintage', name: '复古', cover: '#5c4a3a', coverAccent: '#8a7055', foil: '#efe0c8', paper: 'kraft', mood: '胶片 / 旧戳 / 泛黄' },
}

export const THEME_LIST = Object.values(THEMES)

/* ------------------------------------------------------------------ *
 * 页面配色（背景预设）
 * ------------------------------------------------------------------ */

export const BACKGROUND_PRESETS: Array<{ name: string; color: string; paper: PaperKind }> = [
  { name: '奶油纸', color: '#f7f3ea', paper: 'plain' },
  { name: '冷白纸', color: '#f2f4f3', paper: 'plain' },
  { name: '米黄手账', color: '#f6f1e6', paper: 'noise' },
  { name: '方格本', color: '#f9f6ef', paper: 'grid' },
  { name: '点阵本', color: '#f9f6ef', paper: 'dot' },
  { name: '横线本', color: '#faf7f0', paper: 'line' },
  { name: '牛皮纸', color: '#e6d3b3', paper: 'kraft' },
  { name: '墨蓝', color: '#243040', paper: 'plain' },
  { name: '深林', color: '#1f2b26', paper: 'plain' },
  { name: '雾紫', color: '#2b2733', paper: 'dot' },
]

/* ------------------------------------------------------------------ *
 * 元素面板分类
 * ------------------------------------------------------------------ */

export interface InsertToolToken {
  kind: ElementKind
  name: string
  desc: string
}

export const INSERT_TOOLS: InsertToolToken[] = [
  { kind: 'photo', name: '照片', desc: '从素材库拖入' },
  { kind: 'text', name: '文字', desc: '标题 / 正文 / 手写' },
  { kind: 'note', name: '便签', desc: '随手记下的小事' },
  { kind: 'sticker', name: '贴纸', desc: '胶带 / 邮票 / 图钉' },
  { kind: 'stamp', name: '印章', desc: '邮戳 / 纪念章' },
  { kind: 'date', name: '日期', desc: '行程时间线' },
  { kind: 'map', name: '地图', desc: '手绘旅行路线' },
  { kind: 'shape', name: '形状', desc: '线条 / 色块' },
]

/** 常用地名（mock 地点库，未来可由 GPS 反查替换） */
export const KNOWN_PLACES: GeoPoint[] = [
  { name: '成都', region: '四川 · 成都', lat: 30.5728, lng: 104.0668, altitude: 500 },
  { name: '汶川', region: '四川 · 阿坝 · 汶川', lat: 31.4769, lng: 103.5901, altitude: 1326 },
  { name: '松潘', region: '四川 · 阿坝 · 松潘', lat: 32.6553, lng: 103.5986, altitude: 2850 },
  { name: '九寨沟', region: '四川 · 阿坝 · 九寨沟', lat: 33.2601, lng: 103.9178, altitude: 2000 },
  { name: '五花海', region: '四川 · 九寨沟 · 五花海', lat: 33.1516, lng: 103.9033, altitude: 2472 },
  { name: '长海', region: '四川 · 九寨沟 · 长海', lat: 33.1806, lng: 103.8936, altitude: 3060 },
  { name: '珍珠滩瀑布', region: '四川 · 九寨沟 · 珍珠滩', lat: 33.1577, lng: 103.9173, altitude: 2433 },
  { name: '树正群海', region: '四川 · 九寨沟 · 树正沟', lat: 33.2025, lng: 103.9115, altitude: 2187 },
  { name: '黄龙', region: '四川 · 阿坝 · 黄龙', lat: 32.7506, lng: 103.8231, altitude: 3550 },
  { name: '箭竹海', region: '四川 · 九寨沟 · 箭竹海', lat: 33.1290, lng: 103.8894, altitude: 2618 },
]
