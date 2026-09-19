// ai-prompt-composer —— AI 对话框：提问打字 → 送出 → 回答串流（2026-09，参考 remocn「claude-chat」「chat-gpt」的动效，
// 程式为本卡自写；remocn 为 MIT 授权）。
// 三种介面（skin）：neutral（通用黑金，不指向任何产品）/ claude（Claude 网页对话介面的版型与配色）/ chatgpt（ChatGPT 的版型与配色）。
// 产品介面只重现版型、配色与字体气质，**不放官方 logo 图档**，产品名以文字标签呈现（新闻评论式的合理使用）。
// 时序：问候语与输入框浮现 → 游标闪烁 → 提问逐字打入（一有字，麦克风钮就形变成送出钮）→ 按下送出
// → 输入框的文字上移成使用者气泡 → 回答一行行串流（先骨架条闪、再逐字出字）。
// 用途：AI 新闻里「有人问 AI…」「AI 这样回答」的那一镜。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

export const AI_PROMPT_COMPOSER_DURATION = 240; // 8s @30fps

export type AiSkin = 'neutral' | 'claude' | 'chatgpt';

export type AiPromptComposerProps = {
  /** 介面：neutral（预设）/ claude / chatgpt。 */
  skin?: AiSkin;
  /** 输入框上方的问候语；不给用该介面的预设。 */
  greeting?: string;
  placeholder?: string;
  /** 使用者打进去的提问。 */
  prompt: string;
  /** AI 的回答（可含 \n 分段）；空字串 = 只做到送出为止。 */
  answer?: string;
  /** 开始打提问的帧（预设 30；chatgpt 款 48）；每几帧打一个字。 */
  typeAt?: number;
  framesPerChar?: number;
  /** 回答串流速度（每帧几个字）。 */
  answerCharsPerFrame?: number;
  /** 助理名称标签；不给用该介面的预设（neutral =「AI 助理」）。 */
  assistantLabel?: string;
  /** chatgpt 款输入框下方的建议标签（打字时淡出）。 */
  chips?: string[];
  /** 覆盖该介面的强调色 / 底色。 */
  accent?: string;
  bg?: string;
};

type Theme = {
  bg: string; text: string; muted: string; accent: string; input: string; border: string; bubble: string;
  greetingFont: string; greeting: string; placeholder: string; label: string; inputRadius: (h: number) => number;
  sendBg: string; sendFg: string; sendRadius: (s: number) => number; glyph: string;
};
const SANS = '"PingFang TC","Noto Sans TC",Helvetica,sans-serif';
const THEMES: Record<AiSkin, Theme> = {
  neutral: {
    bg: '#0b0c0f', text: '#f2f0ea', muted: '#6a6d74', accent: '#e0b04b', input: '#16181d', border: '#e0b04b55', bubble: '#1d2026',
    greetingFont: SANS, greeting: '今天想問什麼？', placeholder: '輸入你的問題…', label: 'AI 助理', inputRadius: (h) => h / 2,
    sendBg: '#e0b04b', sendFg: '#0b0c0f', sendRadius: (s) => s / 2, glyph: '',
  },
  // Claude 网页版：暖深灰底、陶土橘强调、衬线问候语、圆角方框输入、方形送出钮
  claude: {
    bg: '#262624', text: '#f5f4ed', muted: '#8f8d86', accent: '#d97757', input: '#30302e', border: '#4a4944', bubble: '#1f1e1d',
    greetingFont: '"Songti TC","Noto Serif TC",Georgia,serif', greeting: '晚安，今天想聊什麼？', placeholder: '想問 Claude 什麼？', label: 'Claude',
    inputRadius: () => 26, sendBg: '#d97757', sendFg: '#ffffff', sendRadius: () => 14, glyph: '✻',
  },
  // ChatGPT：中性深灰底、药丸输入框、白色圆形送出钮、下方建议标签
  chatgpt: {
    bg: '#212121', text: '#ececec', muted: '#8e8e8e', accent: '#ffffff', input: '#303030', border: '#3c3c3c', bubble: '#303030',
    greetingFont: SANS, greeting: '有什麼可以幫忙的？', placeholder: '詢問任何問題', label: 'ChatGPT',
    inputRadius: (h) => h / 2, sendBg: '#ffffff', sendFg: '#000000', sendRadius: (s) => s / 2, glyph: '',
  },
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export const AiPromptComposerShot: React.FC<AiPromptComposerProps> = ({
  skin = 'neutral', greeting, placeholder, prompt, answer = '', typeAt, framesPerChar = 2, answerCharsPerFrame = 1.2,
  assistantLabel, chips = ['整理重點', '寫一段說明', '分析數據'], accent, bg,
}) => {
  const f = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  typeAt = typeAt ?? (skin === 'chatgpt' ? 48 : 30); // chatgpt 款多留时间给建议标签
  const T = { ...THEMES[skin], ...(accent ? { accent, border: `${accent}55`, sendBg: skin === 'chatgpt' ? THEMES.chatgpt.sendBg : accent } : {}), ...(bg ? { bg } : {}) };
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
  const sent = easeInOutCubic(clamp01((f - sendAt - 4) / 18));
  const answerAt = sendAt + 26;
  const aChars = Array.from(answer);
  const an = Math.max(0, Math.min(aChars.length, Math.floor((f - answerAt - 12) * answerCharsPerFrame)));
  const thinking = f >= answerAt && an === 0 && answer ? 1 : 0;
  const caret = Math.floor(f / 14) % 2 === 0 ? 1 : 0;
  const hasText = !!typed && f < sendAt + 4;

  const inputY = H * 0.62, inputH = (skin === 'claude' ? 150 : 120) * u, sendS = 84 * u;
  const bubbleY = mix(inputY, H * 0.2, sent);
  const label = assistantLabel ?? T.label;

  return (
    <AbsoluteFill style={{ background: T.bg, fontFamily: SANS, overflow: 'hidden' }}>
      {skin === 'neutral' ? <div style={{ position: 'absolute', left: W / 2, top: H * 0.45, width: 1400 * u, height: 900 * u, transform: 'translate(-50%,-50%)', background: `radial-gradient(closest-side, ${T.accent}18, transparent)` }} /> : null}
      {/* 问候语 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: H * 0.42, textAlign: 'center', fontFamily: T.greetingFont, fontSize: 72 * u, fontWeight: skin === 'claude' ? 500 : 800, color: T.text, opacity: inT * (1 - sent), transform: `translateY(${(1 - inT) * 16 * u}px)` }}>
        {T.glyph ? <span style={{ color: T.accent, marginRight: 18 * u }}>{T.glyph}</span> : null}
        {greeting ?? T.greeting}
      </div>

      {/* 使用者气泡 */}
      {f >= sendAt + 4 ? (
        <div style={{ position: 'absolute', right: x0, top: bubbleY, maxWidth: CW * 0.8, padding: `${24 * u}px ${34 * u}px`, borderRadius: 34 * u, background: T.bubble, border: skin === 'neutral' ? `${1.5 * u}px solid #2c2f36` : 'none', color: T.text, fontSize: 40 * u, lineHeight: 1.45 }}>{prompt}</div>
      ) : null}

      {/* 回答 */}
      {f >= answerAt && answer ? (
        <div style={{ position: 'absolute', left: x0, top: H * 0.2 + 150 * u, width: CW, color: T.text, fontSize: 40 * u, lineHeight: 1.6, fontFamily: skin === 'claude' ? '"Songti TC","Noto Serif TC",Georgia,serif' : SANS }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 * u, marginBottom: 18 * u, color: skin === 'chatgpt' ? T.text : T.accent, fontSize: 30 * u, fontWeight: 800, fontFamily: SANS }}>
            {skin === 'claude'
              ? <span style={{ fontSize: 40 * u, color: T.accent, display: 'inline-block', transform: `rotate(${f * 4}deg)` }}>✻</span>
              : <span style={{ width: 30 * u, height: 30 * u, borderRadius: '50%', background: skin === 'chatgpt' ? `conic-gradient(from ${f * 8}deg, #ffffff, #ffffff33, #ffffff)` : `conic-gradient(from ${f * 8}deg, ${T.accent}, ${T.accent}33, ${T.accent})` }} />}
            {label}
          </div>
          {thinking ? (
            [0.9, 0.7, 0.8].map((w, i) => <div key={i} style={{ width: `${w * 100}%`, height: 22 * u, borderRadius: 11 * u, marginBottom: 18 * u, background: `linear-gradient(90deg, ${T.input}, ${T.border} ${((f * 3) % 100)}%, ${T.input})` }} />)
          ) : (
            <div style={{ whiteSpace: 'pre-wrap' }}>{aChars.slice(0, an).join('')}{an < aChars.length ? <span style={{ display: 'inline-block', width: 14 * u, height: 14 * u, marginLeft: 8 * u, borderRadius: '50%', background: skin === 'chatgpt' ? T.text : T.accent }} /> : null}</div>
          )}
        </div>
      ) : null}

      {/* 输入框 */}
      <div style={{ position: 'absolute', left: x0, top: inputY, width: CW, height: inputH, borderRadius: T.inputRadius(inputH) * (skin === 'claude' ? u : 1), background: T.input, border: `${(skin === 'neutral' ? 2 : 1.5) * u}px solid ${T.border}`, boxShadow: `0 ${20 * u}px ${60 * u}px rgba(0,0,0,0.45)`, display: 'flex', alignItems: skin === 'claude' ? 'flex-start' : 'center', opacity: inT, transform: `translateY(${(1 - inT) * 24 * u + sent * (H * 0.24)}px)` }}>
        <div style={{ marginLeft: 44 * u, marginTop: skin === 'claude' ? 30 * u : 0, flex: 1, fontSize: 42 * u, whiteSpace: 'nowrap', overflow: 'hidden', color: hasText ? T.text : T.muted, display: 'flex', alignItems: 'center' }}>
          {hasText ? typed : placeholder ?? T.placeholder}
          {f < sendAt ? <span style={{ display: 'inline-block', width: 3 * u, height: 48 * u, marginLeft: 4 * u, background: skin === 'neutral' ? T.accent : T.text, opacity: typed ? 1 : caret }} /> : null}
        </div>
        {/* 麦克风 → 送出钮：一有字就形变 */}
        <div style={{ width: sendS, height: sendS, marginRight: 18 * u, marginTop: skin === 'claude' ? inputH - sendS - 16 * u : 0, borderRadius: T.sendRadius(sendS) * (skin === 'claude' ? u : 1), background: hasText ? T.sendBg : skin === 'neutral' ? '#22252c' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${press})` }}>
          {hasText ? (
            <svg width={40 * u} height={40 * u} viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke={T.sendFg} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          ) : (
            <svg width={40 * u} height={40 * u} viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3" fill="none" stroke={T.muted} strokeWidth="2" /><path d="M5 11a7 7 0 0014 0M12 18v3" fill="none" stroke={T.muted} strokeWidth="2" strokeLinecap="round" /></svg>
          )}
        </div>
      </div>
      {/* chatgpt 款：输入框下方的建议标签，打字时淡出 */}
      {skin === 'chatgpt' ? (
        <div style={{ position: 'absolute', left: 0, right: 0, top: inputY + inputH + 34 * u, display: 'flex', justifyContent: 'center', gap: 18 * u, opacity: inT * (1 - clamp01((f - typeAt) / 10)) }}>
          {chips.map((c) => <div key={c} style={{ padding: `${14 * u}px ${28 * u}px`, borderRadius: 999, border: `${1.5 * u}px solid ${T.border}`, color: T.muted, fontSize: 30 * u }}>{c}</div>)}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// demo 共用文案（虚构的「夜間課程」主题；三个介面款的 demo 都用这组）
export const DEMO_PROMPT = '幫我整理今年夜間課程報名的三個重點';
export const DEMO_ANSWER = '1. 報名人數比去年同期成長 41%。\n2. 開放不到兩小時就額滿，候補超過四百人。\n3. 下一期名額將加倍，十一月開放報名。';
export const AiPromptComposer: React.FC = () => <AiPromptComposerShot prompt={DEMO_PROMPT} answer={DEMO_ANSWER} />;
