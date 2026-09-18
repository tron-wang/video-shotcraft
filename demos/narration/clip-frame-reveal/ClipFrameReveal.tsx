// clip-frame-reveal —— 一段实拍（或一张照片）不铺满画面，而是装进本片统一的「框」里：
// 框从垂直中线的一道细缝开到全高（遮罩擦除），框内素材同时由 1.08 缓回 1.0，
// 之后只剩 slowPush 极缓推进。三种框式（paper / film / hairline），一部片只选一种。
// 所有时间点都是 props（帧号）；成片里来自 f(tLine(i)) / f(tWord(i, '词'))。
import React from 'react';
import { Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { FakeClip, N, NarrationStage, SAFE, slowPush } from '../../_fixtures/Narration';
import { E, lerp, seg } from '../../_fixtures/Motion';

export type ClipFrameStyle = 'paper' | 'film' | 'hairline';

export type ClipFrameRevealProps = {
  /** 框式。一部片只用一种（见卡片「已知坑」）。 */
  frameStyle: ClipFrameStyle;
  /** public/ 下的素材路径（走 staticFile）。不给就画 FakeClip 占位。 */
  src?: string;
  /** src 是影片还是照片，预设 video。 */
  kind?: 'video' | 'photo';
  /** 自带素材层（例如自己叠的交叉淡化循环）。给了就忽略 src / kind；需自行铺满父层。 */
  media?: React.ReactNode;
  /** 开框起点（帧）。此前整个框完全不可见。 */
  revealAt?: number;
  /** 细缝开到全高所用帧数。 */
  revealFrames?: number;
  /** 框下单行说明。 */
  caption?: string;
  /** 说明出现的词锚（帧）。此前完全不可见；不给则落在开框完成后 6 帧。 */
  captionAt?: number;
  /** 本镜总帧数（slowPush 的分母）。 */
  duration: number;
  /** 素材窗宽 / 高，预设 4/5（直式）。 */
  aspect?: number;
  /** 只影响 FakeClip 占位的色相。 */
  hue?: number;
};

// 框边厚度（上 右 下 左）。hairline 的线画在素材窗内侧，所以外框厚度为 0。
const PAD: Record<ClipFrameStyle, { t: number; r: number; b: number; l: number }> = {
  paper: { t: 34, r: 34, b: 82, l: 34 },
  film: { t: 26, r: 78, b: 26, l: 78 },
  hairline: { t: 0, r: 0, b: 0, l: 0 },
};

const CAPTION_GAP = 24; // 框底到说明的间距
const CAPTION_H = 52; // 说明行高
const SLIT = 6; // 起始细缝高度
const HAIR_INSET = 20; // hairline 线框距素材边
const TICK = 30; // hairline 角标臂长

/** 框 + 素材窗 + 说明的几何：整组放进 SAFE，有说明时先扣掉说明占的高度。 */
export const clipFrameLayout = (frameStyle: ClipFrameStyle, aspect: number, hasCaption: boolean) => {
  const pad = PAD[frameStyle];
  const availH = SAFE.h - (hasCaption ? CAPTION_GAP + CAPTION_H : 0);
  const winW = Math.floor(Math.min(SAFE.w - pad.l - pad.r, (availH - pad.t - pad.b) * aspect));
  const winH = Math.floor(winW / aspect);
  const w = winW + pad.l + pad.r;
  const h = winH + pad.t + pad.b;
  const x = Math.round(SAFE.x + (SAFE.w - w) / 2);
  const y = Math.round(SAFE.y + (availH - h) / 2);
  return { x, y, w, h, pad, winW, winH, captionY: y + h + CAPTION_GAP };
};

const FilmHoles: React.FC<{ h: number; side: 'left' | 'right' }> = ({ h, side }) => {
  const pitch = 58;
  const holeW = 34;
  const holeH = 24;
  const n = Math.floor(h / pitch);
  const y0 = (h - n * pitch) / 2 + (pitch - holeH) / 2;
  return (
    <>
      {Array.from({ length: n }, (_, k) => (
        <div
          key={k}
          style={{
            position: 'absolute', [side]: (PAD.film.l - holeW) / 2, top: y0 + k * pitch,
            width: holeW, height: holeH, borderRadius: 6, background: N.onDark, opacity: 0.8, // 看片灯箱上的齿孔：透光而非透底，暗底上才读得出来
          }}
        />
      ))}
    </>
  );
};

const HairlineOverlay: React.FC = () => (
  <>
    <div style={{ position: 'absolute', inset: HAIR_INSET, border: `1.5px solid ${N.onDark}`, opacity: 0.85 }} />
    {([['left', 'top'], ['right', 'top'], ['left', 'bottom'], ['right', 'bottom']] as const).map(([hx, vy]) => (
      <React.Fragment key={hx + vy}>
        <div style={{ position: 'absolute', [hx]: HAIR_INSET - 9, [vy]: HAIR_INSET - 9, width: TICK, height: 3, background: N.accent }} />
        <div style={{ position: 'absolute', [hx]: HAIR_INSET - 9, [vy]: HAIR_INSET - 9, width: 3, height: TICK, background: N.accent }} />
      </React.Fragment>
    ))}
  </>
);

export const ClipFrameRevealShot: React.FC<ClipFrameRevealProps> = ({
  frameStyle, src, kind = 'video', media, revealAt = 0, revealFrames = 22, caption, captionAt, duration, aspect = 4 / 5, hue = 28,
}) => {
  const frame = useCurrentFrame();
  const L = clipFrameLayout(frameStyle, aspect, !!caption);
  const local = frame - revealAt;

  // 开框：细缝 → 全高。v = 上下各裁掉多少 px。
  const open = seg(local, 0, revealFrames, E.inOutCubic);
  const v = lerp(open, L.h / 2 - SLIT / 2, 0);
  // 素材：开框期间 1.08 → 1.0，叠上一条贯穿全镜的 slowPush（相乘，接缝处没有速度折点）。
  const settle = lerp(seg(local, 0, revealFrames, E.outCubic), 1.08, 1);
  const scale = settle * slowPush(Math.max(0, local), Math.max(2, duration - revealAt));
  // 缝缘的强调色细线：开框后段淡掉。
  const edge = 1 - seg(local, revealFrames * 0.55, revealFrames, E.outQuad);

  const capAt = captionAt ?? revealAt + revealFrames + 6;
  const capIn = seg(frame, capAt, capAt + 10, E.outCubic);

  const fill: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };
  const footage = media ?? (src
    ? kind === 'photo'
      ? <Img src={staticFile(src)} style={fill} />
      : <OffthreadVideo src={staticFile(src)} muted style={fill} />
    : <FakeClip hue={hue} />);

  return (
    <>
      {local >= 0 ? (
        <div style={{ position: 'absolute', left: L.x, top: L.y, width: L.w, height: L.h }}>
          {/* paper 的投影：clip-path 会裁掉 box-shadow，所以另起一层跟着开口长高 */}
          {frameStyle === 'paper' ? (
            <div style={{ position: 'absolute', left: 0, top: v, width: L.w, height: L.h - 2 * v, boxShadow: `0 ${26 * open}px ${70 * open}px rgba(0,0,0,${0.55 * open})` }} />
          ) : null}
          <div
            style={{
              position: 'absolute', inset: 0, overflow: 'hidden',
              clipPath: `inset(${v}px 0px ${v}px 0px)`,
              background: frameStyle === 'paper' ? N.paper : frameStyle === 'film' ? N.ink : 'transparent',
            }}
          >
            <div style={{ position: 'absolute', left: L.pad.l, top: L.pad.t, width: L.winW, height: L.winH, overflow: 'hidden', background: N.bg }}>
              <div style={{ position: 'absolute', inset: 0, transform: `scale(${scale})`, transformOrigin: '50% 50%' }}>{footage}</div>
              {frameStyle === 'paper' ? <div style={{ position: 'absolute', inset: 0, border: `1px solid ${N.line}`, opacity: 0.5 }} /> : null}
              {frameStyle === 'hairline' ? <HairlineOverlay /> : null}
            </div>
            {frameStyle === 'film' ? (
              <>
                <FilmHoles h={L.h} side="left" />
                <FilmHoles h={L.h} side="right" />
                <div style={{ position: 'absolute', inset: 0, border: `1.5px solid ${N.inkSoft}`, opacity: 0.6 }} />
              </>
            ) : null}
          </div>
          {edge > 0 ? (
            <>
              <div style={{ position: 'absolute', left: 0, top: v, width: L.w, height: 2, background: N.accent, opacity: edge }} />
              <div style={{ position: 'absolute', left: 0, top: L.h - v - 2, width: L.w, height: 2, background: N.accent, opacity: edge }} />
            </>
          ) : null}
        </div>
      ) : null}
      {caption && frame >= capAt ? (
        <div
          style={{
            position: 'absolute', left: L.x, top: L.captionY, width: L.w, height: CAPTION_H,
            display: 'flex', alignItems: 'center', gap: 16, opacity: capIn,
            transform: `translateY(${lerp(capIn, 8, 0)}px)`,
            fontFamily: N.font, fontSize: 34, fontWeight: 500, color: N.onDark, whiteSpace: 'nowrap', overflow: 'hidden',
          }}
        >
          <div style={{ width: 28, height: 3, background: N.accent, flex: 'none' }} />
          {caption}
        </div>
      ) : null}
    </>
  );
};

// demo：三种框式各 90f 背靠背，各自开一次框（成片里一部片只用一种）。
const DEMO_EACH = 90;
const DEMO: { frameStyle: ClipFrameStyle; caption: string; hue: number }[] = [
  { frameStyle: 'paper', caption: 'paper｜相紙白邊（示意畫面）', hue: 28 },
  { frameStyle: 'film', caption: 'film｜膠卷齒孔（示意畫面）', hue: 200 },
  { frameStyle: 'hairline', caption: 'hairline｜細線框（示意畫面）', hue: 140 },
];

export const CLIP_FRAME_REVEAL_DURATION = DEMO_EACH * DEMO.length;

export const ClipFrameReveal: React.FC = () => (
  <NarrationStage>
    {DEMO.map((d, i) => (
      <Sequence key={d.frameStyle} from={i * DEMO_EACH} durationInFrames={DEMO_EACH} layout="none">
        <ClipFrameRevealShot {...d} revealAt={4} revealFrames={22} captionAt={40} duration={DEMO_EACH} />
      </Sequence>
    ))}
  </NarrationStage>
);
