// search-reveal —— 搜寻框成形 → 打字 → 结果面板展开（2026-09，参考 remocn「search-reveal」的动效，程式为本卡自写；remocn 为 MIT 授权）。
// 两圈金色构图圆从中心扩散出画 → 一道短横线拉长、圆角化成搜寻框 → 关键字逐字打入（游标闪烁）→ 框下展开结果面板，
// 结果列依序浮现、关键字在结果里染金、右侧「熱度」标签跳上来。不带任何搜寻引擎品牌。
// 用途：新闻口播里「这几天大家都在搜 XXX」「搜寻量暴增」的那一镜。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

export const SEARCH_REVEAL_DURATION = 150; // 5s @30fps

export type SearchRevealProps = {
  /** 打进搜寻框的关键字。 */
  query: string;
  /** 结果列（2–4 条）；含关键字的部分会染强调色。 */
  results?: string[];
  /** 结果面板右上的标签（例：「熱度 ↑ 320%」）；空字串关闭。 */
  badge?: string;
  /** 开始打字的帧；每几帧打一个字。 */
  typeAt?: number;
  framesPerChar?: number;
  accent?: string;
  bg?: string;
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const FONT = '"PingFang TC","Noto Sans TC",Helvetica,sans-serif';

const highlight = (s: string, q: string, color: string) => {
  const i = q ? s.indexOf(q) : -1;
  if (i < 0) return s;
  return (<>{s.slice(0, i)}<span style={{ color, fontWeight: 800 }}>{q}</span>{s.slice(i + q.length)}</>);
};

export const SearchRevealShot: React.FC<SearchRevealProps> = ({
  query, results = [], badge = '', typeAt = 44, framesPerChar = 3, accent = '#e0b04b', bg = '#0b0c0f',
}) => {
  const f = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const u = Math.min(W, H) / 1080;
  const FW = Math.min(W * 0.84, 1100 * u), FH = 110 * u; // 搜寻框
  const cx = W / 2, fy = H * 0.36;

  // 1) 构图圆：0–26 帧从中心扩散出画
  const ring = easeOutCubic(clamp01(f / 26));
  // 2) 横线 → 搜寻框：18–42 帧宽度拉开、高度长出、圆角化
  const bar = easeInOutCubic(clamp01((f - 18) / 24));
  const w = mix(80 * u, FW, bar), h = mix(4 * u, FH, clamp01((bar - 0.4) / 0.6));
  // 3) 打字
  const chars = Array.from(query);
  const n = Math.max(0, Math.min(chars.length, Math.floor((f - typeAt) / framesPerChar) + 1));
  const doneAt = typeAt + chars.length * framesPerChar;
  const caret = f < typeAt || f > doneAt + 30 ? 0 : Math.floor(f / 12) % 2 === 0 ? 1 : 0;
  // 4) 结果面板：打完后 4 帧开始往下展开
  const panel = easeInOutCubic(clamp01((f - doneAt - 4) / 22));
  const rowH = 96 * u, PH = (results.length * rowH + 60 * u) * panel;

  return (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden', fontFamily: FONT }}>
      {/* 构图圆 */}
      {[0, 1].map((k) => (
        <div key={k} style={{ position: 'absolute', left: cx, top: fy, width: mix(0, (1.4 + k * 0.5) * Math.max(W, H), ring), height: mix(0, (1.4 + k * 0.5) * Math.max(W, H), ring), borderRadius: '50%', border: `${1.5 * u}px solid ${accent}`, opacity: (1 - ring) * 0.6 + 0.06, transform: 'translate(-50%,-50%)' }} />
      ))}
      {/* 背景一团淡金光 */}
      <div style={{ position: 'absolute', left: cx, top: fy, width: 1400 * u, height: 900 * u, transform: 'translate(-50%,-50%)', background: `radial-gradient(closest-side, ${accent}22, transparent)` }} />
      {/* 搜寻框 */}
      <div style={{ position: 'absolute', left: cx - w / 2, top: fy - h / 2, width: w, height: h, borderRadius: h / 2, background: bar > 0.4 ? '#16181d' : accent, border: bar > 0.4 ? `${2 * u}px solid ${accent}88` : 'none', boxShadow: bar > 0.4 ? `0 ${20 * u}px ${60 * u}px rgba(0,0,0,0.5)` : 'none', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        {bar > 0.7 ? (
          <>
            <svg width={44 * u} height={44 * u} viewBox="0 0 24 24" style={{ marginLeft: 36 * u, flex: 'none', opacity: clamp01((bar - 0.7) / 0.3) }}>
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke={accent} strokeWidth="2.4" /><line x1="15.5" y1="15.5" x2="21" y2="21" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            <div style={{ marginLeft: 24 * u, fontSize: 48 * u, fontWeight: 700, color: '#f2f0ea', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
              {chars.slice(0, n).join('')}
              <span style={{ display: 'inline-block', width: 3 * u, height: 52 * u, marginLeft: 4 * u, background: accent, opacity: caret }} />
            </div>
          </>
        ) : null}
      </div>
      {/* 结果面板 */}
      {panel > 0 ? (
        <div style={{ position: 'absolute', left: cx - FW / 2, top: fy + FH / 2 + 18 * u, width: FW, height: PH, borderRadius: 28 * u, background: '#14161b', border: `${1.5 * u}px solid ${accent}33`, overflow: 'hidden', boxShadow: `0 ${24 * u}px ${70 * u}px rgba(0,0,0,0.5)` }}>
          {badge ? (
            <div style={{ position: 'absolute', right: 28 * u, top: 22 * u, padding: `${6 * u}px ${16 * u}px`, borderRadius: 999, background: accent, color: bg, fontSize: 26 * u, fontWeight: 800, opacity: clamp01((f - doneAt - 20) / 8), transform: `translateY(${(1 - clamp01((f - doneAt - 20) / 8)) * 10 * u}px)` }}>{badge}</div>
          ) : null}
          {results.map((r, i) => {
            const o = easeOutCubic(clamp01((f - doneAt - 14 - i * 6) / 12));
            return (
              <div key={i} style={{ position: 'absolute', left: 40 * u, right: 40 * u, top: 30 * u + i * rowH, height: rowH, display: 'flex', alignItems: 'center', gap: 20 * u, borderBottom: i < results.length - 1 ? `${1 * u}px solid #2a2d33` : 'none', opacity: o, transform: `translateY(${(1 - o) * 14 * u}px)` }}>
                <svg width={30 * u} height={30 * u} viewBox="0 0 24 24" style={{ flex: 'none' }}><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="#6a6d74" strokeWidth="2.4" /><line x1="15.5" y1="15.5" x2="21" y2="21" stroke="#6a6d74" strokeWidth="2.4" strokeLinecap="round" /></svg>
                <div style={{ fontSize: 38 * u, color: 'rgba(242,240,234,0.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{highlight(r, query, accent)}</div>
              </div>
            );
          })}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const SearchReveal: React.FC = () => (
  <SearchRevealShot
    query="夜間課程 報名"
    results={['夜間課程 報名 額滿', '夜間課程 報名 候補名單', '夜間課程 報名 下一期時間']}
    badge="熱度 ↑"
  />
);
