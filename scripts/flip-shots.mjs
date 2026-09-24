/**
 * 视觉验收：把翻页动画定格在若干角度并逐一截图。
 *
 * 为什么需要这个脚本：
 * 翻页是一个 680ms 的动画，普通截图只能看到起点或终点。而 3D 翻页
 * 最容易出错的地方恰好都在中间帧 —— 容器被 overflow 拍平成 2D、
 * 纸叶背面缺失导致越过 90° 后整页消失、光影没有跟随角度变化。
 * 用定格截图可以逐帧验收，而不是等用户报告「看起来很僵硬」。
 *
 * 实现：URL 带 `?flip=next&hold=0.5`，Reader 会把纸叶定格在该进度。
 *
 * 用法：node scripts/flip-shots.mjs
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.SGC_URL ?? 'http://127.0.0.1:5273'
const ALBUM = process.env.SGC_ALBUM ?? 'alb_demo_jiuzhaigou'
const OUT_DIR = process.env.SGC_OUT ?? join(tmpdir(), 'sgc-flip')

/** 单帧超时。Chrome 偶尔会因为 profile 锁或 GPU 初始化卡住，必须兜底。 */
const FRAME_TIMEOUT = 90_000

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!chrome) {
  console.error('找不到 Chrome / Edge')
  process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })

/** 要验收的中间帧（进度 0..1 对应纸叶旋转 0..180°） */
const FRAMES = [0, 0.2, 0.4, 0.5, 0.62, 0.8, 0.95]

function shoot(url, out, profileName) {
  return new Promise((resolve) => {
    const profile = join(OUT_DIR, profileName)
    // 每次用全新 profile，避免上一次运行残留的锁
    rmSync(profile, { recursive: true, force: true })

    const child = spawn(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        `--user-data-dir=${profile}`,
        '--window-size=1600,1000',
        '--virtual-time-budget=11000',
        `--screenshot=${out}`,
        url,
      ],
      { stdio: 'ignore' },
    )

    const timer = setTimeout(() => {
      child.kill()
      resolve(false)
    }, FRAME_TIMEOUT)

    child.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    child.on('exit', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

console.log('定格翻页中间帧（每帧约 10~20 秒）')
console.log('─'.repeat(56))

let failures = 0
for (const [index, progress] of FRAMES.entries()) {
  const name = `flip-${String(Math.round(progress * 100)).padStart(3, '0')}`
  const out = join(OUT_DIR, `${name}.png`)
  const url = `${BASE}/album/${ALBUM}/read?flip=next&hold=${progress}`

  const settled = await shoot(url, out, `prof-${index}`)
  const ok = settled && existsSync(out)

  if (ok) {
    console.log(
      `  ✓ ${name}.png  旋转 ${String(Math.round(progress * 180)).padStart(3)}°  ${(
        statSync(out).size / 1024
      ).toFixed(0)} KB`,
    )
  } else {
    failures++
    console.log(`  ✗ ${name} 失败（超时或未生成）`)
  }
}

console.log('─'.repeat(56))
console.log(failures ? `${failures} 帧失败` : '全部帧已生成')
console.log(`输出目录：${OUT_DIR}`)
