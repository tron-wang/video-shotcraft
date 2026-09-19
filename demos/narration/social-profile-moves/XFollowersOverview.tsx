// social-profile-moves 的「X 追踪者总览」款（2026-09，参考 remocn「x-followers-overview」的动效，程式为本卡自写；remocn 为 MIT 授权）。
// 上方一则「新追踪者」通知：头像一个个叠进来，名字像翻页牌一样 rotateX 往上翻换人；
// 下方大数字「位追蹤者」以里程表滚到终值（与通知翻名同步加速），到站时一圈细金环 + 短金芒轻轻散开（不用彩带，保持新闻调性）。
// 只重现 X 通知与数据的版型与配色，不放官方 logo 图档。**数字必须真实**（有出处的追踪者数）；demo 为虚构帐号与数字。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { InitialAvatar, Odometer, SANS, blurRise, clamp01, easeInOutCubic, easeInOutSine, easeOutCubic, mix } from './SocialKit';

export const X_FOLLOWERS_OVERVIEW_DURATION = 180; // 6s @30fps

export type XFollowersOverviewProps = {
  /** 依序翻过的新追踪者名字（4–8 个）。 */
  names: string[];
  /** 追踪者数：起点 → 终点。 */
  from: number;
  to: number;
  /** 大数字下方的说明（例：「本週新增」）；不给就用 +差值。 */
  caption?: string;
  label?: string;
  /** 开始计数 / 计数到站的帧。 */
  countFrom?: number;
  countTo?: number;
  accent?: string;
  bg?: string;
};

const TXT = '#e7e9ea', DIM = '#71767b', LINE = '#2f3336';

export const XFollowersOverviewShot: React.FC<XFollowersOverviewProps> = ({
  names, from, to, caption, label = '位追蹤者', countFrom = 30, countTo = 132, accent = '#e0b04b', bg = '#0b0c0f',
}) => {
  const f = useCurrentFrame();
  const { width: W, height: H, durationInFrames: D } = useVideoConfig();
  const u = Math.min(W, H) / 1080;
  const land = W >= H;
  const CW = 860 * u;
  const push = 1 + 0.03 * easeInOutSine(clamp01(f / D));

  // 计数进度 c：easeInOutCubic；翻名的节拍跟着 c 走（c 均分给每个名字），计数快时翻得也快
  const c = easeInOutCubic(clamp01((f - countFrom) / (countTo - countFrom)));
  const k = names.length;
  const idxF = Math.min(k - 1, c * k); // 0..k-1（连续）
  const cur = Math.floor(idxF);
  const flip = cur < k - 1 ? clamp01((idxF - cur) * 3 - 2) : 0; // 每一格的最后 1/3 翻
  const value = mix(from, to, c);
  const digits = String(to).length;
  const arrive = clamp01((f - countTo) / 22);

  const panelIn = easeOutCubic(clamp01(f / 18));
  const numY = land ? H * 0.5 : H * 0.5;
  const notifY = numY - 380 * u;

  const flipName = (n: number, rot: number, o: number) => (
    <div style={{ position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap', transform: `perspective(${600 * u}px) rotateX(${rot}deg)`, transformOrigin: '50% 50%', opacity: o, backfaceVisibility: 'hidden' }}>
      <b style={{ color: TXT }}>{names[n]}</b> 追蹤了你
    </div>
  );

  return (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden', fontFamily: SANS }}>
      <div style={{ position: 'absolute', left: W / 2, top: numY, width: 1500 * u, height: 1000 * u, transform: 'translate(-50%,-50%)', background: `radial-gradient(closest-side, ${accent}16, transparent)` }} />
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push})` }}>
        {/* 通知卡 */}
        <div style={{
          position: 'absolute', left: (W - CW) / 2, top: notifY, width: CW, padding: `${28 * u}px ${34 * u}px`, boxSizing: 'border-box', borderRadius: 26 * u,
          background: '#000', border: `${1.5 * u}px solid ${LINE}`, display: 'flex', gap: 26 * u, boxShadow: `0 ${24 * u}px ${70 * u}px rgba(0,0,0,0.55)`,
          opacity: panelIn, transform: `translateY(${(1 - panelIn) * 40 * u}px)`, filter: panelIn < 1 ? `blur(${(1 - panelIn) * 10 * u}px)` : undefined,
        }}>
          {/* 追踪图示（人形 +） */}
          <svg width={52 * u} height={52 * u} viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 6 * u }}>
            <circle cx="9" cy="7.5" r="4" fill={accent} /><path d="M1.5 21c0-4.4 3.4-7.5 7.5-7.5s7.5 3.1 7.5 7.5z" fill={accent} />
            <path d="M19 8v6M16 11h6" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <div style={{ flex: 1 }}>
            {/* 头像叠进来：目前名字之前的都在，最多显示 6 个 */}
            <div style={{ display: 'flex', height: 72 * u }}>
              {names.map((n, i) => {
                const t = easeOutCubic(clamp01((idxF - i + 0.34) * 3)); // 翻到这个名字时弹进来
                if (i > cur + 1 || i < cur - 5) return null;
                return <div key={i} style={{ marginLeft: i === Math.max(0, cur - 5) ? 0 : -18 * u, transform: `scale(${mix(0.4, 1, t)})`, opacity: i === 0 ? panelIn : t, zIndex: i }}><InitialAvatar name={n} size={72 * u} ring="#000" /></div>;
              })}
            </div>
            {/* 名字翻页牌 */}
            <div style={{ position: 'relative', height: 50 * u, marginTop: 18 * u, fontSize: 34 * u, color: DIM, overflow: 'hidden', ...blurRise(f, 8, u) }}>
              {flipName(cur, -90 * flip, 1 - flip)}
              {cur < k - 1 ? flipName(cur + 1, 90 * (1 - flip), flip) : null}
            </div>
          </div>
        </div>

        {/* 大数字 */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: numY - 90 * u, display: 'flex', flexDirection: 'column', alignItems: 'center', ...blurRise(f, 12, u, 16, 30) }}>
          <div style={{ transform: `scale(${1 + 0.05 * Math.sin(Math.PI * arrive)})` }}>
            <Odometer value={value} digits={digits} size={(land ? 190 : 170) * u} color={arrive > 0 ? accent : TXT} />
          </div>
          <div style={{ fontSize: 40 * u, color: DIM, marginTop: 14 * u, letterSpacing: 4 * u }}>{label}</div>
          <div style={{ marginTop: 26 * u, padding: `${10 * u}px ${26 * u}px`, borderRadius: 999, border: `${1.5 * u}px solid ${accent}88`, color: accent, fontSize: 30 * u, fontWeight: 800, ...blurRise(f, countTo - 4, u) }}>
            {caption ?? `+${(to - from).toLocaleString('en-US')}`}
          </div>
        </div>

        {/* 到站：细金环 + 短金芒 */}
        {arrive > 0 && arrive < 1 ? (
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <circle cx={W / 2} cy={numY} r={mix(160, 520, easeOutCubic(arrive)) * u} fill="none" stroke={accent} strokeWidth={2.5 * u} opacity={0.8 * (1 - arrive)} />
            {Array.from({ length: 14 }, (_, i) => {
              const a = (i / 14) * Math.PI * 2 + 0.2, r0 = mix(300, 520, easeOutCubic(arrive)) * u, r1 = r0 + 40 * u * (1 - arrive);
              return <line key={i} x1={W / 2 + Math.cos(a) * r0} y1={numY + Math.sin(a) * r0 * 0.7} x2={W / 2 + Math.cos(a) * r1} y2={numY + Math.sin(a) * r1 * 0.7} stroke={accent} strokeWidth={3 * u} strokeLinecap="round" opacity={1 - arrive} />;
            })}
          </svg>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// demo：虚构帐号名与数字
export const XFollowersOverview: React.FC = () => (
  <XFollowersOverviewShot
    names={['王小明', '陳怡君', 'Kevin Liu', '林雅婷', '張志豪', 'Mia Chen', '黃冠宇']}
    from={10114}
    to={12480}
    caption="本週 +2,366"
  />
);
