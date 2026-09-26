import type { AiChapterPlan, AlbumTheme, GeoPoint, Page } from '@/types/album'

/**
 * AI 自动排版接口。
 *
 * 产品要求「AI 只是辅助，用户必须可以完全手动修改」，
 * 因此这里定义的是一个纯函数式的规划器：输入照片元数据，
 * 输出「章节 → 页面 → 元素」的完整页面数组。编辑器拿到结果后
 * 只是把它写进历史记录，用户随后可以像手动创建的页面一样编辑。
 *
 * 当前实现是确定性的启发式排版（analyzePhotos），不依赖任何网络。
 * 未来接入真实模型时，只需提供一个新的 AiLayoutProvider
 * （例如调用多模态模型做图像理解 + 约束求解做排版），
 * 通过 setAiProvider() 替换即可，编辑器与 UI 层无需改动。
 */

export interface PhotoInsight {
  photoId: string
  /** 拍摄时间 */
  takenAt?: string
  location?: GeoPoint
  /** 推断的内容类型 */
  contentType: 'landscape' | 'water' | 'forest' | 'portrait' | 'food' | 'night' | 'road' | 'unknown'
  /** 构图方向 */
  orientation: 'landscape' | 'portrait' | 'square'
  /** 真实像素尺寸，排版时用于保持比例 */
  width: number
  height: number
  /** 质量评分 0..1，用于挑「代表照片」 */
  score: number
  /** 是否适合做封面 */
  coverCandidate: boolean
}

export interface AiLayoutRequest {
  /** 纪念册标题（用于生成章节名） */
  title: string
  /** 纪念册主题，决定封面配色与纸张 */
  theme?: AlbumTheme
  location?: GeoPoint
  startDate?: string
  endDate?: string
  insights: PhotoInsight[]
  /** 页面尺寸 */
  pageSize: { width: number; height: number }
}

export interface AiLayoutResult {
  plan: AiChapterPlan[]
  pages: Page[]
  /** 生成过程的说明，用于给用户展示「AI 做了什么」 */
  summary: string[]
}

export interface AiLayoutProvider {
  readonly name: string
  analyze(photos: Array<{ id: string; takenAt?: string; location?: GeoPoint; width: number; height: number; name?: string }>): Promise<PhotoInsight[]>
  layout(request: AiLayoutRequest): Promise<AiLayoutResult>
}

/* ------------------------------------------------------------------ *
 * Provider 注册表
 * ------------------------------------------------------------------ */

/**
 * 当前生效的排版实现。
 *
 * 之所以要有这一层：之前 `CreateAlbumPage` 直接 import 了具体的
 * `heuristicAiProvider`，于是「换成真实模型只改一个地方」这个承诺
 * 在文档里成立、在代码里不成立（没有 setAiProvider 这个东西）。
 * 现在 UI 只依赖注册表，接入多模态模型时只需要在启动处调用
 * `setAiProvider(...)`（例如按环境变量 / 后端开关切换）。
 */
let currentProvider: AiLayoutProvider | null = null

/** 延迟注入的默认实现，避免 provider 层反向依赖具体实现 */
let fallbackLoader: (() => AiLayoutProvider) | null = null

export function setAiProvider(provider: AiLayoutProvider): void {
  currentProvider = provider
}

/** 注册「默认实现」的加载器（在应用入口调用一次即可） */
export function registerDefaultAiProvider(loader: () => AiLayoutProvider): void {
  fallbackLoader = loader
}

export function getAiProvider(): AiLayoutProvider {
  if (currentProvider) return currentProvider
  if (!fallbackLoader) {
    throw new Error('尚未注册 AI 排版实现：请在应用入口调用 registerDefaultAiProvider()')
  }
  currentProvider = fallbackLoader()
  return currentProvider
}
