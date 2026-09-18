// page-scroll-read — 长页匀速上滚、读到重点就停靠（口播模式 · 证据镜）
// 一张长文截图在直式视窗里以阅读速度上滚；口播讲到关键段落时减速、把该段停在舒服的阅读高度
// （视窗高的 ~40%）1–2 秒，再缓回巡航速度。"我们一起把原文读一遍"的镜头。
// 滚动位置是帧号的纯函数 scrollYAt(frame, props)：巡航段 + smoothstep 速度坡道拼成，
// 位置连续、速度连续、永不回滚。所有时间点（stops[].at）都是 props，成片里来自 f(tWord(...))。
// 设计坐标 1080×1920（NarrationStage），参数表数值以此坐标系标定。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { E, seg } from '../../_fixtures/Motion';
import { FakeArticle, N, NarrationStage, PAGE, PAGE_BOXES, SAFE, slowPush } from '../../_fixtures/Narration';

export const PAGE_SCROLL_READ_DURATION = 240; // 8s @30fps

/** pageScale = 1 时的可读速度上限（px/帧）。超过就先吃前一站的停留，再不够则宁可迟到也不超速。 */
export const MAX_READ_SPEED = 28;
/** 被挤压时一站至少停这么多帧，少于此观众读不到。 */
export const MIN_HOLD = 12;

export type PageScrollStop = {
  /** 段落框上缘（页面坐标，未乘 pageScale；同 boxes.json） */
  y: number;
  /** 段落框高度（页面坐标） */
  h: number;
  /** 必须已经停稳的帧号——成片里是 f(tWord(i, '词')) */
  at: number;
  /** 停留帧数 */
  hold: number;
};

export type PageScrollReadProps = {
  stops: PageScrollStop[];
  /** 镜头总帧数 */
  duration: number;
  /** 起始滚动量（已乘 pageScale 的视窗像素）。不给则由 cruiseSpeed 反推，让开场就是巡航速度 */
  startY?: number;
  /** 页面缩放：page.png 的 CSS px → 设计坐标 px */
  pageScale?: number;
  /** 停靠时段落框中心落在视窗高度的哪个比例（0 顶、1 底） */
  focusRatio?: number;
  /** 巡航速度（px/帧，pageScale=1 基准）：用来反推 startY，以及最后一站之后的尾段速度 */
  cruiseSpeed?: number;
  /** 进站 / 出站的速度坡道长度（帧） */
  ramp?: number;
  /** 停靠时页面其余部分的压暗量，上限 0.12 */
  dim?: number;
  /** 页面本体；成片传 <Img src={staticFile('pages/<slug>/page.png')} style={{ width: pageW }} /> */
  page?: React.ReactNode;
  /** 页面原始宽 / 高（页面坐标） */
  pageW?: number;
  pageH?: number;
  /** 上下缘渐隐用的颜色，取页面底色 */
  fadeColor?: string;
};

// ───────────────────────── 滚动规划（纯函数） ─────────────────────────

/** 视窗面板 = 整个安全区。 */
const VIEW = { x: SAFE.x, y: SAFE.y, w: SAFE.w, h: SAFE.h };

type Seg = { t0: number; t1: number; y0: number; y1: number; rampIn: number; rampOut: number };
export type ScrollPlan = {
  segs: Seg[];
  /** 每站实际的 [停稳帧, 离站帧, 停靠滚动量]；arrive > at 表示迟到（lint 用） */
  parks: { arrive: number; depart: number; y: number; late: number; heldShort: number }[];
  maxScroll: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 速度坡道用 smoothstep：v(u) = V·(3u²−2u³)，积分得位移 V·R·(u³ − u⁴/2)，整段坡道走 V·R/2。 */
const rampDist = (u: number) => u * u * u - (u * u * u * u) / 2;

/** 一段里跑 dist 需要的巡航速度：坡道各只贡献一半时长。 */
const cruiseOf = (s: Seg) => {
  const eff = s.t1 - s.t0 - (s.rampIn + s.rampOut) / 2;
  return eff > 0 ? (s.y1 - s.y0) / eff : 0;
};

const fitRamps = (T: number, rampIn: number, rampOut: number): [number, number] => {
  const sum = rampIn + rampOut;
  if (sum <= T || sum === 0) return [rampIn, rampOut];
  const k = T / sum;
  return [rampIn * k, rampOut * k];
};

export const planScroll = (props: PageScrollReadProps): ScrollPlan => {
  const scale = props.pageScale ?? 1;
  const focus = props.focusRatio ?? 0.4;
  const ramp = Math.max(0, props.ramp ?? 26);
  const cruise = Math.max(0.01, (props.cruiseSpeed ?? 7) * scale);
  const vMax = MAX_READ_SPEED * scale;
  const pageH = (props.pageH ?? PAGE.h) * scale;
  const maxScroll = Math.max(0, pageH - VIEW.h);
  const stops = [...props.stops].sort((a, b) => a.at - b.at);

  const targetOf = (s: PageScrollStop) => clamp((s.y + s.h / 2) * scale - VIEW.h * focus, 0, maxScroll);

  const segs: Seg[] = [];
  const parks: ScrollPlan['parks'] = [];

  // 游标：上一站的停稳帧 / 计划离站帧 / 位置
  let prevArrive = 0;
  let depart = 0;
  let y = 0;

  if (stops.length === 0) {
    y = clamp(props.startY ?? 0, 0, maxScroll);
  } else {
    // 起点：没给就让首段正好是巡航速度（开镜即在滚，首段没有入坡道）
    const first = stops[0];
    const t = targetOf(first);
    const [, rOut] = fitRamps(Math.max(1, first.at), 0, ramp);
    const derived = t - cruise * Math.max(0, first.at - rOut / 2);
    y = clamp(props.startY ?? derived, 0, t); // 起点不得在第一站之下（否则得回滚）
  }

  stops.forEach((s, i) => {
    const target = Math.max(y, targetOf(s)); // 永不回滚：目标在上方就原地停
    const dist = target - y;
    const wantIn = i === 0 ? 0 : ramp;
    let t0 = depart;
    let T = Math.max(1, s.at - t0);
    let [rIn, rOut] = fitRamps(T, wantIn, ramp);
    let seg0: Seg = { t0, t1: t0 + T, y0: y, y1: target, rampIn: rIn, rampOut: rOut };
    let heldShort = 0;

    if (cruiseOf(seg0) > vMax) {
      // ① 先提早离站：吃掉上一站的停留，最少留 MIN_HOLD
      const need = dist / vMax + (wantIn + ramp) / 2; // 限速下需要的总时长
      const earliest = i === 0 ? 0 : Math.min(depart, prevArrive + MIN_HOLD);
      const newT0 = clamp(s.at - need, earliest, depart);
      heldShort = depart - newT0;
      t0 = newT0;
      T = Math.max(1, s.at - t0);
      [rIn, rOut] = fitRamps(T, wantIn, ramp);
      seg0 = { t0, t1: t0 + T, y0: y, y1: target, rampIn: rIn, rampOut: rOut };
      // ② 还是超速：锁在上限，宁可迟到
      if (cruiseOf(seg0) > vMax + 1e-6) {
        rIn = wantIn;
        rOut = ramp;
        T = dist / vMax + (rIn + rOut) / 2;
        seg0 = { t0, t1: t0 + T, y0: y, y1: target, rampIn: rIn, rampOut: rOut };
      }
      if (heldShort > 0 && parks.length > 0) {
        parks[parks.length - 1].depart = t0;
        parks[parks.length - 1].heldShort = heldShort;
      }
    }

    segs.push(seg0);
    const arrive = seg0.t1;
    const leave = Math.max(s.at + s.hold, arrive + Math.min(MIN_HOLD, s.hold));
    parks.push({ arrive, depart: leave, y: target, late: Math.max(0, arrive - s.at), heldShort: 0 });
    prevArrive = arrive;
    depart = leave;
    y = target;
  });

  // 尾段：出站加速回巡航，一路滚到镜尾（到页底就自然停住）
  const T = props.duration - depart;
  if (T > 0) {
    const rIn = stops.length === 0 ? 0 : Math.min(ramp, T);
    const y1 = Math.min(maxScroll, y + cruise * (T - rIn / 2));
    segs.push({ t0: depart, t1: props.duration, y0: y, y1, rampIn: rIn, rampOut: 0 });
  }

  return { segs, parks, maxScroll };
};

const segPos = (s: Seg, frame: number) => {
  const T = s.t1 - s.t0;
  const tau = clamp(frame - s.t0, 0, T);
  const V = cruiseOf(s);
  if (V === 0) return s.y0;
  if (s.rampIn > 0 && tau < s.rampIn) return s.y0 + V * s.rampIn * rampDist(tau / s.rampIn);
  if (s.rampOut > 0 && tau > T - s.rampOut) return s.y1 - V * s.rampOut * rampDist((T - tau) / s.rampOut);
  return s.y0 + V * (tau - s.rampIn / 2);
};

/** 帧号 → 滚动量（视窗像素）。连续、单调不减、速度连续。 */
export const scrollYAt = (frame: number, props: PageScrollReadProps, plan: ScrollPlan = planScroll(props)) => {
  const { segs } = plan;
  if (segs.length === 0) return 0;
  if (frame <= segs[0].t0) return segs[0].y0;
  for (const s of segs) {
    if (frame < s.t0) return s.y0; // 两段之间 = 停靠
    if (frame <= s.t1) return segPos(s, frame);
  }
  return segs[segs.length - 1].y1;
};

// ───────────────────────── 镜头 ─────────────────────────

const FADE_H = 96;
const RADIUS = 28;
const FEATHER = 70;

export const PageScrollReadShot: React.FC<PageScrollReadProps> = (props) => {
  const frame = useCurrentFrame();
  const scale = props.pageScale ?? 1;
  const pageW = props.pageW ?? PAGE.w;
  const pageH = props.pageH ?? PAGE.h;
  const fade = props.fadeColor ?? N.paper;
  const dimMax = clamp(props.dim ?? 0.1, 0, 0.12);

  const plan = planScroll(props);
  const sy = scrollYAt(frame, props, plan);
  const stops = [...props.stops].sort((a, b) => a.at - b.at);

  // 页面比视窗宽时左右等量裁掉，窄时置中
  const pageLeft = (VIEW.w - pageW * scale) / 2;
  // 视窗已占满 SAFE，所以推近取 1/1.04 → 1：同样 +4%，终点正好贴满安全区，不溢进字幕带
  const push = slowPush(frame, props.duration, 1 / 1.04, 1);

  // 滚动条拇指：只是"这是一张长页"的线索，不承载资讯
  const trackH = VIEW.h - 2 * (RADIUS + 12);
  const thumbH = Math.max(60, (trackH * VIEW.h) / (pageH * scale));
  const thumbY = plan.maxScroll > 0 ? (sy / plan.maxScroll) * (trackH - thumbH) : 0;

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
        {/* 页面：整层 2D 平移。别用 translate3d——独立合成层在 slowPush 小数缩放下会从圆角裁切边漏 1px */}
        <div
          style={{
            position: 'absolute', left: pageLeft, top: 0, width: pageW, height: pageH,
            transform: `translateY(${-sy}px) scale(${scale})`, transformOrigin: 'top left',
          }}
        >
          {props.page ?? <FakeArticle />}
        </div>

        {/* 上下缘渐隐：文字融进纸色而不是被硬切 */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: FADE_H, background: `linear-gradient(180deg, ${fade}, ${fade}00)` }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: FADE_H, background: `linear-gradient(0deg, ${fade}, ${fade}00)` }} />

        {/* 停靠时的聚焦：段落带以外压暗 ≤12%（带缘 FEATHER px 羽化，不切字），随进站淡入、出站淡出；未到站完全不存在 */}
        {stops.map((s, i) => {
          const park = plan.parks[i];
          const k = seg(frame, park.arrive - 10, park.arrive + 8, E.outCubic) * (1 - seg(frame, park.depart - 4, park.depart + 12, E.inOutQuad));
          if (k <= 0) return null;
          const top = s.y * scale - sy;
          const h = s.h * scale;
          const shade = `rgba(16,18,22,${dimMax * k})`;
          const clear = 'rgba(16,18,22,0)';
          return (
            <React.Fragment key={i}>
              <div style={{ position: 'absolute', left: -2, right: -2, top: -2, height: Math.max(0, top + 2), background: `linear-gradient(0deg, ${clear}, ${shade} ${FEATHER}px)` }} />
              <div style={{ position: 'absolute', left: -2, right: -2, top: top + h, height: Math.max(0, VIEW.h + 2 - top - h), background: `linear-gradient(180deg, ${clear}, ${shade} ${FEATHER}px)` }} />
              <div
                style={{
                  position: 'absolute', left: 30, top: top + h / 2 - (h / 2) * k, width: 6, height: h * k,
                  borderRadius: 3, background: N.accent, opacity: k,
                }}
              />
            </React.Fragment>
          );
        })}

        {/* 滚动条 */}
        <div style={{ position: 'absolute', right: 10, top: RADIUS + 12, width: 6, height: trackH, borderRadius: 3, background: `${N.ink}14` }}>
          <div style={{ position: 'absolute', left: 0, top: thumbY, width: 6, height: thumbH, borderRadius: 3, background: `${N.ink}55` }} />
        </div>
      </div>
    </div>
  );
};

// demo：两站——「比去年同期成長百分之四十一，」与引述句。at 在成片里来自 f(tWord(...))。
const DEMO_PROPS: PageScrollReadProps = {
  duration: PAGE_SCROLL_READ_DURATION,
  pageScale: SAFE.w / PAGE.w, // 整页宽度正好装进视窗；pageScale=1 时左右各裁 60px
  stops: [
    { y: PAGE_BOXES.keyLine.y, h: PAGE_BOXES.keyLine.h, at: 84, hold: 46 },
    { y: PAGE_BOXES.quoteLine.y, h: PAGE_BOXES.quoteLine.h, at: 178, hold: 40 },
  ],
};

export const PageScrollRead: React.FC = () => (
  <NarrationStage>
    <PageScrollReadShot {...DEMO_PROPS} />
  </NarrationStage>
);
