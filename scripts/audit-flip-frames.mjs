/**
 * 验收：把纸板**定格**在动画时间线上的若干进度点，逐帧截图。
 *
 * 说明：`?sampleAt=<帧号>` 与 `?flip=&hold=` 是同一套定格机制 ——
 * 它按 `easeSettle(N / 总帧数)` 把 progress 直接置到该帧**应当**有的值，
 * 并不会真的播放一遍动画。因此它验证的是「单帧几何 + 页面归属」，
 * 而**不能**验证时序（页面提前切换、纸板中途消失、settleThenCommit 的
 * 双 rAF 交接都不在其中）。README 里对此有对应说明。
 *
 * 用法：node scripts/audit-flip-frames.mjs
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.SGC_URL ?? 'http://127.0.0.1:5273'
const ALBUM = process.env.SGC_ALBUM ?? 'alb_demo_jiuzhaigou'
const OUT = process.env.SGC_OUT ?? join(tmpdir(), 'sgc-frames')
const FROM_PAGE = process.env.SGC_PAGE ?? '4'

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))
if (!CHROME) {
  console.error('找不到 Chrome / Edge')
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })

/** 采样帧（真实动画按 60fps 约 55 帧走完 900ms） */
const FRAMES = [0, 4, 9, 14, 19, 24, 29, 34, 39, 45, 50, 54]

function shoot(url, out, profileName) {
  return new Promise((resolve) => {
    const child = spawn(
      CHROME,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        '--no-first-run',
        `--user-data-dir=${join(OUT, profileName)}`,
        '--window-size=1600,1000',
        '--virtual-time-budget=20000',
        `--screenshot=${out}`,
        url,
      ],
      { stdio: 'ignore' },
    )
    const timer = setTimeout(() => {
      child.kill()
      resolve(false)
    }, 90_000)
    child.on('ERROR', () => {
      clearTimeout(timer)
      resolve(false)
    })
    child.on('exit', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

console.log('真实翻页动画逐帧采样')
console.log('─'.repeat(64))

for (const [index, frame] of FRAMES.entries()) {
  const name = `t${String(frame).padStart(2, '0')}`
  const out = join(OUT, `${name}.png`)
  const url = `${BASE}/album/${ALBUM}/read/${FROM_PAGE}?sampleAt=${frame}`
  await shoot(url, out, `p-${index}`)
  const ok = existsSync(out)
  console.log(
    ok ? `  ✓ ${name}.png  ${(statSync(out).size / 1024).toFixed(0)} KB` : `  ✗ ${name} 失败`,
  )
}

console.log(`\n输出目录：${OUT}`)
