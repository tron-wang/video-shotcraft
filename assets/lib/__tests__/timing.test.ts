// Unit tests for assets/lib/timing.ts（口播模式时间查询，纯函数）。

import { describe, it, expect } from 'vitest';
import { buildCues, createTiming, type Timing } from '../timing';

// 每字 0.2s 的合成数据；标点零时长，钉在前一字尾端。
const mk = (i: number, text: string, t0: number) => {
  let t = t0;
  const chars = [...text].map((c) => {
    const dur = /[，。 ]/.test(c) ? 0 : 0.2;
    const ch = { c, start: +t.toFixed(3), end: +(t + dur).toFixed(3) };
    t += dur;
    return ch;
  });
  return { i, text, start: t0, end: +t.toFixed(3), match: 1, needs_review: false, chars };
};

const data: Timing = {
  fps: 30,
  total: 20,
  lines: [mk(1, '排隊影片在 Threads 上，不到一天。', 1), mk(2, '排隊的人，還在排隊。', 8)],
};
const { tLine, tLineEnd, tChar, tWord, tWordEnd, f } = createTiming(data);

describe('createTiming', () => {
  it('tLine / tLineEnd', () => {
    expect(tLine(1)).toBe(1);
    expect(tLineEnd(2)).toBeCloseTo(8 + 8 * 0.2);
  });

  it('tChar 支持负下标，越界抛错', () => {
    expect(tChar(1, 0)).toBe(1);
    expect(tChar(2, -2)).toBeCloseTo(8 + 7 * 0.2);
    expect(() => tChar(1, 99)).toThrow();
  });

  it('tWord 找第 n 次出现，含拉丁词', () => {
    expect(tWord(1, 'Threads')).toBeCloseTo(1 + 5 * 0.2);
    expect(tWord(2, '排隊')).toBe(8);
    expect(tWord(2, '排隊', 2)).toBeCloseTo(8 + 6 * 0.2);
    expect(tWordEnd(2, '排隊')).toBeCloseTo(8.4);
  });

  it('词或句不存在时抛错而不是给错时间', () => {
    expect(() => tWord(1, '不存在')).toThrow(/找不到/);
    expect(() => tWord(2, '排隊', 3)).toThrow();
    expect(() => tLine(9)).toThrow();
  });

  it('chars 与 text 不是 1:1 时抛错', () => {
    const bad = createTiming({ ...data, lines: [{ ...data.lines[0], chars: data.lines[0].chars.slice(1) }] });
    expect(() => bad.tLine(1)).toThrow(/1:1/);
  });

  it('f 换算帧', () => {
    expect(f(1)).toBe(30);
    expect(f(0.05)).toBe(2);
  });
});

describe('buildCues', () => {
  it('按标点切、去标点、句内 cue 首尾相接', () => {
    const cues = buildCues(data, 16);
    expect(cues.map((c) => c.text)).toEqual(['排隊影片在 Threads 上', '不到一天', '排隊的人還在排隊']);
    expect(cues[0].end).toBe(cues[1].start);
    expect(cues.every((c) => !/[，。]/.test(c.text))).toBe(true);
  });

  it('短片语在 maxChars 内合并', () => {
    expect(buildCues(data, 40).map((c) => c.text)).toEqual(['排隊影片在 Threads 上不到一天', '排隊的人還在排隊']);
  });

  it('超长片语拆分但不切开拉丁词', () => {
    const texts = buildCues(data, 8).map((c) => c.text);
    expect(texts.some((t) => t.includes('Threads'))).toBe(true);
    expect(texts.join('').replace(/ /g, '')).toBe('排隊影片在Threads上不到一天排隊的人還在排隊');
  });

  it('句末 hold 不盖到下一句', () => {
    const tight: Timing = { ...data, lines: [mk(1, '第一句。', 0), mk(2, '第二句。', 0.7)] };
    const cues = buildCues(tight, 12, 0.5);
    expect(cues[0].end).toBe(0.7);
  });
});
