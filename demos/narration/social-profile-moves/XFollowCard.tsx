// social-profile-moves 的「X 个人页追踪」款（2026-09，参考 remocn「x-follow-card」的动效，程式为本卡自写；remocn 为 MIT 授权）。
// X 深色个人页卡片弹入（上浮 + 微放大 + 整卡由糊变清），各层（横幅 / 头像 / 名字 / 简介 / 数据）错开几帧依序清晰；
// 游标滑进来按下「追蹤」→ 按钮翻成「正在追蹤」、按下处漾出一圈金环，追踪者数字像里程表 +1；之后极缓慢推近，不停在静帧。
// 横幅右上角带 X 官方标志（`logo={false}` 可关）。**资料必须真实**（成片放真实帐号的真实名称、简介与数字）；demo 为虚构帐号。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { XMark } from '../../_fixtures/BrandMarks';
import { Cursor, InitialAvatar, Odometer, SANS, blurRise, clamp01, easeInOutCubic, easeInOutSine, easeOutCubic, mix } from './SocialKit';

export const X_FOLLOW_CARD_DURATION = 180; // 6s @30fps

export type XFollowCardProps = {
  name: string;
  handle: string;
  bio?: string;
  /** 地点 · 加入时间那一行。 */
  meta?: string;
  following: number;
  followers: number;
  /** 蓝勾勾（真实帐号有才开）。 */
  verified?: boolean;
  /** 头像 / 横幅：成片放真实图（<Img …/>，会被裁成圆形 / 横幅比例）；不给用首字母与黑金渐层。 */
  avatar?: React.ReactNode;
  banner?: React.ReactNode;
  /** 游标按下追踪的帧；null = 不演按追踪（只展示个人页）。 */
  clickAt?: number | null;
  /** 横幅右上角显示 X 标志。 */
  logo?: boolean;
  followLabel?: string;
  followingLabel?: string;
  accent?: string;
  bg?: string;
};

const TXT = '#e7e9ea', DIM = '#71767b', LINE = '#2f3336';

export const XFollowCardShot: React.FC<XFollowCardProps> = ({
  name, handle, bio, meta, following, followers, verified, avatar, banner, clickAt = 72,
  logo = true, followLabel = '追蹤', followingLabel = '正在追蹤', accent = '#e0b04b', bg = '#0b0c0f',
}) => {
  const f = useCurrentFrame();
  const { width: W, height: H, durationInFrames: D } = useVideoConfig();
  const u = Math.min(W, H) / 1080;
  const CW = 860 * u; // 与 X 截图卡同宽：两侧留白
  const bannerH = 250 * u, av = 150 * u;
  const cardH = 670 * u;
  const cx = (W - CW) / 2, cy = (H - cardH) / 2;

  const inT = easeOutCubic(clamp01(f / 20));
  const push = 1 + 0.03 * easeInOutSine(clamp01((f - 20) / (D - 20)));
  const clicked = clickAt != null && f >= clickAt + 3;
  const pressed = clickAt != null && f >= clickAt && f < clickAt + 6;
  const plus = clickAt != null ? easeInOutCubic(clamp01((f - clickAt - 4) / 16)) : 0;

  // 追踪钮在卡片里的位置（右上、横幅下方）
  const btnW = (clicked ? 196 : 150) * u, btnH = 68 * u;
  const btnX = CW - 32 * u - btnW, btnY = bannerH + 22 * u;
  // 游标：从右下角滑到按钮中间（easeInOutCubic，走一小段弧）
  const cT = clickAt != null ? easeInOutCubic(clamp01((f - clickAt + 30) / 28)) : 0;
  const tx = cx + CW - 32 * u - 150 * u * 0.55, ty = cy + btnY + btnH * 0.5; // 以按下前的钮宽定位，钮变宽时游标不跳
  const curX = mix(W * 0.86, tx, cT) + Math.sin(cT * Math.PI) * 40 * u, curY = mix(H * 0.96, ty, cT);
  const btnIn = blurRise(f, 12, u);
  const ring = clickAt != null ? clamp01((f - clickAt) / 18) : 0;

  return (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden', fontFamily: SANS }}>
      <div style={{ position: 'absolute', left: W / 2, top: H / 2, width: 1500 * u, height: 1100 * u, transform: 'translate(-50%,-50%)', background: `radial-gradient(closest-side, ${accent}14, transparent)` }} />
      <div style={{
        position: 'absolute', left: cx, top: cy, width: CW, height: cardH, borderRadius: 28 * u, overflow: 'hidden', background: '#000', border: `${1.5 * u}px solid ${LINE}`,
        boxShadow: `0 ${30 * u}px ${90 * u}px rgba(0,0,0,0.6)`, opacity: inT, transform: `translateY(${(1 - inT) * 60 * u}px) scale(${mix(0.94, 1, inT) * push})`,
        filter: inT < 1 ? `blur(${(1 - inT) * 12 * u}px)` : undefined,
      }}>
        {/* 横幅 */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: CW, height: bannerH, overflow: 'hidden', ...blurRise(f, 4, u, 14, 0) }}>
          {banner ?? <div style={{ width: '100%', height: '100%', background: `linear-gradient(120deg, #15110a 0%, #3b2b0e 55%, ${accent}66 100%)`, backgroundSize: 'cover' }}>
            <div style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(115deg, transparent 0 ${38 * u}px, ${accent}14 ${38 * u}px ${40 * u}px)` }} />
          </div>}
        </div>
        {logo ? (
          <div style={{ position: 'absolute', right: 24 * u, top: 24 * u, width: 64 * u, height: 64 * u, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...blurRise(f, 8, u, 12, 0) }}>
            <XMark size={32 * u} />
          </div>
        ) : null}
        {/* 头像 */}
        <div style={{ position: 'absolute', left: 32 * u, top: bannerH - av / 2, width: av, height: av, borderRadius: '50%', overflow: 'hidden', border: `${6 * u}px solid #000`, background: '#000', ...blurRise(f, 10, u, 12, 10) }}>
          {avatar ?? <InitialAvatar name={name} size={av - 12 * u} ring="transparent" />}
        </div>
        {/* 追踪钮 */}
        <div style={{
          position: 'absolute', left: btnX, top: btnY, width: btnW, height: btnH, borderRadius: btnH / 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: clicked ? 'transparent' : TXT, border: `${1.5 * u}px solid ${clicked ? '#536471' : TXT}`, color: clicked ? TXT : '#0f1419',
          fontSize: 30 * u, fontWeight: 800, ...btnIn, transform: `${btnIn.transform} scale(${pressed ? 0.93 : 1})`,
        }}>{clicked ? followingLabel : followLabel}</div>
        {/* 名字 / handle / 简介 / meta / 数据 */}
        <div style={{ position: 'absolute', left: 36 * u, right: 36 * u, top: bannerH + av / 2 + 26 * u }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 * u, fontSize: 46 * u, fontWeight: 800, color: TXT, ...blurRise(f, 14, u) }}>
            {name}
            {verified ? <svg width={40 * u} height={40 * u} viewBox="0 0 24 24"><path d="M12 1.8l2.6 1.9 3.2-.1 1 3 2.6 1.9-1 3 1 3-2.6 1.9-1 3-3.2-.1L12 22.2l-2.6-1.9-3.2.1-1-3L2.6 15.5l1-3-1-3 2.6-1.9 1-3 3.2.1z" fill="#1d9bf0" /><path d="M7.5 12.2l3 3 6-6.2" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
          </div>
          <div style={{ fontSize: 30 * u, color: DIM, marginTop: 4 * u, ...blurRise(f, 17, u) }}>@{handle}</div>
          {bio ? <div style={{ fontSize: 32 * u, color: TXT, lineHeight: 1.45, marginTop: 22 * u, ...blurRise(f, 21, u) }}>{bio}</div> : null}
          {meta ? <div style={{ fontSize: 28 * u, color: DIM, marginTop: 16 * u, ...blurRise(f, 25, u) }}>{meta}</div> : null}
          <div style={{ display: 'flex', alignItems: 'center', gap: 36 * u, fontSize: 30 * u, color: DIM, marginTop: 20 * u, ...blurRise(f, 29, u) }}>
            <span><b style={{ color: TXT }}>{following.toLocaleString('en-US')}</b> 正在追蹤</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 * u }}>
              <Odometer value={followers + plus} digits={String(followers + 1).length} size={30 * u} color={clicked ? accent : TXT} />
              位追蹤者
            </span>
          </div>
        </div>
      </div>
      {/* 按下处的金环 */}
      {ring > 0 && ring < 1 ? (
        <div style={{ position: 'absolute', left: tx, top: ty, width: 0, height: 0 }}>
          <div style={{ position: 'absolute', left: -110 * u * easeOutCubic(ring), top: -110 * u * easeOutCubic(ring), width: 220 * u * easeOutCubic(ring), height: 220 * u * easeOutCubic(ring), borderRadius: '50%', border: `${3 * u}px solid ${accent}`, opacity: 1 - ring }} />
        </div>
      ) : null}
      {clickAt != null ? <Cursor x={curX} y={curY} size={54 * u} pressed={pressed} opacity={clamp01((f - clickAt + 30) / 6) * (1 - clamp01((f - clickAt - 40) / 12))} /> : null}
    </AbsoluteFill>
  );
};

// demo：虚构帐号（首字母头像、黑金横幅）
export const XFollowCard: React.FC = () => (
  <XFollowCardShot
    name="夜間課程研究室"
    handle="nightclass_lab"
    bio="整理城市夜間課程的報名數據與趨勢，每週更新。"
    meta="台北 · 2019 年 3 月加入"
    following={286}
    followers={38214}
  />
);
