---
name: ink-circle-note
一句话: 一圈手绘墨线圈出原文里的一个数字 / 名字 / 物件，拉一支小箭头到旁边 2–6 个字的批注；墨迹画在页面坐标里，页面怎么动它都黏着
适用: 证据镜：旁白说「就是这个数字」「注意这个名字」「看照片里这一块」——要在一页或一张照片上点名**一个点**，而不是整句话
时长: 单处批注约 3–4s；demo 6s（180f）= 圈 + 批注 + 页面上移 + 第二圈
能量: 低偏中（页面静止，只有笔在动；一圈 14 帧是全镜最快的东西）
input: [screenshot, photo]
narration: evidence
---

## 意图
marker-sweep 回答「这句话真的写在那里」，这张卡回答「你要看的是这一页上的**哪一个点**」。像编辑拿红笔在稿子上圈一下、旁边写两个字：
一圈、一支箭头、一个短批注，三个动作依序落下，每个动作只在前一个完成后才开始，观众的视线被带着走一遍「东西 → 箭头 → 结论」。
墨迹和页面共用同一个变换，所以圈完之后页面继续滚、相机继续推，批注都钉在它标的东西上——这是它和「贴在画面上的贴纸」的差别。

## 动效核心
- **全部画在内容坐标**：`<svg>` 与页面放在同一个 `translate + scale` 容器里（外层再套 `slowPush` 1.00→1.04）。页面位移用 2D `translate`
- **墨圈**：超椭圆（指数 3.4，比正椭圆更贴文字）上取 72 点，半径叠三个谐波抖动（3% / 1.8% / 1%），整圈由 1.035 倍漂到 0.975 倍，
  总共画 108%——收笔落在起笔内侧并与它交叠约 8%，两道线不重合；起笔点在左上 ±15°、整圈倾角 ±1.8°，全部由 `seed` 经 `rand` 决定
- **笔压（选了叠层方案）**：单条 SVG path 线宽不能变，用**三层同路径叠画**：全长 5px + 中段 10–90% 6.5px + 中段 20–78% 8px，
  每级只差 1.5px，看不出接缝，读起来是「起笔轻、中段重、收笔轻」。每层都是 `pathLength={1}` + `strokeDasharray="<已画长度> 2"` +
  负的 `strokeDashoffset` 定位起点（等价于 dashoffset 1→0，但能只画中间一段）；圆头、圆角
- **圈的节奏**：`circleFrames`（14）内 inOutQuad——起笔慢、中段快、收笔慢
- **箭头**：圈画完后停 4 帧再下笔；二次贝塞尔微弯（弦外 12px，弯向由 seed 定），从圈外 10px 拉 64px 到批注旁；
  箭杆占 `arrowFrames` 的 64%（outCubic），其后两笔箭头尖各占 18%，从尖端往外各画 20px、张角 ±30°
- **批注**：箭头画完的下一帧开始，6 帧内上浮 10px + 淡入（outCubic）；`N.font` 900 字重、−3° 倾角（全镜唯一允许的旋转），
  字外包一圈 12px 纸色描边（`paint-order: stroke`），压在正文上也读得清
- **自动选边**：未指定 `noteSide` 时，按「右 → 上 → 左 → 下」找第一个在**批注出现那一帧的可见范围**内放得下（含箭头、留 28px 边距）的一侧
- 词锚未到（`frame < circleAt`）这组批注**没有节点**；没有 `note` 就只有圈、没有箭头
- `notes` 再加第二处（各有自己的 `circleAt` / seed），同一支笔的颜色

## 参数表
| 参数 | 典型值 | 调节手感 |
|------|--------|----------|
| `target` | `{x,y,w,h}` 内容坐标 | 取 `boxes.json` 的矩形；圈句中几个字时用该行 `rects[0]` 按字数切出子矩形。不要目测 |
| `circleAt` | `f(tWord(L,'词')) − shotFrom`；demo 20f | 贴着旁白讲到那个词的瞬间；距镜头开头 ≥ 0.5s，先让观众看清页面 |
| `circleFrames` | 14 | < 10 像机器画的；> 20 拖沓，旁白已经讲过去了 |
| `arrowAt` / `arrowFrames` | `circleAt + circleFrames + 4` / 10 | 那 4 帧停顿是「圈完、抬笔」；删掉会糊成一个动作 |
| `note` / `noteAt` | 2–6 字；箭头画完 +1 帧 | 批注是结论不是句子：「+41%」「就是这里」。要写更多请换 stat-punch / quote-plate |
| `noteSide` | 不给（自动） | 右侧优先；右边是同一行的后半句时手动指定 `'above'` 或 `'below'`，别让批注压着正在被读的字 |
| `padX` / `padY` | 16 / 7（padX 下限 10） | 行矩形本身含行距，垂直留白再大就压到上下行；照片里圈物体两个都放到 24–40 |
| `color` | `#c8341f`（朱红）→ 进片换 `theme` 里对页面底色对比 ≥ 4.5:1 的色 | **不要用 `N.accent`**：金色在纸白上对比约 1.9:1，5px 细线读不到。深色页面 / 照片上换亮色 |
| `noteHalo` / `noteSize` | `N.paper` / 54 | halo 取页面底色；照片上用深色半透明或 `'none'`。字级是内容坐标，成片字高 = `noteSize × contentScale`，别低于 44 |
| `pageY` | 数字，或 `[{at,y}, …]`（相邻点 inOutCubic） | demo：76f→112f 上移 260px。要接 page-scroll-read 那种速度连续的曲线就传 `scrollY={(fr) => scrollYAt(fr, plan)}` |
| `contentScale` | 0.96 | 同 marker-sweep；桌面宽页放大到 1.4–1.8 时 `target` 不用换算，仍是页面 CSS px |
| `seed` | 任意整数 | 换 seed = 换一圈的笔迹；同一支片里每处用不同 seed，避免两个圈长得一模一样 |
| `duration` | 镜头总帧数 | 只用来算 slowPush |

## 声音
圈下笔那一帧放 `text/marker-pen-line.mp3`，音量 0.25，修剪到 ≤ `circleFrames`；箭头 + 批注合起来补一声
`text/pencil-write-short.mp3` 0.18，起点 = `arrowAt`。两声都要落在旁白的句间气口；旁白正压着那个词时只留第一声并降到 0.18。
第二处批注只放圈那一声。页面上移那一段可用 `paper/paper-slide.mp3` 0.15，没有气口就不放。

## 已知坑
- **圈句中几个字必然会切过邻字**：左右紧邻的字和目标之间没有空隙，`padX ≥ 10` 的圈线一定落在邻字身上（demo 里切过「長」和逗号）。
  这是真实红笔圈字的样子，可接受；不可接受的是压到**目标自己的**字——所以 `padX` 在卡内被钳到 ≥ 10，不要为了躲邻字去改小
- **行距紧的页面圈线会碰上下行**：行高 / 字级 < 1.5 时上下缘没有空间，圈线会压到上一行的底部。对策：`padY` 降到 3–4，或把页面放大、改圈独占一行的内容（标题数字、图表标签）
- `boxes.json` 的行矩形若贴着行顶而不是以字身为中心（fixture 就是这样，demo 里 +5px 校正），圈会整体偏上。先在静帧里看圈的上下留白是否对称
- 批注压到正文时靠 12px 纸色描边撑住可读性；页面底色不是 `N.paper`（灰底卡片、暗色模式）时一定要同步改 `noteHalo`，否则字外面一圈白边
- 自动选边只看**批注出现那一帧**的可见范围。之后页面若继续滚，批注会跟着走、可能滚出面板——那是对的行为，但要自己确认滚动终点时批注仍在面板内，或在滚动前就换镜
- 批注 ≤ 6 个字。宽度是估算的（全形 1em、半形 0.62em），超过 6 字时自动选边会开始误判，而且 −3° 倾角在长字串上会明显翘起
- **不要用在人脸上**：圈人脸 = 点名某个人，有肖像与指控疑虑；照片里只圈物件、招牌、数字
- 不要和 marker-sweep 用在同一句上：萤光笔 + 红圈叠在同一行会糊成一团。同一段证据里，整句用 marker-sweep、句中一个数字用本卡，二选一
- 一镜最多两处。第二处的 `circleAt` 要晚于第一处批注落定 ≥ 1s，否则两支笔同时在动，观众不知道看哪
- 圆头线帽在已画长度趋近 0 时会先冒出一个墨点：卡内对 < 0.2% 的长度直接不渲染，自己改 Stroke 时别拿掉这个门槛

## 参考实现
demos/narration/ink-circle-note/InkCircleNote.tsx

成片接法（网页截图）：
```tsx
import boxes from '../../public/pages/<slug>/boxes.json';
const line = boxes.boxes.find((b) => b.key === 'text-1')!.rects[0];   // 那一行的矩形，页面 CSS px
const cw = line.w / 14;                                               // 该行 14 个字 → 每字宽
const target = { x: line.x + 7 * cw, y: line.y, w: 6 * cw, h: line.h }; // 第 8–13 个字「百分之四十一」
const L = 3;                                                          // 旁白第 3 句
<InkCircleNoteShot
  target={target}
  circleAt={f(tWord(L, '百分之四十一')) - shotFrom}
  note="+41%"
  duration={shotDuration}
  pageY={line.y - (0.4 * 1270) / pageScale}
  contentScale={pageScale}
  contentW={boxes.page.width}
  contentH={boxes.page.height}
  color={theme.ink ?? '#c8341f'}
  noteHalo={theme.paper}
  content={<Img src={staticFile('pages/<slug>/page.png')} style={{ width: boxes.page.width }} />}
  notes={[{ target: quoteRect, circleAt: f(tWord(L + 1, '沒有預期')) - shotFrom }]}
/>
```
所有帧号都是相对本镜起点（减 `shotFrom`）。`page.png` 用 `width: boxes.page.width` 摆回 CSS px 坐标系，矩形才对得上。

照片：`content={<Img src={staticFile(manifest.shots.S05.file)} style={{ width: W }} />}`、`contentW={W}`、`contentH={H}`、`pageY={0}`，
`contentScale = 960 / W`；`target` 用照片在该显示宽度下的像素矩形（看图量，或用采集时记下的主体框），`padX / padY` 放到 24–40，
`noteHalo` 改 `'rgba(16,18,22,0.7)'` 并把 `color` 换成亮色。
