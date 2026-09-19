// 推页叠卡（sheet-push）—— page-turn-transitions 的「取代」式（2026-09 改版，取代 barn-door-split 对开门）。
// 旧页缩到 0.9、上移、压暗、四角变圆，像被推到后面；新页像 iOS 底部卡片从下方推上来盖住它，
// 落定前最后几帧圆角收回、变回满版——暗示「新的取代旧的」。与 photo-drift-stack 的叠卡推入是同一套语言。
// 以画幅比例计算，横式直式都能用；from / to 是任意满版内容。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { FakeDashboard, G, TitleBlock } from '../../_fixtures/Fixtures';

export const SHEET_PUSH_DURATION = 140; // 30f 建立 + 26f 换页 + 84f 收尾

export type SheetPushProps = {
  from: React.ReactNode;
  to: React.ReactNode;
  /** 换页开始帧。前后都要有 ≥ 30f 静止。 */
  at?: number;
  /** 换页帧数。 */
  frames?: number;
  /** 旧页被推到后面时缩到的倍率。 */
  backScale?: number;
  backdrop?: string;
};

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export const SheetPushShot: React.FC<SheetPushProps> = ({ from, to, at = 30, frames = 26, backScale = 0.9, backdrop = '#06070a' }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = easeInOutCubic(clamp01((f - at) / frames));
  const R = Math.min(width, height) * 0.045;
  // 新页的上缘圆角在推入最后 30% 收回
  const settle = clamp01((f - at - frames * 0.7) / (frames * 0.4));
  const topR = mix(R, 0, settle);
  return (
    <AbsoluteFill style={{ background: backdrop, overflow: 'hidden' }}>
      {t < 1 ? (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: R * t, transform: `translateY(${-height * 0.02 * t}px) scale(${mix(1, backScale, t)})`, filter: t > 0.01 ? `brightness(${mix(1, 0.45, t)})` : undefined }}>{from}</div>
      ) : null}
      {t > 0 ? (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: `${topR}px ${topR}px 0 0`, transform: `translateY(${(1 - t) * height * 1.02}px)`, boxShadow: t < 1 ? `0 -20px 60px rgba(0,0,0,0.5)` : undefined }}>{to}</div>
      ) : null}
    </AbsoluteFill>
  );
};

export const SheetPush: React.FC = () => (
  <div style={{ width: 1920, height: 1080, background: G.bg, position: 'relative', overflow: 'hidden' }}>
    <SheetPushShot from={<FakeDashboard variant="A" />} to={<FakeDashboard variant="B" />} />
    <div style={{ position: 'absolute', left: 120, top: 60 }}>
      <TitleBlock text="SHEET PUSH" size={54} />
    </div>
  </div>
);
