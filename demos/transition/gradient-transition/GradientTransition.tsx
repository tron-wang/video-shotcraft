// gradient-transition — 流体光晕动态背景（2026-09 改版）
// 给「没有主体运动」的段落（章节页、纯文字、数字卡的底）垫一层持续、滑顺的低速能量：
// 四团光晕（预设黑底 + 深浅不同的金 / 琥珀）固定在一个超大层上，整层极缓地漂、转、放大；
// 每团光晕再各自走一段错相位移，外加一层「呼吸」起伏。重模糊 + screen 混色，叠起来是加光不是变脏；静态颗粒消色阶。
// 滑顺原则（参考 Stripe / aurora 类背景）：只做小幅 transform、一个镜头只走半个来回（easeInOutSine 头尾放缓）、
// 不等速、不循环跳回、颗粒不逐帧换。
// （旧版：linear → radial → conic 彩虹三段轮换，读起来花俏；使用者从四个背景方案 + 四种黑金配置里选了「多层琥珀」。）
// 以百分比排版，横式、直式都能用；children 叠在背景之上。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

export const GRADIENT_TRANSITION_DURATION = 180; // 6s @30fps

export type GradientTransitionProps = {
  /** 四团光晕的颜色：[主光, 中调, 深调, 高光]。预设黑金琥珀。rgba 的 alpha 就是亮度。 */
  colors?: [string, string, string, string];
  /** 底色。 */
  bg?: string;
  /** 光晕模糊半径（px，以 1080 宽为准，随画幅等比）。 */
  blur?: number;
  /** 静态颗粒不透明度，0 关闭。 */
  grain?: number;
  /** 运动幅度倍率：1 = 使用者定稿的速度；0.5 更安静、1.5 更活泼（> 1.6 会开始抢前景）。 */
  intensity?: number;
  /** 半个来回走完的帧数，预设 = 本镜长度。镜头很长（> 10s）时给 300 左右，避免变化太慢。 */
  duration?: number;
  children?: React.ReactNode;
};

const GOLD: [string, string, string, string] = [
  'rgba(224,176,75,0.60)', // 主光：金
  'rgba(196,140,50,0.55)', // 中调：琥珀
  'rgba(120,84,30,0.60)', // 深调：暗琥珀
  'rgba(240,205,130,0.25)', // 高光：浅金
];
// 光晕布局（百分比）：位置、直径、在半个来回里要走的位移
const LAYOUT = [
  { x: 26, y: 26, r: 58, dx: 12, dy: 9 },
  { x: 76, y: 50, r: 64, dx: -9, dy: 12 },
  { x: 34, y: 82, r: 70, dx: 9, dy: -9 },
  { x: 82, y: 16, r: 36, dx: -12, dy: 6 },
];

const easeInOutSine = (t: number) => -(Math.cos(Math.PI * Math.min(1, Math.max(0, t))) - 1) / 2;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export const GradientTransitionBg: React.FC<GradientTransitionProps> = ({
  colors = GOLD, bg = '#0b0c0f', blur = 110, grain = 0.14, intensity = 1, duration, children,
}) => {
  const f = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const D = duration ?? durationInFrames;
  const p = easeInOutSine(f / D);
  // 呼吸：整段一个完整正弦周期、再乘半个正弦包络——首尾接近静止，中段多一点摆动
  const breathe = (amp: number, phase = 0) => amp * intensity * Math.sin((2 * Math.PI * f) / D + phase) * Math.sin((Math.PI * f) / D);
  const k = intensity;
  const px = Math.max(width, height) / 1920; // 模糊按画幅等比（设计值以 1080×1920 为准）

  return (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute', inset: '-25%', filter: `blur(${blur * px}px) saturate(1.1)`,
          transform: `translate(${mix(-5, 5, p) * k + breathe(2)}%, ${mix(4, -4, p) * k + breathe(2, 1.5)}%) rotate(${mix(-10, 10, p) * k}deg) scale(${1 + 0.14 * k * p})`,
        }}
      >
        {LAYOUT.map((b, i) => (
          <div
            key={i}
            style={{
              position: 'absolute', left: `${b.x + b.dx * k * p + breathe(4, i)}%`, top: `${b.y + b.dy * k * p + breathe(4, i + 2)}%`,
              // 直径按短边算：横式画幅下光晕不会大到盖满整个画面、吃掉黑底
              width: (b.r / 100) * Math.min(width, height) * 1.5, aspectRatio: '1', borderRadius: '50%', transform: 'translate(-50%,-50%)',
              background: `radial-gradient(circle, ${colors[i]} 0%, transparent 70%)`, mixBlendMode: 'screen',
            }}
          />
        ))}
      </div>
      {grain > 0 ? (
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: grain, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
          <filter id="gt-grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={3} stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
          <rect width="100%" height="100%" filter="url(#gt-grain)" />
        </svg>
      ) : null}
      {children}
    </AbsoluteFill>
  );
};

// demo：黑金流体光晕上叠一行章节标题（示意前景）
export const GradientTransition: React.FC = () => {
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  return (
    <GradientTransitionBg>
      <div style={{ position: 'absolute', left: '8%', top: '44%', fontFamily: '"PingFang TC", "Noto Sans TC", sans-serif', color: '#f2f0ea' }}>
        <div style={{ fontSize: 30 * u, letterSpacing: 6 * u, color: '#e0b04b', fontWeight: 700 }}>CHAPTER 02</div>
        <div style={{ fontSize: 96 * u, fontWeight: 900, marginTop: 10 * u }}>證據在哪裡</div>
      </div>
    </GradientTransitionBg>
  );
};
