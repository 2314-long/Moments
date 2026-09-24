import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  ChevronLeft,
  Loader2,
  MapPin,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'
import type { Album, AlbumTheme, GeoPoint, PhotoAsset } from '@/types/album'
import { PAGE_HEIGHT, PAGE_WIDTH, THEME_LIST, THEMES } from '@/lib/designTokens'
import { newAlbumId } from '@/lib/id'
import { usePhotoStore } from '@/store/photoStore'
import { persistAlbum } from '@/persistence'
import { uploadPhotos } from '@/services/uploadService'
import { DropZone } from '@/components/upload/DropZone'
import { Toast, useToast } from '@/components/ui/Toast'
import { heuristicAiProvider } from '@/ai/heuristicProvider'
import { BookCover } from '@/components/album/BookCover'
import { JIUZHAIGOU_ROUTE } from '@/data/demoPhotos'

/**
 * 创建纪念册。
 *
 * 五步流程：命名 → 时间 → 地点 → 照片 → 风格，然后自动生成初稿。
 * 每一步都可以回退，最后一步会真实调用 AI 排版接口（当前为离线启发式实现）
 * 并生成一本可以立刻编辑的完整纪念册。
 */

type StepId = 'name' | 'when' | 'where' | 'photos' | 'style'

const STEPS: Array<{ id: StepId; title: string; hint: string }> = [
  { id: 'name', title: '纪念册名称', hint: '给它起一个会被记住的名字' },
  { id: 'when', title: '时间', hint: '这段旅程发生在什么时候' },
  { id: 'where', title: '地点', hint: '可以去哪里找到这段回忆' },
  { id: 'photos', title: '上传照片', hint: '照片是这本册子的主角' },
  { id: 'style', title: '纪念册风格', hint: '决定封面与纸张的气质' },
]

const PRESET_PLACES: GeoPoint[] = [
  { name: '九寨沟', region: '四川 · 阿坝 · 九寨沟', lat: 33.2601, lng: 103.9178, altitude: 2000 },
  { name: '大理', region: '云南 · 大理', lat: 25.6065, lng: 100.2676 },
  { name: '京都', region: '日本 · 京都', lat: 35.0116, lng: 135.7681 },
  { name: '冰岛', region: '冰岛 · 雷克雅未克', lat: 64.1466, lng: -21.9426 },
  { name: '青海湖', region: '青海 · 海南州', lat: 36.8884, lng: 100.1804 },
]

const ANALYSIS_STEPS = [
  { key: 'analyze', label: '分析照片内容' },
  { key: 'group', label: '按时间与地点分组' },
  { key: 'pick', label: '挑选代表照片' },
  { key: 'layout', label: '生成页面版面' },
  { key: 'write', label: '撰写标题与文字' },
] as const

export function CreateAlbumPage() {
  const libraryAssets = usePhotoStore((state) => state.assets)
  const { toast, show } = useToast()

  const [stepIndex, setStepIndex] = useState(0)
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [placeQuery, setPlaceQuery] = useState('')
  const [place, setPlace] = useState<GeoPoint | null>(null)
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([])
  const [theme, setTheme] = useState<AlbumTheme>('travel')
  const [uploadProgress, setUploadProgress] = useState<{ value: number; name: string } | null>(null)

  const [generating, setGenerating] = useState(false)
  const [analysisState, setAnalysisState] = useState<Record<string, 'pending' | 'running' | 'done'>>({})
  const [summary, setSummary] = useState<string[] | null>(null)
  const [createdAlbum, setCreatedAlbum] = useState<Album | null>(null)
  const uploadAbort = useRef(false)

  const step = STEPS[stepIndex]
  const selectedAssets = useMemo(
    () => selectedPhotoIds.map((id) => libraryAssets.find((a) => a.id === id)).filter(Boolean) as PhotoAsset[],
    [libraryAssets, selectedPhotoIds],
  )

  const canAdvance = useMemo(() => {
    switch (step.id) {
      case 'name':
        return title.trim().length > 0
      case 'when':
        return Boolean(startDate)
      case 'where':
        return true
      case 'photos':
        return true
      case 'style':
        return true
      default:
        return true
    }
  }, [step.id, title, startDate])

  async function handleUpload(files: File[]) {
    setUploadProgress({ value: 0, name: files[0]?.name ?? '' })
    uploadAbort.current = false
    try {
      const result = await uploadPhotos(files, (progress) => {
        setUploadProgress({
          value: progress.total ? progress.done / progress.total : 0,
          name: progress.current || '完成',
        })
      })
      if (result.assets.length) {
        setSelectedPhotoIds((prev) => [...prev, ...result.assets.map((a) => a.id)])
        show(`已添加 ${result.assets.length} 张照片`, { tone: 'success' })
      }
      if (result.failed.length) {
        show(`${result.failed.length} 张照片读取失败`, { tone: 'error' })
      }
    } catch (error) {
      show(error instanceof Error ? error.message : '上传失败', { tone: 'error' })
    } finally {
      setUploadProgress(null)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    setAnalysisState(Object.fromEntries(ANALYSIS_STEPS.map((s) => [s.key, 'pending'])))
    setSummary(null)

    const mark = async (key: string, delay: number) => {
      setAnalysisState((prev) => ({ ...prev, [key]: 'running' }))
      await sleep(delay)
      setAnalysisState((prev) => ({ ...prev, [key]: 'done' }))
    }

    try {
      await mark('analyze', 420)

      const insights = await heuristicAiProvider.analyze(
        selectedAssets.map((asset) => ({
          id: asset.id,
          takenAt: asset.takenAt,
          location: asset.location,
          width: asset.width,
          height: asset.height,
          name: asset.name,
        })),
      )

      await mark('group', 380)
      await mark('pick', 320)

      const result = await heuristicAiProvider.layout({
        title: title.trim(),
        theme,
        location: place ?? undefined,
        startDate: startDate || undefined,
        endDate: endDate || startDate || undefined,
        insights,
        pageSize: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
      })

      await mark('layout', 460)
      await mark('write', 380)

      const now = new Date().toISOString()
      const album: Album = {
        id: newAlbumId(),
        title: title.trim(),
        theme,
        coverPhotoId: insights.find((i) => i.coverCandidate)?.photoId ?? selectedAssets[0]?.id,
        startDate: startDate || undefined,
        endDate: endDate || startDate || undefined,
        location: place ?? undefined,
        route: place?.name === '九寨沟' ? JIUZHAIGOU_ROUTE : undefined,
        pages: result.pages,
        photoIds: selectedAssets.map((a) => a.id),
        pageSize: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
        author: { name: '我' },
        share: { enabled: true, slug: slugify(title), updatedAt: now },
        createdAt: now,
        updatedAt: now,
      }

      await persistAlbum(album)
      setCreatedAlbum(album)
      setSummary(result.summary)
    } catch (error) {
      console.error(error)
      show('生成失败，请重试', { tone: 'error' })
      setGenerating(false)
    }
  }

  /* ---------------------------------------------------------- 生成完成 */

  if (createdAlbum) {
    return (
      <div className="flex h-full items-center justify-center overflow-y-auto p-8">
        <div className="w-full max-w-3xl animate-fade-up">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-moss-600/25">
              <Check className="h-6 w-6 text-moss-500" />
            </div>
            <h1 className="font-serif text-2xl text-ink-100">你的纪念册已经生成</h1>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-ink-400">
              《{createdAlbum.title}》共 {createdAlbum.pages.length} 页。所有内容都可以继续手动修改 ——
              移动、替换、增删，随你。
            </p>
          </div>

          <div className="mt-8 flex flex-col items-center gap-8 sm:flex-row sm:items-start sm:justify-center">
            <BookCover album={createdAlbum} width={216} height={288} />

            <div className="w-full max-w-xs space-y-2">
              {summary?.map((line) => (
                <div
                  key={line}
                  className="flex items-start gap-2 rounded-xl bg-ink-850/70 px-3 py-2 text-[11px] leading-relaxed text-ink-300"
                >
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-clay-400" />
                  {line}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-9 flex flex-wrap justify-center gap-2.5">
            <Link to={`/album/${createdAlbum.id}/read`} className="btn-primary">
              翻阅纪念册
            </Link>
            <Link to={`/album/${createdAlbum.id}/edit`} className="btn-subtle">
              <Wand2 className="h-4 w-4" />
              继续编辑
            </Link>
            <Link to="/" className="btn-ghost">
              返回书架
            </Link>
          </div>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------- 生成中 */

  if (generating) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="w-full max-w-sm animate-fade-in">
          <h1 className="mb-1.5 text-center font-serif text-lg text-ink-100">正在生成纪念册</h1>
          <p className="mb-6 text-center text-[11px] text-ink-500">
            {selectedAssets.length
              ? `${selectedAssets.length} 张照片正在被整理成一本书`
              : '还没有照片，先生成一册空白手账'}
          </p>

          <div className="space-y-1.5">
            {ANALYSIS_STEPS.map((entry) => {
              const status = analysisState[entry.key] ?? 'pending'
              return (
                <div
                  key={entry.key}
                  className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-all duration-300 ${
                    status === 'running'
                      ? 'bg-ink-700/60'
                      : status === 'done'
                        ? 'bg-ink-850/50'
                        : 'bg-transparent opacity-45'
                  }`}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {status === 'done' ? (
                      <Check className="h-3.5 w-3.5 text-moss-500" />
                    ) : status === 'running' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-clay-400" />
                    ) : (
                      <span className="h-1 w-1 rounded-full bg-ink-600" />
                    )}
                  </span>
                  <span className="text-xs text-ink-200">{entry.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------- 向导 */

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 px-6 py-4">
        <Link to="/" className="tool-btn h-9 w-9" title="返回书架">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="leading-tight">
          <div className="text-sm text-ink-100">创建纪念册</div>
          <div className="text-[10px] tracking-[0.2em] text-ink-500">
            第 {stepIndex + 1} / {STEPS.length} 步 · {step.title}
          </div>
        </div>
        <div className="flex-1" />
        <div className="hidden items-center gap-1.5 sm:flex">
          {STEPS.map((entry, index) => (
            <div
              key={entry.id}
              className={`h-1 rounded-full transition-all duration-300 ${
                index === stepIndex
                  ? 'w-7 bg-clay-500'
                  : index < stepIndex
                    ? 'w-4 bg-ink-500'
                    : 'w-4 bg-ink-700'
              }`}
            />
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="mx-auto max-w-3xl py-4">
          <h1 className="font-serif text-xl text-ink-100">{step.hint}</h1>

          <div className="mt-7">
            {/* -------------------------------- 名称 */}
            {step.id === 'name' && (
              <div className="animate-fade-up space-y-5">
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canAdvance) setStepIndex(1)
                  }}
                  placeholder="九寨沟旅行记"
                  className="w-full rounded-2xl border border-ink-700 bg-ink-850/70 px-5 py-4 font-serif text-2xl text-ink-100 placeholder:text-ink-600 focus:border-ink-500 focus:outline-none"
                />
                <div className="flex flex-wrap gap-2">
                  {['九寨沟旅行记', '我们的夏天', '毕业那一年', '2026 春日旅行', '和朋友的第一次自驾'].map(
                    (preset) => (
                      <button
                        key={preset}
                        className="chip transition-colors hover:border-ink-500 hover:text-ink-100"
                        onClick={() => setTitle(preset)}
                      >
                        {preset}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}

            {/* -------------------------------- 时间 */}
            {step.id === 'when' && (
              <div className="animate-fade-up space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-400">
                      <Calendar className="h-3.5 w-3.5" /> 开始
                    </span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value)
                        if (!endDate || endDate < e.target.value) setEndDate(e.target.value)
                      }}
                      className="field !py-2.5"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-400">
                      <Calendar className="h-3.5 w-3.5" /> 结束
                    </span>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="field !py-2.5"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: '2026.08.12 — 08.16', start: '2026-08-12', end: '2026-08-16' },
                    { label: '这个夏天', start: '2026-06-01', end: '2026-08-31' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      className="chip transition-colors hover:border-ink-500 hover:text-ink-100"
                      onClick={() => {
                        setStartDate(preset.start)
                        setEndDate(preset.end)
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-ink-500">
                  时间会用于自动分章，以及页面上显示的日期。可以跳过（只填开始日期即可）。
                </p>
              </div>
            )}

            {/* -------------------------------- 地点 */}
            {step.id === 'where' && (
              <div className="animate-fade-up space-y-4">
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                  <input
                    value={placeQuery}
                    onChange={(e) => setPlaceQuery(e.target.value)}
                    placeholder="搜索或输入地点，例如「四川 · 九寨沟」"
                    className="field !py-3 pl-10"
                  />
                </div>

                {place && (
                  <div className="flex items-center gap-2 rounded-xl bg-ink-800/60 px-3.5 py-2.5">
                    <MapPin className="h-3.5 w-3.5 text-clay-400" />
                    <span className="text-xs text-ink-200">{place.region ?? place.name}</span>
                    <button
                      className="ml-auto text-ink-500 hover:text-ink-200"
                      onClick={() => {
                        setPlace(null)
                        setPlaceQuery('')
                      }}
                      aria-label="清除地点"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {PRESET_PLACES.map((preset) => (
                    <button
                      key={preset.name}
                      className="chip transition-colors hover:border-ink-500 hover:text-ink-100"
                      onClick={() => {
                        setPlace(preset)
                        setPlaceQuery(preset.region ?? preset.name)
                      }}
                    >
                      {preset.region ?? preset.name}
                    </button>
                  ))}
                  {placeQuery.trim() && !place && (
                    <button
                      className="chip !border-clay-500/40 !text-clay-400 transition-colors hover:bg-clay-600/20"
                      onClick={() => setPlace({ name: placeQuery.trim(), region: placeQuery.trim() })}
                    >
                      使用「{placeQuery.trim()}」
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-ink-500">
                  地点会显示在封面和路线页上。如果照片带 GPS 信息，后续也可以自动提取（规划中）。
                </p>
              </div>
            )}

            {/* -------------------------------- 照片 */}
            {step.id === 'photos' && (
              <div className="animate-fade-up space-y-4">
                <DropZone
                  onFiles={(files) => void handleUpload(files)}
                  progress={uploadProgress ? uploadProgress.value : null}
                  currentName={uploadProgress?.name}
                />

                <div className="flex items-center justify-between">
                  <div className="text-xs text-ink-400">
                    已选择 <span className="text-ink-100">{selectedPhotoIds.length}</span> 张
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-ghost !py-1.5 !text-xs"
                      onClick={() =>
                        setSelectedPhotoIds(
                          libraryAssets.length === selectedPhotoIds.length
                            ? []
                            : libraryAssets.map((a) => a.id),
                        )
                      }
                    >
                      {libraryAssets.length === selectedPhotoIds.length ? '取消全选' : '全选素材库'}
                    </button>
                    <Link to="/photos" className="btn-ghost !py-1.5 !text-xs">
                      管理素材库
                    </Link>
                  </div>
                </div>

                <div className="max-h-[340px] overflow-y-auto rounded-2xl border border-white/[0.06] bg-ink-850/40 p-3">
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {libraryAssets.map((asset) => (
                      <PhotoThumb
                        key={asset.id}
                        asset={asset}
                        selected={selectedPhotoIds.includes(asset.id)}
                        onToggle={() =>
                          setSelectedPhotoIds((prev) =>
                            prev.includes(asset.id)
                              ? prev.filter((id) => id !== asset.id)
                              : [...prev, asset.id],
                          )
                        }
                      />
                    ))}
                  </div>
                </div>

                {selectedPhotoIds.length === 0 && (
                  <p className="text-[11px] text-ink-500">
                    也可以跳过上传，先生成一册空白手账，之后在编辑器里再添加照片。
                  </p>
                )}
              </div>
            )}

            {/* -------------------------------- 风格 */}
            {step.id === 'style' && (
              <div className="animate-fade-up space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {THEME_LIST.map((token) => {
                    const active = theme === token.id
                    return (
                      <button
                        key={token.id}
                        onClick={() => setTheme(token.id)}
                        className={`group relative overflow-hidden rounded-2xl border p-3 text-left transition-all ${
                          active
                            ? 'border-clay-500/70 bg-ink-800/80'
                            : 'border-white/[0.06] bg-ink-850/50 hover:border-ink-600 hover:bg-ink-800/60'
                        }`}
                      >
                        <div
                          className="mb-2.5 h-14 w-full rounded-lg"
                          style={{
                            backgroundColor: token.cover,
                            backgroundImage: `linear-gradient(135deg, ${token.coverAccent}55, transparent 62%)`,
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                          }}
                        />
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-ink-100">{token.name}</span>
                          {active && <Check className="h-3 w-3 text-clay-400" />}
                        </div>
                        <div className="mt-0.5 text-[10px] leading-relaxed text-ink-500">
                          {token.mood}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* 预览卡片 */}
                <div className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-ink-850/40 p-4">
                  <div className="shrink-0">
                    <MiniCover theme={theme} title={title || '未命名纪念册'} />
                  </div>
                  <div className="min-w-0 text-xs leading-relaxed text-ink-400">
                    <div className="text-ink-100">{title || '未命名纪念册'}</div>
                    <div className="mt-1">
                      {THEMES[theme].name}风格 · 纸张：{THEMES[theme].paper}
                    </div>
                    <div className="mt-1">
                      {selectedPhotoIds.length} 张照片 · 预计生成{' '}
                      {Math.max(3, Math.min(14, Math.ceil(selectedPhotoIds.length / 3) + 3))} 页
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="flex shrink-0 items-center gap-3 px-6 py-4">
        <button
          className="btn-ghost"
          disabled={stepIndex === 0}
          onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
          上一步
        </button>
        <div className="flex-1" />
        {step.id === 'style' ? (
          <button className="btn-primary" onClick={() => void handleGenerate()}>
            <Wand2 className="h-4 w-4" />
            生成我的纪念册
          </button>
        ) : (
          <button
            className="btn-primary"
            disabled={!canAdvance}
            onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
          >
            下一步
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </footer>

      <Toast toast={toast} />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 小件
 * ------------------------------------------------------------------ */

function PhotoThumb({
  asset,
  selected,
  onToggle,
}: {
  asset: PhotoAsset
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
        selected ? 'border-clay-500' : 'border-transparent hover:border-ink-600'
      }`}
      title={asset.name}
    >
      <img src={asset.url} alt={asset.name ?? ''} className="h-full w-full object-cover" draggable={false} />
      {selected && (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-clay-500 shadow">
          <Check className="h-2.5 w-2.5 text-white" />
        </span>
      )}
      {!selected && (
        <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
      )}
    </button>
  )
}

function MiniCover({ theme, title }: { theme: AlbumTheme; title: string }) {
  const token = THEMES[theme]
  return (
    <div
      className="relative h-[104px] w-[78px] overflow-hidden rounded-[3px]"
      style={{
        backgroundColor: token.cover,
        boxShadow: '0 10px 20px -10px rgba(0,0,0,0.7)',
      }}
    >
      <div
        className="absolute inset-0"
        style={{ backgroundImage: `linear-gradient(150deg, ${token.coverAccent}44, transparent 60%)` }}
      />
      <div className="absolute inset-y-0 left-0 w-2.5 bg-black/25" />
      <div className="absolute inset-x-0 bottom-0 p-2">
        <div
          className="truncate font-serif text-[10px] leading-tight"
          style={{ color: token.foil }}
        >
          {title}
        </div>
      </div>
      <div className="absolute inset-1.5 rounded-[1px] border" style={{ borderColor: `${token.foil}33` }} />
    </div>
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base || 'album'}-${suffix}`
}
