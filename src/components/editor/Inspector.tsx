import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  ChevronDown,
  ChevronUp,
  Copy,
  Italic,
  Lock,
  LockOpen,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import type {
  AlbumElement,
  ElementKind,
  NoteElement,
  PhotoStyle,
  ShapeElement,
  StampElement,
  TextElement,
  TextPreset,
} from '@/types/album'
import { useEditorStore } from '@/store/editorStore'
import { FONT_STACK, PHOTO_STYLE_LIST, TEXT_PRESET_LIST } from '@/lib/designTokens'

/**
 * 右侧属性面板。
 *
 * 只显示与当前选中元素相关的属性，避免把一堆用不到的控件堆在用户面前。
 *
 * 撤销粒度：属性面板里既有「点一下」的离散操作，也有「拖滑块 / 连续输入」
 * 的高频操作。为了既不让每一次 pointermove 都塞一条历史（会把 60 步
 * 上限一口气用光），又能让用户用 Ctrl+Z 撤回整段调整，这里用
 * beginTransaction / commitTransaction 把一次连续操作合并成**一条**记录：
 * 第一次改动时开启事务，之后 450ms 没有新改动、或指针抬起，就提交。
 */

const COLOR_SWATCHES = [
  '#2b2b2b', '#4a4a4a', '#6b6b6b', '#8a8a8a',
  '#a8503a', '#c2603f', '#d97d5a', '#b98f5e',
  '#4a6b52', '#5d8163', '#4b5b86', '#61729f',
  '#8c5a5a', '#f2ead8', '#ffffff', '#243040',
]

/** 把「一次连续调整」合并成一条历史记录 */
const QUIET_MS = 450

type Patcher = (updater: (element: AlbumElement) => AlbumElement, label: string) => void

const PatchContext = createContext<Patcher | null>(null)

/** 取到「事务化」的 updateSelected；不在 Provider 内时退回普通实现 */
function usePatch(): Patcher {
  const fromContext = useContext(PatchContext)
  const fallback = useEditorStore((state) => state.updateSelected)
  return fromContext ?? fallback
}

function useTransactedUpdate(): Patcher {
  const updateSelected = useEditorStore((state) => state.updateSelected)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    useEditorStore.getState().commitTransaction('调整属性')
  }, [])

  // 指针抬起 = 一次拖拽 / 取色结束，立刻落一条历史，不必等静默计时
  useEffect(() => {
    window.addEventListener('pointerup', flush)
    window.addEventListener('pointercancel', flush)
    return () => {
      window.removeEventListener('pointerup', flush)
      window.removeEventListener('pointercancel', flush)
      flush()
    }
  }, [flush])

  return useCallback(
    (updater, label) => {
      useEditorStore.getState().beginTransaction()
      updateSelected(updater, label)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, QUIET_MS)
    },
    [flush, updateSelected],
  )
}

export function Inspector() {
  const selection = useEditorStore((state) => state.selection)
  const album = useEditorStore((state) => state.album)
  const updateSelected = useTransactedUpdate()
  const removeElements = useEditorStore((state) => state.removeElements)
  const duplicateElements = useEditorStore((state) => state.duplicateElements)
  const toggleLock = useEditorStore((state) => state.toggleLock)
  const bringForward = useEditorStore((state) => state.bringForward)
  const sendBackward = useEditorStore((state) => state.sendBackward)
  const bringToFront = useEditorStore((state) => state.bringToFront)
  const sendToBack = useEditorStore((state) => state.sendToBack)

  /**
   * 选中的元素要**跨页**查找。
   *
   * 之前只按 activePageId 过滤，而 activePageId 永远是跨页的左槽，
   * 于是点选右页元素后属性面板会显示「未选中任何元素」。
   * 元素 id 全局唯一，所以直接扫全部页面即可。
   */
  const selected = useMemo(() => {
    if (!album || !selection.length) return []
    const wanted = new Set(selection)
    const found: AlbumElement[] = []
    for (const page of album.pages) {
      for (const element of page.elements) {
        if (wanted.has(element.id)) found.push(element)
      }
    }
    return found
  }, [album, selection])

  if (!selected.length) {
    return <EmptyInspector />
  }

  const primary = selected[0]
  const multi = selected.length > 1
  // 锁定的元素只允许解锁，其余属性不允许改（与「锁定」这个语义保持一致）
  const locked = selected.every((element) => element.locked)

  return (
    <PatchContext.Provider value={updateSelected}>
      <div className="flex h-full flex-col overflow-y-auto">
        {/* 头部 */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-[11px] text-ink-200">
              {multi ? `已选中 ${selected.length} 个元素` : kindLabel(primary.kind)}
            </div>
            <div className="text-[9px] text-ink-600">
              {multi
                ? '拖动可整体移动'
                : `${Math.round(primary.width)} × ${Math.round(primary.height)}`}
            </div>
          </div>
          <div className="flex shrink-0 gap-0.5">
            <IconBtn title="复制 (Ctrl+D)" onClick={() => duplicateElements()} disabled={locked}>
              <Copy className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn title={primary.locked ? '解锁' : '锁定'} onClick={() => toggleLock()}>
              {primary.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
            </IconBtn>
            <IconBtn
              title={locked ? '已锁定，先解锁再删除' : '删除 (Delete)'}
              danger
              disabled={locked}
              onClick={() => removeElements()}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        </div>
        {locked && (
          <div className="shrink-0 border-b border-white/[0.06] bg-ink-800/40 px-3 py-1.5 text-[10px] text-ink-500">
            元素已锁定，属性不可修改
          </div>
        )}

        <div className="space-y-3.5 px-3 py-3">
          {/* 位置与大小 */}
          <Section title="位置与大小">
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="X"
                value={primary.x}
                onChange={(value) => updateSelected((e) => ({ ...e, x: value }), '修改位置')}
              />
              <NumberField
                label="Y"
                value={primary.y}
                onChange={(value) => updateSelected((e) => ({ ...e, y: value }), '修改位置')}
              />
              <NumberField
                label="宽"
                value={primary.width}
                min={8}
                onChange={(value) => updateSelected((e) => ({ ...e, width: value }), '修改尺寸')}
              />
              <NumberField
                label="高"
                value={primary.height}
                min={8}
                onChange={(value) => updateSelected((e) => ({ ...e, height: value }), '修改尺寸')}
              />
            </div>

            <SliderField
              label="旋转"
              value={primary.rotation}
              min={-180}
              max={180}
              step={1}
              suffix="°"
              onChange={(value) => updateSelected((e) => ({ ...e, rotation: value }), '修改旋转')}
              onReset={() => updateSelected((e) => ({ ...e, rotation: 0 }), '重置旋转')}
            />
            <SliderField
              label="不透明度"
              value={Math.round(primary.opacity * 100)}
              min={0}
              max={100}
              step={1}
              suffix="%"
              onChange={(value) => updateSelected((e) => ({ ...e, opacity: value / 100 }), '修改透明度')}
            />
            <SliderField
              label="阴影"
              value={Math.round((primary.shadow ?? 0) * 100)}
              min={0}
              max={100}
              step={1}
              suffix="%"
              onChange={(value) => updateSelected((e) => ({ ...e, shadow: value / 100 }), '修改阴影')}
            />
          </Section>

          {/* 层级 */}
          <Section title="层级">
            <div className="grid grid-cols-4 gap-1.5">
              <LayerBtn title="置于顶层" onClick={() => bringToFront()} disabled={locked}>
                <ArrowUpToLine className="h-3.5 w-3.5" />
              </LayerBtn>
              <LayerBtn title="上移一层" onClick={() => bringForward()} disabled={locked}>
                <ChevronUp className="h-3.5 w-3.5" />
              </LayerBtn>
              <LayerBtn title="下移一层" onClick={() => sendBackward()} disabled={locked}>
                <ChevronDown className="h-3.5 w-3.5" />
              </LayerBtn>
              <LayerBtn title="置于底层" onClick={() => sendToBack()} disabled={locked}>
                <ArrowDownToLine className="h-3.5 w-3.5" />
              </LayerBtn>
            </div>
          </Section>

          {/* 类型专属属性 */}
          {!multi && <TypeSpecific element={primary} />}
        </div>
      </div>
    </PatchContext.Provider>
  )
}

/* ------------------------------------------------------------------ *
 * 各类型的专属设置
 * ------------------------------------------------------------------ */

function TypeSpecific({ element }: { element: AlbumElement }) {
  const updateSelected = usePatch()

  const patchData = (patch: Record<string, unknown>, label: string) =>
    updateSelected(
      (e) => ({ ...e, data: { ...e.data, ...patch } }) as AlbumElement,
      label,
    )

  switch (element.kind) {
    case 'photo':
      return <PhotoSettings element={element} patchData={patchData} />
    case 'text':
      return <TextSettings element={element} patchData={patchData} />
    case 'note':
      return <NoteSettings element={element} patchData={patchData} />
    case 'sticker':
      return <StickerSettings element={element} patchData={patchData} />
    case 'stamp':
      return <StampSettings element={element} patchData={patchData} />
    case 'date':
      return (
        <Section title="日期">
          <div className="space-y-2">
            <label className="block">
              <span className="mb-1 block text-[10px] text-ink-500">开始</span>
              <input
                type="date"
                value={element.data.date.slice(0, 10)}
                onChange={(e) => patchData({ date: e.target.value }, '修改日期')}
                className="field !py-1.5 text-xs"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] text-ink-500">结束（可选）</span>
              <input
                type="date"
                value={element.data.endDate?.slice(0, 10) ?? ''}
                onChange={(e) => patchData({ endDate: e.target.value || undefined }, '修改日期')}
                className="field !py-1.5 text-xs"
              />
            </label>
            <div>
              <span className="mb-1 block text-[10px] text-ink-500">格式</span>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ['dot', '2026.08.12'],
                    ['slash', '2026/08/12'],
                    ['cn', '2026 年 8 月 12 日'],
                    ['long', '含星期'],
                    ['range', '区间'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => patchData({ format: value }, '修改日期格式')}
                    className={`rounded-lg px-2 py-1 text-[10px] transition-colors ${
                      element.data.format === value
                        ? 'bg-ink-700 text-ink-100'
                        : 'bg-ink-800/50 text-ink-400 hover:bg-ink-700/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <FontSizeRow
              value={element.data.fontSize}
              onChange={(value) => patchData({ fontSize: value }, '修改字号')}
            />
            <ColorRow
              value={element.data.color}
              onChange={(value) => patchData({ color: value }, '修改颜色')}
            />
          </div>
        </Section>
      )
    case 'map':
      return (
        <Section title="地图">
          <div className="space-y-2">
            <label className="block">
              <span className="mb-1 block text-[10px] text-ink-500">标题</span>
              <input
                value={element.data.title}
                onChange={(e) => patchData({ title: e.target.value }, '修改地图标题')}
                className="field !py-1.5 text-xs"
              />
            </label>
            <div className="text-[10px] text-ink-500">
              途经点 {element.data.points.length} 个
            </div>
            <div className="space-y-1">
              {element.data.points.map((point, index) => (
                // key 不能带上 point.name：改名会让 React 卸载重建这个 input，
                // 于是每敲一个字就丢一次焦点（只能改一个字）
                <div key={index} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-clay-600/25 text-[9px] text-clay-400">
                    {index + 1}
                  </span>
                  <input
                    value={point.name}
                    onChange={(e) => {
                      const points = [...element.data.points]
                      points[index] = { ...points[index], name: e.target.value }
                      patchData({ points }, '修改途经点')
                    }}
                    className="field !py-1 text-[11px]"
                  />
                </div>
              ))}
            </div>
            <label className="flex items-center justify-between rounded-lg bg-ink-800/50 px-2.5 py-1.5">
              <span className="text-[10px] text-ink-400">显示地名</span>
              <input
                type="checkbox"
                checked={element.data.showLabels}
                onChange={(e) => patchData({ showLabels: e.target.checked }, '切换地名')}
                className="accent-clay-500"
              />
            </label>
            <ColorRow
              label="路线色"
              value={element.data.accent}
              onChange={(value) => patchData({ accent: value }, '修改路线色')}
            />
          </div>
        </Section>
      )
    case 'shape':
      return <ShapeSettings element={element} patchData={patchData} />
    default:
      return null
  }
}

type PatchData = (patch: Record<string, unknown>, label: string) => void

function PhotoSettings({
  element,
  patchData,
}: {
  element: Extract<AlbumElement, { kind: 'photo' }>
  patchData: PatchData
}) {
  const updateSelected = usePatch()
  return (
    <>
      <Section title="照片样式">
        <div className="grid grid-cols-3 gap-1.5">
          {PHOTO_STYLE_LIST.map((token) => (
            <button
              key={token.id}
              onClick={() => patchData({ style: token.id as PhotoStyle }, '更换照片样式')}
              title={token.desc}
              className={`rounded-lg px-1.5 py-1.5 text-[10px] transition-all ${
                element.data.style === token.id
                  ? 'bg-clay-600/85 text-white'
                  : 'bg-ink-800/60 text-ink-400 hover:bg-ink-700 hover:text-ink-200'
              }`}
            >
              {token.name}
            </button>
          ))}
        </div>
      </Section>

      <Section title="相框内文字">
        <input
          value={element.data.caption ?? ''}
          onChange={(e) => patchData({ caption: e.target.value }, '修改照片文字')}
          placeholder="拍立得下方的注释"
          className="field !py-1.5 text-xs"
        />
      </Section>

      <Section title="裁切与取景">
        <div className="space-y-2">
          <div>
            <span className="mb-1 block text-[10px] text-ink-500">填充方式</span>
            <div className="flex gap-1">
              {(
                [
                  ['cover', '铺满裁切'],
                  ['contain', '完整显示'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => patchData({ fit: value }, '修改填充方式')}
                  className={`flex-1 rounded-lg px-2 py-1 text-[10px] transition-colors ${
                    element.data.fit === value
                      ? 'bg-ink-700 text-ink-100'
                      : 'bg-ink-800/50 text-ink-400 hover:bg-ink-700/60'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <SliderField
            label="水平取景"
            value={Math.round((element.data.focusX ?? 0.5) * 100)}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(value) => patchData({ focusX: value / 100 }, '调整取景')}
          />
          <SliderField
            label="垂直取景"
            value={Math.round((element.data.focusY ?? 0.5) * 100)}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(value) => patchData({ focusY: value / 100 }, '调整取景')}
          />
        </div>
      </Section>

      <Section title="调整">
        <div className="space-y-2">
          <SliderField
            label="圆角"
            value={Math.round(element.radius ?? 0)}
            min={0}
            max={80}
            step={1}
            suffix="px"
            onChange={(value) =>
              updateSelected((e) => ({ ...e, radius: value }), '修改圆角')
            }
          />
          <label className="flex items-center justify-between rounded-lg bg-ink-800/50 px-2.5 py-1.5">
            <span className="text-[10px] text-ink-400">黑白</span>
            <input
              type="checkbox"
              checked={Boolean(element.data.grayscale)}
              onChange={(e) => patchData({ grayscale: e.target.checked }, '切换黑白')}
              className="accent-clay-500"
            />
          </label>
          <label className="flex items-center justify-between rounded-lg bg-ink-800/50 px-2.5 py-1.5">
            <span className="text-[10px] text-ink-400">泛黄</span>
            <input
              type="checkbox"
              checked={Boolean(element.data.sepia)}
              onChange={(e) => patchData({ sepia: e.target.checked }, '切换泛黄')}
              className="accent-clay-500"
            />
          </label>
        </div>
      </Section>
    </>
  )
}

function TextSettings({
  element,
  patchData,
}: {
  element: TextElement
  patchData: PatchData
}) {
  const updateSelected = usePatch()

  return (
    <>
      <Section title="内容">
        <textarea
          value={element.data.text}
          onChange={(e) => patchData({ text: e.target.value }, '编辑文字')}
          rows={3}
          className="field resize-none text-xs leading-relaxed"
        />
      </Section>

      <Section title="文字预设">
        <div className="flex flex-wrap gap-1">
          {TEXT_PRESET_LIST.map((token) => (
            <button
              key={token.id}
              onClick={() => {
                const preset = token.id as TextPreset
                patchData(
                  {
                    preset,
                    fontFamily: FONT_STACK[token.fontFamily],
                    fontSize: token.fontSize,
                    fontWeight: token.fontWeight,
                    letterSpacing: token.letterSpacing,
                    lineHeight: token.lineHeight,
                    color: token.color,
                    align: token.align,
                    italic: token.italic ?? false,
                    underline: token.underline,
                  },
                  '应用文字预设',
                )
              }}
              className={`rounded-lg px-2 py-1 text-[10px] transition-colors ${
                element.data.preset === token.id
                  ? 'bg-ink-700 text-ink-100'
                  : 'bg-ink-800/50 text-ink-400 hover:bg-ink-700/60'
              }`}
            >
              {token.name}
            </button>
          ))}
        </div>
      </Section>

      <Section title="字体">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {Object.entries(FONT_STACK).map(([key, stack]) => (
              <button
                key={key}
                onClick={() => patchData({ fontFamily: stack }, '更换字体')}
                className={`rounded-lg px-2 py-1 text-[10px] transition-colors ${
                  element.data.fontFamily === stack
                    ? 'bg-ink-700 text-ink-100'
                    : 'bg-ink-800/50 text-ink-400 hover:bg-ink-700/60'
                }`}
              >
                {fontLabel(key)}
              </button>
            ))}
          </div>

          <FontSizeRow
            value={element.data.fontSize}
            onChange={(value) => patchData({ fontSize: value }, '修改字号')}
          />

          <div className="flex gap-1.5">
            <button
              onClick={() =>
                patchData({ fontWeight: element.data.fontWeight >= 600 ? 400 : 700 }, '切换粗细')
              }
              className={`flex h-7 flex-1 items-center justify-center rounded-lg transition-colors ${
                element.data.fontWeight >= 600 ? 'bg-ink-700 text-ink-100' : 'bg-ink-800/50 text-ink-400'
              }`}
              title="粗体"
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => patchData({ italic: !element.data.italic }, '切换斜体')}
              className={`flex h-7 flex-1 items-center justify-center rounded-lg transition-colors ${
                element.data.italic ? 'bg-ink-700 text-ink-100' : 'bg-ink-800/50 text-ink-400'
              }`}
              title="斜体"
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
            {(
              [
                ['left', AlignLeft],
                ['center', AlignCenter],
                ['right', AlignRight],
              ] as const
            ).map(([value, Icon]) => (
              <button
                key={value}
                onClick={() => patchData({ align: value }, '修改对齐')}
                className={`flex h-7 flex-1 items-center justify-center rounded-lg transition-colors ${
                  element.data.align === value ? 'bg-ink-700 text-ink-100' : 'bg-ink-800/50 text-ink-400'
                }`}
                title={`对齐：${value}`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>

          <SliderField
            label="行距"
            value={element.data.lineHeight}
            min={1}
            max={3}
            step={0.05}
            onChange={(value) => patchData({ lineHeight: value }, '修改行距')}
          />
          <SliderField
            label="字距"
            value={element.data.letterSpacing}
            min={-2}
            max={12}
            step={0.5}
            onChange={(value) => patchData({ letterSpacing: value }, '修改字距')}
          />
        </div>
      </Section>

      <Section title="颜色">
        <ColorRow
          value={element.data.color}
          onChange={(value) => patchData({ color: value }, '修改文字颜色')}
        />
        <button
          onClick={() => {
            // 真正按内容量一次文字宽度（原来只是 width + 60，名不副实）
            const measured = measureTextWidth(element.data)
            updateSelected(
              (e) => ({ ...e, width: Math.max(48, Math.ceil(measured) + 16) }),
              '适应文字宽度',
            )
          }}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink-800/50 py-1.5 text-[10px] text-ink-400 transition-colors hover:bg-ink-700/60 hover:text-ink-200"
        >
          <RotateCcw className="h-3 w-3" />
          适应文字宽度
        </button>
      </Section>
    </>
  )
}

/** 用 canvas 量一次文字宽度，用于「适应文字宽度」 */
function measureTextWidth(data: TextElement['data']): number {
  const lines = data.text.split('\n')
  const font = `${data.italic ? 'italic ' : ''}${data.fontWeight} ${data.fontSize}px ${data.fontFamily}`
  if (typeof document === 'undefined') {
    // SSR / 无 DOM 环境下的保守估计：按字号估算平均字宽
    const longest = lines.reduce((max, line) => Math.max(max, line.length), 0)
    return longest * data.fontSize
  }
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return data.fontSize * 10
  ctx.font = font
  let widest = 0
  for (const line of lines) {
    const spacing = data.letterSpacing * Math.max(1, line.length - 1)
    widest = Math.max(widest, ctx.measureText(line).width + spacing)
  }
  return widest
}

function NoteSettings({ element, patchData }: { element: NoteElement; patchData: PatchData }) {
  const variants: Array<[NoteElement['data']['variant'], string, string]> = [
    ['sticky', '便利贴', '#f6e7a8'],
    ['kraft', '牛皮纸', '#e3d0ae'],
    ['lined', '横线纸', '#fbf7ec'],
    ['plain', '素纸', '#f4f1e8'],
    ['torn', '撕纸', '#f0e9db'],
  ]
  return (
    <>
      <Section title="内容">
        <textarea
          value={element.data.text}
          onChange={(e) => patchData({ text: e.target.value }, '编辑便签')}
          rows={3}
          className="field resize-none text-xs leading-relaxed"
        />
      </Section>
      <Section title="便签类型">
        <div className="flex flex-wrap gap-1">
          {variants.map(([value, label, bg]) => (
            <button
              key={value}
              onClick={() => patchData({ variant: value, background: bg }, '更换便签')}
              className={`rounded-lg px-2 py-1 text-[10px] transition-colors ${
                element.data.variant === value
                  ? 'bg-ink-700 text-ink-100'
                  : 'bg-ink-800/50 text-ink-400 hover:bg-ink-700/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="排印">
        <FontSizeRow
          value={element.data.fontSize}
          onChange={(value) => patchData({ fontSize: value }, '修改字号')}
        />
        <div className="mt-2">
          <ColorRow
            label="纸色"
            value={element.data.background}
            onChange={(value) => patchData({ background: value }, '修改便签底色')}
          />
        </div>
        <div className="mt-2">
          <ColorRow
            label="字色"
            value={element.data.color}
            onChange={(value) => patchData({ color: value }, '修改便签字色')}
          />
        </div>
      </Section>
    </>
  )
}

function StickerSettings({
  element,
  patchData,
}: {
  element: Extract<AlbumElement, { kind: 'sticker' }>
  patchData: PatchData
}) {
  return (
    <Section title="贴纸">
      <div className="space-y-2">
        <div className="text-[10px] text-ink-500">
          {element.data.render === 'svg' ? '矢量贴纸可自由换色' : '字形贴纸（emoji）'}
        </div>
        {element.data.render === 'svg' && (
          <ColorRow
            label="颜色"
            value={element.data.tint ?? '#cccccc'}
            onChange={(value) => patchData({ tint: value }, '修改贴纸颜色')}
          />
        )}
      </div>
    </Section>
  )
}

function StampSettings({ element, patchData }: { element: StampElement; patchData: PatchData }) {
  return (
    <>
      <Section title="印章文字">
        <div className="space-y-2">
          <input
            value={element.data.text}
            onChange={(e) => patchData({ text: e.target.value }, '修改印章文字')}
            placeholder="主文字"
            className="field !py-1.5 text-xs"
          />
          <input
            value={element.data.subText ?? ''}
            onChange={(e) => patchData({ subText: e.target.value }, '修改印章副文字')}
            placeholder="副文字（小字）"
            className="field !py-1.5 text-xs"
          />
        </div>
      </Section>
      <Section title="样式">
        <div className="space-y-2">
          <div className="flex gap-1">
            {(
              [
                ['circle', '圆形'],
                ['rect', '方形'],
                ['oval', '椭圆'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => patchData({ shape: value }, '修改印章形状')}
                className={`flex-1 rounded-lg px-2 py-1 text-[10px] transition-colors ${
                  element.data.shape === value
                    ? 'bg-ink-700 text-ink-100'
                    : 'bg-ink-800/50 text-ink-400 hover:bg-ink-700/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <SliderField
            label="做旧"
            value={Math.round(element.data.distress * 100)}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(value) => patchData({ distress: value / 100 }, '调整做旧')}
          />
          <ColorRow
            value={element.data.color}
            onChange={(value) => patchData({ color: value }, '修改印章颜色')}
          />
        </div>
      </Section>
    </>
  )
}

function ShapeSettings({ element, patchData }: { element: ShapeElement; patchData: PatchData }) {
  return (
    <Section title="形状">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {(
            [
              ['rect', '矩形'],
              ['ellipse', '椭圆'],
              ['line', '直线'],
              ['arrow', '箭头'],
              ['highlight', '荧光'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => patchData({ shape: value }, '修改形状')}
              className={`rounded-lg px-2 py-1 text-[10px] transition-colors ${
                element.data.shape === value
                  ? 'bg-ink-700 text-ink-100'
                  : 'bg-ink-800/50 text-ink-400 hover:bg-ink-700/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <ColorRow
          label="描边"
          value={element.data.stroke}
          onChange={(value) => patchData({ stroke: value }, '修改描边色')}
        />
        <ColorRow
          label="填充"
          value={element.data.fill === 'transparent' ? '#ffffff' : element.data.fill}
          onChange={(value) => patchData({ fill: value }, '修改填充色')}
        />
        <button
          onClick={() => patchData({ fill: 'transparent' }, '清除填充')}
          className="w-full rounded-lg bg-ink-800/50 py-1.5 text-[10px] text-ink-400 hover:bg-ink-700/60"
        >
          透明填充
        </button>
        <SliderField
          label="线宽"
          value={element.data.strokeWidth}
          min={0.5}
          max={12}
          step={0.5}
          onChange={(value) => patchData({ strokeWidth: value }, '修改线宽')}
        />
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ *
 * 基础控件
 * ------------------------------------------------------------------ */

function EmptyInspector() {
  const album = useEditorStore((state) => state.album)
  const activePageId = useEditorStore((state) => state.activePageId)
  const page = album?.pages.find((p) => p.id === activePageId)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/[0.06] px-3 py-2.5">
        <div className="text-[11px] text-ink-200">属性</div>
        <div className="text-[9px] text-ink-600">未选中任何元素</div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-ink-700 bg-ink-850/60 text-ink-500">
          ◇
        </div>
        <p className="text-[11px] leading-relaxed text-ink-500">
          点击页面上的元素来编辑它的位置、大小、旋转与样式
        </p>
        {page && (
          <p className="mt-2 text-[10px] leading-relaxed text-ink-600">
            当前页「{page.title}」共 {page.elements.length} 个元素
          </p>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] tracking-wider text-ink-500">{title}</div>
      {children}
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}) {
  /**
   * 输入过程中保留用户自己敲的字符串。
   *
   * 不能把 `Number(event.target.value)` 直接写回 store：`Number('')` 是 0，
   * 于是「清空输入框准备重打」会让元素瞬间跳到 0；中间态字符串（比如
   * 只敲了一个 `-`）也会被当成合法数字。这里只在能解析时才上报，
   * 并在失焦时把输入框恢复成真实值。
   */
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(Math.round(value))

  return (
    <label className="flex items-center gap-1.5 rounded-lg bg-ink-800/50 px-2 py-1">
      <span className="w-3 shrink-0 text-[10px] text-ink-500">{label}</span>
      <input
        type="number"
        value={shown}
        min={min}
        max={max}
        onChange={(event) => {
          const raw = event.target.value
          if (raw.trim() === '') {
            setDraft(raw)
            return
          }
          const next = Number(raw)
          if (!Number.isFinite(next)) {
            setDraft(raw)
            return
          }
          setDraft(raw)
          onChange(next)
        }}
        onBlur={() => setDraft(null)}
        className="w-full min-w-0 bg-transparent text-right text-[11px] text-ink-100 outline-none"
      />
    </label>
  )
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  onReset,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
  onReset?: () => void
}) {
  // input[type=range] 需要一个可访问名，否则读屏软件只会念「滑块」
  const inputId = `slider-${label}`
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={inputId} className="text-[10px] text-ink-500">
          {label}
        </label>
        <span className="flex items-center gap-1">
          <span className="text-[10px] tabular-nums text-ink-400">
            {Number.isInteger(value) ? value : value.toFixed(2)}
            {suffix}
          </span>
          {onReset && value !== 0 && (
            <button
              className="text-ink-600 transition-colors hover:text-ink-300"
              onClick={onReset}
              title="重置"
            >
              <RotateCcw className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      {label && <div className="mb-1 text-[10px] text-ink-500">{label}</div>}
      <div className="flex items-center gap-1.5">
        <label
          className="relative h-6 w-6 shrink-0 overflow-hidden rounded-md border border-white/15"
          title={`${label ?? '颜色'}：${value}`}
        >
          <span className="absolute inset-0" style={{ backgroundColor: value }} />
          <input
            type="color"
            value={value.startsWith('#') ? value : '#000000'}
            aria-label={`${label ?? '颜色'}（当前 ${value}）`}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {COLOR_SWATCHES.slice(0, 9).map((swatch) => (
            <button
              key={swatch}
              onClick={() => onChange(swatch)}
              className="h-4 w-4 rounded-full border border-white/15 transition-transform hover:scale-110"
              style={{ backgroundColor: swatch }}
              title={swatch}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function FontSizeRow({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] text-ink-500">字号</span>
        <span className="text-[10px] tabular-nums text-ink-400">{value}</span>
      </div>
      <input
        type="range"
        min={8}
        max={96}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
  disabled,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? 'text-ink-400 hover:bg-clay-600 hover:text-white'
          : 'text-ink-400 hover:bg-ink-700 hover:text-ink-100'
      }`}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function LayerBtn({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      className="flex h-8 items-center justify-center rounded-lg bg-ink-800/60 text-ink-400 transition-colors hover:bg-ink-700 hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-ink-800/60"
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function kindLabel(kind: ElementKind): string {
  const map: Record<ElementKind, string> = {
    photo: '照片',
    text: '文字',
    sticker: '贴纸',
    note: '便签',
    stamp: '印章',
    date: '日期',
    map: '地图',
    shape: '形状',
  }
  return map[kind] ?? '元素'
}

function fontLabel(key: string): string {
  switch (key) {
    case 'serif':
      return '宋体'
    case 'sans':
      return '黑体'
    case 'hand':
      return '手写'
    case 'handen':
      return '英文手写'
    case 'mono':
      return '等宽'
    default:
      return key
  }
}
