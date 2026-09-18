// ink-circle-note — 手绘墨圈圈出原文里的一样东西，再拉一支小箭头到旁边的短批注（口播模式 · evidence）
// 旁白讲到「就是这个数字 / 这个名字」的那一帧，一圈墨线绕着它画出来（首尾交叠约 8%，像真的一笔圈），
// 接着一支微弯的箭头从圈边拉出去，箭头落定后 2–6 个字的批注浮出来。
// 圈、箭头、批注全部画在**内容坐标**里，和页面共用同一个变换容器：页面滚动、相机推近，墨迹都黏在它标的东西上。
// 笔压：单条 SVG path 线宽不能变，这里用三层同路径叠画（全长细线 + 中段两层渐粗）来假装「起笔轻、中段重、收笔轻」。
// 设计坐标 1080×1920（NarrationStage），不含舞台，成片可直接用 InkCircleNoteShot。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { E, lerp, rand, seg } from '../../_fixtures/Motion';
import { FakeArticle, N, NarrationStage, PAGE, PAGE_BOXES, SAFE, slowPush } from '../../_fixtures/Narration';

export type InkRect = { x: number; y: number; w: number; h: number };
export type InkNoteSide = 'right' | 'left' | 'above' | 'below';
export type InkPageKey = { at: number; y: number };

export type InkAnnotation = {
  /** 要圈的东西，内容坐标（成片取 boxes.json 的矩形；照片则是照片像素 ÷ 显示比例后的矩形）。 */
  target: InkRect;
  /** 墨圈开始画的帧号——成片里是 f(tWord(i, '词')) − shotFrom。此帧之前这组批注完全不渲染。 */
  circleAt: number;
  /** 画完一圈用几帧。 */
  circleFrames?: number;
  /** 箭头开始帧；预设 circleAt + circleFrames + 4。没有 note 就没有箭头。 */
  arrowAt?: number;
  /** 箭头（杆 + 两笔箭头尖）总帧数。 */
  arrowFrames?: number;
  /** 批注文字，2–6 个字。不给 = 只画圈。 */
  note?: string;
  /** 批注开始浮现的帧；预设 = 箭头画完的下一帧。 */
  noteAt?: number;
  /** 批注放哪一侧；不给则自动挑面板内放得下的一侧（右 → 上 → 左 → 下）。 */
  noteSide?: InkNoteSide;
  /** 这一组的墨色；不给用镜头的 color。 */
  color?: string;
  /** 这一组的随机种子；不给用镜头 seed + 序号。 */
  seed?: number;
  /** 圈与目标框的留白（内容坐标 px）。padX 下限 10；照片里圈物体时两个都放大到 24–40。 */
  padX?: number;
  padY?: number;
};

export type InkCircleNoteProps = InkAnnotation & {
  /** 第二、第三处批注（同一镜最多再加一处为宜）。 */
  notes?: InkAnnotation[];
  /** 墨色。预设是一支朱红色的笔：N.accent（#e0b04b）在 N.paper 上对比只有约 1.9:1，细线读不到，所以不用它。 */
  color?: string;
  /** 批注文字的描边底色（让字压在正文上也读得清）；照片上可改深色或传 'none'。 */
  noteHalo?: string;
  /** 批注字级（内容坐标 px）。 */
  noteSize?: number;
  seed?: number;
  /** 镜头总帧数（只用来算 slowPush）。 */
  duration: number;
  /** 视窗上缘对到内容的哪个 y（内容坐标）。数字 = 不动；keyframes = 相邻两点之间 inOutCubic 缓动。 */
  pageY?: number | InkPageKey[];
  /** 需要完全自订滚动曲线时用：帧号 → 内容 y。给了就盖过 pageY。必须是帧号的纯函数。 */
  scrollY?: (frame: number) => number;
  /** 内容在视窗里的缩放；内容水平置中。 */
  contentScale?: number;
  /** 内容本体（内容坐标系、原点左上）。成片换 <Img src={page.png} style={{ width: contentW }} />。 */
  content?: React.ReactNode;
  contentW?: number;
  contentH?: number;
};

// ───────── 几何与手感常量（蒙皮时不动）─────────
const DEFAULT_INK = '#c8341f'; // 朱红；在 N.paper 上对比约 4.8:1
const PAD_X = 16; // 圈与目标框的水平留白预设（≥ 10，否则墨线压字）
const PAD_Y = 7; // 垂直留白预设：boxes.json 的行矩形本身已含行距，再多就压到上下行
const GLYPH_H = 0.8; // 行矩形里字身约占的高度比例：四角的余量检查只看字身，行距的空角允许被圈线切过
const SQUARENESS = 3.4; // 超椭圆指数：2 = 正椭圆（宽字串会鼓出一大块），3 = 略方、贴着文字走
const FIT = 0.95; // 目标框四角落在圈内的余量（< 1）；不够就等比放大半径
const OVERLAP = 0.08; // 首尾交叠：多画 8% 圈
const DRIFT_FROM = 1.035; // 半径从略大画到略小，收笔落在起笔内侧、两道线不重合
const DRIFT_TO = 0.975;
const TILT_DEG = 1.8; // 整圈随种子的小倾角上限
const SAMPLES = 72;
// 假笔压：同一条路径叠三层，中段逐层加粗（每级 +1.5px，台阶小到看不出接缝）
const PRESSURE: { w: number; a: number; b: number }[] = [
  { w: 5, a: 0, b: 1 },
  { w: 6.5, a: 0.1, b: 0.9 },
  { w: 8, a: 0.2, b: 0.78 },
];
const ARROW_GAP = 10; // 箭头离圈
const ARROW_LEN = 64;
const ARROW_BOW = 12; // 箭杆弯度（控制点离弦的距离）
const HEAD_LEN = 20;
const HEAD_DEG = 30;
const ARROW_W = 5;
const SHAFT_PART = 0.64; // 箭头总帧数里箭杆占的比例，其余两笔箭头尖平分
const NOTE_GAP = 14;
const NOTE_FRAMES = 6;
const NOTE_RISE = 10;
const NOTE_TILT = -3; // 只有批注文字允许这点倾角
const VIEW_INSET = 28; // 自动选边时，批注离面板边缘至少这么多（内容坐标）
const PANEL_RADIUS = 28;

type Pt = { x: number; y: number };
const n2 = (v: number) => v.toFixed(2);
const spow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);

/** Catmull-Rom → 三次贝塞尔：过每个取样点的平滑开放路径。 */
const smoothPath = (pts: Pt[]) => {
  let d = `M ${n2(pts[0].x)} ${n2(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C ${n2(p1.x + (p2.x - p0.x) / 6)} ${n2(p1.y + (p2.y - p0.y) / 6)} ${n2(p2.x - (p3.x - p1.x) / 6)} ${n2(p2.y - (p3.y - p1.y) / 6)} ${n2(p2.x)} ${n2(p2.y)}`;
  }
  return d;
};

/** 一圈墨线：超椭圆 + 三个谐波的半径抖动 + 由大到小的漂移 + 小倾角，全部由 seed 决定。 */
export const inkLoop = (target: InkRect, seed: number, padX = PAD_X, padY = PAD_Y) => {
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  let rx = target.w / 2 + Math.max(10, padX);
  let ry = target.h / 2 + padY;
  // 目标框的角必须在圈内（含抖动与漂移的最坏情形）
  const k = Math.pow(Math.pow(target.w / 2 / rx, SQUARENESS) + Math.pow((target.h * GLYPH_H) / 2 / ry, SQUARENESS), 1 / SQUARENESS);
  if (k > FIT) {
    rx *= k / FIT;
    ry *= k / FIT;
  }
  const r = (i: number) => rand(seed * 13.7 + i * 5.31);
  const phi0 = (-135 + (r(1) - 0.5) * 30) * (Math.PI / 180); // 起笔在左上
  const sweep = Math.PI * 2 * (1 + OVERLAP); // 顺时针（萤幕 y 向下）
  const ph = [r(2), r(3), r(4)].map((v) => v * Math.PI * 2);
  const tilt = (r(5) - 0.5) * 2 * TILT_DEG * (Math.PI / 180);
  const pts: Pt[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const phi = phi0 + t * sweep;
    const m =
      lerp(t, DRIFT_FROM, DRIFT_TO) *
      (1 + 0.03 * Math.sin(phi + ph[0]) + 0.018 * Math.sin(2 * phi + ph[1]) + 0.01 * Math.sin(3 * phi + ph[2]));
    const x = rx * m * spow(Math.cos(phi), 2 / SQUARENESS);
    const y = ry * m * spow(Math.sin(phi), 2 / SQUARENESS);
    pts.push({ x: cx + x * Math.cos(tilt) - y * Math.sin(tilt), y: cy + x * Math.sin(tilt) + y * Math.cos(tilt) });
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    d: smoothPath(pts),
    cx, cy,
    box: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) },
  };
};

/** 批注宽度估算：全形字 1em、半形 0.62em。 */
const noteWidth = (note: string, size: number) =>
  Array.from(note).reduce((s, ch) => s + ((ch.codePointAt(0) ?? 0) > 0x2e7f ? 1 : 0.62), 0) * size;

type Layout = { s: Pt; c: Pt; t: Pt; tx: number; ty: number; anchor: 'start' | 'end' | 'middle'; bbox: { x0: number; y0: number; x1: number; y1: number } };

/** 某一侧的箭头（起点 s、控制点 c、终点 t）与批注锚点。 */
const layoutSide = (loop: ReturnType<typeof inkLoop>, side: InkNoteSide, noteW: number, size: number, bowSign: number): Layout => {
  const { box, cx, cy } = loop;
  const h = size * 1.2;
  let s: Pt, t: Pt, tx: number, ty: number, anchor: Layout['anchor'];
  if (side === 'right' || side === 'left') {
    const dir = side === 'right' ? 1 : -1;
    s = { x: (dir > 0 ? box.x1 : box.x0) + dir * ARROW_GAP, y: cy - 4 };
    t = { x: s.x + dir * ARROW_LEN, y: cy - 22 };
    tx = t.x + dir * NOTE_GAP;
    ty = t.y - 2;
    anchor = dir > 0 ? 'start' : 'end';
  } else {
    const dir = side === 'below' ? 1 : -1;
    s = { x: cx + (box.x1 - box.x0) * 0.12, y: (dir > 0 ? box.y1 : box.y0) + dir * ARROW_GAP };
    t = { x: s.x + 22, y: s.y + dir * (ARROW_LEN - 8) };
    tx = t.x + 8;
    ty = t.y + dir * (NOTE_GAP + h / 2);
    anchor = 'middle';
  }
  const mx = (s.x + t.x) / 2;
  const my = (s.y + t.y) / 2;
  const len = Math.hypot(t.x - s.x, t.y - s.y) || 1;
  const c = { x: mx - ((t.y - s.y) / len) * ARROW_BOW * bowSign, y: my + ((t.x - s.x) / len) * ARROW_BOW * bowSign };
  const nx0 = anchor === 'start' ? tx : anchor === 'end' ? tx - noteW : tx - noteW / 2;
  const bbox = {
    x0: Math.min(nx0, s.x, t.x), x1: Math.max(nx0 + noteW, s.x, t.x),
    y0: Math.min(ty - h / 2, s.y, t.y), y1: Math.max(ty + h / 2, s.y, t.y),
  };
  return { s, c, t, tx, ty, anchor, bbox };
};

const SIDE_ORDER: InkNoteSide[] = ['right', 'above', 'left', 'below'];

/** keyframed pageY：相邻两点之间 inOutCubic；首点之前 / 末点之后保持端值。 */
export const pageYAt = (frame: number, pageY: number | InkPageKey[]): number => {
  if (typeof pageY === 'number') return pageY;
  if (pageY.length === 0) return 0;
  const ks = [...pageY].sort((a, b) => a.at - b.at);
  if (frame <= ks[0].at) return ks[0].y;
  for (let i = 0; i < ks.length - 1; i++) {
    if (frame < ks[i + 1].at) return lerp(seg(frame, ks[i].at, ks[i + 1].at, E.inOutCubic), ks[i].y, ks[i + 1].y);
  }
  return ks[ks.length - 1].y;
};

/** 一段已画到 p（0..1）的笔划；p ≤ 0 不渲染。a..b 是这一层覆盖路径的哪一段。 */
const Stroke: React.FC<{ d: string; p: number; color: string; width: number; a?: number; b?: number }> = ({ d, p, color, width, a = 0, b = 1 }) => {
  const len = Math.min(b, p) - a;
  if (len <= 0.002) return null; // 长度趋近 0 时圆头会先冒出一个墨点
  return (
    <path
      d={d} pathLength={1} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"
      strokeDasharray={`${len} 2`} strokeDashoffset={-a}
    />
  );
};

// ───────── demo 数据 ─────────
const DEMO_SCALE = 0.96;
const KEY = PAGE_BOXES.keyLine; // 「比去年同期成長百分之四十一，」
// fixture 的行框贴着行顶（h = lineH − 10），真实 Range 矩形是以字身为中心的：+5 把它摆回字身中线
const DEMO_TARGET: InkRect = { x: KEY.x + 7 * PAGE.fontSize, y: KEY.y + 5, w: 6 * PAGE.fontSize, h: KEY.h }; // 「百分之四十一」
const QUOTE = PAGE_BOXES.quoteLine;
const DEMO_TARGET_2: InkRect = { x: QUOTE.x, y: QUOTE.y + 5, w: 8 * PAGE.fontSize, h: QUOTE.h }; // 「我們沒有預期到
const DEMO_Y0 = Math.round(DEMO_TARGET.y + DEMO_TARGET.h / 2 - (SAFE.h * 0.4) / DEMO_SCALE);

export const INK_CIRCLE_NOTE_DURATION = 180; // 6s @30fps

const DEMO_PROPS: InkCircleNoteProps = {
  target: DEMO_TARGET,
  circleAt: 20,
  note: '+41%',
  seed: 3,
  duration: INK_CIRCLE_NOTE_DURATION,
  // 批注画完之后页面才上移 260px：墨迹跟着走
  pageY: [{ at: 76, y: DEMO_Y0 }, { at: 112, y: DEMO_Y0 + 260 }],
  notes: [{ target: DEMO_TARGET_2, circleAt: 124 }],
};

export const InkCircleNoteShot: React.FC<InkCircleNoteProps> = ({
  notes = [],
  color = DEFAULT_INK,
  noteHalo = N.paper,
  noteSize = 54,
  seed = 1,
  duration,
  pageY = 0,
  scrollY,
  contentScale = DEMO_SCALE,
  content = <FakeArticle />,
  contentW = PAGE.w,
  contentH = PAGE.h,
  ...first
}) => {
  const frame = useCurrentFrame();
  const viewH = SAFE.h / contentScale;
  const yAt = (fr: number) => {
    const raw = scrollY ? scrollY(fr) : pageYAt(fr, pageY);
    return Math.min(Math.max(0, contentH - viewH), Math.max(0, raw));
  };
  const y = yAt(frame);
  const left = (SAFE.w - contentW * contentScale) / 2;
  const push = slowPush(frame, duration);

  const all: InkAnnotation[] = [first, ...notes];

  return (
    <div
      style={{
        position: 'absolute', left: SAFE.x, top: SAFE.y, width: SAFE.w, height: SAFE.h,
        borderRadius: PANEL_RADIUS, overflow: 'hidden', background: N.paper,
        boxShadow: `0 0 0 2px ${N.line}33`,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push})`, transformOrigin: '50% 40%' }}>
        {/* 内容坐标容器：内容与墨迹共用这一个变换 */}
        <div
          style={{
            position: 'absolute', left, top: 0, width: contentW, height: 0,
            transform: `translate(0px, ${-y * contentScale}px) scale(${contentScale})`, transformOrigin: '0 0',
          }}
        >
          {content}
          <svg width={1} height={1} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
            {all.map((a, i) => {
              if (frame < a.circleAt) return null; // 词锚未到：根本没有节点
              const ink = a.color ?? color;
              const sd = a.seed ?? seed + i * 7;
              const circleFrames = a.circleFrames ?? 14;
              const loop = inkLoop(a.target, sd, a.padX, a.padY);
              const pc = seg(frame, a.circleAt, a.circleAt + circleFrames, E.inOutQuad);

              let arrow: React.ReactNode = null;
              if (a.note) {
                const arrowAt = a.arrowAt ?? a.circleAt + circleFrames + 4;
                const arrowFrames = a.arrowFrames ?? 10;
                const noteAt = a.noteAt ?? arrowAt + arrowFrames + 1;
                const nw = noteWidth(a.note, noteSize);
                const bow = rand(sd * 3.3 + 9) > 0.5 ? 1 : -1;
                // 自动选边：以批注出现那一帧的可见范围（内容坐标）判断放不放得下
                const vy = yAt(noteAt);
                const view = {
                  x0: Math.max(0, -left / contentScale) + VIEW_INSET, x1: Math.min(contentW, (SAFE.w - left) / contentScale) - VIEW_INSET,
                  y0: vy + VIEW_INSET, y1: vy + viewH - VIEW_INSET,
                };
                const fits = (s: InkNoteSide) => {
                  const b = layoutSide(loop, s, nw, noteSize, bow).bbox;
                  return b.x0 >= view.x0 && b.x1 <= view.x1 && b.y0 >= view.y0 && b.y1 <= view.y1;
                };
                const side = a.noteSide ?? SIDE_ORDER.find(fits) ?? 'right';
                const L = layoutSide(loop, side, nw, noteSize, bow);

                const shaftEnd = arrowAt + arrowFrames * SHAFT_PART;
                const headMid = shaftEnd + (arrowFrames * (1 - SHAFT_PART)) / 2;
                const ps = seg(frame, arrowAt, shaftEnd, E.outCubic);
                const ph1 = seg(frame, shaftEnd, headMid, E.outQuad);
                const ph2 = seg(frame, headMid, arrowAt + arrowFrames, E.outQuad);
                // 箭头尖：沿终点切线往回张开两笔，从尖端往外画
                const ang = Math.atan2(L.t.y - L.c.y, L.t.x - L.c.x);
                const barb = (sign: number) => {
                  const b = ang + Math.PI + sign * HEAD_DEG * (Math.PI / 180);
                  return `M ${n2(L.t.x)} ${n2(L.t.y)} L ${n2(L.t.x + Math.cos(b) * HEAD_LEN)} ${n2(L.t.y + Math.sin(b) * HEAD_LEN)}`;
                };
                const pn = seg(frame, noteAt, noteAt + NOTE_FRAMES, E.outCubic);
                arrow = (
                  <>
                    <Stroke d={`M ${n2(L.s.x)} ${n2(L.s.y)} Q ${n2(L.c.x)} ${n2(L.c.y)} ${n2(L.t.x)} ${n2(L.t.y)}`} p={ps} color={ink} width={ARROW_W} />
                    <Stroke d={barb(1)} p={ph1} color={ink} width={ARROW_W} />
                    <Stroke d={barb(-1)} p={ph2} color={ink} width={ARROW_W} />
                    {frame >= noteAt && pn > 0 && (
                      <text
                        x={L.tx} y={L.ty + (1 - pn) * NOTE_RISE} opacity={pn}
                        transform={`rotate(${NOTE_TILT} ${n2(L.tx)} ${n2(L.ty)})`}
                        textAnchor={L.anchor} dominantBaseline="central"
                        fontFamily={N.font} fontSize={noteSize} fontWeight={900} fill={ink}
                        stroke={noteHalo === 'none' ? undefined : noteHalo} strokeWidth={noteHalo === 'none' ? 0 : 12}
                        strokeLinejoin="round" paintOrder="stroke"
                      >
                        {a.note}
                      </text>
                    )}
                  </>
                );
              }

              return (
                <g key={i} opacity={0.94}>
                  {PRESSURE.map((l, j) => (
                    <Stroke key={j} d={loop.d} p={pc} color={ink} width={l.w} a={l.a} b={l.b} />
                  ))}
                  {arrow}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};

export const InkCircleNote: React.FC = () => (
  <NarrationStage>
    <InkCircleNoteShot {...DEMO_PROPS} />
  </NarrationStage>
);
