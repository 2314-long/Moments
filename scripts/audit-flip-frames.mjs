/**
 * 验收：真实翻页动画的逐帧截图。
 *
 * 之前的 ?flip=&hold= 是「定格」，只能验证单帧几何，验证不了**时序**。
 * 这个脚本用 `?sampleAt=<帧号>` 让阅读器在真实动画的第 N 帧自动暂停截图，
 * 从而得到一条真实的动画时间线，用来发现「页面提前切换」「纸板中途消失」
 * 这类只有连续播放时才暴露的问题。
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
