// chat-bubble-thread — 群聊对话串：打字提示 → 气泡弹入 → 列表同拍上推
// 对方消息先出"正在输入"三点气泡（占住消息的槽位顶端），到点后三点收掉、真正的气泡
// 在同一位置从头像侧弹出（scale 0.86→1 + back 过冲）；自己的消息先在输入框里按真人
// 速度逐字打出，按下发送键后清空输入框、气泡从右侧弹出。内容超出视口时，列表滚动与
// 新气泡**同帧起步**——先弹后滚会让新气泡在视口外弹一下，读不到。
//
// 所有行在挂载时就排好版（未出现的行只是透明），实测每行的 top/height 之后，滚动量
// 由"每个事件帧的需求高度"逐段缓动累加得出，逐帧可算、无跨帧状态。参数以 1920×1080 标定。
import React, { useEffect, useRef, useState } from 'react';
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export const CHAT_BUBBLE_THREAD_DURATION = 250; // 8.3s @30fps

// ---- 版式 ----
const WIN_W = 900;
const WIN_H = 980;
const HEADER_H = 124;
const COMPOSER_H = 136;
const VIEW_H = WIN_H - HEADER_H - COMPOSER_H;
const LIST_PAD = 36;
const ROW_GAP = 22;
const AVATAR = 56;
const FONT = 34; // 气泡正文：≥32px 才在小窗里读得清
const INDICATOR_H = 84;

// ---- 编舞 ----
const POP = 10; // f：气泡弹入
const POP_FADE = 5; // f：透明度只占弹入的前半——先"到位"再"变实"会发虚
const INDICATOR_OUT = 3; // f：三点气泡收掉
const SCROLL = 12; // f：列表上推
const TYPE_RATE = 0.29; // 字/帧 ≈ 8.7 字/秒：真人打字速度，观众能跟读
const SEND_PRESS = 10; // f：发送键按压回弹
const CARD_FILL_DELAY = 4; // f：卡片内进度条晚于卡片弹入——次级动作让位主动作

const INK = '#1d1d1f';
const INK_DIM = '#8a8a94';
const ACCENT = '#7A5AF8';
const INCOMING_BG = '#f0f0f5';
const SANS = '-apple-system, "PingFang SC", BlinkMacSystemFont, "Segoe UI", sans-serif';
const MESH_BG =
  'radial-gradient(52% 44% at 18% 22%, rgba(122,90,248,0.20) 0%, rgba(122,90,248,0) 70%),' +
  'radial-gradient(46% 42% at 84% 18%, rgba(255,138,178,0.20) 0%, rgba(255,138,178,0) 70%),' +
  'radial-gradient(58% 50% at 78% 84%, rgba(96,190,255,0.20) 0%, rgba(96,190,255,0) 70%),' +
  'linear-gradient(180deg, #f7f6f9 0%, #f2f1f5 100%)';

type Person = 'mia' | 'leo' | 'me';
const PEOPLE: Record<Exclude<Person, 'me'>, { initial: string; color: string }> = {
  mia: { initial: 'M', color: 'linear-gradient(135deg, #ffb07a, #ff6f91)' },
  leo: { initial: 'L', color: 'linear-gradient(135deg, #6fd3ff, #5b7cfa)' },
};

type Msg =
  | { from: Person; kind: 'text'; text: string; at: number; typingFrom?: number; composeFrom?: number }
  | { from: Person; kind: 'card'; at: number; typingFrom?: number };

// at < 0 = 开场前已在对话里
const THREAD: Msg[] = [
  { from: 'mia', kind: 'text', text: 'Morning! Is the release build green?', at: -1 },
  { from: 'me', kind: 'text', text: 'All checks passed.', at: -1 },
  { from: 'leo', kind: 'text', text: 'Nice. Staging looks solid too.', at: 36, typingFrom: 10 },
  { from: 'me', kind: 'text', text: 'Shipping it now.', at: 116, composeFrom: 54 },
  { from: 'mia', kind: 'card', at: 156, typingFrom: 132 },
  { from: 'leo', kind: 'text', text: 'Congrats, team!', at: 204, typingFrom: 180 },
];

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const POP_EASE = Easing.out(Easing.back(1.7));
const SCROLL_EASE = Easing.bezier(0.25, 1, 0.5, 1);

const popStyle = (frame: number, at: number, isMe: boolean): React.CSSProperties => {
  if (at < 0) return {};
  const t = interpolate(frame, [at, at + POP], [0, 1], { ...clamp, easing: POP_EASE });
  return {
    opacity: interpolate(frame, [at, at + POP_FADE], [0, 1], clamp),
    transform: `translateY(${(1 - Math.min(1, t)) * 14}px) scale(${0.86 + 0.14 * t})`,
    transformOrigin: isMe ? 'right top' : 'left top',
  };
};

const Avatar: React.FC<{ who: Exclude<Person, 'me'>; size?: number; ring?: boolean }> = ({ who, size = AVATAR, ring }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size,
      background: PEOPLE[who].color,
      color: '#fff',
      fontSize: size * 0.44,
      fontWeight: 600,
      display: 'grid',
      placeItems: 'center',
      flex: '0 0 auto',
      boxShadow: ring ? '0 0 0 4px #fbfbfd' : undefined,
    }}
  >
    {PEOPLE[who].initial}
  </div>
);

const TypingDots: React.FC<{ frame: number; start: number; end: number }> = ({ frame, start, end }) => {
  const appear = interpolate(frame, [start, start + POP - 2], [0, 1], { ...clamp, easing: POP_EASE });
  const leave = interpolate(frame, [end, end + INDICATOR_OUT], [1, 0], clamp);
  if (frame < start || frame >= end + INDICATOR_OUT) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        height: INDICATOR_H,
        padding: '0 30px',
        borderRadius: 34,
        borderTopLeftRadius: 12,
        background: INCOMING_BG,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        opacity: Math.min(1, appear) * leave,
        transform: `scale(${(0.86 + 0.14 * appear) * (0.9 + 0.1 * leave)})`,
        transformOrigin: 'left top',
      }}
    >
      {[0, 1, 2].map((i) => {
        const phase = ((frame - start) / 18 - i * 0.18) * Math.PI * 2;
        const lift = Math.max(0, Math.sin(phase));
        return (
          <div
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: 14,
              background: '#9a9aa6',
              opacity: 0.45 + 0.55 * lift,
              transform: `translateY(${-8 * lift}px)`,
            }}
          />
        );
      })}
    </div>
  );
};

const ReleaseCard: React.FC<{ frame: number; at: number }> = ({ frame, at }) => {
  const fill = interpolate(frame, [at + CARD_FILL_DELAY, at + CARD_FILL_DELAY + 18], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.3, 0, 0.2, 1),
  });
  return (
    <div
      style={{
        width: 540,
        padding: '28px 32px 30px',
        borderRadius: 34,
        borderTopLeftRadius: 12,
        background: '#fff',
        border: '2px solid #ececf2',
        boxShadow: '0 12px 40px rgba(40, 30, 90, 0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 32, color: '#1f9d63', fontWeight: 600 }}>
        <div style={{ width: 14, height: 14, borderRadius: 14, background: '#2ecc8f' }} />
        Deploy complete
      </div>
      <div style={{ marginTop: 10, fontSize: 48, fontWeight: 650, color: INK, letterSpacing: '-0.02em' }}>v2.4 is live</div>
      <div style={{ marginTop: 20, height: 12, borderRadius: 12, background: '#ececf2', overflow: 'hidden' }}>
        <div style={{ width: `${fill * 100}%`, height: '100%', borderRadius: 12, background: 'linear-gradient(90deg, #2ecc8f, #22b8a0)' }} />
      </div>
      <div style={{ marginTop: 16, fontSize: 32, color: INK_DIM, fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(fill * 12)}/12 regions · 4m 12s
      </div>
    </div>
  );
};

export const ChatBubbleThread: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [handle] = useState(() => delayRender('chat-bubble-thread: measure rows'));
  const [rows, setRows] = useState<{ top: number; bottom: number }[] | null>(null);

  useEffect(() => {
    setRows(
      rowRefs.current.map((el) => ({
        top: el?.offsetTop ?? 0,
        bottom: (el?.offsetTop ?? 0) + (el?.offsetHeight ?? 0),
      })),
    );
  }, []);
  useEffect(() => {
    if (rows) continueRender(handle);
  }, [rows, handle]);

  // 滚动：每个事件帧给出"需要露出到多高"，目标取历史最大值，逐段缓动累加
  let scroll = 0;
  if (rows) {
    const events: { at: number; need: number }[] = [];
    THREAD.forEach((m, i) => {
      if (m.at < 0) return;
      if (m.from !== 'me' && m.typingFrom !== undefined) events.push({ at: m.typingFrom, need: rows[i].top + INDICATOR_H });
      events.push({ at: m.at, need: rows[i].bottom });
    });
    events.sort((a, b) => a.at - b.at);
    let reached = 0;
    for (const e of events) {
      const target = Math.max(reached, e.need + LIST_PAD - VIEW_H);
      scroll += (target - reached) * interpolate(frame, [e.at, e.at + SCROLL], [0, 1], { ...clamp, easing: SCROLL_EASE });
      reached = target;
    }
  }

  // 输入框：正在打的那条自己的消息
  const composing = THREAD.find(
    (m): m is Extract<Msg, { kind: 'text' }> =>
      m.kind === 'text' && m.composeFrom !== undefined && frame >= m.composeFrom - 8 && frame < m.at,
  );
  const typed = composing
    ? Array.from(composing.text)
        .slice(0, Math.max(0, Math.floor((frame - (composing.composeFrom ?? 0)) * TYPE_RATE)))
        .join('')
    : '';
  const typingDone = composing ? typed.length === Array.from(composing.text).length : false;
  const caretOn = composing ? !typingDone || Math.floor(frame / 16) % 2 === 0 : false;
  const nextSend = THREAD.find((m) => m.from === 'me' && m.at >= 0 && frame < m.at + SEND_PRESS);
  const press = nextSend
    ? interpolate(frame, [nextSend.at - 3, nextSend.at, nextSend.at + SEND_PRESS], [1, 0.84, 1], {
        ...clamp,
        easing: Easing.inOut(Easing.quad),
      })
    : 1;
  const sendActive = typed.length > 0;

  const push = interpolate(frame, [0, durationInFrames - 1], [1, 1.035], { ...clamp, easing: Easing.inOut(Easing.sin) });

  return (
    <AbsoluteFill style={{ background: MESH_BG, fontFamily: SANS, alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: WIN_W,
          height: WIN_H,
          borderRadius: 44,
          background: '#fbfbfd',
          boxShadow: '0 40px 120px rgba(40, 30, 90, 0.18), 0 0 0 1px rgba(40, 30, 90, 0.06)',
          overflow: 'hidden',
          position: 'relative',
          transform: `scale(${push})`,
        }}
      >
        {/* 头部 */}
        <div
          style={{
            height: HEADER_H,
            padding: '0 40px',
            display: 'flex',
            alignItems: 'center',
            gap: 22,
            borderBottom: '2px solid #ececf2',
          }}
        >
          <div style={{ display: 'flex' }}>
            <Avatar who="mia" size={60} ring />
            <div style={{ marginLeft: -18 }}>
              <Avatar who="leo" size={60} ring />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 38, fontWeight: 650, color: INK, letterSpacing: '-0.01em' }}>Launch crew</div>
            <div style={{ fontSize: 32, color: INK_DIM }}>3 members</div>
          </div>
        </div>

        {/* 消息列表 */}
        <div style={{ position: 'absolute', top: HEADER_H, left: 0, right: 0, height: VIEW_H, overflow: 'hidden' }}>
          <div
            style={{
              position: 'relative',
              padding: `${LIST_PAD}px 40px`,
              display: 'flex',
              flexDirection: 'column',
              gap: ROW_GAP,
              transform: `translateY(${-scroll}px)`,
              opacity: rows ? 1 : 0,
            }}
          >
            {THREAD.map((m, i) => {
              const isMe = m.from === 'me';
              const indicator = !isMe && m.typingFrom !== undefined;
              const avatarAt = indicator ? (m.typingFrom as number) : m.at;
              return (
                <div
                  key={i}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', alignItems: 'flex-start', gap: 18 }}
                >
                  {!isMe && (
                    <div style={popStyle(frame, avatarAt, false)}>
                      <Avatar who={m.from as Exclude<Person, 'me'>} />
                    </div>
                  )}
                  <div style={{ position: 'relative' }}>
                    {indicator && <TypingDots frame={frame} start={m.typingFrom as number} end={m.at} />}
                    <div style={popStyle(frame, m.at, isMe)}>
                      {m.kind === 'card' ? (
                        <ReleaseCard frame={frame} at={m.at} />
                      ) : (
                        <div
                          style={{
                            maxWidth: 620,
                            padding: '20px 30px',
                            borderRadius: 34,
                            ...(isMe ? { borderTopRightRadius: 12 } : { borderTopLeftRadius: 12 }),
                            background: isMe ? ACCENT : INCOMING_BG,
                            color: isMe ? '#fff' : INK,
                            fontSize: FONT,
                            lineHeight: 1.3,
                            letterSpacing: '-0.01em',
                          }}
                        >
                          {m.text}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 输入框 */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: COMPOSER_H,
            padding: '0 32px',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            borderTop: '2px solid #ececf2',
            background: '#fbfbfd',
          }}
        >
          <div
            style={{
              flex: 1,
              height: 84,
              borderRadius: 42,
              background: '#f0f0f5',
              padding: '0 34px',
              display: 'flex',
              alignItems: 'center',
              fontSize: FONT,
              color: typed ? INK : '#a3a3ad',
              whiteSpace: 'nowrap',
            }}
          >
            {/* 光标在已打出的字之后；还没打字时停在占位符之前 */}
            {typed}
            {composing && <span style={{ width: 3, height: 42, margin: '0 3px', background: ACCENT, opacity: caretOn ? 1 : 0 }} />}
            {!typed && 'Message'}
          </div>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 84,
              background: sendActive || press < 1 ? ACCENT : '#cfc8f7',
              display: 'grid',
              placeItems: 'center',
              transform: `scale(${press})`,
            }}
          >
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none">
              <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
