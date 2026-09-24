/**
 * 真正的解析钩子实现（由 ts-resolve.mjs 注册）。
 *
 * 补上两类 Vite 支持、而 Node 原生不支持的解析规则：
 *   1. `@/lib/geometry` → <root>/src/lib/geometry.ts
 *   2. `./geometry`      → ./geometry.ts（省略扩展名）
 */

import { existsSync, statSync, readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve as resolvePath } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolvePath(HERE, '..')
const SRC_ROOT = resolvePath(PROJECT_ROOT, 'src')

/** src 下的模块索引：不含扩展名的相对路径 → 绝对文件路径 */
const SOURCE_INDEX = (() => {
  const index = new Map()
  const walk = (dir, rel = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(resolvePath(dir, entry.name), nextRel)
      else if (/\.tsx?$/.test(entry.name)) {
        index.set(nextRel.replace(/\.tsx?$/, ''), resolvePath(dir, entry.name))
      }
    }
  }
  try {
    walk(SRC_ROOT)
  } catch {
    /* src 不存在时留空 */
  }
  return index
})()

function resolveWithExtensions(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}/index.ts`,
    `${basePath}/index.tsx`,
  ]
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
    } catch {
      /* 忽略无权限等情况 */
    }
  }
  return null
}

function resolveAlias(specifier) {
  if (!specifier.startsWith('@/')) return null
  const bare = specifier.slice(2).replace(/\.tsx?$/, '')
  return resolveWithExtensions(resolvePath(SRC_ROOT, bare)) ?? SOURCE_INDEX.get(bare) ?? null
}

function resolveBare(specifier) {
  const bare = specifier.replace(/\.tsx?$/, '')
  return SOURCE_INDEX.get(bare) ?? resolveWithExtensions(resolvePath(SRC_ROOT, bare))
}

export async function resolve(specifier, context, nextResolve) {
  const aliased = resolveAlias(specifier)
  if (aliased) return { url: pathToFileURL(aliased).href, shortCircuit: true }

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (context.parentURL?.startsWith('file:')) {
      const target = resolveWithExtensions(
        resolvePath(dirname(fileURLToPath(context.parentURL)), specifier),
      )
      if (target) return { url: pathToFileURL(target).href, shortCircuit: true }
    }
  } else if (!specifier.startsWith('node:') && !specifier.startsWith('data:')) {
    const target = resolveBare(specifier)
    if (target) return { url: pathToFileURL(target).href, shortCircuit: true }
  }

  return nextResolve(specifier, context)
}
