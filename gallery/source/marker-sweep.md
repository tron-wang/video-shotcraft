---
name: marker-sweep
一句话: 萤光笔划过原文的一句话，笔尖跟着旁白走——讲到哪个词，就划到哪个词
适用: 证据镜：旁白正在引用 / 转述网页上的某一句原文（数据出处、官方说法、关键条文）
时长: 约 5s（150f）；实际 = 该句配音长度 + 前 0.6s 停靠 + 尾部 hold 0.6s 以上
能量: 低（画面几乎静止，唯一在动的是笔）
input: [screenshot, text]
narration: evidence
---

## 意图
观众要相信「这句话真的写在那一页上」。整页停住不动，一道萤光笔从句首划到句尾，而且笔尖的位置和旁白逐词对齐：
旁白停顿，笔也停；旁白念得快，笔也快。这种同步让观众读作「旁白就是在念这一句」，比整句同时亮起的高亮框可信得多。

## 动效核心
- 页面已停靠（上一镜 page-scroll-read / page-anchor-tour 把相机送到这里），本镜只有 `slowPush` 1.00→1.04，缩放原点 = 句子中心，推近时句子不漂
- 笔划画在**页面坐标**里，与页面同一个变换容器——页面怎么缩放位移，笔划都黏在字上
- `keyframes` 把「帧号 → 笔划走到总长的几成」钉死；相邻两点之间是温和的 ease-in-out（线性与 inOutQuad 各半），词与词之间只松一口气、不急停
- 多行：progress 对应所有行宽度首尾相接的总长，第一行划满才开始第二行
- 第一个 keyframe 之前笔划**完全不渲染**（不是透明度 0 的占位，是根本没有节点）
- 笔触：强调色半透明 + `mix-blend-mode: multiply`，比文字框上下各高 4px，两端外凸圆头，上下缘有 ±1.6px 的确定性抖动（`rand` 取样在行内固定网格上，笔划变长时已画好的边缘不会跳）；笔尖 10px 叠一层较浓的色。无光晕、无模糊

## 参数表
| 参数 | 典型值 | 调节手感 |
|------|--------|----------|
| `rects` | 每行一个 `{x,y,w,h}`，页面坐标 | 直接取 `boxes.json` 的 `rects`，顺序 = 阅读顺序；不要自己目测 |
| `keyframes` | 5–8 个 `{at, progress}`；demo：22f→0、38f→5/28、64f→14/28、82f→14/28（停）、93f→18/28、100f→18/28（停）、128f→1 | progress 用「该词结尾的字数 ÷ 全句字数」最直观；气口 = 两个 progress 相同的相邻点。点太密（每字一个）会把 ASR 的 ±0.1s 抖动原样演出来，取片语边界即可 |
| 首个 keyframe | 距镜头开头 ≥ 0.6s（demo 22f） | 先让观众看清这一页停在哪，再下笔；紧贴开头会像转场的一部分 |
| 末个 keyframe | 距镜尾 ≥ 0.6s（demo 留 22f） | 划完要留时间让整句高亮被读完 |
| `pageY` | 句子中线落在安全区 40% 高度：`rectMidY − 0.4 × 1270 / pageScale` | 偏上留出下方给字幕与来源条；放正中会和字幕挤 |
| `pageScale` | 0.96（页宽 1080 时两侧各留约 20px 纸边） | 正文字级在成片里 ≥ 34px 才读得清；页面是桌面版宽页时要放大到 1.4–1.8 并让句子水平置中 |
| `color` | `N.accent` → 进片换 `theme.accent` | 填色透明度 0.55、笔尖再叠 0.30；深色强调色（电蓝）在 multiply 下会压暗文字，换皮时把透明度降到 0.35–0.4 |
| 笔划出血 | 左右 6px、上下 4px、圆头外凸 5px | 出血随 progress 摊入：0 长度不露头，划满才盖到 `w + 6` |
| 段内缓动混合 `EASE_MIX` | 0.5 | 调到 1 每个词都急停，像卡顿；调到 0 纯线性，失去手划的呼吸 |

## 声音
下笔那一刻放一声 `text/marker-pen-line.mp3`，音量 0.25，修剪到不超过第一段笔划的长度；
旁白正在念的时候不再叠第二声。句中气口够长（> 0.4s）且笔在气口后换行时，可在换行帧补一声 `text/pencil-write-short.mp3` 0.18。
不要用持续的书写拟音盖整段——它会和人声打架。

## 已知坑
- **两句之间停笔时下一句先露头**：把两句话的 rects 串在一条笔画里、用 keyframe 让 progress 停在第一句末尾等旁白时，浮点余量会让下一行画出零长度的圆头墨点。卡内已把 < 0.5px 的余量当 0；自己改卡时别把这个门槛拿掉。停笔的 keyframe 要成对给（第一句末 → 同 progress 的第二句起点），第二句的起点用 `atIn(shot, line, '片语首词')`。
- `mix-blend-mode: multiply` 只在**浅色页面**上成立；暗色模式的网页截图上 multiply 会让笔划消失，要改成 `screen` 并换亮色，或在采集时强制浅色主题
- multiply 的混合对象是同一个堆叠上下文里的页面：笔划的 `<svg>` 必须和页面放在同一个变换容器里。把它挪到容器外面（例如为了「画在最上层」）会变成和深色舞台底相乘，颜色发黑
- `rects` 的高度来自 Range 实测，不同网页行高差异大：行高很松（≥ 1.9）的页面，笔划会显得过高，把矩形先收到字高的 1.35 倍再传入
- 稿子是转述而非逐字引用时，`tWord` 找不到页面原词——progress 要按**旁白稿**的词切，矩形按**页面原文**取；两边字数不同是正常的，别用页面字数去除旁白字数
- keyframes 倒挂（后一个词的时间戳比前一个早，ASR 偶发）不会让笔划回退：卡内对 progress 取了累计最大值，但那一段会变成停顿——看静帧时留意
- 一镜只划一句。要划两处不相邻的句子请拆成两镜或改用 page-anchor-tour，同屏两道笔划会互相抢

## 参考实现
demos/narration/marker-sweep/MarkerSweep.tsx

成片接法：
```tsx
import boxes from '../../public/pages/<slug>/boxes.json';
const hit = boxes.boxes.find((b) => b.key === 'text-1')!;        // capture-page.mjs 第一个 --text 命中的那一句
const rects = hit.rects;                                         // 逐行矩形，整页 CSS px
const L = 3;                                                     // 旁白第 3 句在念这句
const k = (w: string, n: number, end = false) =>
  ({ at: f(end ? tWordEnd(L, w) : tWord(L, w)) - shotFrom, progress: n / 28 });
<MarkerSweepShot
  rects={rects}
  keyframes={[k('比去年', 0), k('同期', 5, true), k('四十一', 14, true), k('其中', 14), k('七成', 18, true), k('新生', 28, true)]}
  duration={shotDuration}
  pageY={rects[0].y - (0.4 * 1270) / pageScale}
  pageScale={pageScale}
  pageWidth={boxes.page.width}
  color={theme.accent}
  page={<Img src={staticFile('pages/<slug>/page.png')} style={{ width: boxes.page.width }} />}
/>
```
`at` 是相对本镜起点的帧号（减去 `shotFrom`）。`page.png` 的像素 = CSS px × `scale`，用 `width: boxes.page.width` 把它摆回 CSS px 坐标系，矩形才对得上。
