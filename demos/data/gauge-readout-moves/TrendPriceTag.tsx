// trend-price-tag —— 走势线 + 价格标（2026-09 改版，取代 tape-scroll-fixed-pointer 滚带定针）
// 金色折线从左往右画出，线头跟着读数走、带一圈光晕；金色价格标黏在线头右侧、虚线拉到图表右缘；
// 纵轴随「已画出的最高值」自动放大，所以冲刺段的斜率一眼就看得出来。上方大字读数 + 涨跌幅。
// 读数时间线与旧版同一条：静置 → 慢爬 → 冲刺过冲 → 回摆 → 落定 → 真静止——「先缓后急、甩过头再落定」。
// （使用者从「水平刻度带 / 走势线＋价格标 / 环形仪表 / 滚轮数字」四案里选了走势线＋价格标。）
import React from 'react';
import { useCurrentFrame, interpolate, Easing } from 'remotion';
import { GD as G, GOLD } from '../../_fixtures/Fixtures';

// 读数时间线（单位 0–500）：静置→慢爬→冲刺(过冲到442)→回摆(415)→落定420→真静止
export const trendDemoValue = (frame: number): number => {
  if (frame <= 12) return 60;
  if (frame <= 55) return interpolate(frame, [12, 55], [60, 140]);
  if (frame <= 78) return interpolate(frame, [55, 78], [140, 442], { easing: Easing.inOut(Easing.cubic) });
  if (frame <= 88) return interpolate(frame, [78, 88], [442, 415], { easing: Easing.out(Easing.cubic) });
  return interpolate(frame, [88, 96], [415, 420], { easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp' });
};

export type TrendPriceTagProps = {
  /** 读数（任意单位）随帧变化；必须是帧号的纯函数。 */
  valueAt: (frame: number) => number;
  /** 折线画完的帧（之后线头停住、价格标静止）。 */
  drawFrames: number;
  /** 显示格式：读数 → 字串（例：汇率两位小数）。 */
  format: (v: number) => string;
  /** 大字上方的小标，例：「USD / TWD · 即時匯率」。 */
  label: string;
  /** 涨跌幅的基准值（通常 = 第 0 帧读数）。 */
  base: number;
  /** 纵轴下限（读数单位）。 */
  floor?: number;
};

const FONT = 'Helvetica, Arial, "PingFang TC", "Noto Sans TC", sans-serif';
const X0 = 160, X1 = 1500, Y0 = 520, Y1 = 960; // 图表区（1920×1080）

export const TrendPriceTagShot: React.FC<TrendPriceTagProps> = ({ valueAt, drawFrames, format, label, base, floor }) => {
  const frame = useCurrentFrame();
  const n = Math.min(frame, drawFrames);
  const vals = Array.from({ length: n + 1 }, (_, i) => valueAt(i));
  const lo = floor ?? Math.min(...vals) - (Math.max(...vals) - Math.min(...vals) || 1) * 0.1;
  const top = Math.max(...vals);
  const hi = top + Math.max((top - lo) * 0.15, 1e-6); // 纵轴上限随已画出的最高值放大，上方只留高低差的 15%
  const pts = vals.map((v, i) => [X0 + ((X1 - X0) * i) / drawFrames, Y1 - ((v - lo) / (hi - lo)) * (Y1 - Y0)] as const);
  const [hx, hy] = pts[pts.length - 1];
  const poly = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const cur = valueAt(frame);
  const d = cur - base;
  return (
    <div style={{ width: 1920, height: 1080, background: G.bg, position: 'relative', overflow: 'hidden', fontFamily: FONT }}>
      <div style={{ position: 'absolute', left: 160, top: 150, color: G.ink }}>
        <div style={{ fontSize: 34, letterSpacing: 4, color: G.mid, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 150, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, marginTop: 10 }}>{format(cur)}</div>
        <div style={{ fontSize: 40, fontWeight: 700, color: d >= 0 ? GOLD : '#c2562e', fontVariantNumeric: 'tabular-nums', marginTop: 6 }}>
          {d >= 0 ? '▲' : '▼'} {format(Math.abs(d))}（{d >= 0 ? '+' : '−'}{Math.abs((d / base) * 100).toFixed(1)}%）
        </div>
      </div>
      {[0, 1, 2, 3].map((k) => <div key={k} style={{ position: 'absolute', left: X0, width: X1 - X0 + 200, top: Y0 + (k * (Y1 - Y0)) / 3, height: 1.5, background: G.line }} />)}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={GOLD} stopOpacity={0.35} /><stop offset="100%" stopColor={GOLD} stopOpacity={0} /></linearGradient>
        </defs>
        <polygon points={`${X0},${Y1} ${poly} ${hx},${Y1}`} fill="url(#trend-fill)" />
        <polyline points={poly} fill="none" stroke={GOLD} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
        <line x1={hx} y1={hy} x2={X1 + 60} y2={hy} stroke={GOLD} strokeWidth={2} strokeDasharray="8 8" opacity={0.6} />
        <circle cx={hx} cy={hy} r={26} fill={GOLD} opacity={0.25} />
        <circle cx={hx} cy={hy} r={12} fill={GOLD} />
      </svg>
      <div style={{ position: 'absolute', left: X1 + 70, top: hy - 30, padding: '8px 18px', borderRadius: 10, background: GOLD, color: G.bg, fontSize: 36, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {format(cur)}
      </div>
    </div>
  );
};

// demo：美元兑台币，读数 30.60 → 31.40 缓涨 → 急冲 34.42 → 回摆 34.15 → 落定 34.20
export const TrendPriceTag: React.FC = () => (
  <TrendPriceTagShot
    valueAt={(f) => 30 + trendDemoValue(f) / 100}
    drawFrames={96}
    format={(v) => v.toFixed(2)}
    label="USD / TWD · 即時匯率"
    base={30.6}
    floor={30.4}
  />
);
