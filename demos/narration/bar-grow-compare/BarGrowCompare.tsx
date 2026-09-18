// bar-grow-compare — 口播模式「数据」卡：2–4 个量按旁白的顺序比大小。
// 旁白念到哪一项，那根柱子才从基线长出来；柱顶的数值与柱高共用同一条曲线一路数到终值；
// 下一项登场时前面的柱子降权留守；全部讲完后，故事的重点那一根换成强调色。
// 自绘图表（数字来自 sources/facts.md），不吃素材。轴永远从 0 起。
// 设计坐标 1080×1920；所有时间点都是 props（帧号），成片里来自 f(tWord(i,'词'))。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { E, lerp, seg } from '../../_fixtures/Motion';
import { N, NarrationStage, SAFE, STAGE, slowPush } from '../../_fixtures/Narration';

export const BAR_GROW_COMPARE_DURATION = 180; // 6s @30fps

export type BarGrowCompareBar = {
  /** 类别名（柱下 / 横式时在柱上方）。最多两行，超长自动缩字。 */
  label: string;
  /** 终值（≥ 0）。柱长与滚动数字都停在它上面。 */
  value: number;
  /** 词锚帧：这一项被念出来的那一帧。成片 = f(tWord(i,'词')) − 镜头 from。 */
  at: number;
  /** 故事的重点那一根：落定后换成强调色（建议全图只标一根）。 */
  highlight?: boolean;
  /** 自订数值标签（如「約 1.2 萬」）：其中第一段数字照样滚动，其余文字不动；给了它就不再附加 unit。 */
  display?: string;
};

export type BarGrowCompareProps = {
  /** 2–4 项；阵列顺序 = 画面排列顺序，登场顺序由各自的 at 决定。 */
  bars: BarGrowCompareBar[];
  /** 挂在数值右侧的小单位（「人」「%」「萬」）。全图只能有一种单位。 */
  unit?: string;
  /** 固定小数位，预设 0。 */
  decimals?: number;
  /** 图表标题（左上）。 */
  title?: string;
  /** 标题与坐标骨架出现的帧，预设 0。 */
  titleAt?: number;
  /** 每根柱子的生长帧数，预设 22。 */
  growFrames?: number;
  /** 轴的上限；预设取「最高柱约占 88%」的整齐数。小于最大值时会被抬到最大值（柱子不准出图）。 */
  max?: number;
  /** vertical（预设，直式 2–4 根）/ horizontal（类别名很长时）。 */
  orientation?: 'vertical' | 'horizontal';
  /** 轴恒从 0 起。型别只有 true——这张卡不提供截断轴的开关（理由见卡片「已知坑」）。 */
  baselineZero?: true;
  /** 本镜总帧数（只用来算极缓相机）。 */
  duration: number;
  /** 来源行（图表左下小字），如「資料來源：官方統計」。 */
  note?: string;
};

// ───────── 数字格式化（整数运算，不靠 toLocaleString，跨机器一致）─────────
const fmt = (scaled: number, decimals: number, comma = true) => {
  const s = String(Math.abs(scaled)).padStart(decimals + 1, '0');
  const raw = s.slice(0, s.length - decimals);
  const int = comma ? raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : raw;
  return decimals > 0 ? `${int}.${s.slice(-decimals)}` : int;
};

const DIGIT_EM = 0.6; // 数字格宽（与 stat-punch 同一组比例）
const SEP_EM = 0.28; // 「,」「.」格宽
const UNIT_RATIO = 0.5; // 单位字号 / 数值字号
const isSep = (c: string) => c === ',' || c === '.';
/** 非数字串的宽度估算（em）：全形 1、半形 0.62。 */
const textEm = (s: string) => Array.from(s).reduce((a, c) => a + (c.charCodeAt(0) > 0xff ? 1 : 0.62), 0);
const slotsEm = (s: string) => Array.from(s).reduce((a, c) => a + (isSep(c) ? SEP_EM : DIGIT_EM), 0);

// ───────── 数值标签模型：前缀 + 定宽数字格 + 后缀 ─────────
type LabelModel = { prefix: string; suffix: string; target: number; decimals: number; comma: boolean; finalStr: string; roll: boolean };

const labelModel = (bar: BarGrowCompareBar, decimals: number): LabelModel => {
  if (bar.display === undefined) {
    const target = Math.round(Math.max(0, bar.value) * Math.pow(10, decimals));
    return { prefix: '', suffix: '', target, decimals, comma: true, finalStr: fmt(target, decimals), roll: true };
  }
  const m = /\d[\d,]*(?:\.\d+)?/.exec(bar.display);
  if (m) {
    const numStr = m[0];
    const dec = numStr.includes('.') ? numStr.length - numStr.indexOf('.') - 1 : 0;
    const target = parseInt(numStr.replace(/[,.]/g, ''), 10);
    const comma = numStr.includes(',');
    // 只有「我排出来的终值字串 == 你写的字串」才滚动，否则原样静态显示（不替你改数）
    if (fmt(target, dec, comma) === numStr) {
      return { prefix: bar.display.slice(0, m.index), suffix: bar.display.slice(m.index + numStr.length), target, decimals: dec, comma, finalStr: numStr, roll: true };
    }
  }
  return { prefix: bar.display, suffix: '', target: 0, decimals: 0, comma: false, finalStr: '', roll: false };
};

const modelEm = (m: LabelModel) => textEm(m.prefix) + slotsEm(m.finalStr) + textEm(m.suffix);

/** 定宽数字格：格宽由终值字串决定，滚动时不横向抖；p 与柱长共用，数字永远等于当下柱长代表的量。 */
const Digits: React.FC<{ m: LabelModel; p: number }> = ({ m, p }) => {
  const cur = p >= 1 ? m.target : Math.round(m.target * p);
  const shown = fmt(cur, m.decimals, m.comma).padStart(m.finalStr.length, ' ');
  return (
    <>
      {m.prefix ? <span>{m.prefix}</span> : null}
      {Array.from(m.finalStr).map((c, i) => (
        <span key={i} style={{ display: 'inline-block', width: `${isSep(c) ? SEP_EM : DIGIT_EM}em`, textAlign: 'center' }}>
          {shown[i] === ' ' ? '' : shown[i]}
        </span>
      ))}
      {m.suffix ? <span>{m.suffix}</span> : null}
    </>
  );
};

// ───────── 轴：整齐的上限 + 2–4 条格线，永远从 0 起 ─────────
const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const mantissa = (x: number) => x / Math.pow(10, Math.floor(Math.log10(x) + 1e-9));
const niceCeil = (x: number) => {
  const k = Math.pow(10, Math.floor(Math.log10(x) + 1e-9));
  return (NICE.find((v) => v >= x / k - 1e-9) ?? 10) * k;
};
const isNice = (x: number) => NICE.some((v) => Math.abs(mantissa(x) - v) < 1e-6);
const HEADROOM = 0.88; // 预设轴上限下，最高柱占绘图区的比例

const axisFor = (maxVal: number, userMax?: number): { max: number; ticks: number[] } => {
  if (!(maxVal > 0) && !(userMax !== undefined && userMax > 0)) return { max: 1, ticks: [0.5, 1] };
  let max: number;
  let n: number;
  if (userMax !== undefined && userMax > 0) {
    max = Math.max(userMax, maxVal);
    n = [3, 2, 4].find((k) => isNice(max / k)) ?? 2;
  } else {
    const target = maxVal / HEADROOM;
    const m3 = 3 * niceCeil(target / 3);
    const m2 = 2 * niceCeil(target / 2);
    [max, n] = m3 <= m2 * (1 + 1e-9) ? [m3, 3] : [m2, 2];
  }
  return { max, ticks: Array.from({ length: n }, (_, i) => (max * (i + 1)) / n) };
};

const fmtTick = (v: number) => {
  const [int, frac = ''] = v.toFixed(4).split('.');
  const f = frac.replace(/0+$/, '');
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? `.${f}` : '');
};

// ───────── 版面常量（设计坐标）─────────
const BAR_R = 12; // 柱顶小圆角（面板 28 的同族小号；进片随风格档圆角等比换）
const INFO_R = 900; // 资讯右界：x>900、y 900–1700 留给平台按钮，柱与标签不进去（格线可以）
const TITLE_Y = SAFE.y + 30;
const NOTE_Y = 1352;
// 直式：左侧轴数字栏 + 柱区
const V = { axisW: 100, x0: SAFE.x + 116, top: 470, base: 1170, slotMax: 300, labelTop: 22 };
// 横式：柱从左侧竖基线向右长
const H = { x0: SAFE.x + 4, top: 400, bottom: 1200, rowMax: 300 };

const DIM_FRAMES = 10; // 降权用时
const DIM_TO = 0.45; // 降权后的不透明度
const REST_TO = 0.55; // 落定后非重点柱的不透明度
const SETTLE_GAP = 10; // 最后一根长完到落定的间隔
const SETTLE_FRAMES = 12; // 落定换色用时
const LABEL_IN = 8; // 类别名 / 标题淡入帧数

/** 类别名字号：一行放得下用原字号；放不下折两行；两行还放不下才缩字（下限 30，再长交给两行截断）。 */
const catSize = (label: string, width: number, base: number) => {
  const em = textEm(label);
  if (em * base <= width * 1.9) return base;
  return Math.max(30, Math.floor((width * 1.9) / em));
};

export const BarGrowCompareShot: React.FC<BarGrowCompareProps> = ({
  bars: barsIn,
  unit = '',
  decimals = 0,
  title,
  titleAt = 0,
  growFrames = 22,
  max: userMax,
  orientation = 'vertical',
  duration,
  note,
}) => {
  const frame = useCurrentFrame();
  const bars = barsIn.slice(0, 4); // 超过 4 根不画（换别的卡）
  const n = Math.max(1, bars.length);
  const vertical = orientation === 'vertical';

  const values = bars.map((b) => Math.max(0, b.value));
  const axis = axisFor(Math.max(0, ...values), userMax);
  const models = bars.map((b) => labelModel(b, decimals));
  const hasHighlight = bars.some((b) => b.highlight);

  const ats = bars.map((b) => b.at);
  const firstAt = Math.min(...ats);
  const settleAt = Math.max(...ats) + growFrames + SETTLE_GAP;
  const pSettle = seg(frame, settleAt, settleAt + SETTLE_FRAMES, E.inOutCubic);
  const scaffoldAt = Math.min(titleAt, firstAt);
  const pScaffold = seg(frame, scaffoldAt - 1, scaffoldAt + LABEL_IN, E.outCubic);
  const pTitle = seg(frame, titleAt - 1, titleAt + LABEL_IN, E.outCubic);

  // 每根柱子的状态
  const state = bars.map((b, i) => {
    const tau = frame - b.at;
    const p = seg(tau + 1, 0, growFrames, E.outQuart); // 单调、无过冲；词锚帧当帧就有一截
    const later = ats.filter((a) => a > b.at);
    const nextAt = later.length ? Math.min(...later) : Infinity;
    const pDim = Number.isFinite(nextAt) ? seg(frame, nextAt, nextAt + DIM_FRAMES, E.outCubic) : 0;
    const rest = b.highlight || !hasHighlight ? 1 : REST_TO;
    const o = lerp(pSettle, lerp(pDim, 1, DIM_TO), rest);
    return {
      tau, p, o,
      textO: 0.25 + 0.75 * o, // 文字降权比柱子轻一点，留守时仍读得到
      appear: seg(tau, -1, 3),
      accent: b.highlight ? pSettle : 0,
      frac: values[i] / axis.max,
    };
  });

  // ───────── 几何 ─────────
  const unitEm = unit ? 0.12 + textEm(unit) * UNIT_RATIO : 0;
  const widestEm = Math.max(...models.map((m, i) => modelEm(m) + (bars[i].display === undefined ? unitEm : 0)), 1);

  // 直式
  const vSlot = Math.min((INFO_R - V.x0) / n, V.slotMax);
  const vLeft = V.x0 + (INFO_R - V.x0 - vSlot * n) / 2;
  const vBarW = Math.min(vSlot * 0.6, 180);
  const vPlotH = V.base - V.top;
  // 数值置中于柱、单位悬挂在右：要让单位不撞到隔壁，按「数字 + 两侧各留一个单位宽」估宽
  const vValSize = Math.min(58, ...models.map((m, i) => (vSlot - 8) / (modelEm(m) + (bars[i].display === undefined ? 2 * unitEm : 0) || 1)));
  const vCatSize = Math.min(...bars.map((b) => catSize(b.label, vSlot - 20, 40)));

  // 横式
  const hRow = Math.min((H.bottom - H.top) / n, H.rowMax);
  const hTop = H.top + (H.bottom - H.top - hRow * n) / 2;
  const hBarT = n >= 4 ? 64 : 84;
  const hValSize = 56;
  const hPlotW = INFO_R - H.x0 - 16 - widestEm * hValSize; // 柱长到 100% 时数值仍在资讯右界内
  const hCatSize = Math.min(...bars.map((b) => catSize(b.label, INFO_R - H.x0 - 12, 40)));

  const tickEm = Math.max(...axis.ticks.map((t) => slotsEm(fmtTick(t))));
  const tickSize = Math.min(26, (V.axisW - 4) / tickEm);
  const gridRight = SAFE.x + SAFE.w;

  // 贴满 SAFE 的容器：从 1/1.04 推到 1.00（反过来会溢出 SAFE）
  const push = slowPush(frame, duration, 1 / 1.04, 1);
  const glowY = vertical ? (V.top + V.base) / 2 : (H.top + H.bottom) / 2;

  const valueLabel = (i: number, size: number, style: React.CSSProperties) => {
    const s = state[i];
    const m = models[i];
    const hangUnit = unit && bars[i].display === undefined;
    // 换色 = 同一串数字叠两层（底层 onDark、上层 accent 渐显），不解析颜色字串，换皮时任何 CSS 颜色都行
    const layer = (color: string, opacity: number, overlay: boolean) => (
      <div style={{ position: overlay ? 'absolute' : 'relative', left: 0, top: 0, color, opacity, whiteSpace: 'nowrap' }}>
        <Digits m={m} p={s.p} />
      </div>
    );
    return (
      <div style={{ position: 'absolute', display: 'flex', alignItems: 'center', height: size * 1.2, fontFamily: N.font, fontWeight: 800, fontSize: size, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', opacity: s.appear * s.textO, ...style }}>
        <div style={{ position: 'relative' }}>
          {layer(N.onDark, 1, false)}
          {s.accent > 0 ? layer(N.accent, s.accent, true) : null}
          {hangUnit ? (
            <span style={{ position: 'absolute', left: '100%', bottom: '0.14em', marginLeft: '0.12em', fontSize: `${UNIT_RATIO}em`, fontWeight: 700, color: N.onDark, opacity: 0.8 }}>
              {unit}
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  const catStyle = (size: number, s: { appear: number; textO: number; tau: number }): React.CSSProperties => ({
    position: 'absolute', fontFamily: N.font, fontWeight: 600, fontSize: size, lineHeight: 1.3, color: N.onDark,
    opacity: seg(s.tau, -1, LABEL_IN, E.outCubic) * s.textO,
    display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', overflowWrap: 'anywhere',
  });

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: STAGE.w, height: STAGE.h, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push})`, transformOrigin: `${SAFE.x + SAFE.w / 2}px ${SAFE.y + SAFE.h / 2}px` }}>
        {/* 底：一团极淡的光（与 stat-punch 同款） */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.07, background: `radial-gradient(55% 36% at 50% ${glowY}px, ${N.onDark}, transparent 70%)` }} />

        {/* 标题 */}
        {title && pTitle > 0 ? (
          <div style={{ position: 'absolute', left: SAFE.x, top: TITLE_Y, width: INFO_R - SAFE.x, fontFamily: N.font, opacity: pTitle, transform: `translateY(${lerp(pTitle, 14, 0)}px)` }}>
            <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.25, color: N.onDark }}>{title}</div>
            <div style={{ marginTop: 22, width: 120, height: 6, borderRadius: 3, background: N.accent, transform: `scaleX(${pTitle})`, transformOrigin: '0 50%' }} />
          </div>
        ) : null}

        {/* 坐标骨架：格线 + 轴数字（不是数据，随标题出现；柱与数值才受词锚管） */}
        {pScaffold > 0 ? (
          <div style={{ position: 'absolute', inset: 0, opacity: pScaffold }}>
            {axis.ticks.map((t, k) =>
              vertical ? (
                <React.Fragment key={k}>
                  <div style={{ position: 'absolute', left: V.x0, width: gridRight - V.x0, top: V.base - (t / axis.max) * vPlotH - 1, height: 2, background: N.onDark, opacity: 0.1 }} />
                  <div style={{ position: 'absolute', left: SAFE.x, width: V.axisW, top: V.base - (t / axis.max) * vPlotH - tickSize * 0.7, textAlign: 'right', fontFamily: N.font, fontSize: tickSize, lineHeight: 1.4, fontWeight: 500, color: N.onDark, opacity: 0.45, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtTick(t)}
                  </div>
                </React.Fragment>
              ) : (
                <React.Fragment key={k}>
                  <div style={{ position: 'absolute', left: H.x0 + (t / axis.max) * hPlotW - 1, width: 2, top: H.top, height: H.bottom - H.top, background: N.onDark, opacity: 0.1 }} />
                  <div style={{ position: 'absolute', left: H.x0 + (t / axis.max) * hPlotW - 100, width: 200, top: H.bottom + 14, textAlign: 'center', fontFamily: N.font, fontSize: 26, lineHeight: 1.4, fontWeight: 500, color: N.onDark, opacity: 0.45, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtTick(t)}
                  </div>
                </React.Fragment>
              ),
            )}
            {note ? (
              <div style={{ position: 'absolute', left: SAFE.x, top: NOTE_Y, width: INFO_R - SAFE.x, fontFamily: N.font, fontSize: 26, lineHeight: 1.4, fontWeight: 500, color: N.onDark, opacity: 0.5, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                {note}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 柱、数值、类别名：词锚前整组不进 DOM */}
        {bars.map((b, i) => {
          const s = state[i];
          if (s.tau < 0) return null;
          if (vertical) {
            const cx = vLeft + vSlot * (i + 0.5);
            const h = s.frac * vPlotH * s.p;
            return (
              <React.Fragment key={i}>
                <div style={{ position: 'absolute', left: cx - vBarW / 2, top: V.base - h, width: vBarW, height: h, borderRadius: `${Math.min(BAR_R, h)}px ${Math.min(BAR_R, h)}px 0 0`, background: N.onDark, opacity: s.o, overflow: 'hidden' }}>
                  {s.accent > 0 ? <div style={{ position: 'absolute', inset: 0, background: N.accent, opacity: s.accent }} /> : null}
                </div>
                {valueLabel(i, vValSize, { left: cx - vSlot / 2, width: vSlot, justifyContent: 'center', top: V.base - h - 12 - vValSize * 1.2 })}
                <div style={{ ...catStyle(vCatSize, s), left: cx - vSlot / 2 + 10, width: vSlot - 20, top: V.base + V.labelTop, textAlign: 'center' }}>{b.label}</div>
              </React.Fragment>
            );
          }
          const rowBottom = hTop + hRow * (i + 1) - 14;
          const w = s.frac * hPlotW * s.p;
          return (
            <React.Fragment key={i}>
              <div style={{ position: 'absolute', left: H.x0, top: rowBottom - hBarT, width: w, height: hBarT, borderRadius: `0 ${Math.min(BAR_R, w)}px ${Math.min(BAR_R, w)}px 0`, background: N.onDark, opacity: s.o, overflow: 'hidden' }}>
                {s.accent > 0 ? <div style={{ position: 'absolute', inset: 0, background: N.accent, opacity: s.accent }} /> : null}
              </div>
              {valueLabel(i, hValSize, { left: H.x0 + w + 16, top: rowBottom - hBarT / 2 - hValSize * 0.6 })}
              <div style={{ ...catStyle(hCatSize, s), left: H.x0 + 8, width: INFO_R - H.x0 - 12, bottom: STAGE.h - (rowBottom - hBarT - 12) }}>{b.label}</div>
            </React.Fragment>
          );
        })}

        {/* 基线（压在柱脚上，柱底切得干净） */}
        {pScaffold > 0 ? (
          vertical ? (
            <div style={{ position: 'absolute', left: V.x0, width: gridRight - V.x0, top: V.base - 1, height: 2, background: N.onDark, opacity: 0.5 * pScaffold }} />
          ) : (
            <div style={{ position: 'absolute', left: H.x0 - 1, width: 2, top: H.top, height: H.bottom - H.top, background: N.onDark, opacity: 0.5 * pScaffold }} />
          )
        ) : null}
      </div>
    </div>
  );
};

// demo：三年报名人数，词锚 24 / 66 / 108；最后一根是重点，落定（帧 140 起）换强调色。
export const BarGrowCompare: React.FC = () => (
  <NarrationStage>
    <BarGrowCompareShot
      title="近三年報名人數"
      unit="人"
      bars={[
        { label: '2024', value: 1180, at: 24 },
        { label: '2025', value: 1420, at: 66 },
        { label: '2026', value: 2015, at: 108, highlight: true },
      ]}
      note="資料來源：官方統計"
      duration={BAR_GROW_COMPARE_DURATION}
    />
  </NarrationStage>
);
