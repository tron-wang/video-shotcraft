// card-flock-stand —— card-flock-tumble 的「前半段」独立款（2026-09，使用者：「前半段特效我喜欢」）
// 三张页卡从侧棱薄边 3D 翻飞成阶梯站定（与完整版同一条 Catmull-Rom 样条、同一组关键姿态），
// 站定后一直低角速度慢转到镜头结束——没有吸入、烟雾环、巨字。黑金配色：深色页卡 + 金色强调，
// 背景描边大字改成低调的金色细描边（文字可换）。适合口播片：几个页面 / 几份文件「摊开给你看」。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';
import { CARDS, FLIGHT, WALL_UP, splinePose } from './CardFlockTumble';

export const CARD_FLOCK_STAND_DURATION = 100; // 3.3s：翻飞 ~1.5s + 慢转 ~1.5s

const GOLD = '#e0b04b';
const FONT = '"Avenir Next", Futura, "Helvetica Neue", "PingFang TC", sans-serif';

export type CardFlockStandProps = {
  /** 三张页卡的标题（由后往前）。 */
  titles?: [string, string, string];
  /** 三张页卡的自带内容（截图 / UI，560×400）；给了就不画预设版面。 */
  cards?: [React.ReactNode, React.ReactNode, React.ReactNode];
  /** 背景描边大字；传空字串关闭。 */
  wallText?: string;
  /** 站定后慢转的角速度倍率（1 = 与完整版相同）。 */
  spin?: number;
};

/** 背景：三排金色细描边斜体大字，奇偶排反向缓慢平移，四周压暗。 */
const GoldWall: React.FC<{ frame: number; text: string }> = ({ frame, text }) => {
  const up = interpolate(frame, [WALL_UP[0], WALL_UP[1]], [0.12, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const drift = frame * 2.0;
  return (
    <AbsoluteFill style={{ overflow: 'hidden', opacity: up }}>
      {[0, 1, 2].map((row) => (
        <div key={row} style={{ position: 'absolute', top: -140 + row * 380, left: 0, whiteSpace: 'nowrap', fontFamily: FONT, fontWeight: 800, fontStyle: 'italic', fontSize: 330, letterSpacing: 6, transform: `translateX(${(row % 2 === 0 ? -1 : 1) * drift - 600}px)` }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ marginRight: 70, color: 'transparent', WebkitTextStroke: `3px ${GOLD}`, opacity: i % 2 === 0 ? 0.32 : 0.18 }}>{text}</span>
          ))}
        </div>
      ))}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.78) 85%)' }} />
    </AbsoluteFill>
  );
};

/** 深色页卡（与完整版同尺寸 560×400）：侧栏 + 标题 + 列表行，强调色金。 */
const DarkCard: React.FC<{ seed: number; title: string }> = ({ seed, title }) => (
  <div style={{ width: 560, height: 400, background: '#16181d', borderRadius: 14, border: '1.5px solid rgba(224,176,75,0.35)', boxShadow: '0 0 50px rgba(224,176,75,0.12), 0 22px 60px rgba(0,0,0,0.6)', display: 'flex', overflow: 'hidden' }}>
    <div style={{ width: 128, background: '#101216', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 14, height: 14, borderRadius: 4, background: GOLD }} />
        <div style={{ height: 8, width: 52, background: '#3a3d44', borderRadius: 4 }} />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ height: 7, width: `${52 + ((i * 31 + seed * 17) % 42)}%`, background: '#2a2d33', borderRadius: 4 }} />
      ))}
    </div>
    <div style={{ flex: 1, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 26, color: '#f2f0ea' }}>{title}</div>
      <div style={{ height: 10, width: '58%', background: '#2a2d33', borderRadius: 5 }} />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 11, height: 11, borderRadius: '50%', background: GOLD, opacity: [0.9, 0.55, 0.3][(i + seed) % 3] }} />
          <div style={{ height: 8, width: `${78 - ((i * 23 + seed * 29) % 40)}%`, background: '#2a2d33', borderRadius: 4 }} />
        </div>
      ))}
      <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
        <div style={{ width: 74, height: 22, background: GOLD, opacity: 0.85, borderRadius: 6 }} />
        <div style={{ width: 46, height: 22, background: '#2a2d33', borderRadius: 6 }} />
      </div>
    </div>
  </div>
);

export const CardFlockStandShot: React.FC<CardFlockStandProps> = ({ titles, cards, wallText = 'FASTER', spin = 1 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: '#0b0c0f' }}>
      {wallText ? <GoldWall frame={frame} text={wallText} /> : null}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', perspective: 1400 }}>
        {CARDS.map((c, i) => {
          // 站定后慢转不停（与完整版同一公式：平方缓入避免与样条衔接顿挫），一直转到镜头结束
          const t = frame - FLIGHT[1] * 0.86;
          const ramp = t > 0 ? Math.min(1, t / 14) ** 2 : 0;
          const drift = t > 0 ? { ry: t * 0.34 * ramp * spin, rx: t * -0.1 * ramp * spin, rz: t * 0.05 * ramp * spin } : { ry: 0, rx: 0, rz: 0 };
          const raw = Math.min(1, Math.max(0, (frame - FLIGHT[0]) / (FLIGHT[1] - FLIGHT[0])));
          const base = frame < FLIGHT[0] ? c.k[0] : splinePose(c.k, Easing.out(Easing.cubic)(raw));
          const pose = { ...base, ry: base.ry + drift.ry, rx: base.rx + drift.rx, rz: base.rz + drift.rz };
          return (
            <div key={i} style={{ position: 'absolute', transform: `translate3d(${pose.x}px, ${pose.y}px, 0) rotateX(${pose.rx}deg) rotateY(${pose.ry}deg) rotateZ(${pose.rz}deg) scale(${pose.s})`, zIndex: 10 + i }}>
              {cards?.[i] ?? <DarkCard seed={i} title={titles?.[i] ?? c.title} />}
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const CardFlockStand: React.FC = () => <CardFlockStandShot />;
