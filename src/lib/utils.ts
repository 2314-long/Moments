/** 通用小工具：数组、对象、深拷贝、节流 */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function round(value: number, digits = 1): number {
  const p = 10 ** digits
  return Math.round(value * p) / p
}

export function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}

export function groupBy<T, K extends string>(
  items: T[],
  keyFn: (item: T) => K,
): Record<K, T[]> {
  const out = {} as Record<K, T[]>
  for (const item of items) {
    const key = keyFn(item)
    ;(out[key] ||= []).push(item)
  }
  return out
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** 结构化深拷贝。仅用于跨越 store 边界的纯数据（不含 Blob / 函数） */
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {
      /* 回退到 JSON */
    }
  }
  return JSON.parse(JSON.stringify(value)) as T
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice()
  const [item] = next.splice(from, 1)
  if (item === undefined) return items
  next.splice(to, 0, item)
  return next
}

export function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
): (...args: A) => void {
  let last = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null
  return (...args: A) => {
    const now = Date.now()
    const remaining = wait - (now - last)
    pending = args
    if (remaining <= 0) {
      last = now
      fn(...args)
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null
        last = Date.now()
        if (pending) fn(...pending)
      }, remaining)
    }
  }
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
): ((...args: A) => void) & { flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null
  const wrapped = (...args: A) => {
    pending = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (pending) fn(...pending)
    }, wait)
  }
  wrapped.flush = () => {
    if (timer) clearTimeout(timer)
    timer = null
    if (pending) fn(...pending)
  }
  return wrapped
}
