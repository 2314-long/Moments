import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react'
import type { Album, Page, PhotoAsset } from '@/types/album'
import { BookSpread, type FlipVisual } from '@/components/book/BookSpread'
import { usePhotosReady } from '@/hooks/usePhotoUrl'
import { usePhotoStore } from '@/store/photoStore'

/**
 * 沉浸式翻阅。
 *
 * ── 架构要点 ──────────────────────────────────────────────────
 *
 * 1. **页面是厚纸板，照片只是纸板上的内容。**
 *    渲染交给 components/book/BookPage：它是一块真正有厚度的长方体
 *    （正面 + 背面 + 四个侧面），不随照片大小变形。
 *
 * 2. **翻页状态机只在动画结束后提交逻辑页号。**
 *       IDLE → FLIPPING → ANIMATION → COMMIT → IDLE
 *    整个动画期间 album 与 spreadIndex 都不变，动画中的 DOM 因此
 *    不会被逻辑状态更新打断 —— 这是「翻完不闪」的前提。
 *
 * 3. **翻动中的纸板是一块真正的双面纸板。**
 *    正面 = 当前页，背面 = 翻过去之后的下一页（同一张纸的两面）。
 *    它始终位于最高层，绕书脊 0 → 180°，中途能看到纸叠侧边立起来。
 *
 * 4. **照片地址在打开阅读器之前就全部解析完**（usePhotosReady）。
 *    否则纸板的正反面各渲染一份时，后挂载的那一份会因为地址还没解析
 *    而先画成灰色占位图 —— 那就是之前「翻页闪一下」的真正原因。
 */

export interface ReaderProps {
  album: Album
  /** 初始页索引 */
  initialIndex?: number
  onIndexChange?: (index: number) => void
}

/** 完整翻页时长。真实纸板翻动需要让人看清「抬起 → 立起 → 越过 → 落下」 */
export const FLIP_DURATION = 900

/* ------------------------------------------------------------------ *
 * 缓动
 * ------------------------------------------------------------------ */

/**
 * 纸板翻动曲线：**首尾速度都必须为 0**。
 *
 * 原意是「起手轻推（慢）→ 加速 → 中段较快 → 接近落下时减速」，
 * 但旧实现 `0.16·t³ + 0.56·t + 0.28·(1−(1−t)^3.6)` 做不到这件事：
 *
 *   · 线性项让 t=1 处的导数是 0.56（不减速）
 *   · easeOut 项在 t=0 处的导数是 1.008（起步也不慢）
 *   · 实测两端导数分别是 1.57 与 1.04 —— 是一条「快—慢—快」的曲线，
 *     和注释里写的意图正好相反。
 *
 * 后果很具体：60fps 下最后一帧只能走到 t≈0.98（纸板约 176.6°），
 * 而「最后一帧 → 落平帧」之间的那 3.4° 会被 perspective 放大 ——
 * 书口侧边缘一帧内平移约 6px，看起来就是「页一落下就动一下」。
 *
 * 换成真正的 S 曲线（`easeInOutCubic`，首尾导数为 0）之后，
 * 最后一帧的进度已经到 0.99997（≈179.99°），那一帧的位移降到 0.01px 级别。
 * 顺带起手也更像「把纸捏起来」，而不是被弹了一下。
 */
const easePageTurn = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

/** 落下时的轻微回落（overshoot 极小，只是让纸「贴」到位而不是砸到位） */
const easeSettle = (t: number): number => {
  const base = easePageTurn(t)
  // 在最后 18% 加一点点回弹，幅度不超过 0.6%
  const settle = Math.sin(t * Math.PI) * 0.006 * (1 - t)
  return Math.min(1, base + settle)
}

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)
const easeReturn = (t: number): number => 1 - Math.pow(1 - t, 2.6)

/** 尊重系统的「减弱动态效果」设置 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** 把页面数组切成「跨页」：奇数页时封面单独一屏 */
function buildSpreads(pages: Page[]): Array<[number | null, number | null]> {
  if (!pages.length) return [[null, null]]
  const spreads: Array<[number | null, number | null]> = []
  let cursor = 0
  if (pages.length % 2 === 1) {
    spreads.push([null, 0])
    cursor = 1
  }
  for (let index = cursor; index < pages.length; index += 2) {
    spreads.push([index, pages[index + 1] === undefined ? null : index + 1])
  }
  return spreads
}

/* ------------------------------------------------------------------ *
 * 翻页状态机
 * ------------------------------------------------------------------ */

type FlipPhase = 'idle' | 'flipping'

interface FlipState {
  direction: 'next' | 'prev'
  /** 0..1 动画进度 */
  progress: number
  /** 起始跨页下标 */
  fromIndex: number
  /** 目标跨页下标 */
  toIndex: number
  phase: FlipPhase
}

/**
 * 翻页驱动。
 *
 * `committed` 只有在动画完全结束后才更新 —— commit 时机是
 * 状态机里最容易被忽略、却直接决定「会不会闪」的一环。
 */
function useFlipDriver(options: {
  spreadCount: number
  spreadIndex: number
  onCommit: (spreadIndex: number) => void
  reducedMotion: boolean
}) {
  const { spreadCount, spreadIndex, onCommit, reducedMotion } = options
  const [flip, setFlip] = useState<FlipState | null>(null)
  const [dragging, setDragging] = useState(false)

  const rafRef = useRef<number | null>(null)
  const busyRef = useRef(false)
  const dragRef = useRef<{ direction: 'next' | 'prev'; progress: number } | null>(null)
  /** 当前纸叶状态的可读副本，供 rAF 回调读取（避免闭包读到过期值） */
  const flipRef = useRef<FlipState | null>(null)
  flipRef.current = flip

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }, [])

  /**
   * 落平后再提交。
   *
   * 这是「落地不跳」的关键：60fps 下动画的最后一帧永远落在 t=1 之前
   * （约 t=0.98 → 纸板 179°），如果此时直接 commit，画面会从 179°
   * 一下子跳成静止态 —— 差这 1° 在 570px 宽的页面上约等于 1px 错位，
   * 文字边缘会明显「抖」一下（实测文字区域差异 7.7%）。
   *
   * 所以这里先额外渲染一帧「角度正好 180°」（progress = 1），
   * 让纸叶背面与接替它的静止页完全重合，下一帧再真正切换逻辑页。
   *
   * 提交目标**只从 flip.toIndex 读**，不接受调用方传参：落平帧渲染的是
   * `flip.toIndex` 那一屏，如果 commit 用别的值（拖拽途中被键盘/滚轮
   * 改写过方向，或者动画途中点了进度圆点），就会出现「落平帧显示 A、
   * 下一帧变成 B」的跳变 —— 正是这套设计要消灭的东西。
   */
  const settleThenCommit = useCallback(() => {
    const target = flipRef.current?.toIndex
    setFlip((current) => (current ? { ...current, progress: 1 } : current))
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      busyRef.current = false
      setFlip(null)
      if (typeof target === 'number') onCommit(target)
    })
  }, [onCommit])

  /** 弹回原位：同样要多渲染一帧「完全回到 0°」再卸下纸叶 */
  const settleThenClear = useCallback(() => {
    setFlip((current) => (current ? { ...current, progress: 0 } : current))
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      busyRef.current = false
      setFlip(null)
    })
  }, [])

  /** 播放完整翻页 */
  const animate = useCallback(
    (direction: 'next' | 'prev') => {
      // 动画进行中、或用户正用手指拖着纸叶时，不接受新的翻页指令 ——
      // 否则纸叶的 direction/toIndex 会被改写，而松手时提交的是
      // dragRef 里的方向，落平帧与提交帧就会对不上（一帧闪现错误跨页）
      if (busyRef.current || dragRef.current) return
      const toIndex = direction === 'next' ? spreadIndex + 1 : spreadIndex - 1
      if (toIndex < 0 || toIndex >= spreadCount) return

      if (reducedMotion) {
        onCommit(toIndex)
        return
      }

      busyRef.current = true
      stopRaf()
      const start = performance.now()
      setFlip({ direction, progress: 0, fromIndex: spreadIndex, toIndex, phase: 'flipping' })

      const step = (now: number) => {
        const t = Math.min(1, (now - start) / FLIP_DURATION)
        setFlip((current) => (current ? { ...current, progress: easeSettle(t) } : current))
        if (t < 1) {
          rafRef.current = requestAnimationFrame(step)
        } else {
          settleThenCommit()
        }
      }
      rafRef.current = requestAnimationFrame(step)
    },
    [onCommit, reducedMotion, settleThenCommit, spreadCount, spreadIndex, stopRaf],
  )

  /** 拖拽松手后继续翻完（从当前进度接着走，不重新开始） */
  const finish = useCallback(
    (direction: 'next' | 'prev', fromProgress: number) => {
      // 拖拽期间禁止其它入口改动 spreadIndex / flip.direction，
      // 所以这里用 drag 的方向推导目标即可（与 flip.toIndex 一致）
      const toIndex = direction === 'next' ? spreadIndex + 1 : spreadIndex - 1
      if (toIndex < 0 || toIndex >= spreadCount) return
      const startProgress = Math.max(0, Math.min(1, fromProgress))
      const start = performance.now()
      const remaining = Math.max(160, FLIP_DURATION * (1 - startProgress) * 0.9)

      busyRef.current = true
      stopRaf()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / remaining)
        const p = startProgress + (1 - startProgress) * easeOutCubic(t)
        setFlip((current) => (current ? { ...current, progress: p } : current))
        if (t < 1) {
          rafRef.current = requestAnimationFrame(step)
        } else {
          settleThenCommit()
        }
      }
      rafRef.current = requestAnimationFrame(step)
    },
    [settleThenCommit, spreadCount, spreadIndex, stopRaf],
  )

  /** 拖拽不足，弹回原位 */
  const cancel = useCallback(
    (fromProgress: number) => {
      const startProgress = Math.max(0, Math.min(1, fromProgress))
      const start = performance.now()
      const duration = Math.max(180, 320 * startProgress)

      busyRef.current = true
      stopRaf()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration)
        const p = startProgress * (1 - easeReturn(t))
        setFlip((current) => (current ? { ...current, progress: p } : current))
        if (t < 1) {
          rafRef.current = requestAnimationFrame(step)
        } else {
          // 同样先落到正好 0° 再卸下纸叶，避免最后不足 1° 的偏差被看到
          settleThenClear()
        }
      }
      rafRef.current = requestAnimationFrame(step)
    },
    [settleThenClear, stopRaf],
  )

  /* ------------------------------------------------ 拖拽 */

  const canDrag = useCallback(
    (direction: 'next' | 'prev') => {
      if (busyRef.current || reducedMotion) return false
      const toIndex = direction === 'next' ? spreadIndex + 1 : spreadIndex - 1
      return toIndex >= 0 && toIndex < spreadCount
    },
    [reducedMotion, spreadCount, spreadIndex],
  )

  const beginDrag = useCallback(
    (direction: 'next' | 'prev') => {
      if (!canDrag(direction)) return false
      const toIndex = direction === 'next' ? spreadIndex + 1 : spreadIndex - 1
      dragRef.current = { direction, progress: 0 }
      setDragging(true)
      setFlip({ direction, progress: 0, fromIndex: spreadIndex, toIndex, phase: 'flipping' })
      return true
    },
    [canDrag, spreadIndex],
  )

  const updateDrag = useCallback(
    (progress: number) => {
      const drag = dragRef.current
      if (!drag) return
      const clamped = Math.max(0, Math.min(1, progress))
      dragRef.current = { ...drag, progress: clamped }
      setFlip((current) => (current ? { ...current, progress: clamped } : current))
    },
    [],
  )

  const endDrag = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(false)
    if (!drag) return
    // 拖过 35% 就认为用户想翻过去
    if (drag.progress > 0.35) finish(drag.direction, drag.progress)
    else cancel(drag.progress)
  }, [cancel, finish])

  /** 拖拽定格：仅供开发期逐帧验收使用 */
  const hold = useCallback(
    (direction: 'next' | 'prev', progress: number) => {
      const toIndex = direction === 'next' ? spreadIndex + 1 : spreadIndex - 1
      if (toIndex < 0 || toIndex >= spreadCount) return
      setFlip({
        direction,
        progress: Math.max(0, Math.min(1, progress)),
        fromIndex: spreadIndex,
        toIndex,
        phase: 'flipping',
      })
    },
    [spreadCount, spreadIndex],
  )

  useEffect(() => stopRaf, [stopRaf])

  return { flip, animate, beginDrag, updateDrag, endDrag, dragging, busyRef, hold }
}

/* ------------------------------------------------------------------ *
 * Reader
 * ------------------------------------------------------------------ */

export function Reader({ album, initialIndex = 0, onIndexChange }: ReaderProps) {
  const spreads = useMemo(() => buildSpreads(album.pages), [album.pages])
  const reducedMotion = usePrefersReducedMotion()

  /** 定位初始跨页：包含 initialIndex 的那一屏 */
  const startSpread = useMemo(() => {
    const found = spreads.findIndex(([, right]) => right === initialIndex)
    if (found >= 0) return found
    const foundLeft = spreads.findIndex(([left]) => left === initialIndex)
    return foundLeft >= 0 ? foundLeft : 0
  }, [spreads, initialIndex])

  const [spreadIndex, setSpreadIndex] = useState(startSpread)
  const [zoomed, setZoomed] = useState(false)
  const [showUi, setShowUi] = useState(true)

  const { flip, animate, beginDrag, updateDrag, endDrag, dragging, busyRef, hold } = useFlipDriver({
    spreadCount: spreads.length,
    spreadIndex,
    reducedMotion,
    onCommit: (next) => {
      setSpreadIndex(next)
      const target = spreads[next]
      const pageIndex = target[1] ?? target[0]
      if (pageIndex !== null) onIndexChange?.(pageIndex)
    },
  })

  const total = spreads.length
  const spread = spreads[spreadIndex] ?? [null, null]
  const currentPageNumber = (spread[1] ?? spread[0] ?? 0) + 1
  const flipping = flip !== null

  /**
   * 纸板的正反面各会渲染一份页面内容，因此**必须**在翻页开始之前
   * 把照片地址全部解析完。这里在阅读器挂载时就预解析整本的地址。
   */
  /**
   * 纸板的正反面各会渲染一份页面内容，因此**必须**在翻页开始之前
   * 把照片地址全部解析完。这里在阅读器挂载时就预解析整本的地址。
   *
   * 注意 `byId` 要通过**订阅**拿到（而不是 getState() 快照）：
   * 冷启动时素材库还在从 IndexedDB 读元数据，快照会一直停在空对象，
   * 于是 albumAssets 恒为空、预解析形同虚设，上传的照片仍会先画灰底。
   */
  const photoById = usePhotoStore((state) => state.byId)
  const albumAssets = useMemo<PhotoAsset[]>(
    () => album.photoIds.map((id) => photoById[id]).filter((a): a is PhotoAsset => Boolean(a)),
    [album.photoIds, photoById],
  )
  const photosReady = usePhotosReady(albumAssets)

  /** 整本书的宽度，用于把拖拽距离换算成翻页进度 */
  const spreadWidthRef = useRef(album.pageSize.width * 2 + 14)
  spreadWidthRef.current = album.pageSize.width * 2 + 14

  /* ---------------------------------------------------------- 键盘 / 手势 */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // 长按会连发 repeat，翻页是 900ms 的动画，重复触发没有意义
      if (event.repeat) return
      if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown') {
        event.preventDefault()
        animate('next')
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        animate('prev')
      }
      if (event.key === 'Escape') setZoomed(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [animate])

  const wheelLock = useRef(0)
  const onWheel = useCallback(
    (event: React.WheelEvent) => {
      if (Math.abs(event.deltaY) < 12) return
      const now = performance.now()
      if (now - wheelLock.current < 520) return
      // 动画期间直接返回、**不占用节流锁**：否则这次滚动既被丢弃、
      // 又把锁推到下一段 520ms，用户会觉得「滚了一下没反应」
      if (busyRef.current) return
      wheelLock.current = now
      animate(event.deltaY > 0 ? 'next' : 'prev')
    },
    [animate, busyRef],
  )

  /* ------------------------------------------------ UI 自动隐藏 */

  /** 闲置定时器：鼠标移动会重置它，闲置 2.6 秒后收起顶栏与底部进度 */
  const uiTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!showUi) return
    if (uiTimer.current) clearTimeout(uiTimer.current)
    uiTimer.current = setTimeout(() => setShowUi(false), 2600)
    return () => {
      if (uiTimer.current) clearTimeout(uiTimer.current)
      uiTimer.current = null
    }
  }, [showUi])

  const dragStart = useRef<{ x: number; y: number; t: number; active: boolean } | null>(null)
  /** 拖着纸叶的那个指针 id，用于 setPointerCapture */
  const dragPointerId = useRef<number | null>(null)

  /**
   * 指针三件套挂在 **window** 上，而不是 Reader 根节点。
   *
   * 拖动时指针很容易滑出书页、甚至落在阅读页右上角的浮动工具栏上；
   * 如果只监听根节点，pointerup 不会派发到 Reader，于是
   * `endDrag` 永不执行 —— 纸叶会卡在中间进度，左右翻页按钮也一直禁用。
   */
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      // 只响应主键：右键 / 中键不该翻页
      if (event.button !== 0) return
      dragStart.current = { x: event.clientX, y: event.clientY, t: performance.now(), active: false }
    }

    const onPointerMove = (event: PointerEvent) => {
      const start = dragStart.current
      if (!start) return
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y

      if (!start.active) {
        if (Math.abs(dx) < 10) return
        if (Math.abs(dy) > Math.abs(dx)) {
          dragStart.current = null
          return
        }
        // reduced-motion 下不播放 3D 滑动（前庭不适），但**不能什么都不做**：
        // 之前 beginDrag 直接返回 false 并清空 dragStart，连下面的
        // 「快速划动」兜底也一起失效，触屏用户在减弱动效时完全翻不了页。
        if (reducedMotion) {
          dragStart.current = null
          animate(dx < 0 ? 'next' : 'prev')
          return
        }
        if (!beginDrag(dx < 0 ? 'next' : 'prev')) {
          dragStart.current = null
          return
        }
        start.active = true
        dragPointerId.current = event.pointerId
      }

      const travel = spreadWidthRef.current || 800
      updateDrag(Math.abs(dx) / travel / 0.55)
    }

    const onPointerUp = (event: PointerEvent) => {
      const start = dragStart.current
      dragStart.current = null
      dragPointerId.current = null
      if (!start) return
      if (start.active) {
        endDrag()
        return
      }
      const dx = event.clientX - start.x
      const dt = performance.now() - start.t
      if (dt < 700 && Math.abs(dx) > 60) animate(dx < 0 ? 'next' : 'prev')
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [animate, beginDrag, endDrag, reducedMotion, updateDrag])

  /* ---------------------------------------------------------- 拖拽定格（开发期） */

  /**
   * 开发期调试钩子。
   *
   *  - `?flip=next&hold=0.5`：把纸板**定格**在指定进度。用来验证单帧几何
   *    （3D 有没有被拍平、纸板正反面朝向、镜像等）。
   *  - `?sampleAt=24`：按 `easeSettle(N / 总帧数)` 把纸板定格在「真实动画
   *    第 N 帧应当处于的进度」。注意它同样是**定格**，不播放动画，
   *    因此验证的是单帧归属，不是真实时序。
   *
   * 用 useLayoutEffect 保证在浏览器绘制之前写入角度，截图才能抓到目标帧。
   */
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)

    /**
     * 注意：这里必须显式判断 `!== null`，不能直接 `Number(params.get(...))`。
     *
     * `URLSearchParams.get()` 在参数缺失时返回 **null**，而 `Number(null)` 是 **0**、
     * `Number.isFinite(0)` 又是 **true** —— 于是「参数不存在」会被误判成
     * 「参数是 0」，导致**每次打开阅读器都挂上一次进度为 0 的隐形翻页**：
     * `flipping` 恒为 true（左右翻页按钮被禁用），纸叶也一直挂在纸上。
     * 这个坑很隐蔽，因为进度 0 的画面看起来和静止态一模一样。
     */
    const readNumber = (key: string): number | null => {
      const raw = params.get(key)
      if (raw === null) return null
      const value = Number(raw)
      return Number.isFinite(value) ? value : null
    }

    // 定格模式：?flip=next&hold=0.5
    const direction = params.get('flip')
    if (direction === 'next' || direction === 'prev') {
      const value = readNumber('hold')
      if (value !== null) hold(direction, value)
      return
    }

    // 真实动画采样模式：?sampleAt=24
    const sampleAt = readNumber('sampleAt')
    if (sampleAt !== null) {
      // 与 animate() 的时间线保持一致：第 N 帧 ≈ t = N / totalFrames
      const totalFrames = Math.max(1, Math.round((FLIP_DURATION / 1000) * 60))
      const t = Math.min(1, sampleAt / totalFrames)
      hold('next', easeSettle(t))
    }
    // 只在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------------------------------------------------------- 渲染 */

  const goToSpread = useCallback(
    (index: number) => {
      // 动画中、或正拖着纸叶时都不允许跳页：拖拽期 busyRef 还是 false，
      // 若不额外判断 dragging，改 spreadIndex 会让松手后的落点与
      // flip.toIndex 不一致
      if (busyRef.current || dragging || index === spreadIndex) return
      setSpreadIndex(index)
      const target = spreads[index]
      const pageIndex = target[1] ?? target[0]
      if (pageIndex !== null) onIndexChange?.(pageIndex)
    },
    [busyRef, dragging, onIndexChange, spreadIndex, spreads],
  )

  const getPage = useCallback(
    (index: number | null) => (index === null ? null : album.pages[index] ?? null),
    [album.pages],
  )

  /**
   * 翻页时纸叶的正反面，以及静止层两侧各显示什么。
   *
   * 规则只有一条，但它决定了整段动画里「哪一页在变、哪一页绝不能变」：
   *
   *  - **被纸叶抬走的那一侧**：纸叶一起身就把它盖住，所以起点就可以换成
   *    目标页（纸叶抬走后露出来的本来就是它，物理上也对）。
   *  - **被纸叶落下的那一侧**：它全程露在外面，正是用户正在阅读的那一页，
   *    必须**一个像素都不变**；要等纸叶落平的那一帧，才与落平帧一起整体
   *    切到目标跨页。
   *
   * 向后翻（右页翻到左边）：左槽保持当前左页，右槽换成目标右页
   * 向前翻（左页翻到右边）：右槽保持当前右页，左槽换成目标左页
   *
   * 而 progress = 1 的落平帧不走静止层这套逻辑，直接渲染 landedLeft /
   * landedRight —— 原因见 BookSpread 里 landed 的说明。
   */
  const flipVisual = useMemo<FlipVisual | null>(() => {
    if (!flip) return null
    const from = spreads[flip.fromIndex] ?? [null, null]
    const to = spreads[flip.toIndex] ?? [null, null]
    const isNext = flip.direction === 'next'

    return {
      direction: flip.direction,
      progress: flip.progress,
      // 纸叶正面 = 正在被翻走的那一页
      leafFront: getPage(isNext ? from[1] : from[0]),
      // 纸叶背面 = 翻过来之后朝上的那一面
      leafBack: getPage(isNext ? to[0] : to[1]),
      // 静止层（纸叶下面）两侧各显示什么 —— 这是「翻页途中页面不能变」的关键：
      //
      //   向后翻（next，右页翻到左边）：
      //     左槽 = from[0]，翻页过程**全程不变**（这是你正在读的页）。
      //            它要到纸叶落地卸下的那一帧，才由 commit 换成 to[0]，
      //            而此时纸叶背面恰好盖在它上面，交接不可见。
      //     右槽 = to[1]，在翻页起点（纸叶还没抬起）就已换成新右页，
      //            因为纸叶抬走后露出来的就是它。
      //
      //   向前翻（prev，左页翻到右边）：对称处理。
      //
      // 一句话：**被纸叶抬走的那一侧，起点就被纸叶盖住，可以换成新页；
      // 被纸叶落下的那一侧，必须全程保持旧页，落地那帧才换。**
      underLeft: getPage(isNext ? from[0] : to[0]),
      underRight: getPage(isNext ? to[1] : from[1]),
      /**
       * 落平帧（progress = 1）直接按目标跨页渲染，不再让纸叶背面去凑。
       * 这样落平帧与 commit 之后的静止帧是同一棵 DOM，交接不会有任何位移。
       */
      landedLeft: getPage(to[0]),
      landedRight: getPage(to[1]),
    }
  }, [flip, spreads, getPage])

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
      style={{ touchAction: 'pan-y', cursor: dragging ? 'grabbing' : 'default' }}
      onWheel={onWheel}
      onMouseMove={() => {
        setShowUi(true)
        if (uiTimer.current) clearTimeout(uiTimer.current)
        uiTimer.current = setTimeout(() => setShowUi(false), 2600)
      }}
    >
      {/* 顶部信息。
          左边的留白由外层通过 --reader-top-inset 传入：预览页在那里放了
          「返回书架 / 继续编辑」两个浮动按钮，不避让的话会把书名压住。 */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between p-5 pl-[var(--reader-top-inset,1.25rem)] transition-opacity duration-500 ${
          showUi ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="pointer-events-auto">
          <div className="font-serif text-lg text-ink-100">{album.title}</div>
          <div className="mt-0.5 text-[11px] text-ink-500">
            {album.startDate ? album.startDate.replace(/-/g, '.') : ''}
            {album.endDate && album.endDate !== album.startDate
              ? ` — ${album.endDate.replace(/-/g, '.')}`
              : ''}
            {album.location?.name ? ` · ${album.location.name}` : ''}
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            className="tool-btn h-8 w-8"
            onClick={() => setZoomed((value) => !value)}
            title={zoomed ? '退出放大' : '原尺寸查看'}
          >
            {zoomed ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* 书本 */}
      <BookViewport
        album={album}
        left={getPage(spread[0])}
        right={getPage(spread[1])}
        flip={flipVisual}
        zoomed={zoomed}
        photosReady={photosReady}
      />

      {/* 左右翻页热区 */}
      {!zoomed && (
        <>
          <button
            className="group absolute left-0 top-0 z-20 flex h-full w-[14%] items-center justify-start pl-4 disabled:cursor-default"
            onClick={() => animate('prev')}
            disabled={spreadIndex === 0 || flipping}
            title="上一页 (←)"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-800/60 text-ink-300 opacity-0 backdrop-blur transition-all duration-300 group-hover:opacity-100 group-disabled:opacity-0">
              <ChevronLeft className="h-5 w-5" />
            </span>
          </button>
          <button
            className="group absolute right-0 top-0 z-20 flex h-full w-[14%] items-center justify-end pr-4 disabled:cursor-default"
            onClick={() => animate('next')}
            disabled={spreadIndex >= total - 1 || flipping}
            title="下一页 (→)"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-800/60 text-ink-300 opacity-0 backdrop-blur transition-all duration-300 group-hover:opacity-100 group-disabled:opacity-0">
              <ChevronRight className="h-5 w-5" />
            </span>
          </button>
        </>
      )}

      {/* 底部进度 */}
      <div
        className={`absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2.5 pb-5 transition-opacity duration-500 ${
          showUi ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-[11px] tabular-nums text-ink-400">
            {currentPageNumber} / {album.pages.length}
          </span>
          <div className="flex h-1.5 items-center gap-1">
            {spreads.map((_, index) => (
              <button
                key={index}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === spreadIndex ? 'w-5 bg-clay-500' : 'w-1.5 bg-ink-600 hover:bg-ink-500'
                }`}
                onClick={() => goToSpread(index)}
                title={`第 ${index + 1} 屏`}
              />
            ))}
          </div>
        </div>
        <div className="text-[10px] text-ink-600">
          点击左右区域翻页 · ← → 键 · 也可以按住拖动
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 书本视口
 * ------------------------------------------------------------------ */

/**
 * 计算缩放比例，让跨页（两页 + 书脊）始终完整落在视口内。
 * 用 ResizeObserver 而不是 window resize，才能适配侧栏收放等内部变化。
 */
function useFitScale(size: { width: number; height: number }, padding: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.6)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => {
      const box = node.getBoundingClientRect()
      const availableW = box.width - padding * 2
      const availableH = box.height - padding * 2
      const neededW = size.width * 2 + 14
      const neededH = size.height
      setScale(Math.max(0.15, Math.min(availableW / neededW, availableH / neededH, 1.3)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [size.width, size.height, padding])

  return { ref, scale }
}

function BookViewport({
  album,
  left,
  right,
  flip,
  zoomed,
  photosReady,
}: {
  album: Album
  left: Page | null
  right: Page | null
  flip: FlipVisual | null
  zoomed: boolean
  photosReady: boolean
}) {
  const { ref, scale: fitScale } = useFitScale(album.pageSize, 86)
  const scale = zoomed ? 1 : fitScale
  const size = album.pageSize
  const spreadWidth = size.width * 2 + 14

  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center">
      <div
        className="relative"
        style={{
          width: spreadWidth * scale,
          height: size.height * scale,
          transition: 'width 0.4s cubic-bezier(0.22,1,0.36,1), height 0.4s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* 书影：与 3D 舞台分离，避免 filter 把纸板的厚度拍平 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            filter: 'drop-shadow(0 48px 84px rgba(0,0,0,0.75)) drop-shadow(0 12px 30px rgba(0,0,0,0.5))',
          }}
        />

        <div
          className="absolute left-1/2 top-0"
          style={{
            width: spreadWidth,
            height: size.height,
            transformStyle: 'preserve-3d',
            transform: `translateX(-50%) scale(${scale})`,
            transformOrigin: 'top center',
          }}
        >
          {photosReady ? (
            <BookSpread
              size={size}
              left={left}
              right={right}
              flip={flip}
              emptySlot={<CoverLeafBoard size={size} />}
            />
          ) : (
            <BookSpreadSkeleton size={size} />
          )}
        </div>

        {/* 装订封面边缘：让「这是一本精装册子」在书本外沿也有体现 */}
        <div
          className="pointer-events-none absolute"
          style={{
            left: -6,
            top: 8,
            bottom: 8,
            width: 6,
            borderRadius: '3px 0 0 3px',
            background: 'linear-gradient(90deg, rgba(0,0,0,0.55), rgba(0,0,0,0.18))',
          }}
        />
        <div
          className="pointer-events-none absolute"
          style={{
            right: -6,
            top: 8,
            bottom: 8,
            width: 6,
            borderRadius: '0 3px 3px 0',
            background: 'linear-gradient(270deg, rgba(0,0,0,0.55), rgba(0,0,0,0.18))',
          }}
        />
      </div>
    </div>
  )
}

/** 照片地址就绪之前的占位：保持书本尺寸，避免布局跳动 */
function BookSpreadSkeleton({ size }: { size: { width: number; height: number } }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ width: size.width * 2 + 14, height: size.height, gap: 14 }}
    >
      {[0, 1].map((index) => (
        <div
          key={index}
          className="h-full flex-1 animate-pulse rounded-[3px]"
          style={{ backgroundColor: 'rgba(247,243,234,0.06)' }}
        />
      ))}
    </div>
  )
}

/** 封面单独成屏时，左侧是一块硬壳装帧纸板（有厚度，不是空白） */
function CoverLeafBoard({ size }: { size: { width: number; height: number } }) {
  const thickness = Math.max(4, Math.round(size.height * 0.011))
  return (
    <div className="relative h-full w-full" style={{ transformStyle: 'preserve-3d' }}>
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          backgroundColor: '#20191a',
          backgroundImage:
            'repeating-linear-gradient(52deg, rgba(255,255,255,0.022) 0 1px, transparent 1px 4px), radial-gradient(120% 90% at 30% 20%, rgba(120,90,70,0.22), transparent 60%)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)',
        }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
          <div className="h-px w-16" style={{ backgroundColor: 'rgba(232,220,196,0.24)' }} />
          <p
            className="max-w-[62%] font-serif text-sm leading-relaxed"
            style={{ color: 'rgba(232,220,196,0.45)' }}
          >
            硬壳封面
            <br />
            从右边翻开这一页
          </p>
        </div>

        {/* 左侧的书口：露出下面压着的纸板边 */}
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: thickness,
            backgroundColor: '#e2d9c6',
            backgroundImage:
              'repeating-linear-gradient(0deg, rgba(90,78,58,0.22) 0 0.7px, rgba(255,255,255,0.30) 0.7px 1.7px)',
          }}
        />
        {/* 装订侧压暗 */}
        <div
          className="absolute inset-y-0 right-0"
          style={{
            width: 30,
            background: 'linear-gradient(270deg, rgba(0,0,0,0.55), rgba(0,0,0,0))',
          }}
        />
      </div>
    </div>
  )
}
