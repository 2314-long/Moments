import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragPayload } from './dragTypes'

/**
 * 画布拖放支持。
 *
 * 左侧面板里的照片 / 贴纸用 HTML5 拖拽（draggable + dataTransfer），
 * 这样也能顺带支持从桌面或其它标签页拖入文件。
 *
 * 这个 hook 负责三件事：
 *   1. 在拖拽经过时解析出「正在拖什么」；
 *   2. 把屏幕坐标换算成「哪个页面 + 页面坐标」；
 *   3. 维护落点预览状态，供画布绘制高亮框。
 */

export const DRAG_MIME = 'application/x-shiguangce'

export interface DropTarget {
  pageId: string
  /** 落点在页面坐标系中的位置（已按预览尺寸居中） */
  x: number
  y: number
  width: number
  height: number
}

export interface UseCanvasDropOptions {
  /** 页面 id → DOM 节点，用于命中测试 */
  pageNodes: React.MutableRefObject<Map<string, HTMLDivElement>>
  scale: number
}

export function useCanvasDrop({ pageNodes, scale }: UseCanvasDropOptions) {
  const [target, setTarget] = useState<DropTarget | null>(null)
  const [payload, setPayload] = useState<DragPayload | null>(null)
  const [hasFileDrag, setHasFileDrag] = useState(false)

  const targetRef = useRef<DropTarget | null>(null)
  const payloadRef = useRef<DragPayload | null>(null)
  const fileDragRef = useRef(false)
  targetRef.current = target
  payloadRef.current = payload
  fileDragRef.current = hasFileDrag

  const resolve = useCallback(
    (clientX: number, clientY: number, size: { width: number; height: number }): DropTarget | null => {
      const nodes = pageNodes.current
      if (!nodes) return null
      for (const [pageId, node] of nodes) {
        const box = node.getBoundingClientRect()
        if (clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) {
          continue
        }
        return {
          pageId,
          // 以指针作为元素中心
          x: (clientX - box.left) / scale - size.width / 2,
          y: (clientY - box.top) / scale - size.height / 2,
          width: size.width,
          height: size.height,
        }
      }
      return null
    },
    [pageNodes, scale],
  )

  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      const types = Array.from(event.dataTransfer?.types ?? [])
      const isFile = types.includes('Files')
      const isInternal = types.includes(DRAG_MIME)
      if (!isFile && !isInternal) return

      // 必须 preventDefault 才允许 drop
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = isFile ? 'copy' : 'copy'

      let nextPayload = payloadRef.current
      if (isInternal && !nextPayload) {
        nextPayload = parsePayload(event.dataTransfer?.getData(DRAG_MIME) ?? '')
        if (nextPayload) setPayload(nextPayload)
      }
      if (isFile !== fileDragRef.current) setHasFileDrag(isFile)

      const size =
        nextPayload && nextPayload.kind !== 'page'
          ? { width: nextPayload.width, height: nextPayload.height }
          : { width: 280, height: 200 }
      setTarget(resolve(event.clientX, event.clientY, size))
    }

    const onDragEnd = () => {
      setTarget(null)
      setPayload(null)
      setHasFileDrag(false)
    }

    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDragEnd)
    window.addEventListener('dragend', onDragEnd)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDragEnd)
      window.removeEventListener('dragend', onDragEnd)
    }
  }, [resolve])

  const clear = useCallback(() => {
    setTarget(null)
    setPayload(null)
    setHasFileDrag(false)
  }, [])

  return { target, payload, hasFileDrag, targetRef, payloadRef, resolve, clear }
}

export function writePayload(event: React.DragEvent, payload: DragPayload): void {
  event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
  event.dataTransfer.effectAllowed = 'copy'
  // Safari 需要 text/plain 才会真正开始拖拽
  event.dataTransfer.setData('text/plain', payload.label ?? payload.kind)
}

export function parsePayload(raw: string): DragPayload | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as DragPayload
  } catch {
    return null
  }
}
