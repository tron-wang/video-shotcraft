// social-profile-moves 三款共用的小零件：机械式里程表数字、滑鼠游标、首字母头像、缓动。
// （不是 demo，没有同名 React.FC 导出，工作台索引会跳过这个档。）
import React from 'react';

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const SANS = '"PingFang TC","Noto Sans TC",Helvetica,sans-serif';

/** 进场：往上浮 + 模糊变清晰；at 起 len 帧。 */
export const blurRise = (f: number, at: number, u: number, len = 12, dy = 18) => {
  const t = easeOutCubic(clamp01((f - at) / len));
  return { opacity: t, transform: `translateY(${(1 - t) * dy * u}px)`, filter: t < 1 ? `blur(${(1 - t) * 8 * u}px)` : undefined };
};

/**
 * 机械式里程表：value 可以是小数（连续滚动）。个位连续转；十位以上只在下一位「9 → 0」的那一格里转一格，
 * 读起来像真的齿轮；滚动只占每格的最后 30%。digits = 要显示的位数（取终值的位数）；千分位逗号自动插。
 */
export const Odometer: React.FC<{ value: number; digits: number; size: number; color?: string; weight?: number; comma?: boolean }> = ({
  value, digits, size, color = '#f2f0ea', weight = 800, comma = true,
}) => {
  const cells: React.ReactNode[] = [];
  const v = Math.max(0, value);
  for (let p = digits - 1; p >= 0; p--) {
    const unit = Math.pow(10, p);
    // 每一位只在「个位小数走到最后 30%」时滚一格（高位还要下面各位都是 9）：快速计数时多数帧是完整数字、不会糊成一片
    const lower = v % unit; // 下位累积（含个位小数）
    const roll = easeInOutSine(clamp01(((p === 0 ? v % 1 : lower - (unit - 1)) - 0.7) / 0.3));
    const pos = Math.floor(v / unit) + (p === 0 || lower >= unit - 1 ? roll : 0);
    const d = ((pos % 10) + 10) % 10;
    // 前导零：不显示也不占位；进位滚进来时宽度与不透明度一起长出来
    const vis = p === 0 || pos >= 1 ? 1 : clamp01(pos);
    cells.push(
      <span key={p} style={{ display: 'inline-block', width: size * 0.62 * vis, height: size * 1.1, overflow: 'hidden', position: 'relative', opacity: vis, verticalAlign: 'bottom' }}>
        <span style={{ position: 'absolute', left: 0, right: 0, top: -d * size * 1.1, textAlign: 'center' }}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((k, i) => <span key={i} style={{ display: 'block', height: size * 1.1, lineHeight: `${size * 1.1}px` }}>{k}</span>)}
        </span>
      </span>,
    );
    if (comma && p > 0 && p % 3 === 0) cells.push(<span key={`c${p}`} style={{ display: 'inline-block', width: size * 0.28 * vis, overflow: 'hidden', textAlign: 'center', opacity: vis }}>,</span>);
  }
  return <span style={{ display: 'inline-flex', fontSize: size, fontWeight: weight, color, fontVariantNumeric: 'tabular-nums', fontFamily: SANS, lineHeight: 1 }}>{cells}</span>;
};

/** 滑鼠箭头游标（白底黑边）；pressed 时微缩。 */
export const Cursor: React.FC<{ x: number; y: number; size: number; pressed?: boolean; opacity?: number }> = ({ x, y, size, pressed, opacity = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ position: 'absolute', left: x, top: y, opacity, transform: `scale(${pressed ? 0.86 : 1})`, transformOrigin: '0 0', filter: `drop-shadow(0 ${size * 0.08}px ${size * 0.15}px rgba(0,0,0,0.5))`, zIndex: 20 }}>
    <path d="M3 2l17 10.5-7.4 1.4 4.3 7.6-3 1.6-4.2-7.7L3 20.5z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

const AVATAR_TONES = ['#e0b04b', '#c98b3a', '#8f7a52', '#b89a5e', '#6d6f76', '#a0743c', '#d4c29a'];
/** 首字母头像（虚构帐号用；成片请换真实头像图）。 */
export const InitialAvatar: React.FC<{ name: string; size: number; ring?: string; tone?: number }> = ({ name, size, ring = '#000', tone }) => {
  const i = tone ?? Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0);
  const bg = AVATAR_TONES[i % AVATAR_TONES.length];
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: `linear-gradient(145deg, ${bg}, #2a2419)`, border: `${size * 0.05}px solid ${ring}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0b0c0f', fontFamily: SANS, fontWeight: 800, fontSize: size * 0.4, boxSizing: 'border-box', flexShrink: 0 }}>
      {Array.from(name)[0]}
    </div>
  );
};
