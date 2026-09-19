// carousel-3d — 双向跑马灯（2026-09 改版；卡名沿用）
// 一组照片 / 卡片排成三排，整体微倾 −8°，相邻两排反向匀速横移，左右两侧渐隐：
// 一次看到最多的「一组东西」，适合当照片衬底、作品集、合作伙伴墙。
// （旧版：8 张紫色渐层卡排成圆环自转；使用者从「金边环形 / 双向跑马灯 / 弧形画廊 / 斜向无限墙」里选了双向跑马灯。）
// 横移速度预设 3px/帧（使用者看过的速度）；要无缝循环时给 loopFrames，速度自动取「loopFrames 帧刚好走完一轮」。
// 以画幅比例排版，横式直式都能用。
import React from 'react';
import { Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { FakePhoto } from '../../_fixtures/Narration';

export const CAROUSEL_3D_DURATION = 168; // 5.6s @30fps

export type Carousel3DProps = {
  /** 卡片内容：public/ 下的图片路径（字串）或任意 ReactNode；会依序重复铺满各排。 */
  items: (string | React.ReactNode)[];
  /** 排数，预设 3；直式画幅可给 5 铺满。 */
  rows?: number;
  /** 横移速度（px/帧，以短边 1080 为准）。 */
  speed?: number;
  /** 给了就改成无缝循环：speed 自动取「这么多帧走完一轮」。 */
  loopFrames?: number;
  /** 整体倾角（度）。 */
  tilt?: number;
  /** 卡的描边色（预设淡金）。 */
  stroke?: string;
  bg?: string;
};

// ───────── 几何（以短边 1080 设计，按短边等比）─────────
const CARD_W = 360;
const CARD_H = 280;
const GAP = 28;
const ROW_GAP = 28;
const RADIUS = 18;

export const Carousel3DShot: React.FC<Carousel3DProps> = ({
  items, rows = 3, speed = 3, loopFrames, tilt = -8, stroke = 'rgba(224,176,75,0.45)', bg = '#0b0c0f',
}) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080; // 按短边等比：直式画幅卡不会被放大
  const w = CARD_W * u, h = CARD_H * u, g = GAP * u;
  const span = items.length * (w + g); // 一轮的长度
  const v = loopFrames ? span / loopFrames : speed * u;
  // 需要铺满的卡数：画面宽 + 倾斜余量 + 一轮
  const perRow = Math.ceil((width * 1.4 + span) / (w + g)) + 1;
  const blockH = rows * h + (rows - 1) * ROW_GAP * u;
  const fade = 'linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)';
  const card = (i: number) => {
    const it = items[((i % items.length) + items.length) % items.length];
    return typeof it === 'string'
      ? <Img src={staticFile(it)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      : it;
  };
  return (
    <div style={{ position: 'absolute', inset: 0, background: bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: -width * 0.2, top: (height - blockH) / 2, width: width * 1.4, height: blockH, transform: `rotate(${tilt}deg)`, WebkitMaskImage: fade, maskImage: fade }}>
        {Array.from({ length: rows }, (_, r) => {
          const dir = r % 2 ? 1 : -1;
          const off = ((f * v * dir) % span + span) % span; // 0..span，一轮后回到原位（无缝）
          return (
            <div key={r} style={{ position: 'absolute', left: 0, top: r * (h + ROW_GAP * u), width: '100%', height: h }}>
              {Array.from({ length: perRow }, (_, k) => (
                <div
                  key={k}
                  style={{
                    position: 'absolute', left: (k - 1) * (w + g) + (dir < 0 ? -off : off - span), top: 0, width: w, height: h,
                    borderRadius: RADIUS * u, overflow: 'hidden', border: `1.5px solid ${stroke}`, boxShadow: '0 20px 50px rgba(0,0,0,0.5)', background: '#14161b',
                  }}
                >
                  {card(k + r * 3)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// demo：8 张示意风景（FakePhoto），三排反向横移
export const Carousel3D: React.FC = () => (
  <Carousel3DShot items={Array.from({ length: 8 }, (_, i) => <FakePhoto seed={i * 3 + 1} />)} />
);
