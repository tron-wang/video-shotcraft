// quote-plate — 口播模式「引述」卡：谁说的 + 一句话。句子按旁白的断句一段一段出现，观众跟着念、不会抢读。
// 左缘一根强调色细直条先自上而下长出 → 各分句在自己的词锚帧由左往右擦出（不逐字打字、已出现的不压暗）
// → 最后一个分句之后，署名（姓名 · 身分，身分里可染一处强调色）短升淡入。
// 拉丁文引述自动用斜体衬线；中文保持正体（中文没有真斜体，浏览器假斜体很难看）。
// 版面从第 0 帧就按整句排好：未到点的分句 visibility:hidden 照样占位，所以分句出现时文字绝不重排。
// 底可以是纯 N.bg，也可以是照片 / 实拍（overMedia + children）：压实拍时不整格压暗，
// 只从左侧拉一道局部渐层暗幕托住文字，画面主体保持清楚。
// 设计坐标 1080×1920；所有时间点都是 props（帧号，相对本镜起点），成片里来自 f(tWord(i,'分句首词'))。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { E, lerp, seg } from '../../_fixtures/Motion';
import { FakePhoto, N, NarrationStage, SAFE, slowPush } from '../../_fixtures/Narration';

export const QUOTE_PLATE_DURATION = 180; // 6s @30fps

export type QuotePhrase = {
  /** 分句原文（含句末标点；不含外层引号）。必须与 facts.md 逐字一致。
   * 可含 \n 手动断行（只影响排版，不算改字）。 */
  text: string;
  /** 这个分句出现的帧。成片 = f(tWord(i, 分句第一个词)) − 镜头 from。 */
  at: number;
};

export type QuotePlateProps = {
  /** 整句按旁白断句切开；每个分句自成一行起头（过长才在行内折行）。 */
  phrases: QuotePhrase[];
  /** 说话的人（姓名或职称）。 */
  speaker: string;
  /** 身分 / 单位 / 媒体 / 情境，接在 speaker 后面。 */
  role?: string;
  /** role 里要染强调色的那一小段（例：「兩度」），最多一处。 */
  roleEmphasis?: string;
  /** 署名出现的帧，预设 = 最后一个分句的 at + 12。 */
  attributionAt?: number;
  /** 直条开始长出的帧，预设 = 第一个分句的 at − 6（不小于 0）。 */
  markAt?: number;
  /** 句中要用强调色的那一小段（整句最多一处；必须完整落在某一个分句里）。 */
  emphasis?: string;
  /** true = 压在照片 / 实拍上：children 当底层。 */
  overMedia?: boolean;
  /** 整格底层暗幕，预设 0.12（只压一点亮部，实拍保持清楚）。 */
  dim?: number;
  /** 左侧局部渐层暗幕的最深处不透明度，预设 0.78；亮天空、雪景调到 0.85。 */
  scrim?: number;
  /** 手动指定整组顶端 y（避开画面主体用，例如人脸在上半格就压到胸前）；不给则自动垂直置中。 */
  top?: number;
  /** 直条、强调词、role 强调的颜色，预设 N.accent。 */
  accent?: string;
  /** 本镜总帧数（只用来算极缓相机）。 */
  duration: number;
  /** 只支援靠左：靠左的行首是一条直线，和左侧直条对成一列，跟读最稳。 */
  align?: 'left';
  /** 照片 / 实拍层（overMedia 时才画）。 */
  children?: React.ReactNode;
};

// ───────── 版面常量 ─────────
const LEFT = SAFE.x + 24; // 84：直条左缘
const BAR_W = 6;
const TEXT_GAP = 40; // 直条 → 文字
const TEXT_X = LEFT + TEXT_GAP; // 124
const BLOCK_W = 900 - TEXT_X; // 776，右缘 x = 900：不进右侧平台按钮带
const CENTER_Y = 770; // 自动置中时整组的垂直中心，略高于 SAFE 中心
const ATTR_GAP = 44; // 句子 → 署名
const ATTR_H = 40;
const BAR_IN = 10; // 直条长出帧数
const WIPE = 12; // 分句擦出帧数
const ATTR_IN = 10; // 署名入场帧数
const RISE = 10; // 署名入场上升 px（≤ 12）

/** 中文字号三档：按整句字数（全形 1、半形 0.55）。超过 48 仍用最小档，但该拆成两张卡了。 */
const TIERS: { max: number; size: number }[] = [
  { max: 24, size: 84 },
  { max: 36, size: 72 },
  { max: Infinity, size: 58 }, // 58×13 = 754 ≤ 776：13 字分句独占一行
];
/** 拉丁文引述另一套：按字符数（含空格）。行高更紧，短句放得下更大的字。 */
const LATIN_TIERS: { max: number; size: number }[] = [
  { max: 16, size: 104 },
  { max: 32, size: 84 },
  { max: Infinity, size: 68 },
];
export const QUOTE_PLATE_MAX_CHARS = 48;

const em = (s: string) => Array.from(s).reduce((a, c) => a + (c.charCodeAt(0) > 0xff ? 1 : 0.55), 0);
/** 全句 ≥ 80% 半形字就当拉丁文引述：斜体、紧行高、拉丁字号档。 */
const isLatin = (s: string) => {
  const cs = Array.from(s.replace(/\s/g, ''));
  return cs.length > 0 && cs.filter((c) => c.charCodeAt(0) <= 0xff).length / cs.length >= 0.8;
};

/** 选字号 + 估行数（只用来算垂直置中，不参与折行——折行交给浏览器）。 */
export const quotePlateLayout = (phrases: QuotePhrase[], top?: number) => {
  const rows = phrases.flatMap((p) => p.text.split('\n'));
  const latin = isLatin(rows.join(''));
  let size: number;
  let lines: number;
  if (latin) {
    const total = rows.reduce((a, r) => a + r.length, 0);
    size = LATIN_TIERS.find((t) => total <= t.max)!.size;
    const perLine = Math.floor(BLOCK_W / (size * 0.5)); // 衬线斜体平均字宽约 0.5em
    lines = rows.reduce((a, r) => a + Math.max(1, Math.ceil(r.length / perLine)), 0);
  } else {
    const lens = rows.map((r) => em(r));
    const total = lens.reduce((a, b) => a + b, 0);
    const longest = Math.max(0, ...lens);
    let tier = TIERS.findIndex((t) => total <= t.max);
    // 最长的分句在这一档放不进一行、小一档却放得进 → 降一档，换来「一个分句一行」的干净断行
    while (tier < TIERS.length - 1 && longest * TIERS[tier].size > BLOCK_W && longest * TIERS[TIERS.length - 1].size <= BLOCK_W) tier++;
    size = TIERS[tier].size;
    const perLine = Math.floor(BLOCK_W / size);
    lines = lens.reduce((a, l) => a + Math.max(1, Math.ceil(l / perLine)), 0);
  }
  const lineH = latin ? 1.12 : 1.5;
  const height = lines * size * lineH + ATTR_GAP + ATTR_H;
  // 垂直置中，但顶不高过 SAFE 顶、底不低过 SAFE 底
  const auto = Math.max(SAFE.y + 40, Math.min(CENTER_Y - height / 2, SAFE.y + SAFE.h - 40 - height));
  return { size, lines, lineH, latin, top: top ?? auto, height };
};

/** 把 emphasis 在字串里的第一处包成强调色 span；颜色不影响字宽，版面不变。 */
const withEmphasis = (text: string, emphasis: string | undefined, color: string): React.ReactNode => {
  if (!emphasis) return text;
  const i = text.indexOf(emphasis);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span style={{ color }}>{emphasis}</span>
      {text.slice(i + emphasis.length)}
    </>
  );
};

export const QuotePlateShot: React.FC<QuotePlateProps> = ({
  phrases,
  speaker,
  role,
  roleEmphasis,
  attributionAt,
  markAt,
  emphasis,
  overMedia = false,
  dim = 0.12,
  scrim = 0.78,
  top,
  accent = N.accent,
  duration,
  children,
}) => {
  const f = useCurrentFrame();
  const firstAt = phrases.length ? phrases[0].at : 0;
  const lastAt = phrases.length ? phrases[phrases.length - 1].at : 0;
  const mAt = Math.max(0, markAt ?? firstAt - 6);
  const aAt = attributionAt ?? lastAt + 12;

  const L = quotePlateLayout(phrases, top);
  const emphIdx = emphasis ? phrases.findIndex((p) => p.text.includes(emphasis)) : -1;

  const pScrim = seg(f, mAt - 4, mAt + 10, E.outCubic);
  const pBar = seg(f, mAt, mAt + BAR_IN, E.outCubic);
  const pAttr = seg(f, aAt, aAt + ATTR_IN, E.outCubic);

  // 极缓相机：底图 1.00→1.04；文字组反向从 1/1.03 推到 1.00（文字右缘贴着 x=900，不能往外放大）
  const mediaPush = slowPush(f, duration, 1, 1.04);
  const textPush = slowPush(f, duration, 1 / 1.03, 1);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: N.bg }}>
      {overMedia ? (
        <>
          <div style={{ position: 'absolute', inset: 0, transform: `scale(${mediaPush})`, transformOrigin: '50% 45%' }}>{children}</div>
          <div style={{ position: 'absolute', inset: 0, background: N.bg, opacity: dim }} />
          {/* 局部暗幕：左深右透、上下羽化，只托住文字那一带 */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: L.top - 170,
              width: 1080,
              height: L.height + 340,
              opacity: pScrim,
              background: `linear-gradient(90deg, rgba(14,17,22,${scrim}) 0%, rgba(14,17,22,${scrim * 0.7}) 45%, rgba(14,17,22,0) 80%)`,
              WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 25%, #000 75%, transparent 100%)',
            }}
          />
        </>
      ) : null}

      <div
        style={{
          position: 'absolute',
          left: LEFT,
          top: L.top,
          width: TEXT_GAP + BLOCK_W,
          transform: `scale(${textPush})`,
          transformOrigin: `0px ${L.height / 2}px`,
        }}
      >
        {/* 直条：自上而下长出，高度涵盖句子 + 署名 */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: BAR_W, height: L.height * pBar, background: accent }} />

        {/* 句子：所有分句从第 0 帧就在最终位置占位 */}
        <div
          style={{
            marginLeft: TEXT_GAP,
            fontFamily: N.serif,
            fontStyle: L.latin ? 'italic' : 'normal',
            fontWeight: 700,
            fontSize: L.size,
            lineHeight: L.lineH,
            color: N.onDark,
            textAlign: 'left',
            lineBreak: 'strict', // 行首不出现「，。」」等收尾标点
            wordBreak: 'normal', // 不用 keep-all：中文没有空格，keep-all 会让整个分句不折行直接冲出右缘
            overflowWrap: 'break-word',
            whiteSpace: 'pre-line', // 让分句里的 \n 生效
            textWrap: 'balance', // 分句必须折行时两行等长，不留 1–2 字的孤行
            fontKerning: 'none',
            textShadow: overMedia ? '0 4px 18px rgba(0,0,0,0.5)' : undefined,
          }}
        >
          {phrases.map((p, i) => {
            const t = seg(f, p.at, p.at + WIPE, E.outQuart);
            return (
              <div
                key={i}
                style={{
                  visibility: f < p.at ? 'hidden' : 'visible',
                  // 由左往右擦出；上下左多留边，斜体出血与阴影不被裁
                  clipPath: `inset(-20px ${lerp(t, 100, 0)}% -30px -20px)`,
                }}
              >
                {withEmphasis(p.text, i === emphIdx ? emphasis : undefined, accent)}
              </div>
            );
          })}
        </div>

        {/* 署名：姓名（粗）+ 身分（细），身分里可染一处强调色 */}
        <div
          style={{
            marginLeft: TEXT_GAP,
            marginTop: ATTR_GAP,
            height: ATTR_H,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            visibility: f < aAt ? 'hidden' : 'visible',
            opacity: pAttr,
            transform: `translateY(${lerp(pAttr, RISE, 0)}px)`,
            fontFamily: N.font,
            fontSize: 38,
            lineHeight: 1,
            whiteSpace: 'pre',
            wordBreak: 'keep-all',
            textShadow: overMedia ? '0 2px 12px rgba(0,0,0,0.6)' : undefined,
          }}
        >
          <span style={{ fontWeight: 800, color: N.onDark }}>{speaker}</span>
          {role ? <span style={{ fontWeight: 400, color: N.bar }}>{withEmphasis(role, roleEmphasis, accent)}</span> : null}
        </div>
      </div>
    </div>
  );
};

// ───────────────────────── demo ─────────────────────────

export const QuotePlate: React.FC = () => (
  <NarrationStage>
    <QuotePlateShot
      duration={QUOTE_PLATE_DURATION}
      speaker="課程負責人"
      role="主辦單位 · 記者會上表示"
      roleEmphasis="記者會"
      phrases={[
        { text: '我們沒有預期到這樣的反應，', at: 24 },
        { text: '報名開放不到兩小時就額滿，', at: 70 },
        { text: '下一期會把名額加倍。', at: 112 },
      ]}
      emphasis="名額加倍"
      attributionAt={130}
      overMedia
    >
      {/* 中性风景：不是说话者本人的肖像就别放人脸 */}
      <FakePhoto seed={3} />
    </QuotePlateShot>
  </NarrationStage>
);
