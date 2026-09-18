// loupe-peek — 放大镜瞥一眼（口播模式 · evidence）
// 来源页（或一张照片）已停靠不动，只有 slowPush。旁白点到某个小细节的那一帧，一只圆形放大镜弹出来，
// 把那一小块放大给观众看约一秒，随即收走——「瞄一眼，继续讲」。它不是新的一镜：底图不换、不移、不暗，
// 放大镜在句子讲完之前就已经消失。
// 放大镜里是**同一份内容再渲染一次**（放大 zoom 倍、裁成圆），不用 canvas、不量 DOM：
// 所有位置都由「内容坐标 → 舞台坐标」的纯算式得出，所以底图被 slowPush 推着走，镜内画面也一起走。
// 设计坐标 1080×1920（NarrationStage），不含舞台，成片可直接用 LoupePeekShot。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { E, lerp, seg } from '../../_fixtures/Motion';
import { FakeArticle, N, NarrationStage, PAGE, PAGE_BOXES, SAFE, slowPush } from '../../_fixtures/Narration';

export type LoupeTarget = { x: number; y: number; w: number; h: number };
export type LoupeOffset = { dx: number; dy: number };
export type LoupeGlance = {
  /** 要放大的那一小块，内容坐标（boxes.json 的矩形，或在照片上自己选）。 */
  target: LoupeTarget;
  /** 放大镜**完全张开**的那一帧（相对本镜起点）。成片 = f(tWord(i, '词')) - shotFrom。 */
  at: number;
  /** 张开后停留的帧数；缺省取卡的 hold。 */
  hold?: number;
  /** 这一瞥单独的摆位；缺省取卡的 offset。 */
  offset?: LoupeOffset;
};

export type LoupePeekProps = {
  /** 单瞥写法：目标框（内容坐标）。给了 peeks 就忽略 target / at。 */
  target?: LoupeTarget;
  /** 单瞥写法：放大镜完全张开的帧。 */
  at?: number;
  /** 多瞥写法（一镜最多两瞥）。相邻两瞥的 at 至少相隔 hold + outFrames + MIN_GAP + inFrames（预设 30+7+6+8 = 51f）。 */
  peeks?: LoupeGlance[];
  /** 张开后停留的帧数。 */
  hold?: number;
  /** 张开用几帧（at - inFrames 之前完全不渲染）。 */
  inFrames?: number;
  /** 收走用几帧（比张开快）。 */
  outFrames?: number;
  /** 镜内相对底图的放大倍率（上限）。目标框放大后放不进镜面时会自动降到刚好放得下，最低 1.4。 */
  zoom?: number;
  /** 放大镜外径（含镜框），舞台 px。 */
  diameter?: number;
  /** 放大镜圆心相对目标中心的位移（舞台 px）。预设右上；放不进 SAFE 或压到右缘按钮区会自动翻面。 */
  offset?: LoupeOffset;
  /** 镜头总帧数（只用来算 slowPush）。 */
  duration?: number;
  /** 内容本体（内容坐标系、原点左上）。会被渲染两次：底图一次、镜内一次。 */
  content?: React.ReactNode;
  contentW?: number;
  contentH?: number;
  /** 视窗上缘对到内容的哪个 y（内容坐标）；长页用它把目标送进面板。 */
  contentY?: number;
  /** 内容在面板里的缩放；缺省 = 铺满面板（cover），水平置中。 */
  contentScale?: number;
  /** 面板与镜内的垫底色（内容没盖到的地方）。照片请给深色。 */
  backdrop?: string;
  /** 引线与目标环的颜色。 */
  color?: string;
};

// ───────── 几何与手感常量（蒙皮时不动）─────────
const PANEL_RADIUS = 28;
const RIM = 6; // 镜框宽
const RING_PAD = 8; // 目标环比目标框各边多出
const RING_W = 3;
const LEADER_W = 3;
const OPEN_FROM = 0.6; // 张开：0.6 → 1
const OPEN_BACK = 1.4; // outBack 回弹量：峰值约 +2.5%，只过冲一次
const CLOSE_TO = 0.85; // 收走：1 → 0.85 + 淡出
const PUSH_TO = 1.04;
const FIT = 0.9; // 目标框对角线放大后最多占镜面直径的几成
const MIN_ZOOM = 1.4; // 自动降倍率的下限；再低就不像放大镜了——改选更小的目标框
/** 前一瞥收完到后一瞥开始张开之间至少空几帧。不足时前一瞥的 hold 会被自动截短，绝不同屏两只放大镜。 */
export const LOUPE_MIN_GAP = 6;
// 右缘平台按钮区（narration-mode 版面表）：放大镜的外接框不进这一块
const BUTTON_ZONE = { x: 900, y0: 900, y1: 1700 };

type Resolved = { target: LoupeTarget; start: number; at: number; closeStart: number; end: number; offset: LoupeOffset };

/** 把 props 摊平成按时间排序、互不重叠的瞥。 */
const resolvePeeks = (
  raw: LoupeGlance[], hold: number, inFrames: number, outFrames: number, offset: LoupeOffset,
): Resolved[] => {
  const sorted = [...raw].sort((a, b) => a.at - b.at);
  return sorted.map((p, i) => {
    const start = p.at - inFrames;
    let closeStart = p.at + (p.hold ?? hold);
    const next = sorted[i + 1];
    if (next) closeStart = Math.max(p.at, Math.min(closeStart, next.at - inFrames - LOUPE_MIN_GAP - outFrames));
    return { target: p.target, start, at: p.at, closeStart, end: closeStart + outFrames, offset: p.offset ?? offset };
  });
};

const fits = (cx: number, cy: number, r: number) =>
  cx - r >= SAFE.x && cx + r <= SAFE.x + SAFE.w && cy - r >= SAFE.y && cy + r <= SAFE.y + SAFE.h;
const hitsButtons = (cx: number, cy: number, r: number) =>
  cx + r > BUTTON_ZONE.x && cy + r > BUTTON_ZONE.y0 && cy - r < BUTTON_ZONE.y1;

/** 选摆位：原样 → 左右翻 → 上下翻 → 都翻；先求「在 SAFE 内且不压按钮区」，退而求「在 SAFE 内」，再不行用原样（之后会被夹回 SAFE）。 */
const pickOffset = (tx: number, ty: number, o: LoupeOffset, r: number): LoupeOffset => {
  const cands: LoupeOffset[] = [o, { dx: -o.dx, dy: o.dy }, { dx: o.dx, dy: -o.dy }, { dx: -o.dx, dy: -o.dy }];
  return (
    cands.find((c) => fits(tx + c.dx, ty + c.dy, r) && !hitsButtons(tx + c.dx, ty + c.dy, r)) ??
    cands.find((c) => fits(tx + c.dx, ty + c.dy, r)) ??
    o
  );
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
  { target: DEMO_DIGITS, at: 34, hold: 34 },
  { target: DEMO_CAPTION, at: 100, hold: 30 },
];
const DEMO_CONTENT_Y = 1120; // 两个目标都落在面板中段偏下，放大镜预设摆右上放得进 SAFE

export const LOUPE_PEEK_DURATION = 150; // 5s @30fps

export const LoupePeekShot: React.FC<LoupePeekProps> = ({
  target,
  at,
  peeks,
  hold = 30,
  inFrames = 8,
  outFrames = 7,
  zoom = 2.2,
  diameter = 440,
  offset = { dx: 170, dy: -280 },
  duration = LOUPE_PEEK_DURATION,
  content = <FakeArticle />,
  contentW = PAGE.w,
  contentH = PAGE.h,
  contentY = DEMO_CONTENT_Y,
  contentScale,
  backdrop = N.paper,
  color = N.accent,
}) => {
  const frame = useCurrentFrame();
  const raw: LoupeGlance[] = peeks ?? (target && at !== undefined ? [{ target, at }] : DEMO_PEEKS);
  const list = resolvePeeks(raw, hold, inFrames, outFrames, offset);

  // ── 内容坐标 → 舞台坐标（纯算式，底图与镜内共用）──
  const s = contentScale ?? Math.max(SAFE.w / contentW, SAFE.h / contentH);
  const left = (SAFE.w - contentW * s) / 2;
  const cy0 = clamp(contentY, 0, Math.max(0, contentH - SAFE.h / s));
  const panelPt = (x: number, y: number) => ({ x: left + x * s, y: (y - cy0) * s });
  // slowPush 的缩放原点 = 各目标中心的平均（面板坐标）：推近时每个目标的漂移都最小
  const centres = list.map((p) => panelPt(p.target.x + p.target.w / 2, p.target.y + p.target.h / 2));
  const ox = centres.length ? centres.reduce((a, c) => a + c.x, 0) / centres.length : SAFE.w / 2;
  const oy = centres.length ? centres.reduce((a, c) => a + c.y, 0) / centres.length : SAFE.h / 2;
  const push = slowPush(frame, duration, 1, PUSH_TO);
  const stagePt = (x: number, y: number, k: number) => {
    const p = panelPt(x, y);
    return { x: SAFE.x + ox + (p.x - ox) * k, y: SAFE.y + oy + (p.y - oy) * k };
  };

  // 当前这一帧活着的那一瞥（resolvePeeks 保证至多一个）
  const live = list.find((p) => frame > p.start && frame < p.end);

  let overlay: React.ReactNode = null;
  if (live) {
    const R = diameter / 2;
    const t = live.target;
    const tcx = t.x + t.w / 2;
    const tcy = t.y + t.h / 2;
    // 摆位用镜尾（推到最满）时的目标位置来决定，整镜不会中途翻面
    const endPt = stagePt(tcx, tcy, PUSH_TO);
    const off = pickOffset(endPt.x, endPt.y, live.offset, R);
    const c = stagePt(tcx, tcy, push);
    const lx = clamp(c.x + off.dx, SAFE.x + R, SAFE.x + SAFE.w - R);
    const ly = clamp(c.y + off.dy, SAFE.y + R, SAFE.y + SAFE.h - R);

    // 时间轴：张开（outBack 小过冲一次）→ 停 → 收走（更快，缩到 0.85 + 淡出）
    const open = seg(frame, live.start, live.at, (x) => E.outBack(x, OPEN_BACK));
    const closing = seg(frame, live.closeStart, live.end, E.inQuad);
    const scale = lerp(open, OPEN_FROM, 1) * lerp(closing, 1, CLOSE_TO);
    const alpha = seg(frame, live.start, live.start + inFrames * 0.6, E.outCubic) * (1 - seg(frame, live.closeStart, live.end, E.outQuad));
    const grow = seg(frame, live.start, live.at, E.outCubic);

    // 目标环（舞台坐标，跟着 push）
    const k = s * push;
    const hw = (t.w * k) / 2 + RING_PAD;
    const hh = (t.h * k) / 2 + RING_PAD;
    const ringScale = lerp(grow, 1.12, 1);
    // 引线：从环的边缘沿「环心 → 镜心」方向走到镜框外缘
    const dx = lx - c.x;
    const dy = ly - c.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / dist;
    const uy = dy / dist;
    const exit = Math.min(Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity);
    const rim = dist - R * scale;
    const hasLeader = rim > exit + 4;
    const tip = lerp(grow, exit, rim);

    // 镜内总缩放：目标框放大后要整块落在镜面里（留 FIT 的边），放不下就自动降倍率，但不低于 MIN_ZOOM
    const inner = diameter - RIM * 2;
    const fitZoom = (FIT * inner) / Math.max(1, Math.hypot(t.w, t.h) * k);
    const Z = k * Math.max(MIN_ZOOM, Math.min(zoom, fitZoom));

    overlay = (
      <div style={{ position: 'absolute', inset: 0, opacity: alpha, pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute', left: c.x - hw, top: c.y - hh, width: hw * 2, height: hh * 2, boxSizing: 'border-box',
            border: `${RING_W}px solid ${color}`, borderRadius: Math.min(hh, 18),
            transform: `scale(${ringScale})`,
          }}
        />
        {hasLeader && (
          <svg width={1080} height={1920} style={{ position: 'absolute', left: 0, top: 0 }}>
            <line
              x1={c.x + ux * exit} y1={c.y + uy * exit} x2={c.x + ux * tip} y2={c.y + uy * tip}
              stroke={color} strokeWidth={LEADER_W} strokeLinecap="round"
            />
          </svg>
        )}
        {/* 放大镜：整只一起缩放（镜框 + 镜内），圆心固定 */}
        <div
          style={{
            position: 'absolute', left: lx - R, top: ly - R, width: diameter, height: diameter, borderRadius: '50%',
            transform: `scale(${scale})`, background: N.paper,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.55), 0 22px 48px rgba(0,0,0,0.36), 0 4px 10px rgba(0,0,0,0.22)',
          }}
        >
          <div style={{ position: 'absolute', left: RIM, top: RIM, width: inner, height: inner, borderRadius: '50%', overflow: 'hidden', background: backdrop }}>
            {/* 同一份内容的第二次渲染：放大 Z 倍，目标中心对到圆心 */}
            <div
              style={{
                position: 'absolute', left: inner / 2 - tcx * Z, top: inner / 2 - tcy * Z, width: contentW, height: contentH,
                transform: `scale(${Z})`, transformOrigin: '0 0',
              }}
            >
              {content}
            </div>
            {/* 极淡的内缘暗角 + 内侧发丝线，把镜面和纸面分开；不做反光、不做模糊 */}
            <div
              style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(0,0,0,0) 68%, rgba(0,0,0,0.10) 100%)',
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.28)',
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          position: 'absolute', left: SAFE.x, top: SAFE.y, width: SAFE.w, height: SAFE.h,
          borderRadius: PANEL_RADIUS, overflow: 'hidden', background: backdrop,
          boxShadow: `0 0 0 2px ${N.line}33`,
        }}
      >
        {/* 底图：整镜只有这一条极缓推近，不位移、不变暗 */}
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${push})`, transformOrigin: `${ox}px ${oy}px` }}>
          <div
            style={{
              position: 'absolute', left, top: -cy0 * s, width: contentW, height: contentH,
              transform: `scale(${s})`, transformOrigin: '0 0',
            }}
          >
            {content}
          </div>
        </div>
      </div>
      {overlay}
    </>
  );
};

export const LoupePeek: React.FC = () => (
  <NarrationStage>
    <LoupePeekShot />
  </NarrationStage>
);
