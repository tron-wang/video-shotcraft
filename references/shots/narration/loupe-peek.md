---
name: loupe-peek
一句话: 原地浮起瞥一眼——停靠的来源页（或照片）压暗一半，旁白点到的那个小细节像一张卡从原位浮起、放大到读得清，停一秒再落回去
适用: 证据镜里的「顺带一提」：页面上的一个数字、日期、署名、图说、照片里的一块招牌——值得瞄一眼，但不值得为它换一镜
时长: 约 5s（150f，两瞥）；单瞥的镜头 2.5–3s 即可。每一瞥 = 浮起 12f + 停 30f + 落回 10f ≈ 1.7s
能量: 低偏中（底图静止，浮起一次、落回一次是唯一的动作）
input: [screenshot, photo]
narration: evidence
---

## 意图
旁白说到「注意这个数字」时，观众在整页小字里找不到它。换一镜去特写又太重——那会变成新的段落。
这张卡解决的是「瞄一眼」：底图不换、不移，页面压暗一半，那一小块像一张卡从**原位**浮起、放大到读得清，旁白念完这个词它就落回原位、页面恢复。观众读作「就是这一页上的这个地方」，而不是「切到另一个画面」——浮起的起点就是目标原本的位置，这一段位移本身就在指路。
（2026-09 改版：原圆形玻璃放大镜太拟物；使用者从「放大框＋引线 / 原地浮起 / 镜头推近 / 细节抽屉」四案里选了原地浮起。）

## 动效核心
- **浮起**：`at − inFrames` 起 12 帧 `outCubic`：卡从目标原位（含 slowPush 后的位置、原尺寸、圆角 4）插值到放大后的位置——**水平置中**、垂直维持在目标中心附近（夹在面板内上下留 40）、圆角 18、投影 `0 24px 60px / .5`
- **放大倍率**：相对底图 `zoom`（预设 2.4），放大后宽度超过面板宽 − 80 时自动降到刚好放得下
- **页面压暗**：浮起同时整个面板盖一层黑，峰值 `dim`（预设 0.5）；落回时同步恢复
- **落回**：`at + hold` 起 10 帧 `inOutCubic`，原路回到原位、压暗退掉，画面完全回到原样
- **卡的内容**：同一份 `content` 再渲染一次，**以放大后的实际尺寸排版**（字保持锐利，不是点阵放大）；左右严格裁在目标框上、上下只多露 4px 行距空白，四周 14px 留白用 `backdrop` 补——不会切进半个邻字
- 底图整镜 1.00 → 1.04 极缓推近，原点 = 各目标中心平均；浮起卡的起点跟着推近走
- 一镜最多两瞥；两瞥之间至少空 6 帧，不足时前一瞥的 `hold` 自动截短，绝不同屏两张浮起卡

## 参数表
| 参数 | 典型值 | 调节手感 |
|------|--------|----------|
| `peeks[].target` | boxes.json 的行矩形，截到要看的那几个字 | 框越精准越好：只框「百分之四十一」，不要框整行 |
| `peeks[].at` | `f(tWord(i, '词')) − shotFrom` | 完全浮起的那一帧对在词上；浮起从 12 帧前开始 |
| `hold` | 30（念完该词 + 12f） | 可用 `f(tWordEnd(...)) − f(tWord(...)) + 12` |
| `zoom` | 2.4（真实截图 2 左右） | 真实截图的总放大 = `contentScale × zoom × push`，≤ 2 锐利 |
| `dim` | 0.5 | 亮底页面 0.45–0.55；照片 0.35 就够 |
| `inFrames` / `outFrames` | 12 / 10 | < 9 像弹出；> 16 浮起尾段压到下一个词 |
| `contentY` | 让目标落在面板中段 | 目标太靠面板上下缘时，放大后的卡会被夹回面板内，离原位较远 |
| `backdrop` | `N.paper`；照片给深色 | 面板与浮起卡四周留白的底色 |

## 声音
浮起那帧可放 `ui/ui-popup-dry.mp3`（0.2），修剪到 ≤ 8f。
但 `at` 是对着词锚的——旁白此刻正在说话，多数情况下**不放**更干净；只有该词前面有 ≥ 0.3s 气口时才放。落回不配声。

## 已知坑
- **真实截图的放大糊字**：`page.png` 是 2× 采集，卡内总放大 = `contentScale × zoom × push`。≤ 2 锐利，2.5 是极限，再高字边发毛。
  桌面版宽页 `contentScale` 已经 1.5 时，`zoom` 只能给 1.3–1.6——此时改用更高倍率重新采集（`--scale 3`），不要硬拉。fixture 是活的 DOM 文字，demo 里看不出这个问题
- **内容渲染两次**：`content` 若是 `<OffthreadVideo>` 会解码两路；这张卡只给静态截图 / 照片用。`<Img>` 两份同源，无额外成本
- **邻字被切一半**：卡的内容左右严格裁在 `target` 上；框的左右缘若落在字中间，卡里会出现半个字——框要对齐字的边界（单字宽 = 行宽 ÷ 字数）
- **浮起卡盖住自家叠层**：卡水平置中、宽可达面板宽 − 80，会暂时盖住来源条、章节角标以外的面板内容；来源条在面板外左下，不受影响
- **放大人脸 = 肖像权红旗**：把路人的脸从群像里单独浮起放大，等于把「背景人物」变成「被指认的主角」。照片素材只放大物件、文字、招牌；要放大人，先确认是公众人物或有授权
- 目标在面板外（`contentY` 给错）时，卡会从面板外的位置浮起——看静帧时留意
- 旧版参数 `diameter` / `offset` / `color` 已移除（旧成片工程各自保有旧版副本，不受影响）

## 参考实现
demos/narration/loupe-peek/LoupePeek.tsx（demo 150f：假文章页，@38 浮起「百分之四十一」、@108 浮起图说「近三年報名人數」）

成片接法：
```tsx
import boxes from '../../public/pages/<slug>/boxes.json';
const line = boxes.boxes.find((b) => b.key === 'text-1')!.rects[0];   // 「比去年同期成長百分之四十一，」那一行
const cw = line.w / 14;                                                // 该行 14 个全形字 → 单字宽
const digits = { x: line.x + 7 * cw, y: line.y, w: 6 * cw, h: line.h };   // 只框「百分之四十一」
const credit = boxes.boxes.find((b) => b.key === 'figcaption')!;
<LoupePeekShot
  peeks={[
    { target: digits, at: f(tWord(4, '百分之四十一')) - shotFrom, hold: f(tWordEnd(4, '四十一')) - f(tWord(4, '百分之四十一')) + 12 },
    { target: credit, at: f(tWord(5, '圖表')) - shotFrom },
  ]}
  duration={shotDuration}
  contentY={digits.y - 620}
  contentW={boxes.page.width}
  contentH={boxes.page.height}
  zoom={2}
  content={<Img src={staticFile('pages/<slug>/page.png')} style={{ position: 'absolute', left: 0, top: 0, width: boxes.page.width }} />}
/>
```
`at` 是相对本镜起点的帧号。照片：`content={<Img src={staticFile(manifest.items[k].file)} style={{ width: W, height: H }} />}`、`contentW/H` = 你摆放的像素尺寸、
`contentY={0}`、`backdrop={theme.bg}`，`target` 在同一坐标系里手选。上一镜通常是 page-scroll-read / page-anchor-tour 停靠在同一个 `contentY`，接进来时底图不跳。
