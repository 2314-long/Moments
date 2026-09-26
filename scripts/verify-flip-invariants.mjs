/**
 * 验收：翻页不变量（DOM + 几何断言）。
 *
 * 这个脚本回答三个问题，全部靠数据断言，不靠肉眼、也不靠视觉模型
 * （视觉模型在判断「有没有动」「有没有镜像」这类问题上并不可靠）：
 *
 *   1. 翻页途中，「正在阅读的那一页」是否真的一帧都没变？
 *   2. 纸叶**落平的那一帧**，是否已经就是提交之后的静止画面？
 *      —— 这是「页落下之后又动一下」的直接判据，含几何逐值比对。
 *   3. 静止态有没有幽灵翻页（纸叶常驻、导航失效）？
 *
 * 做法：用 `?flip=next|prev&hold=<progress>` 把纸板定格在指定进度，再用
 * Chrome DevTools Protocol 的 `Runtime.evaluate` 读取真实 DOM 与
 * `getBoundingClientRect()`。另用 `?sampleAt=54`（真实动画时间线末端）
 * 验证落平帧确实会被走到。
 *
 * 为什么走 CDP 而不是 `--dump-dom`：Windows 上 Chrome 是 GUI 子系统程序，
 * Node 把 stdout 接到文件句柄时它不写（实测 0 字节）；走 CDP 还能顺便拿到几何。
 *
 * 用法：node scripts/verify-flip-invariants.mjs
 * 环境变量：SGC_URL / SGC_ALBUM / SGC_PAGE / SGC_NEXT / SGC_OUT / SGC_SHOT=1
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const BASE = process.env.SGC_URL ?? 'http://127.0.0.1:5273'
const ALBUM = process.env.SGC_ALBUM ?? 'alb_demo_jiuzhaigou'
/** 起始跨页的右页页号（URL 用右页定位跨页） */
const FROM = process.env.SGC_PAGE ?? '5'
/** 目标跨页的右页页号 */
const NEXT = process.env.SGC_NEXT ?? '7'
const OUT = process.env.SGC_OUT ?? join(tmpdir(), 'sgc-verify')
const SHOT = process.env.SGC_SHOT === '1'

if (typeof WebSocket !== 'function') {
  console.error('需要 Node 22+（内置 WebSocket）')
  process.exit(1)
}

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))
if (!CHROME) {
  console.error('找不到 Chrome / Edge')
  process.exit(1)
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

let seq = 0

const COMMON = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  '--no-first-run',
  '--remote-allow-origins=*',
  '--window-size=1600,1000',
]

/** 读取：跨页语义属性 + 左右页的几何（页面坐标系 -> 屏幕像素） */
const READ_EXPR = `(() => {
  const spread = document.querySelector('[data-progress]')
  if (!spread) return null
  const g = (n) => spread.getAttribute(n) || ''
  const box = (el) => {
    if (!el) return null
    const b = el.getBoundingClientRect()
    const r = (v) => Math.round(v * 100) / 100
    return [r(b.x), r(b.y), r(b.width), r(b.height)]
  }
  return {
    left: g('data-left'),
    right: g('data-right'),
    leafFront: g('data-leaf-front'),
    leafBack: g('data-leaf-back'),
    progress: g('data-progress'),
    landed: g('data-landed'),
    spreadBox: box(spread),
    leftPageBox: box(document.querySelector('[data-face="front"][data-side="left"]')),
    rightPageBox: box(document.querySelector('[data-face="front"][data-side="right"]')),
    /**
     * 纸叶的背面。翻页途中它是唯一 face="back" 的元素，
     * 用来验证「纸叶的落点是否正好落在目标页上」——
     * 落平帧不含纸叶，所以只比对落平帧与静止态永远发现不了旋转轴取错。
     */
    leafBackBox: box(document.querySelector('[data-face="back"]')),
    /**
     * 书口不应当再有任何凸出的装饰。
     *
     * 这里统计的是「超出所在页面盒子」的纸块类元素，而不是某个约定好的
     * data-stack 属性 —— 之前那个选择器全项目没有任何生产者，断言恒为 0，
     * 是一条永远为真的假验收。
     */
    deckCount: Array.from(document.querySelectorAll('[data-leaf-layer] *, [data-spine] ~ *'))
      .filter((el) => {
        const r = el.getBoundingClientRect()
        const page = el.closest('[data-face="front"]')
        if (!page) return false
        const p = page.getBoundingClientRect()
        return r.width > 0 && (r.left < p.left - 0.5 || r.right > p.right + 0.5)
      }).length,
    /**
     * 纸叶内部「书脊侧切面」淡色竖条的数量，必须是 0。
     *
     * 那条竖条来自 BookPage 装订侧的 EdgeFace（色值 #eae2d2）。它的 rotateY(90°)
     * 会与纸叶的旋转叠加，投影宽度 = thickness × |sin(angle)|，于是翻到 90° 时
     * 变成一条 7.5px 宽、贯穿整页高的淡色带贴在书脊旁，并跟着纸叶一起转 ——
     * 看起来就像「下一层页面被带着翻」。纸叶上已用 hideSpineEdge 去掉。
     * （注意：本表达式是模板字符串，注释里不能出现反引号。）
     */
    leafSpineTone: Array.from(document.querySelectorAll('[data-leaf-layer] div')).filter(
      (el) => getComputedStyle(el).backgroundColor === 'rgb(234, 226, 210)',
    ).length,
    /**
     * 书脊/折痕与纸叶的层级关系。
     *
     * 说明：书脊不再是一层压在纸叶之上的独立渐变（那正是「中缝看起来像
     * 第三张纸」的根因），因此这里不再断言「书脊 z-index > 纸叶 z-index」。
     * 现在要保证的是相反的一件事：**没有任何中缝元素压在纸叶之上** ——
     * 折痕长在页面自己的矩形里（z=30），装订缝画在页面之下（z=1），
     * 两者都不会在翻页时变成一块与运动无关的浮层。
     */
    gutterZ: document.querySelector('[data-gutter]')
      ? getComputedStyle(document.querySelector('[data-gutter]')).zIndex
      : null,
    foldShadeCount: document.querySelectorAll('[data-fold]').length,
    foldZ: document.querySelector('[data-fold]')
      ? getComputedStyle(document.querySelector('[data-fold]')).zIndex
      : null,
    leafLayerZ: document.querySelector('[data-leaf-layer]')
      ? getComputedStyle(document.querySelector('[data-leaf-layer]')).zIndex
      : null,
    /** 中缝里除纸叶之外，是否还有别的元素压在页面之上 */
    gutterAboveLeaf: Array.from(
      document.querySelectorAll('[data-gutter], [data-fold]'),
    ).some((el) => {
      const z = Number(getComputedStyle(el).zIndex)
      const leaf = document.querySelector('[data-leaf-layer]')
      const lz = leaf ? Number(getComputedStyle(leaf).zIndex) : 0
      return Number.isFinite(z) && z > lz
    }),
  }
})()`

function launch(args) {
  return spawn(CHROME, args, { stdio: 'ignore' })
}

function stop(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve()
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 5000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill()
  })
}

/** `--remote-debugging-port=0` 时，Chrome 把实际端口写进 profile 目录 */
async function debugPort(profile, timeoutMs = 30_000) {
  const file = join(profile, 'DevToolsActivePort')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (existsSync(file)) {
      const port = Number(readFileSync(file, 'utf8').split('\n')[0].trim())
      if (Number.isFinite(port) && port > 0) return port
    }
    await sleep(150)
  }
  return null
}

async function cdpTarget(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      /* 端口还没就绪 */
    }
    await sleep(200)
  }
  return null
}

function evaluate(wsUrl, expression, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const timer = setTimeout(() => {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      reject(new Error('CDP 求值超时'))
    }, timeoutMs)
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      )
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== 1) return
      clearTimeout(timer)
      ws.close()
      if (message.result?.exceptionDetails) {
        reject(new Error(message.result.exceptionDetails.text))
        return
      }
      resolve(message.result?.result?.value)
    }
    ws.onerror = () => {
      clearTimeout(timer)
      reject(new Error('CDP 连接失败'))
    }
  })
}

/** 打开一个 URL，等 BookSpread 出现（照片就绪）后读一次状态 */
async function readSpread(url, label) {
  const profile = join(OUT, `prof-${seq++}`)
  mkdirSync(profile, { recursive: true })
  const child = launch([
    ...COMMON,
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    url,
  ])
  try {
    const port = await debugPort(profile)
    if (!port) throw new Error(`${label}：Chrome 调试端口没起来`)
    const target = await cdpTarget(port)
    if (!target) throw new Error(`${label}：拿不到可调试的页面`)

    /**
     * 等布局稳定再读。
     *
     * BookViewport 的尺寸带 0.4s 过渡（`scale` 初值 0.6 → 实测 fitScale），
     * 而它又被 flex 居中 —— 于是「容器还在过渡」会直接表现为整个书本的垂直位移。
     * 早先这里是「BookSpread 一出现就读」，读到的是过渡中间态：两次读数
     * 页面 y 差出 64px，看着像真的在动，其实只是采样时机不同。
     * 所以要求连续两次采样（间隔 250ms）几何完全一致才认账。
     */
    const deadline = Date.now() + 40_000
    let previous = null
    let stable = 0
    while (Date.now() < deadline) {
      const state = await evaluate(target.webSocketDebuggerUrl, READ_EXPR).catch(() => null)
      if (state) {
        const signature = JSON.stringify([
          state.progress,
          state.left,
          state.right,
          state.spreadBox,
          state.leftPageBox,
          state.rightPageBox,
          state.leafBackBox,
        ])
        if (signature === previous) {
          stable += 1
          if (stable >= 2) return state
        } else {
          stable = 0
        }
        previous = signature
      }
      await sleep(250)
    }
    throw new Error(`${label}：等不到稳定布局（照片未就绪或路由不对）`)
  } finally {
    await stop(child)
  }
}

const url = (page, params = '') => `${BASE}/album/${ALBUM}/read/${page}${params}`
const held = (page, direction, progress) => url(page, `?flip=${direction}&hold=${progress}`)

const failures = []
const check = (ok, message) => {
  if (!ok) failures.push(message)
}
const show = (s) =>
  `静止左=${s.left} 静止右=${s.right} 叶正=${s.leafFront || '-'} 叶背=${s.leafBack || '-'}`
const sameBox = (a, b) => (a === null || b === null ? a === b : a.every((v, i) => v === b[i]))

/* ------------------------------------------------------------------ */

console.log('翻页不变量验收（DOM + 几何断言，走 CDP）')
console.log('─'.repeat(74))

const restFrom = await readSpread(url(FROM), 'rest(FROM)')
const restNext = await readSpread(url(NEXT), 'rest(NEXT)')

console.log('\n【静止态】')
console.log(`  /read/${FROM}  ${show(restFrom)}  landed=${restFrom.landed}`)
console.log(`    左页几何 ${JSON.stringify(restFrom.leftPageBox)}`)
console.log(`  /read/${NEXT}  ${show(restNext)}  landed=${restNext.landed}`)
console.log(`    左页几何 ${JSON.stringify(restNext.leftPageBox)}`)
check(restFrom.landed === '0' && restNext.landed === '0', '静止态 landed 应为 0')
check(
  restFrom.leafFront === '' && restFrom.leafBack === '',
  '静止态不应挂载纸叶（幽灵翻页：Number(null) === 0 那个坑）',
)

/** 与 BookSpread 的 BOOK_GAP 保持一致 */
const BOOK_GAP = 14
/** 最接近落平的那一帧：此时纸叶应当已经几乎完全落在目标页上 */
const NEAR = 0.99
const MID = [0.15, 0.35, 0.5, 0.7, 0.9, NEAR]

/**
 * 纸叶的落点是否正好压在目标页上。
 *
 * 这是漏掉过的一条断言：纸叶绕书脊旋转，它的背面在 180° 时必须正好等于
 * 目标页的位置。如果旋转轴取成了「右页左边缘」而不是「装订缝正中」，
 * 纸叶会整整偏右一个 BOOK_GAP —— 途中盖住中间缝隙、落地瞬间内容向左跳。
 *
 * 只看「落平帧 vs 静止态」发现不了这个问题：落平帧是直接渲染静止页的，
 * 压根不含纸叶。必须单独量纸叶本身。
 *
 * ── 为什么书脊侧要卡得很紧、书口侧要放宽 ──────────────────────────
 *
 * 量的时候还没到 180°（p = NEAR），纸叶仍略微倾斜，于是纸面各处的 Z 不同：
 *
 *   · **书脊侧**那条边正好在旋转轴上，Z ≈ 0 → 透视不产生缩放，
 *     它的位置由旋转轴唯一决定。所以这里可以卡到 2px ——
 *     旋转轴取错会直接表现为 14 × 缩放 ≈ 10.5px 的偏差。
 *   · **书口侧**那条边离观察者最近，被 perspective(3400) 放大
 *     d/(d−z) ≈ 1.0067，实测把它往外推了 3.4px。
 *     这是**正确的透视**，不是 bug，而且 t → 1 时会收敛到 0，所以放宽到 6px。
 */
function checkLeafLanding(label, leafBox, targetBox, spineSide) {
  if (!leafBox || !targetBox) {
    check(false, `${label}：拿不到纸叶背面或目标页的几何`)
    return
  }
  const dxLeft = Math.abs(leafBox[0] - targetBox[0])
  const dxRight = Math.abs(leafBox[0] + leafBox[2] - (targetBox[0] + targetBox[2]))
  const spineDiff = spineSide === 'right' ? dxRight : dxLeft
  const foreDiff = spineSide === 'right' ? dxLeft : dxRight
  const gapPx = BOOK_GAP * (targetBox[2] / 720)

  console.log(
    `  叶背 x=${leafBox[0]} 宽=${leafBox[2]}  目标页 x=${targetBox[0]} 宽=${targetBox[2]}`,
  )
  console.log(
    `  书脊侧偏差 ${spineDiff.toFixed(2)}px（应 ≈ 0；旋转轴取错会差约 ${gapPx.toFixed(1)}px）` +
      `，书口侧偏差 ${foreDiff.toFixed(2)}px（透视放大所致，应 < 6px）`,
  )
  check(
    spineDiff <= 2,
    `${label}：纸叶落点在书脊侧偏离目标页 ${spineDiff.toFixed(2)}px —— 旋转轴没落在装订缝正中`,
  )
  check(foreDiff <= 6, `${label}：纸叶落点在书口侧偏离目标页 ${foreDiff.toFixed(2)}px（超出透视放大量）`)
}

/**
 * 起点帧：progress = 0。它必须**不算落平**（`landed` 为 0）—— 否则纸叶在
 * 翻页一开始就被卸掉。拖拽回弹（cancel）的收尾正是先回到 0 再卸纸叶，
 * 这条断言守住的就是那个瞬间。
 */
const originNext = await readSpread(held(FROM, 'next', 0), 'next@0')
console.log('\n【起点帧 · 向后翻】progress = 0 —— 不能算作落平')
console.log(`  ${show(originNext)}  landed=${originNext.landed}`)
check(originNext.landed === '0', '起点帧 landed 应为 0（纸叶还没开始动）')
check(
  originNext.left === restFrom.left && originNext.right === restNext.right,
  `起点帧应为「${restFrom.left} / ${restNext.right}」，实际「${originNext.left} / ${originNext.right}」`,
)
check(
  originNext.leafFront === restFrom.right && originNext.leafBack === restNext.left,
  '起点帧应挂载纸叶（正面 = 当前右页，背面 = 目标左页）',
)

console.log(`\n【向后翻】/read/${FROM} → /read/${NEXT}：正在阅读的左页必须全程不变`)
let nextNear = null
for (const p of MID) {
  const s = await readSpread(held(FROM, 'next', p), `next@${p}`)
  if (p === NEAR) nextNear = s
  const ok =
    s.left === restFrom.left &&
    s.right === restNext.right &&
    s.leafFront === restFrom.right &&
    s.leafBack === restNext.left &&
    s.landed === '0'
  console.log(`  p=${String(p).padEnd(5)} ${show(s)}  ${ok ? '✓' : '✗'}`)
  check(s.landed === '0', `next@${p}：纸叶未落平时 landed 不应为 1`)
  check(s.left === restFrom.left, `next@${p}：正在阅读的左页变了（${restFrom.left} → ${s.left}）`)
  check(s.right === restNext.right, `next@${p}：右槽应已是目标右页「${restNext.right}」，实际「${s.right}」`)
  check(s.leafFront === restFrom.right, `next@${p}：叶正应为「${restFrom.right}」，实际「${s.leafFront}」`)
  check(s.leafBack === restNext.left, `next@${p}：叶背应为「${restNext.left}」，实际「${s.leafBack}」`)
}

console.log(`\n【纸叶落点对齐 · 向后翻】p=${NEAR} 时纸叶背面应当已压在目标左页「${restNext.left}」上`)
checkLeafLanding('向后翻', nextNear?.leafBackBox, restNext.leftPageBox, 'right')

const landedNext = await readSpread(held(FROM, 'next', 1), 'next@landed')
console.log('\n【落平帧 · 向后翻】progress = 1 —— 必须与提交后的静止画面完全一致')
console.log(`  ${show(landedNext)}  landed=${landedNext.landed}  progress=${landedNext.progress}`)
console.log(`    左页几何 ${JSON.stringify(landedNext.leftPageBox)}  vs 静止态 ${JSON.stringify(restNext.leftPageBox)}`)
check(landedNext.landed === '1', '落平帧 landed 应为 1')
check(
  landedNext.leafFront === '' && landedNext.leafBack === '',
  '落平帧不应再挂载纸叶（否则它会盖住书脊与装订缝，提交后一卸下就「动一下」）',
)
check(landedNext.left === restNext.left, `落平帧左页应为「${restNext.left}」，实际「${landedNext.left}」`)
check(landedNext.right === restNext.right, `落平帧右页应为「${restNext.right}」，实际「${landedNext.right}」`)
check(
  sameBox(landedNext.leftPageBox, restNext.leftPageBox),
  `落平帧左页几何与静止态不一致（${JSON.stringify(landedNext.leftPageBox)} vs ${JSON.stringify(
    restNext.leftPageBox,
  )}）—— 这就是「落下后又动一下」`,
)
check(
  sameBox(landedNext.rightPageBox, restNext.rightPageBox),
  `落平帧右页几何与静止态不一致（${JSON.stringify(landedNext.rightPageBox)} vs ${JSON.stringify(
    restNext.rightPageBox,
  )}）`,
)
check(
  sameBox(landedNext.spreadBox, restNext.spreadBox),
  `落平帧跨页容器几何与静止态不一致`,
)

/**
 * 最后一帧（还在动画里）→ 落平帧：纸叶的书口侧边缘不能有可见位移。
 *
 * 这一条守的是**缓动曲线的尾段**。60fps 下最后一帧只能走到 t≈0.98
 * （`?sampleAt=53`）。若缓动在 t=1 处不减速（旧实现在 t=1 的导数是 1.04），
 * 最后那 3.4° 会被 perspective 放大成书口侧约 6px 的一步 ——
 * 看起来就是「页一落下就动一下」。换成首尾导数为 0 的 S 曲线之后，
 * 最后一帧已经到 ≈179.99°，这一步降到 0.01px 级别。
 */
const lastFrame = await readSpread(url(FROM, '?sampleAt=53'), 'sampleAt=53')
console.log('\n【最后一帧 → 落平帧】纸叶在书口侧不能有可见位移')
{
  const lf = lastFrame.leafBackBox
  const target = restNext.leftPageBox
  if (lf && target) {
    const fore = Math.abs(lf[0] - target[0])
    console.log(
      `  最后一帧 progress=${lastFrame.progress}，叶背书口缘 x=${lf[0]}；落平后 x=${target[0]} → 差 ${fore.toFixed(2)}px`,
    )
    check(
      fore < 1,
      `最后一帧的书口侧边缘与落平帧相差 ${fore.toFixed(2)}px —— 落地时会看到位移（缓动尾段没减速）`,
    )
  } else {
    check(false, '拿不到最后一帧的纸叶几何（?sampleAt=53）')
  }
}

/**
 * 中缝结构与书口，两条不变量。
 *
 * 1. **没有任何中缝元素压在纸叶之上。** 这里以前断言的是相反的事情
 *    （「书脊必须压在纸叶之上」），因为当时书脊是一层跨在两页之上的
 *    独立渐变（z-index 50）：它确实必须压住纸叶，否则翻页时会被盖掉。
 *    但那条跨页渐变正是「中缝看起来像第三张纸」的根因，已经拆掉：
 *    折痕改由页面自己承载（`[data-fold]`，z=30，在页面容器内），
 *    装订缝画在页面之下（`[data-gutter]`，z=1）。
 *    所以现在要守的是：**它们都不高于纸叶层**，不会成为浮在书上的无关色块。
 * 2. **书口不能有任何凸出于页面的装饰。** 这里先后守过两种实现：一层层错开的
 *    纸片（阶梯）、一条平直的厚边 —— 两者都会凸出页面（最多 21 页px ≈ 16 屏幕px），
 *    用户明确要求「完全不要突出」，于是整体去掉了。
 */
console.log('\n【中缝】折痕与装订缝都不得压在纸叶之上，且不应有任何凸出于页面的装饰')
console.log(
  `  纸叶存在时：装订缝 z=${nextNear?.gutterZ}，折痕 z=${nextNear?.foldZ}，纸叶层 z=${nextNear?.leafLayerZ}`,
)
console.log(`  折痕元素个数 = ${nextNear?.foldShadeCount}（左右页各一个，应当为 2）`)
check(
  nextNear?.gutterAboveLeaf === false,
  `中缝元素不得压在纸叶之上（装订缝 z=${nextNear?.gutterZ}，折痕 z=${nextNear?.foldZ}，纸叶 z=${nextNear?.leafLayerZ}）`,
)
check(
  nextNear?.foldShadeCount === 2,
  `每个页面内缘都应有一个折痕元素，实际 ${nextNear?.foldShadeCount} 个`,
)
console.log(`  凸出页面盒子的纸块类元素 = ${landedNext.deckCount} 个（应当为 0）`)
console.log(
  `  纸叶内的「书脊侧切面」淡色竖条 = ${nextNear?.leafSpineTone} 条（应当为 0）`,
)
check(
  Number(nextNear?.leafSpineTone) === 0,
  `纸叶内还有 ${nextNear?.leafSpineTone} 条书脊侧切面淡色竖条 —— 它会跟着纸叶一起转，` +
    `看起来像「下一层页面被带着翻」（FlippingLeaf 应当传 hideSpineEdge）`,
)
check(
  landedNext.deckCount === 0,
  `书口不应再有凸出的纸块，实际有 ${landedNext.deckCount} 个凸出元素`,
)
{
  const l = landedNext.leftPageBox
  const r = landedNext.rightPageBox
  const s = landedNext.spreadBox
  if (l && r && s) {
    const leftOver = Math.abs(l[0] - s[0])
    const rightOver = Math.abs(r[0] + r[2] - (s[0] + s[2]))
    console.log(
      `  左页左缘距容器左缘 ${leftOver.toFixed(2)}px，右页右缘距容器右缘 ${rightOver.toFixed(2)}px（都应为 0）`,
    )
    check(
      leftOver < 0.5 && rightOver < 0.5,
      '页面没有正好铺满跨页容器 —— 说明书口外侧还有东西凸出',
    )
  } else {
    check(false, '拿不到跨页或页面的几何')
  }
}

console.log(`\n【向前翻】/read/${NEXT} → /read/${FROM}：正在阅读的右页必须全程不变`)
let prevNear = null
for (const p of MID) {
  const s = await readSpread(held(NEXT, 'prev', p), `prev@${p}`)
  if (p === NEAR) prevNear = s
  const ok =
    s.right === restNext.right &&
    s.left === restFrom.left &&
    s.leafFront === restNext.left &&
    s.leafBack === restFrom.right &&
    s.landed === '0'
  console.log(`  p=${String(p).padEnd(5)} ${show(s)}  ${ok ? '✓' : '✗'}`)
  check(s.landed === '0', `prev@${p}：纸叶未落平时 landed 不应为 1`)
  check(s.right === restNext.right, `prev@${p}：正在阅读的右页变了（${restNext.right} → ${s.right}）`)
  check(s.left === restFrom.left, `prev@${p}：左槽应已是目标左页「${restFrom.left}」，实际「${s.left}」`)
  check(s.leafFront === restNext.left, `prev@${p}：叶正应为「${restNext.left}」，实际「${s.leafFront}」`)
  check(s.leafBack === restFrom.right, `prev@${p}：叶背应为「${restFrom.right}」，实际「${s.leafBack}」`)
}

console.log(`\n【纸叶落点对齐 · 向前翻】p=${NEAR} 时纸叶背面应当已压在目标右页「${restFrom.right}」上`)
checkLeafLanding('向前翻', prevNear?.leafBackBox, restFrom.rightPageBox, 'left')

const landedPrev = await readSpread(held(NEXT, 'prev', 1), 'prev@landed')
console.log('\n【落平帧 · 向前翻】progress = 1')
console.log(`  ${show(landedPrev)}  landed=${landedPrev.landed}`)
check(landedPrev.landed === '1', '落平帧 landed 应为 1')
check(
  landedPrev.left === restFrom.left && landedPrev.right === restFrom.right,
  `落平帧应显示「${restFrom.left} / ${restFrom.right}」，实际「${landedPrev.left} / ${landedPrev.right}」`,
)
check(landedPrev.leafFront === '' && landedPrev.leafBack === '', '落平帧不应再挂载纸叶')
check(
  sameBox(landedPrev.leftPageBox, restFrom.leftPageBox) &&
    sameBox(landedPrev.rightPageBox, restFrom.rightPageBox),
  '向前翻的落平帧几何与静止态不一致',
)

const real = await readSpread(url(FROM, '?sampleAt=54'), 'sampleAt=54')
console.log('\n【真实动画时间线末端】?sampleAt=54')
console.log(`  ${show(real)}  landed=${real.landed}  progress=${real.progress}`)
check(real.landed === '1', 'sampleAt=54（时间线末端）应落在落平帧')
check(
  real.left === restNext.left && real.right === restNext.right,
  `时间线末端应已显示目标跨页「${restNext.left} / ${restNext.right}」，实际「${real.left} / ${real.right}」`,
)

/* ------------------------------------------------------------------ */

if (SHOT) {
  const shot = async (target, name) => {
    const out = join(OUT, name)
    const profile = join(OUT, `shot-prof-${seq++}`)
    mkdirSync(profile, { recursive: true })
    const child = launch([
      ...COMMON,
      `--user-data-dir=${profile}`,
      '--virtual-time-budget=20000',
      `--screenshot=${out}`,
      target,
    ])
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill()
        resolve()
      }, 90_000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    return existsSync(out) ? out : null
  }
  const a = await shot(held(FROM, 'next', 1), 'landed-frame.png')
  const b = await shot(url(NEXT), 'rest-next.png')
  console.log('\n截图（用于像素对比）：')
  console.log(`  落平帧 ${a ?? '失败'}`)
  console.log(`  静止态 ${b ?? '失败'}`)
}

console.log('\n' + '─'.repeat(74))
if (failures.length) {
  console.log(`✗ ${failures.length} 项不通过：`)
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('✓ 全部通过')
console.log(`输出目录：${OUT}`)
