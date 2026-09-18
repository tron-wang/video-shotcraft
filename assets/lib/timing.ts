// 口播模式的时间查询：所有动效起点只能由这里的函数产生，禁止手敲秒数。
// 数据来自 assets/scripts/align.py 产出的 audio/timing.json（chars 与 text 逐字符 1:1）。
//
//   import data from './timing.json';
//   export const { tLine, tChar, tWord, f } = createTiming(data);
//   const at = f(tWord(2, '十二點四萬'));   // 第 2 句讲到这个词的那一帧

export type TimingChar = { c: string; start: number; end: number };
export type TimingLine = {
  i: number;
  text: string;
  start: number;
  end: number;
  match: number;
  needs_review: boolean;
  chars: TimingChar[];
};
export type Timing = { fps: number; total: number; lines: TimingLine[] };

export type Cue = { line: number; text: string; start: number; end: number };

const PUNCT = /[\s，。、；：？！,.;:?!「」『』（）()《》〈〉—…·"'“”‘’]/;
const isPunct = (c: string) => PUNCT.test(c);
const isLatin = (c: string) => /[A-Za-z0-9]/.test(c);

export const createTiming = (data: Timing) => {
  const byId = new Map(data.lines.map((l) => [l.i, l]));

  const line = (i: number): TimingLine => {
    const l = byId.get(i);
    if (!l) throw new Error(`timing: 没有第 ${i} 句`);
    if (l.chars.length !== l.text.length) {
      throw new Error(`timing: 第 ${i} 句 chars 与 text 不是 1:1，请重跑 align.py`);
    }
    return l;
  };

  /** 第 i 句的起点秒。 */
  const tLine = (i: number) => line(i).start;
  /** 第 i 句的终点秒。 */
  const tLineEnd = (i: number) => line(i).end;

  /** 第 i 句第 offset 个字符的起点秒（offset 从 0 起，负数从句尾倒数）。 */
  const tChar = (i: number, offset: number) => {
    const { chars } = line(i);
    const k = offset < 0 ? chars.length + offset : offset;
    if (k < 0 || k >= chars.length) throw new Error(`timing: 第 ${i} 句没有第 ${offset} 个字符`);
    return chars[k].start;
  };

  const wordIndex = (i: number, word: string, nth: number) => {
    const { text } = line(i);
    let k = -1;
    for (let n = 0; n < nth; n++) {
      k = text.indexOf(word, k + 1);
      if (k < 0) throw new Error(`timing: 第 ${i} 句找不到第 ${nth} 个「${word}」——稿改了就要同步改词锚`);
    }
    return k;
  };

  /** 第 i 句里第 nth 次出现的 word 的起点秒。找不到直接抛错，不静默给错时间。 */
  const tWord = (i: number, word: string, nth = 1) => line(i).chars[wordIndex(i, word, nth)].start;
  /** 同上，取该词最后一个字的终点秒。 */
  const tWordEnd = (i: number, word: string, nth = 1) =>
    line(i).chars[wordIndex(i, word, nth) + word.length - 1].end;

  /** 秒 → 帧。 */
  const f = (seconds: number) => Math.round(seconds * data.fps);

  return { data, tLine, tLineEnd, tChar, tWord, tWordEnd, f };
};

/** 把一段过长的片语在字界上均分（不切开拉丁词）。返回各段在片语内的起始下标。 */
const splitPoints = (chars: TimingChar[], maxChars: number): number[] => {
  const parts = Math.ceil(chars.length / maxChars);
  const points = [0];
  for (let p = 1; p < parts; p++) {
    let k = Math.round((chars.length * p) / parts);
    while (k < chars.length && k > 0 && isLatin(chars[k].c) && isLatin(chars[k - 1].c)) k++;
    if (k > points[points.length - 1] && k < chars.length) points.push(k);
  }
  return points;
};

/** 字幕 cue：按标点切片语、去标点；相邻短片语在 maxChars 内合并，超长片语均分。
 * cue 显示到同句下一 cue 的起点（句内不闪），句末多留 tailHold 秒。 */
export const buildCues = (data: Timing, maxChars: number, tailHold = 0.25): Cue[] => {
  const cues: Cue[] = [];
  for (const l of data.lines) {
    // 1. 按标点切成片语（保留词间空格，如「在 Threads 上」）
    const phrases: TimingChar[][] = [];
    let cur: TimingChar[] = [];
    for (const ch of l.chars) {
      if (isPunct(ch.c) && ch.c !== ' ') {
        if (cur.length) phrases.push(cur);
        cur = [];
      } else cur.push(ch);
    }
    if (cur.length) phrases.push(cur);

    // 2. 合并与拆分
    const blocks: TimingChar[][] = [];
    for (const ph of phrases) {
      const last = blocks[blocks.length - 1];
      if (last && last.length + ph.length <= maxChars) last.push(...ph);
      else if (ph.length <= maxChars) blocks.push([...ph]);
      else {
        const pts = splitPoints(ph, maxChars);
        pts.forEach((a, n) => blocks.push(ph.slice(a, pts[n + 1] ?? ph.length)));
      }
    }

    // 3. 定时
    const lineCues = blocks
      .map((b) => b.filter((ch, k) => !(ch.c === ' ' && (k === 0 || k === b.length - 1))))
      .filter((b) => b.length)
      .map((b) => ({ line: l.i, text: b.map((ch) => ch.c).join(''), start: b[0].start, end: b[b.length - 1].end }));
    lineCues.forEach((c, k) => {
      c.end = k < lineCues.length - 1 ? lineCues[k + 1].start : c.end + tailHold;
    });
    cues.push(...lineCues);
  }
  // 句末 hold 不得盖到下一句
  cues.forEach((c, k) => {
    if (k < cues.length - 1) c.end = Math.min(c.end, cues[k + 1].start);
  });
  return cues;
};
