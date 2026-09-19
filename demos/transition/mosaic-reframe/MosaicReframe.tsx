// mosaic-reframe — 网格 → 主图聚焦 → 换主图（2026-09 改版；卡名沿用）
// 一组照片先以规则网格浮现；旁白点到哪张，哪张就放大成主图（横式在左、直式在上），
// 其余缩成一旁的小图栏；再点下一张，主图换人——同一批内容，镜头跟着口播一张张聚焦。
// 每片的 x / y / w / h 独立插值（不是整体缩放，圆角与描边不变形），逐片错开 2 帧、smoothstep，读作一波重排。
// （旧版：12 张紫色渐层方块在网格 → feature mosaic → 旋转对角瀑布间重排；
//   使用者从「网格→便当→斜瀑布 / 网格→主图聚焦→换主图 / 网格→便当→满版 / 网格→便当→胶卷横排」里选了主图聚焦。）
// 以画幅比例排版，横式直式都能用。
import React from 'react';
import { Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { FakePhoto } from '../../_fixtures/Narration';

export const MOSAIC_REFRAME_DURATION = 180; // 6s @30fps

export type MosaicHero = {
  /** 放大成主图的是第几张（0 起）。 */
  index: number;
  /** 开始换成这张的帧（成片 = 旁白点到它的词锚 − 10 左右）。 */
  at: number;
};

export type MosaicReframeProps = {
  /** 照片：public/ 下的路径（字串）或任意 ReactNode。4–12 张。 */
  items: (string | React.ReactNode)[];
  /** 依序聚焦的主图；第一个之前是网格。 */
  heroes: MosaicHero[];
  /** 网格浮现的起点帧。 */
  enterAt?: number;
  /** 每次重排所用帧数。 */
  moveFrames?: number;
  /** 逐片错开帧数。 */
  stagger?: number;
  /** 小图栏的亮度（主图之外的照片退到背景）。 */
  thumbOpacity?: number;
  stroke?: string;
  bg?: string;
};

type R = { x: number; y: number; w: number; h: number; o: number };
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpR = (a: R, b: R, t: number): R => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), w: mix(a.w, b.w, t), h: mix(a.h, b.h, t), o: mix(a.o, b.o, t) });

/** 规则网格：横式 4 栏、直式 3 栏，整组置中。 */
const gridLayout = (n: number, W: number, H: number): R[] => {
  const land = W >= H;
  const cols = land ? 4 : 3;
  const rows = Math.ceil(n / cols);
  const g = Math.min(W, H) * 0.022;
  const cw = Math.min((W * 0.82 - (cols - 1) * g) / cols, ((H * (land ? 0.8 : 0.6) - (rows - 1) * g) / rows) * 1.5);
  const chh = cw / 1.5;
  const x0 = (W - (cols * cw + (cols - 1) * g)) / 2;
  const y0 = (H - (rows * chh + (rows - 1) * g)) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + (i % cols) * (cw + g), y: y0 + Math.floor(i / cols) * (chh + g), w: cw, h: chh, o: 1 }));
};

/** 主图聚焦：横式主图在左、其余两栏小图在右；直式主图在上、其余三栏小图在下。 */
const heroLayout = (n: number, k: number, W: number, H: number, thumbO: number): R[] => {
  const land = W >= H;
  const g = Math.min(W, H) * 0.015;
  if (land) {
    const hero = { x: W * 0.0625, y: H * 0.111, w: W * 0.615, h: H * 0.778, o: 1 };
    const tx0 = hero.x + hero.w + W * 0.026, tw = (W * 0.94 - tx0 - g) / 2;
    const rows = Math.ceil((n - 1) / 2);
    const th = Math.min(tw * 0.6, (hero.h - (rows - 1) * g) / rows);
    let j = 0;
    return Array.from({ length: n }, (_, i) => {
      if (i === k) return hero;
      const c = j % 2, r = Math.floor(j / 2); j++;
      return { x: tx0 + c * (tw + g), y: hero.y + r * (th + g), w: tw, h: th, o: thumbO };
    });
  }
  const hero = { x: W * 0.056, y: H * 0.09, w: W * 0.888, h: H * 0.42, o: 1 };
  const cols = 3, tw = (hero.w - (cols - 1) * g) / cols;
  const rows = Math.ceil((n - 1) / cols);
  const th = Math.min(tw * 0.66, (H * 0.74 - (hero.y + hero.h + g * 2) - (rows - 1) * g) / rows);
  let j = 0;
  return Array.from({ length: n }, (_, i) => {
    if (i === k) return hero;
    const c = j % cols, r = Math.floor(j / cols); j++;
    return { x: hero.x + c * (tw + g), y: hero.y + hero.h + g * 2 + r * (th + g), w: tw, h: th, o: thumbO };
  });
};

export const MosaicReframeShot: React.FC<MosaicReframeProps> = ({
  items, heroes, enterAt = 0, moveFrames = 27, stagger = 2, thumbOpacity = 0.75, stroke = 'rgba(224,176,75,0.45)', bg = '#0b0c0f',
}) => {
  const f = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const n = items.length;
  const u = Math.min(W, H) / 1080;
  const layouts = [gridLayout(n, W, H), ...heroes.map((h) => heroLayout(n, h.index, W, H, thumbOpacity))];
  // 当前主图抬高层级（换主图时新主图压在上面）
  let top = -1;
  heroes.forEach((h) => { if (f >= h.at) top = h.index; });
  return (
    <div style={{ position: 'absolute', inset: 0, background: bg, overflow: 'hidden' }}>
      {items.map((it, i) => {
        let r = layouts[0][i];
        heroes.forEach((h, s) => { r = lerpR(r, layouts[s + 1][i], smooth(clamp01((f - h.at - i * stagger) / moveFrames))); });
        const inT = clamp01((f - enterAt - i * stagger) / 16);
        const e = 1 - Math.pow(1 - inT, 3);
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 16 * u, overflow: 'hidden',
              border: `1.5px solid ${stroke}`, boxShadow: '0 16px 40px rgba(0,0,0,0.5)', background: '#14161b',
              transform: `scale(${mix(0.82, 1, e)})`, opacity: e * r.o, zIndex: i === top ? 5 : 1,
            }}
          >
            {typeof it === 'string' ? <Img src={staticFile(it)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : it}
          </div>
        );
      })}
    </div>
  );
};

// demo：12 张示意风景（FakePhoto）；网格 → 第 1 张当主图 → 换第 6 张
export const MosaicReframe: React.FC = () => (
  <MosaicReframeShot
    items={Array.from({ length: 12 }, (_, i) => <FakePhoto seed={i * 5 + 1} />)}
    heroes={[{ index: 0, at: 48 }, { index: 5, at: 111 }]}
  />
);
