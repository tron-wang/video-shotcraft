// 来源条：用到文章图片或网页截图的证据镜，画面内必须标出处（narration-mode.md ⓪④）。
// 靠左下——直式片右缘是社群平台按钮区。淡入淡出各 8 帧，不做位移动画。
import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

export const SourceStrip: React.FC<{
  /** 媒体短名（sources/article.md 的 source_label）。 */
  label: string;
  /** 「圖片來源」「來源」「Source」等前缀。 */
  prefix?: string;
  /** 本条在所属 Sequence 内的显示长度（帧）。 */
  duration: number;
  color?: string;
  plate?: string;
  accent?: string;
  fontFamily?: string;
  /** 整条最大宽度（px）。直式预设 820：右缘停在 x=880，不进平台按钮区。超出只截 label，结尾省略号。 */
  maxWidth?: number;
}> = ({
  label,
  prefix = '來源',
  duration,
  color = '#f2f0ea',
  plate = 'rgba(16,18,22,0.78)',
  accent = '#e0b04b',
  fontFamily = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif',
  maxWidth,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
  const opacity = Math.min(
    interpolate(frame, [0, 8], [0, 1], clamp),
    interpolate(frame, [duration - 8, duration], [1, 0], clamp),
  );
  return (
    <div
      style={{
        position: 'absolute',
        left: portrait ? 60 : 120,
        top: portrait ? 1630 : 1000,
        display: 'flex',
        maxWidth: maxWidth ?? (portrait ? 820 : 900),
        boxSizing: 'border-box',
        alignItems: 'center',
        gap: 14,
        padding: portrait ? '12px 22px' : '10px 20px',
        borderRadius: 10,
        background: plate,
        color,
        fontFamily,
        fontSize: portrait ? 30 : 26,
        fontWeight: 500,
        letterSpacing: '0.02em',
        opacity,
        pointerEvents: 'none',
      }}
    >
      <span style={{ flex: 'none', width: 6, height: portrait ? 30 : 26, borderRadius: 3, background: accent }} />
      <span style={{ flex: 'none', opacity: 0.72 }}>{prefix}</span>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
};
