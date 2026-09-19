// ai-prompt-composer 的「Claude 网页对话」款：暖深灰底、陶土橘强调、衬线问候语与回答、方形送出钮。
// 只重现版型与配色，不放官方 logo 图档；产品名以文字标签呈现。动效与通用款相同（AiPromptComposerShot skin="claude"）。
import React from 'react';
import { AiPromptComposerShot, AI_PROMPT_COMPOSER_DURATION, DEMO_ANSWER, DEMO_PROMPT } from './AiPromptComposer';

export const AI_CHAT_CLAUDE_DURATION = AI_PROMPT_COMPOSER_DURATION;
export const AiChatClaude: React.FC = () => <AiPromptComposerShot skin="claude" prompt={DEMO_PROMPT} answer={DEMO_ANSWER} />;
