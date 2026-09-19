# 字幕模式（Subtitle Mode）

给一支影片网址，下载后自动辨识语音、翻成（或校成）**繁体中文字幕**，交付烧录字幕的成片 + `.srt` 字幕档。
不做分镜、不选卡、不用 Remotion——画面是原片，只加字幕。

```
⓪ 下载 fetch → ① 辨识 transcribe → ② 翻译 / 校对（Agent，写 subs/zh.json）
→ ③ 排版 build → ④ 静帧自检 still →（使用者过目字幕，唯一确认点）→ ⑤ 汇出 burn
```

**红线**：不自动渲染——制作期只出静帧；使用者说「汇出」才跑 `burn`。

---

## 进入模式

触发条件任一成立即视为已选定，不再问模式：使用者给影片网址（YouTube / X / Threads / IG / TikTok / B 站…）
并要求「上字幕」「加中文字幕」「翻成中文字幕」；或点名「字幕模式」。

**不问问题，直接用预设开工**；使用者有说才改：

| 项 | 预设 | 可选 |
|---|---|---|
| 字幕语言 | 繁体中文（台湾用语） | — |
| 样式 | `outline` 白字黑边 | `plate` 深色底板（原片底部很花或已有字幕时） |
| 双语 | 否 | `--bilingual` 中文下方加小字原文 |
| 位置 | 底部 | `--position top` / `--margin-v` 调高度 |

## 专案目录

照 SKILL.md「成片工程放哪里」：`projectsRoot` 下建 `YYYY-MM-DD-<中文主题>-中文字幕`。
主题先用 `yt-dlp --print title <URL>` 取标题再意译成中文短名。

```
source/video.mp4  source/meta.json   来源影片 + 网址、作者、画幅、时长
subs/asr.json                         原始辨识（逐词时间）
subs/cues.json                        字幕条 [{i,start,end,src}]——时间真值，不手改
subs/zh.json                          [{i, zh}]——Agent 写的繁中字幕
subs/zh.ass  out/<名>.zh-TW.srt       排版产出
stills/                               检查静帧
out/<名>-中文字幕.mp4                  汇出成片
```

## 执行

脚本不复制，直接从 skill 目录跑；Python 用口播模式同一个 venv（已含 faster-whisper）：

```bash
PY=~/.cache/shotcraft-asr/venv/bin/python
S=<skill>/assets/scripts/subtitle.py
P=~/Documents/影片專案/2026-09-19-某主題-中文字幕

$PY $S fetch      --url "<URL>" --out $P          # 需登入的平台加 --cookies-from-browser chrome
$PY $S transcribe --out $P                        # 预设 large-v3-turbo，首次下载约 1.6GB；赶时间 --model small
#   ← Agent 写 subs/zh.json（见下节）
$PY $S build      --out $P --name <英文或拼音短名> [--style plate] [--bilingual]
$PY $S still      --out $P                        # 自动挑 4 张（含最长那条）；或 --t 秒数 指定
#   ← 使用者过目、说「汇出」
$PY $S burn       --out $P
```

venv 不存在时先照 `narration-mode.md` 的「环境（首次）」建好，再补 `pip install faster-whisper`。

### ② 翻译 / 校对（Agent 的工作）

读 `subs/cues.json` 全文（先整体读懂再逐条下笔），写 `subs/zh.json`：

```json
[
  { "i": 0, "zh": "好 我們現在在大象這邊" },
  { "i": 1, "zh": ["牠們的鼻子", "真的很長"] },
  { "i": 2, "zh": "" }
]
```

- **条数与编号必须和 cues.json 一一对应**；时间由 cues.json 决定，Agent 只写文字。
- 字串阵列 = 在该条时间内按字数比例再拆成几条（原句太长、中文放不下时用）。
- 空字串 = 刻意不上字（音乐、无意义的语助词、辨识幻觉）。
- **外语来源**：意译成自然的台湾口语，不逐词硬翻；英文句子被切在两条之间时，可以把语意在相邻两条间挪动，
  让每条中文自己读得通。专有名词第一次出现可附原文（`輝達（NVIDIA）`），之后只用中文。
- **中文来源**：`transcribe` 已用 opencc s2twp 预填繁体，Agent 逐条校对：同音错字、人名地名、
  术语、陆用词（视频→影片、质量→品質）；ASR 漏字或多字以听感为准，不确定的地方在回报里列出请使用者听核。
- 长度：直式一行 ≤ 16 字、横式 ≤ 24 字，最多两行（`build` 会自动折行，超过两行直接报错）。
- 标点照台湾字幕惯例由 `build` 自动处理：句中逗号类转空白、句号删掉，保留？！和「」。Agent 照正常标点写即可。

### ③ 排版与 ④ 自检

`build` 会警告读速 > 9 字/秒的条目——能缩就缩（删赘字、改短说法），不行就接受。
`still` 出的静帧要 Read 检查：

- 字幕有没有压到原片既有字幕 / 字卡 / 人脸 → 改 `--margin-v`、`--position top` 或 `--style plate`
- 直式片字幕在画面约 80% 高度处，避开右侧与底部的平台按钮区
- 字型是蘋方繁体中粗、没有缺字方块

### 确认点

把 `out/<名>.zh-TW.srt` 全文（条数多时给前 20 条 + 需听核清单）和 2–4 张静帧给使用者过目。
使用者改字 → 改 `zh.json` → 重跑 `build` + `still`。使用者说「汇出」→ `burn`。

## 交付

- `out/<名>-中文字幕.mp4`（`burn` 会比对来源与成片时长）
- `out/<名>.zh-TW.srt`（可另外导入剪映 / YouTube 当软字幕）
- 回报来源：`source/meta.json` 的网址与作者。这是别人的影片，转载授权由使用者自行负责；
  不产 CREDITS.md、不开动效工作台、不导剪映工程（原片没有可拆的镜头轨）。
