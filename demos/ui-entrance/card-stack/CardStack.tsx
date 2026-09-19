// card-stack — 叠牌展开成网格（2026-09 改版；卡名沿用）
// 一组卡（照片 / 截图）从画面下方一张张柔和弹入、叠成中央一摞（先给「整体」：数量感），
// 全员到位后，每张沿各自的路径飞到网格位置、同时摆正缩小，排成整齐的相册（再给「个体」：每张都看得清）。
// 展开时依序号错开 2 帧，读作「一摞散开」而不是「整块平移」。
// （旧版：8 张紫色渐层卡叠成一摞后展成 3D 扇面；使用者从「金边扇形 / 展开成网格 / 横向摊开 / 阶梯层叠」里选了展开成网格。）
// 以短边 1080 为准等比；横式预设 4 栏、直式 2 栏。
import React from 'react';
import { Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { FakePhoto } from '../../_fixtures/Narration';

export const CARD_STACK_DURATION = 126; // 4.2s @30fps

export type CardStackProps = {
  /** 卡片内容：public/ 下的图片路径（字串）或任意 ReactNode。建议 4–8 张。 */
  items: (string | React.ReactNode)[];
  /** 网格栏数；不给则横式 4、直式 2。 */
  cols?: number;
  /** 第一张开始弹入的帧；之后每张错开 enterStagger 帧。 */
  enterAt?: number;
  enterStagger?: number;
  /** 开始散开成网格的帧（所有卡都已落定之后）。 */
  spreadAt?: number;
  /** 散开所用帧数。 */
  spreadFrames?: number;
  stroke?: string;
  bg?: string;
};

// ───────── 几何与手感常量（以短边 1080 设计）─────────
const CARD_W = 300;
const CARD_H = 400;
const CELL_W = 340;
const CELL_H = 440;
const CELL_GAP = 26;
const GRID_SCALE = 0.78; // 落进网格时缩到的倍率
const RADIUS = 18;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
// 柔和 spring：一次轻微过冲后落定
const softSpring = (t: number) => { const x = clamp01(t); return 1 - Math.cos(x * Math.PI * 1.15) * Math.exp(-4.2 * x); };

export const CardStackShot: React.FC<CardStackProps> = ({
  items, cols, enterAt = 4, enterStagger = 4, spreadAt = 66, spreadFrames = 26, stroke = 'rgba(224,176,75,0.5)', bg = '#0b0c0f',
}) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const c = cols ?? (width >= height ? 4 : 2);
  const n = items.length;
  const rows = Math.ceil(n / c);
  const w = CARD_W * u, h = CARD_H * u;
  const cx = width / 2, cy = height / 2;
  return (
    <div style={{ position: 'absolute', inset: 0, background: bg, overflow: 'hidden' }}>
      {items.map((it, i) => {
        // 入场：从画面下方弹到中央
        const enterY = mix(height * 0.85, 0, softSpring((f - enterAt - i * enterStagger) / 18));
        // 散开：飞到网格格位（依序号错开 2 帧），摆正并缩小
        const s = easeInOutCubic(clamp01((f - spreadAt - i * 2) / spreadFrames));
        const col = i % c, row = Math.floor(i / c);
        const inRow = row === rows - 1 ? n - row * c : c; // 最后一排不满时置中
        const tx = (col - (inRow - 1) / 2) * (CELL_W + CELL_GAP) * u;
        const ty = (row - (rows - 1) / 2) * (CELL_H + CELL_GAP) * u;
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h,
              transform: `translate(${tx * s}px, ${enterY + ty * s}px) rotate(${mix((i - (n - 1) / 2) * 1.5, 0, s)}deg) scale(${mix(1, GRID_SCALE, s)})`,
              borderRadius: RADIUS * u, overflow: 'hidden', border: `1.5px solid ${stroke}`, boxShadow: '0 24px 60px rgba(0,0,0,0.55)', background: '#14161b',
            }}
          >
            {typeof it === 'string' ? <Img src={staticFile(it)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : it}
          </div>
        );
      })}
    </div>
  );
};

// demo：8 张示意风景（FakePhoto）叠成一摞后展开成 4×2 网格
export const CardStack: React.FC = () => (
  <CardStackShot items={Array.from({ length: 8 }, (_, i) => <FakePhoto seed={i * 3 + 2} />)} />
);
