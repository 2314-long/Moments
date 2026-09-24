/**
 * 拖拽载荷。
 *
 * 用一个可序列化的联合类型描述「正在拖什么」，
 * 这样拖放两端不需要共享 React 状态，也能跨组件（甚至跨框架）工作。
 */

export type DragPayload =
  | { kind: 'photo'; photoId: string; width: number; height: number; label?: string }
  | { kind: 'sticker'; stickerId: string; width: number; height: number; label?: string }
  | { kind: 'page'; pageId: string; label?: string }
