// timeline-odometer — 口播模式「从 A 到 B」卡：两端节点的细时间轴 + 里程表滚动的大数字。
// 旁白念到关键词时：大数字像里程表从 from 滚到 to（转强调色），同一刻时间轴从起点画到终点、终点节点弹出；
// 终点说明等旁白念到才浮现。上方可放一张满版照片，用遮罩（不是盖暗幕）往下淡出成透明，融进暗底。
// 适合收尾与转折：「原订 9/12、9/13 才离开」「报名截止 12 日延到 19 日」「73 岁→74 岁」「2025→2026」。
// 设计坐标 1080×1920；所有时间点都是 props（帧号，相对本镜起点）。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { E, lerp, seg } from '../../_fixtures/Motion';
import { FakePhoto, N, NarrationStage } from '../../_fixtures/Narration';

export const TIMELINE_ODOMETER_DURATION = 150; // 5s @30fps

export type OdometerValue = {
  /** 起始值（字串，逐位比对）。例：'12'、'2025'、'73'。 */
  from: string;
  /** 结束值；与 from 同长时只有变动的位数会滚，不同长就整串滚。 */
  to: string;
  /** 开始滚动的帧（= 时间轴开始画线）。成片 = f(tWord(i, 关键词)) − from。 */
  at: number;
  /** 数字后的小单位（例：'日'、'歲'），不滚动；预设无。 */
  suffix?: string;
};

export type TimelineNode = {
  /** 节点上的短标（日期 / 年份），例：'9/12'。 */
  label: string;
  /** 节点下方说明，例：'金磚峰會開幕'。 */
  caption: string;
  /** 说明浮现的帧；起点预设 = 节点出现，终点预设 = 滚动完 + 30。 */
  captionAt?: number;
};

export type TimelineOdometerProps = {
  /** 上方满版照片（可省）。成片：<Img src={staticFile(...)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />。 */
  photo?: React.ReactNode;
  /** 大数字上方的强调色小标，例：'依原訂行程'。 */
  kicker?: string;
  /** 小标与大数字（以 from 值）浮现的帧。 */
  kickerAt: number;
  value: OdometerValue;
  /** [起点, 终点]。 */
  nodes: [TimelineNode, TimelineNode];
  /** 起点节点出现的帧，预设 8。 */
  startAt?: number;
  /** 本镜总帧数。 */
  duration: number;
  accent?: string;
};

// ───────── 几何与手感常量（蒙皮时不动）─────────
const X1 = 140;
const X2 = 940;
const PHOTO_H = 1100;
const NO_PHOTO_SHIFT = -260; // 没有照片时整组上移，重心回到画面中段
const KICKER_Y = 880;
const BIG_Y = 930;
const LINE_Y = 1300; // 说明文字底约 y 1410，字幕在 y≈1480
const BIG_SIZE = 200;
const DIGIT_H = 210; // 滚动窗高 = 行高
const ROLL = 16; // 滚动帧数
const MASK = 'linear-gradient(180deg, #000 40%, rgba(0,0,0,0.25) 72%, transparent 92%)';

/** #rrggbb 线性混色（静态位数跟着滚动一起转强调色）。 */
const mix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(lerp(t, v, y[i]))).join(',')})`;
};

export const TimelineOdometerShot: React.FC<TimelineOdometerProps> = ({
  photo,
  kicker,
  kickerAt,
  value,
  nodes,
  startAt = 8,
  duration,
  accent = N.accent,
}) => {
  const f = useCurrentFrame();
  const dy = photo ? 0 : NO_PHOTO_SHIFT;
  const muted = 'rgba(242,240,234,0.65)';

  const tag = seg(f, kickerAt, kickerAt + 12, E.outCubic);
  const big = seg(f, kickerAt + 2, kickerAt + 16, E.outCubic);
  const roll = seg(f, value.at, value.at + ROLL, E.inOutCubic);
  const line = seg(f, value.at - 2, value.at + ROLL + 2, E.inOutCubic);
  const n1 = seg(f, startAt, startAt + 12, E.outCubic);
  const n2 = seg(f, value.at + 14, value.at + 24, (t) => E.outBack(t));
  const c1 = seg(f, nodes[0].captionAt ?? startAt, (nodes[0].captionAt ?? startAt) + 12, E.outCubic);
  const c2At = nodes[1].captionAt ?? value.at + ROLL + 30;
  const c2 = seg(f, c2At, c2At + 12, E.outCubic);
  const push = lerp(Math.min(1, f / Math.max(1, duration)), 1, 1.06);

  // 逐位：同长时只滚变动的位数；不同长整串当一位滚
  const sameLen = value.from.length === value.to.length;
  const cols = sameLen
    ? Array.from(value.to).map((ch, i) => ({ a: value.from[i], b: ch }))
    : [{ a: value.from, b: value.to }];

  const nodeViews = [
    { x: X1, p: n1, d: nodes[0].label, t: nodes[0].caption, od: n1, ot: c1 },
    { x: X2, p: n2, d: nodes[1].label, t: nodes[1].caption, od: Math.min(1, n2), ot: c2 },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: N.bg }}>
      {photo ? (
        // 遮罩让照片本身淡出成透明（不是在上面盖暗幕）：预览缩放时容器底边落在半像素上也不会露出照片细线
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: PHOTO_H, overflow: 'hidden', WebkitMaskImage: MASK, maskImage: MASK }}>
          <div style={{ position: 'absolute', inset: 0, transform: `scale(${push})` }}>{photo}</div>
        </div>
      ) : null}

      {kicker ? (
        <div style={{ position: 'absolute', left: X1, top: KICKER_Y + dy, fontFamily: N.font, fontSize: 34, fontWeight: 700, color: accent, letterSpacing: 4, opacity: tag, transform: `translateY(${lerp(tag, 12, 0)}px)` }}>{kicker}</div>
      ) : null}

      <div style={{ position: 'absolute', left: X1 - 6, top: BIG_Y + dy, display: 'flex', alignItems: 'flex-start', fontFamily: N.serif, fontSize: BIG_SIZE, fontWeight: 700, lineHeight: `${DIGIT_H}px`, letterSpacing: -4, opacity: big, transform: `translateY(${lerp(big, 30, 0)}px)` }}>
        {cols.map((c, i) =>
          c.a === c.b ? (
            <span key={i} style={{ color: mix(N.onDark, accent, roll) }}>{c.b}</span>
          ) : (
            <span key={i} style={{ display: 'inline-block', height: DIGIT_H, overflow: 'hidden' }}>
              <span style={{ display: 'block', transform: `translateY(${-DIGIT_H * roll}px)` }}>
                <span style={{ display: 'block', color: N.onDark }}>{c.a}</span>
                <span style={{ display: 'block', color: accent }}>{c.b}</span>
              </span>
            </span>
          ),
        )}
        {value.suffix ? <span style={{ fontSize: BIG_SIZE * 0.3, fontFamily: N.font, color: muted, marginLeft: 16, alignSelf: 'flex-end', lineHeight: 1.6 }}>{value.suffix}</span> : null}
      </div>

      <div style={{ position: 'absolute', left: X1, top: LINE_Y + dy - 1, width: X2 - X1, height: 2, background: 'rgba(242,240,234,0.18)' }} />
      <div style={{ position: 'absolute', left: X1, top: LINE_Y + dy - 2, width: (X2 - X1) * line, height: 4, background: accent }} />
      {nodeViews.map((n, i) => (
        <React.Fragment key={i}>
          <div style={{ position: 'absolute', left: n.x - 12, top: LINE_Y + dy - 12, width: 24, height: 24, borderRadius: 12, background: i ? accent : N.onDark, transform: `scale(${n.p})` }} />
          <div style={{ position: 'absolute', left: i ? n.x - 300 : n.x - 12, width: 300, textAlign: i ? 'right' : 'left', top: LINE_Y + dy + 34, fontFamily: N.font }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: i ? accent : N.onDark, opacity: n.od, transform: `translateY(${lerp(n.od, 10, 0)}px)` }}>{n.d}</div>
            <div style={{ fontSize: 30, color: muted, marginTop: 8, opacity: n.ot, transform: `translateY(${lerp(n.ot, 10, 0)}px)` }}>{n.t}</div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

// ───────────────────────── demo ─────────────────────────

export const TimelineOdometer: React.FC = () => (
  <NarrationStage>
    <TimelineOdometerShot
      duration={TIMELINE_ODOMETER_DURATION}
      photo={<FakePhoto seed={5} />}
      kicker="截止日延後一週"
      kickerAt={30}
      value={{ from: '12', to: '19', at: 70, suffix: '日' }}
      nodes={[
        { label: '3/12', caption: '原訂報名截止' },
        { label: '3/19', caption: '延後後的新截止日', captionAt: 104 },
      ]}
    />
  </NarrationStage>
);
