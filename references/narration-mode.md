# 口播模式（Narration Mode）

给一篇新闻 / 文章（网址或文字）或一份口播稿，做成**配音 + 逐字卡点字幕 + 自动采集素材**的短片。
与三种宣传片模式互不合并，共用卡片库、`assets/lib/`、音效库与工作台。

```
⓪ 取材与事实 → ① 口播稿（唯一确认点）→ ② 配音 → ③ 逐字时间戳 → ④ 素材采集
→ ⑤ 语意分镜 SHOTLIST → ⑥ 选卡与蒙皮 → ⑦ 实作 → ⑧ 自检 / 汇出 / 独立终检 / 交付
```

每阶段产物落在专案固定路径（§专案目录），下一阶段只读上一阶段产物，任何一段都能单独重跑。

**两条贯穿全程的红线**

- **不自动渲染**：制作期只出静帧；使用者说「汇出」才整片渲染。
- **时间不手敲**：所有动效起点只能来自 `timing.ts` 的 `tLine / tChar / tWord`，禁止写死秒数或帧号。

> **实作状态（2026-09-18）**：⓪–⑧ 的脚本与 `assets/lib/` 组件都已可用；既有 162 张卡已标 `input` / `narration`
> （gallery 有「口播可用」筛选，口播专用卡带橘色角标）。12 张资讯型新卡全部落地，在 `references/shots/narration/`，
> demo 在 `demos/narration/`。要再加新卡照 `docs/narration-card-brief.md`。

---

## 进入模式

触发条件任一成立即视为已选定，不再问模式：使用者给新闻 / 文章 / 部落格网址或整篇文字并要求「做成影片 / 配音短片 / 解说」；给口播稿或配音档；点名「口播模式」。

进入后**只问一次三件事**，没说就用预设：

| 项 | 预设 | 可选 |
|---|---|---|
| 画幅 | 9:16 直式 1080×1920 | 16:9 横式 1920×1080 |
| 语言 | 繁体中文口播 + 字幕 | — |
| 目标长度 | 40–60s | — |

使用者自带配音档 → 跳过 ②，直接进 ③（必须同时给逐字一致的稿）。

### 环境（首次）

```bash
# ASR（③）：Python ≥ 3.10
python3.11 -m venv ~/.cache/shotcraft-asr/venv
~/.cache/shotcraft-asr/venv/bin/pip install sherpa-onnx zhconv pypinyin numpy
curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/icefall-asr-zipformer-wenetspeech-20230615.tar.bz2 | tar xj -C ~/.cache/shotcraft-asr
# 抓页与截图（⓪④）：装在影片专案里
npm i -D playwright && npx playwright install chromium
```

金钥放 skill 根目录 `.env`（栏位名不分大小写，已 gitignore）：
`minimax_api_key` `minimax_voice_id` `pexels_api_key` `pixabay_api_key` `unsplash_access_key`。缺哪个来源就自动跳过哪个。

---

## ⓪ 取材与事实

```bash
node <skill>/assets/scripts/fetch-article.mjs <url | article.md> --out <project>
```

产出 `sources/article.md`（frontmatter 含 `source_label`——来源条用的媒体短名）、`article.json`、
`page-<slug>/page.png`（全页 2× 存证）、`rights.md`、`facts.md` 骨架、`assets/article/NN.*`、manifest 条目。

然后 **Agent 填 `sources/facts.md`**：片中会说到的每个数字、人名、机构、日期，各附原文来源句与截图档名。
**红线：没有来源句的数字不能进口播稿。**

**文章图片的权利规则**（`rights.md` 由脚本判定，Agent 照做）：

| 情况 | manifest | 交付时 |
|---|---|---|
| 一般媒体 | `rights: article`、`attribution_required: true`、`credit: 圖片來源：<媒体>／<摄影者>` | 进 `CREDITS.md`；用到的镜头画面内要有来源条 |
| 图说出现通讯社 / 图库字样（Getty、AP、Reuters、AFP、中央社、Shutterstock、達志、Photo AC、Wikimedia…） | 同上 + `risk: high` | **提醒使用者**「这张图的权利人不是该新闻媒体，是否保留请自行判断」，并附一个免署名替代候选。不自动剔除 |
| 已授权网域（`narration.config.json` 的 `trusted_domains`，含子网域；初始 `blocktempo.com`） | `rights: trusted-domain`、`attribution_required: false` | 不进 CREDITS、不警示、不提醒；口播稿可贴近原文改写；来源条预设仍显示媒体名（`show_source_strip: false` 可关） |

使用者说「某某网站也都可以用」→ 把网域加进 `narration.config.json`，不改程式。
影像处理限于裁切、缩放、极缓推拉与叠加标注；不去水印、不改动图片内容。
文内常混有站方宣传图（订阅 banner、社群邀请）——看图剔除，别当内容素材。

## ① 口播稿

产出 `script/lines.json`：

```json
[{ "i": 1, "text": "台大證券研究社的第一堂社課，排隊人潮，一路排到了馬路邊。", "role": "hook" }]
```

`role` ∈ `hook | context | evidence | data | impact | outro`。规则：

- 第一句是钩子（数字或冲突）；每句一个资讯点；句长 12–28 字。
- **数字写成中文读法**（「四成一」「百分之四十一點九」而非「41%」）——阿拉伯数字会让对齐读音不对位。画面上的数字卡可以用阿拉伯数字，那是画面不是稿。
- 英文品牌名保留原文（对齐时在相邻汉字之间插值）。
- 长度：繁中口播约 4.5 字/秒，60s 片约 250–280 字。
- 每个数字、人名回查 `facts.md`，查不到就删。

**产出后给使用者过目——这是全流程唯一的确认点，自主模式也要停。**

## ② 配音

```bash
python <skill>/assets/scripts/tts-minimax.py --lines script/lines.json --out-dir audio
#   --only 3,5      改稿后只重合成这几句（稿与音色未变的句子本来就自动沿用，不重复计费）
#   --concat-only   使用者自带逐句配音：放成 audio/line-{i}.mp3 后只做拼接
#   --gap 0.35      句间气口（秒）
```

产出 `audio/line-{i}.mp3`、`audio/vo.wav`（48k 单声道）、`audio/vo-map.json`（每句在整轨的起讫）。
脚本自检每句时长 > 0 与尾端 0.2s 是否已衰减（疑似截断会 exit 2）。
使用者给的是**单一整条**配音 → 直接放 `audio/vo.wav`，③ 不带 `--map`。
MiniMax 输出音档的商用条款依使用者帐号方案——交付时提醒使用者自行确认。

## ③ 逐字时间戳

```bash
~/.cache/shotcraft-asr/venv/bin/python <skill>/assets/scripts/align.py \
  --audio audio/vo.wav --lines script/lines.json --map audio/vo-map.json
```

产出 `audio/timing.json`（复制到 `src/timing.json` 供 TS 端 import）：

```json
{ "fps": 30, "total": 32.46, "backend": "…",
  "lines": [{ "i": 1, "text": "…", "start": 0.08, "end": 4.86, "match": 1.0, "match_raw": 1.0,
              "needs_review": false, "chars": [{ "c": "台", "start": 0.08, "end": 0.2 }] }] }
```

`chars` 与 `text` 逐字符 1:1（标点、空白也占位，时长 0）。

- `match < 0.9` → `needs_review: true`，脚本 exit 2 并印出「稿 / 听」对照——**让使用者听核这句**，多半是 TTS 念错或稿里有阿拉伯数字。
- `match_raw`（无偏置那一轮）偏低但 `match` 正常：时间戳可用，顺手请使用者听一下。
- **精度预期**：停顿后的片语首字吸附在能量起点上，可靠到 ±0.05s；句中个别字是模型估计，约 ±0.1–0.2s。**词锚尽量选片语开头的词。**
- 模型：`icefall-asr-zipformer-wenetspeech-20230615`（模型卡 apache-2.0）。备援 `--backend whisper`（faster-whisper，MIT；慢约 25 倍且会把数字写成阿拉伯数字，只在主后端整句失败时用）。

TS 端（`assets/lib/timing.ts` copy 进专案）：

```ts
import data from './timing.json';
export const { tLine, tLineEnd, tChar, tWord, tWordEnd, f } = createTiming(data);
const at = f(tWord(2, '十二點四萬'));      // 第 2 句讲到这个词的那一帧；稿改了词不在 → 直接抛错
```

## ④ 素材采集

**4.1 写分段草案 `assets/needs.json`**（先按 ⑤ 的规则把稿切成语意段）：

```json
{ "orientation": "portrait",
  "segments": [{ "id": "s1-hook", "lines": [1], "role": "hook", "mode": "video",
                 "queries": ["students queue outside building", "crowd waiting line campus"] }] }
```

每段 2–4 个**英文**视觉概念词（写画面里看得到的东西，不写抽象概念）+ 素材模式。预设对应：
`hook` → video、`evidence` → screenshot、`data` → chart、`context / impact` → photo 或 video、`outro` → text。

**4.2 搜候选 → 看图 → 选定**

```bash
node <skill>/assets/scripts/source-media.mjs                       # 查各来源，候选存 assets/candidates/<segment>/
node <skill>/assets/scripts/source-media.mjs --pick s1-hook 2 --shot S01   # 编号或候选 id
```

| 来源 | 内容 | 需标注 |
|---|---|---|
| Pexels | 影片、照片 | 否 |
| Pixabay | 影片、照片（未审核金钥照片长边只到 1280） | 否 |
| Unsplash | 照片（品质通常最好） | **是**——`--pick` 时自动先打 `download_location`；每小时 50 次上限，脚本有快取与落盘计数 |
| Openverse | 照片，只取 CC0 / PDM | 否 |
| 文章本身 | 头图、文内图（⓪ 已下载） | 是（已授权网域除外） |
| Playwright 截图 | 证据镜 | 画面内来源条 |
| 自产图表 | 从 `facts.md` 的数字画 | 否 |

不接：Wikimedia Commons（CC-BY-SA 有相同方式分享义务）、任何搜寻引擎图片结果。**没有 URL 的档案不准进成片。**

Agent **用眼睛选**：Read 每段的 `sheet.jpg`（联络表，左上角编号 = `candidates.json` 的 `n`，▶ = 影片），必要时再看单张缩图。选片规则：

1. 画面主体与概念词一致（搜「青森睡魔祭」出来的可能是别处的灯笼——对不上就别用）。
2. 无可辨识品牌或人脸特写（肖像疑虑）。
3. 色调与本片风格档相近。
4. 影片长度 ≥ 该镜时长；不足则用 `ClipCard` 的交叉淡化循环。
5. 同分优先免署名来源，减少标注条目；但不要因为要标注就放弃明显更好的 Unsplash 照片。

**降级阶梯**：影片 → 照片 → 网页截图 → 自产图表 / 示意图形。到最后一阶仍无素材的段落写进 `SHOTLIST.md` 的「未采集清单」，**不准伪装成设计决定**。

**4.3 网页「拍摄」而非贴图**

```bash
node <skill>/assets/scripts/capture-page.mjs <url> --slug <name> --segment s3-evidence \
  --text "页面上的原文句子（逐字，含标点）" --auto
```

**直式片一律加 `--width 430 --scale 3`（手机版面）**：文章栏占满画面，内文放进 1080 宽约 36px 可读；用预设的桌机版面（1280 宽）
内文只剩约 19px，手机上读不到（台大新闻实跑踩过）。横式片用预设值。`--text` 命中的是页面里**第一次出现**的位置——
摘要框常先出现同一句，要标内文就把句子给长一点。

产出 `assets/pages/<slug>/{page.png, boxes.json}`。`boxes.json` 坐标是整页 CSS px（× `scale` = `page.png` 像素），
文字框用 Range 实测、逐行给 `rects`（跨连结节点也准）。成片里用相机在长图上滚动、停靠、放大、画线；**不做整张静态贴图，坐标不准目测**。找不到文字会 exit 2——照页面原文逐字重给。

**4.4 配额检查**（任一 FAIL 不进 ⑦）

```bash
node <skill>/assets/scripts/source-media.mjs --check
```

每镜有素材行、档案存在、纯动效镜 ≤ 1/3、manifest 每笔有 URL 与授权、需标注条目 credit 完整（Unsplash 另查 `download_tracked`）。有 `src/shotlist.json` 对照 shotlist，否则对照 `needs.json`。

**4.5 标注清单**

```bash
node <skill>/assets/scripts/source-media.mjs --credits     # → out/CREDITS.md
```

只收实际进成片的素材，完整版（含连结）与精简版各一份；无需标注时写明「本片無需標註的素材」。

## ⑤ 语意分镜 SHOTLIST

产出 `SHOTLIST.md`（人读）+ `src/shotlist.json`（机读）。全片骨架先填 `sequences/narration-news-arc.md`。

```json
{ "shots": [{
  "id": "S02", "lines": [2], "intent": "用浏览数证明这件事爆红",
  "material": { "mode": "screenshot", "file": "assets/pages/threads-post/page.png" },
  "card": { "name": "stat-punch", "style": "default" },
  "anchors": [{ "action": "数字砸入", "line": 2, "word": "十二點四萬" }],
  "subtitle": "沿用句文",
  "transition_in": "运动承接：上一镜推近的终点 = 本镜起点",
  "sfx": [{ "file": "impact/hit-weak.mp3", "anchor": 0, "volume": 0.3 }],
  "skin": ["数字色 → theme.accent", "字体 → theme.display"],
  "hold": 0.4,
  "checks": ["（选定的卡的已知坑，逐条抄在这里）"]
}] }
```

**分镜检核表**（逐条过，写进 `SHOTLIST.md` 末尾）：

1. 按**语意段落**切镜，不是一句一镜；一镜只有一个主视觉任务。
2. 新元素只在段落边界进场；段内画面的「活」来自相机极缓推拉（1.00 → 1.04 或反向）或既有元素的变化。
3. 一个节拍只有一个主角；上一主角在下一主角进场前**降权留守**（压暗缩小、不退场、仍占位）。同屏主体 ≤ 3。
4. 开镜到第一个动效锚点 > 1.5s 时，开场要有素材承载，不能空画布等词。
5. 词锚落点距镜尾 < 0.6s 的，提前或移到下一镜。
6. 词锚未到的数字 / 图形**完全不可见**，不做预告式灰显。
7. 每个镜头边界写明转场（运动承接或轻量遮罩擦除），**禁止裸切**。
8. 直式画幅：主内容 y 150–1420、字幕 y≈1480、常驻件靠左下（右缘是社群平台按钮区）。
9. 每一镜都有「实拍 / 图片 / 网页截图」三者之一，纯动效镜 ≤ 1/3。
10. 用到文章图片或网页截图的镜头有来源条。

## ⑥ 选卡与蒙皮

**选卡程序**

1. 用该镜 `material.mode` 过滤卡的 `input`。
2. 用段落 `role` 对应卡的 `narration` 标记过滤：

   | role | 优先的 narration 标记 |
   |---|---|
   | hook | broll、data（数字钩子）；产品运镜卡（标 `none`）也可用 |
   | context | broll、chapter |
   | evidence | evidence |
   | data | data |
   | impact | quote、broll |
   | outro | chapter；产品运镜卡也可用 |

3. 剩下的卡依能量与时长匹配（镜长 = 段落配音长度 + 尾部 hold）。
4. 同一张卡全片最多当两次主角；连续两镜不用同一卡。
5. 选定后**必读卡全文与 demo 原始码**，把「已知坑」逐条抄进该镜的 `checks`。

**资讯型卡片**（`references/shots/narration/`，12 张）：

| 卡 | input | narration | 一句话 |
|---|---|---|---|
| `page-scroll-read` | screenshot | evidence | 长页匀速上滚，讲到关键段落减速停靠 |
| `page-anchor-tour` | screenshot | evidence | 相机依序巡游兴趣点，位置与缩放都变；长距离跳转用它 |
| `marker-sweep` | screenshot / text | evidence | 荧光笔按词锚逐词扫过一句 |
| `ink-circle-note` | screenshot / photo | evidence | 手绘圈注 + 箭头 + 短注，钉在内容坐标系 |
| `loupe-peek` | screenshot / photo | evidence | 圆形放大镜看一眼即撤 |
| `source-strip` | text | evidence | 来源条（生产用 `assets/lib/SourceStrip.tsx`） |
| `stat-punch` | text / video / photo | data | 词锚处大数字砸入 |
| `bar-grow-compare` | chart | data | 2–4 根长条依词锚逐根生长，零基线 |
| `quote-plate` | text / photo / video | quote | 引言逐片语浮现，署名最后到 |
| `chapter-slate` | text | chapter | 一章一色一线稿 + 左下角标 |
| `clip-frame-reveal` | video / photo | broll | 实拍素材主题边框（paper / film / hairline） |
| `photo-drift-stack` | photo | broll | 2–3 张相纸错位堆叠、极缓漂移 |

同一句话上不要叠两种强调（`marker-sweep` 与 `ink-circle-note` 二选一）；证据镜一律配 `source-strip`。

**蒙皮契约**：卡是中性 UI，进片前依本片风格档改皮——颜色换 `theme.ts` token、字体、圆角、材质；
**不改时序、缓动、几何比例、层级**。

### 风格档

从文章题材推导，写进 `src/theme.ts`。预设四组（可依文章主视觉微调，微调写进 `SHOTLIST.md`）：

| token | 财经 | 科技 / 加密 | 旅游 | 生活 |
|---|---|---|---|---|
| `bg` | `#0e1116` 墨黑 | `#0a0c14` 深蓝黑 | `#f4efe6` 米纸 | `#faf7f2` 暖白 |
| `ink`（主文字） | `#f2f0ea` | `#eef1f7` | `#22201c` | `#2a2622` |
| `accent` | `#e0b04b` 金 | `#5b8cff` 电蓝 | `#d2572b` 柿红 | `#3f8f6b` 苔绿 |
| `accent2`（涨 / 跌、对比） | `#e5484d` / `#30a46c` | `#9b7bff` | `#2f6f8f` | `#e08a3c` |
| `plate`（字幕 / 来源条底） | `rgba(14,17,22,.82)` | `rgba(10,12,20,.82)` | `rgba(34,32,28,.80)` | `rgba(42,38,34,.78)` |
| 标题字体 | Noto Serif TC 700 | Noto Sans TC 800 | Noto Serif TC 600 | Noto Sans TC 600 |
| 内文 / 字幕字体 | Noto Sans TC 600 | Noto Sans TC 600 | Noto Sans TC 500 | Noto Sans TC 500 |
| 圆角 | 6 | 14 | 4 | 20 |
| 材质 | 细网格 + 1px 发丝线 | 低对比噪点 + 柔光晕 | 纸纹 + 相框白边 | 纯色 + 柔影 |
| 影片 / 照片框式 | 薄线框 | 薄线框 | 纸相框 | 纸相框 / 无框圆角 |
| 常用音效类别 | `ui/` `counter/` `impact/`（轻） | `data/` `ui/` `transition/` | `paper/` `camera/` `film/` | `paper/` `ui/` `fluid/` |

台湾财经惯例**红涨绿跌**；文章来自欧美市场语境时对调并在 `SHOTLIST.md` 注明。

### 版面表

| | 直式 1080×1920 | 横式 1920×1080 |
|---|---|---|
| 主内容安全区 | x 60–1020、y 150–1420 | x 120–1800、y 80–880 |
| 字幕（`Subtitles.tsx` 内建） | y 1480、52px、每条 ≤ 16 字 | y 930、46px、每条 ≤ 26 字 |
| 来源条 | 左下，y 1620–1700，避开右缘 | 左下，y 1000–1050 |
| 章节 / 角标等常驻件 | 左上或左下；**右缘 x > 900、y 900–1700 留给平台按钮** | 四角皆可 |
| 平台 UI 遮挡区 | 顶 0–150（帐号列）、底 1720–1920（说明文字） | — |

## ⑦ 实作

```bash
node <skill>/assets/scripts/scaffold-narration.mjs --out <project> --style finance|tech|travel|life [--landscape]
cd <project> && npm i
```

- 骨架产出 `src/{index,Root,Main,timeline,theme,audio}.ts(x)`、`src/scenes/Scene<Id>.tsx`（每镜一个占位场景，素材、
  `SlowPush`、来源条已接好）、`src/lib/`（timing / Subtitles / SlowPush / SourceStrip 的拷贝）、`public/vo/vo.wav`。
  已存在的档案不覆盖（`--force` 才覆盖）；**`timeline.ts` 与 `src/timing.json` 是生成物，每次重跑都重写**——
  改稿重配后重跑一次骨架即可，场景档不会被动到。
- `src/timeline.ts` 是唯一时间事实源：镜头边界落在句间气口中点，末镜 = 末句 `end` + `hold`。
  场景里的时间点只准用 `atIn(shotId, line, '词')`（词锚 → 镜内相对帧）。不手写帧号。
- 素材影片用 1080p 档（`source-media.mjs` 已自动挑短边刚好 ≥1080 的最小档）：4K 档会让 `OffthreadVideo` 抽帧逾时。
- 字幕：`<Subtitles timing={data} highlights={[…]} />`——整句硬现、无动效、无标点；关键词高亮全片 ≤ 3 次（超过会抛错）。配色传 `color / accent / plate / fontFamily`。
- 相机：每镜一条极缓缩放曲线；不摇晃、不旋转、不模糊。
- 音效：沿用 `assets/audio/`，每个主要入场配一记，音量 ≤ 0.35（比人声低约 12dB）；转场音只放在句间气口。
- BGM 退为垫底（≤ 0.15），**不卡拍**；`bgm` inputProp 可关，交付带 / 不带 BGM 两版。
- 确定性渲染规则照 repo 既有（禁 `Math.random()`、CSS transition、`Date.now()`）。
- **首镜先做**：第一个有素材与字幕的镜头完成后出静帧给使用者看，确认蒙皮、字幕、相机幅度后再做其余镜头。

## ⑧ 自检、汇出、终检、交付

1. 机器检查，两个都要 PASS：
   ```bash
   python3 <skill>/assets/scripts/anchor-lint.py --project <project>   # 词锚 / 镜尾保护带 / 素材与授权 / 选卡规则 / 转场
   node <skill>/assets/scripts/source-media.mjs --out <project> --check
   ```
2. 静帧：每镜入 / 出 / 每个锚点各一张，拼成 overview 给使用者。
3. 使用者说「汇出」→ 整片渲染两版（带 / 不带 BGM）→ 抽音轨实测字幕偏移 → 派**全新上下文 subagent** 依 `final-review.md` 终检，外加口播专属三项：字幕与人声同步、画面数字与 `facts.md` 一致、每镜素材来源在 manifest 内。
4. 交付物：`out/final.mp4`、`out/final-nobgm.mp4`、`out/CREDITS.md`、`assets/manifest.json`、`sources/facts.md`。
5. 交付讯息必须写明：本片用了几张 Unsplash 照片 / 文章图片、发布时请贴上 `CREDITS.md`；有 `risk: high` 图片时逐张提醒并附替代候选；MiniMax 音档商用条款请自行确认。
6. 然后开工作台（骨架已生成 `src/workbench.ts`）：`node workbench/scripts/open.mjs <project>`，地址 http://localhost:5198/?import=project。
   使用者问「去哪看预览」指的就是这个，不是 Remotion Studio；制作期想看可播放预览也开它。5198 被旧的 dev server 占住时先停掉旧的再开。最后才提一次剪映汇出。

---

## 专案目录

```
<project>/
  sources/   article.md article.json facts.md rights.md page-<slug>/
  script/    lines.json
  audio/     line-*.mp3 vo.wav vo-map.json timing.json
  assets/    needs.json manifest.json article/ candidates/ pages/
  SHOTLIST.md
  src/       Root.tsx Main.tsx timeline.ts theme.ts shotlist.json timing.json audio.tsx workbench.ts scenes/
  public/    vo/ media/ pages/ sfx/ bgm/
  out/       qa/ CREDITS.md final.mp4 final-nobgm.mp4
```

## 依赖与授权

| 依赖 | 授权 | 备注 |
|---|---|---|
| Remotion | 自有授权 | 个人与 ≤3 人公司免费，否则需公司授权——**商用前提醒使用者** |
| sherpa-onnx | Apache-2.0 | ASR runtime |
| icefall-asr-zipformer-wenetspeech-20230615 | apache-2.0（HF 模型卡） | 主 ASR 模型。`sherpa-onnx-zipformer-ctc-zh-*` 模型卡无授权声明，不采用 |
| faster-whisper + Whisper 权重 | MIT | 备援 |
| zhconv、pypinyin、numpy | MIT / BSD | 对齐用 |
| Playwright | Apache-2.0 | 抓页与截图 |
| Mixkit SFX / Music | Mixkit Free License | 免署名商用；库内每个档案都有可查 URL（`assets/audio/ATTRIBUTION.md`） |
| Pexels / Pixabay / Openverse(CC0, PDM) | 各自免署名商用 | |
| Unsplash API | Unsplash License + API Guidelines | 可商用；发布时需标注（`CREDITS.md` 自动产出） |
| MiniMax TTS | 依使用者帐号条款 | 输出音档商用条款请使用者自行确认 |

新增依赖必须是 Apache-2.0 / MIT / BSD / ISC / CC0 之一；素材来源必须可商用且预设免署名（Unsplash 与文章图片是使用者决定的例外，走 manifest 标记 + CREDITS）。
