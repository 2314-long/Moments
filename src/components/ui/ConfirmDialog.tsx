import { useEffect, useRef } from 'react'
import { TriangleAlert } from 'lucide-react'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 确认对话框。
 *
 * 键盘处理有两个坑，都在这里修掉了：
 *
 * 1. 之前 window 上无条件 `if (event.key === 'Enter') onConfirm()`，
 *    而 window 上的监听先于按钮的默认激活执行 —— 焦点停在「取消」上按回车，
 *    会**先确认、再取消**，等于误删。现在只在焦点不在按钮上时才用 Enter 确认；
 * 2. 没有对话框语义：补上 role="dialog" + aria-modal，并在打开时把焦点
 *    移进对话框（默认落在「取消」上，危险操作不会一次回车就执行）。
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    // 打开时把焦点移进对话框；危险操作默认聚焦「取消」
    const target = danger ? cancelRef.current : confirmRef.current
    target?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key !== 'Enter') return
      // 焦点已经在某个按钮上时，交给浏览器按按钮自己的语义处理，
      // 不要再无条件确认一次
      const active = document.activeElement
      if (active instanceof HTMLElement && active.tagName === 'BUTTON') return
      event.preventDefault()
      onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel, onConfirm, danger])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div
        className="panel relative w-[380px] animate-pop-in p-5"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex gap-3">
          {danger && (
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-clay-600/25">
              <TriangleAlert className="h-4 w-4 text-clay-400" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-ink-100">{title}</h2>
            {description && (
              <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{description}</p>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} className="btn-ghost" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            className={danger ? 'btn bg-clay-600 text-white hover:bg-clay-500' : 'btn-primary'}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
