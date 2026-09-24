import { memo, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { AlbumElement } from '@/types/album'
import { AlbumElementView } from '@/components/elements/AlbumElementView'
import type { ResizeHandle } from '@/lib/interaction'

/**
 * 元素的编辑外壳。
 *
 * 职责：
 *  - 渲染元素本体（复用只读渲染器）
 *  - 选中态描边 + 8 个缩放手柄 + 1 个旋转手柄
 *  - 双击进入原位编辑（文字 / 便签 / 印章）
 *
 * 手柄的视觉尺寸固定为屏幕像素，因此需要对旋转与缩放做反向补偿，
 * 否则放大画布时手柄会跟着变得巨大。
 */

export interface ElementShellProps {
  element: AlbumElement
  selected: boolean
  /** 画布缩放比例，用于抵消手柄尺寸 */
  scale: number
  locked: boolean
  onPointerDown: (event: ReactPointerEvent, elementId: string) => void
  onHandlePointerDown: (event: ReactPointerEvent, elementId: string, handle: ResizeHandle | 'rotate') => void
  onTextCommit: (elementId: string, text: string) => void
  onDoubleClick: (elementId: string) => void
  editing: boolean
  setEditing: (elementId: string | null) => void
}

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const HANDLE_POSITION: Record<ResizeHandle, { left: string; top: string; cursor: string }> = {
  nw: { left: '0%', top: '0%', cursor: 'nwse-resize' },
  n: { left: '50%', top: '0%', cursor: 'ns-resize' },
  ne: { left: '100%', top: '0%', cursor: 'nesw-resize' },
  e: { left: '100%', top: '50%', cursor: 'ew-resize' },
  se: { left: '100%', top: '100%', cursor: 'nwse-resize' },
  s: { left: '50%', top: '100%', cursor: 'ns-resize' },
  sw: { left: '0%', top: '100%', cursor: 'nesw-resize' },
  w: { left: '0%', top: '50%', cursor: 'ew-resize' },
}

function editableTextOf(element: AlbumElement): string | null {
  switch (element.kind) {
    case 'text':
      return element.data.text
    case 'note':
      return element.data.text
    case 'stamp':
      return element.data.text
    default:
      return null
  }
}

function ElementShellImpl({
  element,
  selected,
  scale,
  locked,
  onPointerDown,
  onHandlePointerDown,
  onTextCommit,
  onDoubleClick,
  editing,
  setEditing,
}: ElementShellProps) {
  const [hovered, setHovered] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 手柄保持屏幕尺寸恒定
  const inverse = 1 / Math.max(0.05, scale)
  const handleSize = 9 * inverse
  const borderWidth = 1.5 * inverse

  useEffect(() => {
    if (editing && textareaRef.current) {
      const node = textareaRef.current
      node.focus()
      node.setSelectionRange(node.value.length, node.value.length)
    }
  }, [editing])

  const showOutline = selected || hovered
  const editable = editableTextOf(element) !== null

  return (
    <div
      data-element-id={element.id}
      style={{
        position: 'absolute',
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        transform: `rotate(${element.rotation}deg)`,
        transformOrigin: 'center center',
        opacity: element.opacity,
        cursor: locked ? 'not-allowed' : 'move',
      }}
      onPointerDown={(event) => onPointerDown(event, element.id)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onDoubleClick={(event) => {
        event.stopPropagation()
        if (editable && !locked) {
          setEditing(element.id)
          onDoubleClick(element.id)
        }
      }}
    >
      {/* 内容 */}
      {editing && editable ? (
        <div style={{ width: '100%', height: '100%' }}>
          <EditableOverlay
            element={element}
            scale={scale}
            textareaRef={textareaRef}
            onCommit={(value) => {
              onTextCommit(element.id, value)
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : (
        <AlbumElementView element={element} />
      )}

      {/* 选中 / 悬停描边 */}
      {showOutline && !editing && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            outline: `${borderWidth}px solid ${
              locked
                ? 'rgba(180,160,120,0.85)'
                : selected
                  ? 'rgba(94,158,214,0.98)'
                  : 'rgba(94,158,214,0.42)'
            }`,
            outlineOffset: 0,
          }}
        />
      )}

      {/* 锁定标记 */}
      {locked && selected && (
        <div
          className="pointer-events-none absolute flex items-center justify-center rounded-full bg-kraft-500/90"
          style={{
            left: -6 * inverse,
            top: -6 * inverse,
            width: 14 * inverse,
            height: 14 * inverse,
            fontSize: 9 * inverse,
          }}
        >
          🔒
        </div>
      )}

      {/* 缩放手柄 */}
      {selected && !locked && !editing && (
        <>
          {HANDLES.map((handle) => {
            const pos = HANDLE_POSITION[handle]
            return (
              <div
                key={handle}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  onHandlePointerDown(event, element.id, handle)
                }}
                style={{
                  position: 'absolute',
                  left: pos.left,
                  top: pos.top,
                  width: handleSize,
                  height: handleSize,
                  marginLeft: -handleSize / 2,
                  marginTop: -handleSize / 2,
                  // 反向旋转，让手柄始终是正放的小方块
                  transform: `rotate(${-element.rotation}deg)`,
                  backgroundColor: '#ffffff',
                  border: `${1.4 * inverse}px solid rgba(40,110,175,0.95)`,
                  borderRadius: 2 * inverse,
                  boxShadow: `0 ${1 * inverse}px ${3 * inverse}px rgba(0,0,0,0.35)`,
                  cursor: pos.cursor,
                }}
              />
            )
          })}

          {/* 旋转手柄 */}
          <div
            onPointerDown={(event) => {
              event.stopPropagation()
              onHandlePointerDown(event, element.id, 'rotate')
            }}
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              width: handleSize * 1.15,
              height: handleSize * 1.15,
              marginLeft: (-handleSize * 1.15) / 2,
              marginTop: -26 * inverse,
              transform: `rotate(${-element.rotation}deg)`,
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              border: `${1.4 * inverse}px solid rgba(40,110,175,0.95)`,
              boxShadow: `0 ${1 * inverse}px ${3 * inverse}px rgba(0,0,0,0.35)`,
              cursor: 'grab',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '100%',
                width: 1.4 * inverse,
                height: 26 * inverse - handleSize,
                marginLeft: -0.7 * inverse,
                backgroundColor: 'rgba(40,110,175,0.85)',
              }}
            />
          </div>

          {/* 旋转读数 */}
          {element.rotation !== 0 && (
            <div
              className="pointer-events-none absolute whitespace-nowrap rounded bg-ink-900/85 px-1.5 py-0.5 text-ink-100"
              style={{
                left: '50%',
                top: '100%',
                transform: `translate(-50%, ${8 * inverse}px) rotate(${-element.rotation}deg)`,
                fontSize: 10 * inverse,
                lineHeight: 1.4,
              }}
            >
              {Math.round(element.rotation)}°
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 原位编辑覆盖层
 * ------------------------------------------------------------------ */

function EditableOverlay({
  element,
  scale,
  textareaRef,
  onCommit,
  onCancel,
}: {
  element: AlbumElement
  scale: number
  textareaRef: React.RefObject<HTMLTextAreaElement>
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const initial = editableTextOf(element) ?? ''
  const [value, setValue] = useState(initial)

  // 便签额外还要显示底色，避免编辑时看到透明区域
  const isNote = element.kind === 'note'
  const isStamp = element.kind === 'stamp'

  const style = {
    width: '100%',
    height: '100%',
    resize: 'none' as const,
    border: 'none',
    outline: 'none',
    background: isNote ? element.data.background : 'transparent',
    padding: isNote ? 12 : 0,
    color: isStamp ? element.data.color : element.kind === 'text' ? element.data.color : '#4a4436',
    fontFamily: isStamp
      ? 'inherit'
      : element.kind === 'text' || element.kind === 'note'
        ? element.data.fontFamily
        : 'inherit',
    fontSize:
      element.kind === 'text'
        ? element.data.fontSize
        : element.kind === 'note'
          ? element.data.fontSize
          : isStamp
            ? Math.min(element.width, element.height) * 0.22
            : 14,
    lineHeight: element.kind === 'text' ? element.data.lineHeight : 1.6,
    letterSpacing: element.kind === 'text' ? element.data.letterSpacing : undefined,
    fontWeight: element.kind === 'text' ? element.data.fontWeight : undefined,
    textAlign:
      element.kind === 'text' ? element.data.align : isStamp ? ('center' as const) : ('left' as const),
    caretColor: '#c2603f',
  }

  return (
    <div className="relative h-full w-full">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => onCommit(value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
          // 文字元素允许换行；便签里的 Enter 也换行；Cmd/Ctrl+Enter 提交
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            onCommit(value)
          }
          event.stopPropagation()
        }}
        style={style}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ outline: `${1.5 / Math.max(0.05, scale)}px solid rgba(194,96,63,0.95)` }}
      />
    </div>
  )
}

export const ElementShell = memo(ElementShellImpl)
