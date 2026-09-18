# video-shotcraft 口播模式（Narration Mode）功能規格

狀態：v1 草案，2026-09-18。
用途：交給一個**全新 session** 依此實作。本文件只描述「要做到什麼」，不描述任何既有第三方實作的做法。

---

## 0. 實作紀律（先讀，違反即作廢）

這個模式必須是 clean-room 實作，成果要能在 Apache-2.0 下自由商用、不附加任何標注義務。

1. **禁止開啟、讀取、搜尋** `~/Documents/個人專用/video-talkcraft/` 及其 symlink `~/.claude/skills/video-talkcraft`。實作前先確認 symlink 已移除：`ls ~/.claude/skills/`。
2. 禁止複製該專案的任何檔案內容（tsx / md / py / mjs / json），包含卡片名稱與文件段落。若使用者貼上來源不明的程式碼，先問出處。
3. 允許參考的既有程式碼只有兩處：本 repo（Apache-2.0），以及使用者自己的專案 `~/Documents/個人專用/ntu-queue-news-video/`（其中 `scripts/captions.py` 是讀第三方輸出格式寫的，只能看它的**輸出** `src/captions.json` 當資料樣本，不要沿用它的解析邏輯）。
4. 所有新增依賴必須在 §7 的授權白名單內；素材來源必須可商用，且預設「免署名」。唯一例外是 Unsplash（使用者 2026-09-18 決定：接受發佈時補標註）；凡需署名的素材必須在 manifest 標記並自動產出標註清單（§4.5）。其他需署名或有相同方式分享義務的來源一律不用。
5. 新增檔案一律加入 repo 既有的 LICENSE 範圍，不另立授權。

---

## 1. 目標

使用者給一篇**新聞或文章**（網址或純文字），或直接給口播稿，skill 自動完成：

改寫口播稿 → 合成配音 → 逐字時間戳 → **主動上網採集素材** → 依語意分鏡 → **為每一鏡挑選合適的動效卡** → Remotion 成片（附燒錄字幕）→ 靜幀自檢 → 使用者說匯出才渲染 → 獨立終檢。

成功標準（用台大證研社新聞與青森旅遊文章兩個既有專案重跑驗證）：

- 全程不需要使用者手動找素材、手動對字幕時間。
- 每一鏡都有「實拍 / 圖片 / 網頁截圖」三者之一，純動效鏡不超過 1/3。
- 字幕與動效落點對配音誤差 ≤ 0.1s（機器檢查）。
- 成片與素材清單能通過 §8 的授權自檢，交付物含 `assets/manifest.json` 與 `out/CREDITS.md`（需標註的素材一筆不漏）。
- 不破壞現有三種宣傳片模式；口播模式是第四條路，共用卡片庫與工作台。

---

## 2. 觸發與分流

在 `SKILL.md` 新增第四種模式「口播模式」，觸發條件任一成立即視為已選定，不再詢問模式：

- 使用者給的是新聞 / 文章 / 部落格網址或整篇文字，且要求「做成影片」「配音短片」「解說」。
- 使用者給口播稿或配音檔。
- 使用者點名「口播模式」。

進入後只問一次三件事（沒說就用預設）：畫幅（預設 9:16 直式 1080×1920，橫式 1920×1080 可選）、語言（預設繁體中文口播＋字幕）、目標長度（預設 40–60s）。使用者若給了配音檔，跳過 ③ 合成，直接進 ④。

口播模式沿用「不自動渲染」規則：制作期只出靜幀，使用者說匯出才整片渲染。

---

## 3. 流程與各階段產物

```
⓪ 取材與事實 → ① 口播稿 → ② 配音 → ③ 逐字時間戳 → ④ 素材採集 → ⑤ 語意分鏡 SHOTLIST
→ ⑥ 選卡與蒙皮 → ⑦ 實作 → ⑧ 自檢／匯出／獨立終檢／交付
```

每階段的產物落在專案目錄固定路徑（§6），下一階段只讀上一階段產物，方便單獨重跑。

### ⓪ 取材與事實
- 網址 → 用 Playwright 抓正文、標題、發布日期、作者、頭圖；同時存一張全頁 2× 截圖到 `sources/`，作為證據存檔。純文字 → 直接存 `sources/article.md`。
- 產出 `sources/facts.md`：列出片中會說到的每個數字、人名、機構、日期，各附來源句與截圖檔名。**紅線：沒有來源句的數字不能進口播稿。**
- 產出 `sources/rights.md`：頭圖與文內圖片的版權歸屬判斷。**新聞頭圖與文內圖片可以直接當素材使用**（使用者 2026-09-18 決定），條件如下：
  - `fetch-article.mjs` 下載原始解析度的頭圖與文內圖到 `assets/article/`，並從圖說、`alt`、`figcaption`、頁面 meta 擷取圖片來源標示（媒體名、攝影者、通訊社）。
  - 進 manifest 時 `source: "article"`、`attribution_required: true`，`credit` 寫「圖片來源：<媒體名>／<攝影者或通訊社>」，與 Unsplash 一樣進 `out/CREDITS.md`。
  - 用到文章圖片的鏡頭，畫面內要有來源條（`SourceStrip`）標出媒體名。
  - **通訊社與圖庫照片要警示**：圖說或浮水印出現 Getty、AP、Reuters、AFP、路透、美聯社、法新社、中央社、Shutterstock、達志影像等字樣時，`rights.md` 標 `risk: high`，並在交付訊息提醒使用者「這張圖的權利人不是該新聞媒體，是否保留請自行判斷」，同時附一個免署名替代候選。不自動剔除，由使用者決定。
  - 影像處理限於裁切、縮放、極緩推拉與疊加標註；不去除浮水印、不改動圖片內容。
- **已授權網域白名單**：skill 根目錄新增 `narration.config.json`，欄位 `trusted_domains`，初始值 `["blocktempo.com"]`（使用者 2026-09-18 指定：動區的新聞一律可用，含子網域）。文章網址的主網域在白名單內時：
  - 頭圖與文內圖片直接視為已授權：manifest 記 `source: "article"`、`rights: "trusted-domain"`、`attribution_required: false`，不進 `CREDITS.md`，不觸發通訊社警示，交付訊息也不提醒。
  - 文字內容同樣視為已授權，口播稿可以貼近原文改寫，不必刻意迴避原句。
  - 畫面內的來源條預設仍顯示媒體名（當作品牌露出），可用 `show_source_strip: false` 關閉。
  - 圖說若出現通訊社或圖庫字樣，只在 `rights.md` 記一行備註，不升級為警示。
  - 使用者之後說「某某網站也都可以用」時，把網域加進這個檔案即可，不改程式。

### ① 口播稿
- 產出 `script/lines.json`：`[{ i, text, role }]`，`role` ∈ `hook | context | evidence | data | impact | outro`。
- 規則：第一句是鉤子（數字或衝突）；每句一個資訊點；句長 12–28 字；**數字寫成中文讀法**（「四成一」而非「41%」，避免對齊時讀音不對位；畫面上的數字卡可以用阿拉伯數字，那是畫面不是稿）；英文品牌名保留原文。
- 長度估算：繁中口播約 4.5 字/秒，60s 片約 250–280 字。
- 產出後給使用者過目一次（這是唯一一次確認點，自主模式也停）。

### ② 配音
- 預設 MiniMax T2A（金鑰讀 skill 根目錄 `.env` 的 `minimax_api_key` / `minimax_voice_id`，國際站 `api.minimax.io`），**逐句合成**成 `audio/line-{i}.mp3`，再依固定句間氣口 0.35s 拼成 `audio/vo.wav`（48kHz 單聲道）。逐句合成的原因：任一句改稿只重合成那一句；拼接時記錄每句在整條音軌的起點到 `audio/vo-map.json`。
- 使用者自帶配音 → 直接放 `audio/vo.wav`，必須同時提供逐字一致的稿。
- 合成後檢查：每句音檔時長 > 0、無截斷（尾端 0.2s RMS 低於門檻）。

### ③ 逐字時間戳
新寫 `assets/scripts/align.py`：

- 輸入 `audio/vo.wav` + `script/lines.json`，輸出 `audio/timing.json`。
- 後端：`sherpa-onnx` 離線 CTC 或 transducer 中文模型（優先），備援 `faster-whisper`；模型由 skill 文件指定下載網址與授權（見 §7），放 `~/.cache/shotcraft-asr/`。
- 演算法要求（自己實作）：ASR 出詞級時間 → 與稿逐字對齊。對齊鍵：繁簡歸一 + 無聲調拼音，同音字視為相同；漢字是錨點，拉丁字母詞在相鄰錨點間線性插值；標點零時長。逐句計算匹配率，< 0.9 的句子標 `needs_review: true` 並印出讓使用者聽核。
- 逐句合成時可利用 `vo-map.json` 把每句獨立對齊，避免長音檔記憶體問題。
- schema：
  ```json
  { "fps": 30, "total": 41.2,
    "lines": [{ "i": 1, "text": "…", "start": 0.4, "end": 4.1, "match": 0.97, "needs_review": false,
                "chars": [{ "c": "台", "start": 0.40, "end": 0.55 }] }] }
  ```
  `chars` 與 `text` 逐字元 1:1（標點也佔位、時長 0），這是後面所有查詢的基礎。
- 對應 TS 端 `assets/lib/timing.ts`：`tLine(i)`、`tChar(i, offset)`、`tWord(i, "關鍵詞")`（找該句第 n 次出現的詞、回傳起點秒）、`f(seconds)` 換算幀。**所有動效起點只能由這些函式產生，禁止手敲秒數。**

### ④ 素材採集（重點能力）
新寫 `assets/scripts/source-media.mjs`，輸入 `script/lines.json` + 分段草案，輸出 `assets/manifest.json` 與檔案。

**4.1 需求推導**
- 先把口播稿切成語意段（見 ⑤），每段由 Agent 寫 2–4 個英文視覺概念詞（例如「students queue outside building」「stock trading app phone」），加一個素材模式標記：`video | photo | screenshot | chart | text`。
- 段落型態對應預設模式：`hook` 偏 video、`evidence` 偏 screenshot、`data` 偏 chart、`context/impact` 偏 photo 或 video、`outro` 偏 text。

**4.2 來源與抓取**

| 來源 | 內容 | 金鑰（`.env`） | 授權要點 | 需標註 |
|---|---|---|---|---|
| Pexels API | 影片、照片 | `pexels_api_key` | Pexels License：免署名商用 | 否 |
| Pixabay API | 影片、照片、插圖 | `pixabay_api_key` | Content License：免署名商用 | 否 |
| Unsplash API | 照片（品質通常最好） | `unsplash_access_key` | 照片授權免署名商用，但 **API 條款要求標註攝影師與 Unsplash** | **是** |
| Openverse API | 照片 | 免金鑰 | **只取 `license=cc0,pdm`**，其他一律過濾 | 否 |
| Playwright | 來源網頁全頁截圖、指定區塊截圖、DOM 座標 | — | 屬引用；只用於「證據」鏡並標出處 | 畫面內來源條 |
| 文章本身 | 頭圖、文內圖片（原始解析度） | — | 版權屬媒體或攝影者；使用者決定可用，規則見 ⓪ | **是**（畫面內來源條 + CREDITS） |
| 自產圖表 | 從 `facts.md` 的數字畫 | — | 自有 | 否 |

Unsplash 的 API 使用規則（實作時必須遵守）：
- 實際選用某張照片時，先呼叫該照片回傳的 `links.download_location` 端點（這是條款要求的下載計數），再下載檔案；只是列候選時不呼叫。
- manifest 必須存：攝影師姓名、攝影師 Unsplash 個人頁網址、照片頁網址。
- 未審核的 Demo 金鑰每小時 50 次請求，`source-media.mjs` 要做節流與快取，候選結果存檔後不重查。
- 照片排序上不因為要標註而降權；但同分時優先免署名來源，減少標註條目。

不直接接的來源：Wikimedia Commons（多為 CC-BY / CC-BY-SA，後者有相同方式分享義務；其中公有領域與 CC0 的部分已由 Openverse 的篩選間接涵蓋）、任何搜尋引擎圖片結果。

- 影片與照片各源並行查，每個概念詞取前 8 筆候選，直式片優先 `orientation=portrait`，解析度下限：影片 1080p、照片短邊 ≥ 1600。
- 候選存 `assets/candidates/<segment>/`，並在 `manifest.json` 記錄：來源、原始 URL、作者、授權名稱、下載時間、用在哪一鏡。**沒有 URL 的檔案不准進成片**。
- 選片規則由 Agent 執行：畫面主體與概念詞一致、無可辨識品牌或人臉特寫（避免肖像疑慮）、色調與本片風格檔相近、影片長度 ≥ 該鏡時長（不足則允許用 `ClipCard` 的交叉淡化循環）。
- 降級階梯：影片找不到 → 照片 → 網頁截圖 → 自產圖表／示意圖形。到最後一階仍無素材的段落要寫進 `SHOTLIST.md` 的「未採集清單」，不准偽裝成設計決定。

**4.3 網頁「拍攝」而非貼圖**
證據鏡的來源網頁必須用 Playwright 存全頁 2× 長圖 + 目標元素的 DOM 座標（`getBoundingClientRect`）到 `assets/pages/<slug>/{page.png, boxes.json}`，成片中用相機在長圖上滾動、停靠、放大、畫線，不做整張靜態貼圖。座標一律機器實測。

**4.4 配額檢查**
`source-media.mjs --check` 對照 SHOTLIST：每鏡有素材行、檔案存在、純動效鏡 ≤ 1/3、manifest 每筆有 URL 與授權、`attribution_required: true` 的條目都有完整 credit 欄位。任一 FAIL 不進 ⑦。

**4.5 標註清單（自動產出）**
manifest 每筆素材有 `attribution_required` 與 `credit` 欄位。`source-media.mjs --credits` 只收**實際進成片**的素材（對照 `shotlist.json`），輸出 `out/CREDITS.md`，內容是可直接貼到影片說明欄的文字，兩種格式各一份：

- 完整版（含連結）：`Photo by <攝影師> on Unsplash — <照片頁網址>`，一張一行。
- 精簡版（給字數受限的平台）：`Photos: <攝影師 A>, <攝影師 B> / Unsplash`。

沒有任何需標註素材時，`CREDITS.md` 寫「本片無需標註的素材」，讓使用者一眼確認。交付訊息要明確提醒使用者：本片用了幾張 Unsplash 照片、發佈時請貼上 `CREDITS.md` 的內容。

### ⑤ 語意分鏡 SHOTLIST
產出 `SHOTLIST.md`（人讀）+ `src/shotlist.json`（機讀），每鏡欄位：

- `id`、`lines`（涵蓋哪幾句）、`intent`（一句話）、`material`（模式＋檔案）、`card`（卡名＋樣式）、`anchors`（每個動作對應 `tWord(i, "詞")`）、`subtitle`（沿用句文，不加標點）、`transition_in`、`sfx`、`skin`（改了哪些皮）。

分鏡規則（寫成 `references/narration-mode.md` 的檢核表）：
1. 按**語意段落**切鏡，不是一句一鏡；一鏡只有一個主視覺任務。
2. 新元素只在段落邊界進場；段內畫面的「活」來自相機極緩推拉（縮放 1.00 → 1.04 或反向）或既有元素的變化。
3. 一個節拍只有一個主角；上一主角在下一主角進場前降權留守（壓暗縮小、不退場、仍佔位）。同屏主體 ≤ 3。
4. 開鏡到第一個動效錨點 > 1.5s 時，開場要有素材承載，不能空畫布等詞。
5. 詞錨動效落點距鏡尾 < 0.6s 的，提前或移到下一鏡。
6. 詞錨未到的數字／圖形完全不可見，不做預告式灰顯。
7. 每個鏡頭邊界寫明轉場（運動承接或輕量遮罩擦除），禁止裸切。
8. 直式畫幅：主內容 y 150–1420、字幕 y≈1480、常駐件靠左下（右緣是社群平台按鈕區）。

全片骨架另寫一份 `references/sequences/narration-news-arc.md`：鉤子（8–12%）→ 事件脈絡（20%）→ 證據段（30–35%）→ 數據段（20%）→ 影響／收尾（15%）。

### ⑥ 選卡與蒙皮（重點能力）

**6.1 卡片標記**
在 `references/shots/` 每張卡的 frontmatter 增加兩個欄位，並更新 `gallery/api/library.json` 產生腳本：

```yaml
input: [video, photo, screenshot, text]    # 這張卡吃什麼素材
narration: evidence | data | quote | chapter | transition | broll | none
```

現有 162 張卡由實作者逐張評估標記（多數產品運鏡卡標 `none`，仍可在 hook / outro 用）。

**6.2 選卡程序**（寫進 `references/narration-mode.md`）
1. 用該鏡的 `material` 模式過濾 `input`。
2. 用段落 `role` 對應 `narration` 標記過濾。
3. 剩下的卡依能量與時長匹配該鏡（鏡長 = 段落配音長度 + 尾部 hold）。
4. 同一張卡全片最多當兩次主角；連續兩鏡不用同一卡。
5. 選定後**必讀卡全文**與 demo 原始碼，把「已知坑」逐條抄進 SHOTLIST 該鏡的自檢欄。

**6.3 新增資訊型卡片**（自行設計、自行命名、自行實作，含 demo 與 gallery 樣片）

| 卡名（暫定） | 輸入 | 用途 |
|---|---|---|
| `page-scroll-read` | screenshot | 長截圖勻速上滾，講到關鍵段落減速停 1–2s |
| `page-anchor-tour` | screenshot | 長圖不動，相機依序停靠 `boxes.json` 的興趣點 |
| `loupe-peek` | screenshot / photo | 圓形放大鏡短暫看一眼即撤 |
| `marker-sweep` | screenshot / text | 螢光筆掃過一句，寬度隨詞錨推進 |
| `ink-circle-note` | screenshot / photo | 手繪圈注＋箭頭，釘在內容座標系隨滾動移動 |
| `stat-punch` | text | 大數字砸入落定＋單位小字，數字滾動到位 |
| `bar-grow-compare` | chart | 2–4 根長條依詞錨逐根生長 |
| `quote-plate` | text | 引言卡：來源名＋一句話，逐詞浮現 |
| `chapter-slate` | text | 章節卡，每章一色一個線稿 motif |
| `photo-drift-stack` | photo | 2–3 張照片錯位堆疊、極緩漂移 |
| `clip-frame-reveal` | video | 單支影片包主題邊框（框式擇一：紙相框／膠片邊／薄線框） |
| `source-strip` | text | 畫面底部來源條，配合證據鏡淡入淡出 |

每張卡照 repo 既有卡片規格寫（frontmatter、意圖、參數表、已知坑、參考實現路徑），demo 放 `demos/<slug>/`，過 `smoke-render-demos.py` 與 CI 的 tsc。

**6.4 蒙皮契約**
卡是中性 UI，進片前依本片風格檔改皮：顏色換 `theme.ts` token、字體、圓角、材質；**不改時序、緩動、幾何比例、層級**。風格檔從文章題材推導（財經／科技／旅遊／生活各給一組預設 token 表，放 `references/narration-mode.md` §風格檔）。

### ⑦ 實作
- 專案骨架由 `assets/scripts/scaffold-narration.mjs` 產生：`src/{Root,Main,timeline,theme,captions,audio,workbench}.ts(x)`、`src/scenes/`、`public/{vo,media,pages,sfx}`。
- `src/timeline.ts` 是唯一時間事實源：由 `shotlist.json` + `timing.json` 生成每鏡 `from/duration`，鏡長 = 段落末句 `end` − 首句 `start` + hold。
- `assets/lib/Subtitles.tsx`：整句硬現、無動效、無標點、位置與字級依畫幅表；關鍵詞高亮全片 ≤ 3 次。
- 相機：每鏡一條極緩縮放曲線，不做搖晃、旋轉、模糊。
- 音效：沿用 `assets/audio/`，每個主要入場配一記，音量 ≤ 0.35，比人聲低約 12dB，句間氣口才放轉場音；不用 ATTRIBUTION 標「無法反查」的檔案（§8）。
- BGM 退為墊底（≤ 0.15），不卡拍；`bgm` inputProp 可關，交付帶／不帶 BGM 兩版。
- 確定性渲染規則照 repo 既有。
- 首鏡先做：實作第一個有素材與字幕的鏡頭後出靜幀給使用者看，確認蒙皮、字幕、相機幅度後再做其餘鏡頭。

### ⑧ 自檢、匯出、終檢、交付
- 新寫 `assets/scripts/anchor-lint.py`：對照 `timing.json` 檢查 `shotlist.json` 每個 anchor 落點誤差 ≤ 0.1s、鏡尾保護帶 ≥ 0.5s、每鏡素材檔存在、manifest 授權欄非空。
- 靜幀：每鏡入／出／每個錨點各一張，拼成 overview 給使用者。
- 使用者說匯出 → 整片渲染兩版 → 抽音軌實測字幕偏移 → 派全新上下文 subagent 依 `references/final-review.md` 終檢（新增口播專屬檢核：字幕與人聲同步、數字與 `facts.md` 一致、每鏡素材來源在 manifest 內）。
- 交付物：`out/final.mp4`、`out/final-nobgm.mp4`、`out/CREDITS.md`（§4.5）、`assets/manifest.json`、`sources/facts.md`；然後開工作台，最後才提一次剪映匯出。

---

## 4. `SKILL.md` 與文件變更

- `SKILL.md`：模式判斷段加入口播模式與觸發條件；「四種用法」改「五種」；「何時讀哪個文件」加一列 → `references/narration-mode.md`。
- 新增 `references/narration-mode.md`：流程全文、分鏡檢核表、選卡程序、風格檔表、直式／橫式版面表。
- 新增 `references/sequences/narration-news-arc.md`。
- 更新 `assets/audio/ATTRIBUTION.md` 的「無法反查」條目處置（見 §8）。
- README 三語加一段口播模式簡介。

---

## 5. 新增檔案清單

```
assets/scripts/fetch-article.mjs        ⓪ 抓正文＋全頁截圖＋頭圖
assets/scripts/tts-minimax.py           ② 逐句合成＋拼接＋vo-map
assets/scripts/align.py                 ③ 逐字時間戳
assets/scripts/source-media.mjs         ④ 多源素材採集＋manifest＋--check
assets/scripts/capture-page.mjs         ④ 網頁長圖＋DOM 座標（可從 capture-template.mjs 抽共用）
assets/scripts/scaffold-narration.mjs   ⑦ 專案骨架
assets/scripts/anchor-lint.py           ⑧ 詞錨與素材檢查
assets/lib/timing.ts                    tLine / tChar / tWord / f
assets/lib/Subtitles.tsx                口播字幕
assets/lib/SlowPush.tsx                 每鏡極緩縮放相機
assets/lib/SourceStrip.tsx              來源條
references/narration-mode.md
references/sequences/narration-news-arc.md
references/shots/narration/<12 張新卡>.md
demos/<12 張新卡>/
docs/narration-mode-spec.md             本文件
```

---

## 6. 專案目錄慣例（每支口播片）

```
<project>/
  sources/   article.md facts.md rights.md page-*.png
  script/    lines.json
  audio/     line-*.mp3 vo.wav vo-map.json timing.json
  assets/    manifest.json candidates/ pages/
  SHOTLIST.md
  src/       Root.tsx Main.tsx timeline.ts theme.ts shotlist.json captions.json audio.tsx workbench.ts scenes/
  public/    vo/ media/ pages/ sfx/ bgm/
  out/       qa/ final.mp4 final-nobgm.mp4
```

---

## 7. 依賴與授權白名單

| 依賴 | 授權 | 備註 |
|---|---|---|
| Remotion | 自有授權 | 個人與 ≤3 人公司免費，否則買公司授權；唯一可能付費項 |
| sherpa-onnx | Apache-2.0 | ASR runtime |
| ASR 模型 | 實作者確認模型卡授權為 Apache-2.0 / MIT / CC0 之一才採用，寫進 `narration-mode.md`；不確定就用 Whisper 權重（MIT） |
| faster-whisper | MIT | 備援 |
| zhconv、pypinyin、soundfile、numpy | MIT / BSD | 對齊用 |
| Playwright | Apache-2.0 | 抓頁與截圖 |
| lucide icons | ISC | 若做線稿圖示；redistribution 需保留 ISC 聲明於 repo（不影響影片） |
| Mixkit SFX / Music | Mixkit Free License | 免署名商用 |
| Pexels / Pixabay / Openverse(CC0, PDM) | 各自免署名商用 | 見 §④ |
| Unsplash API | Unsplash License + API Guidelines | 可商用；**發佈時需標註**，由 `out/CREDITS.md` 自動產出；選用時須呼叫 download 端點 |
| MiniMax TTS | 依使用者帳號條款 | 實作者在文件中提醒使用者自行確認輸出音檔商用條款 |

---

## 8. 既有素材清理（實作第一步就做）

`assets/audio/ATTRIBUTION.md` 標「無法反查，商用前須確認」的 6 個 SFX（keyboard、pop、riser-cine、sparkle、whoosh-big 與其餘標記者）與 1 首 BGM（bgm-tech-house）：從 `assets/audio/` 刪除，用同目錄有 URL 的 Mixkit 素材替代，並更新 `sound-design.md` 的清單與 `template/` 內引用。口播模式與其他模式一併受益。

---

## 9. 實作順序與驗證

| 階段 | 內容 | 驗證 |
|---|---|---|
| P1 | §8 素材清理；`align.py` + `timing.ts` + `Subtitles.tsx`；`tts-minimax.py` | 用台大新聞專案的稿與配音重跑：`timing.json` 每句 match ≥ 0.9；字幕靜幀與現有 v1 對照無偏差 |
| P2 | `fetch-article.mjs`、`source-media.mjs`、`capture-page.mjs`、manifest | 對青森文章跑一次：每段至少一筆候選、manifest 每筆有 URL 與授權、`--check` PASS |
| P3 | `narration-mode.md`、news-arc、SKILL.md 分流、風格檔表 | 新 session 只給網址即可走完 ⓪–⑤ 產出 SHOTLIST |
| P4 | 12 張新卡（先做 page-scroll-read、stat-punch、marker-sweep、clip-frame-reveal、chapter-slate，其餘後補）；既有卡 frontmatter 標記；gallery 索引更新 | `npm test`、smoke render、CI 綠；gallery 可篩 `narration` |
| P5 | `scaffold-narration.mjs`、`SlowPush.tsx`、`anchor-lint.py`、final-review 口播檢核 | 台大新聞全流程重做到靜幀；使用者確認後匯出並終檢 |

每階段結束 commit；P1–P3 可平行給不同 subagent，P4 卡片可逐張平行。

---

## 10. 未決事項（實作者遇到再問使用者）

1. 逐句合成的句間氣口 0.35s 是否符合聽感；使用者可能偏好更短。
2. 直式片是否需要「人物角標」支援（使用者自錄或數位人素材）——v1 不做，保留 `host` 欄位。
3. ~~新聞頭圖的使用界線~~：已決定（2026-09-18）——可直接使用，規則見 ⓪。
4. Openverse 是否值得接（品質參差）；若 Pexels + Pixabay 覆蓋率已夠，P2 可先不做。
