---
name: chapter-slate
一句话: 句间气口里的章节页——深底上超大编号从遮罩线后升起、空心描边填成强调色，标题与章节进度条随后，再整块向上擦走；另有「文字遮罩穿越」款，标题字里透出下一镜、推大后直接变成下一镜
适用: 口播片的段落边界（"01 發生了什麼 / 02 證據 / 03 影響"）；三段以上、每段 ≥ 8s 的稿子才值得分章
时长: 1.5–2s（demo 每章 56f），整张卡住在两句之间的气口里
能量: 低中（一记干净的换页，不抢口播）
input: [text]
narration: chapter
---

## 意图
口播片一路都是素材与字幕，观众需要一个「翻页」的信号才知道话题换了。这张卡用**一个超大编号 + 一排进度条**告诉观众「新的一段、第几段、还剩几段」，之后下一镜左上角挂一颗「02 | 證據」胶囊角标，观众中途滑进来也知道现在讲到哪。它不承载资讯，所以绝不占用配音时间。
（2026-09 改版：旧版每章一个鲜艳纯色色板 + 线稿图标，读起来是扁平设计时代、也跟黑金调性冲突；使用者从「巨型编号 / 进度轴 / 电影标题卡 / 文字遮罩穿越」四案里选了巨型编号，也要文字遮罩穿越，做成两款。）

## 两种款式
| 款 `look` | 做法 | 什么时候用 |
|---|---|---|
| `numeral`（预设） | 深底自下而上擦满 → 超大衬线编号（520px）从遮罩线后升起，空心描边 18 帧内填成强调色 → 标题（120px）升起、进度条当前段拉开 → 整块继续向上擦走（内容比擦除线多走 200px） | 一般章节；需要「第几段 / 共几段」的时候 |
| `mask` | 深底上超大标题（380px）的字里透出下一镜（`reveal`），字由 0.9 放到 1 停住；退场以 t³ 加速放大到 40 倍穿过去，底色同时淡掉——章节卡本身就是转场 | 章节标题短（2–3 字）、下一镜画面够好看、想让换章更有冲击力时；全片最多用一次 |

## 动效核心
- `numeral` 入场与退场同一个行进方向（上缘自下而上擦满、下缘继续自下而上擦走），读作「一块板路过」；擦除 `inOutCubic`
- 编号与标题各自从一条看不见的遮罩线后升起（`translateY 105%→0`，`outQuart`），编号先、标题晚 6 帧；未到点时被 `overflow:hidden` 整个裁掉
- 进度条：`total` 段、每段 120×6；已讲过的 60% 白、当前段强调色（跟标题一起从左拉开）、之后的 18% 白
- `mask` 用 SVG `<mask>` + `<text>` 做字形遮罩，`reveal` 放进 `foreignObject`；穿越时「CHAPTER 02」小标在放大前段就淡掉
- 下一镜左上角 `ChapterTag`：深色半透明胶囊「强调色编号 | 章名」，y 170（左下角留给来源条）；静态件，跟着退场露出的下一镜一起出现

## 参数表
| 参数 | 典型值 | 调节手感 |
|------|--------|----------|
| `duration` | 56f（可 45–60f） | 由气口长度决定：`f(下一句 start) − f(上一句 end)`；不足 40f 就别用这张卡，改只换 `ChapterTag` |
| `total` | 全片章数 | 不给就不画进度条；> 5 段时每段缩短，别让进度条比标题宽 |
| `look` | `numeral` | `mask` 全片最多一次 |
| `reveal` | 下一镜的画面（同一段素材） | `mask` 款透进字里的画面；不给就用强调色填字 |
| `wipeFrames` / `exitFrames` | 14 / 14 | < 10 像闪一下；> 18 占掉太多气口 |
| `numberAt` / `titleAt` / `riseFrames` | 4 / 10 / 16 | 编号与标题差 5–8 帧；标题太晚会跟退场挤在一起 |
| `bg` / `accent` | `theme.bg` / `theme.accent` | 换风格档只换这两个；浅底风格档把 `bg` 给米白、描边与填色给深一阶的强调色 |

## 声音
入场擦满那一帧可配 `transition/transition-soft.mp3` 0.2（它就在气口里）；`mask` 款穿越那一下可配 `transition/sweep-short.mp3` 0.2。编号、标题升起不配音。全部 ≤ 0.35。

## 已知坑
- **换底要发生在章节页背后**：`numeral` 款下一镜（含新 `ChapterTag`）要从章节页盖满那一帧（`wipeAt + wipeFrames`）就开始在底下播，否则退场擦开时露出的是上一章的画面
- **`mask` 款的底层**：穿越时底色在后半段淡掉，底下必须已经是下一镜，而且跟 `reveal` 是同一段、同一时间点的素材，穿过去才接得上
- **长标题**：`numeral` 标题单行 120px，> 7 字会超出；`mask` 款 > 3 字字形太细、透出的画面读不出来
- **ChapterTag 与其他叠层**：左上角也是某些卡的小标位置（如 S02 的日期小标）；同镜有冲突时把角标 `y` 往下移或该镜不挂

## 参考实现
demos/narration/chapter-slate/ChapterSlate.tsx（导出 `ChapterSlateShot` / `ChapterSlateProps` / `ChapterLook` / `ChapterTag` / `CHAPTER_SLATE_DURATION`；demo 210f：三章，第 1、3 章 `numeral`、第 2 章 `mask`）

成片接法：
- `<Sequence from={from} durationInFrames={duration} layout="none"><ChapterSlateShot index={2} title="證據" total={3} duration={duration} /></Sequence>` 叠在上下两镜**之上**；下一镜的 `from` 提前到 `from + wipeFrames`
- 后续镜头里放 `<ChapterTag index={2} title="證據" />` 直到下一张章节卡盖上
- 复制进成片 `src/cards/` 后把 import 改成平铺路径 `'../../_fixtures/…'` → `'../_fixtures/…'`；旧版的 `motif` / `color` / `CHAPTER_PALETTE` / `MotifGlyph` 已移除（旧成片工程各自保有旧副本）
