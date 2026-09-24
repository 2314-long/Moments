import { useCallback, useRef, useState } from 'react'
import { ImagePlus, Loader2 } from 'lucide-react'
import { ACCEPT_ATTR, isAcceptedImage } from '@/storage/upload'

/**
 * 拖拽 / 点击上传区。
 *
 * 交互要求：拖入照片要出现明确的拖拽预览与高亮反馈，
 * 上传要能看到进度。这里把这些状态都做成可见的视觉反馈。
 */

export interface DropZoneProps {
  onFiles: (files: File[]) => void
  /** 上传进度 0..1，null 表示空闲 */
  progress?: number | null
  currentName?: string
  disabled?: boolean
  compact?: boolean
  label?: string
  hint?: string
}

export function DropZone({
  onFiles,
  progress = null,
  currentName,
  disabled = false,
  compact = false,
  label = '点击或拖拽照片到这里',
  hint = '支持 JPG / PNG / WEBP / HEIC，可多选',
}: DropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || disabled) return
      const files = Array.from(list).filter(isAcceptedImage)
      if (files.length) onFiles(files)
    },
    [disabled, onFiles],
  )

  const uploading = progress !== null && progress !== undefined

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-200 ${
        dragging
          ? 'border-clay-500 bg-clay-600/10'
          : 'border-ink-700 bg-ink-850/40 hover:border-ink-600 hover:bg-ink-800/50'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      style={{ padding: compact ? '18px 16px' : '38px 24px' }}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault()
        if (disabled) return
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        dragDepth.current -= 1
        if (dragDepth.current <= 0) {
          dragDepth.current = 0
          setDragging(false)
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />

      <div className="flex flex-col items-center gap-2 text-center">
        <div
          className={`flex items-center justify-center rounded-xl transition-all ${
            dragging ? 'scale-110 bg-clay-500/25' : 'bg-ink-700/60'
          } ${compact ? 'h-8 w-8' : 'h-11 w-11'}`}
        >
          {uploading ? (
            <Loader2 className={`animate-spin text-ink-200 ${compact ? 'h-4 w-4' : 'h-5 w-5'}`} />
          ) : (
            <ImagePlus className={`text-ink-300 ${compact ? 'h-4 w-4' : 'h-5 w-5'}`} />
          )}
        </div>

        {uploading ? (
          <div className="w-full max-w-xs">
            <div className="text-xs text-ink-200">正在上传… {Math.round(progress * 100)}%</div>
            {currentName && (
              <div className="mt-0.5 truncate text-[10px] text-ink-500">{currentName}</div>
            )}
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ink-700">
              <div
                className="h-full rounded-full bg-clay-500 transition-all duration-200"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <div className={`text-ink-200 ${compact ? 'text-xs' : 'text-sm'}`}>{label}</div>
            <div className="text-[11px] text-ink-500">{hint}</div>
          </>
        )}
      </div>

      {/* 拖拽时的斜纹覆盖，强化「可以放下」的暗示 */}
      {dragging && (
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(194,96,63,0.25) 0 10px, transparent 10px 20px)',
          }}
        />
      )}
    </div>
  )
}
