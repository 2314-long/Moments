import { memo } from 'react'
import type { CSSProperties } from 'react'
import type { Page } from '@/types/album'
import { BookPage, pageThickness } from './BookPage'

/**
 * 打开的纪念册跨页。
 *
 * ── 空间模型 ──────────────────────────────────────────────────
 *
 * 从上往下看，一本书是**一叠有厚度的纸板**：
 *
 *        ┌───────────┬───────────┐
 *        │  当前左页  │  当前右页  │   ← 摊开的两块纸板
 *        └───────────┴───────────┘
 *                     ↑
 *              两张纸向里陷进去的折痕 / 装订缝
 *
 * ── 书脊的正确构成 ────────────────────────────────────────────
 *
 * 左页是一张**完整连续**的纸，右页也是。中缝不能看起来像「第三张纸」，
 * 因此这里刻意**没有**任何跨在两页之上的装饰层。书脊只由三样东西构成：
 *
 *   1. `PageFoldShade` —— 每页内缘的折痕，**渲染在该页自己的容器里**，
 *      所以它天然跟随这一页的一切变换（静止时贴在纸上，翻页时随纸叶走）；
 *   2. `[data-gutter]` —— 两页之间那条真正的窄缝，画在页面**之下**，
 *      只有缝里露出来的那一条是暗的；
 *   3. 纸叶抬起时投在页面上的动态阴影（随进度增强/收敛）。
 *
 * 早先这里挂过一条 `width: 74` 的整页高渐变，跨在两页之上、压在所有纸之上。
 * 它的几何与任何一张纸都无关，于是中缝就成了「一张浮在书上的独立纸」：
 * 翻页时它不跟着任何一页动，静止时它的暗带边界（落在右页正文起始处）
 * 又与纸边对不上。详见下面「关于书脊」的注释。
 *
 * ── 为什么书本与纸叶是两个并列的透视容器 ───────────────────────
 *
 * 这是本项目里最反直觉、也最容易踩的一个 CSS 3D 陷阱：
 *
 * 如果书本和正在翻动的纸叶处在**同一个** `preserve-3d` 上下文里，
 * 浏览器会按三维位置给它们排序。纸叶转到一半时，它远离书脊的那一半
 * 在 Z 轴上位于静止页之后 —— 于是被判定成「在下面」而被盖住，
 * 整个翻页过程中的纸板会凭空消失（90° 时最明显，那一帧本该是
 * 纸叠侧边立起来的样子）。
 *
 * 解法：让两者各自拥有独立的 perspective 容器（互为兄弟节点），
 * 于是它们变成普通的层叠元素，前后关系由 z-index 决定，
 * 纸叶就永远不会被静止页遮住。
 */

export interface FlipVisual {
  direction: 'next' | 'prev'
  /** 0..1 */
  progress: number
  /** 正在翻动的那一页（纸叶正面） */
  leafFront: Page | null
  /** 纸叶背面（翻过来之后朝上的那一面） */
  leafBack: Page | null
  /**
   * 翻页过程中，静止层（纸叶下面）两侧各显示什么。
   *
   * 规则只有一条，但它决定了「页面会不会在翻页途中变化」：
   *
   *   落点那一侧 → 用**目标页**（纸叶一抬起就露出它，落地时正好接上）
   *   另一侧     → 用**起始页**，而且整个翻页过程**绝不改变**
   *
   * 为什么另一侧必须始终保持起始页：那一侧是用户当前正在阅读的页面。
   * 纸叶在中途（90° 附近）是完全侧立、看不见的，此时那一侧是**露在外面**的，
   * 任何改动都会被直接看到。所以它只有在纸叶真正落地并卸下的那一帧，
   * 才可以和目标页交接（由 Reader 的 commit 保证同帧完成）。
   */
  underLeft: Page | null
  underRight: Page | null
  /**
   * 纸叶落地后要提交的那一屏。
   *
   * `progress` 正好到达 1 的那一帧（Reader 的 settleThenCommit 插入的「落平帧」）
   * 直接按它渲染，而**不是**让纸叶背面平铺去凑。这样落平帧与提交之后的静止帧
   * 是同一棵 DOM、同一套层叠关系：书脊与装订缝的压盖顺序完全一致，
   * 交接处连一个像素都不会变。
   *
   * 反面教材（这里踩过）：让纸叶背面充当落平帧。它的内容与位置都是对的，
   * 但它挂在最上层（zIndex 40），会盖住书脊与装订缝；而提交后纸叶被卸下，
   * 这两者又回到纸面之上 —— 于是纸叶消失的一瞬间，书脊重新压上来，页面内侧
   * 看起来「动了一下」。
   */
  landedLeft: Page | null
  landedRight: Page | null
}

export interface BookSpreadProps {
  size: { width: number; height: number }
  /**
   * 静止时显示的左页 / 右页。
   *
   * 翻页过程中，被纸叶盖住的那一侧会换成 flip.underLeft / underRight
   * （它被纸叶盖住，提前换看不见，但必须与纸叶落地同帧，才不会闪）；
   * 另一侧继续沿用这里的值，保持不动。
   */
  left: Page | null
  right: Page | null
  /** 翻页中（null 表示静止） */
  flip: FlipVisual | null
  /** 页面 null 时该槽位的兜底内容（例如封面单独成屏时的硬壳装帧板） */
  emptySlot?: React.ReactNode
  className?: string
  style?: CSSProperties
}

/* ------------------------------------------------------------------ *
 * 纸张几何
 * ------------------------------------------------------------------ */

/** 两页之间的装订缝 */
export const BOOK_GAP = 14

/**
 * 折痕暗部从纸边往里渗透的距离（页面坐标）。
 *
 * 「书脊」在视觉上只能是**纸张内缘的折痕**：一条很窄、贴着纸边由深到无的暗部，
 * 外加一条极细的折痕线。它必须待在**页面自己的矩形里**，并且贴着页面真正的
 * 内边缘 —— 不能是一条跨在两页之上、位置与纸边无关的独立竖带。
 *
 * 早先的做法是：书脊是一条 `width: 74` 的整页高渐变，挂在 z-index 50 的
 * 兄弟层上，从 `width - 30` 起跨过两页。它的几何与任何一张纸都没有关系，
 * 于是中缝看起来就是「第三张纸」。（用 `size.width - 30` 取值还有一处笔误：
 * 74 宽的元素起点在 W−30，终点在 W+44，**中心落在 W+7，而不是书脊 W+GAP/2**，
 * 整条暗带因此偏向右侧页内 5px 以上。）
 */
const FOLD_BAND = 34

/**
 * 页面内缘的折痕。
 *
 * 渲染在**页面容器内部**，所以它天然跟随该页的一切变换 —— 静止时贴在同一张
 * 纸上，翻页时随纸叶一起走。这一点很关键：早先那条跨页的独立竖带既不跟随
 * 左页也不跟随右页，翻页途中就成了一个与运动无关的、浮在书上的灰黑色块。
 */
function PageFoldShade({ side, height }: { side: 'left' | 'right'; height: number }) {
  /**
   * 渐变方向：从左页看，暗部在内缘（右侧）；从右页看，暗部在内缘（左侧）。
   * 起点就是纸边本身，所以「哪条边有阴影」与「纸到哪里结束」永远一致。
   */
  const towardInner = side === 'left' ? 'to left' : 'to right'
  const edge = side === 'left' ? 'right' : 'left'
  const anchor = { [edge]: 0 } as CSSProperties

  return (
    <div
      className="pointer-events-none absolute top-0"
      data-fold={side}
      style={{
        width: FOLD_BAND,
        height,
        ...anchor,
        background: `linear-gradient(${towardInner}, rgba(30,24,16,0.40) 0%, rgba(30,24,16,0.19) 15%, rgba(30,24,16,0.06) 46%, rgba(30,24,16,0) 100%)`,
        zIndex: 30,
      }}
    >
      {/* 折痕本体：只有 5 页px 宽，紧贴纸边 */}
      <div
        className="pointer-events-none absolute inset-y-0"
        style={{
          width: 5,
          ...anchor,
          background: `linear-gradient(${towardInner}, rgba(58,46,30,0.30) 0%, rgba(58,46,30,0.11) 22%, rgba(58,46,30,0) 100%)`,
        }}
      />
      {/* 纸边倒角的一丁点高光，让折痕「立」起来而不是一条脏边 */}
      <div
        className="pointer-events-none absolute inset-y-0"
        style={{
          width: 2,
          ...anchor,
          background: `linear-gradient(${towardInner}, rgba(255,252,244,0.30) 0%, rgba(255,252,244,0) 100%)`,
        }}
      />
    </div>
  )
}


/**
 * 为什么不画「书口露出的下层纸边」。
 *
 * 这里曾经画过：先在书口外侧铺一层层错开的纸片（阶梯），后来改成一条平直的厚边。
 * 两种都被去掉了，原因不同但结论一样 —— **书口外侧不该有任何凸出**：
 *
 *  · 阶梯版：最外沿比页面多伸出 21 页px（≈16 屏幕px），看起来就是
 *    「每一页都不齐、右边有凸出来」。
 *  · 厚边版：虽然平直了，但它仍然凸出 16 页px；而且它的厚度只能跟着
 *    「还剩多少页」走，翻页时必然变化 —— 那是一处需要额外维护、
 *    又永远会和页面本体争夺注意力的装饰。
 *
 * 书的厚度已经由「纸板侧面」（`BookPage` 的四个 `EdgeFace`）和封面装帧边
 * 表达清楚了，够用。现在左右页与封面完全齐平，书口没有任何多余形状，
 * 也就没有任何会在翻页时动的东西。
 */

/**
 * 正在翻动的那块纸板。
 *
 * 是一块真正的双面厚纸板：正面是当前页，背面是翻过去之后的下一页。
 * 绕书脊旋转 0 → 180°，中途能看到书口（纸叠侧边）与书脊侧立起来。
 */
function FlippingLeaf({
  front,
  back,
  size,
  direction,
  angle,
  thickness,
}: {
  front: Page | null
  back: Page | null
  size: { width: number; height: number }
  direction: 'next' | 'prev'
  angle: number
  thickness: number
}) {
  const isNext = direction === 'next'
  const rotate = isNext ? -angle : angle
  const left = isNext ? size.width + BOOK_GAP : 0
  const side: 'left' | 'right' = isNext ? 'right' : 'left'

  /**
   * 旋转轴必须落在**装订缝的正中**，而不是某一页的边缘。
   *
   * 跨页的布局是 [左页][GAP][右页]，GAP = BOOK_GAP = 14。
   * 绕 x = h 转 180° 会把 x 映射成 2h − x，于是纸叶盒体 [W+GAP, 2W+GAP]
   * 落到 [2h−2W−GAP, 2h−W−GAP]。要让它正好等于左页 [0, W]，解得
   *
   *     h = W + GAP / 2      ← 缝隙正中（物理上也就是书脊的位置）
   *
   * 早先取的是右页左边缘（h = W + GAP，即 `left center`），纸叶转到 180°
   * 会落在 [GAP, W+GAP] —— **整整偏右一个 GAP（14px）**。后果是一整套连锁现象：
   *
   *   · 翻页途中纸叶盖住了中间的缝隙 → 「书中间没有空隙」
   *   · 落平后真实页面就位、缝隙回来 → 「翻完又有空隙了」
   *   · 纸叶上的内容比最终页面偏右 14px → 提交那一刻整页向左跳 → 「页面会移动」
   *
   * 注意这个偏移在 0° 时是 0、在 180° 时最大，所以它看起来不像是「一开始就错位」，
   * 而像是「越翻越不对、翻完才跳一下」。
   *
   * transform-origin 的 px 值是相对元素自身左边框的：
   *   向后翻：盒体左边在 W+GAP 处 → 原点取 -GAP/2
   *   向前翻：盒体左边在 0 处     → 原点取 W + GAP/2
   */
  const transformOrigin = isNext
    ? `${-BOOK_GAP / 2}px center`
    : `${size.width + BOOK_GAP / 2}px center`

  const t = Math.min(1, angle / 180)

  /**
   * 注意：这里**不再有** t = 1 的「落地帧特例」。
   *
   * 落平那一帧已经交给 BookSpread：它直接把提交后的那一屏当静止页渲染，
   * 于是落平帧与提交后的静止帧是同一棵 DOM，连文字抗锯齿都不会变。
   * 纸叶只负责 0 ≤ t < 1 —— 也就是它真正在空间里转动的那段时间。
   *
   * 早先的做法是在这里用 face="front" 把纸叶背面平铺出来充当落地帧。
   * 那样内容与位置都对（3D 合成层会让文字失去次像素抗锯齿，
   * 实测文字区域差异 7.9%，所以当时确实比直接收尾好），
   * 但它挂在最上层，会盖住书脊与装订缝，而提交后这两者又回到纸面之上 ——
   * 纸叶消失的一瞬间，页面内侧仍然会「动一下」。
   */
  return (
    <div
      className="absolute top-0"
      style={{
        left,
        width: size.width,
        height: size.height,
        transformOrigin,
        transform: `rotateY(${rotate}deg)`,
        /**
         * 关键：这一层**只负责旋转**，绝不能带 overflow / border-radius / filter，
         * 否则 CSS 会强制 transform-style: flat，纸板的 3D 厚度会被拍平。
         * 裁切与圆角都在内部的 BookPage 里完成。
         */
        transformStyle: 'preserve-3d',
        zIndex: 30,
      }}
    >
      {/*
        正面：把 thickness 交给 BookPage，由它渲染「正面纸面 + 四条厚度侧面」。
        这一层**不再额外做 translateZ** —— 正面纸面必须停在 Z=0，
        与静止页的表面完全重合，否则在 perspective 下会有约 0.3% 的缩放误差，
        翻页起点/终点都会看出一点错位。厚度靠侧面向 -Z 挤出即可。
      */}
      {front && (
        <BookPage
          page={front}
          size={size}
          side={side}
          thickness={thickness}
          face="front"
          hideSpineEdge
        />
      )}

      {back && (
        /**
         * 纸板的背面。
         *
         *  - `translateZ(-thickness × (1 − t))`：把这一面推到纸板另一侧。
         *    关键是它随进度**收敛到 0** —— 落地那一帧背面正好落在 Z=0，
         *    与接替它的静止页表面完全重合，交接处不会出现缩放跳变。
         *    如果固定为 -thickness，落地时会有约 0.3% 的缩放差（实测差异 1.6%）。
         *  - `rotateY(180deg)` 让这一面朝向纸板背面，同时把内容翻正。
         *    只做一次 180°：再加一次旋转或 scaleX(-1) 都会翻回去变成镜像
         *    （实测照片与文字的左右顺序会整体对调）。
         */
        <div
          className="absolute inset-0"
          style={{
            // 厚度位移随进度收敛到 0：落地那一帧背面正好在 Z=0，
            // 与接替它的静止页表面重合，交接不产生缩放跳变
            transform: `translateZ(${-thickness * (1 - t)}px) rotateY(180deg)`,
            transformStyle: 'preserve-3d',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
          <BookPage page={back} size={size} side={side} thickness={0} face="back" />
        </div>
      )}

      {/* 纸板抬离桌面时整体压暗，正中（90°）最暗 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: `rgba(12,10,8,${Math.sin(Math.PI * t) * 0.22})`,
          zIndex: 5,
        }}
      />
      {/* 掠过纸面的高光 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(${
            side === 'left' ? '270deg' : '90deg'
          }, rgba(255,250,238,${Math.sin(Math.PI * t) * 0.22}) 0%, rgba(255,250,238,0) 62%)`,
          zIndex: 6,
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 跨页
 * ------------------------------------------------------------------ */

function BookSpreadImpl({
  size,
  left,
  right,
  flip,
  emptySlot,
  className,
  style,
}: BookSpreadProps) {
  const thickness = pageThickness(size)

  /**
   * 静止层（纸叶下面）实际渲染的两页。
   *
   * 只在翻页时改用 flip.underLeft / underRight —— 它们的取法见 FlipVisual
   * 的注释：被纸叶盖住的一侧提前切到目标页，另一侧保持不动。
   */
  /**
   * 落平帧：progress 正好到达 1（Reader 在提交逻辑页号之前额外渲染的那一帧）。
   *
   * 这一帧**不再渲染纸叶**，而是直接把「提交后要显示的那一屏」当静止页渲染。
   * 于是它与下一帧（commit 之后）走完全相同的渲染路径 —— 无论是纸叠厚度、
   * 书脊压盖还是装订缝，都不存在「交接前后不一样」的东西。
   */
  const landed = flip !== null && flip.progress >= 1

  const cardLeft = flip ? (landed ? flip.landedLeft : flip.underLeft) : left
  const cardRight = flip ? (landed ? flip.landedRight : flip.underRight) : right

  const t = flip?.progress ?? 0
  const angle = t * 180

  /* 动态阴影：跟着纸板运动，抬起时增强、落下时收敛 */
  // 抬起的整体强度（90° 最强）；落平帧没有纸叶，直接归零
  const lift = landed ? 0 : Math.sin(Math.PI * t)
  // 纸叶在右侧时，阴影落在右页；越过中线后逐渐移到左页
  const shadowOnRight = flip ? Math.max(0, 1 - t * 1.55) : 0
  const shadowOnLeft = flip ? Math.max(0, (t - 0.45) * 1.85) : 0

  return (
    <div
      className={className}
      /**
       * 数据属性：把「这一帧到底渲染了哪几页」暴露给 DOM。
       * 翻页涉及静止层 + 纸叶正反面共四处页面，出问题时很难靠肉眼看出来，
       * 有这几个属性就能直接核对语义（也是自动化视觉验收的抓手）。
       */
      data-left={cardLeft?.title ?? ''}
      data-right={cardRight?.title ?? ''}
      data-leaf-front={!landed && flip?.leafFront ? flip.leafFront.title : ''}
      data-leaf-back={!landed && flip?.leafBack ? flip.leafBack.title : ''}
      /* 进度保留 5 位：3 位时 p=0.99997 会打印成 "1.000"，
         与同时为 0 的 data-landed 自相矛盾（落平帧其实还没到） */
      data-progress={t.toFixed(5)}
      data-landed={landed ? '1' : '0'}
      style={{
        position: 'relative',
        width: size.width * 2 + BOOK_GAP,
        height: size.height,
        ...style,
      }}
    >
      {/* ── 书本本体：自己的透视上下文（不与纸叶共享 3D 排序）────── */}
      <div
        className="absolute inset-0"
        style={{ perspective: 3400, perspectiveOrigin: '50% 44%' }}
      >
        <div
          className="absolute inset-0"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/*
            ── 装订缝：两页之间那条**真实的缝** ──────────────────────
            它由「页面的厚度侧面 + 下面这层窄缝」共同形成 ——
            两页各自的厚度切面在缝隙两侧各立起 10 页px，中间露出这层暗色。
            缝的渐变从中心向两侧收，所以看起来是两张纸往书脊里陷进去，
            而不是页面上压了一条东西。它画在页面之下（zIndex 1），
            纸张一盖上去就只剩缝里露出的那一条。
          */}
          <div
            className="pointer-events-none absolute top-0"
            data-gutter=""
            style={{
              left: size.width - 8,
              width: BOOK_GAP + 16,
              height: size.height,
              zIndex: 1,
              background:
                'linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(26,21,15,0.62) 30%, rgba(8,6,4,0.88) 50%, rgba(26,21,15,0.62) 70%, rgba(0,0,0,0) 100%)',
            }}
          />

          {/* 当前跨页的两块纸板 */}
          <div
            className="absolute top-0"
            style={{
              left: 0,
              width: size.width,
              height: size.height,
              zIndex: 10,
              transformStyle: 'preserve-3d',
            }}
          >
            {cardLeft ? (
              <BookPage page={cardLeft} size={size} side="left" thickness={thickness} face="front" />
            ) : (
              <div className="absolute inset-0">{emptySlot}</div>
            )}

            {/* 左页内缘的折痕：在页面自己的矩形里，贴着真正的纸边 */}
            <PageFoldShade side="left" height={size.height} />

            {/* 翻动纸板投在左页上的阴影 */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `linear-gradient(270deg, rgba(0,0,0,${0.40 * shadowOnLeft * lift}) 0%, rgba(0,0,0,0) 68%)`,
                zIndex: 20,
              }}
            />
          </div>

          <div
            className="absolute top-0"
            style={{
              left: size.width + BOOK_GAP,
              width: size.width,
              height: size.height,
              zIndex: 10,
              transformStyle: 'preserve-3d',
            }}
          >
            {cardRight ? (
              <BookPage page={cardRight} size={size} side="right" thickness={thickness} face="front" />
            ) : (
              <div className="absolute inset-0">{emptySlot}</div>
            )}

            {/* 右页内缘的折痕：同样贴在右页自己的左边 */}
            <PageFoldShade side="right" height={size.height} />

            {/* 翻动纸板投在右页上的阴影 */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `linear-gradient(90deg, rgba(0,0,0,${0.46 * shadowOnRight * lift}) 0%, rgba(0,0,0,0) 68%)`,
                zIndex: 20,
              }}
            />
          </div>

        </div>
      </div>

      {/* ── 正在翻动的纸板：独立透视上下文 + 最高层 ─────────────
          落平帧不渲染纸叶（此时它已经与接替它的静止页完全重合）。 */}
      {flip && !landed && (flip.leafFront || flip.leafBack) && (
        <div
          className="absolute inset-0"
          data-leaf-layer=""
          style={{ perspective: 3400, perspectiveOrigin: '50% 44%', zIndex: 40 }}
        >
          <FlippingLeaf
            front={flip.leafFront}
            back={flip.leafBack}
            size={size}
            direction={flip.direction}
            angle={angle}
            thickness={thickness}
          />
        </div>
      )}

      {/*
        ── 关于书脊：为什么这里**不再有**一层跨页的「书脊渐变」 ──────
        这里原本挂着一个 z-index 50 的兄弟层，里面是一条 `width: 74`、
        整页高的渐变，从 `size.width - 30` 起跨在两页之上。它带来三类问题：

          1. 它不属于任何一张纸（既不跟随左页也不跟随右页），
             于是中缝看起来像「第三张纸」/ 一个独立叠加的 DOM 层；
          2. 起点 W−30、宽 74，让它有 30px 压在左页、44px 压在右页，
             **左右并不对称**，最深的那条暗带落在右页正文起始处，
             而不是落在折痕上；
          3. 它压在纸叶之上，所以翻页途中它始终是一条与运动无关的灰黑色块。

        现在书脊由三样东西共同构成，且都**归属明确**：
          · 每页内缘的折痕（PageFoldShade）—— 长在页面自己的矩形里，跟着页面走；
          · 两页之间的装订缝（data-gutter）—— 一条真正的窄缝，画在页面之下；
          · 纸叶抬起时投在页面上的动态阴影（上面那两层）。

        于是中缝是「两张纸向书脊里陷进去」，而不是「页面上压了一条东西」。
      */}

      {/* 纸板整体落地阴影（挂在最外层，避免 filter 拍平 3D） */}
      <div
        className="pointer-events-none absolute"
        style={{
          left: 6,
          right: 6,
          bottom: -Math.max(10, size.height * 0.02),
          height: Math.max(16, size.height * 0.035),
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 72%)',
          filter: 'blur(6px)',
          zIndex: 0,
        }}
      />
    </div>
  )
}

export const BookSpread = memo(BookSpreadImpl)
