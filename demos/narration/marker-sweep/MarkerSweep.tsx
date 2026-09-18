// marker-sweep — 萤光笔随口播划过原文（口播模式 · evidence）
// 页面已停靠在证据句上（只有 slowPush），一道萤光笔从句首划到句尾，笔尖位置由 keyframes 决定：
// 每个 keyframe = 「旁白讲到某个词的那一帧 → 笔划应该走到全长的几成」。笔划画在**页面坐标**里，
// 和页面同一个变换容器，页面怎么动它都黏在字上。多行时 progress 对应所有行宽度首尾相接的总长。
// 设计坐标 1080×1920（NarrationStage），不含舞台，成片可直接用 MarkerSweepShot。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { E, lerp, rand } from '../../_fixtures/Motion';
import { FakeArticle, N, NarrationStage, PAGE, PAGE_BOXES, SAFE, slowPush } from '../../_fixtures/Narration';

export type MarkerRect = { x: number; y: number; w: number; h: number };
export type MarkerKeyframe = { at: number; progress: number };

export type MarkerSweepProps = {
  /** 每行文字一个矩形，页面坐标（成片取 boxes.json 的 rects，顺序 = 阅读顺序）。 */
  rects?: MarkerRect[];
  /** 帧号 → 笔划走到总长的 0..1。成片里 at = f(tWord(...)) / f(tWordEnd(...))。 */
  keyframes?: MarkerKeyframe[];
  /** 镜头总帧数（只用来算 slowPush）。 */
  duration?: number;
  /** 视窗上缘对到页面的哪个 y（页面坐标）。调它让句子落在安全区约 40% 高度。 */
  pageY?: number;
  /** 萤光笔颜色（不透明色值，透明度由卡内控制）。 */
  color?: string;
  /** 页面在视窗里的基础缩放；页面水平置中。 */
  pageScale?: number;
  /** 页面本体（页面坐标系、原点左上）。成片换成 <Img src={page.png} /> 并按 boxes.json 的 scale 设宽度。 */
  page?: React.ReactNode;
  /** 页面宽度（页面坐标），用来水平置中。 */
  pageWidth?: number;
};

// ───────── 几何与手感常量（蒙皮时不动）─────────
const BLEED_X = 6; // 笔划左右各超出文字框
const BLEED_Y = 4; // 上下各超出：比文字行略高
const CAP = 5; // 两端外凸的圆头量
const WOBBLE = 1.6; // 上下缘抖动振幅（px）
const WOBBLE_STEP = 26; // 抖动取样间距（px，固定在行内网格上，笔划变长时已画好的边缘不会跳）
const TIP_W = 10; // 笔尖较浓的一小段
const FILL_ALPHA = 0.55;
const TIP_ALPHA = 0.3; // 叠在 FILL 之上
const EASE_MIX = 0.5; // 0 = 线性，1 = 每段完全停顿的 inOutQuad；取中间让词与词之间只「松一口气」不急停
const PANEL_RADIUS = 28;

/** 两个 keyframe 之间的温和 ease-in-out；结果单调不减，第一个 keyframe 之前回传 -1（= 完全不可见）。 */
export const markerProgress = (frame: number, keyframes: MarkerKeyframe[]): number => {
  if (keyframes.length === 0) return -1;
  const ks = [...keyframes].sort((a, b) => a.at - b.at);
  // 进度强制单调：词锚偶有倒挂（ASR 估计误差）时不让笔划回退
  let top = 0;
  const mono = ks.map((k) => {
    top = Math.max(top, Math.min(1, Math.max(0, k.progress)));
    return { at: k.at, progress: top };
  });
  if (frame < mono[0].at) return -1;
  for (let i = 0; i < mono.length - 1; i++) {
    const a = mono[i];
    const b = mono[i + 1];
    if (frame < b.at) {
      const t = (frame - a.at) / Math.max(1, b.at - a.at);
      return lerp(lerp(EASE_MIX, t, E.inOutQuad(t)), a.progress, b.progress);
    }
  }
  return mono[mono.length - 1].progress;
};

// 行内固定网格上的抖动值，网格点之间线性过渡 → 任意 x 都有稳定的边缘高度
const wobbleAt = (line: number, side: 0 | 1, dx: number) => {
  const k = dx / WOBBLE_STEP;
  const i = Math.floor(k);
  const seed = (n: number) => (rand(line * 97.3 + side * 41.7 + n * 3.11) - 0.5) * 2 * WOBBLE;
  return lerp(k - i, seed(i), seed(i + 1));
};

/** 一段笔划的外形：上缘左→右、右端圆头、下缘右→左、左端圆头。xa/xb 为页面坐标。 */
const strokePath = (r: MarkerRect, line: number, xa: number, xb: number, capL: boolean, capR: boolean) => {
  const x0 = r.x - BLEED_X;
  const top = r.y - BLEED_Y;
  const bot = r.y + r.h + BLEED_Y;
  const mid = (top + bot) / 2;
  const xs: number[] = [xa];
  for (let g = Math.ceil((xa - x0) / WOBBLE_STEP) * WOBBLE_STEP + x0; g < xb; g += WOBBLE_STEP) {
    if (g > xa) xs.push(g);
  }
  xs.push(xb);
  const n = (v: number) => v.toFixed(2);
  const up = xs.map((x) => `${n(x)} ${n(top + wobbleAt(line, 0, x - x0))}`);
  const down = [...xs].reverse().map((x) => `${n(x)} ${n(bot + wobbleAt(line, 1, x - x0))}`);
  const right = capR ? `Q ${n(xb + CAP)} ${n(mid)} ${down[0]}` : `L ${down[0]}`;
  const left = capL ? `Q ${n(xa - CAP)} ${n(mid)} ${up[0]}` : `L ${up[0]}`;
  return `M ${up[0]} L ${up.slice(1).join(' L ')} ${right} L ${down.slice(1).join(' L ')} ${left} Z`;
};

const DEMO_RECTS: MarkerRect[] = (() => {
  const a = PAGE_BOXES.keyLine; // 「比去年同期成長百分之四十一，」
  const next = '其中七成是第一次參加的新生。'; // fixture 同段的下一行
  return [
    { x: a.x, y: a.y, w: a.w, h: a.h },
    { x: a.x, y: a.y + PAGE.lineH, w: next.length * PAGE.fontSize, h: a.h },
  ];
})();

const DEMO_SCALE = 0.96;
// 句子（两行的中线）落在安全区 40% 高度
const DEMO_PAGE_Y = Math.round(DEMO_RECTS[0].y + PAGE.lineH - 5 - (SAFE.h * 0.4) / DEMO_SCALE);

// 28 个字；节奏故意不均：快起 → 第一行讲完后停一拍 → 「其中七成」 → 小停 → 收尾
const DEMO_KEYFRAMES: MarkerKeyframe[] = [
  { at: 22, progress: 0 }, // 「比」
  { at: 38, progress: 5 / 28 }, // 「比去年同期」讲完
  { at: 64, progress: 14 / 28 }, // 第一行讲完
  { at: 82, progress: 14 / 28 }, // 句中气口：笔停住
  { at: 93, progress: 18 / 28 }, // 「其中七成」
  { at: 100, progress: 18 / 28 },
  { at: 128, progress: 1 }, // 「新生。」
];

export const MARKER_SWEEP_DURATION = 150; // 5s @30fps

export const MarkerSweepShot: React.FC<MarkerSweepProps> = ({
  rects = DEMO_RECTS,
  keyframes = DEMO_KEYFRAMES,
  duration = MARKER_SWEEP_DURATION,
  pageY = DEMO_PAGE_Y,
  color = N.accent,
  pageScale = DEMO_SCALE,
  page = <FakeArticle />,
  pageWidth = PAGE.w,
}) => {
  const frame = useCurrentFrame();
  const p = markerProgress(frame, keyframes);

  // progress → 各行画到哪
  const total = rects.reduce((s, r) => s + r.w, 0);
  let remain = Math.max(0, p) * total;
  let tipLine = -1;
  // 不到 0.5px 的余量当 0：progress 停在两行（或两句）交界时，浮点误差会漏 ~1e-13px 到下一行，
  // 「len > 0 就画」会在下一句开头画出一个零长度、只剩圆头与外扩的小墨点——旁白还没讲到就先露头（实际踩过）
  const MIN_DRAW = 0.5;
  const lens = rects.map((r, i) => {
    let len = Math.min(r.w, Math.max(0, remain));
    if (len < MIN_DRAW) len = 0;
    remain -= len;
    if (len > 0) tipLine = i;
    return len;
  });

  // 极缓推近，缩放原点 = 句子中心（视窗坐标），推近时句子不漂
  const x0 = Math.min(...rects.map((r) => r.x));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y0 = Math.min(...rects.map((r) => r.y));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  const pageLeft = (SAFE.w - pageWidth * pageScale) / 2;
  const focusX = pageLeft + ((x0 + x1) / 2) * pageScale;
  const focusY = ((y0 + y1) / 2 - pageY) * pageScale;
  const push = slowPush(frame, duration);

  return (
    <div
      style={{
        position: 'absolute', left: SAFE.x, top: SAFE.y, width: SAFE.w, height: SAFE.h,
        borderRadius: PANEL_RADIUS, overflow: 'hidden', background: N.paper,
        boxShadow: `0 0 0 2px ${N.line}33`,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push})`, transformOrigin: `${focusX}px ${focusY}px` }}>
        {/* 页面坐标容器：页面与笔划共用这一个变换，笔划永远黏在字上 */}
        <div
          style={{
            position: 'absolute', left: pageLeft, top: -pageY * pageScale, width: pageWidth, height: 0,
            transform: `scale(${pageScale})`, transformOrigin: '0 0',
          }}
        >
          {page}
          {p > 0 && (
            <svg
              width={1} height={1}
              style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', mixBlendMode: 'multiply', pointerEvents: 'none' }}
            >
              {rects.map((r, i) => {
                const len = lens[i];
                if (len <= 0) return null;
                const xa = r.x - BLEED_X;
                // 行首、行尾的出血量随进度摊进去：0 长度时不露头，走满时盖到 w + BLEED_X
                const xb = r.x + len + BLEED_X * (2 * (len / r.w) - 1);
                const isTip = i === tipLine;
                return (
                  <g key={i}>
                    <path d={strokePath(r, i, xa, xb, true, true)} fill={color} fillOpacity={FILL_ALPHA} />
                    {isTip && (
                      <path d={strokePath(r, i, Math.max(xa, xb - TIP_W), xb, false, true)} fill={color} fillOpacity={TIP_ALPHA} />
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};

export const MarkerSweep: React.FC = () => (
  <NarrationStage>
    <MarkerSweepShot />
  </NarrationStage>
);
