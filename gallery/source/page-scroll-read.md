---
name: page-scroll-read
一句话: 长文截图在直式视窗里匀速上滚，口播讲到重点就减速停靠在舒服的阅读高度，读完再缓回巡航
适用: 证据段——"原文是这样写的"；一段口播里要带观众经过 1–3 个原文段落；来源是新闻 / 公告 / 部落格长页
时长: 6–12s（demo 8s / 240f，两站）；每站停 1–2s
能量: 低（匀速、无冲击，全靠"读"）
input: [screenshot]
narration: evidence
---

## 意图
观众要相信"这句话真的写在原文里"。整页静态贴图做不到这点，滚动能——页面在动，说明它是一张真的长页；讲到重点时它自己慢下来停住，观众的眼睛就被带到那一行。这一镜不强调、不放大、不画线，只负责"一起读"；要强调交给后面的 `marker-sweep` / `loupe-peek`。

## 动效核心
- 滚动量是帧号的纯函数 `scrollYAt(frame, props)`：巡航段 + 进站 / 出站速度坡道拼成，**位置连续、速度连续、永不回滚**
- 坡道是速度上的 smoothstep：`v(u) = V·(3u²−2u³)`，位移 `V·R·(u³−u⁴/2)`，整条坡道只走 `V·R/2`——所以一段的巡航速度 `V = 距离 / (时长 − 坡道总长/2)`，到站帧 `at` 与停靠位置同时精确命中
- 开镜即在巡航（首段没有入坡道）；没给 `startY` 时由 `cruiseSpeed` 反推起点，保证首段就是阅读速度
- 停靠位置 = 段落框中心落在视窗高度的 `focusRatio`（0.4）；停稳后段落带以外压暗 ≤ 12%（带缘 70px 羽化，不切到邻行的字），左侧页边长出一条 6px 强调色短条，出站时一并淡出。未到站的聚焦件完全不存在
- 页面装在安全区大小的圆角视窗里，上下 96px 渐隐到纸色，文字融掉而不是被硬切；右侧一条细滚动条只当"这是长页"的线索
- 整个视窗面板做 `slowPush` 0.96 → 1.00（同样 +4%；视窗已占满 SAFE，从 1.00 往上推会溢出安全区约 25px，所以改成终点贴满）

## 参数表
| 参数 | 典型值 | 调节手感 |
|------|--------|----------|
| `stops[].y / h` | `boxes.json` 的段落框上缘 / 高度（页面 CSS px，未乘 pageScale） | 多行段落给整段的外包框，不要只给第一行——停靠高度按框中心算 |
| `stops[].at` | `f(tWord(i, '词'))`，取该段落**第一个词**的帧 | 这是"已经停稳"的帧，不是开始减速的帧；减速在它之前 `ramp` 帧开始 |
| `stops[].hold` | 30–60f（demo 46 / 40） | 停留 ≈ 口播念完这段的时间；< 24f 观众读不完，> 75f 画面死掉 |
| `cruiseSpeed` | 7 px/帧（pageScale=1 基准，≈ 每秒 3.4 行） | 5–9 是"读得到"的区间；它只决定起点反推与尾段，站与站之间的速度由距离 / 时长算出 |
| `ramp` | 26f | 进站 / 出站坡道。< 16 读作急刹，> 40 像没油；两站太近坡道会按比例自动缩短 |
| `focusRatio` | 0.4 | 段落停在视窗中线偏上。0.5 压到字幕上方显得沉，< 0.3 被上缘渐隐吃掉 |
| `pageScale` | demo 960/1080（整页宽装进视窗）；预设 1（左右各裁 60px） | 字要大就用 1 并确认正文不在被裁掉的 60px 里；速度上限随 pageScale 等比缩放 |
| `dim` | 0.10，硬上限 0.12 | 只是把视线往段落带收一点；再重就和 `marker-sweep` 的强调抢戏 |
| `MAX_READ_SPEED` | 28 px/帧（×pageScale） | 站间所需速度超过它：先吃上一站的停留（最少留 `MIN_HOLD` 12f），再不够就**锁速迟到** |
| 视窗 | SAFE 全区 960×1270，圆角 28，上下渐隐 96px | 渐隐色 `fadeColor` 要取页面底色，深色页面别忘了换 |

## 声音
滚动本身不配音（持续的滚动声会和口播打架）。只在**句间气口**给进站一声轻的：`paper/paper-slide.mp3` 音量 0.2，对齐 `at − 6f` 左右，让声音的尾巴落在停稳那一帧；科技皮可换 `ui/switch-tap.mp3` 0.18。两站间隔 < 1.5s 时只配第一站。音量一律 ≤ 0.35。

## 已知坑
- **站间太远 / 太挤会超速**：相邻两站的页面距离 ÷ 可用帧数 > 28 px/帧时，卡会先把上一站的停留吃到 12f，仍不够就锁在 28 px/帧、**迟到**进站（`planScroll(props).parks[i].late` > 0）。迟到意味着口播讲到了画面还没停——分镜阶段就要查：`late` 或 `heldShort` 非零就换成 `page-anchor-tour`（跳切式停靠）或拆成两镜，不要硬塞
- **永不回滚**：`stops` 按 `at` 排序后，页面位置也必须递增。口播顺序和原文顺序相反时，后一站会"原地再停一次"（目标在上方 → 钳到当前位置），画面上看就是没动。稿子倒着引原文就别用这张卡
- **起点反推可能撞页顶**：第一站离页顶太近、`at` 又晚，反推的 `startY` 会钳到 0，首段速度随之低于 `cruiseSpeed`——可以接受，但开镜 > 1.5s 才到第一站时，确认开场画面（标题 / 头图）本身有东西可看
- **页尾**：目标与尾段都钳在 `pageH·scale − 视窗高`；最后一段落贴近页尾时停不到 `focusRatio` 的高度，会偏下。抓页时让 `capture-page.mjs` 多留一点页尾，或改选靠前的段落
- `at` 是"停稳帧"。把 `tWord` 直接当减速起点会整整晚一个 `ramp`（~0.9s），这是最常见的接错
- `boxes.json` 坐标是 CSS px，`page.png` 是 `× scale` 后的像素：`<Img>` 的宽要设成 `pageW`（CSS px），再由卡的 `pageScale` 统一缩放，不要两头各缩一次
- 页面层用 2D 的 `translateY` 平移，**不要写 `translate3d`**：实测它会把页面提成独立合成层，在 `slowPush` 的小数缩放下圆角视窗右缘漏出 1px 未被裁切 / 未被压暗的亮条（约 512px 一段，随光栅分块出现）。也不要改成动 `top` 或 `background-position`，文字会逐帧抖

## 参考实现
demos/narration/page-scroll-read/PageScrollRead.tsx（`PageScrollReadShot` 为镜头本体，`scrollYAt` / `planScroll` 为可单测的纯函数）

成片接法：
```tsx
import boxes from '../../public/pages/<slug>/boxes.json';
const b = (key: string) => boxes.boxes.find((x) => x.key === key)!;
<PageScrollReadShot
  duration={shot.duration}
  page={<Img src={staticFile('pages/<slug>/page.png')} style={{ width: boxes.page.width }} />}
  pageW={boxes.page.width} pageH={boxes.page.height} pageScale={960 / boxes.page.width}
  fadeColor={theme.paper}
  stops={[
    { y: b('text-1').y, h: b('text-1').h, at: f(tWord(3, '成長')) - shot.from, hold: f(tLine(3).end) - f(tWord(3, '成長')) },
    { y: b('text-2').y, h: b('text-2').h, at: f(tWord(4, '我們')) - shot.from, hold: 40 },
  ]}
/>
```
`at` 取段落首词的 `tWord`（减去本镜 `from` 换成镜内帧号），`hold` 取该句念完的帧差；素材来自 `capture-page.mjs` 产出的 `assets/pages/<slug>/{page.png, boxes.json}`；`--text` 给的第 n 句对应 key `text-n`，外包框 `x/y/w/h` 与逐行 `rects` 都是 CSS px。写完先跑 `planScroll(props).parks`，`late` / `heldShort` 全为 0 才算过。画面下方按版面表放来源条（`source-strip`）。
