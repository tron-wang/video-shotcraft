// ai-prompt-composer —— AI 对话框：提问打字 → 送出 → 回答串流（2026-09，参考 remocn「claude-chat」「chat-gpt」的动效，
// 程式为本卡自写；remocn 为 MIT 授权）。**不带任何 AI 产品的品牌、标志或专属配色**——是通用的「问 AI」介面。
// 时序：问候语与输入框浮现 → 游标闪烁 → 提问逐字打入（一有字，麦克风钮就形变成金色送出钮）→ 按下送出
// → 输入框的文字上移成使用者气泡 → 回答一行行串流（先骨架条闪、再逐字出字）。
// 用途：AI 新闻里「有人问 AI…」「AI 这样回答」的那一镜。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

export const AI_PROMPT_COMPOSER_DURATION = 240; // 8s @30fps

export type AiPromptComposerProps = {
  /** 输入框上方的问候语。 */
  greeting?: string;
  placeholder?: string;
  /** 使用者打进去的提问。 */
  prompt: string;
  /** AI 的回答（可含 \n 分段）；空字串 = 只做到送出为止。 */
  answer?: string;
  /** 开始打提问的帧；每几帧打一个字。 */
  typeAt?: number;
  framesPerChar?: number;
  /** 回答串流速度（每帧几个字）。 */
  answerCharsPerFrame?: number;
  /** 助理名称标签（通用，例：「AI 助理」）。 */
  assistantLabel?: string;
  accent?: string;
  bg?: string;
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const FONT = '"PingFang TC","Noto Sans TC",Helvetica,sans-serif';

export const AiPromptComposerShot: React.FC<AiPromptComposerProps> = ({
  greeting = '今天想問什麼？', placeholder = '輸入你的問題…', prompt, answer = '', typeAt = 30, framesPerChar = 2, answerCharsPerFrame = 1.2,
  assistantLabel = 'AI 助理', accent = '#e0b04b', bg = '#0b0c0f',
}) => {
  const f = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const u = Math.min(W, H) / 1080;
  const CW = Math.min(W * 0.86, 1200 * u); // 对话区宽
  const x0 = (W - CW) / 2;

  const inT = easeOutCubic(clamp01(f / 16));
  const chars = Array.from(prompt);
  const n = Math.max(0, Math.min(chars.length, Math.floor((f - typeAt) / framesPerChar) + 1));
  const typed = f >= typeAt ? chars.slice(0, n).join('') : '';
  const doneAt = typeAt + chars.length * framesPerChar;
  const sendAt = doneAt + 10;
  const press = f >= sendAt && f < sendAt + 6 ? 0.9 : 1;
  // 送出后：输入框文字上移成使用者气泡，问候语淡出，输入框清空回原位
  const sent = easeInOutCubic(clamp01((f - sendAt - 4) / 18));
  const answerAt = sendAt + 26;
  const aChars = Array.from(answer);
  const an = Math.max(0, Math.min(aChars.length, Math.floor((f - answerAt - 12) * answerCharsPerFrame)));
  const thinking = f >= answerAt && an === 0 && answer ? 1 : 0;
  const caret = Math.floor(f / 14) % 2 === 0 ? 1 : 0;

  const inputY = H * 0.62, inputH = 120 * u;
  const bubbleY = mix(inputY, H * 0.2, sent);

  return (
    <AbsoluteFill style={{ background: bg, fontFamily: FONT, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: W / 2, top: H * 0.45, width: 1400 * u, height: 900 * u, transform: 'translate(-50%,-50%)', background: `radial-gradient(closest-side, ${accent}18, transparent)` }} />
      {/* 问候语 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: H * 0.42, textAlign: 'center', fontSize: 72 * u, fontWeight: 800, color: '#f2f0ea', opacity: inT * (1 - sent), transform: `translateY(${(1 - inT) * 16 * u}px)` }}>{greeting}</div>

      {/* 使用者气泡（送出后才出现，从输入框位置飞上去） */}
      {f >= sendAt + 4 ? (
        <div style={{ position: 'absolute', right: x0, top: bubbleY, maxWidth: CW * 0.8, padding: `${24 * u}px ${34 * u}px`, borderRadius: 34 * u, background: '#1d2026', border: `${1.5 * u}px solid #2c2f36`, color: '#f2f0ea', fontSize: 40 * u, lineHeight: 1.45 }}>{prompt}</div>
      ) : null}

      {/* 回答 */}
      {f >= answerAt && answer ? (
        <div style={{ position: 'absolute', left: x0, top: H * 0.2 + 150 * u, width: CW, color: 'rgba(242,240,234,0.92)', fontSize: 40 * u, lineHeight: 1.6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 * u, marginBottom: 18 * u, color: accent, fontSize: 30 * u, fontWeight: 800 }}>
            <span style={{ width: 30 * u, height: 30 * u, borderRadius: '50%', background: `conic-gradient(from ${f * 8}deg, ${accent}, ${accent}33, ${accent})` }} />
            {assistantLabel}
          </div>
          {thinking ? (
            [0.9, 0.7, 0.8].map((w, i) => <div key={i} style={{ width: `${w * 100}%`, height: 22 * u, borderRadius: 11 * u, marginBottom: 18 * u, background: `linear-gradient(90deg, #22252c, #34373e ${((f * 3) % 100)}%, #22252c)` }} />)
          ) : (
            <div style={{ whiteSpace: 'pre-wrap' }}>{aChars.slice(0, an).join('')}{an < aChars.length ? <span style={{ display: 'inline-block', width: 14 * u, height: 14 * u, marginLeft: 8 * u, borderRadius: '50%', background: accent }} /> : null}</div>
          )}
        </div>
      ) : null}

      {/* 输入框 */}
      <div style={{ position: 'absolute', left: x0, top: inputY, width: CW, height: inputH, borderRadius: inputH / 2, background: '#16181d', border: `${2 * u}px solid ${accent}55`, boxShadow: `0 ${20 * u}px ${60 * u}px rgba(0,0,0,0.5)`, display: 'flex', alignItems: 'center', opacity: inT, transform: `translateY(${(1 - inT) * 24 * u + sent * (H * 0.24)}px)` }}>
        <div style={{ marginLeft: 44 * u, flex: 1, fontSize: 42 * u, whiteSpace: 'nowrap', overflow: 'hidden', color: typed && f < sendAt + 4 ? '#f2f0ea' : '#6a6d74', display: 'flex', alignItems: 'center' }}>
          {typed && f < sendAt + 4 ? typed : placeholder}
          {f < sendAt ? <span style={{ display: 'inline-block', width: 3 * u, height: 48 * u, marginLeft: 4 * u, background: accent, opacity: typed ? 1 : caret }} /> : null}
        </div>
        {/* 麦克风 → 送出钮：一有字就形变 */}
        <div style={{ width: 84 * u, height: 84 * u, marginRight: 18 * u, borderRadius: '50%', background: typed && f < sendAt + 4 ? accent : '#22252c', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${press})` }}>
          {typed && f < sendAt + 4 ? (
            <svg width={40 * u} height={40 * u} viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke={bg} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          ) : (
            <svg width={40 * u} height={40 * u} viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3" fill="none" stroke="#8a8780" strokeWidth="2" /><path d="M5 11a7 7 0 0014 0M12 18v3" fill="none" stroke="#8a8780" strokeWidth="2" strokeLinecap="round" /></svg>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const AiPromptComposer: React.FC = () => (
  <AiPromptComposerShot
    prompt="幫我整理今年夜間課程報名的三個重點"
    answer={'1. 報名人數比去年同期成長 41%。\n2. 開放不到兩小時就額滿，候補超過四百人。\n3. 下一期名額將加倍，十一月開放報名。'}
  />
);
