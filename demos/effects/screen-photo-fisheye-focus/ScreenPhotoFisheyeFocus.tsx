// screen-photo-fisheye-focus — 屏摄鱼眼推近 + 荧光笔标注
// 把一张真实页面截图拍成"手机对着显示器拍"的质感：以画面中心为光轴的桶形畸变、
// 随画面弯曲的源空间扫描线与固定屏幕扫描线干涉出的摩尔纹、径向暗角。取景点从页面
// 中心推近到目标短语，落定后黄色荧光笔块在**源图坐标**里自左向右涂过——它画在截图
// 上，所以跟着畸变一起弯，读作"屏幕上被划了重点"，而不是浮在镜头前的贴纸。
//
// 逐像素反向映射（输出像素 → 畸变 → 源图双线性采样）全在 Canvas 2D 里算：
// 不依赖 WebGL/GPU，无头渲染逐帧确定。参数以 1920×1080 标定。
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export const SCREEN_PHOTO_FISHEYE_FOCUS_DURATION = 150; // 5s @30fps

// ---- 素材 ----
const CAPTURE = 'textures/live/detail-full.png'; // 3840×2344 真实页面截图
const CAPTURE_W = 3840;
const CROP_H = (CAPTURE_W * 9) / 16; // 取景坐标（crop-uv）的单位高度：截图宽 ÷ 16:9
// 源图先降采样到 2400 宽：起手 zoom 下约 1:1 采样，直接采 3840 原图会让小字混叠出第二层摩尔纹
const SAMPLE_W = 2400;

// ---- 运镜（crop-uv：x 0..1 = 截图全宽，y 以 CROP_H 为 1，向下）----
const FOCUS_FROM = { x: 0.5, y: 0.5 };
const FOCUS_TO = { x: 0.364, y: 0.639 }; // "better LR schedules" 中心
const ZOOM_FROM = 1.3;
const ZOOM_TO = 2.35;
const ZOOM_DRIFT = 0.12; // 推近落定后继续微推，画面不死住
const PUSH: [number, number] = [12, 66]; // f：取景推近
const STRENGTH = 1.25; // 桶形畸变：p' = p·(1 + k·r²) / zoom

// ---- 荧光笔（截图像素坐标）----
const MARK_PX = { x: 1244, y: 1356, w: 308, h: 50 };
const MARK: [number, number] = [70, 88]; // f：自左向右涂过
const MARK_RGB = [255, 212, 0] as const;
const MARK_OPACITY = 0.85; // multiply：浅底变黄、深色字保持深色

// ---- 屏摄质感 ----
const MOIRE_INTENSITY = 0.2;
const MOIRE_SCALE = 900; // 扫描线频率（每单位画面高的弧度数）
const MOIRE_SCREEN_RATIO = 1.045; // 屏幕线比源线密 4.5%：拍频就是摩尔纹
const VIGNETTE_AMOUNT = 0.85;
const VIGNETTE_RADIUS = 0.72;
const VIGNETTE_SOFT = 0.45;
const EDGE_FADE = 12; // 采样越出截图边界后压黑的速度

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const ScreenPhotoFisheyeFocus: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [handle] = useState(() => delayRender('screen-photo-fisheye-focus: decode capture'));
  const [source, setSource] = useState<ImageData | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = SAMPLE_W;
      c.height = Math.round((img.naturalHeight * SAMPLE_W) / img.naturalWidth);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        cancelRender(new Error('screen-photo-fisheye-focus: no 2d context'));
        return;
      }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      setSource(ctx.getImageData(0, 0, c.width, c.height));
    };
    img.onerror = () => cancelRender(new Error(`screen-photo-fisheye-focus: failed to load ${CAPTURE}`));
    img.src = staticFile(CAPTURE);
  }, []);

  useEffect(() => {
    if (source) continueRender(handle);
  }, [source, handle]);

  // 暗角只和输出像素位置有关：算一次
  const vignette = useMemo(() => {
    const aspect = width / height;
    const v = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      const qy = (y + 0.5) / height - 0.5;
      for (let x = 0; x < width; x++) {
        const qx = ((x + 0.5) / width - 0.5) * aspect;
        const fall = smoothstep(
          VIGNETTE_RADIUS - VIGNETTE_SOFT,
          VIGNETTE_RADIUS + VIGNETTE_SOFT,
          Math.sqrt(qx * qx + qy * qy),
        );
        v[y * width + x] = 1 - VIGNETTE_AMOUNT * fall;
      }
    }
    return v;
  }, [width, height]);

  const push = interpolate(frame, PUSH, [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const drift = interpolate(frame, [PUSH[1], durationInFrames - 1], [0, ZOOM_DRIFT], clamp);
  const zoom = ZOOM_FROM + (ZOOM_TO - ZOOM_FROM) * push + drift;
  const focusX = FOCUS_FROM.x + (FOCUS_TO.x - FOCUS_FROM.x) * push;
  const focusY = FOCUS_FROM.y + (FOCUS_TO.y - FOCUS_FROM.y) * push;
  const mark = interpolate(frame, MARK, [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !source) return;

    const out = ctx.createImageData(width, height);
    const o = out.data;
    const s = source.data;
    const sw = source.width;
    const sh = source.height;
    const pxPerUnit = sw; // crop-uv 的 1 单位 = 源图宽（x）= 源图宽（y，以 CROP_H 归一）
    const vMax = sh / (sw * (CROP_H / CAPTURE_W)); // 截图底边在 crop-uv 里的 y
    const aspect = width / height;

    const mx0 = MARK_PX.x / CAPTURE_W;
    const mx1 = mx0 + (MARK_PX.w / CAPTURE_W) * mark;
    const my0 = MARK_PX.y / CROP_H;
    const my1 = my0 + MARK_PX.h / CROP_H;

    for (let y = 0; y < height; y++) {
      const vy = (y + 0.5) / height;
      const dy = vy - 0.5;
      // 屏幕扫描线固定在输出画面上，只与行有关
      const screenLine = Math.sin(vy * MOIRE_SCALE * MOIRE_SCREEN_RATIO + 1.3);
      for (let x = 0; x < width; x++) {
        const dx = ((x + 0.5) / width - 0.5) * aspect;
        // 光轴钉在画面中心：平移的是取景点，畸变中心不跟着跑
        const k = (1 + STRENGTH * (dx * dx + dy * dy)) / zoom;
        const su = focusX + (dx * k) / aspect;
        const sv = focusY + dy * k;

        const cu = Math.min(1, Math.max(0, su));
        const cv = Math.min(vMax, Math.max(0, sv));
        const over = Math.hypot(su - cu, sv - cv);
        const edge = Math.max(0, 1 - over * EDGE_FADE);

        let r = 0;
        let g = 0;
        let b = 0;
        if (edge > 0) {
          const fx = Math.min(sw - 1.001, Math.max(0, cu * pxPerUnit - 0.5));
          const fy = Math.min(sh - 1.001, Math.max(0, cv * (CROP_H / CAPTURE_W) * pxPerUnit - 0.5));
          const x0 = fx | 0;
          const y0 = fy | 0;
          const tx = fx - x0;
          const ty = fy - y0;
          const i00 = (y0 * sw + x0) * 4;
          const i10 = i00 + sw * 4;
          const w00 = (1 - tx) * (1 - ty);
          const w01 = tx * (1 - ty);
          const w10 = (1 - tx) * ty;
          const w11 = tx * ty;
          r = s[i00] * w00 + s[i00 + 4] * w01 + s[i10] * w10 + s[i10 + 4] * w11;
          g = s[i00 + 1] * w00 + s[i00 + 5] * w01 + s[i10 + 1] * w10 + s[i10 + 5] * w11;
          b = s[i00 + 2] * w00 + s[i00 + 6] * w01 + s[i10 + 2] * w10 + s[i10 + 6] * w11;

          // 荧光笔画在源图坐标里：跟着畸变一起弯，再被摩尔纹和暗角盖住
          if (mark > 0 && su >= mx0 && su <= mx1 && sv >= my0 && sv <= my1) {
            r += (r * (MARK_RGB[0] / 255) - r) * MARK_OPACITY;
            g += (g * (MARK_RGB[1] / 255) - g) * MARK_OPACITY;
            b += (b * (MARK_RGB[2] / 255) - b) * MARK_OPACITY;
          }
        }

        // 摩尔纹：随畸变弯曲的源空间线 × 固定屏幕线的拍频
        const sourceLine = Math.sin(sv * MOIRE_SCALE);
        const fine = 0.5 + 0.5 * sourceLine;
        const beat = 0.5 + 0.5 * sourceLine * screenLine;
        const moire = fine + (beat - fine) * 0.65;

        const i = y * width + x;
        const m = edge * (1 - MOIRE_INTENSITY * moire) * vignette[i];
        const p = i * 4;
        o[p] = r * m;
        o[p + 1] = g * m;
        o[p + 2] = b * m;
        o[p + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }, [source, vignette, width, height, zoom, focusX, focusY, mark]);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <canvas ref={canvasRef} width={width} height={height} style={{ width: '100%', height: '100%' }} />
    </AbsoluteFill>
  );
};
