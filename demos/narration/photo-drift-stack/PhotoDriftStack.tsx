// photo-drift-stack —— 这一段只有照片、没有实拍：2–3 张照片洗成「相纸」错落叠放，
// 口播讲到谁，谁那张才滑进来落在最上面；先到的相纸退后留守（变暗、略缩，不离场）。
// 整叠极缓漂移，各层速率不同形成视差——「活」来自相纸之间的相对位移，而不是照片内部的 Ken-Burns 缩放。
// 相纸边与 clip-frame-reveal 的 paper 框式同比例、同投影，两张 b-roll 卡属于同一部片。
// 所有时间点都是 props（帧号）；成片里来自 f(tWord(i, '词'))。
import React from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { FakePhoto, N, NarrationStage, SAFE } from '../../_fixtures/Narration';
import { E, lerp, rand, seg } from '../../_fixtures/Motion';

export type DriftPhoto = {
  /** public/ 下的照片路径（走 staticFile）。不给就画 FakePhoto 占位。 */
  src?: string;
  /** 这张相纸进场的词锚（帧）。此前完全不可见。 */
  at: number;
  /** 相纸下的单行说明；只在它是最上面那张时显示。 */
  caption?: string;
  /** 裁切中心 [x%, y%]（objectPosition），预设 [50, 50]。 */
  focus?: [number, number];
};

export type PhotoDriftStackProps = {
  /** 2–3 张，依 at 先后叠放；超过 3 张只取最早的 3 张。 */
  photos: DriftPhoto[];
  /** cascade = 逐张往右下错开（不旋转）；fan = 左右小幅交错 + 每张固定的微小旋转（≤ ±2.5°）。 */
  layout?: 'cascade' | 'fan';
  /** 相纸窗宽 / 高，预设 4/5。是窗的比例，不是照片的——照片一律 cover 裁进窗。 */
  aspect?: number;
  /** 最上层在整镜内的总位移（px）。下面两层依序走 0.6×、0.35×。 */
  drift?: { dx: number; dy: number };
  /** 单张进场所用帧数。 */
  enterFrames?: number;
  /** 统一色调的薄罩（盖在每张照片上），amount 上限 0.08；传 null 关闭。 */
  tint?: { color?: string; amount?: number } | null;
  /** 本镜总帧数（漂移的分母）。 */
  duration: number;
  /** 只影响 fan 的旋转角与错位的细微差异；同 seed 永远同一叠。 */
  seed?: number;
};

// 相纸边：与 clip-frame-reveal 的 paper（34 / 34 / 82 / 34，框宽 930）同比例，随相纸宽度缩放。
const PAPER_REF_W = 930;
const EDGE = 34 / PAPER_REF_W;
const EDGE_BOTTOM = 82 / PAPER_REF_W;
const SHADOW = { y: 26, blur: 70, alpha: 0.55 }; // 同 paper 框式的落定投影

const CAPTION_GAP = 24;
const CAPTION_H = 52;
const MAX_PRINTS = 3;
const MAX_ROT = 2.5; // 度
const MAX_TINT = 0.08;
const ENTER_DIST = 84; // 进场滑入距离（≤ 90）
const STEP_BACK_FRAMES = 12;
const STEP_BACK = [ // 依「上面压了几张」取值；0 = 最上面
  { brightness: 1, scale: 1 },
  { brightness: 0.62, scale: 0.97 },
  { brightness: 0.52, scale: 0.945 },
];
const PARALLAX = [1, 0.6, 0.35]; // 依落定后由上往下的层序
const STEP = { cascade: { x: 64, y: 96 }, fan: { x: 46, y: 44 } };

type Print = { x: number; y: number; rot: number; dirX: number; dirY: number; rate: number };

/** 整叠（含说明与漂移行程）放进 SAFE 的几何。回传每张相纸落定后的左上角与固定旋转角。 */
export const photoStackLayout = (
  n: number, layout: 'cascade' | 'fan', aspect: number, hasCaption: boolean, drift: { dx: number; dy: number }, seed: number,
) => {
  // 每张的相对位移（最后一张 = 最上面）与旋转
  const rel = Array.from({ length: n }, (_, i) => {
    const below = n - 1 - i; // 落定后上面压了几张
    const j = (k: number) => (rand(seed * 17 + i * 7 + k) - 0.5) * 2; // −1…1
    if (layout === 'cascade') {
      return { x: i * STEP.cascade.x + j(1) * 6, y: i * STEP.cascade.y + j(2) * 6, rot: 0, below };
    }
    const side = below === 0 ? 0 : below % 2 === 1 ? 1 : -1;
    const mag = below === 0 ? 0.7 + rand(seed * 17 + i) * 0.5 : 1.5 + rand(seed * 17 + i) * (MAX_ROT - 1.5);
    const sign = (i + seed) % 2 === 0 ? -1 : 1;
    return { x: side * STEP.fan.x + j(1) * 5, y: i * STEP.fan.y + j(2) * 4, rot: sign * Math.min(MAX_ROT, mag), below };
  });
  const minX = Math.min(...rel.map((r) => r.x));
  const spanX = Math.max(...rel.map((r) => r.x)) - minX;
  const spanY = Math.max(...rel.map((r) => r.y)) - Math.min(...rel.map((r) => r.y));
  const sinR = Math.sin((Math.max(...rel.map((r) => Math.abs(r.rot))) * Math.PI) / 180);

  // 相纸高 = hf × 相纸宽；旋转后的外接框每边多出 ≈ 对边 × sin / 2
  const hf = (1 - 2 * EDGE) / aspect + EDGE + EDGE_BOTTOM;
  const capH = hasCaption ? CAPTION_GAP + CAPTION_H : 0;
  const availW = SAFE.w - Math.abs(drift.dx) - spanX;
  const availH = SAFE.h - Math.abs(drift.dy) - spanY - capH;
  const w = Math.floor(Math.min(availW / (1 + hf * sinR), availH / (hf + sinR)));
  const h = Math.floor(w * hf);
  const padX = Math.round(w * EDGE);
  const padB = Math.round(w * EDGE_BOTTOM);
  const groupW = w + spanX;
  const groupH = h + spanY + capH;
  const x0 = SAFE.x + (SAFE.w - groupW) / 2 - minX;
  const y0 = SAFE.y + (SAFE.h - groupH) / 2;

  const prints: Print[] = rel.map((r) => {
    // 进场方向 = 它在叠里错开的方向（cascade：右下；fan：所在那一侧的斜下，最上面那张由正下）
    const vx = layout === 'cascade' ? STEP.cascade.x : r.x - (minX + spanX / 2);
    const vy = layout === 'cascade' ? STEP.cascade.y : STEP.fan.y;
    const len = Math.hypot(vx, vy) || 1;
    return { x: Math.round(x0 + r.x), y: Math.round(y0 + r.y), rot: r.rot, dirX: vx / len, dirY: vy / len, rate: PARALLAX[r.below] ?? 0.35 };
  });
  return { w, h, padX, padB, winW: w - 2 * padX, winH: h - padX - padB, prints };
};

export const PhotoDriftStackShot: React.FC<PhotoDriftStackProps> = ({
  photos, layout = 'cascade', aspect = 4 / 5, drift = { dx: -18, dy: -26 }, enterFrames = 16, tint = {}, duration, seed = 0,
}) => {
  const frame = useCurrentFrame();
  const list = [...photos].sort((a, b) => a.at - b.at).slice(0, MAX_PRINTS);
  const L = photoStackLayout(list.length, layout, aspect, list.some((p) => !!p.caption), drift, seed);

  // 漂移以落定构图为中点：−½ → +½，整段行程都留在 SAFE 内。不取整——取整会变成每隔几帧跳 1px。
  const p = Math.min(1, Math.max(0, frame / Math.max(1, duration - 1))) - 0.5;
  const tintAmount = tint ? Math.min(MAX_TINT, Math.max(0, tint.amount ?? 0.06)) : 0;
  const tintColor = tint?.color ?? N.accent;

  return (
    <>
      {list.map((ph, i) => {
        if (frame < ph.at) return null;
        const g = L.prints[i];
        const local = frame - ph.at;
        const land = seg(local, 0, enterFrames, E.outQuart); // 无回弹
        const fade = seg(local, 0, Math.max(3, enterFrames * 0.35), E.outQuad); // 淡入要短：半透明的相纸会透出底下那张，像叠印而不是纸
        const slide = (1 - land) * ENTER_DIST;

        // 退后：每有一张新相纸到场就再退一级，各用 12f
        let brightness = 1;
        let scale = 1;
        list.slice(i + 1).forEach((next, k) => {
          const t = seg(frame, next.at, next.at + STEP_BACK_FRAMES, E.inOutQuad);
          const a = STEP_BACK[k];
          const b = STEP_BACK[k + 1];
          brightness += (b.brightness - a.brightness) * t;
          scale += (b.scale - a.scale) * t;
        });

        const tx = drift.dx * g.rate * p + g.dirX * slide;
        const ty = drift.dy * g.rate * p + g.dirY * slide;

        // 说明：落定前 4f 起淡入；下一张到场时 8f 淡出（同时被新相纸盖住）
        const next = list[i + 1];
        const capAt = ph.at + enterFrames - 4;
        const capOpacity = seg(frame, capAt, capAt + 10, E.outCubic) * (next ? 1 - seg(frame, next.at, next.at + 8, E.outQuad) : 1);
        const capRise = lerp(seg(frame, capAt, capAt + 10, E.outCubic), 8, 0);

        return (
          <div key={i} style={{ position: 'absolute', left: g.x, top: g.y, width: L.w, height: L.h, transform: `translate(${tx}px, ${ty}px)` }}>
            <div
              style={{
                position: 'absolute', inset: 0, background: N.paper, opacity: fade,
                transform: `rotate(${g.rot}deg) scale(${scale})`, transformOrigin: '50% 50%',
                filter: brightness < 1 ? `brightness(${brightness})` : undefined,
                boxShadow: `0 ${lerp(land, 6, SHADOW.y)}px ${lerp(land, 16, SHADOW.blur)}px rgba(0,0,0,${lerp(land, 0.12, SHADOW.alpha)})`,
              }}
            >
              <div style={{ position: 'absolute', left: L.padX, top: L.padX, width: L.winW, height: L.winH, overflow: 'hidden', background: N.bg }}>
                {ph.src ? (
                  <Img
                    src={staticFile(ph.src)}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${ph.focus?.[0] ?? 50}% ${ph.focus?.[1] ?? 50}%` }}
                  />
                ) : (
                  <FakePhoto seed={seed + i} />
                )}
                {tintAmount > 0 ? <div style={{ position: 'absolute', inset: 0, background: tintColor, opacity: tintAmount }} /> : null}
                <div style={{ position: 'absolute', inset: 0, border: `1px solid ${N.line}`, opacity: 0.5 }} />
              </div>
            </div>
            {ph.caption && frame >= capAt && capOpacity > 0 ? (
              <div
                style={{
                  position: 'absolute', left: 0, top: L.h + CAPTION_GAP, width: L.w, height: CAPTION_H,
                  display: 'flex', alignItems: 'center', gap: 16, opacity: capOpacity,
                  transform: `translateY(${capRise}px)`,
                  fontFamily: N.font, fontSize: 34, fontWeight: 500, color: N.onDark, whiteSpace: 'nowrap', overflow: 'hidden',
                }}
              >
                <div style={{ width: 28, height: 3, background: N.accent, flex: 'none' }} />
                {ph.caption}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
};

export const PHOTO_DRIFT_STACK_DURATION = 210;

export const PhotoDriftStack: React.FC = () => (
  <NarrationStage>
    <PhotoDriftStackShot
      layout="cascade"
      photos={[
        { at: 10, caption: '奧入瀨溪流' },
        { at: 78, caption: '弘前公園' },
        { at: 146, caption: '酸湯溫泉' },
      ]}
      duration={PHOTO_DRIFT_STACK_DURATION}
    />
  </NarrationStage>
);
