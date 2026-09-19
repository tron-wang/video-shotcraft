// chapter-slate — 口播片的章节卡：句间气口里的一张 1.5–2s 章节页（2026-09 改版）。
// 两种款式（look）：
//  · numeral（预设，巨型编号）：深底自下而上擦满 → 超大「02」从遮罩线后升起、空心描边渐渐填成强调色
//    → 标题升起 + 一排章节进度条（当前段亮起）→ 整块继续向上擦走，露出下一镜
//  · mask（文字遮罩穿越）：深底上超大标题的字里透出下一镜，字从小推大到把画面整个填满——章节卡本身就是转场
// 退场后下一镜左上角挂 ChapterTag（「02 | 證據」胶囊），观众中途滑进来也知道现在讲到哪。
// （旧版：每章一个鲜艳纯色色板 + 线稿图标，读起来是扁平设计时代；使用者从四案里选了巨型编号，也要文字遮罩穿越。）
// 设计坐标 1080×1920；所有时间点都是 props（帧号，相对本镜起点）。
import React from 'react';
import { Sequence, useCurrentFrame } from 'remotion';
import { FakeClip, N, NarrationStage, SAFE } from '../../_fixtures/Narration';
import { E, lerp, seg } from '../../_fixtures/Motion';

export type ChapterLook = 'numeral' | 'mask';

export type ChapterSlateProps = {
  /** 章节序号（显示为两位数）。 */
  index: number;
  title: string;
  /** 全片共几章（numeral 的进度条段数）；不给就不画进度条。 */
  total?: number;
  /** 款式，预设 numeral。 */
  look?: ChapterLook;
  /** mask 款：透进字里的下一镜画面（铺满 1080×1920）。不给就用强调色填字。 */
  reveal?: React.ReactNode;
  /** 本镜总帧数；退场在 duration − exitFrames 起跑、末帧前完成。 */
  duration: number;
  /** false = 不退场（留给下一镜自己做转场）。只影响 numeral。 */
  exit?: boolean;
  /** 章节页开始进场的帧。成片里 = 上一句 end 之后的气口起点。 */
  wipeAt?: number;
  wipeFrames?: number;
  /** 编号 / 标题升起的帧（相对本镜起点）与帧数。 */
  numberAt?: number;
  titleAt?: number;
  riseFrames?: number;
  exitFrames?: number;
  /** 底色与强调色（换风格档时给 theme 的值）。 */
  bg?: string;
  accent?: string;
};

// ───────── 几何与手感常量（蒙皮时不动）─────────
const NUM_SIZE = 520; // 巨型编号字级（衬线）
const NUM_TOP = 520;
const TITLE_TOP = 1080;
const BAR_TOP = 1280;
const LEFT = 90;
const MASK_SIZE = 380; // mask 款标题字级
const MASK_ZOOM = 40; // 穿越时放大到的倍率
const pad2 = (n: number) => String(n).padStart(2, '0');

/** 从一条看不见的遮罩线后升起：未到点时 translateY(105%) 被 overflow 裁掉 = 完全不可见。 */
const Rise: React.FC<{ p: number; h: number; children: React.ReactNode }> = ({ p, h, children }) => (
  <div style={{ height: h, overflow: 'hidden', visibility: p <= 0 ? 'hidden' : 'visible' }}>
    <div style={{ transform: `translateY(${lerp(p, 105, 0)}%)` }}>{children}</div>
  </div>
);

export const ChapterSlateShot: React.FC<ChapterSlateProps> = ({
  index, title, total, look = 'numeral', reveal, duration, exit = true,
  wipeAt = 0, wipeFrames = 14, numberAt = 4, titleAt = 10, riseFrames = 16, exitFrames = 14,
  bg = N.bg, accent = N.accent,
}) => {
  const f = useCurrentFrame();
  const inT = seg(f, wipeAt, wipeAt + wipeFrames, E.inOutCubic);
  const exitAt = duration - exitFrames;

  if (look === 'mask') {
    // 字从 0.9 放到 1，停住；退场时以 t³ 加速放大到 40 倍穿过去
    const pTitle = seg(f, wipeAt + numberAt, wipeAt + numberAt + riseFrames, E.outQuart);
    const zoom = Math.pow(seg(f, exitAt, duration), 3);
    const sc = lerp(pTitle, 0.9, 1) * lerp(zoom, 1, MASK_ZOOM);
    const bgO = inT * (1 - seg(f, exitAt + exitFrames * 0.5, duration));
    if (inT <= 0 || f >= duration) return null;
    const maskId = `cs-mask-${index}`;
    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        <div style={{ position: 'absolute', inset: 0, background: bg, opacity: bgO }} />
        <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0, opacity: inT }}>
          <defs>
            <mask id={maskId}>
              <rect width="1080" height="1920" fill="black" />
              <text x="540" y="1040" textAnchor="middle" fontFamily={N.font} fontWeight={900} fontSize={MASK_SIZE} fill="white" transform={`translate(540 960) scale(${sc}) translate(-540 -960)`}>{title}</text>
            </mask>
          </defs>
          {reveal ? (
            <foreignObject width="1080" height="1920" mask={`url(#${maskId})`}>
              <div style={{ position: 'relative', width: 1080, height: 1920 }}>{reveal}</div>
            </foreignObject>
          ) : (
            <rect width="1080" height="1920" fill={accent} mask={`url(#${maskId})`} />
          )}
        </svg>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 590, textAlign: 'center', fontFamily: N.font, fontSize: 34, fontWeight: 700, color: accent, letterSpacing: 12, opacity: inT * (1 - Math.min(1, zoom * 4)) }}>
          CHAPTER {pad2(index)}
        </div>
      </div>
    );
  }

  // numeral：入场上缘自下而上擦满；退场下缘继续自下而上擦走——同一个行进方向，读作「一块板路过」
  const outT = exit ? seg(f, exitAt, duration - 1, E.inOutCubic) : 0;
  if (inT <= 0 || outT >= 1) return null;
  const pNum = seg(f, wipeAt + numberAt, wipeAt + numberAt + riseFrames, E.outQuart);
  const pTitle = seg(f, wipeAt + titleAt, wipeAt + titleAt + riseFrames - 2, E.outQuart);
  const fill = seg(f, wipeAt + numberAt + 10, wipeAt + numberAt + 28);
  // 退场时内容比擦除线多走 200px，缩短「字被切一半」的停留
  const lift = lerp(outT, 0, -200);
  return (
    <div style={{ position: 'absolute', inset: 0, background: bg, overflow: 'hidden', clipPath: `inset(${(1 - inT) * 100}% 0 ${outT * 100}% 0)` }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translateY(${lift}px)` }}>
        <div style={{ position: 'absolute', left: LEFT - 20, top: NUM_TOP }}>
          <Rise p={pNum} h={NUM_SIZE}>
            <div style={{ fontFamily: N.serif, fontSize: NUM_SIZE, fontWeight: 700, lineHeight: `${NUM_SIZE}px`, letterSpacing: -20, color: 'transparent', WebkitTextStroke: `4px ${accent}`, position: 'relative' }}>
              {pad2(index)}
              <span style={{ position: 'absolute', left: 0, top: 0, color: accent, opacity: fill }}>{pad2(index)}</span>
            </div>
          </Rise>
        </div>
        <div style={{ position: 'absolute', left: LEFT, top: TITLE_TOP, width: SAFE.w - 60 }}>
          <Rise p={pTitle} h={150}>
            <div style={{ fontFamily: N.font, fontSize: 120, fontWeight: 900, lineHeight: '150px', color: N.onDark, whiteSpace: 'nowrap' }}>{title}</div>
          </Rise>
        </div>
        {total && total > 1 ? (
          <div style={{ position: 'absolute', left: LEFT, top: BAR_TOP, display: 'flex', gap: 12 }}>
            {Array.from({ length: total }, (_, i) => {
              const cur = i === index - 1;
              return (
                <div key={i} style={{ width: 120, height: 6, borderRadius: 3, background: cur ? accent : i < index - 1 ? 'rgba(242,240,234,0.6)' : 'rgba(242,240,234,0.18)', transform: `scaleX(${cur ? pTitle : 1})`, transformOrigin: 'left' }} />
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
};

// ───────────────────────── 常驻角标 ─────────────────────────

/** 章节角标：「02 | 證據」胶囊，挂在下一镜左上角（左下角留给来源条）。静态件，跟着章节卡退场露出的下一镜一起出现。 */
export const ChapterTag: React.FC<{ index: number; title?: string; x?: number; y?: number; accent?: string }> = ({
  index, title, x = SAFE.x, y = 170, accent = N.accent,
}) => (
  <div
    style={{
      position: 'absolute', left: x, top: y, display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px',
      borderRadius: 999, background: 'rgba(14,17,22,0.72)', fontFamily: N.font, color: N.onDark, fontSize: 28, fontWeight: 700,
    }}
  >
    <span style={{ color: accent, letterSpacing: 2, fontVariantNumeric: 'tabular-nums' }}>{pad2(index)}</span>
    {title ? (
      <>
        <span style={{ width: 1.5, height: 22, background: 'rgba(242,240,234,0.4)' }} />
        <span>{title}</span>
      </>
    ) : null}
  </div>
);

// ───────────────────────── demo ─────────────────────────

const SLOT = 70; // 每章 70f：章节页 56f + 露出「后续镜头 + 角标」14f，再被下一章盖上
const SLATE = 56;
const DEMO: { title: string; hue: number; look: ChapterLook }[] = [
  { title: '發生了什麼', hue: 28, look: 'numeral' },
  { title: '證據', hue: 205, look: 'mask' },
  { title: '影響', hue: 150, look: 'numeral' },
];

export const CHAPTER_SLATE_DURATION = SLOT * DEMO.length; // 210f

export const ChapterSlate: React.FC = () => {
  const f = useCurrentFrame();
  // 底层在章节页盖满之后才换成本章的后续镜头（换底发生在章节页背后）；mask 款的底层要从穿越开始就是本章镜头
  const k = Math.min(DEMO.length - 1, Math.floor((f - 14) / SLOT));
  return (
    <NarrationStage>
      {k >= 0 ? (
        <>
          <FakeClip hue={DEMO[k].hue} />
          <ChapterTag index={k + 1} title={DEMO[k].title} />
        </>
      ) : null}
      {DEMO.map((d, i) => (
        <Sequence key={i} from={i * SLOT} durationInFrames={SLOT} layout="none">
          <ChapterSlateShot index={i + 1} title={d.title} total={DEMO.length} look={d.look} reveal={<FakeClip hue={d.hue} />} duration={SLATE} />
        </Sequence>
      ))}
    </NarrationStage>
  );
};
