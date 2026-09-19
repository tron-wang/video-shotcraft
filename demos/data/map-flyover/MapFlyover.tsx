// map-flyover —— 真实卫星地图 A→B 飞越（2026-09，参考 remotion.dev「map-flyover」与 remotionui「map-flight」的动效，
// 程式为本卡自写：不依赖 maplibre / turf，直接拼 NASA GIBS 的 Web Mercator 图砖，大圆航线自己算）。
// 镜头：起点城市近景 → 拉远把整条航线收进画面、镜头中心跟着航线头走 → 推近落在终点。
// 金色航线沿大圆由起点画到终点（带柔光与光点航头），终点抵达时金环弹出、地名浮现。
// 预设夜间城市灯光（VIIRS Black Marble，黑底金黄灯火 = 黑金调性），另有白天卫星图（Blue Marble）。
// 图砖来自 NASA EOSDIS GIBS（公开、免金钥）；画面右下角必须保留来源标示。
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from 'remotion';

export const MAP_FLYOVER_DURATION = 180; // 6s @30fps

export type MapPlace = { lat: number; lon: number; label?: string };
export type MapFlyoverProps = {
  from: MapPlace;
  to: MapPlace;
  /** night = 夜间城市灯光（预设）；day = 白天卫星图。 */
  style?: 'night' | 'day';
  /** 镜头开始离开起点的帧 / 回到终点近景的帧。 */
  camFrom?: number;
  camTo?: number;
  /** 航线开始画 / 画到终点的帧。 */
  routeFrom?: number;
  routeTo?: number;
  /** 近景比全景多推几级（1 级 = 放大 2 倍）。 */
  closeUp?: number;
  accent?: string;
  /** 来源标示文字（GIBS 规定要标）。 */
  credit?: string;
};

// ───────── 图砖（NASA GIBS，EPSG:3857 / GoogleMapsCompatible，最高 Level 8）─────────
const MAX_LEVEL = 8;
const TILE = 256;
const tileUrl = (style: 'night' | 'day', z: number, x: number, y: number) =>
  style === 'night'
    ? `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.png`
    : `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`;

// ───────── 数学：墨卡托投影、大圆插值 ─────────
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
/** 经纬度 → zoom 0 的世界像素（0–256）。 */
const project = (lat: number, lon: number) => {
  const s = Math.sin(rad(Math.max(-85, Math.min(85, lat))));
  return { x: ((lon + 180) / 360) * TILE, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE };
};
const toVec = (p: MapPlace) => [Math.cos(rad(p.lat)) * Math.cos(rad(p.lon)), Math.cos(rad(p.lat)) * Math.sin(rad(p.lon)), Math.sin(rad(p.lat))];
/** 大圆上 t（0–1）处的经纬度。 */
const greatCircle = (a: MapPlace, b: MapPlace, t: number): MapPlace => {
  const va = toVec(a), vb = toVec(b);
  const dot = Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const om = Math.acos(dot);
  if (om < 1e-6) return { lat: a.lat, lon: a.lon };
  const k1 = Math.sin((1 - t) * om) / Math.sin(om), k2 = Math.sin(t * om) / Math.sin(om);
  const v = [k1 * va[0] + k2 * vb[0], k1 * va[1] + k2 * vb[1], k1 * va[2] + k2 * vb[2]];
  return { lat: deg(Math.atan2(v[2], Math.hypot(v[0], v[1]))), lon: deg(Math.atan2(v[1], v[0])) };
};
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export const MapFlyoverShot: React.FC<MapFlyoverProps> = ({
  from, to, style = 'night', camFrom = 18, camTo = 156, routeFrom = 36, routeTo = 132, closeUp = 1.6,
  accent = '#e0b04b', credit = 'Imagery: NASA EOSDIS GIBS',
}) => {
  const f = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const u = Math.min(W, H) / 1080;

  // 全景 zoom：整条航线（采样 32 点）的外框放进画面 60%
  const samples = Array.from({ length: 33 }, (_, i) => project(greatCircle(from, to, i / 32).lat, greatCircle(from, to, i / 32).lon));
  const bw = Math.max(1e-3, Math.max(...samples.map((p) => p.x)) - Math.min(...samples.map((p) => p.x)));
  const bh = Math.max(1e-3, Math.max(...samples.map((p) => p.y)) - Math.min(...samples.map((p) => p.y)));
  const zFit = Math.min(MAX_LEVEL - 0.5, Math.log2(Math.min((W * 0.6) / bw, (H * 0.6) / bh)));
  const zNear = Math.min(MAX_LEVEL, zFit + closeUp);

  // 镜头：进度 c 从起点走到终点；zoom 两端近、中段远（sin 包络）；中心往航线中点靠一点，全景时两端都在画面里
  const c = easeInOutCubic(clamp01((f - camFrom) / (camTo - camFrom)));
  const z = mix(zNear, zFit, Math.sin(Math.PI * c));
  const head = greatCircle(from, to, c);
  const mid = greatCircle(from, to, 0.5);
  const w = 0.6 * Math.sin(Math.PI * c);
  const camLat = mix(head.lat, mid.lat, w), camLon = mix(head.lon, mid.lon, w);

  // 世界像素 → 画面：先在 zoom 0 算，再乘 2^z
  const scale = Math.pow(2, z);
  const cam = project(camLat, camLon);
  const toScreen = (lat: number, lon: number) => {
    const p = project(lat, lon);
    return { x: W / 2 + (p.x - cam.x) * scale, y: H / 2 + (p.y - cam.y) * scale };
  };

  // 图砖：取 L = floor(z)（≤ 8），砖在画面上的边长 = 256 × 2^(z−L)
  const L = Math.max(0, Math.min(MAX_LEVEL, Math.floor(z)));
  const n = Math.pow(2, L);
  const ts = TILE * Math.pow(2, z - L);
  const cx = cam.x * n, cy = cam.y * n; // 镜头中心在 L 级的世界像素
  const x0 = Math.floor((cx - W / 2 / (ts / TILE)) / TILE), x1 = Math.floor((cx + W / 2 / (ts / TILE)) / TILE);
  const y0 = Math.max(0, Math.floor((cy - H / 2 / (ts / TILE)) / TILE)), y1 = Math.min(n - 1, Math.floor((cy + H / 2 / (ts / TILE)) / TILE));
  const tiles: React.ReactNode[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const wx = ((tx % n) + n) % n; // 经度方向环绕
      tiles.push(
        <Img key={`${L}-${tx}-${ty}`} src={tileUrl(style, L, wx, ty)}
          style={{ position: 'absolute', left: W / 2 + (tx * TILE - cx) * (ts / TILE), top: H / 2 + (ty * TILE - cy) * (ts / TILE), width: ts + 0.5, height: ts + 0.5 }} />,
      );
    }
  }

  // 航线：画到 r
  const r = easeInOutCubic(clamp01((f - routeFrom) / (routeTo - routeFrom)));
  const N = 80;
  const pts = Array.from({ length: Math.max(2, Math.ceil(N * r) + 1) }, (_, i) => {
    const g = greatCircle(from, to, Math.min(r, i / N));
    return toScreen(g.lat, g.lon);
  });
  const poly = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const hp = pts[pts.length - 1];
  const A = toScreen(from.lat, from.lon), B = toScreen(to.lat, to.lon);
  const arrive = clamp01((f - routeTo) / 14);
  const pop = arrive < 1 ? 1 - Math.pow(1 - arrive, 3) * Math.cos(arrive * 6) : 1;
  const originLabel = 1 - clamp01((f - routeFrom - 30) / 14);
  const destLabel = clamp01((f - routeTo - 6) / 12);

  const label = (p: { x: number; y: number }, text: string | undefined, o: number) =>
    text && o > 0 ? (
      <div style={{ position: 'absolute', left: p.x + 26 * u, top: p.y - 30 * u, padding: `${8 * u}px ${18 * u}px`, borderRadius: 999, background: 'rgba(11,12,15,0.78)', border: `1.5px solid ${accent}88`, color: '#f2f0ea', fontFamily: '"PingFang TC","Noto Sans TC",sans-serif', fontSize: 34 * u, fontWeight: 800, whiteSpace: 'nowrap', opacity: o, transform: `translateY(${(1 - o) * 10 * u}px)` }}>{text}</div>
    ) : null;

  return (
    <AbsoluteFill style={{ background: '#05070b', overflow: 'hidden' }}>
      <AbsoluteFill style={{ filter: style === 'night' ? 'saturate(0.85) sepia(0.25) brightness(1.15) contrast(1.05)' : 'saturate(0.9) brightness(0.8)' }}>{tiles}</AbsoluteFill>
      {/* 四周压暗，把视线收到航线 */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(5,7,11,0.75) 100%)' }} />
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        {r > 0 ? (
          <>
            <polyline points={poly} fill="none" stroke={accent} strokeWidth={14 * u} strokeLinecap="round" strokeLinejoin="round" opacity={0.25} style={{ filter: `blur(${8 * u}px)` }} />
            <polyline points={poly} fill="none" stroke={accent} strokeWidth={5 * u} strokeLinecap="round" strokeLinejoin="round" />
            {r < 1 ? (<><circle cx={hp.x} cy={hp.y} r={22 * u} fill={accent} opacity={0.3} /><circle cx={hp.x} cy={hp.y} r={9 * u} fill="#fff4d6" /></>) : null}
          </>
        ) : null}
        <circle cx={A.x} cy={A.y} r={12 * u} fill={accent} />
        <circle cx={A.x} cy={A.y} r={24 * u} fill="none" stroke={accent} strokeWidth={3 * u} opacity={0.7} />
        {arrive > 0 ? (
          <>
            <circle cx={B.x} cy={B.y} r={34 * u * pop} fill="none" stroke={accent} strokeWidth={4 * u} opacity={0.9} />
            <circle cx={B.x} cy={B.y} r={12 * u * Math.min(1, arrive * 2)} fill={accent} />
          </>
        ) : null}
      </svg>
      {label(A, from.label, originLabel)}
      {label(B, to.label, destLabel)}
      <div style={{ position: 'absolute', right: 24 * u, bottom: 20 * u, fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 16 * u, color: 'rgba(242,240,234,0.55)' }}>{credit}</div>
    </AbsoluteFill>
  );
};

// demo：新德里 → 北京（夜间城市灯光）
export const MapFlyover: React.FC = () => (
  <MapFlyoverShot from={{ lat: 28.61, lon: 77.21, label: '新德里' }} to={{ lat: 39.9, lon: 116.4, label: '北京' }} />
);
