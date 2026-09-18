---
name: loupe-peek
一句话: 停靠的来源页（或照片）上弹出一只圆形放大镜，把旁白点到的那个小细节放大给你看一秒，随即收走
适用: 证据镜里的「顺带一提」：页面上的一个数字、日期、署名、图说、照片里的一块招牌——值得瞄一眼，但不值得为它换一镜
时长: 约 5s（150f，两瞥）；单瞥的镜头 2.5–3s 即可。每一瞥 = 张开 8f + 停 30f + 收走 7f ≈ 1.5s
能量: 低偏中（底图静止，放大镜一开一收是唯一的动作）
input: [screenshot, photo]
narration: evidence
---

## 意图
旁白说到「注意这个数字」时，观众在整页小字里找不到它。换一镜去特写又太重——那会变成新的段落。
放大镜解决的是「瞄一眼」：底图不换、不移、不变暗，一只圆镜从细节旁边弹出来，把它放大到读得清，旁白念完这个词它就收走，
句子还没讲完画面已经回到原样。观众读作「就是这一页上的这个地方」，而不是「切到另一个画面」。

## 动效核心
- 底图整镜只有 `slowPush` 1.00→1.04（在裁切面板内放大，面板本身不动），缩放原点 = 各目标中心的平均，目标几乎不漂
- 放大镜里是**同一份内容节点的第二次渲染**：放大 `zoom` 倍、目标中心对到圆心、`overflow: hidden` + `border-radius: 50%` 裁成圆。不用 canvas、不量 DOM——
  所有位置都由「内容坐标 → 面板坐标 → 舞台坐标」的纯算式得出，底图被 slowPush 推着走，镜内画面与目标环同步走
- 镜框：6px `N.paper` 实边 + 外侧 1px 深色发丝线 + 内侧 1px 发丝线；一层柔和投影；镜面内缘极淡暗角（68%→100% 处 10% 黑）。没有反光、没有模糊、没有折射变形
- 引线：目标上一个 3px 强调色圆角环（比目标框各边多 8px），加一条从环边到镜框外缘的 3px 短线；两者与放大镜同帧出现、同帧离开，线随张开进度从环长到镜框
- 张开：`at - inFrames` → `at`，缩放 0.6→1 走 `outBack(1.4)`（峰值约 +2.5%，只过冲一次），透明度在前 60% 的帧内到满
- 收走：更快（7f），缩放 1→0.85（inQuad）同时淡出（outQuad）。`at - inFrames` 及之前、收完之后**根本不渲染节点**
- 摆位：放大镜圆心 = 目标中心 + `offset`（预设右上，不挡住它放大的东西）。放不进 SAFE 或外接框压到右缘按钮区（x>900、y 900–1700）时，
  依序试「左右翻 → 上下翻 → 都翻」；用镜尾（push 最满）的目标位置来判定，整镜不会中途翻面；最后再夹回 SAFE
- 自动降倍率：目标框对角线放大后超过镜面直径的 90% 时，倍率自动降到刚好放得下（下限 1.4）——目标永远整块在镜里
- 两瞥：`peeks` 按 `at` 排序；前一瞥收完到后一瞥开始张开至少隔 `LOUPE_MIN_GAP` = 6f，不足时**前一瞥的 hold 被自动截短**，同屏绝不会有两只放大镜

## 参数表
| 参数 | 典型值 | 调节手感 |
|------|--------|----------|
| `target` | `{x,y,w,h}` 内容坐标；文字取 4–8 个字宽的子框 | 取自 `boxes.json`；整行太宽会触发自动降倍率，放大感变弱——只框旁白点名的那几个字。照片上自己量一块 ≤ 220px 宽的区域 |
| `at` | `f(tWord(i, '词')) - shotFrom`；demo 34 / 100 | 是**完全张开**的那帧，对准旁白吐出该词的瞬间；张开动作因此早 8f 起跑，观众听到词时已经能读 |
| `hold` | 30f（demo 第一瞥 34） | = 该词念完 + 约 0.4s。超过 45f 就不再是「一瞥」，该改用特写镜；短于 20f 读不完 |
| `inFrames` / `outFrames` | 8 / 7 | 收要比开快，才有「看完就走」的干脆；开 > 12f 会拖泥带水 |
| `zoom` | 2.2（上限；实际可能被自动降） | 真实 `page.png` 是 2× 采集：总放大（`contentScale × zoom`）≤ 2 保持锐利，2.5 是极限，见已知坑 |
| `diameter` | 440（含镜框） | 直式 1080 宽下约占 40% 宽；> 520 开始像新的一镜，< 360 放不下 5 个字 |
| `offset` | `{dx:170, dy:-280}` | 圆心距目标约 330px：镜框下缘离目标环 ≥ 20px、引线约 60px。想更近要确认不盖住目标所在那一行 |
| `peeks` | 最多 2 个 `{target, at, hold?, offset?}` | 相邻两个 `at` 至少隔 `hold + outFrames + 6 + inFrames`（预设 = 51f ≈ 1.7s）；更近会吃掉前一瞥的 hold |
| `contentY` | 让目标落在面板高度 40–85% | 预设右上摆位需要目标上方留 ≥ 500px（舞台）；目标太靠上会翻到下方，盖住后文 |
| `contentScale` | 缺省 = cover 面板（1080 宽页面 ≈ 0.889） | 桌面版宽页要手动给 1.4–1.8，并注意总放大倍率跟着变大 |
| `backdrop` / `color` | `N.paper` / `N.accent` | 照片给深色 backdrop；进片换 `theme` token |

## 声音
张开那帧可放 `ui/ui-popup-dry.mp3`（0.22）或 `camera/ui-zoom-in.mp3`（0.2），修剪到 ≤ 8f。
但 `at` 是对着词锚的——旁白此刻正在说话，多数情况下**不放**更干净；只有该词前面有 ≥ 0.3s 气口时才放。收走不配声。

## 已知坑
- **真实截图的放大糊字**：`page.png` 是 2× 采集，镜内总放大 = `contentScale × zoom × push`。≤ 2 锐利，2.5 是极限，再高字边发毛。
  桌面版宽页 `contentScale` 已经 1.5 时，`zoom` 只能给 1.3–1.6——此时改用更高倍率重新采集（`--scale 3`），不要硬拉。fixture 是活的 DOM 文字，demo 里看不出这个问题
- **内容渲染两次**：`content` 若是 `<OffthreadVideo>` 会解码两路；这张卡只给静态截图 / 照片用。`<Img>` 两份同源，无额外成本
- **盖到不该盖的地方**：自动翻面只保证在 SAFE 内、外接框不进右缘按钮区；不知道字幕以外的自家叠层（来源条、章节角标）在哪——有这些叠层时手动给 `offset`。
  放大镜也不知道它盖住了底图的什么：目标在段落中间时，右上摆位通常盖的是上一段，可接受；别让它盖住旁白下一句要用的那一行
- **放大镜对着人脸 = 肖像权红旗**：把路人的脸从群像里单独放大，等于把「背景人物」变成「被指认的主角」。照片素材只放大物件、文字、招牌；要放大人，先确认是公众人物或有授权
- 目标在面板边缘外（`contentY` 给错）时，环和引线会画在面板外的暗底上——卡不做裁切，看静帧时留意
- 目标太宽触发自动降倍率到下限 1.4 后仍放不下，两端会被圆裁掉；这是「框错了」的讯号，缩小 `target` 而不是加大 `diameter`
- `offset` 给得太短（圆心距 < 半径 + 目标半高 + 8）时放大镜会压住目标和环，引线自动不画——没有报错，看静帧确认

## 参考实现
demos/narration/loupe-peek/LoupePeek.tsx

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
  color={theme.accent}
  content={<Img src={staticFile('pages/<slug>/page.png')} style={{ position: 'absolute', left: 0, top: 0, width: boxes.page.width }} />}
/>
```
`at` 是相对本镜起点的帧号。照片：`content={<Img src={staticFile(manifest.items[k].file)} style={{ width: W, height: H }} />}`、`contentW/H` = 你摆放的像素尺寸、
`contentY={0}`、`backdrop={theme.bg}`，`target` 在同一坐标系里手选。上一镜通常是 page-scroll-read / page-anchor-tour 停靠在同一个 `contentY`，接进来时底图不跳。
