// neon-frame-forerun-orbit v5（批次 14 #1）。用户意见（逐字）：
// "这个应该是所有组件和文字同时从空中往下贴合"
// ——单点修正：v4 的错峰贴落改为**所有组件和文字同时**从空中往下贴合
// （同帧起落、同帧贴合，同形软影同步收敛）。判例：整体登场镜=同时贴合，
// 错峰是巡礼镜的语法。镜头视角 rotateY 从左侧(+38°) 连续弧线旋到右侧(-26°)。
// 2026-09 黑金改版（使用者从「金线描框＋整页落定 / 光扫揭幕 / 分层浮起 / 浏览器框落定」选了 A）：
// 紫橘霓虹渐变框 → 细金线框、紫色光晕 → 淡金光晕、灰面板 → 深色面板（强调色金）、拿掉背景霓虹管框群；
// 镜头弧线、描框节奏、同时贴落全部不动。
import React, { useId } from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';

const easeFall = Easing.bezier(0.5, 0.05, 0.6, 1); // 加速下落、末端软着陆

/* 悬浮 + 同形软影（对标批次11 GrazeFaceTour FloatWrap）：
 * h=悬浮高度(px)。本体向左上抬起，原位留模糊压暗同形影，h→0 重合影消失 */
const FloatWrap: React.FC<{ h: number; children: React.ReactNode }> = ({ h, children }) => (
  <div style={{ position: 'relative' }}>
    {h > 1 && (
      <div style={{
        position: 'absolute', inset: 0,
        transform: `translate(${h * 0.26}px, ${h * 0.48}px) scale(${1 + h * 0.0012})`,
        filter: `blur(${2.5 + h * 0.09}px) brightness(0.32) saturate(0.4)`,
        opacity: Math.min(0.4, 0.16 + h * 0.005),
        pointerEvents: 'none',
      }}>{children}</div>
    )}
    <div style={{ transform: `translate(${-h * 0.36}px, ${-h * 0.82}px)` }}>{children}</div>
  </div>
);

/* v5：所有组件和文字**同时**从空中往下贴合——统一 land 时刻 LAND，
 * 同帧起落（t=LAND-FALL）、同帧贴合（t=LAND），软影同步收敛；
 * 各组件仅悬浮高度 H 略有差异（同窗下落，速度随高度自然区分） */
const LAND = 0.52;
const liftOf = (t: number, land: number, H: number) => {
  const FALL = 0.3;
  const p = Math.min(1, Math.max(0, (t - (LAND - FALL)) / FALL));
  return (1 - easeFall(p)) * H;
};

const ink = '#e0b04b'; // 强调块（logo 等）用金
const mid = '#5a5d64';
const line = '#2a2d33';
const GOLD = '#e0b04b';

const PW = 1330;
const PH = 900;
const PL = 1000;

const FRAME_D = `M 0 ${PH / 2} L 0 0 L ${PW} 0 L ${PW} ${PH} L 0 ${PH} Z`;

const Chip: React.FC<{ w: number }> = ({ w }) => (
  <div style={{
    width: w, height: 74, background: '#1b1d23', border: `2px solid ${line}`,
    borderRadius: 10, padding: '12px 14px', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', gap: 9,
  }}>
    <div style={{ height: 11, width: '70%', background: '#3a3d44', borderRadius: 5 }} />
    <div style={{ height: 9, width: '48%', background: line, borderRadius: 5 }} />
  </div>
);

/* 与 v3 同款灰面板；t=贴落进程，各组件错峰空中贴落（重叠并行） */
const GrayHome: React.FC<{ t?: number }> = ({ t = 1 }) => {
  const L = (land: number, H = 72) => liftOf(t, land, H * 1.7);
  return (
  <div style={{ width: PW, height: PH, background: '#14161b', borderRadius: 6, display: 'flex', overflow: 'hidden', boxSizing: 'border-box' }}>
    <div style={{ width: 290, borderRight: `2px solid ${line}`, padding: '26px 24px', boxSizing: 'border-box' }}>
      <FloatWrap h={L(0.24, 84)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: ink }} />
          <div style={{ height: 15, width: 88, background: ink, borderRadius: 7 }} />
        </div>
      </FloatWrap>
      {[76, 56, 96, 110, 66, 60].map((w, i) => (
        <FloatWrap key={i} h={L(0.3 + i * 0.045, 66)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, height: 34 }}>
            <div style={{ width: 17, height: 17, borderRadius: 5, background: mid }} />
            <div style={{ height: 10, width: w, background: '#34373e', borderRadius: 5 }} />
          </div>
        </FloatWrap>
      ))}
      <FloatWrap h={L(0.56, 62)}>
        <div style={{ height: 11, width: 70, background: '#3a3d44', borderRadius: 5, margin: '24px 0 12px' }} />
      </FloatWrap>
      {[104, 126, 96, 118, 88].map((w, i) => (
        <FloatWrap key={i} h={L(0.62 + i * 0.05, 66)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, height: 32 }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: '#34373e' }} />
            <div style={{ height: 10, width: w, background: '#2e3137', borderRadius: 5 }} />
          </div>
        </FloatWrap>
      ))}
    </div>
    <div style={{ flex: 1, padding: '30px 40px', boxSizing: 'border-box' }}>
      <FloatWrap h={L(0.26, 90)}>
        <div style={{ height: 24, width: 130, background: '#f2f0ea', borderRadius: 10, marginBottom: 22 }} />
      </FloatWrap>
      <FloatWrap h={L(0.34, 80)}>
        <div style={{ height: 46, border: `2px solid ${line}`, borderRadius: 12, marginBottom: 26, display: 'flex', alignItems: 'center', padding: '0 16px', background: '#14161b' }}>
          <div style={{ width: 17, height: 17, borderRadius: 9, border: `2px solid ${mid}` }} />
          <div style={{ height: 10, width: 250, background: line, borderRadius: 5, marginLeft: 12 }} />
        </div>
      </FloatWrap>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 30 }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <FloatWrap key={i} h={L(0.42 + i * 0.04, 76)}>
            <Chip w={222} />
          </FloatWrap>
        ))}
      </div>
      <FloatWrap h={L(0.72, 60)}>
        <div style={{ display: 'flex', gap: 18, marginBottom: 18 }}>
          {[54, 84, 50, 82].map((w, i) => (
            <div key={i} style={{ height: 11, width: w, background: i === 0 ? GOLD : line, borderRadius: 5 }} />
          ))}
        </div>
      </FloatWrap>
      {[0, 1, 2, 3].map((i) => (
        <FloatWrap key={i} h={L(0.78 + i * 0.055, 64)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 46, borderBottom: `2px solid ${line}` }}>
            <div style={{ width: 13, height: 13, borderRadius: 7, background: GOLD }} />
            <div style={{ height: 11, width: 160 + ((i * 37) % 70), background: '#3a3d44', borderRadius: 5 }} />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
              {[0, 1, 2].map((k) => <div key={k} style={{ width: 20, height: 20, borderRadius: 10, background: '#2e3137' }} />)}
            </div>
          </div>
        </FloatWrap>
      ))}
    </div>
  </div>
  );
};

export const NeonFrameForerunOrbit: React.FC = () => {
  const frame = useCurrentFrame();
  // 滤镜/渐变 ID 按实例生成，多实例同场不串引（useId 的 «:» 在 url() 里非法，需清洗）
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  // 开场快速描框（同款左缘中点两头奔画，14 帧成型——样式与 v3 一致）
  const trace = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.3, 0.1, 0.3, 1),
  });
  // 面板早亮：本变体主角是旋转+贴落，不复刻暗转亮长过程
  const lit = interpolate(frame, [8, 30], [0.25, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.35, 0, 0.3, 1),
  });
  const frameLine = interpolate(frame, [96, 130], [1, 0.35], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const rimGlow = interpolate(frame, [0, 20, 108, 138], [0.7, 1, 0.75, 0.5], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const bgLit = interpolate(frame, [0, 30, 100, 136], [0.3, 1, 0.85, 0.1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  // 视角弧线：从页面左侧(+38°)连续旋到右侧(-26°)，全程不停——
  // ease-in-out 起止柔和、中段持续转动
  const orbit = interpolate(frame, [0, 128], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.42, 0.05, 0.32, 1),
  });
  const rotY = 38 - 64 * orbit;             // +38° → -26°
  const rotX = 6 - 2.5 * orbit;
  const rotZ = 3 - 7.5 * orbit;             // 左视角微仰 → 右视角微俯（对齐 v3 落定姿态）
  const scale = 0.9 + 0.1 * Math.sin(orbit * Math.PI) + 0.02 * orbit; // 弧线中段略推近
  // 透视原点随视角横移：镜头从左绕到右
  const pOrigin = 30 + 34 * orbit;
  const headP = trace * (PL / 2);
  // 贴落进程：与旋转同时进行（帧 10–118），错峰起点+重叠下落
  const drop = interpolate(frame, [10, 118], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: '#0b0c0f', overflow: 'hidden' }}>
      {/* 背景：一团极淡的金色光晕托住页面（取代旧版霓虹管框群） */}
      <div style={{ position: 'absolute', left: '50%', top: '46%', width: 1800, height: 1100, transform: 'translate(-50%,-50%)', background: 'radial-gradient(closest-side, rgba(224,176,75,0.10), transparent)', opacity: bgLit }} />
      {/* 主体：视角弧线旋转中的框+面板 */}
      <div style={{ position: 'absolute', inset: 0, perspective: 1500, perspectiveOrigin: `${pOrigin}% 44%` }}>
        <div style={{
          position: 'absolute', left: (1920 - PW) / 2, top: (1080 - PH) / 2 - 10,
          transform: `scale(${scale}) rotateY(${rotY}deg) rotateX(${rotX}deg) rotateZ(${rotZ}deg)`,
          transformStyle: 'preserve-3d',
        }}>
          <div style={{ opacity: trace > 0.4 ? 1 : 0, filter: `brightness(${Math.max(0.05, lit)})` }}>
            <GrayHome t={drop} />
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 6,
              background: 'linear-gradient(150deg, rgba(24,20,12,0.5), rgba(0,0,0,0.78))',
              opacity: 1 - lit,
            }} />
          </div>
          <div style={{
            position: 'absolute', left: -10, top: -10, width: PW + 20, height: PH + 20,
            borderRadius: 12, opacity: rimGlow * Math.min(1, trace * 1.6),
            boxShadow: '0 18px 70px 8px rgba(224,176,75,0.16), 0 0 30px 2px rgba(224,176,75,0.12)',
          }} />
          <svg width={PW + 80} height={PH + 80} viewBox={`-40 -40 ${PW + 80} ${PH + 80}`}
            style={{ position: 'absolute', left: -40, top: -40 }}>
            <defs>
              <linearGradient id={`omainfg-${uid}`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={PW} y2={PH}>
                <stop offset="0%" stopColor="#f3d690" />
                <stop offset="45%" stopColor="#e0b04b" />
                <stop offset="100%" stopColor="#b9892f" />
              </linearGradient>
              <filter id={`ofblur-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation={10} />
              </filter>
              <filter id={`ofblur2-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation={3} />
              </filter>
            </defs>
            {[1, -1].map((dir) => (
              <g key={dir}>
                <path d={FRAME_D} pathLength={PL} fill="none" stroke={`url(#omainfg-${uid})`}
                  strokeWidth={8} strokeLinecap="butt" filter={`url(#ofblur-${uid})`}
                  strokeDasharray={`${headP} ${PL}`}
                  strokeDashoffset={dir === 1 ? 0 : -(PL - headP)}
                  opacity={0.35 * rimGlow} />
                <path d={FRAME_D} pathLength={PL} fill="none" stroke={`url(#omainfg-${uid})`}
                  strokeWidth={2.5} strokeLinecap="butt"
                  strokeDasharray={`${headP} ${PL}`}
                  strokeDashoffset={dir === 1 ? 0 : -(PL - headP)}
                  opacity={0.95 * frameLine} />
                {trace < 1 && (
                  <path d={FRAME_D} pathLength={PL} fill="none" stroke="#ffffff"
                    strokeWidth={6} strokeLinecap="round" filter={`url(#ofblur2-${uid})`}
                    strokeDasharray={`8 ${PL}`}
                    strokeDashoffset={dir === 1 ? -(Math.max(0, headP - 8)) : -(PL - headP)}
                    opacity={0.95} />
                )}
              </g>
            ))}
          </svg>
        </div>
      </div>
    </AbsoluteFill>
  );
};
