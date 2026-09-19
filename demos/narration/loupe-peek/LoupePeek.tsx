// loupe-peek — 原地浮起瞥一眼（口播模式 · evidence）
// 来源页（或一张照片）已停靠，只有 slowPush。旁白点到某个小细节时，页面压暗一半，那一小块像一张卡从原位浮起、
// 放大到读得清（预设 2.4 倍、水平置中），停约一秒，再落回原位、页面恢复——「瞄一眼，继续讲」。它不是新的一镜：
// 底图不换、不移，浮起的卡落回去之后画面完全回到原样。
// （2026-09 改版：原圆形玻璃放大镜太拟物，使用者从「放大框＋引线 / 原地浮起 / 镜头推近 / 细节抽屉」四案里选了原地浮起。）
// 浮起卡里是**同一份内容再渲染一次**（以放大后的实际尺寸排版，不是点阵放大，字保持锐利），不用 canvas、不量 DOM：
// 所有位置都由「内容坐标 → 舞台坐标」的纯算式得出，底图被 slowPush 推着走，浮起卡的起点也跟着走。
// 设计坐标 1080×1920（NarrationStage），不含舞台，成片可直接用 LoupePeekShot。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { E, lerp, seg } from '../../_fixtures/Motion';
import { FakeArticle, N, NarrationStage, PAGE, PAGE_BOXES, SAFE, slowPush } from '../../_fixtures/Narration';

export type LoupeTarget = { x: number; y: number; w: number; h: number };
export type LoupeGlance = {
  /** 要放大的那一小块，内容坐标（boxes.json 的矩形，或在照片上自己选）。 */
  target: LoupeTarget;
  /** 浮起卡**完全放大**的那一帧（相对本镜起点）。成片 = f(tWord(i, '词')) - shotFrom。 */
  at: number;
  /** 放大后停留的帧数；缺省取卡的 hold。 */
  hold?: number;
};

export type LoupePeekProps = {
  /** 单瞥写法：目标框（内容坐标）。给了 peeks 就忽略 target / at。 */
  target?: LoupeTarget;
  /** 单瞥写法：完全放大的帧。 */
  at?: number;
  /** 多瞥写法（一镜最多两瞥）。相邻两瞥的 at 至少相隔 hold + outFrames + MIN_GAP + inFrames（预设 30+10+6+12 = 58f）。 */
  peeks?: LoupeGlance[];
  /** 放大后停留的帧数。 */
  hold?: number;
  /** 浮起用几帧（at - inFrames 之前完全不渲染）。 */
  inFrames?: number;
  /** 落回用几帧。 */
  outFrames?: number;
  /** 相对底图的放大倍率（上限）。放大后宽度超过面板宽 − 80 时自动降到刚好放得下。 */
  zoom?: number;
  /** 浮起期间页面压暗的程度（黑幕不透明度峰值）。 */
  dim?: number;
  /** 镜头总帧数（只用来算 slowPush）。 */
  duration?: number;
  /** 内容本体（内容坐标系、原点左上）。会被渲染两次：底图一次、浮起卡一次。 */
  content?: React.ReactNode;
  contentW?: number;
  contentH?: number;
  /** 视窗上缘对到内容的哪个 y（内容坐标）；长页用它把目标送进面板。 */
  contentY?: number;
  /** 内容在面板里的缩放；缺省 = 铺满面板（cover），水平置中。 */
  contentScale?: number;
  /** 面板与浮起卡的垫底色（内容没盖到的地方）。照片请给深色。 */
  backdrop?: string;
};

// ───────── 几何与手感常量（蒙皮时不动）─────────
const PANEL_RADIUS = 28;
const CARD_PAD = 14; // 浮起卡比目标框各边多出的留白（内容 px，用垫底色补，不多带邻字——多带会切进半个邻字）
const CLIP_Y = 4; // 内容只在上下多露这么多（行距里的空白），左右严格裁在目标框上
const CARD_RADIUS = 18; // 完全浮起时的圆角（原位时 4）
const SIDE_MARGIN = 40; // 浮起卡离面板左右缘至少这么多
const PUSH_TO = 1.04;
/** 前一瞥落回到后一瞥开始浮起之间至少空几帧。不足时前一瞥的 hold 会被自动截短，绝不同屏两张浮起卡。 */
export const LOUPE_MIN_GAP = 6;

type Resolved = { target: LoupeTarget; start: number; at: number; closeStart: number; end: number };

/** 把 props 摊平成按时间排序、互不重叠的瞥。 */
const resolvePeeks = (raw: LoupeGlance[], hold: number, inFrames: number, outFrames: number): Resolved[] => {
  const sorted = [...raw].sort((a, b) => a.at - b.at);
  return sorted.map((p, i) => {
    const start = p.at - inFrames;
    let closeStart = p.at + (p.hold ?? hold);
    const next = sorted[i + 1];
    if (next) closeStart = Math.max(p.at, Math.min(closeStart, next.at - inFrames - LOUPE_MIN_GAP - outFrames));
    return { target: p.target, start, at: p.at, closeStart, end: closeStart + outFrames };
  });
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ───────── demo 数据：两瞥 ─────────
// 第一瞥：keyLine「比去年同期成長百分之四十一，」里的「百分之四十一」= 第 7–12 字，每字宽 PAGE.fontSize
const DEMO_DIGITS: LoupeTarget = {
  x: PAGE_BOXES.keyLine.x + 7 * PAGE.fontSize, y: PAGE_BOXES.keyLine.y, w: 6 * PAGE.fontSize, h: PAGE_BOXES.keyLine.h,
};
// 第二瞥：图表占位块左下角图说里的「近三年報名人數」（图说 padding 18、字级 24；跳过前 3 个字「圖表：」，取 7 个字）
const DEMO_CAPTION: LoupeTarget = {
  x: PAGE_BOXES.chart.x + 18 + 3 * 24 - 4, y: PAGE_BOXES.chart.y + PAGE_BOXES.chart.h - 56, w: 7 * 24 + 8, h: 42,
};
const DEMO_PEEKS: LoupeGlance[] = [
  { target: DEMO_DIGITS, at: 38, hold: 30 },
  { target: DEMO_CAPTION, at: 108, hold: 26 },
];
const DEMO_CONTENT_Y = 1120;

export const LOUPE_PEEK_DURATION = 150; // 5s @30fps

export const LoupePeekShot: React.FC<LoupePeekProps> = ({
  target,
  at,
  peeks,
  hold = 30,
  inFrames = 12,
  outFrames = 10,
  zoom = 2.4,
  dim = 0.5,
  duration = LOUPE_PEEK_DURATION,
  content = <FakeArticle />,
  contentW = PAGE.w,
  contentH = PAGE.h,
  contentY = DEMO_CONTENT_Y,
  contentScale,
  backdrop = N.paper,
}) => {
  const frame = useCurrentFrame();
  const raw: LoupeGlance[] = peeks ?? (target && at !== undefined ? [{ target, at }] : DEMO_PEEKS);
  const list = resolvePeeks(raw, hold, inFrames, outFrames);

  // ── 内容坐标 → 面板坐标（纯算式，底图与浮起卡共用）──
  const s = contentScale ?? Math.max(SAFE.w / contentW, SAFE.h / contentH);
  const left = (SAFE.w - contentW * s) / 2;
  const cy0 = clamp(contentY, 0, Math.max(0, contentH - SAFE.h / s));
  const panelPt = (x: number, y: number) => ({ x: left + x * s, y: (y - cy0) * s });
  // slowPush 的缩放原点 = 各目标中心的平均（面板坐标）：推近时每个目标的漂移都最小
  const centres = list.map((p) => panelPt(p.target.x + p.target.w / 2, p.target.y + p.target.h / 2));
  const ox = centres.length ? centres.reduce((a, c) => a + c.x, 0) / centres.length : SAFE.w / 2;
  const oy = centres.length ? centres.reduce((a, c) => a + c.y, 0) / centres.length : SAFE.h / 2;
  const push = slowPush(frame, duration, 1, PUSH_TO);
  const pushed = (x: number, y: number) => {
    const q = panelPt(x, y);
    return { x: ox + (q.x - ox) * push, y: oy + (q.y - oy) * push };
  };

  // 每一瞥的进度：0（原位）→ 1（完全浮起）→ 0（落回）
  const progress = (p: Resolved) =>
    frame < p.start || frame >= p.end ? 0 : seg(frame, p.start, p.at, E.outCubic) * (1 - seg(frame, p.closeStart, p.end, E.inOutCubic));
  const dimNow = Math.max(0, ...list.map(progress)) * dim;

  const renderContent = (sc: number, dx: number, dy: number) => (
    <div style={{ position: 'absolute', left: dx, top: dy, width: contentW, height: contentH, transform: `scale(${sc})`, transformOrigin: '0 0' }}>{content}</div>
  );

  return (
    <div style={{ position: 'absolute', left: SAFE.x, top: SAFE.y, width: SAFE.w, height: SAFE.h }}>
      {/* 底图面板 */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: PANEL_RADIUS, overflow: 'hidden', background: backdrop }}>
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${push})`, transformOrigin: `${ox}px ${oy}px` }}>
          {renderContent(s, left, -cy0 * s)}
        </div>
        <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: dimNow }} />
      </div>

      {/* 浮起卡：从目标原位（面板坐标）插值到放大后的水平置中位置 */}
      {list.map((p, i) => {
        const t = progress(p);
        if (t <= 0) return null;
        const tp = { x: p.target.x - CARD_PAD, y: p.target.y - CARD_PAD, w: p.target.w + CARD_PAD * 2, h: p.target.h + CARD_PAD * 2 };
        const a = pushed(tp.x, tp.y);
        const sc0 = s * push;
        const r0 = { x: a.x, y: a.y, w: tp.w * sc0, h: tp.h * sc0 };
        const sc1 = Math.min(s * zoom, (SAFE.w - SIDE_MARGIN * 2) / tp.w);
        const w1 = tp.w * sc1;
        const h1 = tp.h * sc1;
        const r1 = { x: (SAFE.w - w1) / 2, y: clamp(r0.y + r0.h / 2 - h1 / 2, SIDE_MARGIN, SAFE.h - SIDE_MARGIN - h1), w: w1, h: h1 };
        const sc = lerp(t, sc0, sc1);
        const x = lerp(t, r0.x, r1.x);
        const y = lerp(t, r0.y, r1.y);
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: x, top: y, width: tp.w * sc, height: tp.h * sc,
              borderRadius: lerp(t, 4, CARD_RADIUS), overflow: 'hidden', background: backdrop,
              boxShadow: `0 ${lerp(t, 0, 24)}px ${lerp(t, 0, 60)}px rgba(0,0,0,${lerp(t, 0, 0.5)})`,
            }}
          >
            <div style={{ position: 'absolute', left: CARD_PAD * sc, top: (CARD_PAD - CLIP_Y) * sc, width: p.target.w * sc, height: (p.target.h + CLIP_Y * 2) * sc, overflow: 'hidden' }}>
              {renderContent(sc, -p.target.x * sc, -(p.target.y - CLIP_Y) * sc)}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const LoupePeek: React.FC = () => (
  <NarrationStage>
    <LoupePeekShot />
  </NarrationStage>
);
