import { useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { StickerSvg } from '@/components/stickers/StickerSvg'
import {
  STICKER_CATEGORIES,
  STICKER_CATEGORY_LABEL,
  STICKER_LIBRARY,
} from '@/lib/stickerLibrary'
import { writePayload } from '@/components/editor/useCanvasDrop'
import type { StickerCategory } from '@/types/album'

/**
 * 贴纸面板。
 *
 * 贴纸刻意保持克制：只有会真正用到的那些。
 * 支持点击添加与拖拽落点两种方式。
 */
export function StickerPanel() {
  const addStickerElement = useEditorStore((state) => state.addStickerElement)
  const [category, setCategory] = useState<StickerCategory>('tape')

  const list = STICKER_LIBRARY.filter((sticker) => sticker.category === category)

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pt-3">
        <div className="mb-2 text-[10px] tracking-wider text-ink-500">分类</div>
        <div className="flex flex-wrap gap-1">
          {STICKER_CATEGORIES.map((entry) => (
            <button
              key={entry}
              onClick={() => setCategory(entry)}
              className={`rounded-lg px-2 py-1 text-[10px] transition-colors ${
                category === entry
                  ? 'bg-ink-700 text-ink-100'
                  : 'bg-ink-800/50 text-ink-400 hover:bg-ink-700/60 hover:text-ink-200'
              }`}
            >
              {STICKER_CATEGORY_LABEL[entry]}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="grid grid-cols-2 gap-2">
          {list.map((sticker) => (
            <button
              key={sticker.id}
              draggable
              onDragStart={(event) =>
                writePayload(event, {
                  kind: 'sticker',
                  stickerId: sticker.id,
                  width: sticker.width,
                  height: sticker.height,
                  label: sticker.name,
                })
              }
              onClick={() => addStickerElement(sticker.id)}
              title={`${sticker.name}（可拖拽到页面）`}
              className="group flex flex-col items-center gap-1.5 rounded-xl bg-ink-800/45 p-2.5 transition-all hover:bg-ink-700/60 active:scale-[0.97]"
            >
              <span className="flex h-12 w-full items-center justify-center">
                {sticker.render === 'svg' && sticker.svgId ? (
                  <span className="block h-full w-full max-w-[76px]">
                    <StickerSvg svgId={sticker.svgId} tint={sticker.tint} uid={`lib-${sticker.id}`} />
                  </span>
                ) : (
                  <span style={{ fontSize: 28, lineHeight: 1 }}>{sticker.glyph}</span>
                )}
              </span>
              <span className="truncate text-[10px] text-ink-400 group-hover:text-ink-200">
                {sticker.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/[0.06] px-3 py-2 text-[10px] leading-relaxed text-ink-600">
        拖拽贴纸到页面上可以精确控制落点；点一下则添加到页面中央。
      </div>
    </div>
  )
}
