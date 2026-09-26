/** 通用小工具：深拷贝、节流 */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function round(value: number, digits = 1): number {
  const p = 10 ** digits
  return Math.round(value * p) / p
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
    if (pending) {
      fn(...pending)
      // 落盘之后清掉待写内容，否则每次卸载都会把同一份数据再写一遍
      pending = null
    }
  }
  return wrapped
}
