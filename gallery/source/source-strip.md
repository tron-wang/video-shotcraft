---
name: source-strip
一句话: 用到文章图片或网页截图的镜头，左下角一条小字标出媒体名，陪完整个镜头——是引用标注，不是装饰
适用: 口播片里所有文章截图 / 文章图片证据镜（必挂）；已授权网域的同类镜头（预设仍挂，当品牌露出）
时长: 跟所属镜头等长（淡入 8f + 留守 + 淡出 8f；demo 210f = 三个镜头各带一条）
能量: 极低（只有透明度变化）
input: [text]
narration: evidence
---

## 意图
截图和文章图片是别人的东西。观众看到画面的那一刻就该知道它出自哪里，而不是到片尾或贴文说明里去找——所以出处跟着素材走：素材在画面上多久，来源条就在多久。它要小、要稳、要每次都在同一个位置，读作「注脚」；一旦它会动、会变色、会换位置，就变成了抢口播的装饰。

## 动效核心
- 只有透明度：镜头开始后 8f 淡入，结束前 8f 淡出（`min(淡入, 淡出)`，短镜头两段重叠时也不会跳）；**不做位移、缩放、逐字**
- 位置固定在画面左下角（使用者 2026-09-18 指定）：直式 x=60、距底 70px（y≈1790–1850），在字幕 y≈1480–1560 之下。
  这个位置落在 Reels / Shorts / TikTok 的底部说明区（y≥1720）里，App 内可能被帐号与说明文字盖到；要完全避开传 `bottom={230}`；不靠右——直式右缘 x>900、y 900–1700 是平台按钮
- 构成：强调色竖标（6px 宽、与字同高）+ 前缀（72% 不透明度）+ 媒体名，三者同一行，深色半透明底板、圆角 10
- 一镜一条：条挂在所属镜头自己的 `Sequence` 里，镜头切走它跟着走；相邻两镜各自淡入淡出，硬切那一帧上没有半透明的条（demo 让条比镜头晚 6f 进、早 6f 出）
- 长媒体名：整条有 `maxWidth`，只有媒体名那一段会被省略号截断，竖标与前缀永远完整

### 版面
| | 直式 1080×1920 | 横式 1920×1080 |
|---|---|---|
| 锚点 | x 60、距底 70 | x 120、距底 34 |
| 字号 / 内距 | 30px、12×22 | 26px、10×20 |
| 占用高度 | ≈ y 1790–1850 | ≈ y 1000–1046 |
| 最大宽度（建议） | 820（右缘停在 x=880） | 900 |
| 上方邻居 | 字幕 y 1480–1560，间距 ≈ 70 | 字幕 y 930–990，间距 ≈ 10——横式字幕不要超过一行 |

## 什么时候必须挂
依 `references/narration-mode.md` ⓪ 的权利规则表与 ④ 的素材来源表：
| 镜头素材 | 来源条 |
|---|---|
| 文章图片（manifest `rights: article`、`attribution_required: true`） | **必挂**，前缀「圖片來源」，媒体名后接「／摄影者」（同 manifest 的 `credit`） |
| Playwright 网页截图（page-scroll-read / marker-sweep / loupe 等所有截图证据镜） | **必挂**，前缀「來源」 |
| 已授权网域（`narration.config.json` 的 `trusted_domains`，`rights: trusted-domain`） | 法律上不要求，但**预设仍显示**媒体名当品牌露出；`show_source_strip: false` 才整片关掉 |
| 图库实拍 / 照片（Pexels、Pixabay、Unsplash） | 不挂。Unsplash 的标注走 `out/CREDITS.md` |
| 自绘图表、字卡、章节牌 | 不挂（数字的出处在 `sources/facts.md`；要在画面上标资料来源时用前缀「資料來源」） |

分镜检核表第 10 条（「用到文章图片或网页截图的镜头有来源条」）查的就是这张表的前两行。

**与 `out/CREDITS.md` 的关系**：两者并行，互不取代。来源条是画面内、随镜头出现的即时标注；`CREDITS.md` 是发布时贴在说明栏的完整清单（含授权种类、原始网址、Unsplash 摄影者）。有来源条不代表可以不贴 CREDITS；已授权网域不进 CREDITS，但来源条照挂。

## 参数表
| 参数 | 典型值 | 调节手感 |
|------|--------|----------|
| `label` | `sources/article.md` frontmatter 的 `source_label`（scaffold 写进 `theme.ts` 的 `SOURCE_LABEL`） | 用短名。`fetch-article.mjs` 先查 `narration.config.json` 的 `site_labels`，查不到才取站名第一段 |
| `prefix` | 截图 →「來源」；文章图片 →「圖片來源」；英文片 →「Source」/「Photo」 | 全片同一语言；不要同一部片里「來源」「出處」「引自」混用 |
| `duration` | 所属镜头的帧数（`SHOTS[id].duration`），或减去头尾各 6f | 这是镜内长度，不是全片帧号；条永远包在镜头的 `Sequence` 里 |
| 淡入 / 淡出 | 各 8f | < 5f 读作闪一下；> 12f 在 2s 的短镜头里条大半时间是半透明的 |
| `plate` | `theme.ts` 的 `C.plate`（预设 `rgba(16,18,22,0.78)`） | 压在亮素材上时提到 0.86–0.9，见已知坑 |
| `accent` / `color` / `fontFamily` | `C.accent` / `#f2f0ea` / `FONT.body` | 进片换 token；字重维持 500，别加粗到跟字幕抢 |
| `maxWidth` | 直式 820、横式 900 | 直式不要超过 840（60+840=900 就是按钮区左缘）。**目前只有 demo 版有这个 prop** |
| `layout` | demo 里传 `'portrait'` | 只为 NarrationStage 而设：横式合成里的直式设计舞台要强制直式几何。成片直接用 lib 的自动判断 |

## 声音
不配音。来源条是注脚，进出都不该被听见；所属镜头的音效由该镜头的卡决定。

## 已知坑
- **媒体名太长**：站名常带副标（「○○新聞網 - 即時・財經・國際」），直接塞进来会横穿画面、伸进右缘按钮区。先在 `narration.config.json` 的 `site_labels` 给该网域一个短名（`"example.com": "○○新聞"`），重跑 `fetch-article.mjs` 让 `source_label` 更新；`maxWidth` + 省略号只是保底。**lib 的 `assets/lib/SourceStrip.tsx` 目前没有 `maxWidth`，长名会一路撑出去——建议照 demo 的做法补上**（外层 `maxWidth` + `boxSizing: border-box`，竖标与前缀 `flex: none`，媒体名 `min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`）。
- **截断吃掉的是尾巴，而尾巴是署名**：「每日新聞／王小明」这种写法，摄影者或通讯社在最后，省略号会先把它截掉（demo 第三镜可见）。看到省略号就回头缩短媒体名，不要让它截——被截掉署名的来源条等于没标。
- **通讯社 / 图库图**：图说里出现通讯社或图库字样（Getty、AP、Reuters、AFP、中央社、達志…）时，权利人不是这家新闻媒体。来源条必须照图说写出通讯社名（「圖片來源 中央社」或「每日新聞／中央社」），不能只写转载它的媒体。这类图在 manifest 是 `risk: high`，挂了来源条也不解除风险——仍要依 ⓪ 提醒使用者并附替代候选。
- **压在亮素材上**：满版照片 / 截图的亮区落在来源条所在的左下角时，0.78 的底板会透出底下的亮色，前缀那段 72% 的字先读不清。把 `plate` 提到 0.86–0.9；不要改用白底黑字（跟字幕板不成一套）、也不要加描边或投影。素材装在 SAFE 面板里时条落在底色上，没有这个问题。
- **同一画面两条（不要）**：一个镜头里同时有截图和文章图片，也只挂一条——写主要素材的出处，或合成「來源 每日新聞」一条。两条叠放会顶到字幕或掉进 y≥1720 的平台说明区。转场用交叉淡化时，确认前一镜的条已淡完再进下一条（条比镜头早出晚进几帧即可）。
- **位置别逐镜调**：为了躲开某张图的主体而把条挪到左上或右下，观众会以为那是另一种资讯。躲不开就改素材的裁切或把素材装进面板。
- **横式合成里的直式舞台**：lib 版用合成宽高判断直 / 横。把它画进 `NarrationStage` 这类「横式合成内的直式设计坐标」时会取到横式几何（x=120、y=1000），落在画面中段。demo 版加了 `layout` 覆写；成片的合成本身就是直式，不受影响。

## 参考实现
demos/narration/source-strip/SourceStripDemo.tsx（`SourceStripShot` 为来源条本体；demo 三镜：文章截图面板「來源 每日新聞」→ 文章图片面板「圖片來源 每日新聞／王小明」→ 满版亮图 + 长媒体名截断，每镜带一条 y=1480 的静态假字幕证明互不相碰）

**成片用的不是 demo 这份**，而是 `assets/lib/SourceStrip.tsx`——`scaffold-narration.mjs` 会把它拷进专案的 `src/lib/SourceStrip.tsx`，并在需要来源条的占位场景里接好。demo 不能 import `assets/lib`，所以 `SourceStripShot` 是按同样的 props、几何（直式 x=60 / y=1630 / 30px，横式 x=120 / y=1000 / 26px）与时序（头尾各 8f）重做的一份；**两边必须保持同步**——改了其中一份的位置、字号、淡入淡出，另一份要跟着改。目前的差异只有 demo 多出的 `maxWidth` 与 `layout`。

成片接法（scaffold 生成的场景已是这个样子）：
```tsx
import { SourceStrip } from '../lib/SourceStrip';
import { C, FONT, SHOW_SOURCE_STRIP, SOURCE_LABEL } from '../theme';
import { SHOTS } from '../timeline';

const { duration } = SHOTS['S04'];              // 镜头长度来自 timeline.ts（由 timing.json 生成）
// …镜头本体（截图 / 文章图片 + SlowPush）…
{SHOW_SOURCE_STRIP && SOURCE_LABEL ? (
  <SourceStrip label={SOURCE_LABEL} duration={duration} plate={C.plate} accent={C.accent} fontFamily={FONT.body} />
) : null}
```
- 来源条没有词锚：它的时间只跟镜头走。镜头的起点 / 长度才来自 `f(tLine(i))` / `f(tWord(i, '词'))`，条包在该镜头的 `Sequence` 里、`duration` 取镜内帧数即可。
- `SOURCE_LABEL` ← `sources/article.md` 的 `source_label` ← `narration.config.json` 的 `site_labels`（或站名第一段）。`SHOW_SOURCE_STRIP` 是 `show_source_strip` 在专案里的落点——**scaffold 目前一律写 `true`，不读 config**；已授权网域的片子要关时，手动把 `theme.ts` 这一行改成 `false`（一般媒体的片子不准关）。
- 文章图片镜头：`label` 改用 manifest 该素材 `credit` 去掉「圖片來源：」后的部分（`每日新聞／王小明`），`prefix="圖片來源"`。
- 哪些镜头要挂：scaffold 的判定是「镜头 mode 为 `screenshot`，或素材档在 `assets/article/` 下」；手写场景时照同一条规则自查。
