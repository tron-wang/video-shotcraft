// globe-route-flight — 点阵地球航线飞行
// 深色点阵地球：起点城市特写落定 → 大圆航线自起点拉出，镜头跟着航线头转动地球、
// 中途拉远把两端同时收进画面 → 航线头落到终点，镜头追上并推回特写，终点涟漪 + 城市名
// 落定。镜头**晚于**航线头出发、晚于航线头到站：航线在领跑，镜头在追，读作"飞过去"
// 而不是"地球自己转过去"。
//
// 正交投影 + 单位向量相机基（center/east/north），逐帧由 frame 直接求出，无跨帧状态。
// 陆地点阵来自内嵌的 1.5° 陆地掩码（Natural Earth 1:110m，公有领域；经 world-atlas
// 栅格化），不联网、不依赖 three.js。参数以 1920×1080 标定。
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

export const GLOBE_ROUTE_FLIGHT_DURATION = 180; // 6s @30fps

// ---- 航线 ----
const ORIGIN = { name: 'London', code: 'LHR', lat: 51.47, lon: -0.45 };
const DEST = { name: 'Singapore', code: 'SIN', lat: 1.36, lon: 103.99 };

// ---- 编舞 ----
const ORIGIN_PING = 6; // f：起点涟漪
const FLIGHT: [number, number] = [18, 118]; // f：航线头从起点到终点
const CAMERA: [number, number] = [24, 128]; // f：镜头晚 6f 出发、晚 10f 到站
const DEST_LABEL = 122; // f：终点名落定
const HOLD_DRIFT = 5; // °：到站后地球继续缓慢东转，hold 不死住
const R_START = 1150; // px：起点特写半径（地球大于画面）
const R_END = 1020; // px：终点特写半径（比起点略远，给城市名留出上下文）
const PULL = 0.56; // 中途拉远比例：sin 曲线峰值处半径 × (1 − PULL)
const ARC_LIFT = 0.16; // 航线最高点离地高度 / 地球半径（按航程比例放大）
// 光轴偏离航线所在大圆 9°：正对大圆看，航线投影是一条直线；偏开才看得出弧度和离地高度
const CAMERA_OFFSET = 9;

// ---- 视觉 ----
const DOT_STEP = 1.5; // °：点阵间距（与掩码同分辨率）
const DOT_RADIUS = 0.0042; // × 地球半径
const LAND_RGB = '150, 182, 238';
const ACCENT = '#7aa7ff';
const BG = 'radial-gradient(70% 70% at 50% 50%, #0b1428 0%, #04060d 100%)';
const SANS = '-apple-system, "PingFang SC", BlinkMacSystemFont, "Segoe UI", sans-serif';

// 1.5° 陆地掩码：240 列 × 120 行，行 0 = 北纬 89.25°，列 0 = 西经 179.25°，逐位 MSB 在前
const LAND_MASK = [
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/gAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAB//8////44AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPx/n/////AAAA/AAYAAAAfAAAAAAAAAAAAAAAAE',
  'O3v4f////+AAAPgAAAAAAAAcAAAAAAAAAAAAAADAAAfgP////+AAAHAAAAAAAAAMAAAAAAAAAAAAAAA9jjCAAP///+AAAAAA',
  'AAHgAAP/8AAPAAAAAAAAAAcAAAAAAD///8AAAAAAAAYAAD//gAAAAAAAAAAAAAe6zs/AAB///4AAAAAAABgDA/////wGAAAA',
  'wAEAAAI/wM//AAf4AH///////xwHf/////z/+AAAAB//wPI/+sEP4A///wAAAAf8AACHf////////8B8P4AAAAAPPIZ+H/gA',
  'D////8AAOcgEQAAAAAAAAAAAE/AAAAAAAAB+AfAAf////4AAHAAAgAAAAAAAAAAA54AAAAAAAALwG/gH/4H//wOB4AAAAAAA',
  'AAAAAAAAAAf///////Ng+AP4ADAAA/n////////////////+AD///////8COMAHwAAAAD/P///////////////v8AD/7////',
  '/4APwABgAAAAH/P//////////////wfAAA+AH////4APzAAAAAAAD/D/////////////JhgAAAFAAf///8AH/gAAAAAIAOD/',
  '///////////4AHAAAAQAAP////wH/gAAAAAMBuP////////////wAPgAACAAAH////+f/8AAAAAWAhf////////////AAPAA',
  'AAAAAT////+f/+AAAAA3H//////////////+AOAAAAAAAB/////f/8AAAAAHn//////////////+AIAAAAAAAB//////8wAA',
  'AAAMf//////////////9AAAAAAAAAA//////2HAAAAAF///////////////4AAAAAAAAAAf/////+AgAAAAD////////////',
  '///4AAAAAAAAAAf//////wAAAAAB///yfx/////////wAAAAAAAAAAf/////yAAAAAAB/z/gPj/////////jAAAAAAAAAAf/',
  '////gAAAAAA/wY/gDx////////8HAAAAAAAAAAf/////AAAAAAA/gGfnn4////////wAAAAAAAAAAAf////+AAAAAAA/ACY/',
  '/4///////1gGAAAAAAAAAAP////8AAAAAAA/ACM//4///////hwEAAAAAAAAAAH////4AAAAAAAOLgA//////////4wcAAAA',
  'AAAAAAH////4AAAAAAAN/gDC/////////wz8AAAAAAAAAAB////wAAAAAAAf/gAA/////////wDgAAAAAAAAAAA////AAAAA',
  'AAA//8YB/////////4EAAAAAAAAAAAAX///AAAAAAAA///f//////////4AAAAAAAAAAAAAX/5BAAAAAAAB//////z//////',
  '/4AAAAAAAAAAAAAb/gBAAAAAAAH////8/5///////4AAAAAAAAAAAAAF/gBoAAAAAAP////+/4f//////wAAAAAAAAAAAAAE',
  '/gAAAAAAAAP////+f8wH/////gAAAAAAAAAAAAAAfgAAAAAAAAf/////P/4D/////IAAAAAAAAAAAAAAPgAQAAAAAAf/////',
  'v/8D/+f/4AAAAAAAAAAAAAAAPgwOAAAAAAf/////n/4Af8P+AAAAAAAAAAAAAAAAHxwAwAAAAAf/////n/wAfwH+wAAAAAAA',
  'AAAAAAAAB/gAAAAAAAf/////z/gAfgH+AMAAAAAAAAAAAAAAAT8AAAAAAAf/////z+AAfAF/AIAAAAAAAAAAAAAAAB+AAAAA',
  'AAf/////94AAOAB/gIAAAAAAAAAAAAAAAAMAAAAAAAf//////AAAOAA/gCAAAAAAAAAAAAAAAAEBQAAAAAP/////+MAAGAAH',
  'AFAAAAAAAAAAAAAAAACDfgAAAAH//////8AAGAACAAAAAAAAAAAAAAAAAABP/wAAAAH//////4AABABgADAAAAAAAAAAAAAA',
  'AAAP/4AAAAD//////4AABAAQABAAAAAAAAAAAAAAAAAP//gAAAA/H////wAAAACYBgAAAAAAAAAAAAAAAAAH//wAAAAAA///',
  '/wAAAADYDAAAAAAAAAAAAAAAAAAP//wAAAAAA////gAAAABoPgAAAAAAAAAAAAAAAAAf//4AAAAAA///+AAAAAA4fuQAAAAA',
  'AAAAAAAAAAA///+AAAAAA///8AAAAAAYfASAAAAAAAAAAAAAAAA////AAAAAA///4AAAAAAcfYBYAAAAAAAAAAAAAAA////8',
  'AAAAAf//4AAAAAAOCEh/AAAAAAAAAAAAAAA/////AAAAAP//wAAAAAAGAAAPgAAAAAAAAAAAAAA/////gAAAAP//wAAAAAAD',
  'IABPwIAAAAAAAAAAAAAf////gAAAAH//wAAAAAAAOAAPYCAAAAAAAAAAAAAP////AAAAAH//4AAAAAAAACAAMAAAAAAAAAAA',
  'AAAP///+AAAAAH//4AAAAAAAAAAAAAAAAAAAAAAAAAAH///+AAAAAH//4AAAAAAAAAHhAAAAAAAAAAAAAAAH///8AAAAAP//',
  '4IAAAAAAAAvjAAAAAAAAAAAAAAAD///8AAAAAP//4cAAAAAAAB/jgAAAAAAAAAAAAAAA///8AAAAAP//h4AAAAAAAD/7gAAA',
  'AAAAAAAAAAAAf//8AAAAAP//B4AAAAAAAH//wAAAAAAAAAAAAAAAf//4AAAAAH/+AwAAAAAAAf//4AQAAAAAAAAAAAAAf//4',
  'AAAAAH//BwAAAAAAB///8AIAAAAAAAAAAAAAf//gAAAAAD//BwAAAAAAD///+AAAAAAAAAAAAAAAf/8AAAAAAD/+BgAAAAAA',
  'D////AAAAAAAAAAAAAAAf/8AAAAAAD/8AAAAAAAAD////AAAAAAAAAAAAAAAf/8AAAAAAD/8AAAAAAAAD////AAAAAAAAAAA',
  'AAAA//4AAAAAAB/4AAAAAAAAB////AAAAAAAAAAAAAAA//wAAAAAAA/wAAAAAAAAB////AAAAAAAAAAAAAAA//gAAAAAAA/g',
  'AAAAAAAAB/h//AAAAAAAAAAAAAAA//AAAAAAAA+AAAAAAAAAB+Av+AAAAAAAAAAAAAAA/8AAAAAAAAAAAAAAAAAAAAAP8AAQ',
  'AAAAAAAAAAAB/8AAAAAAAAAAAAAAAAAAAAAH8AAIAAAAAAAAAAAB/4AAAAAAAAAAAAAAAAAAAAADQAAOAAAAAAAAAAAB/gAA',
  'AAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAB+AAAAAAAAAAAAAAAAAAAAAAAYAAIAAAAAAAAAAAB+AAAAAAAAAAAAAAAAAAA',
  'AAAAYAAwAAAAAAAAAAAD8AAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAD4AAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAAA',
  'AAAD8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAADwYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4AAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAA+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAADwAACAefH/gAAAAAAAAAAAAAAAAEAAAAAAAAAAA',
  'B//8B///////4AAAAAAAAAAAAAAA/AAAAAAAAAAH///8P////////8AAAAAAAAAAAAAB3gAAAAATf//////8//////////+A',
  'AAAAAAAAAAgAHgAAAAH////////////////////AAAAAAAB4B////gAAAAP///////////////////4AAAAD////////4AAA',
  'AD////////////////////gAAALP///////8AAAAD/////////////////////gAABj////////wAAHg////////////////',
  '//////4A////////////////////////////////////////////////////////////////////////////////////////',
  '////////////////////////////////////////////////////////////////////////////////////////////////',
  '////////////////////////////////////////////////////////////////////////////////////////////////',
].join('');
const MASK_COLS = 240;
const MASK_STEP = 1.5;

type Vec = [number, number, number];
const D2R = Math.PI / 180;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const toVec = (lat: number, lon: number): Vec => [
  Math.cos(lat * D2R) * Math.cos(lon * D2R),
  Math.cos(lat * D2R) * Math.sin(lon * D2R),
  Math.sin(lat * D2R),
];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const normalize = (a: Vec) => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));
const slerp = (a: Vec, b: Vec, t: number): Vec => {
  const omega = Math.acos(Math.min(1, Math.max(-1, dot(a, b))));
  const s = Math.sin(omega);
  const ka = Math.sin((1 - t) * omega) / s;
  const kb = Math.sin(t * omega) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
};
const rotateZ = (a: Vec, deg: number): Vec => {
  const c = Math.cos(deg * D2R);
  const s = Math.sin(deg * D2R);
  return [a[0] * c - a[1] * s, a[0] * s + a[1] * c, a[2]];
};

const buildLandDots = () => {
  const bits = atob(LAND_MASK);
  const isLand = (lat: number, lon: number) => {
    const row = Math.min(119, Math.floor((90 - lat) / MASK_STEP));
    const col = Math.floor((lon + 180) / MASK_STEP) % MASK_COLS;
    const i = row * MASK_COLS + col;
    return ((bits.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1) === 1;
  };
  const pts: number[] = [];
  for (let lat = -90 + DOT_STEP / 2; lat < 90; lat += DOT_STEP) {
    // 每圈纬线按周长分点：高纬不挤成一团，点距处处一致
    const n = Math.max(1, Math.round((360 * Math.cos(lat * D2R)) / DOT_STEP));
    for (let j = 0; j < n; j++) {
      const lon = -180 + ((j + 0.5) * 360) / n;
      if (isLand(lat, lon)) pts.push(...toVec(lat, lon));
    }
  }
  return new Float32Array(pts);
};

export const GlobeRouteFlight: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const land = useMemo(buildLandDots, []);

  const A = toVec(ORIGIN.lat, ORIGIN.lon);
  const B = toVec(DEST.lat, DEST.lon);
  const routeAngle = Math.acos(dot(A, B));
  const lift = ARC_LIFT * (routeAngle / (Math.PI / 2));

  // 航线头：起步加速、巡航、到站刹车
  const head = interpolate(frame, FLIGHT, [0, 1], { ...clamp, easing: Easing.bezier(0.45, 0, 0.25, 1) });
  // 镜头：更软的 in-out，整体晚于航线头
  const cam = interpolate(frame, CAMERA, [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) });
  const drift = interpolate(frame, [CAMERA[1], GLOBE_ROUTE_FLIGHT_DURATION - 1], [0, HOLD_DRIFT], {
    ...clamp,
    easing: Easing.out(Easing.quad),
  });
  const routeNormal = normalize([
    A[1] * B[2] - A[2] * B[1],
    A[2] * B[0] - A[0] * B[2],
    A[0] * B[1] - A[1] * B[0],
  ]);
  const onRoute = slerp(A, B, cam);
  const off = CAMERA_OFFSET * D2R;
  const center = normalize(
    rotateZ(
      [
        onRoute[0] * Math.cos(off) - routeNormal[0] * Math.sin(off),
        onRoute[1] * Math.cos(off) - routeNormal[1] * Math.sin(off),
        onRoute[2] * Math.cos(off) - routeNormal[2] * Math.sin(off),
      ],
      -drift,
    ),
  );
  const east = normalize([-center[1], center[0], 0]);
  const north: Vec = [
    center[1] * east[2] - center[2] * east[1],
    center[2] * east[0] - center[0] * east[2],
    center[0] * east[1] - center[1] * east[0],
  ];
  const radius = (R_START + (R_END - R_START) * cam) * (1 - PULL * Math.sin(Math.PI * cam));
  const cx = width / 2;
  const cy = height / 2;

  const project = (p: Vec) => {
    const x = dot(p, east);
    const y = dot(p, north);
    const z = dot(p, center);
    // 正交投影下的遮挡：在球心平面之后、且投影落在圆盘内
    const visible = z > 0 || x * x + y * y > 1;
    return { X: cx + radius * x, Y: cy - radius * y, z, visible };
  };
  const arcPoint = (s: number) => scale(slerp(A, B, s), 1 + lift * Math.sin(Math.PI * s));

  useLayoutEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    // 大气辉光 + 球体
    const halo = ctx.createRadialGradient(cx, cy, radius * 0.9, cx, cy, radius * 1.16);
    halo.addColorStop(0, 'rgba(90, 140, 255, 0.34)');
    halo.addColorStop(0.35, 'rgba(90, 140, 255, 0.12)');
    halo.addColorStop(1, 'rgba(90, 140, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.16, 0, Math.PI * 2);
    ctx.fill();
    const body = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.1, cx, cy, radius);
    body.addColorStop(0, '#17264a');
    body.addColorStop(1, '#070d1c');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(130, 175, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 陆地点阵：按朝向分 6 档透明度，每档一条路径一次 fill
    const BUCKETS = 6;
    const paths = Array.from({ length: BUCKETS }, () => new Path2D());
    const r0 = radius * DOT_RADIUS;
    for (let i = 0; i < land.length; i += 3) {
      const z = land[i] * center[0] + land[i + 1] * center[1] + land[i + 2] * center[2];
      if (z <= 0.02) continue;
      const X = cx + radius * (land[i] * east[0] + land[i + 1] * east[1] + land[i + 2] * east[2]);
      const Y = cy - radius * (land[i] * north[0] + land[i + 1] * north[1] + land[i + 2] * north[2]);
      if (X < -20 || X > width + 20 || Y < -20 || Y > height + 20) continue;
      const b = Math.min(BUCKETS - 1, Math.floor(z * BUCKETS));
      const r = r0 * (0.55 + 0.45 * z); // 边缘点缩小：球面透视压缩
      paths[b].moveTo(X + r, Y);
      paths[b].arc(X, Y, r, 0, Math.PI * 2);
    }
    paths.forEach((p, b) => {
      const z = (b + 0.5) / BUCKETS;
      ctx.fillStyle = `rgba(${LAND_RGB}, ${0.12 + 0.88 * Math.pow(z, 0.8)})`;
      ctx.fill(p);
    });

    // 航线：按可见性断开，外层辉光 + 亮芯
    if (head > 0) {
      const STEPS = 120;
      const segments: { X: number; Y: number }[][] = [[]];
      for (let k = 0; k <= STEPS; k++) {
        const pt = project(arcPoint((k / STEPS) * head));
        if (pt.visible) segments[segments.length - 1].push(pt);
        else if (segments[segments.length - 1].length) segments.push([]);
      }
      for (const [lineWidth, style, blur] of [
        [9, 'rgba(122, 167, 255, 0.35)', 26],
        [3, 'rgba(235, 243, 255, 0.95)', 0],
      ] as const) {
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = style;
        ctx.shadowColor = ACCENT;
        ctx.shadowBlur = blur;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const seg of segments) {
          if (seg.length < 2) continue;
          ctx.beginPath();
          seg.forEach((p, i) => (i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y)));
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;

      // 航线头：到站后收掉
      const headAlpha = interpolate(frame, [FLIGHT[1] - 2, FLIGHT[1] + 6], [1, 0], clamp);
      const hp = project(arcPoint(head));
      if (hp.visible && headAlpha > 0) {
        const glow = ctx.createRadialGradient(hp.X, hp.Y, 0, hp.X, hp.Y, 30);
        glow.addColorStop(0, `rgba(170, 200, 255, ${0.9 * headAlpha})`);
        glow.addColorStop(1, 'rgba(170, 200, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(hp.X, hp.Y, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 255, 255, ${headAlpha})`;
        ctx.beginPath();
        ctx.arc(hp.X, hp.Y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 城市针 + 涟漪
    const drawPin = (v: Vec, pingStart: number, appear: number) => {
      const p = project(v);
      if (!p.visible || appear <= 0) return;
      for (const delay of [0, 9]) {
        const t = interpolate(frame, [pingStart + delay, pingStart + delay + 30], [0, 1], clamp);
        if (t <= 0 || t >= 1) continue;
        ctx.strokeStyle = `rgba(122, 167, 255, ${0.8 * (1 - t)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.X, p.Y, 10 + 62 * Easing.out(Easing.cubic)(t), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(255, 255, 255, ${appear})`;
      ctx.strokeStyle = `rgba(122, 167, 255, ${appear})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.X, p.Y, 9 * appear, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    drawPin(A, ORIGIN_PING, interpolate(frame, [0, 8], [0, 1], clamp));
    drawPin(B, FLIGHT[1], interpolate(frame, [FLIGHT[1] - 4, FLIGHT[1] + 4], [0, 1], clamp));
  });

  // 城市名放在航线的反侧，不被航线压字
  const label = (v: Vec, city: typeof ORIGIN, side: 'left' | 'right', appearAt: number, dimAfter?: number) => {
    const p = project(v);
    const t = interpolate(frame, [appearAt, appearAt + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
    const dim = dimAfter === undefined ? 1 : interpolate(frame, [dimAfter, dimAfter + 12], [1, 0.55], clamp);
    const opacity = Math.min(1, t) * dim * (p.visible && p.z > 0.15 ? 1 : 0);
    return (
      <div
        style={{
          position: 'absolute',
          left: side === 'right' ? p.X + 30 : p.X - 30,
          top: p.Y - 34,
          opacity,
          transform: `translateX(${side === 'right' ? 0 : -100}%) translateY(${(1 - t) * 10}px) scale(${0.92 + 0.08 * t})`,
          transformOrigin: side === 'right' ? 'left center' : 'right center',
          whiteSpace: 'nowrap',
          textShadow: '0 2px 18px rgba(0, 0, 0, 0.6)',
        }}
      >
        <span style={{ fontSize: 44, fontWeight: 600, color: '#fff', letterSpacing: '-0.01em' }}>{city.name}</span>
        <span style={{ marginLeft: 14, fontSize: 32, fontWeight: 500, color: 'rgba(170, 196, 245, 0.85)', letterSpacing: '0.08em' }}>
          {city.code}
        </span>
      </div>
    );
  };

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: SANS, overflow: 'hidden' }}>
      <canvas ref={canvasRef} width={width} height={height} style={{ position: 'absolute', inset: 0 }} />
      {label(A, ORIGIN, 'left', 4, FLIGHT[0] + 20)}
      {label(B, DEST, 'right', DEST_LABEL)}
    </AbsoluteFill>
  );
};
