# 镜头卡来源与授权说明（2026-08 新增 48 张）

本批 48 张镜头卡的动效手法研究自公开发布的产品宣传片与开源项目主页。
**所有实现均为从零重写**（re-implemented from scratch）：仓库不包含任何
原片片段、截图、美术资产或品牌元素；实现中的文案、配色、UI 内容均为
中性占位模板。原作者未参与本项目，卡片标注来源仅为致敬与研究溯源
（"仅参考、重新实现"）。

## 法律边界（重要）

- 抽象的动效**手法/技法**（时序结构、缓动思路、编排逻辑）一般属于
  方法与创意范畴；但**具体表达**（原片的画面、美术、文案、品牌元素、
  可辨识的整体视听呈现）受版权与商标等权利保护。本项目只研究前者，
  并通过全部重写、去品牌化、占位化来避免复制后者。
- 来源作品"公开发布"**不等于**授予复刻或衍生的许可。本表记录的是研究
  溯源，不是授权凭证；对未获明确许可的来源，我们依赖的是"手法参考 +
  独立重写、无原素材"这一实践，而非任何来自权利人的授权。
- 若任何权利人认为某张卡的实现仍构成对其具体表达的复制，请提 issue，
  我们将及时调整或移除相应内容与标注。

## 来源清单

注：下表按**研究批次**记录来源（一个批次对应一支参考片或一个参考站点，
覆盖该批次衍生的若干张卡）；卡片文件本身不携带来源标注，逐卡归属见文末
「逐卡来源映射」附表。

| 研究批次 | 来源 | 类型 | 状态 |
|---|---|---|---|
| anime.js | https://animejs.com/ 官网演示（GitHub: juliangarnier/anime） | 开源项目主页（MIT 项目；官网演示的美术呈现版权归作者） | 手法参考，重新实现；未使用其代码或美术 |
| remotion-bits.dev | https://remotion-bits.dev/ | 开源示例集 | 手法参考，重新实现；未使用其代码 |
| x.com/amirdzm | X 公开发布的 motion 作品两支（约 13s "Storyboard → Result" 等） | 个人作品（公开发布，未获复刻许可） | 手法参考，重新实现；无原素材 |
| x.com/1amanly | X 公开发布的 motion 作品 | 同上 | 同上 |
| x.com/Jerrythe2d | X 公开发布的 motion 作品（约 84s） | 同上 | 同上 |
| x.com/bohdanmotion | X 公开发布的 motion 作品（约 26s） | 同上 | 同上 |
| x.com/thiswillblossom | X 公开发布的 SaaS 概念广告（约 2.1s 四宫格） | 同上 | 同上 |
| x.com/tvnxty | Firecrawl 品牌/产品宣传片（约 66s，公开发布） | 商业宣传片（公开发布，未获复刻许可） | 手法参考，重新实现；无原素材 |
| x.com/shapelayer | X 公开发布的 motion 作品（约 11.6s） | 同上 | 同上 |
| x.com/aizal_mp4（个别卡） | Willow Voice 产品宣传片（动效设计师 aizal 作品，约 41s） | 商业宣传片（公开发布，未获复刻许可） | 手法参考，重新实现；无原素材 |
| 抖音 观机社（dy09） | 抖音账号"观机社"发布的荣耀 AI 概念片剪辑（约 22.6s） | 转载剪辑；底层为品牌向概念内容（涉及荣耀/Honor 品牌元素） | 手法参考，重新实现；品牌字标已替换为中性占位词 |
| 抖音 江经怜（dy08，个别卡） | 抖音账号"江经怜"公开发布的作品（约 19.4s 竖屏） | 个人作品（公开发布，未获复刻许可） | 手法参考，重新实现；无原素材 |
| reference/brand-scan | 用户提供的参考图定制 | 内部需求 | 原创实现 |

> 已知精确度限制：X / 抖音来源当时以账号主页为单位记录，未逐条留存
> 具体帖子 URL（原片仅在研究期间本地留存，未入库）。表中已尽量补充
> 可辨识作品的时长与内容描述；如需逐条溯源可据此在对应账号检索。

## 逐卡来源映射

48 张卡与研究批次的对应关系（来自研究期的原片时段映射记录）：

| 来源 | 卡片 |
|---|---|
| remotion.dev Elements（map-flyover、audio/oscilloscope）、remotionui.com（map-flight）——仅参考动效，程式为本库自写 | `map-flyover`、`audio-oscilloscope` |
| remocn（github.com/Remocn/remocn，MIT 授权）的 terminal-cursor-zoom、search-reveal、claude-chat / chat-gpt / claude-code、x-follow-card / x-followers-overview / github-stars——仅参考动效，程式为本库自写 | `cursor-follow-typing`、`search-reveal`、`ai-prompt-composer`、`social-profile-moves` |
| anime.js 官网演示 | `radial-wave`、`scramble`、`svg-shape-morph`、`value-stagger-gradient` |
| remotion-bits.dev | `basic-3d-scene`、`blur-slide`、`card-stack`、`carousel-3d`、`counter-confetti`、`cube-navigation`、`cursor-flyover`、`flying-words`、`fracture`、`glitch-cycle`、`gradient-transition`、`list-reveal`、`mosaic-reframe`、`terminal-3d`、`typing-code-block` |
| x.com/1amanly | `avatar-bracket-carousel`、`countdown-arc-scatter`、`floating-glossy-label-pills`、`pill-chip-slot-cycle-handled`、`radial-ripple-phone-chips` |
| x.com/Jerrythe2d | `avatar-grid-radial-build-colorize`、`bezier-source-converge-merge`、`chip-grid-single-select-blackout`、`chip-lift-to-user-pill`、`doc-park-left-pill-deal`、`picker-carousel-feature-cycle`、`scan-bracket-sweep`、`vertical-word-roll-blur-cycle` |
| x.com/aizal_mp4（Willow Voice） | `aurora-bloom-bg-flip`、`glass-pill-dictation-typing` |
| x.com/amirdzm（作品 a） | `brace-expand`、`grain-dissolve` |
| x.com/amirdzm（作品 b） | `hatch-depth` |
| x.com/bohdanmotion | `outline-word-fill`、`word-relay-geometry` |
| x.com/shapelayer | `dashboard-glow-highlight-pill` |
| x.com/thiswillblossom | `quad-split-parallel-scenes` |
| x.com/tvnxty（Firecrawl 宣传片） | `product-card-progressive-assemble`、`research-card-stack-scroll` |
| 抖音 观机社 | `logo-shrink-wordmark-lockup`、`white-flash-logo-simplify-cut` |
| 用户参考图定制（brand-scan） | `assemble-then-type-flyin`、`scanline-annotate-focus`、`scanline-assemble-flyin` |

---

# 2026-09 新增 4 张（vibe-motion/skills 手法参考）

同样遵循"仅参考、重新实现"：四张卡的 demo 均为从零重写的自包含 Remotion 组件，
未复制来源仓库的代码、素材、截图或数据。来源仓库在研究时（2026-09-16，GitHub API
查询）**均未声明开源许可证**，因此这里记录的只是手法溯源，不代表获得了任何授权。

| 研究批次 | 来源 | 类型 | 状态 |
|---|---|---|---|
| vibe-motion/skills | https://github.com/vibe-motion/skills 及其 skill 引用的 vibe-motion/fisheye-motion、vibe-motion/threejs-earth、sxhzju/wechat-2d | 开源 skill 集合（未声明许可证） | 手法参考，重新实现；未使用其代码或素材 |
| world-atlas / Natural Earth | https://github.com/topojson/world-atlas（ISC）← Natural Earth 1:110m 陆地数据（公有领域） | 地理数据 | `globe-route-flight` 的 1.5° 陆地掩码由 land-110m 栅格化得到 |

逐卡说明：

| 来源 | 卡片 | 与来源的差异 |
|---|---|---|
| vibe-motion/skills `fisheye-motion` | `screen-photo-fisheye-focus` | 来源是 WebGL shader + 畸变中心随聚焦点移动；本卡改为 Canvas 2D 逐像素、光轴钉画面中心平移取景点。桶形畸变、双扫描线拍频摩尔纹、暗角的公式结构与起始参数值参考了来源的默认值 |
| vibe-motion/skills `threejs-earth-render` | `globe-route-flight` | 来源是 three.js 贴图地球 + Puppeteer 抓帧；本卡改为正交投影点阵地球（无 three.js），新增镜头偏离大圆、航线领跑镜头追随、一条曲线管推拉 |
| vibe-motion/skills `wechat-2d-render` | `chat-bubble-thread` | 来源是微信风格聊天 + 视频消息；本卡去品牌化，新增正在输入三点提示、输入框打字发送、富卡片次级动作、无状态滚动累加 |
| vibe-motion/skills `remotion-candlestick` | `candlestick-grow-rescale` | 来源是 Yahoo Finance 真实数据 + Canvas 逐帧绘制；本卡改为确定性占位数据 + SVG，实体改为从开盘价长向收盘价，新增无状态 y 轴平滑与最新价标签 |

---

# 2026-09 新增 1 张（Codrops 专访 Resn 的示范影片手法参考）

同样遵循"仅参考、重新实现"：demo 为从零重写的自包含 Remotion 组件，只研究动效手法
（时序、缓动、编排），未使用原片的任何画面、海报设计、文案或品牌元素；示例海报全部是
中性占位设计。原片是商业项目的公开展示，**未获复刻许可**。

| 研究批次 | 来源 | 类型 | 状态 |
|---|---|---|---|
| Codrops · Inside Resn's Digital Experiences | https://tympanus.net/codrops/2026/09/14/inside-resns-digital-experiences/ 文中嵌入的示范影片 `Awwwards_SquareSpace_1.mp4`（约 8.6s，Resn 为 Squarespace 制作的品牌指南站 https://brand.squarespace.com/ 的海报陈列段落） | 商业项目展示（公开发布，未获复刻许可） | 手法参考，重新实现；无原素材 |

逐卡说明：

| 来源 | 卡片 | 与来源的差异 |
|---|---|---|
| Resn × Squarespace Foundations 海报陈列 | `iso-poster-stack-cycle` | 来源是网页里的交互陈列（真实活动海报）；本卡改为逐帧确定性的视频镜头：6 张中性占位海报、固定拍长无缝循环、槽位由帧直接推出，新增后排逐槽晚起步、淡出提前 3f 且与朝镜头滑移分用两条曲线、逐槽压暗的参数化 |

## 官方标志（商标）
`demos/_fixtures/BrandMarks.tsx` 里的 Claude、OpenAI、X、GitHub 标志路径取自 Wikimedia Commons 上的官方 SVG（Claude_AI_symbol.svg、OpenAI_logo_2025_(symbol).svg、X_logo_2023.svg、Octicons-mark-github.svg）。商标属于各公司，本库只在新闻 / 评论画面里用来指认产品。
