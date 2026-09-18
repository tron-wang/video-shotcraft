// 口播模式（narration）系 demo 的公共件：直式设计舞台、中性配色、假新闻长页、假实拍素材。
// demo 只求把运动演清楚，内容全部虚构；进片时依 narration-mode.md 的蒙皮契约换皮
// （颜色 / 字体 / 圆角 / 材质可换；时序 / 缓动 / 几何比例 / 层级不换）。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

/** 中性皮。进片时整组换成 src/theme.ts 的 token。 */
export const N = {
  bg: '#101216',
  paper: '#f6f4ef',
  ink: '#1d1d1f',
  inkSoft: '#5c5c60',
  line: '#d9d6cf',
  bar: '#c9c6bf',
  accent: '#e0b04b',
  accent2: '#5b8cff',
  plate: 'rgba(16,18,22,0.82)',
  onDark: '#f2f0ea',
  font: '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif',
  serif: '"Songti TC", "Noto Serif TC", serif',
};

export const STAGE = { w: 1080, h: 1920 };
/** 直式主内容安全区（字幕 y≈1480 在其下；右缘留给平台按钮）。 */
export const SAFE = { x: 60, y: 150, w: 960, h: 1270 };

/** 直式 1080×1920 设计坐标舞台。合成是横式时等比缩到满高、置中，两侧铺暗底——
 * 同一份参数表在直式成片与横式样片里数值一致。 */
export const NarrationStage: React.FC<{ bg?: string; children: React.ReactNode }> = ({ bg = N.bg, children }) => {
  const { width, height } = useVideoConfig();
  const scale = Math.min(width / STAGE.w, height / STAGE.h);
  return (
    <AbsoluteFill style={{ background: '#08090b' }}>
      <div
        style={{
          position: 'absolute',
          left: (width - STAGE.w * scale) / 2,
          top: (height - STAGE.h * scale) / 2,
          width: STAGE.w,
          height: STAGE.h,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          overflow: 'hidden',
          background: bg,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

// ───────────────────────── 假新闻长页 ─────────────────────────
// 几何写死成常量，等同 capture-page.mjs 产出的 boxes.json：demo 用这些矩形当「机器实测坐标」。

export const PAGE = { w: 1080, h: 3600, padX: 84, lineH: 62, fontSize: 38 };

export type Box = { key: string; x: number; y: number; w: number; h: number };

const PARAS: { y: number; lines: string[] }[] = [
  { y: 760, lines: ['本週一開放報名的夜間課程，', '不到兩個小時名額就全數額滿，', '候補名單超過四百人。'] },
  { y: 1020, lines: ['主辦單位表示，這是開課三年來', '第一次出現排隊人潮，', '現場隊伍一路延伸到校門口。'] },
  { y: 1640, lines: ['根據官方統計，今年報名人數', '比去年同期成長百分之四十一，', '其中七成是第一次參加的新生。'] },
  { y: 1900, lines: ['「我們沒有預期到這樣的反應，」', '負責人在受訪時這樣說，', '「下一期會把名額加倍。」'] },
  { y: 2520, lines: ['分析指出，年輕族群對於實用技能', '的需求持續升高，', '相關課程的搜尋量創下新高。'] },
  { y: 2780, lines: ['下一期課程預計十一月開放，', '主辦單位提醒，', '報名前請先完成線上資格審核。'] },
];

const charW = PAGE.fontSize; // 全形字等宽估算
const lineBox = (key: string, p: number, l: number): Box => ({
  key, x: PAGE.padX, y: PARAS[p].y + l * PAGE.lineH, w: PARAS[p].lines[l].length * charW, h: PAGE.lineH - 10,
});

/** 兴趣点（同 boxes.json 的 boxes）。 */
export const PAGE_BOXES = {
  headline: { key: 'headline', x: PAGE.padX, y: 250, w: 912, h: 190 } as Box,
  hero: { key: 'hero', x: PAGE.padX, y: 1230, w: 912, h: 340 } as Box,
  keyLine: lineBox('keyLine', 2, 1), // 「比去年同期成長百分之四十一，」
  quoteLine: lineBox('quoteLine', 3, 0),
  chart: { key: 'chart', x: PAGE.padX, y: 2110, w: 912, h: 340 } as Box,
  lastLine: lineBox('lastLine', 5, 0),
};

const Placeholder: React.FC<{ box: Box; label: string }> = ({ box, label }) => (
  <div
    style={{
      position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: 10,
      background: `repeating-linear-gradient(135deg, ${N.line} 0 22px, ${N.bar} 22px 44px)`,
      display: 'flex', alignItems: 'flex-end', padding: 18, boxSizing: 'border-box',
      color: N.inkSoft, fontFamily: N.font, fontSize: 24,
    }}
  >
    {label}
  </div>
);

/** 假新闻页（1080×3600）。放进自己的相机容器里移动；坐标系原点在页面左上。 */
export const FakeArticle: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: PAGE.w, height: PAGE.h, background: N.paper, ...style }}>
    <div style={{ position: 'absolute', left: 0, top: 0, width: PAGE.w, height: 120, borderBottom: `2px solid ${N.line}`, display: 'flex', alignItems: 'center', padding: `0 ${PAGE.padX}px`, boxSizing: 'border-box', gap: 18 }}>
      <div style={{ width: 44, height: 44, borderRadius: 8, background: N.ink }} />
      <div style={{ fontFamily: N.serif, fontSize: 40, fontWeight: 700, color: N.ink }}>每日新聞</div>
      <div style={{ marginLeft: 'auto', height: 14, width: 220, borderRadius: 7, background: N.line }} />
    </div>
    <div style={{ position: 'absolute', left: PAGE.padX, top: 180, fontFamily: N.font, fontSize: 26, color: N.accent2, fontWeight: 600 }}>教育 · 焦點</div>
    <div style={{ position: 'absolute', left: PAGE_BOXES.headline.x, top: PAGE_BOXES.headline.y, width: PAGE_BOXES.headline.w, fontFamily: N.serif, fontSize: 76, lineHeight: 1.25, fontWeight: 700, color: N.ink }}>
      夜間課程兩小時額滿　排隊人潮延伸到校門口
    </div>
    <div style={{ position: 'absolute', left: PAGE.padX, top: 480, fontFamily: N.font, fontSize: 26, color: N.inkSoft }}>記者 王小明 ｜ 2026 年 9 月 18 日</div>
    <div style={{ position: 'absolute', left: PAGE.padX, top: 560, width: 912, height: 2, background: N.line }} />
    <div style={{ position: 'absolute', left: PAGE.padX, top: 600, width: 912, fontFamily: N.font, fontSize: 32, lineHeight: 1.6, color: N.inkSoft }}>
      一堂原本冷門的夜間課程，今年突然成為全校最難搶的名額。
    </div>
    {PARAS.map((p, k) => (
      <div key={k} style={{ position: 'absolute', left: PAGE.padX, top: p.y, fontFamily: N.font, fontSize: PAGE.fontSize, lineHeight: `${PAGE.lineH}px`, color: N.ink, whiteSpace: 'nowrap' }}>
        {p.lines.map((l, i) => (
          <div key={i} style={{ height: PAGE.lineH }}>{l}</div>
        ))}
      </div>
    ))}
    <Placeholder box={PAGE_BOXES.hero} label="圖：現場排隊人潮（示意）" />
    <Placeholder box={PAGE_BOXES.chart} label="圖表：近三年報名人數（示意）" />
    <div style={{ position: 'absolute', left: PAGE.padX, top: 3080, width: 912, height: 2, background: N.line }} />
    {[0, 1, 2].map((k) => (
      <div key={k} style={{ position: 'absolute', left: PAGE.padX, top: 3140 + k * 120, width: 912, height: 90, borderRadius: 10, background: '#eceae4' }} />
    ))}
  </div>
);

// ───────────────────────── 假实拍素材 ─────────────────────────

/** 没有 mp4 时的占位「影片」：缓慢移动的渐层与光斑，逐帧确定性。进片时换成
 * <OffthreadVideo> / ClipCard。 */
export const FakeClip: React.FC<{ hue?: number; style?: React.CSSProperties }> = ({ hue = 28, style }) => {
  const f = useCurrentFrame();
  const drift = f * 0.35;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: `hsl(${hue} 35% 14%)`, ...style }}>
      <div style={{ position: 'absolute', inset: '-20%', background: `radial-gradient(60% 45% at ${38 + Math.sin(f / 70) * 8}% ${40 + drift * 0.05}%, hsl(${hue} 80% 58% / .85), transparent 70%), radial-gradient(50% 40% at ${70 - Math.cos(f / 90) * 6}% 72%, hsl(${hue + 150} 55% 40% / .7), transparent 70%)` }} />
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <div key={k} style={{ position: 'absolute', left: `${12 + k * 15}%`, top: `${64 + Math.sin((f + k * 40) / 50) * 3}%`, width: 90, height: `${18 + ((k * 37) % 14)}%`, borderRadius: 8, background: `hsl(${hue} 20% ${8 + k * 2}% / .9)` }} />
      ))}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 55%, rgba(0,0,0,.55))' }} />
    </div>
  );
};

/** 每镜一条极缓缩放：1.00 → 1.04（或反向）。口播片段内画面的「活」只来自这个。 */
export const slowPush = (frame: number, duration: number, from = 1, to = 1.04) =>
  from + (to - from) * Math.min(1, Math.max(0, frame / Math.max(1, duration - 1)));
