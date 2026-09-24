/**
 * Demo 素材生成器 —— 纯 Node，无第三方依赖。
 *
 * 为什么自己写 PNG 编码器：
 *  1. 不希望 demo 依赖外部图片 CDN（离线也要能完整运行）；
 *  2. 不希望仓库里塞几十张二进制照片；
 *  3. 程序化生成的风景/人像色块比灰色占位图更接近真实排版效果，
 *     能真实检验照片相框、裁切、层叠阴影等视觉细节。
 *
 * 生成结果写入 public/demo/*.jpg.png，由 seed 数据引用。
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'demo')

/* ------------------------------------------------------------------ *
 * PNG 编码
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/**
 * 索引色 PNG（color type 3）。
 *
 * demo 素材里带有大量胶片颗粒，真彩色 PNG 对这种高频噪声几乎无法压缩
 * （每张 1MB+）。量化到 128 色后视觉差异几乎不可见，体积能降到十分之一，
 * 让 26 张素材可以轻松打进仓库而不需要外部图床。
 */
function encodeIndexedPng(width, height, rgb, paletteSize = 128) {
  const pixels = width * height

  // ---- 1. 中位切分法（median cut）构建调色板 ----
  const order = new Uint32Array(pixels)
  for (let i = 0; i < pixels; i++) order[i] = i

  const palBoxes = []
  const splitBox = (start, end) => {
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0
    for (let i = start; i < end; i++) {
      const p = order[i] * 3
      if (rgb[p] < rMin) rMin = rgb[p]
      if (rgb[p] > rMax) rMax = rgb[p]
      if (rgb[p + 1] < gMin) gMin = rgb[p + 1]
      if (rgb[p + 1] > gMax) gMax = rgb[p + 1]
      if (rgb[p + 2] < bMin) bMin = rgb[p + 2]
      if (rgb[p + 2] > bMax) bMax = rgb[p + 2]
    }
    const ranges = [rMax - rMin, gMax - gMin, bMax - bMin]
    const channel = ranges.indexOf(Math.max(...ranges))
    const slice = Array.from(order.subarray(start, end))
    slice.sort((a, b) => rgb[a * 3 + channel] - rgb[b * 3 + channel])
    order.set(slice, start)
    const mid = start + ((end - start) >> 1)
    return { start, end, mid, channel }
  }

  // 迭代切分直到达到目标颜色数
  const queue = [{ start: 0, end: pixels }]
  while (queue.length < paletteSize) {
    // 取像素最多的盒子继续切
    queue.sort((a, b) => b.end - b.start - (a.end - a.start))
    const box = queue.shift()
    if (!box || box.end - box.start < 2) break
    const { mid } = splitBox(box.start, box.end)
    if (mid <= box.start || mid >= box.end) continue
    queue.push({ start: box.start, end: mid }, { start: mid, end: box.end })
  }
  palBoxes.push(...queue)

  const palette = Buffer.alloc(palBoxes.length * 3)
  palBoxes.forEach((box, bi) => {
    let r = 0, g = 0, b = 0
    const n = Math.max(1, box.end - box.start)
    for (let i = box.start; i < box.end; i++) {
      const p = order[i] * 3
      r += rgb[p]
      g += rgb[p + 1]
      b += rgb[p + 2]
    }
    palette[bi * 3] = Math.round(r / n)
    palette[bi * 3 + 1] = Math.round(g / n)
    palette[bi * 3 + 2] = Math.round(b / n)
  })

  // ---- 2. 用均匀网格做快速最近色查找 ----
  const GRID = 32
  const cache = new Int16Array(GRID * GRID * GRID).fill(-1)
  const nearest = (r, g, b) => {
    const gi = ((r >> 3) * GRID + (g >> 3)) * GRID + (b >> 3)
    const hit = cache[gi]
    if (hit >= 0) return hit
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < palBoxes.length; i++) {
      const dr = r - palette[i * 3]
      const dg = g - palette[i * 3 + 1]
      const db = b - palette[i * 3 + 2]
      const d = dr * dr + dg * dg + db * db
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    cache[gi] = best
    return best
  }

  // ---- 3. 索引位流 + 每行过滤器（用 Paeth 提升压缩率） ----
  const stride = width
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const line = Buffer.alloc(stride)
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 3
      line[x] = nearest(rgb[p], rgb[p + 1], rgb[p + 2])
    }
    // filter type 0 (None) —— 索引图用 Paeth 收益不稳定，保持简单
    raw[y * (stride + 1)] = 0
    line.copy(raw, y * (stride + 1) + 1)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 3 // color type: indexed
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const plte = chunk('PLTE', palette)
  const idat = chunk('IDAT', deflateSync(raw, { level: 9 }))

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    plte,
    idat,
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------------------------------------------ *
 * 颜色工具
 * ------------------------------------------------------------------ */

const hex = (h) => {
  const s = h.replace('#', '')
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ]
}

const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

/** 确定性伪随机，保证每次生成的 demo 素材完全一致 */
function makeRng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

/** 二维值噪声，用于山脊起伏与水面波纹 */
function makeNoise(seed) {
  const rng = makeRng(seed)
  const size = 256
  const grid = new Float32Array(size * size)
  for (let i = 0; i < grid.length; i++) grid[i] = rng()
  const at = (x, y) => grid[(y & (size - 1)) * size + (x & (size - 1))]
  const smooth = (t) => t * t * (3 - 2 * t)
  const noise1 = (x) => {
    const xi = Math.floor(x)
    const xf = smooth(x - xi)
    return at(xi, 0) * (1 - xf) + at(xi + 1, 0) * xf
  }
  const noise2 = (x, y) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = smooth(x - xi)
    const yf = smooth(y - yi)
    const a = at(xi, yi) * (1 - xf) + at(xi + 1, yi) * xf
    const b = at(xi, yi + 1) * (1 - xf) + at(xi + 1, yi + 1) * xf
    return a * (1 - yf) + b * yf
  }
  const fbm1 = (x, octaves = 4) => {
    let v = 0
    let amp = 0.5
    let freq = 1
    for (let o = 0; o < octaves; o++) {
      v += noise1(x * freq) * amp
      amp *= 0.5
      freq *= 2
    }
    return v
  }
  const fbm2 = (x, y, octaves = 4) => {
    let v = 0
    let amp = 0.5
    let freq = 1
    for (let o = 0; o < octaves; o++) {
      v += noise2(x * freq, y * freq) * amp
      amp *= 0.5
      freq *= 2
    }
    return v
  }
  return { fbm1, fbm2, rng }
}

/* ------------------------------------------------------------------ *
 * 场景绘制
 * ------------------------------------------------------------------ */

/**
 * 每个场景由若干参数描述，绘制流程是：
 *   天空渐变 → 太阳/云 → 远山 → 中景山 → 水面 → 倒影 → 前景 → 颗粒
 */
const SCENES = {
  /** 九寨沟标志性的孔雀蓝湖水 */
  lakeTurquoise: {
    sky: ['#cfe3f2', '#eaf3f7'],
    ridges: [
      { color: '#7d94a8', base: 0.46, amp: 0.06, seed: 11 },
      { color: '#5c7386', base: 0.52, amp: 0.09, seed: 22 },
      { color: '#3f5a63', base: 0.60, amp: 0.07, seed: 33 },
    ],
    water: { color: '#2f8f92', deep: '#1b5f6b', top: 0.66 },
    fore: { color: '#2c4436', amount: 0.10 },
    sun: { x: 0.74, y: 0.16, r: 0.11, color: '#fff3d4', strength: 0.5 },
    grain: 5,
  },
  /** 五花海：色彩更斑斓 */
  lakeFiveFlower: {
    sky: ['#c9dff0', '#f0f5f2'],
    ridges: [
      { color: '#8296a6', base: 0.44, amp: 0.05, seed: 41 },
      { color: '#57707e', base: 0.53, amp: 0.08, seed: 52 },
    ],
    water: { color: '#3aa0a4', deep: '#155f70', top: 0.62 },
    fore: { color: '#37503c', amount: 0.13 },
    sun: { x: 0.24, y: 0.14, r: 0.13, color: '#fff1cf', strength: 0.45 },
    grain: 5,
  },
  /** 长海：高海拔深蓝 */
  lakeDeep: {
    sky: ['#b9d3e8', '#e3eef5'],
    ridges: [
      { color: '#6d879b', base: 0.40, amp: 0.08, seed: 61 },
      { color: '#44606f', base: 0.50, amp: 0.06, seed: 72 },
    ],
    water: { color: '#245f86', deep: '#0f3350', top: 0.60 },
    fore: { color: '#25382c', amount: 0.08 },
    sun: { x: 0.8, y: 0.12, r: 0.09, color: '#ffffff', strength: 0.35 },
    grain: 4,
  },
  /** 原始森林：层叠树冠 */
  forest: {
    sky: ['#d3e4d8', '#eef4ea'],
    ridges: [
      { color: '#7f9a7f', base: 0.42, amp: 0.07, seed: 81 },
      { color: '#557a58', base: 0.50, amp: 0.10, seed: 92 },
      { color: '#33523a', base: 0.58, amp: 0.12, seed: 103 },
    ],
    water: null,
    fore: { color: '#20342a', amount: 0.22 },
    sun: { x: 0.62, y: 0.18, r: 0.10, color: '#fdf6da', strength: 0.4 },
    grain: 6,
  },
  /** 珍珠滩瀑布 */
  waterfall: {
    sky: ['#c6dbe6', '#e9f1f2'],
    ridges: [
      { color: '#7b909c', base: 0.38, amp: 0.05, seed: 121 },
      { color: '#4e6a72', base: 0.46, amp: 0.08, seed: 132 },
    ],
    water: { color: '#8fc2c4', deep: '#3d7f82', top: 0.52 },
    falls: { x: 0.36, w: 0.30, top: 0.52, bottom: 0.80, color: '#ffffff' },
    fore: { color: '#2b4438', amount: 0.12 },
    sun: null,
    grain: 6,
  },
  /** 雪山垭口 */
  snowPeak: {
    sky: ['#a9c6e0', '#dfeaf2'],
    ridges: [
      { color: '#8ea7bd', base: 0.34, amp: 0.10, seed: 141, snow: 0.55 },
      { color: '#5f7b93', base: 0.48, amp: 0.08, seed: 152 },
    ],
    water: null,
    fore: { color: '#4a5c58', amount: 0.14 },
    sun: { x: 0.7, y: 0.13, r: 0.08, color: '#ffffff', strength: 0.5 },
    grain: 4,
  },
  /** 公路 / 山路 */
  road: {
    sky: ['#cfe0ec', '#f1f4ef'],
    ridges: [
      { color: '#86989f', base: 0.40, amp: 0.05, seed: 161 },
      { color: '#5d7368', base: 0.48, amp: 0.07, seed: 172 },
    ],
    water: null,
    road: { color: '#4c4c4c', top: 0.52 },
    fore: { color: '#3d5741', amount: 0.10 },
    sun: { x: 0.18, y: 0.16, r: 0.12, color: '#ffeec8', strength: 0.42 },
    grain: 5,
  },
  /** 美食 / 桌面 */
  food: {
    // 桌面场景几乎不露出天空，但渲染管线仍需要一个渐变起点
    sky: ['#7d6448', '#6b5440'],
    ridges: [],
    water: null,
    desk: { color: '#8a6f52', dark: '#5f4a37' },
    plates: [
      { x: 0.32, y: 0.46, r: 0.16, color: '#f3ede2', food: '#c9763f' },
      { x: 0.66, y: 0.58, r: 0.13, color: '#eee6d8', food: '#7d9a52' },
      { x: 0.50, y: 0.24, r: 0.10, color: '#e8dfd0', food: '#a8533c' },
    ],
    grain: 6,
  },
  /** 合影 / 人物（抽象，仅用于排版演示） */
  portrait: {
    sky: ['#c9d8e6', '#e8eef2'],
    ridges: [{ color: '#8fa3ae', base: 0.50, amp: 0.05, seed: 181 }],
    water: { color: '#7fa8b4', deep: '#527f8c', top: 0.62 },
    people: [
      { x: 0.36, h: 0.30, color: '#e8e2d6', accent: '#41556b' },
      { x: 0.52, h: 0.33, color: '#dfe6ea', accent: '#7a5348' },
      { x: 0.66, h: 0.28, color: '#e9e0cd', accent: '#3f5a63' },
    ],
    grain: 5,
  },
  portraitWarm: {
    sky: ['#e7d3b8', '#f6ecdd'],
    ridges: [{ color: '#b09a80', base: 0.52, amp: 0.05, seed: 191 }],
    water: { color: '#c8a97f', deep: '#9c7f5c', top: 0.64 },
    people: [
      { x: 0.42, h: 0.36, color: '#f2e6d2', accent: '#8a5a44' },
      { x: 0.60, h: 0.31, color: '#eddfc9', accent: '#5b6b7a' },
    ],
    grain: 6,
  },
  /** 俯瞰群海 */
  aerial: {
    sky: ['#bcd6e4', '#e6eff3'],
    ridges: [
      { color: '#7f97a4', base: 0.30, amp: 0.08, seed: 201 },
      { color: '#4d6a72', base: 0.44, amp: 0.10, seed: 212 },
      { color: '#2f4f4a', base: 0.60, amp: 0.09, seed: 223 },
    ],
    water: { color: '#3f9aa0', deep: '#20646f', top: 0.56 },
    fore: { color: '#243c32', amount: 0.10 },
    sun: { x: 0.3, y: 0.12, r: 0.1, color: '#fff6de', strength: 0.4 },
    grain: 5,
  },
  /** 夜晚 / 星空 */
  night: {
    sky: ['#1b2740', '#33496b'],
    ridges: [
      { color: '#243css', base: 0.5, amp: 0.06, seed: 231 },
      { color: '#161f30', base: 0.58, amp: 0.08, seed: 242 },
    ],
    water: { color: '#1b2f45', deep: '#0d1a28', top: 0.64 },
    stars: true,
    fore: { color: '#0d141f', amount: 0.14 },
    sun: { x: 0.76, y: 0.14, r: 0.05, color: '#f4f0e2', strength: 0.7 },
    grain: 4,
  },
}

/** 修正一个颜色笔误 */
SCENES.night.ridges[0].color = '#243c54'

function renderScene(spec, width, height, seed) {
  const { fbm1, fbm2, rng } = makeNoise(seed)
  const buf = Buffer.alloc(width * height * 3)

  const skyTop = hex(spec.sky[0])
  const skyBottom = hex(spec.sky[1])
  const water = spec.water
    ? { color: hex(spec.water.color), deep: hex(spec.water.deep), top: spec.water.top }
    : null
  const ridges = (spec.ridges ?? []).map((r) => ({
    ...r,
    rgb: hex(r.color),
    snowRgb: r.snow ? hex('#f2f6fa') : null,
  }))
  const fore = spec.fore ? { rgb: hex(spec.fore.color), amount: spec.fore.amount } : null
  const sun = spec.sun ? { ...spec.sun, rgb: hex(spec.sun.color) } : null
  const road = spec.road ? { ...spec.road, rgb: hex(spec.road.color) } : null
  const falls = spec.falls ? { ...spec.falls, rgb: hex(spec.falls.color) } : null

  const px = (x, y, color, alpha = 1) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = (y * width + x) * 3
    if (alpha >= 1) {
      buf[i] = color[0]
      buf[i + 1] = color[1]
      buf[i + 2] = color[2]
    } else {
      buf[i] += (color[0] - buf[i]) * alpha
      buf[i + 1] += (color[1] - buf[i + 1]) * alpha
      buf[i + 2] += (color[2] - buf[i + 2]) * alpha
    }
  }

  const horizon = water ? water.top : spec.road ? spec.road.top : 0.62

  // 1. 天空
  for (let y = 0; y < height; y++) {
    const t = Math.min(1, y / (height * horizon + 1))
    const base = mix(skyTop, skyBottom, t)
    for (let x = 0; x < width; x++) {
      let c = base
      if (sun) {
        const dx = (x / width - sun.x) * (width / height)
        const dy = y / height - sun.y
        const d = Math.hypot(dx, dy)
        const glow = Math.max(0, 1 - d / (sun.r * 3.2))
        if (glow > 0) c = mix(c, sun.rgb, glow * glow * sun.strength)
      }
      px(x, y, c)
    }
  }

  // 2. 星空
  if (spec.stars) {
    for (let i = 0; i < 220; i++) {
      const sx = Math.floor(rng() * width)
      const sy = Math.floor(rng() * height * 0.5)
      const b = 0.4 + rng() * 0.6
      px(sx, sy, mix(buf.slice((sy * width + sx) * 3, (sy * width + sx) * 3 + 3), [255, 255, 255], b), 0.85)
    }
  }

  // 3. 云的柔和横条
  for (let y = 0; y < height * horizon; y++) {
    const cloud = fbm2(y / 26, 3.1, 3)
    if (cloud > 0.62) {
      const a = (cloud - 0.62) * 1.6
      for (let x = 0; x < width; x++) {
        if (fbm2(x / 90, y / 22, 3) > 0.5) {
          const i = (y * width + x) * 3
          px(x, y, [buf[i], buf[i + 1], buf[i + 2]], 0)
          buf[i] += (255 - buf[i]) * a * 0.5
          buf[i + 1] += (255 - buf[i + 1]) * a * 0.5
          buf[i + 2] += (255 - buf[i + 2]) * a * 0.5
        }
      }
    }
  }

  // 4. 山脊（从远到近）
  for (const ridge of ridges) {
    for (let x = 0; x < width; x++) {
      const n = fbm1(x / 150 + ridge.seed, 4)
      const ridgeY = (ridge.base + (n - 0.5) * ridge.amp * 2) * height
      for (let y = Math.floor(ridgeY); y < height * horizon + 2; y++) {
        let c = ridge.rgb
        if (ridge.snowRgb) {
          const snowLine = ridgeY + height * 0.02
          if (y < snowLine + height * 0.05) {
            const t = 1 - (y - ridgeY) / (height * 0.07)
            c = mix(ridge.rgb, ridge.snowRgb, Math.max(0, Math.min(1, t)) * 0.9)
          }
        }
        // 山体明暗：左侧受光
        const shadeT = 0.82 + 0.3 * (1 - x / width) + (fbm2(x / 40, y / 40, 2) - 0.5) * 0.16
        px(x, y, [c[0] * shadeT, c[1] * shadeT, c[2] * shadeT])
      }
    }
  }

  // 5. 水面 + 倒影
  if (water) {
    const top = Math.floor(height * water.top)
    for (let y = top; y < height; y++) {
      const t = (y - top) / Math.max(1, height - top)
      const base = mix(water.color, water.deep, t * 0.85)
      for (let x = 0; x < width; x++) {
        // 倒影：把上方山体颜色镜像下来并加波纹
        const mirrorY = Math.max(0, top - (y - top) * 1.5)
        const mi = (Math.floor(mirrorY) * width + x) * 3
        const ripple = (fbm2(x / 50, y / 7, 3) - 0.5) * 0.28
        const refl = 0.30 + ripple
        let c = mix(base, [buf[mi], buf[mi + 1], buf[mi + 2]], Math.max(0, refl))
        // 水面高光
        const sparkle = fbm2(x / 24, y / 4, 2)
        if (sparkle > 0.7) c = mix(c, [255, 255, 255], (sparkle - 0.7) * 0.9)
        px(x, y, c)
      }
    }
  }

  // 6. 瀑布
  if (falls) {
    const top = Math.floor(height * falls.top)
    const bottom = Math.floor(height * falls.bottom)
    const x0 = Math.floor(width * falls.x)
    const x1 = Math.floor(width * (falls.x + falls.w))
    for (let y = top; y < bottom; y++) {
      for (let x = x0; x < x1; x++) {
        const strip = fbm2(x / 9, y / 40, 3)
        const a = 0.35 + strip * 0.6
        px(x, y, falls.rgb, Math.min(1, a))
      }
    }
    // 水雾
    for (let y = bottom; y < Math.min(height, bottom + height * 0.1); y++) {
      const t = 1 - (y - bottom) / (height * 0.1)
      for (let x = x0 - 20; x < x1 + 20; x++) {
        px(x, y, [230, 240, 242], t * 0.35)
      }
    }
  }

  // 7. 公路
  if (road) {
    const top = Math.floor(height * road.top)
    for (let y = top; y < height; y++) {
      const t = (y - top) / Math.max(1, height - top)
      const halfW = width * (0.02 + t * 0.34)
      const cx = width * 0.5 + (1 - t) * width * 0.1
      for (let x = Math.floor(cx - halfW); x < cx + halfW; x++) {
        const edge = Math.abs(x - cx) / halfW
        let c = road.rgb
        if (edge > 0.88) c = [180, 180, 175]
        else if (Math.abs(edge - 0.5) < 0.03 && Math.floor(y / 22) % 2 === 0) c = [225, 220, 200]
        const shadeT = 0.9 + edge * 0.18
        px(x, y, [c[0] * shadeT, c[1] * shadeT, c[2] * shadeT])
      }
    }
  }

  // 8. 桌面 / 食物
  if (spec.desk) {
    const dark = hex(spec.desk.dark)
    const base = hex(spec.desk.color)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const wood = fbm2(x / 70, y / 9, 3)
        px(x, y, mix(base, dark, wood * 0.7))
      }
    }
    for (const plate of spec.plates ?? []) {
      const cx = plate.x * width
      const cy = plate.y * height
      const r = plate.r * width
      const foodRgb = hex(plate.food)
      const plateRgb = hex(plate.color)
      for (let y = Math.floor(cy - r); y <= cy + r; y++) {
        for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          const d = Math.hypot(x - cx, y - cy)
          if (d > r) continue
          const edge = d / r
          const isFood = edge < 0.58
          let c = isFood ? foodRgb : plateRgb
          const shadeT = 0.72 + (1 - edge) * 0.5 + (fbm2(x / 12, y / 12, 2) - 0.5) * 0.2
          px(x, y, [c[0] * shadeT, c[1] * shadeT, c[2] * shadeT], 0.97)
        }
      }
    }
  }

  // 9. 前景剪影（草地 / 树丛）
  if (fore) {
    for (let x = 0; x < width; x++) {
      const n = fbm1(x / 90 + seed * 0.01, 3)
      const top = height * (1 - fore.amount * (0.6 + n * 0.8))
      for (let y = Math.floor(top); y < height; y++) {
        const t = (y - top) / Math.max(1, height - top)
        px(x, y, fore.rgb, 0.55 + t * 0.45)
      }
    }
  }

  // 10. 人物剪影
  if (spec.people) {
    for (const person of spec.people) {
      const cx = person.x * width
      const h = person.h * height
      const baseY = height * 0.9
      const bodyRgb = hex(person.color)
      const accentRgb = hex(person.accent)
      // 身体
      for (let y = Math.floor(baseY - h); y < baseY; y++) {
        const t = (baseY - y) / h
        const w = width * 0.035 * (1.15 - t * 0.3)
        for (let x = Math.floor(cx - w); x <= cx + w; x++) {
          const c = t > 0.72 ? accentRgb : bodyRgb
          const shadeT = 0.86 + (1 - Math.abs(x - cx) / w) * 0.22
          px(x, y, [c[0] * shadeT, c[1] * shadeT, c[2] * shadeT])
        }
      }
      // 头
      const headR = width * 0.019
      const headY = baseY - h - headR * 0.85
      for (let y = Math.floor(headY - headR); y <= headY + headR; y++) {
        for (let x = Math.floor(cx - headR); x <= cx + headR; x++) {
          const d = Math.hypot(x - cx, y - headY)
          if (d > headR) continue
          const c = mix([232, 208, 184], [40, 32, 28], 0.75)
          px(x, y, c)
        }
      }
    }
  }

  // 11. 胶片颗粒 + 暗角
  const grain = spec.grain ?? 5
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      const g = (rng() - 0.5) * grain
      // 暗角
      const dx = x / width - 0.5
      const dy = y / height - 0.5
      const v = 1 - Math.max(0, (Math.hypot(dx, dy) - 0.34)) * 0.55
      buf[i] = Math.max(0, Math.min(255, (buf[i] + g) * v))
      buf[i + 1] = Math.max(0, Math.min(255, (buf[i + 1] + g) * v))
      buf[i + 2] = Math.max(0, Math.min(255, (buf[i + 2] + g) * v))
    }
  }

  return buf
}

/* ------------------------------------------------------------------ *
 * 素材清单
 * ------------------------------------------------------------------ */

const SIZES = {
  wide: [1280, 854],
  tall: [900, 1200],
  square: [1000, 1000],
  standard: [1200, 900],
}

const ASSETS = [
  { name: 'lake-01', scene: 'lakeTurquoise', size: 'wide', seed: 1001 },
  { name: 'lake-02', scene: 'lakeFiveFlower', size: 'standard', seed: 1002 },
  { name: 'lake-03', scene: 'lakeDeep', size: 'wide', seed: 1003 },
  { name: 'lake-04', scene: 'aerial', size: 'wide', seed: 1004 },
  { name: 'lake-05', scene: 'lakeTurquoise', size: 'square', seed: 1005 },
  { name: 'forest-01', scene: 'forest', size: 'tall', seed: 2001 },
  { name: 'forest-02', scene: 'forest', size: 'wide', seed: 2002 },
  { name: 'forest-03', scene: 'forest', size: 'standard', seed: 2003 },
  { name: 'falls-01', scene: 'waterfall', size: 'standard', seed: 3001 },
  { name: 'falls-02', scene: 'waterfall', size: 'wide', seed: 3002 },
  { name: 'peak-01', scene: 'snowPeak', size: 'wide', seed: 4001 },
  { name: 'peak-02', scene: 'snowPeak', size: 'standard', seed: 4002 },
  { name: 'peak-03', scene: 'aerial', size: 'tall', seed: 4003 },
  { name: 'road-01', scene: 'road', size: 'wide', seed: 5001 },
  { name: 'road-02', scene: 'road', size: 'standard', seed: 5002 },
  { name: 'people-01', scene: 'portrait', size: 'square', seed: 6001 },
  { name: 'people-02', scene: 'portrait', size: 'standard', seed: 6002 },
  { name: 'people-03', scene: 'portraitWarm', size: 'standard', seed: 6003 },
  { name: 'people-04', scene: 'portraitWarm', size: 'square', seed: 6004 },
  { name: 'people-05', scene: 'portrait', size: 'tall', seed: 6005 },
  { name: 'food-01', scene: 'food', size: 'square', seed: 7001 },
  { name: 'food-02', scene: 'food', size: 'standard', seed: 7002 },
  { name: 'night-01', scene: 'night', size: 'wide', seed: 8001 },
  { name: 'night-02', scene: 'night', size: 'standard', seed: 8002 },
  { name: 'lake-06', scene: 'lakeFiveFlower', size: 'wide', seed: 1006 },
  { name: 'forest-04', scene: 'forest', size: 'square', seed: 2004 },
]

function main() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const manifest = []
  for (const asset of ASSETS) {
    const spec = SCENES[asset.scene]
    if (!spec) throw new Error(`未知场景: ${asset.scene}`)
    const [w, h] = SIZES[asset.size]
    const rgb = renderScene(spec, w, h, asset.seed)
    const png = encodeIndexedPng(w, h, rgb, 128)
    writeFileSync(join(OUT_DIR, `${asset.name}.png`), png)
    manifest.push({ name: asset.name, scene: asset.scene, width: w, height: h })
    process.stdout.write(`  ✓ ${asset.name}.png  ${w}×${h}  ${(png.length / 1024).toFixed(0)}KB\n`)
  }

  writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  process.stdout.write(`\n生成完成：${manifest.length} 张 demo 素材 → public/demo/\n`)
}

main()
