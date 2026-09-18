# 口播模式新卡实作规范（给实作者）

你要为 video-shotcraft 的「口播模式」新增**一张**资讯型镜头卡：一个 Remotion demo 组件 + 一张卡片 md。
repo 根目录：`/Users/joe-wang/Documents/個人專用/video-shotcraft`（以下路径相对它）。

## 纪律（违反即作废）

- **Clean-room**：禁止开启、读取、搜寻 `~/Documents/個人專用/video-talkcraft/`，也不要从网路或记忆里搬任何第三方
  影片框架 / 动效库的程式码或卡片文字。设计、命名、参数全部自己想。允许参考的只有本 repo。
- 只新增你这张卡的两个档案（外加验证用的暂存入口档，用完删掉）。**不要改其他任何档案、不要 git commit、
  不要渲染影片（只出静帧）**。
- 卡片 md 依 repo 惯例用**简体中文**；程式码注释同。

## 先读

1. `demos/_fixtures/Narration.tsx`（必用：NarrationStage / N / SAFE / FakeArticle / PAGE_BOXES / FakeClip / slowPush）
2. `demos/_fixtures/Motion.tsx`（E 缓动表 / seg / lerp / rand，可 import）
3. `references/narration-mode.md` 的 ⑤ 分镜检核表、⑥ 蒙皮契约、版面表
4. 卡片格式范例：`references/shots/typography/document-typewriter-reveal.md`
5. 任选一个既有 demo 看程式码风格，例如 `demos/typography/blur-slide/BlurSlide.tsx`

## 档案与导出（冒烟测试靠这些名字，务必照做）

- `demos/narration/<slug>/<Pascal>.tsx`
  - `export type <Pascal>Props = {...}`：**所有时间点都是 props（帧号）**——成片里它们来自
    `f(tWord(i, '词'))`，卡内不准写死「第几帧讲到哪」。给合理预设值。
  - `export const <Pascal>Shot: React.FC<<Pascal>Props>`：真正的镜头，画在 1080×1920 设计坐标里
    （不含 NarrationStage，方便成片直接用）。
  - `export const <SNAKE>_DURATION = <帧数>;`（30fps）
  - `export const <Pascal>: React.FC = () => (<NarrationStage><…Shot {...demo props} /></NarrationStage>);`
    ——**必须一字不差是 `export const <Pascal>: React.FC =`**（无泛型），冒烟脚本用正则找它。
  - 依赖只准 `react` + `remotion` + 上面两个 fixture。严格 TS（`--strict`）要过。
  - 确定性渲染：只用 `useCurrentFrame()` 驱动；禁 `Math.random()`、`Date`、CSS transition / animation。
- `references/shots/narration/<slug>.md`，frontmatter：
  ```
  ---
  name: <slug>
  一句话: …
  适用: …
  时长: …
  能量: …
  input: [screenshot]          # 这张卡吃什么素材：video / photo / screenshot / chart / text
  narration: evidence          # evidence | data | quote | chapter | transition | broll
  ---
  ```
  正文段落照范例：`## 意图`、`## 动效核心`、`## 参数表`（参数 / 典型值 / 调节手感）、`## 声音`
  （从 `assets/audio/sfx/<类别>/` 挑实际存在的档名；口播片音量 ≤ 0.35、只放句间气口）、
  `## 已知坑`（写你实作时真的踩到或预见的，不要凑数）、`## 参考实现`（demo 路径 + 成片接法：
  时间点怎么从 `tWord` 来、素材怎么从 `boxes.json` / manifest 来）。

## 口播镜头的共同规则（写进实作）

- 词锚未到的元素**完全不可见**（opacity 0 且不占视觉），不做预告式灰显。
- 镜头内的「活」只来自极缓相机（`slowPush`，1.00→1.04 量级）与主角自身变化；不摇晃、不旋转、不模糊。
- 主内容放在 `SAFE`（x 60–1020、y 150–1420）；y≈1480 以下留给字幕；右缘 x>900、y 900–1700 别放资讯。
- 中性皮：颜色一律取 `N.*`，方便进片时整组换 token。
- 直式优先；`NarrationStage` 已处理横式合成（等比置中），你不用管。

## 验证（必做）

在 `template/` 下建暂存入口 `template/src/_narr_<slug>.tsx`：
```tsx
import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { <Pascal>, <SNAKE>_DURATION } from '../../demos/narration/<slug>/<Pascal>';
registerRoot(() => (<Composition id="D" component={<Pascal>} durationInFrames={<SNAKE>_DURATION} fps={30} width={1080} height={1920} />));
```
然后（cwd = `template/`）：
```bash
npx remotion still src/_narr_<slug>.tsx D <scratch>/<slug>-<frame>.png --frame=<n> --log=error
```
至少出 4 张（起始、每个关键动作中段、落定、结尾），**用 Read 工具实际看图**，有问题就改到对。
再跑严格型别检查（cwd = `template/`）：
```bash
./node_modules/.bin/tsc --noEmit --strict --skipLibCheck --jsx react-jsx --moduleResolution bundler --module esnext --target es2022 --ignoreConfig ../demos/narration/<slug>/<Pascal>.tsx
```
（demos 在 template 之外，若报找不到 `remotion` / `react` 模组，加 `--paths` 不行就改用
`--baseUrl . --paths '{"*":["node_modules/*"]}'` 不支援时，退而求其次：把组件暂时 copy 到 `template/src/_tmp/`
连同 `_fixtures/Narration.tsx`、`Motion.tsx` 一起检查，检查完删掉。）
静帧输出放你的 scratch 目录：`/private/tmp/claude-501/-Users-joe-wang-Documents------video-shotcraft/6cdbdb7c-e9c7-4c7a-a7f0-25e5365dfa02/scratchpad/cards/<slug>/`。
**结束前删掉 `template/src/_narr_<slug>.tsx` 与任何暂存 copy。**

## 回报

最后一则讯息写：两个档案路径、DURATION、props 清单、你看过哪几帧与结论、严格型别检查结果、还没解决的问题（没有就说没有）。
