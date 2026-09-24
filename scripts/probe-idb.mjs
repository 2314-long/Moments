/**
 * 无头环境下 IndexedDB 可用性探测。
 *
 * 某些无头 / 沙箱化的浏览器环境里，indexedDB.open 的请求会永远挂着：
 * 既不触发 onsuccess，也不触发 onerror。这个脚本用来确认当前环境
 * 属于哪一种情况，从而决定应用该不该依赖它。
 *
 * 实现说明：不通过管道捕获 Chrome 输出（沙箱环境禁止管道），
 * 而是让 PowerShell 用 > 重定向到文件后再读取。
 *
 * 用法：node scripts/probe-idb.mjs
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!chrome) {
  console.error('未找到浏览器')
  process.exit(1)
}

const dir = join(tmpdir(), 'sgc-idb-probe')
mkdirSync(dir, { recursive: true })

const page = `<!doctype html><meta charset="utf-8"><body>
<pre id="out">running</pre>
<script>
  const out = document.getElementById('out')
  const log = (m) => { out.textContent += '\\n' + m }
  out.textContent = 'typeof indexedDB = ' + (typeof indexedDB)
  let settled = false
  try {
    const req = indexedDB.open('probe-db', 1)
    req.onupgradeneeded = () => log('onupgradeneeded')
    req.onsuccess = () => { settled = true; log('SUCCESS opened') }
    req.onerror = () => { settled = true; log('ERROR ' + (req.error && req.error.name)) }
    req.onblocked = () => log('onblocked')
  } catch (e) {
    settled = true
    log('THROW ' + e.message)
  }
  setTimeout(function () { if (!settled) log('TIMEOUT no callback within 2s') }, 2000)
  setTimeout(function () { log('finished') }, 2800)
</script>
</body>`

const pagePath = join(dir, 'probe.html')
writeFileSync(pagePath, page, 'utf8')
const domPath = join(dir, 'dom.txt')
const fileUrl = `file:///${pagePath.replace(/\\/g, '/')}`

const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--allow-file-access-from-files',
  `--user-data-dir=${join(dir, 'profile')}`,
  '--window-size=900,420',
  '--virtual-time-budget=9000',
  '--dump-dom',
  fileUrl,
]

console.log('探测 IndexedDB 中…')
spawnSync(
  'pwsh',
  ['-NoProfile', '-Command', `& '${chrome}' ${args.map((a) => `'${a}'`).join(' ')} > '${domPath}' 2>$null`],
  { stdio: 'inherit' },
)

const dom = existsSync(domPath) ? readFileSync(domPath, 'utf8') : ''
const match = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)
console.log('\n--- 探测结果 ---')
console.log(match ? match[1].trim() : dom.slice(0, 600) || '(无输出)')
