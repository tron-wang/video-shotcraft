// 口播字幕：整句硬现、无动效、无标点；时间全部来自 timing.json（align.py 产出）。
// 位置与字级按画幅表取值；关键词高亮全片 ≤ 3 次（超过直接抛错，逼你取舍）。
import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { buildCues, type Timing } from './timing';

/** 画幅表。直式右缘是社群平台按钮区，字幕块收窄并居中；y≈1480 在主内容（150–1420）之下。 */
const LAYOUT = {
  portrait: { top: 1480, fontSize: 52, maxWidth: 900, maxChars: 16 },
  landscape: { top: 930, fontSize: 46, maxWidth: 1500, maxChars: 26 },
} as const;

export type SubtitleHighlight = { line: number; word: string };

export const Subtitles: React.FC<{
  timing: Timing;
  /** 配音在合成里的起始帧（vo 轨不从 0 帧开始时用）。 */
  offset?: number;
  highlights?: SubtitleHighlight[];
  color?: string;
  accent?: string;
  plate?: string;
  fontFamily?: string;
  /** 覆盖画幅表的 y（px）。 */
  top?: number;
}> = ({
  timing,
  offset = 0,
  highlights = [],
  color = '#ffffff',
  accent = '#ffd34d',
  plate = 'rgba(18,18,18,0.82)',
  fontFamily = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif',
  top,
}) => {
  if (highlights.length > 3) {
    throw new Error(`Subtitles: 关键词高亮全片最多 3 次，现在给了 ${highlights.length} 次`);
  }
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const L = width < height ? LAYOUT.portrait : LAYOUT.landscape;

  const cues = useMemo(
    () =>
      buildCues(timing, L.maxChars).map((c) => ({
        ...c,
        from: offset + Math.round(c.start * fps),
        to: offset + Math.round(c.end * fps),
      })),
    [timing, L.maxChars, offset, fps],
  );

  const cue = cues.find((c) => frame >= c.from && frame < c.to);
  if (!cue) return null;

  const hit = highlights.find((h) => h.line === cue.line && cue.text.includes(h.word));
  const at = hit ? cue.text.indexOf(hit.word) : -1;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: top ?? L.top, display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            maxWidth: L.maxWidth,
            padding: '14px 30px',
            borderRadius: 16,
            background: plate,
            color,
            fontFamily,
            fontWeight: 600,
            fontSize: L.fontSize,
            lineHeight: 1.3,
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          {hit ? (
            <>
              {cue.text.slice(0, at)}
              <span style={{ color: accent }}>{hit.word}</span>
              {cue.text.slice(at + hit.word.length)}
            </>
          ) : (
            cue.text
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
