import type { ArtTextElement, TextElement } from '@/types/album'

type MeasurableTextElement = TextElement | ArtTextElement

/**
 * 在浏览器中按元素的真实宽度测量折行后的文本高度。
 *
 * 文本元素的坐标和尺寸属于页面坐标系，因此这里返回的也是同一套单位。
 * 没有 DOM 的场景保守地按显式换行估算；浏览器中会由离屏节点得到实际值。
 */
export function measuredTextHeight(element: MeasurableTextElement): number {
  const data = element.data
  const fallback = Math.ceil(data.fontSize * data.lineHeight * data.text.split('\n').length + 8)
  if (typeof document === 'undefined') return fallback

  const node = document.createElement('div')
  Object.assign(node.style, {
    position: 'absolute',
    visibility: 'hidden',
    pointerEvents: 'none',
    left: '-10000px',
    top: '0',
    width: `${element.width}px`,
    height: 'auto',
    boxSizing: 'border-box',
    fontFamily: data.fontFamily,
    fontSize: `${data.fontSize}px`,
    fontWeight: `${data.fontWeight}`,
    fontStyle: data.italic ? 'italic' : 'normal',
    letterSpacing: `${data.letterSpacing}px`,
    lineHeight: `${data.lineHeight}`,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
    textAlign: data.align,
  })

  if (element.kind === 'art-text') {
    const artData = element.data
    switch (artData.templateId) {
      case 'cinema':
        node.style.padding = '10px 14px'
        node.style.letterSpacing = `${data.letterSpacing + 1}px`
        break
      case 'seal':
        node.style.padding = '12px'
        node.style.border = `5px double ${artData.accentColor}`
        break
      case 'magazine':
        node.style.paddingLeft = '12px'
        node.style.borderLeft = `8px solid ${artData.accentColor}`
        break
    }
  }

  node.textContent = data.text || ' '
  document.body.appendChild(node)
  const height = Math.ceil(node.getBoundingClientRect().height)
  node.remove()
  return Math.max(fallback, height)
}
