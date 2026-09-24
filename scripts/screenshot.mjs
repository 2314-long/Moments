/**
 * 开发用截图脚本。
 *
 * 用途：在没有人盯着浏览器的时候，快速确认页面确实渲染出来了，
 * 以及视觉上没有明显崩坏（这也是本项目开发过程中的主要验证手段）。
 *
 * 用法：
 *   node scripts/screenshot.mjs <url-path> <输出文件> [宽] [高] [等待毫秒]
 *
 * 注意：
 *  - 用 stdio: 'inherit' 启动 Chrome，不通过管道捕获子进程输出；
 *  - --virtual-time-budget 让页面在「空闲」时快速推进虚拟时间，
 *    因此页面里不能有无限循环的 CSS 动画（否则永远不进入 idle）。
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const [, , urlPath = '/', outArg = 'shot.png', w = '1600', h = '1000', wait = '9000'] = process.argv

const BASE = process.env.SGC_URL ?? 'http://127.0.0.1:5273'
const out = resolve(outArg)

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!chrome) {
  console.error('找不到 Chrome / Edge，可用 CHROME_PATH 环境变量指定')
  process.exit(1)
}

mkdirSync(dirname(out), { recursive: true })
const profile = resolve(dirname(out), 'chrome-profile')

const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  `--user-data-dir=${profile}`,
  `--window-size=${w},${h}`,
  `--virtual-time-budget=${wait}`,
  `--screenshot=${out}`,
  `${BASE}${urlPath}`,
]

console.log(`→ ${BASE}${urlPath}`)

const child = spawn(process.env.CHROME_PATH ?? chrome, args, { stdio: 'inherit' })

child.on('exit', (code) => {
  if (existsSync(out)) {
    console.log(`✓ ${out}  (${(statSync(out).size / 1024).toFixed(0)} KB)`)
    process.exit(0)
  }
  console.error(`✗ 截图失败（Chrome 退出码 ${code}）`)
  process.exit(1)
})
