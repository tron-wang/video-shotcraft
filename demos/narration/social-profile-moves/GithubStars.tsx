// social-profile-moves 的「GitHub 星数」款（2026-09，参考 remocn「github-stars」的动效，程式为本卡自写；remocn 为 MIT 授权）。
// GitHub 深色 repo 卡浮入 → 游标按下「Star」：星星填成金色、按钮变「Starred」→ 卡下方大数字以里程表从起点滚到终点，
// 同一个进度画出一条金色星数成长曲线（面积渐层），曲线尾端的光点跟着数字走 → stargazers 头像一排由右滑入。
// 只重现 GitHub repo 页的版型与配色，不放官方 logo 图档。**数字必须真实**（repo 页 / star-history 可查）；demo 为虚构 repo。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Cursor, InitialAvatar, Odometer, SANS, blurRise, clamp01, easeInOutCubic, easeInOutSine, easeOutCubic, mix } from './SocialKit';

export const GITHUB_STARS_DURATION = 210; // 7s @30fps

export type GithubStarsProps = {
  owner: string;
  repo: string;
  description?: string;
  language?: string;
  languageColor?: string;
  /** 星数：起点 → 终点。 */
  from: number;
  to: number;
  /** 成长曲线形状（0–1 的相对值，依时间排序，至少 2 点）；不给用一条先缓后陡的曲线。 */
  curve?: number[];
  /** 曲线左右两端的标签（例：「1 月」「9 月」）。 */
  curveLabels?: [string, string];
  /** stargazers 头像（名字，首字母头像）；成片可给真实公开头像。 */
  stargazers?: string[];
  /** 游标按下 Star 的帧；null = 不演按 Star。 */
  clickAt?: number | null;
  countFrom?: number;
  countTo?: number;
  accent?: string;
  bg?: string;
};

const TXT = '#f0f6fc', DIM = '#9198a1', LINE = '#3d444d', LINK = '#4493f8', PANEL = '#0d1117', BTN = '#212830';
const STAR = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z';

export const GithubStarsShot: React.FC<GithubStarsProps> = ({
  owner, repo, description, language = 'TypeScript', languageColor = '#3178c6', from, to, curve, curveLabels, stargazers = [],
  clickAt = 40, countFrom = 60, countTo = 150, accent = '#e3b341', bg = '#0b0c0f',
}) => {
  const f = useCurrentFrame();
  const { width: W, height: H, durationInFrames: D } = useVideoConfig();
  const u = Math.min(W, H) / 1080;
  const land = W >= H;
  const CW = (land ? 1100 : 940) * u;
  const x0 = (W - CW) / 2;
  const cardY = land ? H * 0.08 : H * 0.2;
  const cardH = 230 * u;
  const push = 1 + 0.03 * easeInOutSine(clamp01(f / D));

  const inT = easeOutCubic(clamp01(f / 18));
  const starred = clickAt != null && f >= clickAt + 3;
  const pressed = clickAt != null && f >= clickAt && f < clickAt + 6;
  const starPop = clickAt != null ? clamp01((f - clickAt - 3) / 12) : 0;
  const c = easeInOutCubic(clamp01((f - countFrom) / (countTo - countFrom)));
  const arrive = clamp01((f - countTo) / 18);

  // Star 按钮在画面上的位置（卡片右上）
  const starBtnW = 260 * u, starBtnH = 64 * u;
  const sbx = x0 + CW - 32 * u - starBtnW, sby = cardY + 30 * u;
  const cT = clickAt != null ? easeInOutCubic(clamp01((f - clickAt + 28) / 26)) : 0;
  const tx = sbx + starBtnW * 0.28, ty = sby + starBtnH * 0.55;
  const curX = mix(W * 0.9, tx, cT) + Math.sin(cT * Math.PI) * 50 * u, curY = mix(H * 0.9, ty, cT);

  // 成长曲线
  const pts = curve && curve.length >= 2 ? curve : Array.from({ length: 24 }, (_, i) => Math.pow(i / 23, 2.2) * 0.92 + (i / 23) * 0.08);
  const gx = x0, gw = CW, gTop = cardY + cardH + (land ? 300 : 420) * u, gh = (land ? 250 : 420) * u;
  const P = pts.map((v, i) => ({ x: gx + (i / (pts.length - 1)) * gw, y: gTop + gh - v * gh }));
  const drawn = c * (P.length - 1);
  const shown = P.slice(0, Math.floor(drawn) + 1);
  const fi = Math.floor(drawn), fr = drawn - fi;
  const head = fi < P.length - 1 ? { x: mix(P[fi].x, P[fi + 1].x, fr), y: mix(P[fi].y, P[fi + 1].y, fr) } : P[P.length - 1];
  // 数字跟着曲线高度走（曲线是先缓后陡，数字也是）
  const hv = fi < pts.length - 1 ? mix(pts[fi], pts[fi + 1], fr) : pts[pts.length - 1];
  const value = mix(from, to, clamp01((hv - pts[0]) / Math.max(1e-6, pts[pts.length - 1] - pts[0])));
  const line = [...shown, head].map((p) => `${p.x},${p.y}`).join(' ');
  const area = `${gx},${gTop + gh} ${line} ${head.x},${gTop + gh}`;

  const numY = cardY + cardH + (land ? 70 : 110) * u;

  return (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden', fontFamily: SANS }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push})` }}>
        {/* repo 卡 */}
        <div style={{
          position: 'absolute', left: x0, top: cardY, width: CW, height: cardH, boxSizing: 'border-box', borderRadius: 16 * u, background: PANEL, border: `${1.5 * u}px solid ${LINE}`,
          padding: `${30 * u}px ${34 * u}px`, boxShadow: `0 ${24 * u}px ${70 * u}px rgba(0,0,0,0.55)`,
          opacity: inT, transform: `translateY(${(1 - inT) * 40 * u}px)`, filter: inT < 1 ? `blur(${(1 - inT) * 10 * u}px)` : undefined,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 * u, fontSize: 38 * u, color: LINK, ...blurRise(f, 6, u) }}>
            <svg width={34 * u} height={34 * u} viewBox="0 0 16 16"><path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5v-1.5h1.75v-2h-8a1 1 0 00-.71 1.71.75.75 0 01-1.06 1.06A2.5 2.5 0 012 11.5zm10.5-1h-8a1 1 0 00-1 1v6.71A2.5 2.5 0 014.5 9h8zM5 12.25V16l1.5-1.2L8 16v-3.75z" fill={DIM} /></svg>
            <span>{owner} / <b>{repo}</b></span>
            <span style={{ fontSize: 22 * u, color: DIM, border: `${1.5 * u}px solid ${LINE}`, borderRadius: 999, padding: `${2 * u}px ${14 * u}px`, marginLeft: 6 * u }}>Public</span>
          </div>
          {description ? <div style={{ fontSize: 28 * u, color: DIM, marginTop: 18 * u, ...blurRise(f, 10, u) }}>{description}</div> : null}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 * u, fontSize: 26 * u, color: DIM, marginTop: 22 * u, ...blurRise(f, 14, u) }}>
            <span style={{ width: 20 * u, height: 20 * u, borderRadius: '50%', background: languageColor }} />{language}
          </div>
        </div>
        {/* Star 按钮 */}
        <div style={{
          position: 'absolute', left: sbx, top: sby, width: starBtnW, height: starBtnH, boxSizing: 'border-box', display: 'flex', borderRadius: 12 * u, overflow: 'hidden',
          border: `${1.5 * u}px solid ${LINE}`, background: BTN, fontSize: 26 * u, fontWeight: 700, color: TXT, opacity: inT, transform: `translateY(${(1 - inT) * 40 * u}px) scale(${pressed ? 0.95 : 1})`,
        }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 * u }}>
            <svg width={30 * u} height={30 * u} viewBox="0 0 24 24" style={{ transform: `scale(${1 + 0.35 * Math.sin(Math.PI * starPop)})` }}>
              <path d={STAR} fill={starred ? accent : 'none'} stroke={starred ? accent : DIM} strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
            {starred ? 'Starred' : 'Star'}
          </div>
          <div style={{ width: 96 * u, borderLeft: `${1.5 * u}px solid ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#151b23' }}>
            {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : Math.round(value)}
          </div>
        </div>

        {/* 大数字 */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: numY, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26 * u, ...blurRise(f, countFrom - 12, u, 16, 30) }}>
          <svg width={120 * u} height={120 * u} viewBox="0 0 24 24" style={{ transform: `rotate(${-8 + 16 * c}deg) scale(${1 + 0.08 * Math.sin(Math.PI * arrive)})` }}>
            <path d={STAR} fill={accent} />
          </svg>
          <Odometer value={value} digits={String(to).length} size={(land ? 170 : 150) * u} color={TXT} />
        </div>

        {/* 成长曲线 */}
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: clamp01((f - countFrom + 8) / 10) }}>
          <defs>
            <linearGradient id="gs-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={accent} stopOpacity="0.32" /><stop offset="1" stopColor={accent} stopOpacity="0" /></linearGradient>
          </defs>
          <line x1={gx} y1={gTop + gh} x2={gx + gw} y2={gTop + gh} stroke={LINE} strokeWidth={1.5 * u} />
          <polygon points={area} fill="url(#gs-area)" />
          <polyline points={line} fill="none" stroke={accent} strokeWidth={5 * u} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={head.x} cy={head.y} r={20 * u} fill={accent} opacity={0.25} />
          <circle cx={head.x} cy={head.y} r={9 * u} fill="#fff4d6" />
        </svg>
        {curveLabels ? (
          <div style={{ position: 'absolute', left: gx, width: gw, top: gTop + gh + 12 * u, display: 'flex', justifyContent: 'space-between', fontSize: 24 * u, color: DIM, opacity: clamp01((f - countFrom) / 10) }}>
            <span>{curveLabels[0]}</span><span>{curveLabels[1]}</span>
          </div>
        ) : null}

        {/* stargazers */}
        {stargazers.length ? (
          <div style={{ position: 'absolute', left: x0, width: CW, top: gTop + gh + (curveLabels ? 66 : 40) * u, display: 'flex', alignItems: 'center' }}>
            {stargazers.map((n, i) => {
              const t = easeOutCubic(clamp01((f - countTo + 10 - i * 3) / 14));
              return <div key={i} style={{ marginLeft: i ? -14 * u : 0, opacity: t, transform: `translateX(${(1 - t) * 60 * u}px)`, zIndex: stargazers.length - i }}><InitialAvatar name={n} size={60 * u} ring={bg} tone={i} /></div>;
            })}
            <span style={{ marginLeft: 20 * u, fontSize: 28 * u, color: DIM, ...blurRise(f, countTo + 10, u) }}>+{Math.max(0, to - stargazers.length).toLocaleString('en-US')} stargazers</span>
          </div>
        ) : null}
      </div>
      {clickAt != null ? <Cursor x={curX} y={curY} size={54 * u} pressed={pressed} opacity={clamp01((f - clickAt + 28) / 6) * (1 - clamp01((f - clickAt - 30) / 12))} /> : null}
    </AbsoluteFill>
  );
};

// demo：虚构 repo 与数字
export const GithubStars: React.FC = () => (
  <GithubStarsShot
    owner="nightclass"
    repo="schedule-kit"
    description="夜間課程排課與報名統計的開源工具組"
    from={1204}
    to={18630}
    curveLabels={['1 月', '9 月']}
    stargazers={['Ada', 'Ben', 'Chen', 'Dora', 'Eli', 'Fang', 'Gus', 'Hana']}
  />
);
