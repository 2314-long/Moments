import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  CheckSquare,
  Grid3x3,
  LayoutGrid,
  MapPin,
  Square,
  Trash2,
  Upload,
} from 'lucide-react'
import { usePhotoStore } from '@/store/photoStore'
import { useLibraryStore } from '@/store/libraryStore'
import { deletePhoto, uploadPhotos } from '@/services/uploadService'
import { DropZone } from '@/components/upload/DropZone'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Toast, useToast } from '@/components/ui/Toast'
import { ACCEPT_ATTR } from '@/storage/upload'

/**
 * 我的照片素材库。
 *
 * 这是「把照片先攒起来，再慢慢做成册子」的入口，
 * 因此重点是快速浏览与筛选，而不是编辑。
 */
export function PhotoLibraryPage() {
  const assets = usePhotoStore((state) => state.assets)
  const { toast, show } = useToast()

  const [progress, setProgress] = useState<{ value: number; name: string } | null>(null)
  const [scope, setScope] = useState<'all' | 'uploaded'>('all')
  const [density, setDensity] = useState<'cozy' | 'compact'>('cozy')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(
    () => assets.filter((asset) => (scope === 'uploaded' ? asset.source !== 'demo' : true)),
    [assets, scope],
  )

  const totalSize = useMemo(
    () => assets.reduce((sum, asset) => sum + (asset.size ?? 0), 0),
    [assets],
  )

  async function handleUpload(files: File[]) {
    setProgress({ value: 0, name: files[0]?.name ?? '' })
    try {
      const result = await uploadPhotos(files, (p) =>
        setProgress({ value: p.total ? p.done / p.total : 0, name: p.current }),
      )
      if (result.assets.length) show(`已添加 ${result.assets.length} 张照片`, { tone: 'success' })
      if (result.failed.length) show(`${result.failed.length} 张照片读取失败`, { tone: 'error' })
    } finally {
      setProgress(null)
    }
  }

  async function handleDeleteSelected() {
    let affectedAlbums = 0
    for (const id of selected) {
      affectedAlbums += await deletePhoto(id)
    }
    show(
      affectedAlbums
        ? `已删除 ${selected.length} 张照片，并清理了 ${affectedAlbums} 本纪念册里的引用`
        : `已删除 ${selected.length} 张照片`,
    )
    setSelected([])
    setSelecting(false)
    setConfirmDelete(false)
  }

  /**
   * 删除单张照片。
   *
   * 之前这里既没有确认、键盘路径也没有任何提示，而且照片可能正被某本
   * 纪念册使用 —— 删掉之后那些页面只会渲染成灰底占位图。现在先告诉用户
   * 有哪些册子在用，并在删除后如实报告清理结果。
   */
  async function handleDeleteOne(photoId: string) {
    const users = useLibraryStore
      .getState()
      .albums.filter(
        (album) =>
          album.photoIds.includes(photoId) ||
          album.pages.some((page) =>
            page.elements.some(
              (element) =>
                element.kind === 'photo' &&
                (element.data as { photoId?: string }).photoId === photoId,
            ),
          ),
      )
    if (users.length) {
      const names = users.slice(0, 3).map((a) => `《${a.title}》`).join('、')
      const more = users.length > 3 ? ` 等 ${users.length} 本` : ''
      const ok = window.confirm(
        `这张照片正在被 ${names}${more} 使用。\n删除后这些页面上的照片会被一并移除，无法恢复。确定删除吗？`,
      )
      if (!ok) return
    }
    const affected = await deletePhoto(photoId)
    show(
      affected ? `已删除照片，并清理了 ${affected} 本纪念册里的引用` : '已删除照片',
      { tone: affected ? 'success' : 'default' },
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 px-6 py-4">
        <Link to="/" className="tool-btn h-9 w-9" title="返回书架">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="leading-tight">
          <div className="text-sm text-ink-100">我的照片素材库</div>
          <div className="text-[10px] text-ink-500">
            {assets.length} 张照片
            {totalSize > 0 ? ` · 本地上传约 ${(totalSize / 1024 / 1024).toFixed(1)} MB` : ''}
          </div>
        </div>

        <div className="flex-1" />

        <div className="hidden items-center gap-1 sm:flex">
          <button
            className="tool-btn h-8 w-8"
            data-active={scope === 'all'}
            onClick={() => setScope('all')}
            title="全部照片"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            className="tool-btn h-8 w-8"
            data-active={scope === 'uploaded'}
            onClick={() => setScope('uploaded')}
            title="只看我上传的"
          >
            <Upload className="h-4 w-4" />
          </button>
          <button
            className="tool-btn h-8 w-8"
            onClick={() => setDensity(density === 'cozy' ? 'compact' : 'cozy')}
            title="切换密度"
          >
            <Grid3x3 className="h-4 w-4" />
          </button>
        </div>

        <button
          className={`btn-ghost !py-1.5 !text-xs ${selecting ? '!text-clay-400' : ''}`}
          onClick={() => {
            setSelecting((value) => !value)
            setSelected([])
          }}
        >
          {selecting ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          {selecting ? '退出多选' : '多选'}
        </button>

        <button className="btn-primary !py-1.5 !text-xs" onClick={() => inputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />
          上传照片
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-6 pb-10">
        <div className="mx-auto max-w-[1500px]">
          <DropZone
            onFiles={(files) => void handleUpload(files)}
            progress={progress ? progress.value : null}
            currentName={progress?.name}
            compact
            label="拖拽照片到这里，或点击选择"
          />

          {selecting && selected.length > 0 && (
            <div className="sticky top-0 z-10 mt-4 flex items-center gap-3 rounded-xl bg-ink-800/95 px-3.5 py-2 backdrop-blur">
              <span className="text-xs text-ink-200">已选中 {selected.length} 张</span>
              <div className="flex-1" />
              <button
                className="btn bg-clay-600 !py-1 !text-xs text-white hover:bg-clay-500"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            </div>
          )}

          <div
            className={`mt-4 grid gap-2 ${
              density === 'cozy'
                ? 'grid-cols-[repeat(auto-fill,minmax(150px,1fr))]'
                : 'grid-cols-[repeat(auto-fill,minmax(104px,1fr))]'
            }`}
          >
            {filtered.map((asset) => {
              const isSelected = selected.includes(asset.id)
              return (
                // 用 div 承载定位，删除按钮是它的兄弟节点而不是嵌套在
                // <button> 里（嵌套交互元素在 ARIA 上是非法的，键盘也会错乱）
                <div
                  key={asset.id}
                  className={`group relative overflow-hidden rounded-xl bg-ink-800 text-left transition-all ${
                    isSelected ? 'ring-2 ring-clay-500' : 'ring-1 ring-white/[0.06] hover:ring-white/20'
                  }`}
                  style={{ aspectRatio: '1 / 1' }}
                >
                  <button
                    className="absolute inset-0 h-full w-full"
                    onClick={() => {
                      if (!selecting) return
                      setSelected((prev) =>
                        prev.includes(asset.id)
                          ? prev.filter((id) => id !== asset.id)
                          : [...prev, asset.id],
                      )
                    }}
                    aria-label={asset.name ?? '未命名照片'}
                  >
                    <img
                      src={asset.url}
                      alt={asset.name ?? ''}
                      loading="lazy"
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                  </button>

                  {/* 信息条 */}
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/75 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="truncate text-[10px] text-white/90">{asset.name ?? '未命名'}</span>
                    <span className="flex items-center gap-1 text-[9px] text-white/60">
                      {asset.location?.name && (
                        <>
                          <MapPin className="h-2.5 w-2.5" />
                          {asset.location.name}
                        </>
                      )}
                      {asset.takenAt && <span>{asset.takenAt.slice(0, 10)}</span>}
                    </span>
                  </span>

                  {isSelected && (
                    <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-clay-500">
                      <CheckSquare className="h-3 w-3 text-white" />
                    </span>
                  )}

                  {!selecting && asset.source !== 'demo' && (
                    <button
                      type="button"
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-ink-900/80 text-ink-300 opacity-0 transition-all hover:bg-clay-600 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
                      onClick={() => {
                        void handleDeleteOne(asset.id)
                      }}
                      title="删除这张照片"
                      aria-label={`删除照片 ${asset.name ?? ''}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}

                  {asset.source === 'demo' && (
                    <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-ink-900/75 px-1.5 py-0.5 text-[8px] text-ink-400">
                      示例
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {filtered.length === 0 && (
            <div className="py-16 text-center text-xs text-ink-500">
              {scope === 'uploaded' ? '还没有上传过照片' : '素材库是空的'}
            </div>
          )}
        </div>
      </main>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          if (files.length) void handleUpload(files)
          event.target.value = ''
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`删除选中的 ${selected.length} 张照片？`}
        description="照片会从素材库和本机存储中移除。已经放进纪念册的页面会失去这张图片。"
        confirmText="删除"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void handleDeleteSelected()}
      />

      <Toast toast={toast} />
    </div>
  )
}
