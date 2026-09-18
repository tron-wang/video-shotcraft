---
name: clip-frame-reveal
一句话: 一段实拍（或一张照片）装进本片统一的框里，框从中线一道细缝开到全高，素材由微过放缓回原位
适用: 口播片的 b-roll 段落（hook / context / impact）；不同图库来的素材要看起来属于同一部片
时长: 3–8s（开框 22f + 留守；demo 270f = 三种框式各 90f）
能量: 低（开框一下，之后只有极缓推进）
input: [video, photo]
narration: broll
---

## 意图
图库素材各拍各的：色调、画幅、质感都不同，满版直接切进来会像拼盘。把每一段都收进同一种框，框就成了这部片的「片内相册」——观众读到的是「同一个叙述者在给我看东西」，而不是「又换了一支素材」。开框动作只做一次、很短，之后把注意力让给口播。

## 动效核心
- 框 + 素材窗整组置中放在 SAFE 内；有说明时先扣掉说明占的高度再算窗的大小（`clipFrameLayout`）
- 开框：`clip-path: inset(v 0 v 0)`，v 由「半高 − 3px」缓到 0（inOutCubic）——从垂直中线的 6px 细缝开到全高；缝缘两条 2px 强调色细线在开框后段淡掉
- 素材在窗内由 1.08 缓回 1.0（outCubic，与开框同窗），再**乘上**一条贯穿全镜的 `slowPush` 1.00→1.04——相乘而不是接力，接缝处没有速度折点
- 三种框式：`paper`（米白相纸边、下边较厚、柔投影，不旋转）、`film`（深色边 + 左右齿孔条）、`hairline`（素材几乎占满 SAFE，1.5px 线框内缩 20px + 四角强调色角标）
- 框本身静止，只有窗内素材在动——框不会被推出 SAFE
- 说明：框下单行，`captionAt` 前完全不可见，到点 10f 淡入 + 上移 8px

## 参数表
| 参数 | 典型值 | 调节手感 |
|------|--------|----------|
| `frameStyle` | 旅游 / 生活 → `paper`；财经 / 科技 → `hairline`；怀旧、纪录感 → `film` | 依风格档「影片 / 照片框式」一栏定，全片一种 |
| `revealAt` | 段落首句起点 `f(tLine(i))`，或再晚 2–4f | 此前整个框不可见；开镜到开框 > 1.5s 时前面要有别的素材承载 |
| `revealFrames` | 22（18–28） | < 16 读作「弹开」，抢口播；> 30 细缝阶段拖太久像卡住 |
| 起始缝高 | 6px | 更细在 1080 宽的手机上会闪一下就没；更粗失去「缝」的读感 |
| 素材过放 | 1.08 → 1.0 | 超过 1.12 开框时看得出素材在缩，像变焦失误 |
| `slowPush` | 1.00 → 1.04（整镜） | 镜长 > 8s 可降到 1.03；照片与影片同值 |
| `aspect` | 直式素材 4/5；横式素材 16/9 或 3/2 | 窗的宽高比，不是素材的——素材一律 `objectFit: cover` 裁进窗里 |
| `caption` / `captionAt` | ≤ 16 字；`f(tWord(i, '词'))`，不给则开框完成后 6f | 说明是补充资讯（地点 / 年份 / 「示意画面」），不是字幕的重复 |
| paper 边厚 | 34 / 34 / 82 / 34 | 下边厚约上边 2.4 倍才读作相纸；再厚会挤掉素材窗 |
| film 齿孔 | 条宽 78，孔 34×24、间距 58 | 孔用 `N.onDark` 0.8 填（灯箱透光感）；用底色填在暗底上整条齿孔会糊成一片，读不出是胶卷 |

## 声音
开框配一记，放在句间气口、音量 ≤ 0.3：`paper` → `paper/paper-slide.mp3`；`film` → `film/projector-spin-antique.mp3`（修剪到 ~20f）或 `camera/camera-shutter-vintage.mp3`；`hairline` → `transition/transition-soft.mp3` 或 `ui/switch-light.mp3`。说明进场不配音。素材一律 `muted`，原声不进口播片。

## 已知坑
- **图库素材里的人脸与品牌**：框会把观众视线集中到窗内，路人正脸、店招、商标、车牌比满版时更显眼。选材时先排除可辨识人脸与品牌露出的片段；换不掉的用 `aspect` + 素材层 `objectPosition` 把它裁出窗外，并在 manifest 记下该素材的授权是否含肖像 / 商标。新闻题材尤其注意：路人被框起来配上负面口播，等于被指认。
- **一部片混用框式（不要）**：框的全部价值是「统一」。paper 和 hairline 交替出现，观众会以为框式有语意（例如「白边 = 旧照片」），然后开始猜不存在的规则。全片一种，写进 `theme.ts`，不逐镜传。demo 三种背靠背只是为了 gallery 预览。
- **直式窗装横式素材**：`cover` 把 16:9 素材裁进 4:5 窗只剩中间约 45% 的宽度，主体偏左或偏右就直接出画。先看素材主体位置：居中 → 直式窗可用；偏置 → 改 `aspect={16/9}` 让窗变横（整组仍置中，框上下留空，由底色承接），或用 `objectPosition` 调裁切中心。反过来直式素材进横窗同理。
- **clip-path 会裁掉 box-shadow**：paper 的投影不能挂在被裁的那层上，否则开框期间没有影子、开完才突然出现。demo 另起一层同宽、高度跟着开口长的影子层。
- **素材比镜头短**：`OffthreadVideo` 没有 loop，播完会冻在最后一帧（见下方循环接法）。
- 1.08 过放期间素材四周被多裁 4%，贴边的主体（字卡、人头顶）在开框头几帧会被切——这类素材把过放降到 1.04。

## 参考实现
demos/narration/clip-frame-reveal/ClipFrameReveal.tsx（`ClipFrameRevealShot` 为镜头本体；`clipFrameLayout` 可单独取几何给来源条 / 说明对位）

成片接法：
```tsx
const from = f(tLine(3));                       // 本镜起点（timeline.ts 生成）
<ClipFrameRevealShot
  frameStyle={theme.frameStyle}                 // 全片一种
  src="media/S03-market.mp4" kind="video"       // manifest.json 里该镜 material.file 对应的 public/ 路径
  revealAt={0}                                  // 镜内帧号；本镜从段落首句起点开始
  captionAt={f(tWord(3, '夜市')) - from}         // 词锚转成镜内帧号
  caption="示意畫面"
  duration={shot.duration}
/>
```
- 素材路径与授权来自 `assets/manifest.json`（`source-media.mjs` 产出），照片用 `kind="photo"`；文章图片需另叠来源条（`source-strip`）。
- **素材短于镜头**：`assets/lib/ClipCard.tsx` 的做法是把同一支 `OffthreadVideo` 包进多个 `Sequence`，每层间隔 `step = 素材帧数 − startFrom − crossfade`，层首 8f 淡入、层尾 8f 淡出，相邻两层包络互补，接缝处溶接。`ClipCard` 本体是正方形带自家边框，不能直接塞进来；把它的 `LoopLayer` + `Sequence` 那段 copy 出来（宽高改成 `100%`），经 `media` prop 传入即可——`media` 会取代 `src`，开框与 slowPush 照常作用在它上面。
