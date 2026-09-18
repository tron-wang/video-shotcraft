// page-anchor-tour — 长页兴趣点巡游：相机逐站取景、讲到哪停到哪（口播模式 · 证据镜）
// 长文截图不像读者那样匀速滚；一台虚拟相机按口播顺序走访一串兴趣点（标题 → 图 → 关键句…），
// 每一站都在词锚那一帧已经取好景：小框推近、大框拉远，四周留舒服的边，然后一次滑到下一站。
// 和 page-scroll-read 的差别：那张是恒定比例的阅读滚动；这张位置和缩放一起变，路径可以往下跳很远、也可以回头。
// 相机是帧号的纯函数 cameraAt(frame, props) → { cx, cy, scale }（面板中心对着的页面点 + 缩放）。
// 所有时间点（stops[].at）都是 props，成片里来自 f(tWord(...))。
// 设计坐标 1080×1920（NarrationStage），参数表数值以此坐标系标定。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { E, lerp, seg } from '../../_fixtures/Motion';
import { FakeArticle, N, NarrationStage, PAGE, PAGE_BOXES, SAFE, slowPush } from '../../_fixtures/Narration';

export const PAGE_ANCHOR_TOUR_DURATION = 240; // 8s @30fps

/** page.png 是 2× 截图：缩放超过 2 就开始放大像素，文字发糊。maxScale 再大也钳在这里。 */
export const HARD_MAX_SCALE = 2;
/** 停靠期间的极缓推近量（+1.5%）。 */
export const CREEP = 0.015;
/** 长跳中段最多把缩放压低这么多（"拉远—赶路—推近"）。 */
export const MAX_DIP = 0.12;
/** 屏幕位移超过这么多个面板高才算长跳；到 2 倍此值时压低量加满。 */
export const LONG_JUMP = 1.5;
/** 被挤压时一次滑行至少这么多帧，再短就是跳切。 */
export const MIN_TRAVEL = 10;
/** 被挤压时一站至少停这么多帧。 */
export const MIN_HOLD = 12;

export type PageRect = { x: number; y: number; w: number; h: number };

export type PageAnchorStop = PageRect & {
  /** 必须已经取好景的帧号——成片里是 f(tWord(i, '词')) */
  at: number;
  /** 停留帧数 */
  hold: number;
};

export type PageAnchorTourProps = {
  /** 兴趣点（页面坐标，同 boxes.json），按 at 排序走访；页面上的先后不限 */
  stops: PageAnchorStop[];
  /** 镜头总帧数 */
  duration: number;
  /** 每次滑行的帧数；长跳会自动放宽到 1.5 倍（有空档才放宽） */
  travel?: number;
  /** 框四周留白占面板的比例（每边） */
  margin?: number;
  /** 缩放钳位：小框别推到字大得离谱，大框别拉到整页变小 */
  minScale?: number;
  maxScale?: number;
  /** 开镜取景的框；不给 = 用第一站的缩放看页顶 */
  startBox?: PageRect;
  /** 停靠时是否画强调色角标 */
  brackets?: boolean;
  /** 页面本体；成片传 <Img src={staticFile('pages/<slug>/page.png')} style={{ width: pageW }} /> */
  page?: React.ReactNode;
  /** 页面原始宽 / 高（页面坐标） */
  pageW?: number;
  pageH?: number;
  /** 上下缘渐隐用的颜色，取页面底色 */
  fadeColor?: string;
};

// ───────────────────────── 相机规划（纯函数） ─────────────────────────

/** 视窗面板 = 整个安全区。 */
const VIEW = { x: SAFE.x, y: SAFE.y, w: SAFE.w, h: SAFE.h };

export type Camera = { cx: number; cy: number; scale: number };

type Glide = { t0: number; t1: number; from: Camera; to: Camera; dip: number };
export type TourPark = {
  /** 实际取好景的帧；late = arrive − at > 0 表示迟到（lint 用） */
  arrive: number;
  /** 极缓推近的起点帧（一般 = arrive；开镜就在站上时 = 0） */
  creepFrom: number;
  /** 角标开始退场的帧 */
  depart: number;
  /** 相机真正离站的帧（极缓推近一直走到这里） */
  leave: number;
  late: number;
  /** 被下一站挤掉的停留帧数 */
  heldShort: number;
  pose: Camera;
  /** 取景缩放被钳位：'max' = 框太小、字会比预期小；'min' = 框太大、装不进留白 */
  capped: 'max' | 'min' | null;
};
export type TourPlan = { start: Camera; glides: Glide[]; parks: TourPark[]; floor: number; ceil: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 把相机钳进页面：面板四缘永远不露出页面以外。 */
const clampCamera = (c: Camera, pageW: number, pageH: number): Camera => {
  const hw = VIEW.w / 2 / c.scale;
  const hh = VIEW.h / 2 / c.scale;
  return {
    scale: c.scale,
    cx: hw * 2 >= pageW ? pageW / 2 : clamp(c.cx, hw, pageW - hw),
    cy: hh * 2 >= pageH ? pageH / 2 : clamp(c.cy, hh, pageH - hh),
  };
};

export const planTour = (props: PageAnchorTourProps): TourPlan => {
  const pageW = props.pageW ?? PAGE.w;
  const pageH = props.pageH ?? PAGE.h;
  const travel = Math.max(MIN_TRAVEL, props.travel ?? 24);
  const margin = clamp(props.margin ?? 0.16, 0, 0.4);
  // 下限还要保证页面盖满面板（否则钳不住边）；上限预留极缓推近的 1.5%，推完正好到 maxScale
  const floor = Math.max(props.minScale ?? 0.6, VIEW.w / pageW, VIEW.h / pageH);
  const ceil = Math.max(floor, Math.min(props.maxScale ?? 1.8, HARD_MAX_SCALE) / (1 + CREEP));

  const frameBox = (b: PageRect): { pose: Camera; capped: TourPark['capped'] } => {
    const fit = Math.min((VIEW.w * (1 - 2 * margin)) / Math.max(1, b.w), (VIEW.h * (1 - 2 * margin)) / Math.max(1, b.h));
    const scale = clamp(fit, floor, ceil);
    return {
      pose: clampCamera({ cx: b.x + b.w / 2, cy: b.y + b.h / 2, scale }, pageW, pageH),
      capped: fit > ceil ? 'max' : fit < floor ? 'min' : null,
    };
  };

  const stops = [...props.stops].sort((a, b) => a.at - b.at);
  const framed = stops.map(frameBox);

  let start: Camera;
  if (props.startBox) start = frameBox(props.startBox).pose;
  else if (framed.length > 0) start = clampCamera({ cx: framed[0].pose.cx, cy: 0, scale: framed[0].pose.scale }, pageW, pageH);
  else start = clampCamera({ cx: pageW / 2, cy: 0, scale: floor }, pageW, pageH);
  // 第一站来不及滑、或起始取景本来就等于第一站（标题就在页顶）：开镜直接架在第一站上，不做原地"呼吸"
  const samePose = (a: Camera, b: Camera) => Math.abs(a.cx - b.cx) < 0.5 && Math.abs(a.cy - b.cy) < 0.5 && Math.abs(a.scale - b.scale) < 1e-4;
  const onFirst = stops.length > 0 && (stops[0].at < MIN_TRAVEL || samePose(start, framed[0].pose));
  if (onFirst) start = framed[0].pose;

  const glides: Glide[] = [];
  const parks: TourPark[] = [];
  let cur = start; // 上一站停稳时的取景（未含极缓推近）
  let prevArrive = 0;
  let prevDepart = 0;

  stops.forEach((s, i) => {
    const to = framed[i].pose;
    const zero = i === 0 && onFirst;
    // 出发时相机已经推近了 CREEP：从推完的缩放接着走，缩放曲线才连续
    const from: Camera = { ...cur, scale: cur.scale * (1 + CREEP) };

    // 长跳：按屏幕位移（页面距离 × 两端缩放的几何平均）量，超过 LONG_JUMP 个面板高开始压低缩放
    const screenDist = Math.hypot(to.cx - from.cx, to.cy - from.cy) * Math.sqrt(from.scale * to.scale);
    const k = clamp((screenDist / VIEW.h - LONG_JUMP) / LONG_JUMP, 0, 1);
    // 压低后不得跌破下限——直接把压低量收小，而不是事后硬钳（硬钳会在曲线上留折角）
    const dip = Math.max(0, Math.min(MAX_DIP * k, 1 - floor / Math.min(from.scale, to.scale)));

    const want = travel * (1 + 0.5 * k);
    let t0 = s.at - want;
    let heldShort = 0;
    if (zero) {
      t0 = 0; // 开镜已在站上，零长度滑行
    } else if (t0 < prevDepart) {
      t0 = prevDepart;
      if (s.at - t0 < MIN_TRAVEL) {
        // 连最短滑行都塞不下：吃上一站的停留，最少给它留 MIN_HOLD
        const earliest = i === 0 ? 0 : Math.min(prevDepart, prevArrive + MIN_HOLD);
        const eaten = clamp(s.at - MIN_TRAVEL, earliest, prevDepart);
        heldShort = prevDepart - eaten;
        t0 = eaten;
      }
    }
    const t1 = zero ? 0 : Math.max(s.at, t0 + MIN_TRAVEL); // 再不够就迟到，不跳切
    // 开镜后一帧都没停就出发（at ≤ travel）：起始取景还没推近过
    if (i === 0 && t0 <= 0) from.scale = cur.scale;
    if (heldShort > 0 && parks.length > 0) {
      parks[parks.length - 1].heldShort = heldShort;
      parks[parks.length - 1].depart = t0;
    }
    if (parks.length > 0) parks[parks.length - 1].leave = t0;

    glides.push({ t0, t1, from: zero ? to : from, to, dip });
    const arrive = zero ? Math.max(0, s.at) : t1;
    const depart = Math.max(s.at + s.hold, arrive + Math.min(MIN_HOLD, s.hold));
    parks.push({ arrive, creepFrom: zero ? 0 : arrive, depart, leave: Math.max(depart, props.duration), late: Math.max(0, arrive - s.at), heldShort: 0, pose: to, capped: framed[i].capped });
    cur = to;
    prevArrive = arrive;
    prevDepart = depart;
  });

  return { start, glides, parks, floor, ceil };
};

/** 极缓推近：从 arrive 线性走到 leave，共 +CREEP。 */
const creepAt = (frame: number, arrive: number, leave: number) => 1 + CREEP * clamp((frame - arrive) / Math.max(1, leave - arrive), 0, 1);

/** 帧号 → 相机。位置与缩放共用同一条 ease-in-out，读起来是"一次"运镜。 */
export const cameraAt = (frame: number, props: PageAnchorTourProps, plan: TourPlan = planTour(props)): Camera => {
  const pageW = props.pageW ?? PAGE.w;
  const pageH = props.pageH ?? PAGE.h;
  const { glides, parks, start } = plan;
  if (glides.length === 0) return { ...start, scale: start.scale * creepAt(frame, 0, props.duration) };

  // 开镜到第一次滑行之前：停在起始取景上，同样极缓推近
  if (frame <= glides[0].t0) return { ...start, scale: start.scale * creepAt(frame, 0, glides[0].t0) };

  for (let i = 0; i < glides.length; i++) {
    const g = glides[i];
    if (frame < g.t1) {
      if (frame < g.t0) break; // 不会发生：上一站的 leave 就是这里的 t0
      const p = seg(frame, g.t0, g.t1, E.inOutCubic);
      // 缩放在对数域插值（每帧放大的"倍率"恒定，推拉才匀）；长跳叠一个 4p(1−p) 的压低
      const s = Math.exp(lerp(p, Math.log(g.from.scale), Math.log(g.to.scale))) * (1 - g.dip * 4 * p * (1 - p));
      return clampCamera({ cx: lerp(p, g.from.cx, g.to.cx), cy: lerp(p, g.from.cy, g.to.cy), scale: s }, pageW, pageH);
    }
    const next = glides[i + 1];
    if (!next || frame < next.t0) {
      const park = parks[i];
      return { ...park.pose, scale: park.pose.scale * creepAt(frame, park.creepFrom, park.leave) };
    }
  }
  const last = parks[parks.length - 1];
  return { ...last.pose, scale: last.pose.scale * (1 + CREEP) };
};

// ───────────────────────── 镜头 ─────────────────────────

const FADE_H = 96;
const RADIUS = 28;
const BRACKET = { pad: 16, len: 46, thick: 5 };

const Corner: React.FC<{ x: number; y: number; dx: 1 | -1; dy: 1 | -1; len: number; opacity: number }> = ({ x, y, dx, dy, len, opacity }) => (
  <>
    <div style={{ position: 'absolute', left: dx > 0 ? x : x - len, top: dy > 0 ? y : y - BRACKET.thick, width: len, height: BRACKET.thick, borderRadius: BRACKET.thick / 2, background: N.accent, opacity }} />
    <div style={{ position: 'absolute', left: dx > 0 ? x : x - BRACKET.thick, top: dy > 0 ? y : y - len, width: BRACKET.thick, height: len, borderRadius: BRACKET.thick / 2, background: N.accent, opacity }} />
  </>
);

export const PageAnchorTourShot: React.FC<PageAnchorTourProps> = (props) => {
  const frame = useCurrentFrame();
  const pageW = props.pageW ?? PAGE.w;
  const pageH = props.pageH ?? PAGE.h;
  const fade = props.fadeColor ?? N.paper;

  const plan = planTour(props);
  const cam = cameraAt(frame, props, plan);
  const stops = [...props.stops].sort((a, b) => a.at - b.at);

  // 页面坐标 → 面板坐标
  const tx = VIEW.w / 2 - cam.cx * cam.scale;
  const ty = VIEW.h / 2 - cam.cy * cam.scale;
  // 视窗已占满 SAFE，所以推近取 1/1.04 → 1：终点正好贴满安全区，不溢进字幕带
  const push = slowPush(frame, props.duration, 1 / 1.04, 1);

  // 上下缘渐隐只在那一侧"还有页面"时出现：相机贴着页顶 / 页底时不该把报头融掉
  const hiddenTop = -ty;
  const hiddenBottom = pageH * cam.scale + ty - VIEW.h;
  const fadeTop = clamp(hiddenTop / FADE_H, 0, 1);
  const fadeBottom = clamp(hiddenBottom / FADE_H, 0, 1);

  return (
    <div
      style={{
        position: 'absolute', left: VIEW.x, top: VIEW.y, width: VIEW.w, height: VIEW.h,
        transform: `scale(${push})`, transformOrigin: '50% 50%',
      }}
    >
      <div
        style={{
          position: 'absolute', inset: 0, borderRadius: RADIUS, overflow: 'hidden', background: fade,
          boxShadow: `0 30px 80px rgba(0,0,0,.45), 0 0 0 1px ${N.line}33`,
        }}
      >
        {/* 页面：整层 2D 平移 + 缩放。别用 translate3d——独立合成层在小数缩放下会从圆角裁切边漏 1px */}
        <div
          style={{
            position: 'absolute', left: 0, top: 0, width: pageW, height: pageH,
            transform: `translate(${tx}px, ${ty}px) scale(${cam.scale})`, transformOrigin: 'top left',
          }}
        >
          {props.page ?? <FakeArticle />}
        </div>

        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: FADE_H, opacity: fadeTop, background: `linear-gradient(180deg, ${fade}, ${fade}00)` }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: FADE_H, opacity: fadeBottom, background: `linear-gradient(0deg, ${fade}, ${fade}00)` }} />

        {/* 角标：取好景才长出来（从外侧 10px 收拢到位），离站前淡出；未到站完全不存在。跟着相机算，极缓推近时贴着框走 */}
        {(props.brackets ?? true) &&
          stops.map((s, i) => {
            const park = plan.parks[i];
            const kIn = seg(frame, park.arrive - 2, park.arrive + 10, E.outCubic);
            const kOut = 1 - seg(frame, park.depart - 8, park.depart + 2, E.inOutQuad);
            const k = kIn * kOut;
            if (k <= 0) return null;
            const pad = BRACKET.pad + 10 * (1 - kIn);
            const l = tx + s.x * cam.scale - pad;
            const t = ty + s.y * cam.scale - pad;
            const r = tx + (s.x + s.w) * cam.scale + pad;
            const b = ty + (s.y + s.h) * cam.scale + pad;
            const len = Math.min(BRACKET.len, (r - l) / 3, (b - t) / 2);
            return (
              <React.Fragment key={i}>
                <Corner x={l} y={t} dx={1} dy={1} len={len} opacity={k} />
                <Corner x={r} y={t} dx={-1} dy={1} len={len} opacity={k} />
                <Corner x={l} y={b} dx={1} dy={-1} len={len} opacity={k} />
                <Corner x={r} y={b} dx={-1} dy={-1} len={len} opacity={k} />
              </React.Fragment>
            );
          })}
      </div>
    </div>
  );
};

// demo：三站——标题 →「比去年同期成長百分之四十一，」→ 图表。at 在成片里来自 f(tWord(...))。
const stop = (b: PageRect, at: number, hold: number): PageAnchorStop => ({ x: b.x, y: b.y, w: b.w, h: b.h, at, hold });
const DEMO_PROPS: PageAnchorTourProps = {
  duration: PAGE_ANCHOR_TOUR_DURATION,
  stops: [
    stop(PAGE_BOXES.headline, 24, 48),
    stop(PAGE_BOXES.keyLine, 106, 52),
    stop(PAGE_BOXES.chart, 190, 44),
  ],
};

export const PageAnchorTour: React.FC = () => (
  <NarrationStage>
    <PageAnchorTourShot {...DEMO_PROPS} />
  </NarrationStage>
);
