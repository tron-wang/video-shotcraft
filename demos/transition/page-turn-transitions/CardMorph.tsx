// 卡片形变（card-morph）—— page-turn-transitions 的「并列」式（2026-09 改版，取代 cube-rotate 立方体翻转）。
// 旧页缩成圆角卡往左滑出，新页以同样的圆角卡从右边滑进来，再展开回满版：两页像同一条轨道上并排的两张卡，
// 暗示「同级、并列」。缩放与圆角按 sin(πt) 在换页中段最大，位移用 easeInOutCubic——首尾都是满版静止。
// 以画幅比例计算，横式直式都能用；from / to 是任意满版内容。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { FakeDashboard, G, TitleBlock } from '../../_fixtures/Fixtures';

export const CARD_MORPH_DURATION = 140; // 30f 建立 + 26f 换页 + 84f 收尾

export type CardMorphProps = {
  from: React.ReactNode;
  to: React.ReactNode;
  /** 换页开始帧。前后都要有 ≥ 30f 静止。 */
  at?: number;
  /** 换页帧数。 */
  frames?: number;
  /** 换页中段缩到的倍率。 */
  shrinkTo?: number;
  /** 两张卡后面的底色。 */
  backdrop?: string;
};

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export const CardMorphShot: React.FC<CardMorphProps> = ({ from, to, at = 30, frames = 26, shrinkTo = 0.78, backdrop = '#06070a' }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = clamp01((f - at) / frames);
  const s = Math.sin(Math.PI * t); // 中段最小、最圆
  const x = easeInOutCubic(t);
  const r = Math.min(width, height) * 0.055 * s;
  const card = (slot: 0 | 1): React.CSSProperties => ({
    position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: r,
    // 间距：满版静止时 = 整个画面宽（邻页完全在画外），中段缩小时收到 86%
    transform: `translateX(${(slot - x) * width * mix(1, 0.86, s)}px) scale(${mix(1, shrinkTo, s)})`,
    boxShadow: s > 0.01 ? `0 ${30 * s}px ${80 * s}px rgba(0,0,0,${0.5 * s})` : undefined,
  });
  return (
    <AbsoluteFill style={{ background: backdrop, overflow: 'hidden' }}>
      {t < 1 ? <div style={card(0)}>{from}</div> : null}
      <div style={card(1)}>{to}</div>
    </AbsoluteFill>
  );
};

export const CardMorph: React.FC = () => (
  <div style={{ width: 1920, height: 1080, background: G.bg, position: 'relative', overflow: 'hidden' }}>
    <CardMorphShot from={<FakeDashboard variant="A" />} to={<FakeDashboard variant="B" />} />
    <div style={{ position: 'absolute', left: 120, top: 60 }}>
      <TitleBlock text="CARD MORPH" size={54} />
    </div>
  </div>
);
