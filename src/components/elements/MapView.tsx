import { memo, useMemo } from 'react'
import type { MapElement } from '@/types/album'
import { FONT_STACK } from '@/lib/designTokens'

/**
 * 手绘路线地图。
 *
 * 刻意不使用真实地图服务：
 *  - demo 阶段不应该为了视觉效果引入外部 tile 依赖；
 *  - 产品要的是「手账里画出来的路线」，而不是导航截图。
 *
 * 坐标处理：把途经点的经纬度做等距圆柱投影（经纬度线性映射，
 * 纬度方向做 cos 校正），归一化到 0..1 后再映射到 SVG viewBox。
 * 未来接入真实地图时，只需替换这里的投影函数。
 */

export interface MapViewProps {
  element: MapElement
  width: number
  height: number
}

interface ProjectedPoint {
  x: number
  y: number
  name: string
  note?: string
}

function project(points: MapElement['data']['points']): ProjectedPoint[] {
  if (!points.length) return []
  const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (!valid.length) return []

  const lats = valid.map((p) => p.lat)
  const lngs = valid.map((p) => p.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180)
  const cosLat = Math.max(0.2, Math.cos(midLat))

  const spanX = Math.max(1e-6, (maxLng - minLng) * cosLat)
  const spanY = Math.max(1e-6, maxLat - minLat)

  // 保持等比，避免路线被拉伸变形
  const scale = Math.min(1 / spanX, 1 / spanY)
  const offsetX = (1 - spanX * scale) / 2
  const offsetY = (1 - spanY * scale) / 2

  return valid.map((p) => ({
    x: offsetX + (p.lng - minLng) * cosLat * scale,
    // SVG 的 y 轴向下，纬度越大的点在越上方
    y: offsetY + (maxLat - p.lat) * scale,
    name: p.name,
    note: p.note,
  }))
}

function MapViewImpl({ element, width, height }: MapViewProps) {
  const { ink, accent, title, showLabels } = element.data

  // 内边距，避免点贴到纸边
  const padX = width * 0.11
  const padY = height * 0.15
  const plotW = width - padX * 2
  const plotH = height - padY * 2

  const points = useMemo(() => project(element.data.points), [element.data.points])

  const plotted = points.map((p) => ({
    ...p,
    px: padX + p.x * plotW,
    py: padY + p.y * plotH,
  }))

  const pathD = plotted.length
    ? plotted
        .map((p, i) => {
          if (i === 0) return `M ${p.px} ${p.py}`
          const prev = plotted[i - 1]
          // 用二次贝塞尔画出略带弧度的路线，比直线更像手绘
          const mx = (prev.px + p.px) / 2
          const my = (prev.py + p.py) / 2
          const bulge = (i % 2 === 0 ? 1 : -1) * Math.min(28, Math.hypot(p.px - prev.px, p.py - prev.py) * 0.16)
          const nx = -(p.py - prev.py)
          const ny = p.px - prev.px
          const len = Math.hypot(nx, ny) || 1
          return `Q ${mx + (nx / len) * bulge} ${my + (ny / len) * bulge} ${p.px} ${p.py}`
        })
        .join(' ')
    : ''

  const dots = Math.max(6, Math.round(width / 44))
  const rows = Math.max(6, Math.round(height / 44))

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width,
        height,
        backgroundColor: '#f4efe2',
        borderRadius: 3,
        boxShadow: element.shadow ? '0 6px 18px -8px rgba(0,0,0,0.4)' : undefined,
        opacity: element.opacity,
      }}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
        {/* 底纹网格 */}
        <g opacity="0.3">
          {Array.from({ length: dots }).map((_, i) => (
            <line
              key={`v${i}`}
              x1={((i + 1) * width) / (dots + 1)}
              y1={0}
              x2={((i + 1) * width) / (dots + 1)}
              y2={height}
              stroke={ink}
              strokeWidth="0.4"
              strokeDasharray="2 6"
            />
          ))}
          {Array.from({ length: rows }).map((_, i) => (
            <line
              key={`h${i}`}
              x1={0}
              y1={((i + 1) * height) / (rows + 1)}
              x2={width}
              y2={((i + 1) * height) / (rows + 1)}
              stroke={ink}
              strokeWidth="0.4"
              strokeDasharray="2 6"
            />
          ))}
        </g>

        {/* 装饰性的等高线弧 */}
        <g opacity="0.14" fill="none" stroke={ink} strokeWidth="1">
          <path d={`M ${width * 0.05} ${height * 0.86} Q ${width * 0.3} ${height * 0.68} ${width * 0.52} ${height * 0.9}`} />
          <path d={`M ${width * 0.14} ${height * 0.95} Q ${width * 0.36} ${height * 0.78} ${width * 0.6} ${height * 0.97}`} />
          <path d={`M ${width * 0.62} ${height * 0.12} Q ${width * 0.8} ${height * 0.04} ${width * 0.97} ${height * 0.16}`} />
        </g>

        {/* 路线 */}
        {pathD && (
          <>
            {/* 底层：更粗更淡，像铅笔打稿 */}
            <path d={pathD} fill="none" stroke={ink} strokeWidth="5" strokeLinecap="round" opacity="0.16" />
            {/* 上层：虚线，像手绘 */}
            <path
              d={pathD}
              fill="none"
              stroke={accent}
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="7 6"
              opacity="0.92"
            />
          </>
        )}

        {/* 途经点 */}
        {plotted.map((p, index) => {
          const isEnd = index === 0 || index === plotted.length - 1
          const r = isEnd ? 6.5 : 4.5
          return (
            <g key={`${p.name}-${index}`}>
              <circle cx={p.px} cy={p.py} r={r + 3} fill={accent} opacity="0.14" />
              <circle cx={p.px} cy={p.py} r={r} fill={isEnd ? accent : '#f7f3ea'} stroke={accent} strokeWidth="2" />
              {isEnd && <circle cx={p.px} cy={p.py} r={2} fill="#f7f3ea" />}
              {showLabels && (
                <text
                  x={p.px}
                  y={p.py - r - 7}
                  textAnchor="middle"
                  fontSize={Math.max(10, Math.min(15, width * 0.026))}
                  fill={ink}
                  fontFamily={FONT_STACK.sans}
                  style={{ paintOrder: 'stroke' }}
                  stroke="#f4efe2"
                  strokeWidth="3.2"
                >
                  {p.name}
                </text>
              )}
            </g>
          )
        })}

        {/* 罗盘 */}
        <g transform={`translate(${width - 44} ${height - 46})`} opacity="0.5">
          <circle r="15" fill="none" stroke={ink} strokeWidth="1" />
          <path d="M0 -13 L4 0 L0 13 L-4 0 Z" fill={accent} opacity="0.7" />
          <text y="-19" textAnchor="middle" fontSize="9" fill={ink} fontFamily={FONT_STACK.sans}>
            N
          </text>
        </g>
      </svg>

      {/* 标题 */}
      {title && (
        <div
          className="pointer-events-none absolute left-0 right-0 text-center"
          style={{
            top: height * 0.035,
            fontFamily: FONT_STACK.serif,
            fontSize: Math.max(12, Math.min(19, width * 0.032)),
            color: ink,
            letterSpacing: 1.5,
            opacity: 0.72,
          }}
        >
          {title}
        </div>
      )}
    </div>
  )
}

export const MapView = memo(MapViewImpl)
