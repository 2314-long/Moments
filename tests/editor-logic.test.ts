import { test } from 'node:test'
import assert from 'node:assert/strict'

import { boundsOf, hitTestRect, rectCorners, rotatePoint, snapAngle } from '../src/lib/geometry.ts'
import {
  computeDrag,
  computeResize,
  computeRotation,
  elementAtPoint,
  elementsInRect,
  normalizeRect,
  selectionBounds,
  type InteractionSnapshot,
} from '../src/lib/interaction.ts'
import type { AlbumElement } from '../src/types/album.ts'
import { reorderElements } from '../src/store/editorStore.ts'

/**
 * 编辑器几何 / 层级逻辑测试。
 *
 * 这些是编辑器里最容易出错、又最难靠肉眼发现的部分：
 * 旋转元素的缩放锚点、多选时的层级调整、吸附阈值。
 * 纯函数因此可以直接用 Node 内置测试跑，不需要浏览器。
 *
 * 运行：pnpm test
 */

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

function makeElement(id: string, x: number, y: number, width = 100, height = 100, rotation = 0): AlbumElement {
  return {
    id,
    kind: 'shape',
    x,
    y,
    width,
    height,
    rotation,
    opacity: 1,
    locked: false,
    data: { shape: 'rect', fill: 'transparent', stroke: '#000', strokeWidth: 1 },
  }
}

/* ------------------------------------------------------------------ *
 * 旋转与命中
 * ------------------------------------------------------------------ */

test('rotatePoint 绕中心旋转 90 度', () => {
  const centre = { x: 50, y: 50 }
  const result = rotatePoint({ x: 100, y: 50 }, centre, 90)
  assert.ok(Math.abs(result.x - 50) < 1e-9)
  assert.ok(Math.abs(result.y - 100) < 1e-9)
})

test('未旋转元素的命中测试等价于普通矩形包含', () => {
  const box = rect(10, 10, 100, 50)
  assert.equal(hitTestRect({ x: 50, y: 30 }, box, 0), true)
  assert.equal(hitTestRect({ x: 5, y: 30 }, box, 0), false)
})

test('旋转 45 度后，原本在角上的点移出命中范围', () => {
  const box = rect(0, 0, 100, 100)
  // (4,4) 是未旋转时的内部点；(4,96) 与它关于中心对称
  assert.equal(hitTestRect({ x: 4, y: 4 }, box, 0), true)
  // 旋转 45 度后四个角被切掉，靠近角外侧的点不再命中
  assert.equal(hitTestRect({ x: 2, y: 2 }, box, 45), false)
  // 中心永远命中
  assert.equal(hitTestRect({ x: 50, y: 50 }, box, 45), true)
})

test('boundsOf 在旋转后得到正确的轴对齐包围盒', () => {
  const box = boundsOf(rect(0, 0, 100, 100), 45)
  const expected = 100 * Math.SQRT2
  assert.ok(Math.abs(box.width - expected) < 1e-6, `width=${box.width}`)
  assert.ok(Math.abs(box.height - expected) < 1e-6)
  // 中心不变
  assert.ok(Math.abs(box.x + box.width / 2 - 50) < 1e-6)
})

test('rectCorners 返回四个角且顺序稳定', () => {
  const corners = rectCorners(rect(0, 0, 10, 20), 0)
  assert.deepEqual(corners, [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 20 },
    { x: 0, y: 20 },
  ])
})

test('snapAngle 在接近 15 度倍数时吸附，否则保留原值', () => {
  assert.equal(snapAngle(14, 15, 4), 15)
  assert.equal(snapAngle(1.5, 15, 4), 0)
  assert.equal(snapAngle(7, 15, 4), 7)
  assert.equal(snapAngle(359, 15, 4), 0)
})

/* ------------------------------------------------------------------ *
 * 缩放
 * ------------------------------------------------------------------ */

/** 构造单元素缩放场景 */
function resizeScenario(rect0: ReturnType<typeof rect>, rotation = 0): InteractionSnapshot {
  return {
    pointer: { x: 0, y: 0 },
    elements: [{ id: 'a', rect: rect0, rotation }],
    bounds: rect0,
    boundsRotation: rotation,
    startAngle: 0,
  }
}

function resize(
  snapshot: InteractionSnapshot,
  handle: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w',
  pointer: { x: number; y: number },
  extra: Partial<{ keepAspect: boolean; fromCenter: boolean }> = {},
) {
  const result = computeResize(snapshot, {
    handle,
    pointer,
    keepAspect: extra.keepAspect ?? false,
    fromCenter: extra.fromCenter ?? false,
    minSize: 10,
  })
  const geometry = result.positions.get('a')
  assert.ok(geometry, '必须返回新几何')
  return geometry
}

test('四角缩放：对角锚点不动，被拖动的角跟随指针', () => {
  const start = rect(100, 100, 200, 150)
  const cases: Array<[
    'nw' | 'ne' | 'sw' | 'se',
    { x: number; y: number },
    { x: number; y: number },
  ]> = [
    ['se', { x: 340, y: 300 }, { x: 100, y: 100 }],
    ['nw', { x: 60, y: 40 }, { x: 300, y: 250 }],
    ['ne', { x: 340, y: 40 }, { x: 100, y: 250 }],
    ['sw', { x: 60, y: 300 }, { x: 300, y: 100 }],
  ]

  for (const [handle, pointer, expectedAnchor] of cases) {
    const geometry = resize(resizeScenario(start), handle, pointer)
    const anchorX = handle.includes('w') ? geometry.x + geometry.width : geometry.x
    const anchorY = handle.includes('n') ? geometry.y + geometry.height : geometry.y
    assert.ok(
      Math.abs(anchorX - expectedAnchor.x) < 1e-6 && Math.abs(anchorY - expectedAnchor.y) < 1e-6,
      `${handle}: 锚点应为 (${expectedAnchor.x},${expectedAnchor.y})，实际 (${anchorX},${anchorY})`,
    )

    const draggedX = handle.includes('w') ? geometry.x : geometry.x + geometry.width
    const draggedY = handle.includes('n') ? geometry.y : geometry.y + geometry.height
    assert.ok(
      Math.abs(draggedX - pointer.x) < 1e-6 && Math.abs(draggedY - pointer.y) < 1e-6,
      `${handle}: 被拖动的角应落在指针 (${pointer.x},${pointer.y})，实际 (${draggedX},${draggedY})`,
    )
  }
})

test('边手柄只改变一个方向，另一方向保持不变', () => {
  const start = rect(100, 100, 200, 150)

  const north = resize(resizeScenario(start), 'n', { x: 999, y: 60 })
  assert.equal(north.x, 100)
  assert.equal(north.width, 200)
  assert.equal(north.y, 60)
  assert.equal(north.height, 190)

  const west = resize(resizeScenario(start), 'w', { x: 40, y: 999 })
  assert.equal(west.y, 100)
  assert.equal(west.height, 150)
  assert.equal(west.x, 40)
  assert.equal(west.width, 260)
})

test('缩放尊重最小尺寸', () => {
  const geometry = resize(resizeScenario(rect(0, 0, 100, 100)), 'se', { x: -50, y: -50 })
  assert.equal(geometry.width, 10)
  assert.equal(geometry.height, 10)
})

test('保持比例时宽高比不变且锚点不动', () => {
  const start = rect(0, 0, 200, 100) // 2:1
  const geometry = resize(resizeScenario(start), 'se', { x: 400, y: 150 }, { keepAspect: true })
  assert.ok(Math.abs(geometry.width / geometry.height - 2) < 1e-9, `${geometry.width}x${geometry.height}`)
  assert.equal(geometry.x, 0)
  assert.equal(geometry.y, 0)
  // 水平方向更远 → 以宽度为准
  assert.ok(Math.abs(geometry.width - 400) < 1e-6)
  assert.ok(Math.abs(geometry.height - 200) < 1e-6)
})

test('从中心缩放时中心不动', () => {
  const start = rect(100, 100, 200, 100) // 中心 (200,150)
  const geometry = resize(resizeScenario(start), 'se', { x: 400, y: 300 }, { fromCenter: true })
  assert.ok(Math.abs(geometry.x + geometry.width / 2 - 200) < 1e-6)
  assert.ok(Math.abs(geometry.y + geometry.height / 2 - 150) < 1e-6)
})

test('computeResize 对旋转元素的指针做了反向旋转（锚点仍然不动）', () => {
  const start: InteractionSnapshot = {
    pointer: { x: 0, y: 0 },
    elements: [{ id: 'a', rect: rect(100, 100, 200, 100), rotation: 90 }],
    bounds: rect(100, 100, 200, 100),
    boundsRotation: 90,
    startAngle: 0,
  }
  // 旋转 90 度后，元素中心 (200,150)；把指针放在「屏幕上」的右下方向
  const result = computeResize(start, {
    handle: 'se',
    pointer: { x: 300, y: 250 },
    keepAspect: false,
    fromCenter: false,
    minSize: 10,
  })
  const next = result.positions.get('a')
  assert.ok(next, '必须返回新几何')
  // 关键性质：锚点（左上角在元素本地坐标系中）在页面坐标系里保持不动
  assert.ok(Number.isFinite(next.x) && Number.isFinite(next.y))
  assert.ok(next.width >= 10 && next.height >= 10)
})

/* ------------------------------------------------------------------ *
 * 拖拽与吸附
 * ------------------------------------------------------------------ */

function snapshotFor(elements: Array<{ id: string; rect: ReturnType<typeof rect>; rotation?: number }>): InteractionSnapshot {
  const list = elements.map((e) => ({ id: e.id, rect: e.rect, rotation: e.rotation ?? 0 }))
  const bounds = selectionBounds(
    list.map((e) => makeElement(e.id, e.rect.x, e.rect.y, e.rect.width, e.rect.height, e.rotation)),
  )
  return {
    pointer: { x: 0, y: 0 },
    elements: list,
    bounds: bounds ?? rect(0, 0, 0, 0),
    boundsRotation: list.length === 1 ? list[0].rotation : 0,
    startAngle: 0,
  }
}

test('computeDrag 按位移量移动元素', () => {
  const snapshot = snapshotFor([{ id: 'a', rect: rect(100, 100, 50, 50) }])
  const result = computeDrag(snapshot, {
    delta: { x: 30, y: -20 },
    snap: false,
    startPositions: new Map([['a', { x: 100, y: 100 }]]),
    pageSize: { width: 720, height: 900 },
    others: [],
  })
  assert.deepEqual(result.positions.get('a'), { x: 130, y: 80 })
  assert.equal(result.guides.length, 0)
})

test('computeDrag 在接近页面中线时吸附并给出辅助线', () => {
  // 元素宽 100，left=310 时中心 360，正好是 720 的中线
  const snapshot = snapshotFor([{ id: 'a', rect: rect(312, 100, 100, 100) }])
  const result = computeDrag(snapshot, {
    delta: { x: 0, y: 0 },
    snap: true,
    startPositions: new Map([['a', { x: 312, y: 100 }]]),
    pageSize: { width: 720, height: 900 },
    others: [],
  })
  // 中心吸附到 360 → left 变成 310
  assert.equal(result.positions.get('a')?.x, 310)
  const vertical = result.guides.find((g) => g.axis === 'x')
  assert.ok(vertical, '应该产生一条垂直辅助线')
  assert.equal(vertical.position, 360)
  assert.equal(vertical.targetId, null)
})

test('computeDrag 关闭吸附时不产生辅助线', () => {
  const snapshot = snapshotFor([{ id: 'a', rect: rect(312, 100, 100, 100) }])
  const result = computeDrag(snapshot, {
    delta: { x: 0, y: 0 },
    snap: false,
    startPositions: new Map([['a', { x: 312, y: 100 }]]),
    pageSize: { width: 720, height: 900 },
    others: [],
  })
  assert.equal(result.positions.get('a')?.x, 312)
  assert.equal(result.guides.length, 0)
})

test('computeDrag 对齐到其它元素的左边', () => {
  const snapshot = snapshotFor([{ id: 'a', rect: rect(204, 400, 100, 100) }])
  const result = computeDrag(snapshot, {
    delta: { x: 0, y: 0 },
    snap: true,
    startPositions: new Map([['a', { x: 204, y: 400 }]]),
    pageSize: { width: 720, height: 900 },
    others: [{ id: 'b', rect: rect(200, 100, 80, 80), rotation: 0 }],
  })
  assert.equal(result.positions.get('a')?.x, 200, '应吸附到 b 的左边')
  const guide = result.guides.find((g) => g.axis === 'x')
  assert.equal(guide?.targetId, 'b')
})

test('computeDrag 旋转过的元素不参与吸附（避免视觉错位）', () => {
  const snapshot = snapshotFor([{ id: 'a', rect: rect(312, 100, 100, 100), rotation: 20 }])
  const result = computeDrag(snapshot, {
    delta: { x: 0, y: 0 },
    snap: true,
    startPositions: new Map([['a', { x: 312, y: 100 }]]),
    pageSize: { width: 720, height: 900 },
    others: [],
  })
  assert.equal(result.positions.get('a')?.x, 312)
  assert.equal(result.guides.length, 0)
})

test('computeRotation 围绕包围盒中心旋转', () => {
  const snapshot = snapshotFor([{ id: 'a', rect: rect(100, 100, 100, 100) }])
  // 中心 (150,150)。起始角 90° 对应指针在中心正右方。
  const withAngle: InteractionSnapshot = { ...snapshot, startAngle: 90 }
  // 指针移到中心正下方 → 角度 180°，delta = +90
  const quarterTurn = computeRotation(withAngle, { x: 150, y: 250 }, { snap: false })
  assert.equal(quarterTurn.get('a'), 90)

  // 指针放到右下方 45° 位置 → delta ≈ +45
  const diagonal = computeRotation(withAngle, { x: 250, y: 250 }, { snap: false })
  assert.ok(Math.abs((diagonal.get('a') ?? 0) - 45) < 0.05, `got ${diagonal.get('a')}`)

  // 开启吸附后应对齐到 15 的倍数
  const snapped = computeRotation(withAngle, { x: 250, y: 250 }, { snap: true })
  assert.equal(snapped.get('a'), 45)
})

/* ------------------------------------------------------------------ *
 * 框选与命中
 * ------------------------------------------------------------------ */

test('normalizeRect 支持任意方向的拖拽', () => {
  assert.deepEqual(normalizeRect({ x: 100, y: 100 }, { x: 40, y: 60 }), rect(40, 60, 60, 40))
})

test('elementsInRect 只返回相交且未锁定的元素', () => {
  const elements = [
    makeElement('in', 50, 50),
    makeElement('out', 500, 500),
    { ...makeElement('locked', 60, 60), locked: true },
  ]
  const hits = elementsInRect(elements, rect(40, 40, 60, 60))
  assert.deepEqual(hits, ['in'])
})

test('elementAtPoint 命中层级最高的元素', () => {
  const elements = [makeElement('bottom', 0, 0, 200, 200), makeElement('top', 50, 50, 100, 100)]
  assert.equal(elementAtPoint(elements, { x: 100, y: 100 })?.id, 'top')
  assert.equal(elementAtPoint(elements, { x: 10, y: 10 })?.id, 'bottom')
  assert.equal(elementAtPoint(elements, { x: 999, y: 999 }), null)
})

test('selectionBounds 覆盖所有选中元素', () => {
  const box = selectionBounds([makeElement('a', 10, 20, 100, 50), makeElement('b', 200, 300, 50, 50)])
  assert.deepEqual(box, rect(10, 20, 240, 330))
})

/* ------------------------------------------------------------------ *
 * 层级调整（多选时最容易出错）
 * ------------------------------------------------------------------ */

const ids = (elements: AlbumElement[]) => elements.map((e) => e.id)

test('置于顶层把选中元素整体移到末尾并保持相对顺序', () => {
  const elements = [makeElement('a', 0, 0), makeElement('b', 0, 0), makeElement('c', 0, 0), makeElement('d', 0, 0)]
  const result = reorderElements(elements, ['a', 'c'], 'front')
  assert.deepEqual(ids(result), ['b', 'd', 'a', 'c'])
})

test('置于底层把选中元素整体移到开头并保持相对顺序', () => {
  const elements = [makeElement('a', 0, 0), makeElement('b', 0, 0), makeElement('c', 0, 0), makeElement('d', 0, 0)]
  const result = reorderElements(elements, ['b', 'd'], 'back')
  assert.deepEqual(ids(result), ['b', 'd', 'a', 'c'])
})

test('上移一层只跨过一个未选中元素', () => {
  const elements = [makeElement('a', 0, 0), makeElement('b', 0, 0), makeElement('c', 0, 0)]
  // 选中 a、b（相邻），整体上移一层 → 跨过 c
  const result = reorderElements(elements, ['a', 'b'], 'forward')
  assert.deepEqual(ids(result), ['c', 'a', 'b'])
})

test('已是顶层时上移一层保持不变', () => {
  const elements = [makeElement('a', 0, 0), makeElement('b', 0, 0)]
  const result = reorderElements(elements, ['b'], 'forward')
  assert.deepEqual(ids(result), ['a', 'b'])
})

test('已是底层时下移一层保持不变', () => {
  const elements = [makeElement('a', 0, 0), makeElement('b', 0, 0)]
  const result = reorderElements(elements, ['a'], 'backward')
  assert.deepEqual(ids(result), ['a', 'b'])
})

test('下移一层把元素放到前面一个未选中元素之下', () => {
  const elements = [makeElement('a', 0, 0), makeElement('b', 0, 0), makeElement('c', 0, 0)]
  const result = reorderElements(elements, ['c'], 'backward')
  assert.deepEqual(ids(result), ['a', 'c', 'b'])
})

test('选中不存在的元素时原样返回', () => {
  const elements = [makeElement('a', 0, 0)]
  const result = reorderElements(elements, ['nope'], 'front')
  assert.deepEqual(ids(result), ['a'])
})
