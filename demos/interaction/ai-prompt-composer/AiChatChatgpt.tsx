// ai-prompt-composer 的「ChatGPT 对话」款：中性深灰底、药丸输入框、白色圆形送出钮、输入框下方建议标签（打字时淡出）。
// 只重现版型与配色，不放官方 logo 图档；产品名以文字标签呈现。动效与通用款相同（AiPromptComposerShot skin="chatgpt"）。
import React from 'react';
import { AiPromptComposerShot, AI_PROMPT_COMPOSER_DURATION, DEMO_ANSWER, DEMO_PROMPT } from './AiPromptComposer';

export const AI_CHAT_CHATGPT_DURATION = AI_PROMPT_COMPOSER_DURATION;
export const AiChatChatgpt: React.FC = () => <AiPromptComposerShot skin="chatgpt" prompt={DEMO_PROMPT} answer={DEMO_ANSWER} />;
