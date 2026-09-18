---
name: chapter-slate
一句话: 句间气口里的章节色板——章节色上擦铺满、线稿图标逐笔画出、空心章节号与实心标题先后升起，再整块向上擦走交给下一镜
适用: 口播片的段落边界（"01 發生了什麼 / 02 證據 / 03 影響"）；三段以上、每段 ≥ 8s 的稿子才值得分章
时长: 1.5–2s（45–60f），整张卡住在两句之间的气口里
能量: 低中（一记干净的色块换场，不抢口播）
input: [text]
narration: chapter
---

## 意图
口播片一路都是素材与字幕，观众需要一个"翻页"的信号才知道话题换了。这张卡用**一个颜色 + 一个线稿图标**给每章一个身份：色板路过的那 1.5 秒告诉观众"新的一段"，之后同一个图标缩成左下角标 `ChapterTag` 留在后续镜头里，观众中途滑进来也能一眼知道现在讲到哪。它不承载资讯，所以绝不占用配音时间。

## 动效核心
- 色板是一块"路过"的板：入场时上缘自下而上擦满，退场时下缘继续自下而上擦走——进出同一个行进方向，平擦、无羽化、`inOutCubic`
- 图标逐笔画出：每笔 `pathLength={1}` + `strokeDasharray="1 2"` + `strokeDashoffset` 1→0，不量 DOM；下一笔在上一笔画到 65% 时起笔，读作一气呵成
- 章节号（空心描边大字）与标题（实心）各自从一条看不见的遮罩线后升起（`translateY 105%→0`，`outQuart`），两者差 4f；未到点时被 `overflow:hidden` 整个裁掉，不做淡入预告
- 镜内只有一条 1.00→1.03 的极缓推近；退场时内容比擦除线多走 140px，缩短"字被切一半"的停留
- 退场露出的下一镜左下角已经带着 `ChapterTag`（静态件，不做入场）——交接靠擦除线完成，不另加转场

## 参数表
| 参数 | 典型值 | 调节手感 |
|------|--------|----------|
| `duration` | 50f（可 45–60f） | 由气口长度决定：`f(下一句 start) − f(上一句 end)`；不足 40f 就别用这张卡，改只换 `ChapterTag` |
| `wipeAt` / `wipeFrames` | 0 / 10f | 擦除 < 8f 读作闪切，> 14f 拖沓；平擦不要加羽化或斜角，口播片里越平越像"翻页" |
| `drawAt` / `drawFrames` | 7 / 16f | 色板擦过图标位置（约 70% 处）后才起笔；笔数多的图标（bars 4 笔）不要压到 12f 以下 |
| `numberAt` / `titleAt` | 19 / 23 | 图标画到约 3/4 时号码起，标题晚 3–5f；同帧升起读作一个块，错开才有"号 → 题"的阅读顺序 |
| `riseFrames` | 9f | `outQuart`，落定要干脆；不要回弹 |
| `exitFrames` / `exit` | 10f / true | 落定到退场之间至少留 8f 静读；`exit={false}` 时色板留守，由下一镜自己擦入 |
| 图标 | 340px、线宽 9（viewBox 200）≈ 15px | 六选一：`pin` 地点 / 事发、`magnifier` 证据 / 查证、`bars` 数据、`ripple` 影响 / 扩散、`quote` 说法 / 回应、`clock` 时间线 / 后续 |
| 章节号 | 320px、800、`-webkit-text-stroke` 9px、两位数 | 描边与图标线宽要同量级，否则一粗一细像两套设计 |
| 标题 | 96px、700、行高 1.22、宽 768 | ≤ 8 个全形字一行；超过会折行，折两行仍在安全区内，三行就该改稿 |
| 色板 `CHAPTER_PALETTE` | 钴蓝 `#2f55c4`×`N.onDark` 5.73:1；琥珀 `#e0b04b`×`N.ink` 8.40:1；松绿 `#1b6f62`×`N.onDark` 5.27:1；砖红 `#a8432c`×`N.onDark` 5.26:1 | 不传 `color` 时按 `index` 轮用；传自订 `#rrggbb` 时文字色自动在 `N.onDark` / `N.ink` 里挑对比高者——自订色请自己确认 ≥ 4.5:1 |
| `ChapterTag` | 124×60、圆角 8、`x=60 y=1344`（安全区左下、字幕之上） | 图标 40px 线宽 16（缩小后仍要看得出形）；与来源条同镜时把 `y` 上移或让来源条靠右一点，别叠 |

## 声音
色板擦入配 `transition/sweep-short.mp3`（或更轻的 `transition/transition-soft.mp3`），音量 0.25–0.3；图标画线可叠一记 `text/marker-pen-line.mp3` 音量 ≤ 0.2，修剪到 `drawFrames` 等长；标题落定不再加音。退场不配音——下一句口播马上进来，气口里只留一记入场声。全部 ≤ 0.35。

## 已知坑
- **圆头线帽漏点**：`strokeLinecap="round"` 的笔画在 `dashoffset=1`（进度 0）时，部分渲染器仍会在起点画出一个圆点。未起笔的笔画直接不渲染（`p<=0 → null`），不要靠 opacity
- **dasharray 写 `1` 会在末端回卷**：`pathLength=1` 下 dasharray `1` 等于 `1 1`，offset 有浮点误差时闭合路径（pin 外形、圆）起点会冒出下一段 dash 的头。写成 `1 2` 留足空隙
- **圆的起笔点在 3 点钟**：`<circle>` 的路径起点固定在右侧，逐笔画时像机器；用 `rotate(-90 cx cy)` 转到 12 点钟起笔
- **空心字的描边是居中描**：`-webkit-text-stroke` 一半向内一半向外，9px 实际只向外长 4.5px；升起用的 `overflow:hidden` 遮罩要给 12px padding（再用负 margin 抵消），否则描边外侧被裁掉一圈
- **纯线稿的引号读成数字**：最初的 quote 画成两枚「圆头 + 上挑尾」，描边后就是 `66`，摆在章节号旁边直接被读成号码。改成对话框 + 框内两撇；自己加图标时，凡是长得像数字 / 字母的造型都要放在角标里（图标 + 号码并排）看一眼
- **卡长必须来自气口**：把卡塞进句子里等于抢配音。气口不足 1.3s 时，要么在稿子的分段处加长停顿重新配音，要么这一章只换角标不出卡
- **demo 的"换底"发生在色板盖满之后**：成片同理——下一镜（含新 `ChapterTag`）要从色板盖满那一帧就开始在底下播，否则退场擦开时露出的是上一章的画面
- **角标与来源条 / 字幕的位置**：角标预设 y 1344–1404，在字幕（y 1480）之上；来源条在 y 1620–1700。三者不重叠，但主内容若贴到安全区左下角会被角标盖住——选卡时留意
- 章节数 > 4 时色板会轮回同色，靠图标区分；连续两章不要手动指定相同 `color`

## 参考实现
demos/narration/chapter-slate/ChapterSlate.tsx（导出 `ChapterSlateShot` / `ChapterTag` / `MotifGlyph` / `CHAPTER_PALETTE` / `chapterColors`；demo 连播三章，每章 60f = 章节卡 50f + 露出"后续镜头 + 角标"10f）。

成片接法：
- 这张卡没有词锚，时间来自**句界**：上一段末句 `end` 与下一段首句 `start`。`from = f(lines[a].end)`，`duration = f(lines[b].start) − from`（`timeline.ts` 里算，不手写帧号）；其余时间点用预设值，`duration` 偏短时按比例收 `drawFrames` 与落定后的静读段，不收 `wipeFrames`
- `<Sequence from={from} durationInFrames={duration} layout="none"><ChapterSlateShot index={2} title="證據" motif="magnifier" duration={duration} /></Sequence>` 叠在上下两镜**之上**；下一镜的 `from` 提前到 `from + wipeFrames`（色板盖满那帧），让退场擦开时底下已经在播
- 素材：`input: [text]`，不吃 `boxes.json` / manifest；`title` 取自 `SHOTLIST.md` 的段落名（≤ 8 字），`motif` 依段落 `role` 选（context→pin / clock、evidence→magnifier、data→bars、impact→ripple、引述段→quote）
- 后续镜头里放 `<ChapterTag index={2} motif="magnifier" />` 直到下一张章节卡盖上；蒙皮时把 `CHAPTER_PALETTE` 换成 `theme.ts` 的章节色（浅底风格档如旅游 / 生活，挑深一阶的色并重算对比），时序与几何不动
