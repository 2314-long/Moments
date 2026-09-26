import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Album, AlbumElement, Page } from '@/types/album'
import { MIN_ELEMENT_SIZE, PAGE_GAP, PAGE_HEIGHT, PAGE_WIDTH } from '@/lib/designTokens'
import type { Vec2 } from '@/lib/geometry'
import { boundsOf, rectCenter, toPageSpace } from '@/lib/geometry'
import {
  computeDrag,
  computeResize,
  computeRotation,
  elementAtPoint,
  elementRect,
  elementsInRect,
  normalizeRect,
  selectionBounds,
  type AlignmentGuide,
  type InteractionSnapshot,
  type ResizeHandle,
} from '@/lib/interaction'
import { useEditorStore } from '@/store/editorStore'
import { usePhotoStore } from '@/store/photoStore'
import { uploadPhotos } from '@/services/uploadService'
import { isAcceptedImage } from '@/storage/upload'
import { PageSurface } from '@/components/page/PageSurface'
import { ElementShell } from './ElementShell'
import { DRAG_MIME, parsePayload, useCanvasDrop } from './useCanvasDrop'

/**
 * 编辑器画布。
 *
 * 结构：
 *   viewport（滚动 + 居中）
 *     └ surface（按 zoom 缩放，尺寸 = 跨页实际尺寸）
 *         ├ 左页 (PageSurface, 只读渲染)
 *         ├ 右页 (PageSurface, 只读渲染)
 *         ├ 元素交互层 (ElementShell，与页面同坐标系，覆盖在纸上)
 *         ├ 对齐辅助线
 *         └ 框选矩形
 *
 * 所有交互都在「页面坐标系」里计算，缩放只体现在最外层的 transform，
 * 因此数据里永远不出现屏幕像素。
 */

export interface EditorCanvasProps {
  album: Album
  /** 当前显示的页面，顺序为 [左页, 右页]，可能为 null */
  visiblePages: [Page | null, Page | null]
  activePageId: string
  zoom: number
  showGrid: boolean
}

type Interaction =
  | { kind: 'idle' }
  | {
      kind: 'drag'
      snapshot: InteractionSnapshot
      startPositions: Map<string, Vec2>
      startPointer: Vec2
      moved: boolean
      /** 是否按住 Alt 复制 */
      duplicateOnDrop: boolean
    }
  | {
      kind: 'resize'
      snapshot: InteractionSnapshot
      handle: ResizeHandle
      startPointer: Vec2
      moved: boolean
    }
  | {
      kind: 'rotate'
      snapshot: InteractionSnapshot
      startPointer: Vec2
      moved: boolean
    }
  | { kind: 'marquee'; start: Vec2; current: Vec2; additive: boolean; pageId: string }

export function EditorCanvas({
  album,
  visiblePages,
  activePageId,
  zoom,
  showGrid,
}: EditorCanvasProps) {
  const selection = useEditorStore((state) => state.selection)
  const select = useEditorStore((state) => state.select)
  const clearSelection = useEditorStore((state) => state.clearSelection)
  const beginTransaction = useEditorStore((state) => state.beginTransaction)
  const commitTransaction = useEditorStore((state) => state.commitTransaction)
  const patchElements = useEditorStore((state) => state.patchElements)
  const updateElements = useEditorStore((state) => state.updateElements)
  const duplicateElements = useEditorStore((state) => state.duplicateElements)
  const moveElementToPage = useEditorStore((state) => state.moveElementToPage)

  const [leftPage, rightPage] = visiblePages
  const [interaction, setInteraction] = useState<Interaction>({ kind: 'idle' })
  const [guides, setGuides] = useState<AlignmentGuide[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [, setHoverPageId] = useState<string | null>(null)

  const interactionRef = useRef<Interaction>({ kind: 'idle' })
  /** pageId → DOM 节点，供拖放命中测试使用 */
  const pageNodes = useRef<Map<string, HTMLDivElement>>(new Map())
  /** 拖拽跨越中线时记录的目标页，抬起时据此真正移动元素 */
  const crossPageRef = useRef<{ targetPageId: string; offsetX: number } | null>(null)
  const [crossPageHint, setCrossPageHint] = useState<{ side: 'left' | 'right' } | null>(null)

  const { target: dropTarget, payload: dropPayload, hasFileDrag: dropFileDrag, clear: clearDrop } =
    useCanvasDrop({ pageNodes, scale: zoom })

  // 保持 ref 与 state 同步，供 window 事件读取
  interactionRef.current = interaction

  const pageSize = album.pageSize ?? { width: PAGE_WIDTH, height: PAGE_HEIGHT }
  const surfaceWidth = pageSize.width * 2 + PAGE_GAP
  const surfaceHeight = pageSize.height

  /** 元素所在的页面（用于把交互结果写回正确的页面） */
  const pageOfElement = useCallback(
    (elementId: string): string | null => {
      if (leftPage?.elements.some((e) => e.id === elementId)) return leftPage.id
      if (rightPage?.elements.some((e) => e.id === elementId)) return rightPage.id
      return null
    },
    [leftPage, rightPage],
  )

  const elementById = useCallback(
    (elementId: string): AlbumElement | undefined =>
      leftPage?.elements.find((e) => e.id === elementId) ??
      rightPage?.elements.find((e) => e.id === elementId),
    [leftPage, rightPage],
  )

  const selectedElements = useMemo(() => {
    const ids = new Set(selection)
    const all = [...(leftPage?.elements ?? []), ...(rightPage?.elements ?? [])]
    return all.filter((element) => ids.has(element.id))
  }, [selection, leftPage, rightPage])

  const selectionBox = useMemo(() => selectionBounds(selectedElements), [selectedElements])

  /**
   * 渲染辅助线 / 多选包围盒时需要叠加的跨页偏移。
   *
   * 这些几何值都是**页面本地坐标**，而它们的定位父节点是跨页 surface，
   * 所以右页必须整体平移一个页面宽度，否则会画到左页同一 x 的位置上。
   */
  const rightPageOffset = pageSize.width + PAGE_GAP
  const selectedPageId = selectedElements[0] ? pageOfElement(selectedElements[0].id) : null
  const selectionPageOffset = selectedPageId && selectedPageId !== leftPage?.id ? rightPageOffset : 0
  const guidePageOffset = selectionPageOffset

  /* ------------------------------------------------------ 指针 → 页面坐标 */

  /**
   * 把客户端坐标转成「某个页面」的页面坐标。
   * 由于左右页共享同一套 y 轴，只有 x 需要加上左页偏移。
   */
  const toLocal = useCallback(
    (client: Vec2, pageId: string | null): Vec2 | null => {
      if (!pageId) return null
      const node = pageNodes.current.get(pageId)
      if (!node) return null
      const box = node.getBoundingClientRect()
      return toPageSpace(client, { x: box.left, y: box.top, width: box.width, height: box.height }, zoom)
    },
    [zoom],
  )

  /* ------------------------------------------------------ 开始交互 */

  const buildSnapshot = useCallback(
    (elements: AlbumElement[], pointer: Vec2, primaryId: string): InteractionSnapshot | null => {
      if (!elements.length) return null
      const bounds = selectionBounds(elements)
      if (!bounds) return null
      const primary = elements.find((e) => e.id === primaryId) ?? elements[0]
      const center = rectCenter(boundsOf(elementRect(primary), primary.rotation))
      return {
        pointer,
        elements: elements.map((e) => ({
          id: e.id,
          rect: elementRect(e),
          rotation: e.rotation,
        })),
        bounds,
        boundsRotation: elements.length === 1 ? elements[0].rotation : 0,
        startAngle:
          (Math.atan2(pointer.y - center.y, pointer.x - center.x) / (Math.PI / 180) + 90 + 360) % 360,
      }
    },
    [],
  )

  const handleElementPointerDown = useCallback(
    (event: ReactPointerEvent, elementId: string) => {
      if (event.button !== 0) return
      const pageId = pageOfElement(elementId)
      const element = elementById(elementId)
      if (!pageId || !element) return

      if (element.locked) {
        select([elementId])
        return
      }

      const alreadySelected = selection.includes(elementId)
      const additive = event.shiftKey || event.metaKey || event.ctrlKey

      let nextSelection = selection
      if (additive) {
        nextSelection = alreadySelected ? selection.filter((id) => id !== elementId) : [...selection, elementId]
        select([elementId], true)
        if (!nextSelection.includes(elementId)) return
      } else if (!alreadySelected) {
        nextSelection = [elementId]
        select([elementId])
      }

      const pointer = toLocal({ x: event.clientX, y: event.clientY }, pageId)
      if (!pointer) return

      const movingIds = nextSelection.filter((id) => {
        const found = elementById(id)
        return found && !found.locked
      })
      const movingElements = movingIds
        .map((id) => elementById(id))
        .filter((e): e is AlbumElement => Boolean(e))

      const snapshot = buildSnapshot(movingElements, pointer, elementId)
      if (!snapshot) return

      const startPositions = new Map<string, Vec2>(
        movingElements.map((e) => [e.id, { x: e.x, y: e.y }]),
      )

      beginTransaction()
      setInteraction({
        kind: 'drag',
        snapshot,
        startPositions,
        startPointer: pointer,
        moved: false,
        duplicateOnDrop: event.altKey,
      })
      event.preventDefault()
    },
    [beginTransaction, buildSnapshot, elementById, pageOfElement, select, selection, toLocal],
  )

  const handleHandlePointerDown = useCallback(
    (event: ReactPointerEvent, elementId: string, handle: ResizeHandle | 'rotate') => {
      if (event.button !== 0) return
      const pageId = pageOfElement(elementId)
      const element = elementById(elementId)
      if (!pageId || !element || element.locked) return

      const pointer = toLocal({ x: event.clientX, y: event.clientY }, pageId)
      if (!pointer) return

      const snapshot = buildSnapshot(selectedElements.length ? selectedElements : [element], pointer, elementId)
      if (!snapshot) return

      beginTransaction()
      setInteraction(
        handle === 'rotate'
          ? { kind: 'rotate', snapshot, startPointer: pointer, moved: false }
          : { kind: 'resize', snapshot, handle, startPointer: pointer, moved: false },
      )
      event.preventDefault()
    },
    [beginTransaction, buildSnapshot, elementById, pageOfElement, selectedElements, toLocal],
  )

  /* ------------------------------------------------------ 画布空白处按下 */

  const handleSurfacePointerDown = useCallback(
    (event: ReactPointerEvent, page: Page) => {
      if (event.button !== 0) return
      const pointer = toLocal({ x: event.clientX, y: event.clientY }, page.id)
      if (!pointer) return

      const hit = elementAtPoint(page.elements, pointer)
      if (hit) return // 交给 ElementShell

      // 有修饰键时保留已有选择，用于跨页多选
      const additive = event.shiftKey || event.metaKey || event.ctrlKey
      if (!additive) clearSelection()
      setEditingId(null)
      // 框选锁定在起始页：中途换坐标系会让矩形整体乱掉
      setInteraction({ kind: 'marquee', start: pointer, current: pointer, additive, pageId: page.id })
      event.preventDefault()
    },
    [clearSelection, toLocal],
  )

  /* ------------------------------------------------------ 全局指针移动 */

  useEffect(() => {
    if (interaction.kind === 'idle') return

    const onMove = (event: PointerEvent) => {
      const current = interactionRef.current
      if (current.kind === 'idle') return

      // 拖拽 / 缩放 / 旋转 / 框选都发生在**起始页面**所在的坐标系里
      const anchorPageId =
        current.kind === 'marquee'
          ? current.pageId
          : pageOfElement(current.snapshot.elements[0].id) ?? activePageId
      const pointer = toLocal({ x: event.clientX, y: event.clientY }, anchorPageId)
      if (!pointer) return

      if (current.kind === 'drag') {
        const delta = {
          x: pointer.x - current.startPointer.x,
          y: pointer.y - current.startPointer.y,
        }
        const snapEnabled = !event.altKey
        const others = (leftPage?.elements ?? [])
          .concat(rightPage?.elements ?? [])
          .filter((e) => !current.startPositions.has(e.id))
          .map((e) => ({ id: e.id, rect: elementRect(e), rotation: e.rotation }))

        const result = computeDrag(current.snapshot, {
          delta,
          snap: snapEnabled,
          startPositions: current.startPositions,
          pageSize,
          others,
        })

        setGuides(result.guides)
        const moved = Math.abs(delta.x) > 0.5 || Math.abs(delta.y) > 0.5
        if (!current.moved && moved) setInteraction({ ...current, moved: true })

        for (const [id, position] of result.positions) {
          patchElements([id], { x: position.x, y: position.y }, '移动元素')
        }

        // 跨页判断要基于「移动后的实际位置」，因此从结果里取
        const movedElements: AlbumElement[] = []
        for (const entry of current.snapshot.elements) {
          const position = result.positions.get(entry.id)
          const original = elementById(entry.id)
          if (!position || !original) continue
          const moved = { ...original } as AlbumElement
          moved.x = position.x
          moved.y = position.y
          movedElements.push(moved)
        }
        const target = resolveCrossPageTarget(album, leftPage, rightPage, movedElements, pageSize.width)
        crossPageRef.current = target
          ? { targetPageId: target.targetPageId, offsetX: target.offsetX }
          : null
        setCrossPageHint(target ? { side: target.side } : null)
        return
      }

      if (current.kind === 'resize') {
        const result = computeResize(current.snapshot, {
          handle: current.handle,
          pointer,
          keepAspect: event.shiftKey,
          fromCenter: event.altKey,
          minSize: MIN_ELEMENT_SIZE,
        })
        if (!current.moved) setInteraction({ ...current, moved: true })
        for (const [id, geometry] of result.positions) {
          patchElements(
            [id],
            { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height },
            '缩放元素',
          )
        }
        return
      }

      if (current.kind === 'rotate') {
        const rotations = computeRotation(current.snapshot, pointer, { snap: event.shiftKey })
        if (!current.moved) setInteraction({ ...current, moved: true })
        for (const [id, rotation] of rotations) {
          patchElements([id], { rotation }, '旋转元素')
        }
        return
      }

      if (current.kind === 'marquee') {
        setInteraction({ ...current, current: pointer })
      }
    }

    const onUp = () => {
      const current = interactionRef.current
      setGuides([])

      if (current.kind === 'drag' || current.kind === 'resize' || current.kind === 'rotate') {
        if (current.moved) {
          if (current.kind === 'drag' && current.duplicateOnDrop) {
            // Alt 拖拽 = 复制一份留在原处
            commitTransaction('移动元素')
            duplicateElements(current.snapshot.elements.map((e) => e.id))
          } else {
            const label =
              current.kind === 'drag' ? '移动元素' : current.kind === 'resize' ? '缩放元素' : '旋转元素'
            commitTransaction(label)
          }

          // 跨页：把元素移动到另一页（合并成同一条历史记录之后执行）
          const cross = crossPageRef.current
          if (current.kind === 'drag' && cross) {
            moveElementToPage(
              current.snapshot.elements[0].id,
              cross.targetPageId,
              cross.offsetX,
            )
          }
        } else {
          commitTransaction('选择元素')
        }
      }

      if (current.kind === 'marquee') {
        const rect = normalizeRect(current.start, current.current)
        if (rect.width > 2 || rect.height > 2) {
          // 只命中起始页：左右页的本地坐标都是 0..pageWidth，若两页都套用
          // 同一个矩形，在右页画一个小框会连带选中左页同位置的元素
          const page = [leftPage, rightPage].find((p) => p?.id === current.pageId) ?? null
          if (page) {
            const hits = elementsInRect(page.elements, rect)
            if (hits.length) select(hits, current.additive)
          }
        }
      }

      crossPageRef.current = null
      setCrossPageHint(null)
      setInteraction({ kind: 'idle' })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [
    activePageId,
    album,
    commitTransaction,
    duplicateElements,
    elementById,
    interaction.kind,
    leftPage,
    moveElementToPage,
    pageOfElement,
    pageSize,
    patchElements,
    rightPage,
    select,
    toLocal,
  ])

  /* ------------------------------------------------------ 从面板 / 桌面拖入 */

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      const target = dropTarget
      if (!target) return
      event.preventDefault()
      event.stopPropagation()

      const dataTransfer = event.dataTransfer
      const raw = dataTransfer.getData(DRAG_MIME)
      const parsed = parsePayload(raw)
      const files = Array.from(dataTransfer.files ?? []).filter(isAcceptedImage)

      clearDrop()

      if (files.length) {
        // 直接把本地文件拖进页面：上传后落在拖放位置
        void (async () => {
          const result = await uploadPhotos(files)
          const added = useEditorStore.getState().addPhotoElement
          result.assets.forEach((asset, index) => {
            added(asset, {
              x: target.x + index * 18,
              y: target.y + index * 18,
              pageId: target.pageId,
            })
          })
        })()
        return
      }

      if (parsed?.kind === 'photo') {
        const asset = usePhotoStore.getState().byId[parsed.photoId]
        if (asset) {
          useEditorStore
            .getState()
            .addPhotoElement(asset, { x: target.x, y: target.y, pageId: target.pageId })
        }
        return
      }

      if (parsed?.kind === 'sticker') {
        useEditorStore
          .getState()
          .addStickerElement(parsed.stickerId, { x: target.x, y: target.y, pageId: target.pageId })
      }
    },
    [clearDrop, dropTarget],
  )

  /* ------------------------------------------------------ 键盘微调 */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (editingId) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      if (!selection.length) return
      // 长按方向键会产生大量 repeat 事件，每个都会写一条历史（上限 60 步），
      // 这里只响应首次按下
      if (event.repeat) return
      const step = event.shiftKey ? 10 : 1
      const map: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      const delta = map[event.key]
      if (!delta) return
      event.preventDefault()
      useEditorStore.getState().nudge(delta[0], delta[1])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editingId, selection.length])

  /* ------------------------------------------------------ 渲染 */

  const cursor =
    interaction.kind === 'drag'
      ? 'grabbing'
      : interaction.kind === 'resize' || interaction.kind === 'rotate'
        ? 'grabbing'
        : 'default'

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-auto"
      style={{ cursor }}
      onDragOver={(event) => {
        if (dropTarget) event.preventDefault()
      }}
      onDrop={handleDrop}
    >
      <div
        className="relative shrink-0"
        style={{
          width: surfaceWidth,
          height: surfaceHeight,
          transform: `scale(${zoom})`,
          transformOrigin: 'center center',
          // 给书本一点真实的厚度：外阴影 + 底部投影
          filter: 'drop-shadow(0 34px 60px rgba(0,0,0,0.62)) drop-shadow(0 8px 18px rgba(0,0,0,0.4))',
        }}
      >
        {/* 书脊：跨页中间的暗缝 */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 z-30"
          style={{
            left: pageSize.width,
            width: PAGE_GAP || 12,
            marginLeft: -(PAGE_GAP || 12) / 2,
            background:
              'linear-gradient(90deg, rgba(0,0,0,0.34) 0%, rgba(0,0,0,0.06) 42%, rgba(0,0,0,0.06) 58%, rgba(0,0,0,0.34) 100%)',
          }}
        />

        {/* 左右页 */}
        <div className="absolute inset-0 flex">
          <div
            ref={(node) => registerPageNode(pageNodes.current, leftPage?.id, node)}
            className="relative"
            style={{ width: pageSize.width, height: pageSize.height }}
            onPointerDown={(event) => {
              if (leftPage) handleSurfacePointerDown(event, leftPage)
            }}
            onPointerEnter={() => setHoverPageId(leftPage?.id ?? null)}
          >
            {leftPage && (
              <PageSurface
                page={leftPage}
                width={pageSize.width}
                height={pageSize.height}
                side="left"
                showGrid={showGrid}
                renderElement={() => null}
              />
            )}
          </div>

          <div
            ref={(node) => registerPageNode(pageNodes.current, rightPage?.id, node)}
            className="relative"
            style={{ width: pageSize.width, height: pageSize.height, marginLeft: PAGE_GAP }}
            onPointerDown={(event) => {
              if (rightPage) handleSurfacePointerDown(event, rightPage)
            }}
            onPointerEnter={() => setHoverPageId(rightPage?.id ?? null)}
          >
            {rightPage && (
              <PageSurface
                page={rightPage}
                width={pageSize.width}
                height={pageSize.height}
                side="right"
                showGrid={showGrid}
                renderElement={() => null}
              />
            )}
          </div>
        </div>

        {/* 元素交互层：覆盖在纸上，与页面同一坐标系 */}
        <div className="absolute inset-0 z-20" style={{ pointerEvents: 'none' }}>
          {([leftPage, rightPage] as Array<Page | null>).map((page, index) =>
            page ? (
              <div
                key={page.id}
                className="pointer-events-none absolute top-0"
                style={{
                  left: index === 0 ? 0 : pageSize.width + PAGE_GAP,
                  width: pageSize.width,
                  height: pageSize.height,
                }}
              >
                {page.elements.map((element) => (
                  <div key={element.id} style={{ pointerEvents: 'auto' }}>
                    <ElementShell
                      element={element}
                      selected={selection.includes(element.id)}
                      scale={zoom}
                      locked={element.locked}
                      editing={editingId === element.id}
                      setEditing={setEditingId}
                      onPointerDown={handleElementPointerDown}
                      onHandlePointerDown={handleHandlePointerDown}
                      onDoubleClick={() => undefined}
                      onTextCommit={(elementId, text) => {
                        updateElements(
                          [elementId],
                          (current) => withText(current, text),
                          '编辑文字',
                        )
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : null,
          )}
        </div>

        {/* 对齐辅助线。位置是「页面本地坐标」，右页要加上跨页偏移 */}
        {guides.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-40">
            {guides.map((guide, index) =>
              guide.axis === 'x' ? (
                <div
                  key={`gx-${index}`}
                  className="absolute"
                  style={{
                    left: guide.position + guidePageOffset,
                    top: guide.from,
                    height: Math.max(1, guide.to - guide.from),
                    width: 1 / zoom,
                    backgroundColor: 'rgba(226,88,140,0.95)',
                  }}
                />
              ) : (
                <div
                  key={`gy-${index}`}
                  className="absolute"
                  style={{
                    top: guide.position,
                    left: guide.from + guidePageOffset,
                    width: Math.max(1, guide.to - guide.from),
                    height: 1 / zoom,
                    backgroundColor: 'rgba(226,88,140,0.95)',
                  }}
                />
              ),
            )}
          </div>
        )}

        {/* 多选包围盒：同样要落在元素所在的那一页上 */}
        {selectedElements.length > 1 && selectionBox && (
          <div
            className="pointer-events-none absolute z-30"
            style={{
              left: selectionBox.x + selectionPageOffset,
              top: selectionBox.y,
              width: selectionBox.width,
              height: selectionBox.height,
              outline: `${1 / zoom}px dashed rgba(94,158,214,0.75)`,
              outlineOffset: 4 / zoom,
            }}
          />
        )}

        {/* 框选矩形。x 需要加上所在页在跨页中的偏移 */}
        {interaction.kind === 'marquee' && (
          <div
            className="pointer-events-none absolute z-40"
            style={{
              left:
                normalizeRect(interaction.start, interaction.current).x +
                (interaction.pageId === leftPage?.id ? 0 : pageSize.width + PAGE_GAP),
              top: normalizeRect(interaction.start, interaction.current).y,
              width: normalizeRect(interaction.start, interaction.current).width,
              height: normalizeRect(interaction.start, interaction.current).height,
              border: '1px solid rgba(94,158,214,0.9)',
              backgroundColor: 'rgba(94,158,214,0.12)',
            }}
          />
        )}

        {/* 跨页拖拽落点提示 */}
        {crossPageHint && (
          <div
            className="pointer-events-none absolute top-3 z-40 rounded-full bg-ink-900/88 px-3 py-1 text-[10px] text-ink-200 shadow-lg"
            style={{ left: crossPageHint.side === 'left' ? 14 : pageSize.width + PAGE_GAP + 14 }}
          >
            放开即可移到{crossPageHint.side === 'left' ? '左' : '右'}页
          </div>
        )}

        {/* 外部拖入落点预览 */}
        {dropTarget && (
          <DropPreview
            target={dropTarget}
            leftPageId={leftPage?.id ?? null}
            rightPageId={rightPage?.id ?? null}
            pageWidth={pageSize.width}
            label={
              dropFileDrag
                ? '放开即可添加照片'
                : dropPayload
                  ? '放开即可放到这里'
                  : null
            }
          />
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 拖放落点预览
 * ------------------------------------------------------------------ */

function DropPreview({
  target,
  leftPageId,
  rightPageId,
  pageWidth,
  label,
}: {
  target: { pageId: string; x: number; y: number; width: number; height: number }
  leftPageId: string | null
  rightPageId: string | null
  pageWidth: number
  label: string | null
}) {
  const offset = target.pageId === leftPageId ? 0 : target.pageId === rightPageId ? pageWidth + PAGE_GAP : 0
  return (
    <>
      <div
        className="pointer-events-none absolute z-40 rounded-sm"
        style={{
          left: target.x + offset,
          top: target.y,
          width: target.width,
          height: target.height,
          border: '1.5px dashed rgba(194,96,63,0.95)',
          backgroundColor: 'rgba(194,96,63,0.14)',
        }}
      />
      {label && (
        <div
          className="pointer-events-none absolute z-40 rounded-full bg-clay-600/95 px-2.5 py-1 text-[10px] text-white shadow-lg"
          style={{ left: target.x + offset, top: Math.max(8, target.y - 26) }}
        >
          {label}
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ *
 * 辅助
 * ------------------------------------------------------------------ */

/**
 * 写入可编辑元素的文本内容。
 *
 * 抽成独立函数是因为在联合类型上做「先判断 kind 再展开 data」时
 * TypeScript 无法保持判别联合的窄化，直接内联会报类型错误。
 */
function withText(element: AlbumElement, text: string): AlbumElement {
  switch (element.kind) {
    case 'text':
      return { ...element, data: { ...element.data, text } }
    case 'note':
      return { ...element, data: { ...element.data, text } }
    case 'stamp':
      return { ...element, data: { ...element.data, text } }
    default:
      return element
  }
}

/** 维护 pageId → DOM 节点的映射，节点卸载时清理 */
function registerPageNode(
  map: Map<string, HTMLDivElement>,
  pageId: string | undefined,
  node: HTMLDivElement | null,
): void {
  if (!pageId) return
  if (node) map.set(pageId, node)
  else map.delete(pageId)
}

/* ------------------------------------------------------------------ *
 * 辅助组件
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 跨页拖拽
 * ------------------------------------------------------------------ */

/**
 * 判断当前拖拽中的元素是否已经越过中线、停在另一页上。
 *
 * 返回目标页 id 与所在侧；调用方在指针抬起时据此把元素
 * 真正移动到另一页（并把 x 换算到新的页面坐标系）。
 *
 * 关键点：**必须先确定元素当前在哪一页**，再决定邻居是谁。
 * 之前用 `album.pages.findIndex(p => p.id === leftPage?.id || p.id === rightPage?.id)`
 * 取的是「跨页左页」的下标，却用它算 `index - 1`，于是右页元素往左拖会被
 * 搬到上上页（当前跨页完全没显示的那一页），x 再 +720 就直接飞出可视范围；
 * 同时判据用的是元素在**本页**的本地 x，左页元素中心天然小于半页宽，
 * 于是「随便动 1px」就会弹出跨页提示。这里两处都改掉：
 *   - 用元素所在页的下标找邻居；
 *   - 判据换成「元素中心已经越过相邻页的中线」（本地 x < 0 或 > pageWidth）。
 */
function resolveCrossPageTarget(
  album: Album,
  leftPage: Page | null,
  rightPage: Page | null,
  selected: AlbumElement[],
  pageWidth: number,
): { targetPageId: string; side: 'left' | 'right'; offsetX: number } | null {
  if (selected.length !== 1) return null
  const element = selected[0]
  const center = element.x + element.width / 2

  // 元素当前落在哪一页
  const onLeft = Boolean(leftPage && leftPage.elements.some((e) => e.id === element.id))
  const onRight = Boolean(rightPage && rightPage.elements.some((e) => e.id === element.id))
  if (!onLeft && !onRight) return null

  const currentPageId = onLeft ? leftPage!.id : rightPage!.id
  const currentIndex = album.pages.findIndex((p) => p.id === currentPageId)
  if (currentIndex < 0) return null

  // 中心越过本页左边界 → 想去上一页
  if (onRight && center < 0) {
    const target = album.pages[currentIndex - 1]
    if (!target) return null
    return { targetPageId: target.id, side: 'left', offsetX: pageWidth + PAGE_GAP }
  }

  // 中心越过本页右边界 → 想去下一页
  if (onLeft && center > pageWidth) {
    const target = album.pages[currentIndex + 1]
    if (!target) return null
    return { targetPageId: target.id, side: 'right', offsetX: -(pageWidth + PAGE_GAP) }
  }

  return null
}

