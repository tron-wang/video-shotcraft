// candlestick-grow-rescale — K 线逐根生长 + 视窗自适应
// K 线从左到右逐根出现：每根蜡烛的实体从开盘价"长"到收盘价（像这一根正在成交），
// 影线随之伸到最高/最低；根数少时按最大柱宽从左铺开，铺满后整段历史一起**变窄**给
// 新蜡烛让位（历史被压缩，读作"时间在往前走"）；价格轴跟着可见区间自适应重标，
// 右侧最新价标签与虚线始终咬住正在生长的那一根。揭示节奏慢起—加速—到最新价刹车。
//
// y 轴平滑不用跨帧状态：取最近 N 帧"原始区间"的加权平均（帧号可直接回算），
// 新极值出现时轴在 N 帧内柔和跟上。数据为确定性伪随机占位行情。参数以 1920×1080 标定。
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';

export const CANDLESTICK_GROW_RESCALE_DURATION = 210; // 7s @30fps

// ---- 版式 ----
const PLOT = { left: 140, right: 1600, top: 340, bottom: 960 };
const PLOT_W = PLOT.right - PLOT.left;
const PLOT_H = PLOT.bottom - PLOT.top;
const MAX_SLOT = 34; // px：单根蜡烛槽位上限——根数少时不把几根蜡烛撑成巨柱
const BODY_RATIO = 0.6; // 实体宽 / 槽位宽
const TICK_STEP = 10; // 价格刻度步长（按最终区间定死，重标时刻度线跟着滑，不跳档）

// ---- 编舞 ----
const INTRO: [number, number] = [0, 14]; // f：标题与坐标轴淡入
const REVEAL: [number, number] = [12, 162]; // f：全部蜡烛揭示完
const REVEAL_EASE = Easing.bezier(0.55, 0, 0.3, 1); // 慢起、中段加速、到最新价刹车
const GROW = 2.5; // 根：单根从开盘长到收盘占用的"揭示进度"
const RANGE_SMOOTH = 8; // f：y 轴跟随的平滑窗口
const RANGE_PAD = 0.12; // 可见区间上下留白比例
const MIN_SPAN = 12; // 价格：起手几根时的最小纵向跨度，避免把 1% 波动放大成满屏
const PULSE = 166; // f：揭示完成后最新价标签脉冲一次

// ---- 视觉 ----
const UP = '#2ecc8f'; // 涨绿跌红（国际惯例）；中文市场换成涨红跌绿
const DOWN = '#ff5d6c';
const INK = '#f5f7fb';
const INK_DIM = '#8b93a7';
const SANS = '-apple-system, "PingFang SC", BlinkMacSystemFont, "Segoe UI", sans-serif';

// ---- 确定性占位行情 ----
const N = 96;
type Candle = { o: number; h: number; l: number; c: number };
const DATA: Candle[] = (() => {
  let seed = 20260916;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const out: Candle[] = [];
  let prev = 100;
  for (let i = 0; i < N; i++) {
    // 三段行情：缓涨 → 回撤 → 主升，给揭示过程一个叙事弧
    const [mu, sigma] = i < 34 ? [0.004, 0.014] : i < 52 ? [-0.011, 0.016] : [0.009, 0.014];
    const o = prev * (1 + gauss() * 0.003);
    const c = o * (1 + mu + sigma * gauss());
    const h = Math.max(o, c) * (1 + Math.abs(gauss()) * sigma * 0.6);
    const l = Math.min(o, c) * (1 - Math.abs(gauss()) * sigma * 0.6);
    out.push({ o, h, l, c });
    prev = c;
  }
  return out;
})();

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const revealCount = (frame: number) => (N + GROW) * interpolate(frame, REVEAL, [0, 1], { ...clamp, easing: REVEAL_EASE });

const rawRange = (frame: number) => {
  const count = revealCount(frame);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < Math.max(1, Math.min(N, Math.ceil(count))); i++) {
    lo = Math.min(lo, DATA[i].l);
    hi = Math.max(hi, DATA[i].h);
  }
  const mid = (lo + hi) / 2;
  const span = Math.max(MIN_SPAN, (hi - lo) * (1 + 2 * RANGE_PAD));
  return [mid - span / 2, mid + span / 2] as const;
};

// 最近 RANGE_SMOOTH 帧的三角加权平均：无状态的"缓动跟随"
const smoothRange = (frame: number) => {
  let lo = 0;
  let hi = 0;
  let wsum = 0;
  for (let k = 0; k < RANGE_SMOOTH; k++) {
    const w = RANGE_SMOOTH - k;
    const [l, h] = rawRange(frame - k);
    lo += l * w;
    hi += h * w;
    wsum += w;
  }
  return [lo / wsum, hi / wsum] as const;
};

export const CandlestickGrowRescale: React.FC = () => {
  const frame = useCurrentFrame();
  const intro = interpolate(frame, INTRO, [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });

  const count = revealCount(frame);
  const [lo, hi] = smoothRange(frame);
  const y = (price: number) => PLOT.bottom - ((price - lo) / (hi - lo)) * PLOT_H;
  const slots = Math.max(PLOT_W / MAX_SLOT, Math.min(N, count));
  const slotW = PLOT_W / slots;
  const bodyW = Math.max(3, slotW * BODY_RATIO);

  // 正在生长的最新一根 = 最后一根进度 > 0 的蜡烛
  const growth = (i: number) => easeOutCubic(Math.min(1, Math.max(0, (count - i) / GROW)));
  const latest = Math.max(0, Math.min(N - 1, Math.ceil(count) - 1));
  const latestG = growth(latest);
  const latestPrice = DATA[latest].o + (DATA[latest].c - DATA[latest].o) * latestG;
  const latestUp = latestPrice >= DATA[latest].o;
  const change = latestPrice / DATA[0].o - 1;
  const showPrice = count > 0.05;

  const ticks: number[] = [];
  for (let v = Math.ceil(lo / TICK_STEP) * TICK_STEP; v <= hi; v += TICK_STEP) ticks.push(v);

  const pulse = interpolate(frame, [PULSE, PULSE + 20], [0, 1], clamp);
  const pillY = y(latestPrice);

  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(80% 70% at 30% 20%, #151a26 0%, #0a0c12 100%)',
        fontFamily: SANS,
        color: INK,
      }}
    >
      {/* 标题区 */}
      <div style={{ position: 'absolute', left: PLOT.left, top: 92, opacity: intro }}>
        <div style={{ fontSize: 34, color: INK_DIM, letterSpacing: '0.02em' }}>LMN · Lumen Index</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 28, marginTop: 6 }}>
          <div style={{ fontSize: 104, fontWeight: 650, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
            {showPrice ? latestPrice.toFixed(2) : '—'}
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 600,
              padding: '6px 16px',
              borderRadius: 14,
              color: change >= 0 ? UP : DOWN,
              background: change >= 0 ? 'rgba(46, 204, 143, 0.14)' : 'rgba(255, 93, 108, 0.14)',
              fontVariantNumeric: 'tabular-nums',
              opacity: showPrice ? 1 : 0,
            }}
          >
            {change >= 0 ? '+' : '−'}
            {Math.abs(change * 100).toFixed(2)}%
          </div>
        </div>
      </div>

      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: intro }}>
        <defs>
          <clipPath id="candlestick-plot">
            <rect x={PLOT.left - 40} y={PLOT.top - 60} width={PLOT_W + 80} height={PLOT_H + 120} />
          </clipPath>
        </defs>

        {/* 刻度线：跟着 y 轴重标一起滑，靠近绘图区边缘时淡出 */}
        {ticks.map((v) => {
          const ty = y(v);
          const edge = Math.min(ty - PLOT.top, PLOT.bottom - ty);
          const a = interpolate(edge, [-10, 30], [0, 1], clamp);
          return (
            <g key={v} opacity={a}>
              <line x1={PLOT.left} x2={PLOT.right} y1={ty} y2={ty} stroke="rgba(255,255,255,0.07)" strokeWidth={2} />
              <text x={PLOT.right + 150} y={ty + 9} fill={INK_DIM} fontSize={26} textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {v.toFixed(0)}
              </text>
            </g>
          );
        })}
        <line x1={PLOT.left} x2={PLOT.right} y1={PLOT.bottom} y2={PLOT.bottom} stroke="rgba(255,255,255,0.14)" strokeWidth={2} />

        <g clipPath="url(#candlestick-plot)">
          {DATA.map((d, i) => {
            const g = growth(i);
            if (g <= 0) return null;
            const cx = PLOT.left + (i + 0.5) * slotW;
            const cur = d.o + (d.c - d.o) * g; // 实体从开盘价长向收盘价
            const up = d.c >= d.o;
            const color = up ? UP : DOWN;
            const top = Math.max(d.o, cur) + (d.h - Math.max(d.o, cur)) * g;
            const bottom = Math.min(d.o, cur) - (Math.min(d.o, cur) - d.l) * g;
            const bodyTop = y(Math.max(d.o, cur));
            const bodyH = Math.max(2, y(Math.min(d.o, cur)) - bodyTop);
            return (
              <g key={i} opacity={Math.min(1, g * 3)}>
                <line x1={cx} x2={cx} y1={y(top)} y2={y(bottom)} stroke={color} strokeWidth={Math.max(1.5, slotW * 0.09)} />
                <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} rx={Math.min(3, bodyW / 4)} fill={color} />
              </g>
            );
          })}
        </g>

        {/* 最新价：虚线 + 右轴标签，咬住正在生长的那一根 */}
        {showPrice && (
          <g>
            <line
              x1={PLOT.left + (latest + 0.5) * slotW + bodyW / 2 + 6}
              x2={PLOT.right + 14}
              y1={pillY}
              y2={pillY}
              stroke={latestUp ? UP : DOWN}
              strokeWidth={2}
              strokeDasharray="6 8"
              opacity={0.7}
            />
            {pulse > 0 && pulse < 1 && (
              <rect
                x={PLOT.right + 14 - 18 * pulse}
                y={pillY - 26 - 18 * pulse}
                width={150 + 36 * pulse}
                height={52 + 36 * pulse}
                rx={14 + 12 * pulse}
                fill="none"
                stroke={latestUp ? UP : DOWN}
                strokeWidth={3}
                opacity={0.7 * (1 - pulse)}
              />
            )}
            <rect x={PLOT.right + 14} y={pillY - 26} width={150} height={52} rx={14} fill={latestUp ? UP : DOWN} />
            <text
              x={PLOT.right + 89}
              y={pillY + 11}
              fill="#07120d"
              fontSize={32}
              fontWeight={650}
              textAnchor="middle"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {latestPrice.toFixed(2)}
            </text>
          </g>
        )}
      </svg>
    </AbsoluteFill>
  );
};
