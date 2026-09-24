import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'

/**
 * 轻量 Toast。
 *
 * 交互细节要求「保存 → 显示已保存」「删除 → 支持撤销」，
 * 因此这里刻意做得足够显眼但克制：底部居中、自动消失、可撤销。
 */

export interface ToastState {
  id: number
  message: string
  tone: 'default' | 'success' | 'error'
  action?: { label: string; run: () => void }
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const counter = useRef(0)

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const show = useCallback(
    (message: string, options?: { tone?: ToastState['tone']; action?: ToastState['action']; duration?: number }) => {
      clear()
      counter.current += 1
      setToast({
        id: counter.current,
        message,
        tone: options?.tone ?? 'default',
        action: options?.action,
      })
      timer.current = setTimeout(() => setToast(null), options?.duration ?? (options?.action ? 5200 : 2200))
    },
    [clear],
  )

  const dismiss = useCallback(() => {
    clear()
    setToast(null)
  }, [clear])

  useEffect(() => clear, [clear])

  return { toast, show, dismiss }
}

export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-[60] flex justify-center px-4">
      <div
        key={toast.id}
        className="pointer-events-auto flex animate-toast-in items-center gap-3 rounded-full border border-white/10 bg-ink-800/95 py-2 pl-4 pr-2 shadow-2xl backdrop-blur-xl"
      >
        {toast.tone === 'success' && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-moss-600/80">
            <Check className="h-2.5 w-2.5 text-white" />
          </span>
        )}
        {toast.tone === 'error' && <TriangleAlert className="h-4 w-4 text-clay-400" />}
        <span className="text-xs text-ink-100">{toast.message}</span>
        {toast.action && (
          <button
            className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-ink-100 transition-colors hover:bg-white/20"
            onClick={toast.action.run}
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </div>
  )
}
