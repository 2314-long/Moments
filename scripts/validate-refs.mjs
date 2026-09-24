/**
 * 引用一致性校验。
 *
 * 手写的 demo 数据里有大量「按 id 引用」的地方（贴纸、照片），
 * 一旦写错一个 id，运行时才会抛异常并且整个页面白屏 ——
 * 这类错误在截图里只表现为「一片黑」，非常难排查。
 *
 * 这个脚本把所有引用关系静态扫一遍，让这类问题在开发阶段就暴露。
 *
 * 用法：node scripts/validate-refs.mjs
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const problems = []
const notes = []

/* ---------- 1. 贴纸：库里定义了哪些 id ---------- */
const stickerLib = read('src/lib/stickerLibrary.ts')
const definedStickerIds = new Set(
  [...stickerLib.matchAll(/\{\s*id:\s*'([^']+)'/g)].map((m) => m[1]),
)
// svgId 也必须指向 StickerSvg 里真实实现的 case
const svgIds = new Set(
  [...stickerLib.matchAll(/svgId:\s*'([^']+)'/g)].map((m) => m[1]),
)
const stickerSvgSrc = read('src/components/stickers/StickerSvg.tsx')
const implementedSvgIds = new Set(
  [...stickerSvgSrc.matchAll(/case\s+'([^']+)':/g)].map((m) => m[1]),
)

notes.push(`贴纸库：${definedStickerIds.size} 个定义，${svgIds.size} 个 svgId 引用`)
for (const id of svgIds) {
  if (!implementedSvgIds.has(id)) {
    problems.push(`贴纸 svgId「${id}」在 StickerSvg.tsx 中没有对应实现`)
  }
}

/* ---------- 2. 扫描所有源代码里的 sticker('xxx') 调用 ---------- */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) out.push(...walk(rel))
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel)
  }
  return out
}

const files = walk('src')
const usedStickerIds = new Map()
for (const file of files) {
  const src = read(file)
  for (const match of src.matchAll(/sticker\(\s*'([^']+)'/g)) {
    const id = match[1]
    if (!usedStickerIds.has(id)) usedStickerIds.set(id, [])
    usedStickerIds.get(id).push(file)
  }
  for (const match of src.matchAll(/addStickerElement\(\s*'([^']+)'/g)) {
    const id = match[1]
    if (!usedStickerIds.has(id)) usedStickerIds.set(id, [])
    usedStickerIds.get(id).push(file)
  }
}

notes.push(`代码中引用了 ${usedStickerIds.size} 个不同的贴纸 id`)
for (const [id, where] of usedStickerIds) {
  if (!definedStickerIds.has(id)) {
    problems.push(`引用了未定义的贴纸 id「${id}」 ← ${[...new Set(where)].join(', ')}`)
  }
}

/* ---------- 3. 照片：demo 清单 vs seed 引用 ---------- */
const demoPhotosSrc = read('src/data/demoPhotos.ts')
const definedPhotoIds = new Set(
  [...demoPhotosSrc.matchAll(/\{\s*id:\s*'(ph_[^']+)'/g)].map((m) => m[1]),
)

const seedSrc = read('src/data/seed.ts')
const usedPhotoIds = new Set([...seedSrc.matchAll(/photo\(\s*'([^']+)'/g)].map((m) => m[1]))
const groupingRefs = new Set(
  [...seedSrc.matchAll(/\bg\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]),
)

notes.push(`demo 照片清单：${definedPhotoIds.size} 张；seed 引用了 ${usedPhotoIds.size} 张`)
for (const id of usedPhotoIds) {
  if (!definedPhotoIds.has(id)) problems.push(`seed 引用了不存在的照片 id「${id}」`)
}
for (const id of groupingRefs) {
  if (!definedPhotoIds.has(id)) problems.push(`g('${id}') 引用了不存在的照片 id`)
}
for (const id of definedPhotoIds) {
  if (!usedPhotoIds.has(id)) notes.push(`提示：照片「${id}」在 demo 页面中未被使用`)
}

/* ---------- 4. demo 素材文件是否真的存在 ---------- */
const assetDir = join(root, 'public', 'demo')
let assetFiles = []
try {
  assetFiles = readdirSync(assetDir)
} catch {
  problems.push('public/demo 目录不存在，请先运行 node scripts/generate-demo-assets.mjs')
}
for (const file of assetFiles) {
  if (!file.endsWith('.png')) continue
  const id = `ph_${file.replace(/\.png$/, '').replace(/-/g, '_')}`
  if (!definedPhotoIds.has(id)) {
    // 命名规则可能不一致，只在完全找不到时才提示
    notes.push(`提示：素材文件 ${file} 没有对应的 demo 照片条目`)
  }
}
for (const [, url] of demoPhotosSrc.matchAll(/url:\s*'(\/demo\/[^']+)'/g)) {
  const name = url.replace('/demo/', '')
  if (!assetFiles.includes(name)) {
    problems.push(`照片文件缺失：${url}（请运行 node scripts/generate-demo-assets.mjs）`)
  }
}

/* ---------- 5. 字体 key 校验 ---------- */
const tokensSrc = read('src/lib/designTokens.ts')
const fontKeys = new Set(
  [...tokensSrc.matchAll(/^\s{2}(sans|serif|hand|handen|mono):/gm)].map((m) => m[1]),
)
for (const match of tokensSrc.matchAll(/fontFamily:\s*'([a-z]+)'/g)) {
  if (!fontKeys.has(match[1])) {
    problems.push(`TEXT_PRESETS 引用了未定义的字体 key「${match[1]}」`)
  }
}

/* ---------- 输出 ---------- */
console.log('引用一致性校验')
console.log('─'.repeat(48))
for (const note of notes) console.log(`  · ${note}`)

if (problems.length) {
  console.log(`\n发现 ${problems.length} 个问题：`)
  for (const problem of problems) console.log(`  ✗ ${problem}`)
  process.exit(1)
}

console.log('\n✓ 所有引用一致')
