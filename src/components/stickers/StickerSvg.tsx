import { memo } from 'react'
import type { CSSProperties } from 'react'

/**
 * 内置矢量贴纸。
 *
 * 全部使用 currentColor 着色，尺寸由外层元素决定，
 * 因此同一份图形可以在任意尺寸下保持清晰。
 */

export interface StickerSvgProps {
  svgId: string
  tint?: string
  /** 用于生成唯一的 defs id，避免页面上多个同类贴纸互相覆盖渐变色 */
  uid?: string
  className?: string
  style?: CSSProperties
}

/** 把颜色按比例变暗 / 变亮，用于生成同一贴纸的层次 */
function shade(hex: string, amount: number): string {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized
  const num = Number.parseInt(full.slice(0, 6) || '888888', 16)
  let r = (num >> 16) & 255
  let g = (num >> 8) & 255
  let b = num & 255
  if (amount >= 0) {
    r = Math.round(r + (255 - r) * amount)
    g = Math.round(g + (255 - g) * amount)
    b = Math.round(b + (255 - b) * amount)
  } else {
    const k = 1 + amount
    r = Math.round(r * k)
    g = Math.round(g * k)
    b = Math.round(b * k)
  }
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized
  const num = Number.parseInt(full.slice(0, 6) || '888888', 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function StickerSvgImpl({ svgId, tint = '#cccccc', uid, className, style }: StickerSvgProps) {
  const dark = shade(tint, -0.28)
  const light = shade(tint, 0.3)
  const deep = shade(tint, -0.5)
  const gid = `tapeGrad-${uid ?? svgId}`

  const common = {
    className,
    style: { display: 'block', width: '100%', height: '100%', ...style },
  }

  switch (svgId) {
    /* ------------------------- 和纸胶带 ------------------------- */
    case 'tapeWashi':
      return (
        <svg viewBox="0 0 190 46" preserveAspectRatio="none" {...common}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={shade(tint, 0.14)} />
              <stop offset="100%" stopColor={shade(tint, -0.08)} />
            </linearGradient>
          </defs>
          <path
            d="M2 4 L188 2 L186 42 L3 44 Z"
            fill={`url(#${gid})`}
            stroke={withAlpha(deep, 0.18)}
            strokeWidth="1"
          />
          {/* 撕口 */}
          <path d="M2 4 L6 12 L3 20 L7 28 L4 36 L3 44" fill="none" stroke={withAlpha(deep, 0.22)} strokeWidth="1.4" />
          <path d="M188 2 L184 11 L187 19 L183 27 L186 35 L186 42" fill="none" stroke={withAlpha(deep, 0.22)} strokeWidth="1.4" />
          {/* 隐约的竖纹 */}
          {[22, 48, 74, 100, 126, 152, 176].map((x) => (
            <rect key={x} x={x} y="3" width="1.2" height="40" fill={withAlpha(deep, 0.08)} />
          ))}
        </svg>
      )

    case 'tapeStripe':
      return (
        <svg viewBox="0 0 180 42" preserveAspectRatio="none" {...common}>
          <rect x="1" y="2" width="178" height="38" fill={shade(tint, 0.22)} stroke={withAlpha(deep, 0.14)} strokeWidth="1" />
          {Array.from({ length: 12 }).map((_, i) => (
            <rect key={i} x={4 + i * 15} y="2" width="5" height="38" fill={withAlpha(dark, 0.35)} transform={`skewX(-14)`} />
          ))}
          <rect x="1" y="2" width="178" height="38" fill="none" stroke={withAlpha(deep, 0.12)} strokeWidth="1" />
        </svg>
      )

    case 'tapeMasking':
      return (
        <svg viewBox="0 0 170 40" preserveAspectRatio="none" {...common}>
          <path d="M1 3 L169 1 L168 37 L2 39 Z" fill={shade(tint, 0.12)} />
          <path
            d="M1 3 L169 1 L168 37 L2 39 Z"
            fill="none"
            stroke={withAlpha(deep, 0.16)}
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          <path d="M1 8 L169 6" stroke={withAlpha(deep, 0.07)} strokeWidth="1" />
          <path d="M2 33 L168 31" stroke={withAlpha(deep, 0.07)} strokeWidth="1" />
        </svg>
      )

    /* ------------------------- 邮票 ------------------------- */
    case 'postageStamp':
      return (
        <svg viewBox="0 0 130 150" {...common}>
          <rect x="6" y="6" width="118" height="138" fill={shade(tint, 0.34)} />
          {/* 齿孔：沿四边排列的小圆 */}
          {Array.from({ length: 9 }).map((_, i) => (
            <circle key={`t${i}`} cx={6 + (i + 0.5) * (118 / 9)} cy="6" r="4" fill="#ffffff" />
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <circle key={`b${i}`} cx={6 + (i + 0.5) * (118 / 9)} cy="144" r="4" fill="#ffffff" />
          ))}
          {Array.from({ length: 11 }).map((_, i) => (
            <circle key={`l${i}`} cx="6" cy={6 + (i + 0.5) * (138 / 11)} r="4" fill="#ffffff" />
          ))}
          {Array.from({ length: 11 }).map((_, i) => (
            <circle key={`r${i}`} cx="124" cy={6 + (i + 0.5) * (138 / 11)} r="4" fill="#ffffff" />
          ))}
          <rect x="14" y="14" width="102" height="122" fill="none" stroke={withAlpha(deep, 0.28)} strokeWidth="1" />
          {/* 图案：山与水 */}
          <path d="M20 104 L46 62 L64 88 L82 56 L110 104 Z" fill={withAlpha(dark, 0.5)} />
          <path d="M20 108 H110" stroke={withAlpha(deep, 0.4)} strokeWidth="1.2" />
          <path d="M24 116 q14 -6 28 0 t28 0 t24 0" fill="none" stroke={withAlpha(deep, 0.35)} strokeWidth="1.2" />
          <text x="65" y="36" textAnchor="middle" fontSize="13" fill={withAlpha(deep, 0.6)} fontFamily="serif">
            九寨
          </text>
        </svg>
      )

    /* ------------------------- 回形针 / 夹子 ------------------------- */
    case 'paperClip':
      return (
        <svg viewBox="0 0 54 120" {...common}>
          <path
            d="M40 26 v54 a13 13 0 0 1 -26 0 V38 a9 9 0 0 1 18 0 v44 a5 5 0 0 1 -10 0 V44"
            fill="none"
            stroke={dark}
            strokeWidth="5.5"
            strokeLinecap="round"
          />
          <path
            d="M40 26 v54 a13 13 0 0 1 -26 0 V38 a9 9 0 0 1 18 0 v44 a5 5 0 0 1 -10 0 V44"
            fill="none"
            stroke={light}
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.75"
          />
        </svg>
      )

    case 'binderClip':
      return (
        <svg viewBox="0 0 76 84" {...common}>
          <path d="M14 26 h48 l-5 52 a4 4 0 0 1 -4 4 H23 a4 4 0 0 1 -4 -4 Z" fill={dark} />
          <rect x="12" y="20" width="52" height="10" rx="3" fill={shade(tint, -0.4)} />
          <path d="M26 20 V6 a6 6 0 0 1 6 -6 h12 a6 6 0 0 1 6 6 v14" fill="none" stroke={deep} strokeWidth="4" strokeLinecap="round" />
          <path d="M18 34 h40" stroke={withAlpha(light, 0.3)} strokeWidth="2" />
        </svg>
      )

    case 'cornerTape':
      return (
        <svg viewBox="0 0 92 92" {...common}>
          <path d="M0 0 L92 0 L92 26 L26 26 L26 92 L0 92 Z" fill={withAlpha(tint, 0.92)} />
          <path d="M0 0 L92 0 L92 26 L26 26 L26 92 L0 92 Z" fill="none" stroke={withAlpha(deep, 0.22)} strokeWidth="1.2" />
          <path d="M4 4 L88 4" stroke={withAlpha(deep, 0.12)} strokeWidth="1.5" />
          <path d="M4 4 L4 88" stroke={withAlpha(deep, 0.12)} strokeWidth="1.5" />
        </svg>
      )

    /* ------------------------- 图钉 ------------------------- */
    case 'pushPin':
      return (
        <svg viewBox="0 0 60 66" {...common}>
          <ellipse cx="30" cy="60" rx="11" ry="4" fill="rgba(0,0,0,0.18)" />
          <path d="M29 26 L27 60 h6 L31 26 Z" fill={shade(tint, -0.45)} />
          <circle cx="30" cy="21" r="17" fill={tint} />
          <circle cx="30" cy="21" r="17" fill="none" stroke={shade(tint, -0.35)} strokeWidth="1.5" />
          <ellipse cx="24" cy="15" rx="6" ry="4.5" fill={withAlpha('#ffffff', 0.55)} transform="rotate(-28 24 15)" />
        </svg>
      )

    case 'mapPin':
      return (
        <svg viewBox="0 0 58 74" {...common}>
          <path
            d="M29 72 C29 72 52 44 52 28 A23 23 0 1 0 6 28 C6 44 29 72 29 72 Z"
            fill={tint}
            stroke={shade(tint, -0.3)}
            strokeWidth="1.5"
          />
          <circle cx="29" cy="27" r="9" fill="#ffffff" opacity="0.9" />
          <ellipse cx="21" cy="17" rx="5" ry="3.5" fill="rgba(255,255,255,0.45)" transform="rotate(-30 21 17)" />
        </svg>
      )

    /* ------------------------- 自然 ------------------------- */
    case 'sun':
      return (
        <svg viewBox="0 0 84 84" {...common}>
          <circle cx="42" cy="42" r="17" fill={tint} opacity="0.95" />
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i * Math.PI) / 4
            return (
              <line
                key={i}
                x1={42 + Math.cos(a) * 24}
                y1={42 + Math.sin(a) * 24}
                x2={42 + Math.cos(a) * 34}
                y2={42 + Math.sin(a) * 34}
                stroke={tint}
                strokeWidth="3.4"
                strokeLinecap="round"
                opacity="0.85"
              />
            )
          })}
        </svg>
      )

    case 'cloud':
      return (
        <svg viewBox="0 0 110 66" {...common}>
          <path
            d="M28 56 a17 17 0 0 1 -1 -34 a22 22 0 0 1 41 -6 a16 16 0 0 1 20 15 a14 14 0 0 1 -3 25 Z"
            fill={tint}
            opacity="0.92"
          />
          <path
            d="M28 56 a17 17 0 0 1 -1 -34 a22 22 0 0 1 41 -6 a16 16 0 0 1 20 15 a14 14 0 0 1 -3 25"
            fill="none"
            stroke={shade(tint, -0.16)}
            strokeWidth="1.4"
          />
        </svg>
      )

    /* ------------------------- 符号 ------------------------- */
    case 'heart':
      return (
        <svg viewBox="0 0 64 58" {...common}>
          <path
            d="M32 55 C32 55 4 38 4 20 A15 15 0 0 1 32 12 A15 15 0 0 1 60 20 C60 38 32 55 32 55 Z"
            fill={tint}
          />
          <path
            d="M32 55 C32 55 4 38 4 20 A15 15 0 0 1 32 12 A15 15 0 0 1 60 20 C60 38 32 55 32 55 Z"
            fill="none"
            stroke={shade(tint, -0.22)}
            strokeWidth="1.2"
          />
          <ellipse cx="20" cy="20" rx="5" ry="3.4" fill="rgba(255,255,255,0.4)" transform="rotate(-32 20 20)" />
        </svg>
      )

    case 'star':
      return (
        <svg viewBox="0 0 60 60" {...common}>
          <path
            d="M30 3 L37 22 L57 22 L41 34 L47 54 L30 42 L13 54 L19 34 L3 22 L23 22 Z"
            fill={tint}
            stroke={shade(tint, -0.24)}
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
      )

    case 'sparkle':
      return (
        <svg viewBox="0 0 52 52" {...common}>
          <path d="M26 2 C28 16 30 18 44 20 C30 22 28 24 26 38 C24 24 22 22 8 20 C22 18 24 16 26 2 Z" fill={tint} />
          <path d="M40 34 C41 39 42 40 47 41 C42 42 41 43 40 48 C39 43 38 42 33 41 C38 40 39 39 40 34 Z" fill={tint} opacity="0.8" />
        </svg>
      )

    case 'quoteMark':
      return (
        <svg viewBox="0 0 70 52" {...common}>
          <path d="M4 46 C4 24 14 8 30 2 L34 10 C22 16 17 24 17 32 h13 v14 Z" fill={tint} opacity="0.85" />
          <path d="M38 46 C38 24 48 8 64 2 L68 10 C56 16 51 24 51 32 h13 v14 Z" fill={tint} opacity="0.55" />
        </svg>
      )

    /* ------------------------- 旅行 ------------------------- */
    case 'ticket':
      return (
        <svg viewBox="0 0 190 84" preserveAspectRatio="none" {...common}>
          <path
            d="M4 6 H186 V30 a12 12 0 0 0 0 24 V78 H4 V54 a12 12 0 0 0 0 -24 Z"
            fill={shade(tint, 0.2)}
            stroke={withAlpha(deep, 0.28)}
            strokeWidth="1.2"
            strokeDasharray="1 0"
          />
          <path d="M46 8 V76" stroke={withAlpha(deep, 0.3)} strokeWidth="1" strokeDasharray="4 5" />
          <path d="M150 8 V76" stroke={withAlpha(deep, 0.3)} strokeWidth="1" strokeDasharray="4 5" />
          <circle cx="46" cy="42" r="7" fill="#f7f3ea" opacity="0.9" />
          <circle cx="150" cy="42" r="7" fill="#f7f3ea" opacity="0.9" />
          <rect x="56" y="16" width="86" height="3" fill={withAlpha(deep, 0.22)} />
          <rect x="56" y="28" width="62" height="3" fill={withAlpha(deep, 0.18)} />
          <rect x="56" y="52" width="74" height="3" fill={withAlpha(deep, 0.18)} />
          <rect x="56" y="64" width="48" height="3" fill={withAlpha(deep, 0.14)} />
          <rect x="16" y="30" width="18" height="24" fill={withAlpha(deep, 0.16)} />
        </svg>
      )

    case 'luggageTag':
      return (
        <svg viewBox="0 0 110 150" {...common}>
          <path d="M55 12 l8 10 h-16 z" fill="none" />
          <circle cx="55" cy="18" r="8" fill="none" stroke={deep} strokeWidth="3" />
          <path d="M20 26 H90 L84 138 a6 6 0 0 1 -6 6 H32 a6 6 0 0 1 -6 -6 Z" fill={shade(tint, 0.16)} stroke={withAlpha(deep, 0.3)} strokeWidth="1.3" />
          <rect x="34" y="48" width="42" height="4" fill={withAlpha(deep, 0.25)} />
          <rect x="34" y="64" width="30" height="4" fill={withAlpha(deep, 0.2)} />
          <rect x="34" y="96" width="42" height="4" fill={withAlpha(deep, 0.2)} />
          <rect x="34" y="112" width="24" height="4" fill={withAlpha(deep, 0.16)} />
        </svg>
      )

    case 'compass':
      return (
        <svg viewBox="0 0 88 88" {...common}>
          <circle cx="44" cy="44" r="38" fill="none" stroke={tint} strokeWidth="2.4" />
          <circle cx="44" cy="44" r="30" fill="none" stroke={tint} strokeWidth="1" opacity="0.6" />
          {Array.from({ length: 4 }).map((_, i) => {
            const a = (i * Math.PI) / 2
            return (
              <line
                key={i}
                x1={44 + Math.cos(a) * 30}
                y1={44 + Math.sin(a) * 30}
                x2={44 + Math.cos(a) * 38}
                y2={44 + Math.sin(a) * 38}
                stroke={tint}
                strokeWidth="3"
              />
            )
          })}
          <path d="M44 12 L52 44 L44 76 L36 44 Z" fill={tint} opacity="0.85" />
          <path d="M12 44 L44 52 L76 44 L44 36 Z" fill={tint} opacity="0.4" />
          <text x="44" y="24" textAnchor="middle" fontSize="11" fill={tint} fontFamily="serif">
            N
          </text>
        </svg>
      )

    /* ------------------------- 线条 / 箭头 ------------------------- */
    case 'arrowCurve':
      return (
        <svg viewBox="0 0 150 80" preserveAspectRatio="none" {...common}>
          <path
            d="M8 66 C24 22 74 6 130 30"
            fill="none"
            stroke={tint}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeDasharray="0 0"
          />
          <path d="M118 20 L136 31 L116 40" fill="none" stroke={tint} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )

    case 'arrowStraight':
      return (
        <svg viewBox="0 0 160 40" preserveAspectRatio="none" {...common}>
          <path d="M6 22 C46 16 96 24 140 19" fill="none" stroke={tint} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M128 10 L146 19 L127 29" fill="none" stroke={tint} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )

    case 'roughUnderline':
      return (
        <svg viewBox="0 0 200 26" preserveAspectRatio="none" {...common}>
          <path d="M4 14 C50 8 100 18 196 11" fill="none" stroke={tint} strokeWidth="3.2" strokeLinecap="round" opacity="0.9" />
          <path d="M18 21 C70 16 120 23 180 18" fill="none" stroke={tint} strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
        </svg>
      )

    case 'divider':
      return (
        <svg viewBox="0 0 220 24" preserveAspectRatio="none" {...common}>
          <path d="M6 12 H92" stroke={tint} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M128 12 H214" stroke={tint} strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="110" cy="12" r="3.6" fill="none" stroke={tint} strokeWidth="1.4" />
          <circle cx="100" cy="12" r="1.6" fill={tint} />
          <circle cx="120" cy="12" r="1.6" fill={tint} />
        </svg>
      )

    case 'scribble':
      return (
        <svg viewBox="0 0 170 60" preserveAspectRatio="none" {...common}>
          <path
            d="M8 40 C26 8 44 52 62 20 C80 -4 96 50 116 24 C132 4 146 34 162 18"
            fill="none"
            stroke={tint}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      )

    default:
      return null
  }
}

export const StickerSvg = memo(StickerSvgImpl)
