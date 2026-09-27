import {
  Image as ImageIcon,
  StickyNote,
  Type,
  Stamp,
  CalendarDays,
  Map as MapIcon,
  Shapes,
  Sparkles,
  Smile,
} from 'lucide-react'
import { useEditorStore, type LeftPanel } from '@/store/editorStore'
import { TEXT_PRESET_LIST } from '@/lib/designTokens'

/**
 * 左侧「插入」面板。
 *
 * 这里是创作入口：把一个空白页面变成一个有内容的手账页。
 * 每个条目都是「点一下就出现」的直接操作，不做多余的二次确认。
 */

export function InsertPanel({ onSwitch }: { onSwitch: (panel: LeftPanel) => void }) {
  const addTextElement = useEditorStore((state) => state.addTextElement)
  const addArtTextElement = useEditorStore((state) => state.addArtTextElement)
  const addNoteElement = useEditorStore((state) => state.addNoteElement)
  const addStampElement = useEditorStore((state) => state.addStampElement)
  const addDateElement = useEditorStore((state) => state.addDateElement)
  const addMapElement = useEditorStore((state) => state.addMapElement)
  const addStickerElement = useEditorStore((state) => state.addStickerElement)

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-3 pb-2 pt-3">
        <div className="mb-2 text-[10px] tracking-wider text-ink-500">添加到当前页</div>
        <div className="grid grid-cols-2 gap-1.5">
          <ToolTile icon={<ImageIcon className="h-4 w-4" />} label="照片" onClick={() => onSwitch('photos')} />
          <ToolTile icon={<Sparkles className="h-4 w-4" />} label="艺术字" onClick={() => addArtTextElement()} />
          <ToolTile icon={<Smile className="h-4 w-4" />} label="贴纸" onClick={() => onSwitch('stickers')} />
          <ToolTile
            icon={<StickyNote className="h-4 w-4" />}
            label="便签"
            onClick={() => addNoteElement()}
          />
          <ToolTile icon={<Stamp className="h-4 w-4" />} label="印章" onClick={() => addStampElement()} />
          <ToolTile
            icon={<CalendarDays className="h-4 w-4" />}
            label="日期"
            onClick={() => addDateElement()}
          />
          <ToolTile icon={<MapIcon className="h-4 w-4" />} label="地图" onClick={() => addMapElement()} />
        </div>
      </div>

      <div className="px-3 pb-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] tracking-wider text-ink-500">
          <Type className="h-3 w-3" />
          文字
        </div>
        <div className="space-y-1">
          {TEXT_PRESET_LIST.map((token) => (
            <button
              key={token.id}
              onClick={() => addTextElement(token.id)}
              className="group flex w-full items-center justify-between gap-2 rounded-xl bg-ink-800/50 px-2.5 py-2 text-left transition-colors hover:bg-ink-700/70"
            >
              <span className="min-w-0">
                <span className="block text-[11px] text-ink-200">{token.name}</span>
                <span
                  className="block truncate text-[10px] text-ink-500"
                  style={{ fontFamily: fontPreview(token.fontFamily) }}
                >
                  {token.placeholder}
                </span>
              </span>
              <span className="shrink-0 text-[15px] leading-none text-ink-500" style={{ fontFamily: fontPreview(token.fontFamily) }}>
                字
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 pb-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] tracking-wider text-ink-500">
          <Sparkles className="h-3 w-3" />
          快速贴纸
        </div>
        <div className="flex flex-wrap gap-1">
          {['tape-washi-warm', 'stamp-postage', 'clip-paper', 'pin-round', 'travel-ticket', 'line-underline'].map(
            (id) => (
              <button
                key={id}
                onClick={() => addStickerElement(id)}
                className="rounded-lg bg-ink-800/60 px-2 py-1 text-[10px] text-ink-400 transition-colors hover:bg-ink-700 hover:text-ink-100"
              >
                {stickerName(id)}
              </button>
            ),
          )}
          <button
            onClick={() => onSwitch('stickers')}
            className="rounded-lg bg-ink-800/60 px-2 py-1 text-[10px] text-ink-400 transition-colors hover:bg-ink-700 hover:text-ink-100"
          >
            全部 ›
          </button>
        </div>
      </div>

      <div className="mt-auto px-3 pb-3">
        <div className="rounded-xl bg-ink-800/40 p-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] text-ink-400">
            <Shapes className="h-3 w-3" />
            小技巧
          </div>
          <ul className="space-y-1 text-[10px] leading-relaxed text-ink-600">
            <li>· 选中元素后按 Alt 拖拽 = 复制一份</li>
            <li>· 拖拽时按住 Alt 可临时关闭对齐吸附</li>
            <li>· Shift 缩放手柄 = 保持比例</li>
            <li>· 双击文字 / 便签可直接改内容</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function ToolTile({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl bg-ink-800/50 px-2 py-3 text-[11px] text-ink-300 transition-all hover:bg-ink-700/70 hover:text-ink-100 active:scale-[0.97]"
    >
      <span className="text-ink-400">{icon}</span>
      {label}
    </button>
  )
}

function fontPreview(key: string): string {
  switch (key) {
    case 'serif':
      return '"Noto Serif SC", "Songti SC", serif'
    case 'hand':
      return '"Ma Shan Zheng", "LXGW WenKai", KaiTi, cursive'
    case 'handen':
      return '"Caveat", cursive'
    case 'mono':
      return '"JetBrains Mono", monospace'
    default:
      return '"Inter", "PingFang SC", sans-serif'
  }
}

function stickerName(id: string): string {
  const map: Record<string, string> = {
    'tape-washi-warm': '和纸胶带',
    'stamp-postage': '邮票',
    'clip-paper': '回形针',
    'pin-round': '图钉',
    'travel-ticket': '票根',
    'line-underline': '手绘线',
  }
  return map[id] ?? id
}
