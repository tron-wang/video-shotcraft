// cube-navigation — 横向滑轨逐面导航（2026-09 改版；卡名沿用）
// 3–6 个板块排成一列大卡。每次换面：整列先缩小拉远（看得到左右邻居＝「我在整体的哪一块」），
// 平移到下一张，再推近到满版读内容——像手机的 App 切换器。换面之间 hold 读面；下方进度点跟着走。
// （旧版：内容贴 3D 立方体六面、相机特写 ↔ 等轴交替，读起来是十年前的简报风；
//   使用者从「横向滑轨 / 纵深堆叠 / 便当格总览 / 推页视差」四案里选了横向滑轨。）
// 以画幅比例排版，横式、直式都能用；时间点都是 props（帧号）。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

export const CUBE_NAVIGATION_DURATION = 180; // 6s @30fps

export type RailPanel = {
  /** 板块编号 / 小标（强调色），例：'01'。 */
  label?: string;
  /** 板块标题（≤ 4 字最好）。 */
  title?: string;
  /** 标题下一行说明。 */
  sub?: string;
  /** 自带内容（截图、UI）；给了就不画预设版面，需自行铺满父层。 */
  content?: React.ReactNode;
};

export type CubeNavigationProps = {
  panels: RailPanel[];
  /** 每次换面开始的帧（长度 = 板块数 − 1）；不给则在镜头内平均分配。 */
  stepAt?: number[];
  /** 换面用几帧（拉远 → 平移 → 推近一气呵成）。 */
  moveFrames?: number;
  /** 换面中段拉远到的倍率（越小看到的邻居越多）。 */
  pullTo?: number;
  /** 显示下方进度点。 */
  dots?: boolean;
  bg?: string;
  accent?: string;
};

// ───────── 几何与手感常量（蒙皮时不动）─────────
const PANEL_ASPECT = 880 / 1180; // 直式大卡的宽高比
const MAX_W = 0.815; // 卡宽最多占画面宽
const MAX_H = 0.615; // 卡高最多占画面高
const GAP = 70 / 880; // 卡与卡的间距（以卡宽计）
const DIM_NEIGHBOR = 0.55; // 邻居卡亮度
const RADIUS = 36 / 880;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** 预设版面：深色卡 + 右上金色光晕 + 编号 / 标题 / 说明 / 三条信息条 / 底部强调线（以 880 宽设计，按卡宽等比）。 */
const DefaultPanel: React.FC<{ p: RailPanel; w: number; h: number; accent: string }> = ({ p, w, h, accent }) => {
  const u = w / 880;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #1a1b20 0%, #121317 60%, #1d1810 100%)', fontFamily: '"PingFang TC", "Noto Sans TC", sans-serif', color: '#f2f0ea', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', right: -60 * u, top: -80 * u, width: 420 * u, height: 420 * u, borderRadius: '50%', background: 'radial-gradient(circle, rgba(224,176,75,0.28), transparent 70%)' }} />
      {p.label ? <div style={{ position: 'absolute', left: 64 * u, top: 70 * u, fontSize: 34 * u, letterSpacing: 6 * u, color: accent, fontWeight: 800 }}>{p.label}</div> : null}
      {p.title ? <div style={{ position: 'absolute', left: 64 * u, top: 120 * u, fontSize: 130 * u, fontWeight: 900, whiteSpace: 'nowrap' }}>{p.title}</div> : null}
      {p.sub ? <div style={{ position: 'absolute', left: 64 * u, top: 300 * u, fontSize: 40 * u, color: 'rgba(242,240,234,0.7)', whiteSpace: 'nowrap' }}>{p.sub}</div> : null}
      {[620, 520, 580].map((bw, k) => <div key={k} style={{ position: 'absolute', left: 64 * u, top: (420 + k * 70) * u, width: bw * u, height: 18 * u, borderRadius: 9 * u, background: 'rgba(242,240,234,0.10)' }} />)}
      <div style={{ position: 'absolute', left: 64 * u, top: h - 76 * u, width: 140 * u, height: 6 * u, borderRadius: 3 * u, background: accent }} />
    </div>
  );
};

export const CubeNavigationShot: React.FC<CubeNavigationProps> = ({
  panels, stepAt, moveFrames = 26, pullTo = 0.62, dots = true, bg = '#0e1116', accent = '#e0b04b',
}) => {
  const f = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const n = panels.length;
  // 平均分配：首尾各留一段 hold
  const steps = stepAt ?? Array.from({ length: n - 1 }, (_, i) => Math.round(((i + 1) * durationInFrames) / n - moveFrames / 2));

  const w = Math.min(width * MAX_W, height * MAX_H * PANEL_ASPECT);
  const h = w / PANEL_ASPECT;
  const x0 = (width - w) / 2;
  const y0 = (height - h) / 2 - height * 0.03;
  const gap = w * GAP;

  // 连续的「现在在第几张」与换面中段的「拉远量」
  const q = steps.reduce((a, s) => a + easeInOutCubic(clamp01((f - s) / moveFrames)), 0);
  const pull = Math.max(0, ...steps.map((s) => Math.sin(Math.PI * clamp01((f - s) / moveFrames))));
  const z = mix(1, pullTo, pull);

  return (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${z})`, transformOrigin: `${width / 2}px ${y0 + h / 2}px` }}>
        {panels.map((p, i) => {
          const d = Math.abs(i - q);
          if (d > 2.2) return null;
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: x0 + (i - q) * (w + gap), top: y0, width: w, height: h,
                borderRadius: w * RADIUS, overflow: 'hidden', border: `1.5px solid ${accent}47`,
                filter: `brightness(${mix(1, DIM_NEIGHBOR, clamp01(d))})`,
              }}
            >
              {p.content ?? <DefaultPanel p={p} w={w} h={h} accent={accent} />}
            </div>
          );
        })}
      </div>
      {dots ? (
        <div style={{ position: 'absolute', left: 0, right: 0, top: y0 + h + height * 0.035, display: 'flex', justifyContent: 'center', gap: w * 0.018 }}>
          {panels.map((_, i) => {
            const a = clamp01(1 - Math.abs(q - i));
            const u = w / 880;
            return <div key={i} style={{ width: mix(12, 44, a) * u, height: 12 * u, borderRadius: 6 * u, background: a > 0.5 ? accent : 'rgba(242,240,234,0.3)' }} />;
          })}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// demo：四个板块、三次换面
export const CubeNavigation: React.FC = () => (
  <CubeNavigationShot
    stepAt={[36, 84, 132]}
    panels={[
      { label: '01', title: '背景', sub: '金磚峰會 9/12 開幕' },
      { label: '02', title: '證據', sub: '耳機故障的現場畫面' },
      { label: '03', title: '反轉', sub: '真正暫停活動的是誰' },
      { label: '04', title: '結論', sub: '依原訂行程 9/13 離開' },
    ]}
  />
);
