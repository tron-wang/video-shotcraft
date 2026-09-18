// post-focus-card — 口播模式「社群贴文」证据卡：一则 X / Threads 贴文截图整则置中、四周留暗底，
// 开场立体浮入（下方 60px 浮上 + rotateX 8°→0 回正 + 阴影由浅变深），
// 旁白念到重点词时相机轻推（1.05–1.12）并往重点偏移，同时在重点上画一笔：荧光笔或手绘圈（每镜 ≤ 2 处）。
// 推近后贴文四边永远留在安全框内（左右 ≥ 60、上 ≥ 130、下 ≤ 1440），不裁字、不满版。
// 清晰度：贴文按画面实际尺寸排版（Img width = 显示宽，2× 原图直接缩下来），3D 变形只在浮入那 18 帧用，
// 之后换回纯 2D——3D 会让 Chrome 按排版尺寸点阵化整层再放大，截图小字会糊。
// 设计坐标 1080×1920；所有时间点都是 props（帧号，相对本镜起点）。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { E, lerp, seg } from '../../_fixtures/Motion';
import { N, NarrationStage } from '../../_fixtures/Narration';
import { inkLoop, type InkRect } from '../ink-circle-note/InkCircleNote';

export const POST_FOCUS_CARD_DURATION = 180; // 6s @30fps

export type PostMark = {
  /** 重点框（贴文页面坐标 = post.png 像素 ÷ 2）。 */
  rect: InkRect;
  /** 画记号 + 相机开始推向这里的词锚帧。 */
  at: number;
  /** marker = 荧光笔（一行内的短语）；circle = 手绘圈（一整句 / 一个标签）。 */
  kind: 'marker' | 'circle';
  /** 推近倍率，预设 1.08；会自动封顶在「推近后左右仍各留 60、上下不出安全框」的倍率（w 860 时约 1.09）。 */
  zoom?: number;
};

export type PostFocusCardProps = {
  /** 贴文画面。成片：<Img src={staticFile('social/<id>/post.png')} style={{ width: '100%', display: 'block' }} />。
   * 必须以容器宽度（= w）排版，不要自己再 scale。 */
  post: React.ReactNode;
  /** 贴文页面坐标宽（post.png 宽 ÷ 2，X 手机版截图通常 642）。 */
  pageW: number;
  /** 要显示的页面坐标高：裁掉底部「閱讀 N 則回覆」按钮与留言，只留到互动数那一行。 */
  pageH: number;
  /** 画面上贴文宽，预设 860（两侧各留 110）。760 太小、960 太满。 */
  w?: number;
  /** 至多 2 处；依时间顺序。 */
  marks?: PostMark[];
  /** 浮入开始帧，预设 4（让镜界的 10f 擦除先开一截）。 */
  enterAt?: number;
  /** 本镜总帧数。 */
  duration: number;
  /** 圈的墨色（白底贴文上用朱红），荧光笔色（预设 N.accent，multiply 叠在字下）。 */
  ink?: string;
  marker?: string;
};

// ───────── 几何与手感常量（蒙皮时不动）─────────
const SAFE_TOP = 150;
const SAFE_H = 1270;
const BOUND = { x0: 60, x1: 1020, y0: 130, y1: 1440 }; // 推近后贴文四边的界线
const RADIUS = 20;
const ENTER = 18; // 浮入帧数
const ENTER_RISE = 60;
const ENTER_TILT = 8; // rotateX 度
const MOVE = 24; // 每次换重点的相机过渡帧数，从 at − 10 开始
const PULL = 0.35; // 往重点偏移的比例（1 = 把重点拉到正中；太大像在找东西）
const DRIFT = 1.02; // 整镜极缓推近
const MARK_IN = 10; // 荧光笔扫出帧数
const CIRCLE_IN = 14; // 画一圈帧数
const INK_PAD = { x: 16, y: 10 }; // 圈与重点框的留白（页面坐标）
// 假笔压：同一路径叠三层，中段逐层加粗（与 ink-circle-note 同一支笔，按 1.3 倍画在显示坐标上）
const PRESSURE: { w: number; a: number; b: number }[] = [
  { w: 6.5, a: 0, b: 1 },
  { w: 8.5, a: 0.1, b: 0.9 },
  { w: 10.4, a: 0.2, b: 0.78 },
];
const DEFAULT_INK = '#c8341f';

const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));

const Stroke: React.FC<{ d: string; p: number; color: string; width: number; a: number; b: number }> = ({ d, p, color, width, a, b }) => {
  const len = Math.min(b, p) - a;
  if (len <= 0.002) return null;
  return <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${len} 2`} strokeDashoffset={-a} />;
};

export const PostFocusCardShot: React.FC<PostFocusCardProps> = ({
  post,
  pageW,
  pageH,
  w = 860,
  marks = [],
  enterAt = 4,
  duration,
  ink = DEFAULT_INK,
  marker = N.accent,
}) => {
  const f = useCurrentFrame();
  const S = w / pageW;
  const h = pageH * S;
  const left = (1080 - w) / 2;
  const top = SAFE_TOP + (SAFE_H - h) / 2;
  const cx = left + w / 2;
  const cy = top + h / 2;

  // A：立体浮入
  const pe = seg(f, enterAt, enterAt + ENTER, E.outCubic);
  const opacity = seg(f, enterAt - 2, enterAt + 6);

  // B：依序推向各重点；偏移夹在安全框内
  const drift = 1 + (DRIFT - 1) * Math.min(1, f / Math.max(1, duration - 1));
  let st = { dx: 0, dy: 0, z: 1 };
  for (const m of marks) {
    // 封顶：推近后贴文仍整则落在安全框内（按整镜最大倍率 × DRIFT 算）
    const zMax = Math.min((BOUND.x1 - BOUND.x0) / (w * DRIFT), (BOUND.y1 - BOUND.y0) / (h * DRIFT));
    const z = Math.max(1, Math.min(m.zoom ?? 1.08, zMax));
    const tz = z * DRIFT;
    const mx = left + (m.rect.x + m.rect.w / 2) * S;
    const my = top + (m.rect.y + m.rect.h / 2) * S;
    const k = (PULL * (z - 1)) / 0.12;
    const next = {
      dx: clamp((cx - mx) * k, BOUND.x0 + (w * tz) / 2 - cx, BOUND.x1 - (w * tz) / 2 - cx),
      dy: clamp((cy - my) * k, BOUND.y0 + (h * tz) / 2 - cy, BOUND.y1 - (h * tz) / 2 - cy),
      z,
    };
    const t = seg(f, m.at - 10, m.at - 10 + MOVE, E.inOutCubic);
    st = { dx: lerp(t, st.dx, next.dx), dy: lerp(t, st.dy, next.dy), z: lerp(t, st.z, next.z) };
  }
  const z = st.z * drift;
  const transform =
    pe < 1
      ? `perspective(1400px) translate(${st.dx}px, ${st.dy + lerp(pe, ENTER_RISE, 0)}px) rotateX(${lerp(pe, ENTER_TILT, 0)}deg) scale(${z})`
      : `translate(${st.dx}px, ${st.dy}px) scale(${z})`;
  const shadow = `0 ${lerp(pe, 4, 14)}px ${lerp(pe, 12, 40)}px rgba(0,0,0,${lerp(pe, 0.2, 0.5)})`;

  const sr = (r: InkRect): InkRect => ({ x: r.x * S, y: r.y * S, w: r.w * S, h: r.h * S });

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left, top, width: w, height: h, transform, transformOrigin: '50% 50%', opacity }}>
        <div style={{ position: 'relative', width: w, height: h, borderRadius: RADIUS, overflow: 'hidden', background: '#fff', boxShadow: shadow }}>
          {post}
          {marks.map((m, i) =>
            m.kind === 'marker' ? (
              <div
                key={i}
                style={{
                  position: 'absolute', left: m.rect.x * S - 2, top: m.rect.y * S, width: m.rect.w * S + 4, height: m.rect.h * S,
                  background: marker, opacity: 0.55, mixBlendMode: 'multiply', borderRadius: 5,
                  transform: `scaleX(${seg(f, m.at, m.at + MARK_IN, E.outCubic)})`, transformOrigin: '0 50%',
                }}
              />
            ) : null,
          )}
        </div>
        {/* 圈画在贴文外框之外的同一层：圈可以略微出贴文边，不被圆角裁掉 */}
        <svg width={w} height={h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
          {marks.map((m, i) => {
            if (m.kind !== 'circle' || f < m.at) return null;
            const loop = inkLoop(sr(m.rect), 11 + i * 7, INK_PAD.x * S, INK_PAD.y * S);
            const pc = seg(f, m.at, m.at + CIRCLE_IN, E.inOutQuad);
            return (
              <g key={i} opacity={0.94}>
                {PRESSURE.map((l, j) => (
                  <Stroke key={j} d={loop.d} p={pc} color={ink} width={l.w} a={l.a} b={l.b} />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

// ───────────────────────── demo ─────────────────────────
// 假贴文：页面坐标 642 宽，以 CSS zoom 排到显示宽（zoom 会按实际尺寸重新排版，不是点阵放大）。
const DEMO_PAGE_W = 642;
const DEMO_PAGE_H = 560;
const FakePost: React.FC<{ zoom: number }> = ({ zoom }) => (
  <div style={{ width: DEMO_PAGE_W, height: DEMO_PAGE_H, zoom, background: '#fff', color: '#0f1419', fontFamily: N.font, position: 'relative' }}>
    <div style={{ position: 'absolute', left: 24, top: 22, width: 52, height: 52, borderRadius: 26, background: '#5b8cff' }} />
    <div style={{ position: 'absolute', left: 90, top: 22, fontSize: 21, fontWeight: 800 }}>城市觀察站</div>
    <div style={{ position: 'absolute', left: 90, top: 50, fontSize: 19, color: '#536471' }}>@city_watch · 跟隨</div>
    <div style={{ position: 'absolute', right: 26, top: 20, fontSize: 30, fontWeight: 900 }}>𝕏</div>
    <div style={{ position: 'absolute', left: 24, top: 110, fontSize: 26, fontWeight: 700 }}>更正啟事</div>
    <div style={{ position: 'absolute', left: 24, top: 160, width: 594, fontSize: 25, lineHeight: '36px' }}>
      昨日貼文所稱「全線停駛三天」有誤，實際為部分路段夜間施工，白天照常營運。造成誤會，深感抱歉。
    </div>
    <div style={{ position: 'absolute', left: 24, top: 300, width: 594, height: 150, borderRadius: 16, background: '#e8eef5' }} />
    <div style={{ position: 'absolute', left: 24, top: 470, fontSize: 18, color: '#536471' }}>上午 9:12 · 2026年9月18日</div>
    <div style={{ position: 'absolute', left: 24, top: 505, width: 594, borderTop: '1px solid #eff3f4', paddingTop: 14, fontSize: 18, color: '#536471' }}>♥ 3,204　　💬 回覆　　🔗 複製貼文的連結</div>
  </div>
);

export const PostFocusCard: React.FC = () => {
  const w = 860;
  return (
    <NarrationStage>
      <PostFocusCardShot
        duration={POST_FOCUS_CARD_DURATION}
        post={<FakePost zoom={w / DEMO_PAGE_W} />}
        pageW={DEMO_PAGE_W}
        pageH={DEMO_PAGE_H}
        w={w}
        marks={[
          { rect: { x: 24, y: 108, w: 108, h: 36 }, at: 50, kind: 'circle' }, // 「更正啟事」
          { rect: { x: 174, y: 196, w: 150, h: 34 }, at: 110, kind: 'marker' }, // 「白天照常營運」
        ]}
      />
    </NarrationStage>
  );
};
