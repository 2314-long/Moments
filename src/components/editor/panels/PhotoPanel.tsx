import { useRef, useState } from 'react'
import { ImagePlus, Search, Trash2 } from 'lucide-react'
import type { PhotoAsset } from '@/types/album'
import { usePhotoStore } from '@/store/photoStore'
import { useEditorStore } from '@/store/editorStore'
import { deletePhoto, uploadPhotos } from '@/services/uploadService'
import { writePayload } from '@/components/editor/useCanvasDrop'
import { DropZone } from '@/components/upload/DropZone'
import { ACCEPT_ATTR } from '@/storage/upload'
import { PHOTO_STYLE_LIST, PHOTO_STYLES } from '@/lib/designTokens'

/**
 * 照片素材库面板。
 *
 * 两种添加方式都支持：
 *  - 点击缩略图：添加到当前页中央
 *  - 拖拽缩略图到画布：落到指针位置
 */
export function PhotoPanel() {
  const assets = usePhotoStore((state) => state.assets)
  const addPhotoElement = useEditorStore((state) => state.addPhotoElement)
  const activePhotoStyle = useEditorStore((state) => state.activePhotoStyle)
  const setActivePhotoStyle = useEditorStore((state) => state.setActivePhotoStyle)

  const [query, setQuery] = useState('')
  const [progress, setProgress] = useState<{ value: number; name: string } | null>(null)
  const [scope, setScope] = useState<'all' | 'uploaded'>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = assets.filter((asset) => {
    if (scope === 'uploaded' && asset.source === 'demo') return false
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    return (asset.name ?? '').toLowerCase().includes(q) || (asset.location?.name ?? '').toLowerCase().includes(q)
  })

  async function handleUpload(files: File[]) {
    setProgress({ value: 0, name: files[0]?.name ?? '' })
    try {
      await uploadPhotos(files, (p) =>
        setProgress({ value: p.total ? p.done / p.total : 0, name: p.current }),
      )
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-2.5 px-3 pb-2.5">
        <DropZone
          compact
          onFiles={(files) => void handleUpload(files)}
          progress={progress ? progress.value : null}
          currentName={progress?.name}
          label="上传照片"
          hint="或拖到画布上任意位置"
        />

        <div className="flex gap-1.5">
          <button
            className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] transition-colors ${
              scope === 'all' ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:bg-ink-800'
            }`}
            onClick={() => setScope('all')}
          >
            全部 {assets.length}
          </button>
          <button
            className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] transition-colors ${
              scope === 'uploaded' ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:bg-ink-800'
            }`}
            onClick={() => setScope('uploaded')}
          >
            我上传的 {assets.filter((a) => a.source !== 'demo').length}
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索照片"
            className="field !py-1.5 pl-8 text-xs"
          />
        </div>

        {/* 照片样式：决定新拖入照片的相框 */}
        <div>
          <div className="mb-1.5 text-[10px] tracking-wider text-ink-500">照片样式</div>
          <div className="flex flex-wrap gap-1">
            {PHOTO_STYLE_LIST.map((token) => (
              <button
                key={token.id}
                title={`${token.name} · ${token.desc}`}
                onClick={() => setActivePhotoStyle(token.id)}
                className={`rounded-lg px-2 py-1 text-[10px] transition-all ${
                  activePhotoStyle === token.id
                    ? 'bg-clay-600/85 text-white'
                    : 'bg-ink-800/70 text-ink-400 hover:bg-ink-700 hover:text-ink-200'
                }`}
              >
                {token.name}
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-[10px] leading-relaxed text-ink-600">
            {PHOTO_STYLES[activePhotoStyle].desc}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <ImagePlus className="h-5 w-5 text-ink-600" />
            <p className="text-[11px] text-ink-500">
              {scope === 'uploaded' ? '还没有上传过照片' : '没有匹配的照片'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {filtered.map((asset) => (
              <PhotoCard
                key={asset.id}
                asset={asset}
                styleName={PHOTO_STYLES[activePhotoStyle].name}
                onAdd={() => addPhotoElement(asset, { style: activePhotoStyle })}
                onDelete={asset.source === 'demo' ? undefined : () => void deletePhoto(asset.id)}
              />
            ))}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length) void handleUpload(files)
            e.target.value = ''
          }}
        />
      </div>

      <div className="shrink-0 border-t border-white/[0.06] px-3 py-2">
        <div className="text-[10px] leading-relaxed text-ink-600">
          提示：拖拽缩略图到页面上，可以精确控制照片落点。
        </div>
      </div>
    </div>
  )
}

function PhotoCard({
  asset,
  styleName,
  onAdd,
  onDelete,
}: {
  asset: PhotoAsset
  styleName: string
  onAdd: () => void
  onDelete?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const ratio = asset.width / Math.max(1, asset.height)

  return (
    <div
      className="group relative"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <button
        draggable
        onDragStart={(event) => {
          // 拖拽进画布时按当前照片样式决定落点尺寸
          const long = 340
          const width = ratio >= 1 ? long : Math.round(long * ratio)
          const height = ratio >= 1 ? Math.round(long / ratio) : long
          writePayload(event, {
            kind: 'photo',
            photoId: asset.id,
            width,
            height,
            label: '照片',
          })
        }}
        onClick={onAdd}
        title={`${asset.name ?? ''} · 点击添加为「${styleName}」`}
        className="relative block w-full overflow-hidden rounded-lg bg-ink-800 transition-all duration-150 hover:ring-2 hover:ring-clay-500/70"
        style={{ aspectRatio: '1 / 1' }}
      >
        <img
          src={asset.url}
          alt={asset.name ?? ''}
          draggable={false}
          loading="lazy"
          className="h-full w-full object-cover"
        />
        {hovered && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/45">
            <span className="text-[10px] font-medium text-white">添加</span>
          </span>
        )}
      </button>

      {onDelete && hovered && (
        <button
          className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-ink-900/85 text-ink-300 transition-colors hover:bg-clay-600 hover:text-white"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title="从素材库删除"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}

      {asset.source === 'local' && (
        <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-ink-900/80 px-1 text-[8px] text-ink-400">
          本地
        </span>
      )}
    </div>
  )
}
