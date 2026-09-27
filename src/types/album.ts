/**
 * 时光册 — 核心数据模型
 *
 * 设计原则：
 * 1. 所有几何值都存储在「页面坐标系」(page space) 中，与屏幕缩放无关，
 *    因此同一份数据可以在任何分辨率 / DPI 下渲染。
 * 2. Element 是统一的基类，具体内容放在可辨识联合 ElementData 中，
 *    新增元素类型不需要改动编辑器核心逻辑。
 * 3. 所有实体都带有 id，页面顺序由数组顺序隐式决定，避免 order 字段不同步。
 */

export type ID = string

/* ------------------------------------------------------------------ *
 * 基础枚举
 * ------------------------------------------------------------------ */

/** 元素类型 */
export type ElementKind =
  | 'photo'
  | 'text'
  | 'art-text'
  | 'sticker'
  | 'note'
  | 'stamp'
  | 'date'
  | 'map'
  | 'shape'

/** 照片呈现风格 —— 决定边框 / 内边距 / 阴影 / 滤镜 */
export type PhotoStyle =
  | 'plain' // 普通照片：细白边
  | 'polaroid' // 拍立得：下方留白可写标题
  | 'film' // 胶片：黑边 + 齿孔
  | 'instant' // 宝丽来：更厚的白边
  | 'vintage' // 复古：暖调 + 老照片褪色
  | 'torn' // 撕纸：不规则纸边

/** 文字用途预设 */
export type TextPreset =
  | 'title' // 大标题
  | 'subtitle' // 副标题
  | 'body' // 正文
  | 'caption' // 注释 / 图说
  | 'hand' // 手写
  | 'handen' // 英文手写
  | 'label' // 小标签
  | 'quote' // 引语

export type TextAlign = 'left' | 'center' | 'right'

/** 纪念册主题（影响默认配色 / 纸张 / 装饰倾向） */
export type AlbumTheme =
  | 'travel'
  | 'graduation'
  | 'love'
  | 'birthday'
  | 'family'
  | 'friends'
  | 'daily'
  | 'minimal'
  | 'vintage'

/** 纸张材质 */
export type PaperKind =
  | 'plain' // 纯纸
  | 'grid' // 方格
  | 'dot' // 点阵
  | 'line' // 横线
  | 'kraft' // 牛皮纸
  | 'noise' // 噪点手账纸
  | 'ivory' // 米白纸
  | 'letter' // 信纸
  | 'travel' // 旅行记录纸
  | 'film' // 胶片风格
  | 'vintage' // 复古纸
  | 'minimal' // 简约纸

/* ------------------------------------------------------------------ *
 * 照片
 * ------------------------------------------------------------------ */

/** 照片的来源 / 存储后端 */
export type AssetSource = 'demo' | 'local' | 'remote'

/**
 * 一张照片的「引用」。
 * 真正的二进制数据不存在这里 —— 这里只保存指向 blobUrl / remoteUrl 的指针，
 * 这样纪念册 JSON 可以很小、可以方便地序列化与后续迁移到 S3。
 */
export interface PhotoAsset {
  id: ID
  /** 展示用地址（本地为 objectURL / demo 为静态路径 / 远程为 CDN 地址） */
  url: string
  /** 持久化用的稳定键：IndexedDB key 或 S3 object key */
  storageKey?: string
  /** 数据来源 */
  source: AssetSource
  /** 原始文件名 */
  name?: string
  width: number
  height: number
  /** 字节大小 */
  size?: number
  mimeType?: string
  /** 拍摄时间（EXIF 或文件时间），ISO 字符串 */
  takenAt?: string
  /** GPS 提取出的地点（mock / EXIF） */
  location?: GeoPoint
  createdAt: string
}

export interface GeoPoint {
  name: string
  /** 更细的地点描述，例如「四川 · 九寨沟 · 五花海」 */
  region?: string
  lat?: number
  lng?: number
  altitude?: number
}

/* ------------------------------------------------------------------ *
 * 元素
 * ------------------------------------------------------------------ */

/** 所有元素共享的几何 + 通用属性 */
export interface ElementBase {
  id: ID
  kind: ElementKind
  /** 页面坐标系中的左上角 X */
  x: number
  /** 页面坐标系中的左上角 Y */
  y: number
  width: number
  height: number
  /** 旋转角度（度） */
  rotation: number
  /** 不透明度 0..1 */
  opacity: number
  locked: boolean
  /** 4 角圆角 */
  radius?: number
  /** 元素自身投影强度 0..1，0 为关闭 */
  shadow?: number
}

/** 照片元素 */
export interface PhotoElement extends ElementBase {
  kind: 'photo'
  data: {
    photoId: ID
    style: PhotoStyle
    /** 在相框内是否裁切铺满 */
    fit: 'cover' | 'contain'
    /** 焦点偏移（0..1），用于 cover 时的取景 */
    focusX?: number
    focusY?: number
    caption?: string
    /** 边框宽度（照片白边） */
    frameWidth?: number
    /** 复古滤镜强度 0..1 */
    filterStrength?: number
    /** 圆角是否作用于图片本身而非相框 */
    grayscale?: boolean
    sepia?: boolean
  }
}

/** 文字元素 */
export interface TextElement extends ElementBase {
  kind: 'text'
  data: {
    text: string
    preset: TextPreset
    fontFamily: string
    fontSize: number
    fontWeight: number
    italic: boolean
    letterSpacing: number
    lineHeight: number
    color: string
    align: TextAlign
    /** 是否绘制手账下划线 */
    underline?: boolean
    backgroundColor?: string
  }
}

/** 艺术字仍然是文字，而不是一张不可再编辑的图片。 */
export type ArtTextTemplate = 'handwritten' | 'travel' | 'cinema' | 'magazine' | 'seal' | 'calligraphy'

export interface ArtTextElement extends ElementBase {
  kind: 'art-text'
  data: TextElement['data'] & {
    templateId: ArtTextTemplate
    accentColor: string
  }
}

/** 贴纸 / 装饰元素 */
export type StickerCategory =
  | 'tape'
  | 'stamp'
  | 'clip'
  | 'pin'
  | 'nature'
  | 'symbol'
  | 'travel'
  | 'line'

export interface StickerElement extends ElementBase {
  kind: 'sticker'
  data: {
    /** 贴纸字形（emoji 或 SVG 内容 id） */
    glyph: string
    /** 渲染方式：emoji 直出，或内置矢量图形 */
    render: 'glyph' | 'svg'
    svgId?: string
    category: StickerCategory
    /** 主色调，用于内置矢量图形 */
    tint?: string
  }
}

/** 便签元素 */
export type NoteVariant = 'sticky' | 'kraft' | 'lined' | 'plain' | 'torn'

export interface NoteElement extends ElementBase {
  kind: 'note'
  data: {
    text: string
    variant: NoteVariant
    fontFamily: string
    fontSize: number
    color: string
    /** 便签纸底色 */
    background: string
    rotationJitter?: number
  }
}

/** 印章 / 邮戳元素 */
export interface StampElement extends ElementBase {
  kind: 'stamp'
  data: {
    text: string
    subText?: string
    shape: 'circle' | 'rect' | 'oval'
    color: string
    /** 做旧斑驳强度 0..1 */
    distress: number
  }
}

/** 日期元素 */
export interface DateElement extends ElementBase {
  kind: 'date'
  data: {
    date: string
    endDate?: string
    format: 'cn' | 'dot' | 'slash' | 'long' | 'range'
    fontFamily: string
    fontSize: number
    color: string
  }
}

/** 手绘路线地图元素 */
export interface MapElement extends ElementBase {
  kind: 'map'
  data: {
    title: string
    /** 途经点，按顺序连线 */
    points: Array<{ name: string; lat: number; lng: number; note?: string }>
    /** 归一化坐标（0..1），由 lat/lng 投影得到，便于离线渲染 */
    ink: string
    accent: string
    showLabels: boolean
  }
}

/** 几何装饰（手绘线条 / 色块） */
export interface ShapeElement extends ElementBase {
  kind: 'shape'
  data: {
    shape: 'rect' | 'ellipse' | 'line' | 'arrow' | 'highlight'
    fill: string
    stroke: string
    strokeWidth: number
    dash?: number[]
  }
}

export type AlbumElement =
  | PhotoElement
  | TextElement
  | ArtTextElement
  | StickerElement
  | NoteElement
  | StampElement
  | DateElement
  | MapElement
  | ShapeElement

/* ------------------------------------------------------------------ *
 * 页面
 * ------------------------------------------------------------------ */

export type PageRole = 'cover' | 'content' | 'ending'

export interface PageBackground {
  /** 纸张底色 */
  color: string
  paper: PaperKind
  /** 方格 / 横线的线色 */
  lineColor?: string
  /** 可选的整页底图 */
  imageUrl?: string
  /** 页面上叠加的柔和光影，营造纸张厚度 */
  vignette?: number
}

export interface Page {
  id: ID
  /** 物理纸张标识；同一张纸的正反面共享此 ID。 */
  sheetId?: ID
  /** 该页面属于纸张正面还是背面。未设置时使用旧版单页排版。 */
  sheetSide?: 'front' | 'back'
  /** 页面标题，用于底部缩略图与「旅行路线」目录 */
  title: string
  role: PageRole
  background: PageBackground
  /** 绘制顺序 = 数组顺序，最后一项在最上层 */
  elements: AlbumElement[]
  /** 该页对应的日期 */
  date?: string
  /** 该页对应的地点 */
  location?: GeoPoint
  /** 页面备注（不渲染到纸上，供作者记录） */
  memo?: string
}

/* ------------------------------------------------------------------ *
 * 纪念册
 * ------------------------------------------------------------------ */

export interface Album {
  id: ID
  title: string
  subtitle?: string
  theme: AlbumTheme
  /** 新建实体书采用正反面顺序；未设置的旧册子沿用原跨页规则。 */
  pageLayout?: 'duplex'
  /** 封面照片 */
  coverPhotoId?: ID
  startDate?: string
  endDate?: string
  location?: GeoPoint
  /** 旅行路线（地图页数据源） */
  route?: Array<{ name: string; lat: number; lng: number; note?: string }>
  pages: Page[]
  /** 素材库里被这本纪念册使用的照片 id */
  photoIds: ID[]
  /** 页面坐标系尺寸（所有页面一致） */
  pageSize: { width: number; height: number }
  /** 作者信息（分享页展示） */
  author?: { name: string; avatar?: string }
  /** 分享设置 */
  share?: { enabled: boolean; slug: string; updatedAt: string }
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ *
 * 编辑器状态
 * ------------------------------------------------------------------ */

/** 编辑器里定位一个元素：必须带 pageId，因为元素 id 只在页内唯一即可，
 *  但为了跨页复制粘贴方便，我们仍然让元素 id 全局唯一。 */
export interface ElementRef {
  pageId: ID
  elementId: ID
}

/** 右侧属性面板可编辑的字段分组 */
export interface TransformPatch {
  x?: number
  y?: number
  width?: number
  height?: number
  rotation?: number
  opacity?: number
  radius?: number
  shadow?: number
  locked?: boolean
}

/** AI 生成的阶段，用于展示进度 */
export interface AiPlanStep {
  key: string
  label: string
  status: 'pending' | 'running' | 'done'
}

/** AI 生成的页章节计划 */
export interface AiChapterPlan {
  title: string
  role: PageRole
  caption: string
  photoIds: ID[]
  layout: 'hero' | 'collage' | 'grid' | 'diptych' | 'text-only' | 'map'
}
