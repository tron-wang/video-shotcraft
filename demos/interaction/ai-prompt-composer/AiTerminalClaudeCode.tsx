// ai-prompt-composer 的「Claude Code 终端机」款（2026-09，参考 remocn「claude-code」的动效，程式为本卡自写；remocn 为 MIT 授权）。
// 终端机视窗浮现 → 陶土橘外框的欢迎框画出 → 输入框里逐字打入提问 → Enter：提问进入对话纪录，
// 「✻ Thinking…」星芒轮转 → 工具呼叫一条条出现（⏺ Read(…) / ⎿ 结果）→ 回答逐字串流。
// 只重现 CLI 的版型、字符与配色，不放官方 logo 图档；产品名以文字呈现。整体极缓慢推近（1 → 1.04），不停在静帧。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { DEMO_ANSWER, DEMO_PROMPT } from './AiPromptComposer';

export const AI_TERMINAL_CLAUDE_CODE_DURATION = 270; // 9s @30fps

export type TerminalTool = { name: string; arg: string; result: string };
export type AiTerminalClaudeCodeProps = {
  prompt: string;
  answer?: string;
  /** 回答前的工具呼叫（0–3 条）。 */
  tools?: TerminalTool[];
  /** 欢迎框里的工作目录、视窗标题。 */
  cwd?: string;
  title?: string;
  typeAt?: number;
  framesPerChar?: number;
  answerCharsPerFrame?: number;
  accent?: string;
  bg?: string;
};

const MONO = 'Menlo, "SF Mono", "PingFang TC", "Noto Sans TC", monospace';
const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export const AiTerminalClaudeCodeShot: React.FC<AiTerminalClaudeCodeProps> = ({
  prompt, answer = '', tools = [], cwd = '~/projects/demo', title = 'claude', typeAt = 40, framesPerChar = 2, answerCharsPerFrame = 1.2,
  accent = '#d97757', bg = '#0b0c0f',
}) => {
  const f = useCurrentFrame();
  const { width: W, height: H, durationInFrames: D } = useVideoConfig();
  const u = Math.min(W, H) / 1080;
  const land = W >= H;
  const winW = land ? Math.min(W * 0.84, 1560 * u) : W * 0.92;
  const winH = land ? H * 0.86 : H * 0.6;
  const fs = (land ? 32 : 30) * u;
  const lh = fs * 1.55;
  const TXT = '#e8e6e3', DIM = '#8b8b8b', LINE = '#3a3a3a';

  // 时序
  const winIn = easeOutCubic(clamp01(f / 18));
  const boxDraw = easeOutCubic(clamp01((f - 8) / 22));
  const chars = Array.from(prompt);
  const n = Math.max(0, Math.min(chars.length, Math.floor((f - typeAt) / framesPerChar) + 1));
  const typed = f >= typeAt ? chars.slice(0, n).join('') : '';
  const enterAt = typeAt + chars.length * framesPerChar + 12;
  const entered = f >= enterAt;
  const toolAt = (i: number) => enterAt + 30 + i * 22;
  const answerAt = toolAt(tools.length) + (tools.length ? 6 : 0);
  const thinking = entered && f < answerAt;
  const aChars = Array.from(answer);
  const an = Math.max(0, Math.min(aChars.length, Math.floor((f - answerAt) * answerCharsPerFrame)));
  const caret = Math.floor(f / 15) % 2 === 0;
  const push = 1 + 0.04 * easeInOutSine(clamp01(f / D));
  const rise = (at: number, len = 10) => { const t = easeOutCubic(clamp01((f - at) / len)); return { opacity: t, transform: `translateY(${(1 - t) * 10 * u}px)` }; };

  const bullet = (color: string) => <span style={{ color, marginRight: fs * 0.6 }}>⏺</span>;

  return (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: W / 2, top: H * 0.3, width: 1600 * u, height: 900 * u, transform: 'translate(-50%,-50%)', background: `radial-gradient(closest-side, ${accent}14, transparent)` }} />
      <div style={{
        position: 'absolute', left: (W - winW) / 2, top: (H - winH) / 2, width: winW, height: winH, borderRadius: 18 * u, overflow: 'hidden',
        background: '#1a1a1a', border: `${1.5 * u}px solid ${LINE}`, boxShadow: `0 ${30 * u}px ${90 * u}px rgba(0,0,0,0.6)`,
        opacity: winIn, transform: `translateY(${(1 - winIn) * 30 * u}px) scale(${(0.97 + 0.03 * winIn) * push})`, fontFamily: MONO, fontSize: fs, lineHeight: `${lh}px`, color: TXT,
      }}>
        {/* 标题列 */}
        <div style={{ height: 56 * u, borderBottom: `${1 * u}px solid ${LINE}`, display: 'flex', alignItems: 'center', padding: `0 ${22 * u}px`, gap: 12 * u, background: '#222' }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{ width: 18 * u, height: 18 * u, borderRadius: '50%', background: c, opacity: 0.85 }} />)}
          <span style={{ flex: 1, textAlign: 'center', fontSize: 22 * u, color: DIM, marginRight: 80 * u }}>{title} — {cwd}</span>
        </div>

        <div style={{ padding: `${22 * u}px ${36 * u}px` }}>
          {/* 欢迎框：外框由左上顺时针画出 */}
          <div style={{ position: 'relative', display: 'inline-block', padding: `${12 * u}px ${28 * u}px`, marginBottom: 16 * u }}>
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
              <rect x={0} y={0} width="100%" height="100%" rx={10 * u} fill="none" stroke={accent} strokeWidth={2 * u} pathLength={1} strokeDasharray={`${boxDraw} 1`} />
            </svg>
            <div style={rise(14, 14)}><span style={{ color: accent }}>✻</span> Welcome to <b>Claude Code</b>!</div>
            <div style={{ ...rise(20, 14), color: DIM, fontSize: fs * 0.82, marginTop: 10 * u }}>/help for help, /status for your current setup</div>
            <div style={{ ...rise(24, 14), color: DIM, fontSize: fs * 0.82 }}>cwd: {cwd}</div>
          </div>

          {/* 对话纪录 */}
          {entered ? (
            <div style={{ ...rise(enterAt, 8), color: DIM, marginBottom: 14 * u }}>&gt; {prompt}</div>
          ) : null}
          {tools.map((t, i) => (f >= toolAt(i) ? (
            <div key={i} style={{ ...rise(toolAt(i)), marginBottom: 8 * u }}>
              <div>{bullet(f < toolAt(i) + 14 ? (Math.floor(f / 4) % 2 ? '#6fbf73' : DIM) : '#6fbf73')}<b>{t.name}</b>({t.arg})</div>
              <div style={{ color: DIM, paddingLeft: fs * 1.2, opacity: clamp01((f - toolAt(i) - 12) / 8) }}>⎿&nbsp; {t.result}</div>
            </div>
          ) : null))}
          {f >= answerAt && answer ? (
            <div style={{ display: 'flex', whiteSpace: 'pre-wrap', marginTop: 6 * u }}>
              {bullet(TXT)}
              <div>{aChars.slice(0, an).join('')}</div>
            </div>
          ) : null}
          {thinking ? (
            <div style={{ color: accent, marginTop: 10 * u }}>
              {SPIN[Math.floor(f / 3) % SPIN.length]} Thinking…<span style={{ color: DIM }}> ({Math.max(1, Math.floor((f - enterAt) / 30))}s · esc to interrupt)</span>
            </div>
          ) : null}

          {/* 输入框 */}
          <div style={{ ...rise(28, 14), marginTop: 22 * u, border: `${1.5 * u}px solid ${LINE}`, borderRadius: 10 * u, padding: `${10 * u}px ${20 * u}px`, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            <span style={{ color: DIM, marginRight: fs * 0.6 }}>&gt;</span>
            {!entered && typed ? <span>{typed}</span> : null}
            {!entered && !typed ? <span style={{ color: '#5c5c5c' }}>Try "整理這份資料的重點"</span> : null}
            <span style={{ display: 'inline-block', width: fs * 0.6, height: fs * 1.15, marginLeft: 2 * u, background: TXT, opacity: !entered && typed ? 1 : caret ? 0.9 : 0 }} />
          </div>
          <div style={{ ...rise(30, 14), color: '#5c5c5c', fontSize: fs * 0.72, marginTop: 6 * u, paddingLeft: 20 * u }}>? for shortcuts</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// demo：虚构的「夜間課程」资料夹，读一个档、跑一次统计，再回答
export const AiTerminalClaudeCode: React.FC = () => (
  <AiTerminalClaudeCodeShot
    prompt={DEMO_PROMPT}
    answer={DEMO_ANSWER}
    cwd="~/projects/night-class"
    tools={[{ name: 'Read', arg: 'data/enrollment.csv', result: 'Read 412 lines' }, { name: 'Bash', arg: 'python stats.py', result: '成長 41% · 候補 438 人' }]}
  />
);
