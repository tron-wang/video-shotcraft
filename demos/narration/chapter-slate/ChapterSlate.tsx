// chapter-slate — 口播片的章节卡：句间气口里的一张 1.5–2s 色板。
// 时序：章节色自下而上平擦铺满 → 线稿图标逐笔画出（pathLength=1 + dashoffset 1→0，不量 DOM）
// → 章节号（空心大字）与标题（实心）先后从遮罩线后升起 → 短停 → 整块继续向上擦走，露出下一镜。
// 每章一个颜色 + 一个图标；同一图标缩小成左下角标 ChapterTag，留在后续镜头里。
// 设计坐标 1080×1920；所有时间点都是 props（帧号，相对本镜起点）。
import React from 'react';
import { Sequence, useCurrentFrame } from 'remotion';
import { FakeClip, N, NarrationStage, SAFE, slowPush } from '../../_fixtures/Narration';
import { E, lerp, seg } from '../../_fixtures/Motion';

export type ChapterMotif = 'pin' | 'magnifier' | 'bars' | 'ripple' | 'quote' | 'clock';

/** 预设章节色板：四色都压在 N.bg 上不刺眼，括号内是该色上的文字色与对比度（WCAG）。 */
export const CHAPTER_PALETTE: { bg: string; ink: string }[] = [
  { bg: '#2f55c4', ink: N.onDark }, // 钴蓝 × onDark 5.73:1
  { bg: '#e0b04b', ink: N.ink }, //    琥珀（= N.accent）× ink 8.40:1
  { bg: '#1b6f62', ink: N.onDark }, // 松绿 × onDark 5.27:1
  { bg: '#a8432c', ink: N.onDark }, // 砖红 × onDark 5.26:1
];

// ───────────────────────── 配色 ─────────────────────────

const luminance = (hex: string): number | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** 章节色与其上的文字色。没给 color 时按 index 轮用色板；给了 color（#rrggbb）时在
 * N.onDark / N.ink 里挑对比高的那个。 */
export const chapterColors = (index: number, color?: string): { bg: string; ink: string } => {
  if (!color) return CHAPTER_PALETTE[(Math.max(1, Math.round(index)) - 1) % CHAPTER_PALETTE.length];
  const l = luminance(color);
  if (l === null) return { bg: color, ink: N.onDark };
  const lo = luminance(N.onDark) ?? 1;
  const li = luminance(N.ink) ?? 0;
  return { bg: color, ink: contrast(l, lo) >= contrast(l, li) ? N.onDark : N.ink };
};

// ───────────────────────── 线稿图标（200×200 viewBox） ─────────────────────────

type Stroke =
  | { k: 'path'; d: string }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { k: 'circle'; cx: number; cy: number; r: number };

const MOTIFS: Record<ChapterMotif, Stroke[]> = {
  // 地点针：水滴外形 + 针眼
  pin: [
    { k: 'path', d: 'M100 180 C62 134 46 110 46 84 A54 54 0 1 1 154 84 C154 110 138 134 100 180 Z' },
    { k: 'circle', cx: 100, cy: 84, r: 19 },
  ],
  // 放大镜：镜框 + 握柄 + 一道反光
  magnifier: [
    { k: 'circle', cx: 86, cy: 86, r: 54 },
    { k: 'line', x1: 126, y1: 126, x2: 176, y2: 176 },
    { k: 'path', d: 'M54 82 A33 33 0 0 1 82 54' },
  ],
  // 长条：基线 + 三根递增的柱
  bars: [
    { k: 'line', x1: 26, y1: 172, x2: 174, y2: 172 },
    { k: 'line', x1: 58, y1: 172, x2: 58, y2: 122 },
    { k: 'line', x1: 100, y1: 172, x2: 100, y2: 84 },
    { k: 'line', x1: 142, y1: 172, x2: 142, y2: 40 },
  ],
  // 涟漪：由内向外三圈
  ripple: [
    { k: 'circle', cx: 100, cy: 100, r: 14 },
    { k: 'circle', cx: 100, cy: 100, r: 48 },
    { k: 'circle', cx: 100, cy: 100, r: 84 },
  ],
  // 引述：对话框（带尾巴）+ 框内两撇引号。不用「圆头 + 尾」的引号造型——纯线稿下它读成数字 66，
  // 摆在章节号旁边会被看成号码
  quote: [
    { k: 'path', d: 'M42 40 H158 A18 18 0 0 1 176 58 V122 A18 18 0 0 1 158 140 H96 L62 174 V140 H42 A18 18 0 0 1 24 122 V58 A18 18 0 0 1 42 40 Z' },
    { k: 'line', x1: 86, y1: 72, x2: 78, y2: 108 },
    { k: 'line', x1: 122, y1: 72, x2: 114, y2: 108 },
  ],
  // 时钟：表盘 + 分针 + 时针
  clock: [
    { k: 'circle', cx: 100, cy: 100, r: 76 },
    { k: 'line', x1: 100, y1: 100, x2: 100, y2: 50 },
    { k: 'line', x1: 100, y1: 100, x2: 136, y2: 120 },
  ],
};

/** 图标本体。progress 0→1 依笔顺逐笔画出；progress=1 即完整静态图标（角标用）。 */
export const MotifGlyph: React.FC<{
  motif: ChapterMotif;
  size: number;
  color: string;
  progress?: number;
  strokeWidth?: number;
}> = ({ motif, size, color, progress = 1, strokeWidth = 9 }) => {
  const strokes = MOTIFS[motif];
  const n = strokes.length;
  const overlap = 0.35; // 下一笔在上一笔画到 65% 时起笔，读作「一气呵成」而不是逐段播放
  const span = 1 / (n - (n - 1) * overlap);
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ display: 'block', overflow: 'visible' }}>
      {strokes.map((s, i) => {
        const t0 = i * span * (1 - overlap);
        const p = seg(progress, t0, t0 + span, E.inOutCubic);
        if (p <= 0) return null; // 未起笔的笔画不渲染（圆头线帽在 offset=1 时会漏一个点）
        const common = {
          pathLength: 1,
          fill: 'none',
          stroke: color,
          strokeWidth,
          strokeLinecap: 'round' as const,
          strokeLinejoin: 'round' as const,
          strokeDasharray: '1 2',
          strokeDashoffset: 1 - p,
        };
        if (s.k === 'path') return <path key={i} d={s.d} {...common} />;
        if (s.k === 'line') return <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} {...common} />;
        // 圆的起笔点在 3 点钟方向，转到 12 点钟起笔更像手画
        return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} transform={`rotate(-90 ${s.cx} ${s.cy})`} {...common} />;
      })}
    </svg>
  );
};

const pad2 = (n: number) => String(Math.max(0, Math.round(n))).padStart(2, '0');

// ───────────────────────── 章节卡 ─────────────────────────

export type ChapterSlateProps = {
  /** 章节序号（显示为两位数）。 */
  index: number;
  title: string;
  motif: ChapterMotif;
  /** 章节色（#rrggbb）；不给则按 index 轮用 CHAPTER_PALETTE。 */
  color?: string;
  /** 本镜总帧数；退场擦除在 duration - exitFrames 起跑、末帧前擦净。 */
  duration: number;
  /** false = 不退场（留给下一镜自己做转场）。 */
  exit?: boolean;
  /** 色板开始上擦的帧。成片里 = 上一句 end 之后的气口起点。 */
  wipeAt?: number;
  wipeFrames?: number;
  /** 图标起笔帧 / 画完所需帧数。 */
  drawAt?: number;
  drawFrames?: number;
  /** 章节号、标题升起的帧（两者差 3–5f）。 */
  numberAt?: number;
  titleAt?: number;
  riseFrames?: number;
  exitFrames?: number;
};

/** 从一条看不见的遮罩线后升起：未到点时 translateY(105%) 被 overflow 裁掉 = 完全不可见。 */
const Rise: React.FC<{ p: number; pad?: number; children: React.ReactNode }> = ({ p, pad = 0, children }) => (
  <div style={{ overflow: 'hidden', padding: pad, margin: -pad, visibility: p <= 0 ? 'hidden' : 'visible' }}>
    <div style={{ transform: `translateY(${lerp(p, 105, 0)}%)` }}>{children}</div>
  </div>
);

export const ChapterSlateShot: React.FC<ChapterSlateProps> = ({
  index,
  title,
  motif,
  color,
  duration,
  exit = true,
  wipeAt = 0,
  wipeFrames = 10,
  drawAt = 7,
  drawFrames = 16,
  numberAt = 19,
  titleAt = 23,
  riseFrames = 9,
  exitFrames = 10,
}) => {
  const f = useCurrentFrame();
  const c = chapterColors(index, color);

  // 入场：色板上缘自下而上；退场：色板下缘继续自下而上——同一个行进方向，读作「一块板路过」
  const wipeIn = seg(f, wipeAt, wipeAt + wipeFrames, E.inOutCubic);
  const exitAt = duration - exitFrames;
  const wipeOut = exit ? seg(f, exitAt, duration - 1, E.inOutCubic) : 0;
  if (wipeIn <= 0 || wipeOut >= 1) return null;

  const draw = seg(f, drawAt, drawAt + drawFrames);
  const pNum = seg(f, numberAt, numberAt + riseFrames, E.outQuart);
  const pTitle = seg(f, titleAt, titleAt + riseFrames, E.outQuart);
  const push = slowPush(f, duration, 1, 1.03);
  // 退场时内容比色板下缘略快一步往上走，避免被擦除线「切字」的观感停留太久
  const lift = lerp(wipeOut, 0, -140);

  const left = SAFE.x + 36;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: c.bg,
        clipPath: `inset(${(1 - wipeIn) * 100}% 0 ${wipeOut * 100}% 0)`,
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, transform: `translateY(${lift}px) scale(${push})`, transformOrigin: `${left}px 900px` }}>
        <div style={{ position: 'absolute', left, top: 360 }}>
          <MotifGlyph motif={motif} size={340} color={c.ink} progress={draw} />
        </div>
        <div style={{ position: 'absolute', left: left - 8, top: 760 }}>
          <Rise p={pNum} pad={12}>
            <div
              style={{
                fontFamily: N.font,
                fontWeight: 800,
                fontSize: 320,
                lineHeight: 1,
                letterSpacing: -6,
                color: 'transparent',
                WebkitTextStroke: `9px ${c.ink}`,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {pad2(index)}
            </div>
          </Rise>
        </div>
        <div style={{ position: 'absolute', left, top: 1120, width: SAFE.w - 72 - 120 }}>
          <Rise p={pTitle}>
            <div style={{ fontFamily: N.font, fontWeight: 700, fontSize: 96, lineHeight: 1.22, color: c.ink }}>{title}</div>
          </Rise>
        </div>
      </div>
    </div>
  );
};

// ───────────────────────── 常驻角标 ─────────────────────────

/** 章节角标：图标 + 序号，约 124×60，直式左下（主内容安全区的左下角、字幕之上；右缘是平台按钮区）。
 * 静态件，不做入场——它跟着章节卡退场时露出的下一镜一起出现。 */
export const ChapterTag: React.FC<{ index: number; motif: ChapterMotif; color?: string; x?: number; y?: number }> = ({
  index,
  motif,
  color,
  x = SAFE.x,
  y = 1344,
}) => {
  const c = chapterColors(index, color);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 124,
        height: 60,
        boxSizing: 'border-box',
        padding: '0 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 8,
        background: c.bg,
      }}
    >
      <MotifGlyph motif={motif} size={40} color={c.ink} strokeWidth={16} />
      <div style={{ fontFamily: N.font, fontWeight: 800, fontSize: 34, lineHeight: 1, color: c.ink, fontVariantNumeric: 'tabular-nums' }}>
        {pad2(index)}
      </div>
    </div>
  );
};

// ───────────────────────── demo ─────────────────────────

const SLOT = 60; // 每章 60f：章节卡 50f + 露出「后续镜头 + 角标」10f，再被下一章的色板盖上
const SLATE = 50;
const DEMO: { title: string; motif: ChapterMotif; hue: number }[] = [
  { title: '發生了什麼', motif: 'pin', hue: 28 },
  { title: '證據', motif: 'magnifier', hue: 205 },
  { title: '影響', motif: 'ripple', hue: 150 },
];

export const CHAPTER_SLATE_DURATION = SLOT * DEMO.length; // 180f

export const ChapterSlate: React.FC = () => {
  const f = useCurrentFrame();
  // 底层在色板盖满之后（入场擦除 10f 完成）才换成本章的后续镜头，换底发生在色板背后，看不见
  const k = Math.min(DEMO.length - 1, Math.floor((f - 10) / SLOT));
  return (
    <NarrationStage>
      {/* 底层 = 该章的后续镜头（占位实拍）+ 常驻角标；章节卡擦走后露出，直到下一章色板盖上。
          第一章之前是空底（N.bg） */}
      {k >= 0 ? (
        <>
          <FakeClip hue={DEMO[k].hue} />
          <ChapterTag index={k + 1} motif={DEMO[k].motif} />
        </>
      ) : null}
      {DEMO.map((d, i) => (
        <Sequence key={i} from={i * SLOT} durationInFrames={SLOT} layout="none">
          <ChapterSlateShot index={i + 1} title={d.title} motif={d.motif} duration={SLATE} />
        </Sequence>
      ))}
    </NarrationStage>
  );
};
