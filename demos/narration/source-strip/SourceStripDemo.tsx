// source-strip —— 来源条：用到文章图片或网页截图的证据镜，画面左下角一条小字标出处，陪完整个镜头。
// 它是引用标注，不是装饰：只淡入淡出（各 8 帧），不做位移；不靠右（平台按钮区）；
// 贴画面左下角（直式距底 70px，y≈1790–1850），在字幕（y≈1480–1560）之下。
// 成片用的是 assets/lib/SourceStrip.tsx（scaffold-narration.mjs 会拷进 src/lib/）。demo 不能 import
// assets/lib，所以这里按同样的 props / 几何 / 时序重做一份 `SourceStripShot`——两边改动必须同步。
// 本档多出来的只有两项：`maxWidth`（长媒体名截断）与 `layout`（设计舞台内强制直式几何）。
import React from 'react';
import { Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { FakeArticle, FakePhoto, N, NarrationStage, PAGE, SAFE, STAGE, slowPush } from '../../_fixtures/Narration';

export type SourceStripDemoProps = {
  /** 媒体短名（sources/article.md 的 source_label）。 */
  label: string;
  /** 「來源」「圖片來源」「Source」等前缀。 */
  prefix?: string;
  /** 本条在所属 Sequence 内的显示长度（帧）。淡入淡出各占头尾 8 帧。 */
  duration: number;
  color?: string;
  plate?: string;
  accent?: string;
  fontFamily?: string;
  /** 整条的最大宽度（px）；超出时媒体名以省略号截断。预设：直式 820（右缘停在 x=880，不进平台按钮区）、横式 900。 */
  maxWidth?: number;
  /** 几何取直式还是横式。'auto' 同 lib：看合成宽高。画在 NarrationStage（直式设计坐标）里时传 'portrait'。 */
  layout?: 'auto' | 'portrait' | 'landscape';
};

const FADE = 8;

export const SourceStripShot: React.FC<SourceStripDemoProps> = ({
  label,
  prefix = '來源',
  duration,
  color = N.onDark,
  plate = 'rgba(16,18,22,0.78)',
  accent = N.accent,
  fontFamily = N.font,
  maxWidth,
  layout = 'auto',
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const portrait = layout === 'auto' ? height > width : layout === 'portrait';
  const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
  const opacity = Math.min(
    interpolate(frame, [0, FADE], [0, 1], clamp),
    interpolate(frame, [duration - FADE, duration], [1, 0], clamp),
  );
  if (opacity <= 0) return null;
  const size = portrait ? 30 : 26;
  return (
    <div
      style={{
        position: 'absolute',
        left: portrait ? 60 : 120,
        bottom: portrait ? 70 : 34,
        maxWidth: maxWidth ?? (portrait ? 820 : 900),
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: portrait ? '12px 22px' : '10px 20px',
        borderRadius: 10,
        background: plate,
        color,
        fontFamily,
        fontSize: size,
        lineHeight: 1,
        fontWeight: 500,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        opacity,
        pointerEvents: 'none',
      }}
    >
      <span style={{ flex: 'none', width: 6, height: size, borderRadius: 3, background: accent }} />
      <span style={{ flex: 'none', opacity: 0.72 }}>{prefix}</span>
      {/* 只有媒体名可以被截：前缀与色标永远完整 */}
      <span style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>{label}</span>
    </div>
  );
};

// ───────────────────────── demo 专用：证据镜占位 + 假字幕 ─────────────────────────

const RADIUS = 28;

/** 文章截图证据镜：贴满 SAFE 的圆角面板，整块由 1/1.04 推到 1.00（不溢出 SAFE）。 */
const ArticlePanel: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const k = SAFE.w / PAGE.w;
  return (
    <div
      style={{
        position: 'absolute', left: SAFE.x, top: SAFE.y, width: SAFE.w, height: SAFE.h,
        transform: `scale(${slowPush(frame, duration, 1 / 1.04, 1)})`, transformOrigin: '50% 50%',
        borderRadius: RADIUS, overflow: 'hidden', background: N.paper,
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: PAGE.w, height: PAGE.h, transform: `scale(${k})`, transformOrigin: '0 0' }}>
        <FakeArticle />
      </div>
    </div>
  );
};

/** 文章图片证据镜：4:5 圆角窗置中于 SAFE，窗不动、照片在窗内 1.00→1.04。 */
const PhotoPanel: React.FC<{ duration: number; seed: number }> = ({ duration, seed }) => {
  const frame = useCurrentFrame();
  const h = 1200;
  return (
    <div style={{ position: 'absolute', left: SAFE.x, top: SAFE.y + (SAFE.h - h) / 2, width: SAFE.w, height: h, borderRadius: RADIUS, overflow: 'hidden', background: N.bg }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${slowPush(frame, duration)})`, transformOrigin: '50% 50%' }}>
        <FakePhoto seed={seed} />
      </div>
    </div>
  );
};

/** 满版亮图：把占位照片拉高，让天空 / 山脊的亮区落在 y≈1630，检验来源条底板压不压得住。 */
const BrightFullBleed: React.FC<{ duration: number; seed: number }> = ({ duration, seed }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: STAGE.w, height: 2900, transform: `scale(${slowPush(frame, duration)})`, transformOrigin: '50% 33%' }}>
        <FakePhoto seed={seed} />
      </div>
    </div>
  );
};

/** 静态假字幕（y=1480、52px、N.plate）：只为证明来源条在它下方、互不相碰。 */
const FakeSubtitle: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ position: 'absolute', left: 0, top: 1480, width: STAGE.w, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
    <div style={{ padding: '12px 28px', borderRadius: 12, background: N.plate, color: N.onDark, fontFamily: N.font, fontSize: 52, lineHeight: '56px', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {text}
    </div>
  </div>
);

// 来源条比所属镜头晚 LEAD 帧进、早 LEAD 帧出：硬切的那一帧上永远没有半透明的条。
const LEAD = 6;

type DemoShot = { len: number; subtitle: string; strip: Omit<SourceStripDemoProps, 'duration'>; body: (len: number) => React.ReactNode };

const DEMO: DemoShot[] = [
  { len: 75, subtitle: '這堂課兩小時就額滿', strip: { label: '每日新聞' }, body: (len) => <ArticlePanel duration={len} /> },
  { len: 70, subtitle: '隊伍一路排到校門口', strip: { prefix: '圖片來源', label: '每日新聞／王小明' }, body: (len) => <PhotoPanel duration={len} seed={2} /> },
  // 长媒体名 + 满版亮图：截断（maxWidth）与底板不透明度一起看
  { len: 65, subtitle: '主辦單位說下期名額加倍', strip: { prefix: '圖片來源', label: '每日新聞國際中文網財經暨教育頻道特別報導小組／王小明', maxWidth: 820 }, body: (len) => <BrightFullBleed duration={len} seed={5} /> },
];

export const SOURCE_STRIP_DEMO_DURATION = DEMO.reduce((a, d) => a + d.len, 0);

export const SourceStripDemo: React.FC = () => {
  let at = 0;
  return (
    <NarrationStage>
      {DEMO.map((d, i) => {
        const from = at;
        at += d.len;
        return (
          <Sequence key={i} from={from} durationInFrames={d.len} layout="none">
            {d.body(d.len)}
            <FakeSubtitle text={d.subtitle} />
            {/* 一镜一条：条挂在镜头自己的 Sequence 里，镜头切走它就跟着走，不会两条同框 */}
            <Sequence from={LEAD} durationInFrames={d.len - 2 * LEAD} layout="none">
              <SourceStripShot {...d.strip} duration={d.len - 2 * LEAD} layout="portrait" />
            </Sequence>
          </Sequence>
        );
      })}
    </NarrationStage>
  );
};
