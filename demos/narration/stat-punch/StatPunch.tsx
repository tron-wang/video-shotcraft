// stat-punch — 口播模式「数据」卡：全片那一个数字，正好砸在旁白说出它的那个词上。
// 大数字从略大处落下、一次阻尼过冲后落定；入场前 60% 数位滚到终值；单位 / 说明行在落定后几帧跟上。
// 底可以是纯 N.bg，也可以是压暗的实拍（overFootage + children）。
// 设计坐标 1080×1920；所有时间点都是 props（帧号），成片里来自 f(tWord(i,'词'))。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { E, lerp, seg } from '../../_fixtures/Motion';
import { FakeClip, N, NarrationStage, SAFE, STAGE, slowPush } from '../../_fixtures/Narration';

export const STAT_PUNCH_DURATION = 120; // 4s @30fps

export type StatPunchProps = {
  /** 终值。滚动必定停在它上面。 */
  value: number;
  /** 固定小数位，预设 0。 */
  decimals?: number;
  /** 数字前缀（"$"、"+"、"約"）；负号由 value 自动带出，不用写在这里。 */
  prefix?: string;
  /** 紧跟数字右侧的小单位（"%"、"萬"、"萬次瀏覽"）。 */
  unit?: string;
  /** 数字下方的说明行。 */
  label?: string;
  /** 第二条辅助说明（更小、更淡）。 */
  sub?: string;
  /** 词锚帧：数字砸入的那一帧。成片 = f(tWord(i,'词')) − 镜头 from。 */
  at: number;
  /** 单位 / 说明行相对 at 的延迟帧数，预设 18（数字落定后约 4 帧）。 */
  labelDelay?: number;
  /** 数位滚动帧数，预设 12（= 入场 20f 的 60%）。 */
  rollFrames?: number;
  /** 本镜总帧数（只用来算背景的极缓推近）。 */
  duration: number;
  /** true = 数字压在实拍上：children 当底层，上面盖一层暗幕。 */
  overFootage?: boolean;
  /** 暗幕不透明度，预设 0.55。 */
  dim?: number;
  /** 数字与细线的颜色，预设 N.accent。 */
  accent?: string;
  /** 数字字号上限，预设 200（6 字符的数字连 1.28 倍起始帧都在 SAFE 内）；更长自动缩小。 */
  fontSize?: number;
  /** 实拍 / 照片层（overFootage 时才画）。 */
  children?: React.ReactNode;
};

// ───────── 落定曲线：τ = frame − at 的纯函数 ─────────
// s(τ) = 1 + A·(1 − τ/T0)·e^(−τ/TAU)
// 临界阻尼型：只有一个过零点（τ = T0）与一个极小值（τ = T0 + TAU），之后单调回到 1——
// 数学上保证「最多弹一次、之后不晃」。预设 A=.28 / T0=5 / TAU=4：
// τ=0 → 1.28，τ=5 → 1.00，τ=9 → 0.976（谷底），τ=18 → 0.992，τ=30 → 0.999。
const A = 0.28;
const T0 = 5;
const TAU = 4;
/** 入场总长（帧）：rollFrames 预设取它的 60%。 */
export const STAT_PUNCH_SETTLE = 20;
export const statPunchSettle = (tau: number) => (tau < 0 ? 0 : 1 + A * (1 - tau / T0) * Math.exp(-tau / TAU));

// ───────── 数字格式化（整数运算，不靠 toLocaleString，跨机器一致）─────────
const fmt = (scaled: number, decimals: number) => {
  const s = String(Math.abs(scaled)).padStart(decimals + 1, '0');
  const int = s.slice(0, s.length - decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimals > 0 ? `${int}.${s.slice(-decimals)}` : int;
};

const DIGIT_EM = 0.6; // 数字格宽
const SEP_EM = 0.28; // 「,」「.」格宽
const UNIT_RATIO = 0.36; // 单位字号 / 数字字号
const isSep = (c: string) => c === ',' || c === '.';
/** 非数字串的宽度估算（em）：全形 1、半形 0.62。 */
const textEm = (s: string) => Array.from(s).reduce((a, c) => a + (c.charCodeAt(0) > 0xff ? 1 : 0.62), 0);

const LABEL_IN = 9; // 说明行淡入帧数
const CENTER_Y = 700; // 数字垂直中心

export const StatPunchShot: React.FC<StatPunchProps> = ({
  value,
  decimals = 0,
  prefix = '',
  unit = '',
  label,
  sub,
  at,
  labelDelay = 18,
  rollFrames = Math.round(STAT_PUNCH_SETTLE * 0.6),
  duration,
  overFootage = false,
  dim = 0.55,
  accent = N.accent,
  fontSize = 200,
  children,
}) => {
  const frame = useCurrentFrame();
  const tau = frame - at;

  // 终值字串与滚动起点。起点 = 终值的一半，但不低于「同位数的最小数」（41.9 → 20.9、124,000 → 100,000），
  // 位数不变，滚动时左侧就不会出现空格；只有终值恰为 10^n（100、1,000）时才会少一位、首格留空。
  const pow = Math.pow(10, decimals);
  const target = Math.round(Math.abs(value) * pow);
  const finalStr = fmt(target, decimals);
  const intDigits = String(Math.floor(target / pow)).length;
  const sameLen = Math.pow(10, intDigits - 1) * pow;
  const half = Math.floor(target / 2);
  const from = target > sameLen ? Math.max(sameLen, half) : half;
  const cur = tau >= rollFrames ? target : Math.round(lerp(seg(tau, 0, rollFrames, E.outCubic), from, target));
  const shown = fmt(cur, decimals).padStart(finalStr.length, ' ');
  const lead = (value < 0 ? '−' : '') + prefix;

  // 自动缩字：整组（前缀 + 数字格 + 单位）在起始最大倍率 1+A 下的估宽不超过 SAFE.w 的 97%
  const numEm = Array.from(finalStr).reduce((a, c) => a + (isSep(c) ? SEP_EM : DIGIT_EM), 0);
  const totalEm = textEm(lead) + numEm + (unit ? 0.08 + textEm(unit) * UNIT_RATIO : 0);
  const size = Math.min(fontSize, (SAFE.w * 0.97) / (totalEm * (1 + A)));

  const s = statPunchSettle(tau);
  const numOpacity = seg(tau, -1, 2); // τ=0 已有 1/3，3 帧到满；硬砸不做慢淡入
  const pLabel = seg(tau, labelDelay, labelDelay + LABEL_IN, E.outCubic);
  const pSub = seg(tau, labelDelay + 5, labelDelay + 5 + LABEL_IN, E.outCubic);
  const shadow = overFootage ? '0 8px 48px rgba(0,0,0,.5)' : undefined;
  const push = slowPush(frame, duration);

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: STAGE.w, height: STAGE.h, overflow: 'hidden' }}>
      {/* 底层：实拍（极缓推近）+ 暗幕；或纯底上一团极淡的光 */}
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push})`, transformOrigin: `50% ${CENTER_Y}px` }}>
        {overFootage ? children : (
          <div style={{ position: 'absolute', inset: 0, opacity: 0.08, background: `radial-gradient(50% 32% at 50% ${CENTER_Y}px, ${N.onDark}, transparent 70%)` }} />
        )}
      </div>
      {overFootage ? <div style={{ position: 'absolute', inset: 0, background: N.bg, opacity: dim }} /> : null}

      {/* 数字组：词锚前整组不进 DOM */}
      {tau >= 0 ? (
        <div
          style={{
            position: 'absolute', left: 0, top: CENTER_Y - size * 0.6, width: STAGE.w, height: size * 1.2,
            display: 'flex', justifyContent: 'center', alignItems: 'baseline',
            fontFamily: N.font, fontWeight: 800, fontSize: size, lineHeight: 1.2, color: accent,
            fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textShadow: shadow,
            opacity: numOpacity,
            transform: `translateY(${-160 * (s - 1)}px) scale(${s})`, // 位移与缩放共用同一条曲线：从上方 45px 落下
            transformOrigin: '50% 60%',
          }}
        >
          {lead ? <span>{lead}</span> : null}
          {Array.from(finalStr).map((c, i) => (
            <span key={i} style={{ display: 'inline-block', width: `${isSep(c) ? SEP_EM : DIGIT_EM}em`, textAlign: 'center' }}>
              {shown[i] === ' ' ? '' : shown[i]}
            </span>
          ))}
          {/* 单位占位恒在（数字不会因它出现而横移），但到点前不画 */}
          {unit ? (
            <span style={{ display: 'inline-block', marginLeft: '0.08em', fontSize: `${UNIT_RATIO}em`, fontWeight: 700, color: N.onDark, opacity: pLabel, visibility: pLabel > 0 ? 'visible' : 'hidden' }}>
              {unit}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* 细线 + 说明行 */}
      {pLabel > 0 ? (
        <div style={{ position: 'absolute', left: SAFE.x, width: SAFE.w, top: CENTER_Y + size * 0.6 + 24, display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: N.font, textShadow: shadow }}>
          <div style={{ width: 120, height: 6, borderRadius: 3, background: accent, transform: `scaleX(${pLabel})` }} />
          {label ? (
            <div style={{ marginTop: 36, fontSize: 56, fontWeight: 700, lineHeight: 1.3, color: N.onDark, textAlign: 'center', opacity: pLabel, transform: `translateY(${lerp(pLabel, 16, 0)}px)` }}>
              {label}
            </div>
          ) : null}
          {sub && pSub > 0 ? (
            <div style={{ marginTop: 18, fontSize: 36, fontWeight: 500, lineHeight: 1.4, color: N.onDark, textAlign: 'center', opacity: pSub * 0.66, transform: `translateY(${lerp(pSub, 12, 0)}px)` }}>
              {sub}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

// demo：前 1 秒只有实拍（证明词锚前什么都不出现），第 30 帧 41.9 砸入。
export const StatPunch: React.FC = () => (
  <NarrationStage>
    <StatPunchShot
      value={41.9}
      decimals={1}
      unit="%"
      label="比去年同期成長"
      sub="官方統計 · 今年報名人數"
      at={30}
      duration={STAT_PUNCH_DURATION}
      overFootage
      fontSize={300} // 4 字符的短数字放大（自动缩字仍会兜底）；预设 200 是「6 字符仍在 SAFE 内」的上限
    >
      <FakeClip hue={28} />
    </StatPunchShot>
  </NarrationStage>
);
