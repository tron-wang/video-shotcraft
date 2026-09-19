// cursor-follow-typing —— 游标跟随打字（2026-09，参考 remocn「terminal-cursor-zoom」的动效，程式为本卡自写；remocn 为 MIT 授权）。
// 一句话逐字打出，镜头以高倍率锁在打字游标上、跟着往右推；打完后镜头拉远到整句置中，观众先「跟着读」再「看全句」。
// 两种样式：terminal（等宽字 + 提示符，像在终端机下指令）/ plain（新闻标题式的粗体字）。黑金配色，游标金色方块。
// 游标位置用字宽估算（全形 1em、半形 0.6em，等宽字体准确），不量 DOM。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

export const CURSOR_FOLLOW_TYPING_DURATION = 150; // 5s @30fps

export type CursorFollowTypingProps = {
  /** 要打出的一句话（单行，≤ 40 字为宜）。 */
  text: string;
  /** terminal = 等宽 + 提示符；plain = 粗体标题字。 */
  look?: 'terminal' | 'plain';
  /** 提示符（terminal 款），例：'$ '、'> '。 */
  prompt?: string;
  /** 开始打字的帧；每几帧打一个字。 */
  startAt?: number;
  framesPerChar?: number;
  /** 打字期间的镜头倍率。 */
  zoom?: number;
  /** 打完后拉远所用帧数（0 = 不拉远，停在特写）。 */
  pullFrames?: number;
  /** 整句里要染强调色的一段（打到时即变色）。 */
  emphasis?: string;
  accent?: string;
  bg?: string;
};

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const em = (c: string) => (c.charCodeAt(0) > 0xff ? 1 : 0.6);

export const CursorFollowTypingShot: React.FC<CursorFollowTypingProps> = ({
  text, look = 'terminal', prompt = '$ ', startAt = 12, framesPerChar = 2, zoom = 2.6, pullFrames = 26, emphasis, accent = '#e0b04b', bg = '#0b0c0f',
}) => {
  const f = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const chars = Array.from(text);
  const pre = look === 'terminal' ? Array.from(prompt) : [];
  const totalEm = [...pre, ...chars].reduce((a, c) => a + em(c), 0) + 0.8;
  const fs = Math.min(Math.min(W, H) * 0.09, (W * 0.84) / totalEm); // 全句在 1x 时占画面宽 84% 以内
  const n = Math.max(0, Math.min(chars.length, Math.floor((f - startAt) / framesPerChar) + 1));
  const typedEm = [...pre, ...chars.slice(0, n)].reduce((a, c) => a + em(c), 0);
  const doneAt = startAt + chars.length * framesPerChar;
  const pull = pullFrames > 0 ? easeInOutCubic(clamp01((f - doneAt - 8) / pullFrames)) : 0;
  const lineW = totalEm * fs;
  const x0 = (W - lineW) / 2; // 整句置中时的左缘
  const y0 = H / 2;
  // 镜头：打字时把游标钉在画面中心偏左 12%（前方留空间），拉远时回到整句置中、倍率 1
  const cx = x0 + typedEm * fs, cy = y0;
  const z = mix(zoom, 1, pull);
  const focusX = mix(cx, W / 2, pull), focusY = mix(cy, H / 2, pull);
  const anchorX = mix(W * 0.38, W / 2, pull);
  const blink = f > doneAt + pullFrames + 10 ? (Math.floor(f / 15) % 2 === 0 ? 1 : 0) : 1;
  const emStart = emphasis ? text.indexOf(emphasis) : -1;
  const font = look === 'terminal' ? 'Menlo, "SF Mono", "PingFang TC", monospace' : '"PingFang TC","Noto Sans TC",Helvetica,sans-serif';
  return (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${anchorX - focusX * z}px, ${H / 2 - focusY * z}px) scale(${z})`, transformOrigin: '0 0' }}>
        {/* 底线：一条淡金基线，拉远后让整句有落脚处 */}
        <div style={{ position: 'absolute', left: x0, top: y0 + fs * 0.75, width: lineW, height: Math.max(1, fs * 0.03), background: `${accent}33` }} />
        <div style={{ position: 'absolute', left: x0, top: y0 - fs * 0.62, whiteSpace: 'pre', fontFamily: font, fontSize: fs, fontWeight: look === 'terminal' ? 600 : 900, lineHeight: 1.2, color: '#f2f0ea', letterSpacing: 0 }}>
          {pre.length ? <span style={{ color: accent }}>{prompt}</span> : null}
          {chars.slice(0, n).map((c, i) => (
            <span key={i} style={{ display: 'inline-block', width: `${em(c)}em`, textAlign: 'center', color: emStart >= 0 && i >= emStart && i < emStart + (emphasis?.length ?? 0) ? accent : undefined }}>{c}</span>
          ))}
          <span style={{ display: 'inline-block', width: '0.55em', height: '1em', marginLeft: '0.05em', verticalAlign: '-0.12em', background: accent, opacity: blink, boxShadow: `0 0 ${fs * 0.3}px ${accent}` }} />
        </div>
      </div>
      {/* 四周压暗，特写时视线集中在游标 */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 45% 50%, transparent 35%, rgba(0,0,0,0.6) 100%)', opacity: 1 - pull * 0.6 }} />
    </AbsoluteFill>
  );
};

export const CursorFollowTyping: React.FC = () => (
  <CursorFollowTypingShot text="今年報名人數比去年同期成長百分之四十一" look="plain" emphasis="百分之四十一" />
);
