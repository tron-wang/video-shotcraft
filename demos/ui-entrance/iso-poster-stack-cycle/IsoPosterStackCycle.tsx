// iso-poster-stack-cycle — 等轴海报堆叠轮播：最前一张原地淡出，整摞前移一格
// 一叠海报以正交等轴视角（scaleX + skewY，无透视）沿右上斜线往后排。每一拍：最前面
// 那张**原地**淡出并朝镜头方向微滑，其余海报同时往前递进一格（后排晚 1f 起步，读作
// 一串被推着走的纸），最后一张从不可见的第 5 槽淡入补位。6 张轮完回到开头，首尾无缝。
//
// 位置全部由 (帧 → 第几拍 → 槽位) 推出，无跨帧状态。参数以 1920×1080 标定。
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';

// ---- 编舞 ----
const BEAT = 48; // f：一拍 = 一张海报在最前面停留的周期
const HOLD = 20; // f：每拍开头静止——首帧就是落定状态，缩略图不会截到半透明
const ADVANCE = 18; // f：整摞前移一格
const STAGGER = 1; // f/槽：后排晚起步
const FADE = 26; // f：最前一张淡出——比前移长，补位落定后它还在缓缓散去
const FADE_LEAD = 3; // f：淡出比前移早起步——先"让位"再"补位"，否则两张在同一槽里打架
const EXIT_DRIFT = 0.4; // 槽：淡出时朝镜头滑出的距离（负槽位方向）

// ---- 空间 ----
const POSTERS = 6;
const VISIBLE = 4; // 槽 0–3 可见；槽 4→3 淡入；槽 5 始终不可见
const W = 480;
const H = 520;
const SQUASH = 0.9; // scaleX：侧转后的横向压缩
const SHEAR = 0.2; // skewY 的 tan：右边比左边低，读作朝左侧转
const SLOT_DX = 104; // px/槽：往右上排
const SLOT_DY = -84;
const DIM_PER_SLOT = 0.13; // 每退一槽亮度降多少
const BG = '#111113';

export const ISO_POSTER_STACK_CYCLE_DURATION = BEAT * POSTERS; // 288f = 9.6s @30fps

const moveEase = Easing.bezier(0.65, 0, 0.35, 1);
// 淡出拆成两条曲线：透明度 sine 慢进慢出（没有"突然开始变透明"的一下），
// 滑移 out 曲线先走后停（一开始就在让位，快消失时已几乎静止，不会带着残影飘走）
const fadeEase = Easing.bezier(0.37, 0, 0.63, 1);
const driftEase = Easing.bezier(0.22, 0.61, 0.36, 1);

const SERIF = 'Georgia, "Times New Roman", "Songti SC", serif';
const SANS = '"Helvetica Neue", Helvetica, Arial, "PingFang SC", sans-serif';

// ---- 六张占位海报（中性设计，不对应任何真实活动/品牌）----
const Poster: React.FC<{ index: number; frame: number }> = ({ index, frame }) => {
  const base: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
  };
  switch (index) {
    case 0: // 暗场聚光 + 字距拉开的衬线字
      return (
        <div
          style={{
            ...base,
            background:
              'radial-gradient(38% 55% at 55% 18%, rgba(190,200,220,0.55) 0%, rgba(40,44,52,0.2) 60%, rgba(0,0,0,0) 100%), #050506',
          }}
        >
          {['N O C', 'T U R', 'N E'].map((line, i) => (
            <div
              key={line}
              style={{
                position: 'absolute',
                left: 34,
                right: 34,
                top: 36 + i * 145,
                fontFamily: SERIF,
                fontSize: 64,
                color: '#f2f2f2',
                letterSpacing: '0.34em',
                textAlign: i === 1 ? 'right' : 'left',
              }}
            >
              {line}
            </div>
          ))}
          <div
            style={{
              position: 'absolute',
              left: (W - 110) / 2,
              top: 240,
              width: 110,
              height: 150,
              borderRadius: '50% 50% 8px 8px',
              background: 'linear-gradient(180deg, #6d6a64 0%, #2a2724 100%)',
            }}
          />
          <div style={{ position: 'absolute', left: 34, bottom: 26, fontFamily: SANS, fontSize: 13, color: '#9a9a9a', letterSpacing: '0.12em' }}>
            OPENING NIGHT · 09.21
          </div>
        </div>
      );
    case 1: {
      // 白底半圆 + 底部漂移的圆点（海报自带的小动作）
      const dots = Array.from({ length: 14 }, (_, i) => {
        // 每点整圈数为整数：第 252 帧与第 0 帧位置相同，循环无缝
        const x = ((i * 67 + (frame / ISO_POSTER_STACK_CYCLE_DURATION) * (W + 40) * (1 + (i % 3))) % (W + 40)) - 20;
        const y = 400 + ((i * 37) % 80);
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: 18, height: 18, borderRadius: 9, background: '#0b0b0b' }} />;
      });
      return (
        <div style={{ ...base, background: '#f7f7f5' }}>
          <div
            style={{
              position: 'absolute',
              left: W / 2 - 150,
              top: 90,
              width: 300,
              height: 300,
              borderRadius: '50%',
              background: '#0b0b0b',
            }}
          />
          <div style={{ position: 'absolute', right: 0, top: 70, width: W / 2, height: 340, background: '#f7f7f5' }} />
          <div style={{ position: 'absolute', left: 30, top: 34, fontFamily: SERIF, fontSize: 16, color: '#444', fontStyle: 'italic' }}>
            sourced from the studio archive
          </div>
          {dots}
        </div>
      );
    }
    case 2: // 粗黑体标题 + 蓝色光泽体块
      return (
        <div style={{ ...base, background: '#fbfbfb' }}>
          <div style={{ position: 'absolute', left: 26, right: 26, top: 22, fontFamily: SANS, fontWeight: 800, fontSize: 58, lineHeight: 0.92, color: '#0b0b0b' }}>
            FORM &amp;
            <br />
            <span style={{ color: '#c9c9c9' }}>VOLUME</span>
          </div>
          {[
            [100, 180, 150],
            [210, 160, 170],
            [155, 275, 140],
          ].map(([x, y, s], i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: s,
                height: s,
                borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 30%, #cfe8ff 0%, #3b8cff 28%, #0a3fb8 70%, #051d5c 100%)',
              }}
            />
          ))}
          <div style={{ position: 'absolute', left: 26, bottom: 24, fontFamily: SANS, fontWeight: 800, fontSize: 34, lineHeight: 0.95, color: '#0b0b0b' }}>
            THE COMPLETE
            <br />
            SERIES.
          </div>
        </div>
      );
    case 3: // 暗底重叠衬线大字 + 斜插的暖色胶片条
      return (
        <div style={{ ...base, background: '#141311' }}>
          {['ARCHIVE', 'SEVEN', 'ROOMS', 'OF', 'LIGHT'].map((word, i) => (
            <div
              key={word}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 60 + i * 70,
                textAlign: 'center',
                fontFamily: SERIF,
                fontSize: 70,
                color: '#eae4d8',
                lineHeight: 1,
              }}
            >
              {word}
            </div>
          ))}
          {[
            [90, 150, -38],
            [260, 240, -52],
            [150, 330, -30],
          ].map(([x, y, r], i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: 150,
                height: 30,
                transform: `rotate(${r}deg)`,
                background: 'repeating-linear-gradient(90deg, #b58a5a 0 22px, #3a2b1d 22px 26px)',
                opacity: 0.85,
              }}
            />
          ))}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 26, textAlign: 'center', fontFamily: SERIF, fontSize: 14, color: '#8f887c' }}>
            A Collection in Seven Parts
          </div>
        </div>
      );
    case 4: // 阴天灰阶 + 极小字
      return (
        <div
          style={{
            ...base,
            background:
              'radial-gradient(60% 40% at 50% 30%, rgba(160,165,170,0.45) 0%, rgba(0,0,0,0) 100%), linear-gradient(180deg, #3a3d41 0%, #1b1c1e 55%, #2b2d30 75%, #0e0f10 100%)',
          }}
        >
          <div style={{ position: 'absolute', left: W / 2 - 30, top: 240, width: 60, height: 170, background: '#15161a' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: 220, textAlign: 'center', fontFamily: SANS, fontSize: 20, color: '#e6e6e6', letterSpacing: '0.3em' }}>
            quiet hours
          </div>
        </div>
      );
    default: // 帷幕条纹 + 棋盘地面 + 大标题
      return (
        <div style={{ ...base, background: 'repeating-linear-gradient(90deg, #4a2e1c 0 26px, #6b4428 26px 44px, #3c2416 44px 52px)' }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 150,
              background: 'repeating-conic-gradient(#1a1a1a 0 25%, #d8d4cc 0 50%) 0 0 / 40px 40px',
              opacity: 0.8,
            }}
          />
          <div style={{ position: 'absolute', left: 24, right: 24, top: 26, fontFamily: SANS, fontWeight: 700, fontSize: 60, color: '#e9dfb8', lineHeight: 1 }}>
            MAISON
          </div>
          <div style={{ position: 'absolute', left: (W - 110) / 2, top: 180, width: 110, height: 220, borderRadius: '55px 55px 10px 10px', background: 'linear-gradient(180deg, #2a2a2a, #111)' }} />
        </div>
      );
  }
};

export const IsoPosterStackCycle: React.FC = () => {
  const frame = useCurrentFrame();
  const beat = Math.floor(frame / BEAT);
  const local = frame - beat * BEAT;

  // 整摞中心放在画面中央：前槽中心 = 画面中心 − 1.5 槽
  const frontX = 960 - 1.5 * SLOT_DX;
  const frontY = 540 - 1.5 * SLOT_DY;

  const layers = Array.from({ length: POSTERS }, (_, i) => {
    const slot = (((i - beat) % POSTERS) + POSTERS) % POSTERS;
    let pos: number;
    let opacity: number;
    if (slot === 0) {
      const f = interpolate(local, [HOLD - FADE_LEAD, HOLD - FADE_LEAD + FADE], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: fadeEase,
      });
      const d = interpolate(local, [HOLD - FADE_LEAD, HOLD - FADE_LEAD + FADE], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: driftEase,
      });
      pos = -EXIT_DRIFT * d;
      opacity = 1 - f;
    } else {
      const start = HOLD + (slot - 1) * STAGGER;
      const p = interpolate(local, [start, start + ADVANCE], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: moveEase,
      });
      pos = slot - p;
      // 槽 VISIBLE-1 以内全亮；往后一槽内线性淡出
      opacity = interpolate(pos, [VISIBLE - 1, VISIBLE], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
    }
    const x = frontX + pos * SLOT_DX;
    const y = frontY + pos * SLOT_DY;
    const brightness = 1 - DIM_PER_SLOT * Math.max(0, pos);
    return { i, pos, opacity, x, y, brightness };
  });

  return (
    <AbsoluteFill style={{ background: BG }}>
      {layers
        .filter((l) => l.opacity > 0.001)
        .map((l) => (
          <div
            key={l.i}
            style={{
              position: 'absolute',
              left: l.x - W / 2,
              top: l.y - H / 2,
              width: W,
              height: H,
              // 正交等轴：不用 perspective，前后海报同尺寸，靠斜线排布 + 压暗读出纵深
              transform: `matrix(${SQUASH}, ${SHEAR}, 0, 1, 0, 0)`,
              opacity: l.opacity,
              filter: `brightness(${l.brightness.toFixed(3)})`,
              zIndex: Math.round(1000 - l.pos * 100),
              boxShadow: '0 0 0 1px rgba(255,255,255,0.04)',
            }}
          >
            <Poster index={l.i} frame={frame} />
          </div>
        ))}
    </AbsoluteFill>
  );
};
