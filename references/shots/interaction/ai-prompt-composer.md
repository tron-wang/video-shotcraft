---
name: ai-prompt-composer
一句话: AI 对话框问答——问候语与输入框浮现，提问逐字打入（一有字，麦克风钮就形变成送出钮），送出后提问飞上去变成使用者气泡，回答先闪骨架条、再逐字串流；通用黑金款之外有 Claude 对话、ChatGPT 对话、Claude Code 终端机三款介面
适用: AI 新闻口播里「有人问 AI…」「AI 这样回答」「用 AI 整理重点」的那一镜；教学类「怎么问 AI」
时长: 约 8s（demo 240f；终端机款 270f）；只做到送出为止约 3s
能量: 中（打字 → 送出 → 串流，一问一答的完整节拍）
input: [text]
narration: quote
---

## 意图
AI 题材的影片常需要演出「问 AI 一个问题、它回答」。通用款是黑金的 AI 对话介面，观众一看就懂「这是在问 AI」但不指向特定产品；新闻明确在讲某个产品时（「有人问 ChatGPT…」「Claude Code 自己跑了统计」），改用该产品的介面款，观众一眼认得是哪家。
（2026-09 收入：参考 remocn「claude-chat」「chat-gpt」「claude-code」的动效——remocn 为 MIT 授权；程式为本卡自写。使用者要求 AI 公司的对话介面也要留，于是加了三个产品介面款：重现版型、配色与字体气质，并带该产品的官方标志（使用者确认可以放；向量，`demos/_fixtures/BrandMarks.tsx`，`logo={false}` 可关）。）

## 四种款式
| 款 | 做法 | 用在哪 |
|---|---|---|
| `ai-prompt-composer`（通用，预设） | 黑金：深底、金色描边药丸输入框、金色送出钮、「AI 助理」标签 | 没指名哪个产品、或多家 AI 一起讲 |
| `ai-chat-claude` | `skin="claude"`：暖深灰底、陶土橘强调、衬线问候语与回答、方框输入 + 方形送出钮、✻ 标签 | 新闻明确讲 Claude 网页版 |
| `ai-chat-chatgpt` | `skin="chatgpt"`：中性深灰底、药丸输入框、白色圆形送出钮、下方建议标签（打字时淡出；预设 `typeAt` 48） | 新闻明确讲 ChatGPT |
| `ai-terminal-claude-code` | 另一个元件 `AiTerminalClaudeCodeShot`：终端机视窗、陶土橘欢迎框画出、输入框打字 → Enter → 「✻ Thinking…」星芒轮转 → 工具呼叫（⏺ Read(…) / ⎿ 结果）→ 回答串流 | 讲 AI 写程式 / AI 代理自己跑工具 |

## 动效核心
- 0–16 帧：问候语与输入框浮现（`easeOutCubic`）；输入框前闪烁游标
- `typeAt` 起逐字打入提问；一有字，右侧麦克风钮即时形变成金色「↑」送出钮
- 打完 10 帧按下送出（钮缩 0.9）；接着 18 帧内输入框文字上移成右侧使用者气泡、问候语淡出、输入框清空下移
- 送出后 26 帧回答区出现：「AI 助理」标签（旋转的金色圆点）→ 三条骨架条闪光约 12 帧 → 回答逐字串流（`answerCharsPerFrame`），串流中尾端有金色圆点

## 参数表
| 参数 | 典型值 | 调节手感 |
|------|--------|----------|
| `prompt` | 一句问题（≤ 30 字） | 太长输入框会裁切 |
| `answer` | 2–4 行（`\n` 分行）；空字串 = 只做到送出 | 回答内容必须真实（真的问过、或新闻引述的内容） |
| `framesPerChar` / `answerCharsPerFrame` | 2 / 1.2 | 回答太快观众读不完 |
| `skin` | neutral / claude / chatgpt | 见「四种款式」 |
| `assistantLabel` | 各款预设（「AI 助理」/「Claude」/「ChatGPT」） | 产品款旁边带官方标志 |
| `greeting` / `placeholder` | 「今天想問什麼？」 | |

## 已知坑
- **官方标志只用来指认产品**：Claude 款左上与回答标签是 Claude 标志、ChatGPT 款是 OpenAI 标志、终端机款标题列是 Claude 标志；不改形、不变色，不要让画面像官方发布；通用款永远不带品牌
- **产品介面款只用在新闻真的在讲那个产品时**：没指名就用通用款，别让观众以为是某家的回答
- **回答要真实**：新闻里引用的 AI 回答必须是真的；示意用途时在画面标「示意」
- 横式画幅输入框位于画面 62% 高度，回答区从 20% 高度往下长；回答超过 4 行会压到输入框

## 参考实现
demos/interaction/ai-prompt-composer/AiPromptComposer.tsx（导出 `AiPromptComposerShot`（`skin`: neutral / claude / chatgpt）/ `AiPromptComposerProps` / `AI_PROMPT_COMPOSER_DURATION`；demo = 「幫我整理今年夜間課程報名的三個重點」+ 三行回答）
demos/interaction/ai-prompt-composer/AiChatClaude.tsx、AiChatChatgpt.tsx（两个介面款的 demo）
demos/interaction/ai-prompt-composer/AiTerminalClaudeCode.tsx（导出 `AiTerminalClaudeCodeShot`：`prompt` / `answer` / `tools`（`{name, arg, result}[]`，0–3 条）/ `cwd` / `title`；`AI_TERMINAL_CLAUDE_CODE_DURATION` = 270）
