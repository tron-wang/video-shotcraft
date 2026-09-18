// quote-plate — 口播模式「引述」卡：谁说的 + 一句话。句子按旁白的断句一段一段出现，观众跟着念、不会抢读。
// 大号开引号（强调色）先到 → 各分句在自己的词锚帧短升 + 淡入（不逐字打字、已出现的不压暗）
// → 最后一个分句之后，细线 + 署名（姓名 · 身分 / 媒体）跟上。
// 版面从第 0 帧就按整句排好：未到点的分句 visibility:hidden 照样占位，所以分句出现时文字绝不重排。
// 底可以是纯 N.bg，也可以是重压暗的照片 / 实拍（overMedia + children）。
// 设计坐标 1080×1920；所有时间点都是 props（帧号，相对本镜起点），成片里来自 f(tWord(i,'分句首词'))。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { E, lerp, seg } from '../../_fixtures/Motion';
import { FakePhoto, N, NarrationStage, SAFE, slowPush } from '../../_fixtures/Narration';

export const QUOTE_PLATE_DURATION = 180; // 6s @30fps

export type QuotePhrase = {
  /** 分句原文（含句末标点；不含外层引号——引号由卡画）。必须与 facts.md 逐字一致。
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
  /** 身分 / 单位 / 媒体，接在 speaker 后面用「·」隔开。 */
  role?: string;
  /** 署名出现的帧，预设 = 最后一个分句的 at + 18。 */
  attributionAt?: number;
  /** 大引号出现的帧，预设 = 第一个分句的 at − 6（不小于 0）。 */
  markAt?: number;
  /** 句中要用强调色的那一小段（整句最多一处；必须完整落在某一个分句里）。 */
  emphasis?: string;
  /** true = 压在照片 / 实拍上：children 当底层，上面盖一层暗幕。 */
  overMedia?: boolean;
  /** 暗幕不透明度，预设 0.62（引述是要读的字，比 stat-punch 的 0.55 再压一档）。 */
  dim?: number;
  /** 引号、强调词、细线的颜色，预设 N.accent。 */
  accent?: string;
  /** 本镜总帧数（只用来算极缓相机）。 */
  duration: number;
  /** 只支援靠左：多行中文置中时每行左缘都在跳，眼睛每换一行要重新找行首；分句长短不一时
   * 轮廓像一棵树，读起来是「几个短语」而不是「一句话」。靠左的行首是一条直线，跟读最稳。 */
  align?: 'left';
  /** 照片 / 实拍层（overMedia 时才画）。 */
  children?: React.ReactNode;
};

// ───────── 版面常量 ─────────
const LEFT = SAFE.x + 24; // 84
const BLOCK_W = 816; // 右缘 x = 900：刚好不进右侧平台按钮带
const LINE_H = 1.5;
const CENTER_Y = 770; // 整组（引号 + 句子 + 署名）的垂直中心，略高于 SAFE 中心
const MARK_H = 120; // 引号图形高
const MARK_GAP = 44; // 引号 → 句子
const ATTR_GAP = 56; // 句子 → 署名
const ATTR_H = 60;
const REVEAL = 7; // 分句入场帧数
const RISE = 10; // 分句入场上升 px（≤ 12）

/** 字号三档：按整句字数（全形 1、半形 0.55）。超过 48 仍用最小档，但该拆成两张卡了。 */
const TIERS: { max: number; size: number }[] = [
  { max: 24, size: 84 },
  { max: 36, size: 72 },
  { max: Infinity, size: 62 },
];
export const QUOTE_PLATE_MAX_CHARS = 48;

const em = (s: string) => Array.from(s).reduce((a, c) => a + (c.charCodeAt(0) > 0xff ? 1 : 0.55), 0);

/** 选字号 + 估行数（只用来算垂直置中，不参与折行——折行交给浏览器）。 */
export const quotePlateLayout = (phrases: QuotePhrase[]) => {
  // 分句里可以手写 \n 强制断行（遇到「同/期」这种拆词折行时用）；估行时按手动行分别算
  const rows = phrases.flatMap((p) => p.text.split('\n'));
  const lens = rows.map((r) => em(r));
  const total = lens.reduce((a, b) => a + b, 0);
  const longest = Math.max(0, ...lens);
  let tier = TIERS.findIndex((t) => total <= t.max);
  // 最长的分句在这一档放不进一行、小一档却放得进 → 降一档，换来「一个分句一行」的干净断行
  while (tier < TIERS.length - 1 && longest * TIERS[tier].size > BLOCK_W && longest * TIERS[TIERS.length - 1].size <= BLOCK_W) tier++;
  const size = TIERS[tier].size;
  const perLine = Math.floor(BLOCK_W / size);
  const lines = lens.reduce((a, l) => a + Math.max(1, Math.ceil(l / perLine)), 0);
  const height = MARK_H + MARK_GAP + lines * size * LINE_H + ATTR_GAP + ATTR_H;
  // 垂直置中，但顶不高过 SAFE 顶、底不低过 SAFE 底
  const top = Math.max(SAFE.y + 40, Math.min(CENTER_Y - height / 2, SAFE.y + SAFE.h - 40 - height));
  return { size, lines, total, top, height };
};

/** 开引号「：两根直条拼出来的图形，不靠字体（各家字体里「的位置与粗细差很多，放大后对不齐左缘）。 */
const CornerMark: React.FC<{ color: string }> = ({ color }) => {
  const t = 16; // 笔画粗
  return (
    <div style={{ position: 'relative', width: 104, height: MARK_H }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 104, height: t, background: color }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: t, height: MARK_H, background: color }} />
    </div>
  );
};

/** 把 emphasis 在分句里的第一处包成强调色 span；颜色不影响字宽，版面不变。 */
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
  attributionAt,
  markAt,
  emphasis,
  overMedia = false,
  dim = 0.62,
  accent = N.accent,
  duration,
  children,
}) => {
  const f = useCurrentFrame();
  const firstAt = phrases.length ? phrases[0].at : 0;
  const lastAt = phrases.length ? phrases[phrases.length - 1].at : 0;
  const mAt = Math.max(0, markAt ?? firstAt - 6);
  const aAt = attributionAt ?? lastAt + 18;

  const L = quotePlateLayout(phrases);
  // 整句只染一处：第一个含 emphasis 的分句
  const emphIdx = emphasis ? phrases.findIndex((p) => p.text.includes(emphasis)) : -1;

  const pMark = seg(f, mAt, mAt + 8, E.outCubic);
  const pRule = seg(f, aAt, aAt + 10, E.outCubic);
  const pAttr = seg(f, aAt + 3, aAt + 3 + REVEAL, E.outCubic);

  // 极缓相机：底图 1.00→1.04；文字组反向从 1/1.03 推到 1.00（文字右缘贴着 x=900，不能往外放大）
  const mediaPush = slowPush(f, duration, 1, 1.04);
  const textPush = slowPush(f, duration, 1 / 1.03, 1);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: N.bg }}>
      {overMedia ? (
        <>
          <div style={{ position: 'absolute', inset: 0, transform: `scale(${mediaPush})`, transformOrigin: '50% 45%' }}>{children}</div>
          <div style={{ position: 'absolute', inset: 0, background: N.bg, opacity: dim }} />
        </>
      ) : null}

      <div
        style={{
          position: 'absolute',
          left: LEFT,
          top: L.top,
          width: BLOCK_W,
          transform: `scale(${textPush})`,
          transformOrigin: `0px ${L.height / 2}px`,
        }}
      >
        {/* 开引号 */}
        <div
          style={{
            height: MARK_H,
            marginBottom: MARK_GAP,
            visibility: pMark <= 0 ? 'hidden' : 'visible',
            opacity: pMark,
            transform: `translateY(${lerp(pMark, RISE, 0)}px)`,
          }}
        >
          <CornerMark color={accent} />
        </div>

        {/* 句子：所有分句从第 0 帧就在最终位置占位 */}
        <div
          style={{
            fontFamily: N.serif,
            fontWeight: 700,
            fontSize: L.size,
            lineHeight: LINE_H,
            color: N.onDark,
            textAlign: 'left',
            lineBreak: 'strict', // 行首不出现「，。」」等收尾标点
            wordBreak: 'normal', // 不用 keep-all：中文没有空格，keep-all 会让整个分句不折行直接冲出右缘
            overflowWrap: 'break-word',
            whiteSpace: 'pre-line', // 让分句里的 \n 生效
            textWrap: 'balance', // 分句必须折行时两行等长，不留 1–2 字的孤行
            fontKerning: 'none',
          }}
        >
          {phrases.map((p, i) => {
            const t = seg(f, p.at, p.at + REVEAL, E.outCubic);
            return (
              <div
                key={i}
                style={{
                  visibility: f < p.at ? 'hidden' : 'visible',
                  opacity: t,
                  transform: `translateY(${lerp(t, RISE, 0)}px)`,
                }}
              >
                {withEmphasis(p.text, i === emphIdx ? emphasis : undefined, accent)}
              </div>
            );
          })}
        </div>

        {/* 署名：细线先伸出，姓名 · 身分随后 */}
        <div style={{ marginTop: ATTR_GAP, height: ATTR_H, display: 'flex', alignItems: 'center', gap: 22, visibility: f < aAt ? 'hidden' : 'visible' }}>
          <div style={{ width: 64, height: 4, flex: 'none' }}>
            <div style={{ width: 64 * pRule, height: 4, background: accent }} />
          </div>
          <div
            style={{
              fontFamily: N.font,
              fontSize: 40,
              lineHeight: 1,
              whiteSpace: 'pre',
              wordBreak: 'keep-all',
              opacity: pAttr,
              transform: `translateY(${lerp(pAttr, RISE, 0)}px)`,
            }}
          >
            <span style={{ fontWeight: 700, color: N.onDark }}>{speaker}</span>
            {role ? <span style={{ fontWeight: 400, color: N.bar }}>{` · ${role}`}</span> : null}
          </div>
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
      role="主辦單位"
      phrases={[
        { text: '我們沒有預期到這樣的反應，', at: 24 },
        { text: '報名開放不到兩小時就額滿，', at: 70 },
        { text: '下一期會把名額加倍。', at: 112 },
      ]}
      emphasis="名額加倍"
      overMedia
    >
      {/* 中性风景：不是说话者本人的肖像就别放人脸 */}
      <FakePhoto seed={3} />
    </QuotePlateShot>
  </NarrationStage>
);
