// photo-drift-stack —— 这一段只有照片、没有实拍：2–3 张照片做成圆角大卡，口播讲到谁，谁那张才从下方推上来，
// 盖住前一张；前一张缩小、后退、上移、变暗，上缘露出一截留在后面（iOS 叠页感）——观众同时读到
// 「现在讲这张」与「刚才讲过那几张」。每张卡左下是编号 + 大字说明，照片内部只有极缓推近。
// （2026-09 改版：原「相纸错落 + 视差漂移」读起来老套，使用者从四个方案里选了这个「叠卡推入」。）
// 所有时间点都是 props（帧号）；成片里来自 f(tWord(i, '词'))。
import React from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { FakePhoto, N, NarrationStage } from '../../_fixtures/Narration';
import { E, lerp, seg } from '../../_fixtures/Motion';

export type DriftPhoto = {
  /** public/ 下的照片路径（走 staticFile）。不给就画 FakePhoto 占位。 */
  src?: string;
  /** 这张卡推上来的词锚（帧）。此前完全不可见。 */
  at: number;
  /** 卡上的大字说明（地名 / 人名 / 物件，≤ 8 字）。 */
  caption?: string;
  /** 说明下的一行小字（补充：日期、身分、地点），≤ 16 字。 */
  sub?: string;
  /** 裁切中心 [x%, y%]（objectPosition），预设 [50, 50]。 */
  focus?: [number, number];
};

export type PhotoDriftStackProps = {
  /** 2–3 张，依 at 先后叠放；超过 3 张只取最早的 3 张。 */
  photos: DriftPhoto[];
  /** 单张推入所用帧数，预设 20。 */
  enterFrames?: number;
  /** 说明上方显示「01 / 03」编号，预设 true；只有 1 张时自动不显示。 */
  showIndex?: boolean;
  /** 统一色调的薄罩（盖在每张照片上），amount 上限 0.08；传 null 关闭。 */
  tint?: { color?: string; amount?: number } | null;
  /** 本镜总帧数（极缓推近的分母）。 */
  duration: number;
  /** 只影响 FakePhoto 占位。 */
  seed?: number;
  /** 编号色，预设 N.accent。 */
  accent?: string;
};

// ───────── 几何与手感常量（蒙皮时不动）─────────
const CARD = { left: 60, top: 250, w: 960, h: 1150 }; // 后面的卡上移露出，最上缘约 y 140
const RADIUS = 34;
const MAX_CARDS = 3;
const MAX_TINT = 0.08;
const BACK_SCALE = 0.07; // 每被压一层缩小 7%
const BACK_LIFT = 56; // 每被压一层上移 56px（缩放原点在卡顶，露出上缘一截）
const BACK_DIM = 0.35; // 被压第一层亮度降到 0.65；再压一层不再更暗（避免读不出是照片）
const PUSH = 0.04; // 照片内部整镜极缓推近
const CAP_IN = 12; // 说明浮现帧数（推入后 12 帧开始）

export const PhotoDriftStackShot: React.FC<PhotoDriftStackProps> = ({
  photos, enterFrames = 20, showIndex = true, tint = {}, duration, seed = 0, accent = N.accent,
}) => {
  const f = useCurrentFrame();
  const list = [...photos].sort((a, b) => a.at - b.at).slice(0, MAX_CARDS);
  const tintAmt = tint === null ? 0 : Math.min(MAX_TINT, tint.amount ?? 0.06);
  const tintColor = tint?.color ?? N.accent;
  const n = list.length;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {list.map((p, i) => {
        if (f < p.at) return null;
        const r = seg(f, p.at, p.at + enterFrames, E.outQuart);
        // 被后来的卡压了几层（连续值，推入过程中平滑过渡）
        const covered = list.slice(i + 1).reduce((a, q) => a + seg(f, q.at, q.at + enterFrames, E.outQuart), 0);
        const scale = 1 - BACK_SCALE * covered;
        const ty = lerp(r, 1920 - CARD.top + 40, 0) - BACK_LIFT * covered;
        const dim = 1 - BACK_DIM * Math.min(1, covered);
        const inner = 1.04 + (PUSH * Math.max(0, f - p.at)) / Math.max(1, duration);
        const capO = seg(f, p.at + CAP_IN, p.at + CAP_IN + 12, E.outCubic);
        const pos = `${p.focus?.[0] ?? 50}% ${p.focus?.[1] ?? 50}%`;
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: CARD.left, top: CARD.top, width: CARD.w, height: CARD.h,
              borderRadius: RADIUS, overflow: 'hidden', background: N.bg,
              transform: `translateY(${ty}px) scale(${scale})`, transformOrigin: '50% 0%',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.45)', filter: `brightness(${dim})`,
            }}
          >
            {p.src ? (
              <Img src={staticFile(p.src)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos, transform: `scale(${inner})` }} />
            ) : (
              <FakePhoto seed={seed + i} style={{ transform: `scale(${inner})` }} />
            )}
            {tintAmt > 0 ? <div style={{ position: 'absolute', inset: 0, background: tintColor, opacity: tintAmt, mixBlendMode: 'soft-light' }} /> : null}
            {p.caption ? (
              <>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.72))' }} />
                <div style={{ position: 'absolute', left: 50, bottom: 50, right: 50, fontFamily: N.font, color: N.onDark, opacity: capO, transform: `translateY(${lerp(capO, 12, 0)}px)` }}>
                  {showIndex && n > 1 ? (
                    <div style={{ fontSize: 26, letterSpacing: 4, color: accent, fontWeight: 700 }}>{String(i + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}</div>
                  ) : null}
                  <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.15, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.caption}</div>
                  {p.sub ? <div style={{ fontSize: 32, color: 'rgba(242,240,234,0.72)', marginTop: 4, whiteSpace: 'nowrap' }}>{p.sub}</div> : null}
                </div>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export const PHOTO_DRIFT_STACK_DURATION = 210;

export const PhotoDriftStack: React.FC = () => (
  <NarrationStage>
    <PhotoDriftStackShot
      photos={[
        { at: 10, caption: '奧入瀨溪流', sub: '青森 · 十和田' },
        { at: 78, caption: '弘前公園', sub: '櫻花季' },
        { at: 146, caption: '酸湯溫泉', sub: '八甲田山麓' },
      ]}
      duration={PHOTO_DRIFT_STACK_DURATION}
    />
  </NarrationStage>
);
