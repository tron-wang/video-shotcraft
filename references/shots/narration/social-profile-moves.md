---
name: social-profile-moves
一句话: 社群数据三款——X 个人页卡片弹入、游标按「追蹤」后数字 +1；X 新追踪者通知翻名 + 追踪者数里程表滚到终值、细金环到站；GitHub repo 卡按 Star、星数与成长曲线同步爬升、stargazers 头像滑入
适用: 新闻口播里讲「某帐号」「追踪者暴增」「这个开源专案爆红」的那一镜；人物 / 帐号介绍、社群声量佐证
时长: X 个人页 6s（180f）；X 追踪者 6s（180f）；GitHub 星数 7s（210f）
能量: 中（弹入 → 一个动作 / 一段计数 → 到站）
input: [text, photo]
narration: evidence
---

## 意图
讲到社群帐号或开源专案时，只贴一张截图太静、数字也不会动；这张卡把社群介面重建成可以动的版本：卡片弹入、游标按一下、数字像里程表滚到真实的终值。介面重现 X / GitHub 的版型与配色，观众一眼认得是哪个平台。
（2026-09 收入：参考 remocn「x-follow-card」「x-followers-overview」「github-stars」的动效——remocn 为 MIT 授权；程式为本卡自写。使用者要求社群介面要留。**不放官方 logo 图档**。）

## 三种款式
| 款 | 做法 | 用在哪 |
|---|---|---|
| `x-follow-card` | X 深色个人页卡（宽 860，与 X 截图卡同宽留白）上浮 + 由糊变清，各层错开依序清晰；游标滑到「追蹤」按下 → 变「正在追蹤」、金环漾开、追踪者数里程表 +1（染金）；之后极缓推近 | 介绍一个帐号是谁 |
| `x-followers-overview` | 上方「新追踪者」通知：头像一个个叠进来、名字 rotateX 翻页牌换人（节拍跟计数同步）；下方大数字「位追蹤者」里程表滚到终值 → 染金 + 细金环与短金芒（不用彩带）+ 增量标签 | 「追踪者暴增」「一週涨了 N 人」 |
| `github-stars` | GitHub repo 卡浮入，游标按 Star → 星星填金、变 Starred；大数字与金色成长曲线同一进度爬升（数字跟曲线高度走），stargazers 头像由右滑入 | 开源专案爆红、星数破 N |

## 动效核心
- 共用里程表 `Odometer`（SocialKit.tsx）：每一位只在个位小数走到最后 30% 时滚一格（高位还要下面各位都是 9），快速计数时多数帧是完整数字；前导零不占位，进位滚进来时宽度一起长
- 进场一律「上浮 + 模糊变清晰」（`blurRise`），层与层错开 3–4 帧
- 游标：从右下以 `easeInOutCubic` 走一小段弧到按钮，按下时钮缩 0.93–0.95
- 全程极缓推近 1 → 1.03（`easeInOutSine`），不停在静帧

## 参数表
| 款 / 参数 | 典型值 | 调节手感 |
|------|--------|----------|
| X 个人页 `name` / `handle` / `bio` / `meta` / `following` / `followers` / `verified` | 真实帐号资料 | `avatar` / `banner` 给真实图（`<Img>`）；不给是首字母头像与黑金横幅 |
| X 个人页 `clickAt` | 72；`null` = 不按追踪 | |
| X 追踪者 `names` / `from` / `to` / `caption` | 4–8 个名字；真实数字 | 名字是公开的新追踪者（或用「匿名」式泛称）；`caption` 写增量与期间 |
| X 追踪者 `countFrom` / `countTo` | 30 / 132 | 计数太短数字糊、太长拖 |
| GitHub `owner` / `repo` / `description` / `language` / `from` / `to` | 真实 repo | 数字以 repo 页或 star-history 为准 |
| GitHub `curve` / `curveLabels` | 真实星数历史的相对值；「1 月」「9 月」 | 不给用先缓后陡的示意曲线——**成片要给真实曲线** |
| GitHub `stargazers` / `clickAt` | 6–10 个 / 40 | |

## 已知坑
- **资料必须真实**：帐号名称、简介、数字、曲线都要能查证；**不要为真人捏造个人页或数字**。demo 全是虚构帐号（「夜間課程研究室」「nightclass / schedule-kit」）
- **不放官方 logo 图档**；X 蓝勾只在真实帐号有认证时才开 `verified`
- 追踪者数要写完整数字（38,214），不要写成 38.2K——里程表 +1 才看得出来
- 直式画幅：X 两款置中；GitHub 款曲线较高、stargazers 在曲线下方

## 参考实现
demos/narration/social-profile-moves/XFollowCard.tsx（`XFollowCardShot`，`X_FOLLOW_CARD_DURATION` = 180）
demos/narration/social-profile-moves/XFollowersOverview.tsx（`XFollowersOverviewShot`，`X_FOLLOWERS_OVERVIEW_DURATION` = 180）
demos/narration/social-profile-moves/GithubStars.tsx（`GithubStarsShot`，`GITHUB_STARS_DURATION` = 210）
demos/narration/social-profile-moves/SocialKit.tsx（共用：`Odometer` / `Cursor` / `InitialAvatar` / `blurRise` / 缓动）
