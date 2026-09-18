#!/usr/bin/env python3
"""口播模式 ③ 逐字时间戳：配音 + 口播稿 → audio/timing.json

    python align.py --audio audio/vo.wav --lines script/lines.json \
        [--map audio/vo-map.json] [--out audio/timing.json] [--fps 30] \
        [--backend sherpa|whisper] [--model-dir DIR]

做法：ASR 出逐 token 时间 → 与稿逐字对齐（稿是真值，ASR 只提供时间）。
  - 对齐键：繁简归一 + 无声调拼音（多音字取全部读音），同音字视为相同。
  - 汉字是锚点；拉丁词、数字、ASR 漏掉的字在相邻锚点之间按音节数线性插值。
  - 标点与空白零时长，钉在前一个字的尾端。
  - 每个字的尾端用能量包络回找（停顿前的字不会被拉长到下一个字的起点）。
  - 有 vo-map.json（逐句合成）时逐句独立识别与对齐；没有则按静音切块后全局对齐。
  - 逐句匹配率 < 0.9 标 needs_review 并打印，让使用者听核。

输出 schema 见 references/narration-mode.md；chars 与 text 逐字符 1:1。

依赖（均 MIT/BSD/Apache-2.0）：sherpa-onnx zhconv pypinyin numpy；解码音频用 ffmpeg。
首次安装（需 Python ≥ 3.10）：
    python3.11 -m venv ~/.cache/shotcraft-asr/venv
    ~/.cache/shotcraft-asr/venv/bin/pip install sherpa-onnx zhconv pypinyin numpy   # 备援再加 faster-whisper
    curl -L <SHERPA_URL，见下> | tar xj -C ~/.cache/shotcraft-asr
之后一律用 ~/.cache/shotcraft-asr/venv/bin/python 跑本脚本。
模型：icefall-asr-zipformer-wenetspeech-20230615（模型卡标 apache-2.0），放
~/.cache/shotcraft-asr/；备援 --backend whisper 用 faster-whisper（MIT 权重）。
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

import numpy as np

SR = 16000
CACHE = Path.home() / '.cache' / 'shotcraft-asr'
SHERPA_MODEL = 'icefall-asr-zipformer-wenetspeech-20230615'
SHERPA_URL = ('https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/'
              f'{SHERPA_MODEL}.tar.bz2')
REVIEW_BELOW = 0.9
HOTWORDS_SCORE = 1.5
HOP = 0.01  # 能量包络帧移（秒）


# ───────────────────────── 音频 ─────────────────────────

def load_audio(path: Path) -> np.ndarray:
    """任意格式 → 16k 单声道 float32（交给 ffmpeg，省掉重采样依赖）。"""
    cmd = ['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-']
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def envelope(audio: np.ndarray) -> np.ndarray:
    """10ms 帧移、30ms 窗的 RMS（dB，相对全片峰值）。"""
    hop, win = int(SR * HOP), int(SR * 0.03)
    n = max(1, (len(audio) - win) // hop + 1)
    idx = np.arange(n)[:, None] * hop + np.arange(win)[None, :]
    idx = np.minimum(idx, len(audio) - 1)
    rms = np.sqrt(np.mean(audio[idx] ** 2, axis=1) + 1e-12)
    return 20 * np.log10(rms / (rms.max() + 1e-12))


def voiced_mask(env: np.ndarray, floor_db: float = -38.0) -> np.ndarray:
    return env > floor_db


def speech_bounds(mask: np.ndarray, t0: float, t1: float) -> tuple[float, float]:
    """[t0, t1] 内第一帧与最后一帧有声的时间；全静音则原样返回。"""
    a, b = int(t0 / HOP), min(len(mask), int(t1 / HOP) + 1)
    hit = np.flatnonzero(mask[a:b])
    if len(hit) == 0:
        return t0, t1
    return (a + hit[0]) * HOP, (a + hit[-1] + 1) * HOP


def last_voiced_before(mask: np.ndarray, t_from: float, t_to: float) -> float:
    """从 t_to 往回找到 t_from，返回最后一帧有声的尾端（找不到返回 t_to）。"""
    a, b = int(t_from / HOP), min(len(mask), int(t_to / HOP))
    hit = np.flatnonzero(mask[a:b])
    return (a + hit[-1] + 1) * HOP if len(hit) else t_to


def next_voiced(mask: np.ndarray, t: float, limit: float) -> float:
    """t 落在静音里（且静音持续 ≥ 80ms，短于此多半是塞音闭塞）→ 返回其后第一帧有声的时间，不越过 limit。"""
    a, b = int(round(t / HOP)), min(len(mask), int(limit / HOP))
    if a >= b or mask[a:a + 8].any():
        return t
    hit = np.flatnonzero(mask[a:b])
    return (a + hit[0]) * HOP if len(hit) else t


def silence_chunks(mask: np.ndarray, total: float, max_len: float = 20.0) -> list[tuple[float, float]]:
    """无 vo-map 时：在 ≥0.25s 的静音中点下刀，切成 ≤ max_len 的块。"""
    cuts, run = [], 0
    for k, v in enumerate(mask):
        if not v:
            run += 1
            continue
        if run * HOP >= 0.25:
            cuts.append((k - run / 2) * HOP)
        run = 0
    chunks, start, prev = [], 0.0, 0.0
    for c in cuts + [total]:
        if c - start > max_len and prev > start:
            chunks.append((start, prev))
            start = prev
        prev = c
    chunks.append((start, total))
    return chunks


# ───────────────────────── ASR 后端 ─────────────────────────

class Token(dict):
    """{'c': 字, 't': 绝对起点秒}"""


def sherpa_recognizer(model_dir: Path, hotwords: Path | None = None):
    import sherpa_onnx
    if not model_dir.exists():
        sys.exit(f'找不到 ASR 模型：{model_dir}\n下载：curl -L {SHERPA_URL} | tar xj -C {CACHE}')
    exp = model_dir / 'exp'

    def pick(stem: str, int8: bool) -> str:
        # decoder 用 fp32：int8 decoder 实测会多听错字
        return str(next(f for f in sorted(exp.glob(f'{stem}-*.onnx')) if f.name.endswith('.int8.onnx') == int8))

    bias = dict(decoding_method='modified_beam_search', hotwords_file=str(hotwords),
                hotwords_score=HOTWORDS_SCORE) if hotwords else {}
    return sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=pick('encoder', True), decoder=pick('decoder', False), joiner=pick('joiner', True),
        tokens=str(model_dir / 'data' / 'lang_char' / 'tokens.txt'), num_threads=4, **bias)


def write_hotwords(lines: list[dict], model_dir: Path, dest: Path) -> Path:
    """把稿本身当热词：稿是真值，用它偏置解码（数字读法、专名最受益）。
    偏置会掩盖「配音真的念错」，所以另跑一轮无偏置识别出 match_raw 作诊断。"""
    from zhconv import convert
    vocab = {ln.split()[0] for ln in (model_dir / 'data' / 'lang_char' / 'tokens.txt').read_text(encoding='utf-8').splitlines() if ln.strip()}
    phrases = []
    for ln in lines:
        for ph in re.split(r'[^\u3400-\u9fff]+', convert(ln['text'], 'zh-cn')):
            ph = ''.join(c for c in ph if c in vocab)
            if len(ph) >= 2:
                phrases.append(' '.join(ph))
    dest.write_text('\n'.join(dict.fromkeys(phrases)) + '\n', encoding='utf-8')
    return dest


def asr_sherpa(rec, audio: np.ndarray, t0: float, t1: float) -> list[Token]:
    st = rec.create_stream()
    st.accept_waveform(SR, audio[int(t0 * SR):int(t1 * SR)])
    rec.decode_stream(st)
    r = st.result
    return [Token(c=c, t=t0 + ts) for c, ts in zip(r.tokens, r.timestamps)]


def asr_whisper(model, audio: np.ndarray, t0: float, t1: float) -> list[Token]:
    seg = audio[int(t0 * SR):int(t1 * SR)]
    segments, _ = model.transcribe(seg, language='zh', word_timestamps=True, vad_filter=False)
    out: list[Token] = []
    for s in segments:
        for w in s.words or []:
            chars = [c for c in w.word if not c.isspace()]
            if not chars:
                continue
            # 一个 word 可能含多个汉字：在 word 区间内均分
            step = (w.end - w.start) / len(chars)
            out += [Token(c=c, t=t0 + w.start + k * step) for k, c in enumerate(chars)]
    return out


# ───────────────────────── 对齐键 ─────────────────────────

def is_han(c: str) -> bool:
    return '一' <= c <= '鿿' or '㐀' <= c <= '䶿'


def is_latin(c: str) -> bool:
    return c.isascii() and c.isalnum()


_key_cache: dict[str, frozenset] = {}


def keys(c: str) -> frozenset:
    """汉字 → 无声调拼音集合（繁简归一、多音字全收、平翘舌与前后鼻音合并）。"""
    if c not in _key_cache:
        from pypinyin import Style, pinyin
        from zhconv import convert
        simp = convert(c, 'zh-cn')
        out = set()
        for ch in {c, simp}:
            for p in pinyin(ch, style=Style.NORMAL, heteronym=True)[0]:
                p = re.sub(r'^(z|c|s)h', r'\1', p)
                p = re.sub(r'ng$', 'n', p)
                out.add(p)
        _key_cache[c] = frozenset(out)
    return _key_cache[c]


def same_sound(a: str, b: str) -> bool:
    return a == b or bool(keys(a) & keys(b))


def syllables(word: str) -> int:
    """拉丁词的音节估计（插值权重）：元音群数；纯数字按位数；全大写缩写（ETF）逐字母念。"""
    if word.isdigit() or (word.isupper() and len(word) <= 5):
        return len(word)
    return max(1, len(re.findall(r'[aeiouy]+', word.lower())))


# ───────────────────────── 对齐 ─────────────────────────

def nw_align(script: list[str], heard: list[str]) -> list[tuple[int, int, bool]]:
    """Needleman–Wunsch。返回 [(稿下标, ASR 下标, 是否同音)]，只含对角线配对。"""
    n, m = len(script), len(heard)
    MATCH, SUB, GAP = 2, -1, -1
    score = np.zeros((n + 1, m + 1), dtype=np.int32)
    score[:, 0] = np.arange(n + 1) * GAP
    score[0, :] = np.arange(m + 1) * GAP
    same = [[same_sound(a, b) for b in heard] for a in script]
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            score[i, j] = max(score[i - 1, j - 1] + (MATCH if same[i - 1][j - 1] else SUB),
                              score[i - 1, j] + GAP, score[i, j - 1] + GAP)
    pairs, i, j = [], n, m
    while i > 0 and j > 0:
        diag = score[i - 1, j - 1] + (MATCH if same[i - 1][j - 1] else SUB)
        if score[i, j] == diag:
            pairs.append((i - 1, j - 1, same[i - 1][j - 1]))
            i, j = i - 1, j - 1
        elif score[i, j] == score[i - 1, j] + GAP:
            i -= 1
        else:
            j -= 1
    return pairs[::-1]


def units_of(text: str) -> list[dict]:
    """把一句稿拆成计时单元：汉字一字一单元，连续拉丁/数字一词一单元。
    每个单元记 chars（在 text 里的下标区间）与 weight（音节数）。"""
    units, k = [], 0
    while k < len(text):
        c = text[k]
        if is_han(c):
            units.append({'kind': 'han', 'a': k, 'b': k + 1, 'w': 1})
            k += 1
        elif is_latin(c):
            e = k
            while e < len(text) and (is_latin(text[e]) or (text[e] in ".'-" and e + 1 < len(text) and is_latin(text[e + 1]))):
                e += 1
            units.append({'kind': 'latin', 'a': k, 'b': e, 'w': syllables(text[k:e])})
            k = e
        else:
            k += 1
    return units


def time_line(text: str, tokens: list[Token], win: tuple[float, float], mask: np.ndarray) -> dict:
    """对齐一句。win 是这句在整条音轨上的搜索窗。"""
    text = unicodedata.normalize('NFC', text)
    units = units_of(text)
    han_units = [u for u in units if u['kind'] == 'han']
    heard = [t for t in tokens if is_han(t['c'])]

    pairs = nw_align([text[u['a']] for u in han_units], [t['c'] for t in heard])
    matched = 0
    for si, hi, ok in pairs:
        han_units[si]['t'] = heard[hi]['t']  # 替换配对也占同一时间位，当弱锚点用
        matched += ok
    match = matched / len(han_units) if han_units else 1.0

    on, off = speech_bounds(mask, *win)
    # 首尾字夹到实际有声范围：transducer 的首 token 常早于真正发声
    anchors = [u for u in units if 't' in u]
    for u in anchors:
        u['t'] = min(max(u['t'], on), off)
    # transducer 常把停顿后第一个字的 token 提前吐在静音里：吸附到随后的发声起点
    # 紧跟其后的字通常也被提前，按本句语速的最小间距顺推，直到恢复自然间距为止
    gaps = [b['t'] - a['t'] for a, b in zip(anchors, anchors[1:]) if 0.05 < b['t'] - a['t'] < 0.4]
    min_gap = 0.7 * (float(np.median(gaps)) if gaps else 0.18)
    pushed = False
    for k, u in enumerate(anchors):
        t = next_voiced(mask, u['t'], off)
        if pushed:
            t = max(t, anchors[k - 1]['t'] + min_gap)
        pushed = t > u['t'] + 1e-6
        u['t'] = min(t, off)
    # 保证单调：回退的锚点丢弃，交给插值
    last = -1.0
    for u in anchors:
        if u['t'] < last:
            del u['t']
        else:
            last = u['t']

    # 插值：无锚单元在左右锚点（或句首/句尾有声边界）之间按音节权重分配
    k = 0
    while k < len(units):
        if 't' in units[k]:
            k += 1
            continue
        e = k
        while e < len(units) and 't' not in units[e]:
            e += 1
        left = units[k - 1]['t'] if k > 0 else None
        right = units[e]['t'] if e < len(units) else off
        span = units[k:e]
        if left is None:
            lo, wsum, acc = on, sum(u['w'] for u in span), 0.0
        else:  # 左锚点自己占一个权重
            lo, wsum, acc = left, units[k - 1]['w'] + sum(u['w'] for u in span), units[k - 1]['w']
        for u in span:
            u['t'] = lo + (right - lo) * acc / wsum
            acc += u['w']
        k = e

    # 单元尾端：下一单元起点，但遇停顿时用能量包络回找
    for idx, u in enumerate(units):
        nxt = units[idx + 1]['t'] if idx + 1 < len(units) else off
        end = nxt
        if nxt - u['t'] > 0.3:
            end = last_voiced_before(mask, u['t'], nxt)
        u['end'] = max(u['t'] + 0.04, min(end, nxt)) if nxt > u['t'] else u['t']

    # 展开到逐字符
    chars = [None] * len(text)
    for u in units:
        n = u['b'] - u['a']
        step = (u['end'] - u['t']) / n
        for d in range(n):
            chars[u['a'] + d] = {'c': text[u['a'] + d], 'start': u['t'] + d * step, 'end': u['t'] + (d + 1) * step}
    prev_end = units[0]['t'] if units else on
    for k2, c in enumerate(text):
        if chars[k2] is None:  # 标点、空白：零时长
            chars[k2] = {'c': c, 'start': prev_end, 'end': prev_end}
        prev_end = chars[k2]['end']
    for ch in chars:
        ch['start'], ch['end'] = round(ch['start'], 3), round(ch['end'], 3)

    return {
        'start': round(units[0]['t'], 3) if units else round(on, 3),
        'end': round(units[-1]['end'], 3) if units else round(off, 3),
        'match': round(match, 3),
        'needs_review': match < REVIEW_BELOW,
        'asr': ''.join(t['c'] for t in tokens),
        'chars': chars,
    }


def split_tokens_by_line(lines: list[dict], tokens: list[Token]) -> list[list[Token]]:
    """无 vo-map：全稿对全片全局对齐，再按稿的句界把 token 分回各句。"""
    owner, script = [], []
    for li, ln in enumerate(lines):
        for c in ln['text']:
            if is_han(c):
                owner.append(li)
                script.append(c)
    heard_idx = [k for k, t in enumerate(tokens) if is_han(t['c'])]
    pairs = nw_align(script, [tokens[k]['c'] for k in heard_idx])
    # 每句第一个配对 token 的下标 = 该句 token 起点
    first = {}
    for si, hi, _ in pairs:
        first.setdefault(owner[si], heard_idx[hi])
    bounds, cur = [], 0
    for li in range(len(lines)):
        cur = max(cur, first.get(li, cur))
        bounds.append(cur)
    bounds.append(len(tokens))
    return [tokens[bounds[li]:bounds[li + 1]] for li in range(len(lines))]


# ───────────────────────── 主流程 ─────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--audio', required=True, type=Path)
    ap.add_argument('--lines', required=True, type=Path, help='script/lines.json：[{i, text, role}]')
    ap.add_argument('--map', type=Path, help='audio/vo-map.json（逐句合成时由 tts-minimax.py 产生）')
    ap.add_argument('--out', type=Path)
    ap.add_argument('--fps', type=int, default=30)
    ap.add_argument('--backend', choices=['sherpa', 'whisper'], default='sherpa')
    ap.add_argument('--model-dir', type=Path, default=CACHE / SHERPA_MODEL)
    ap.add_argument('--whisper-size', default='small')
    args = ap.parse_args()

    lines = json.loads(args.lines.read_text(encoding='utf-8'))
    audio = load_audio(args.audio)
    total = len(audio) / SR
    mask = voiced_mask(envelope(audio))

    out = args.out or args.audio.parent / 'timing.json'
    asr_raw = None
    if args.backend == 'sherpa':
        hot = write_hotwords(lines, args.model_dir, out.with_name('.align-hotwords.txt'))
        rec, rec_raw = sherpa_recognizer(args.model_dir, hot), sherpa_recognizer(args.model_dir)
        hot.unlink()
        asr = lambda a, b: asr_sherpa(rec, audio, a, b)
        asr_raw = lambda a, b: asr_sherpa(rec_raw, audio, a, b)
        model_name = args.model_dir.name
    else:
        from faster_whisper import WhisperModel
        wm = WhisperModel(args.whisper_size, device='cpu', compute_type='int8',
                          download_root=str(CACHE / 'whisper'))
        asr = lambda a, b: asr_whisper(wm, audio, a, b)
        model_name = f'faster-whisper-{args.whisper_size}'

    if args.map:
        vo_map = {m['i']: m for m in json.loads(args.map.read_text(encoding='utf-8'))['lines']}
        missing = [ln['i'] for ln in lines if ln['i'] not in vo_map]
        if missing:
            sys.exit(f'vo-map.json 缺这些句子：{missing}')
        wins = [(vo_map[ln['i']]['start'], vo_map[ln['i']]['end']) for ln in lines]
        per_line = [asr(a, b) for a, b in wins]
    else:
        tokens = [t for a, b in silence_chunks(mask, total) for t in asr(a, b)]
        per_line = split_tokens_by_line(lines, tokens)
        # 搜索窗：上一句最后一个 token 到下一句第一个 token 之间
        firsts = [tl[0]['t'] if tl else None for tl in per_line]
        lasts = [tl[-1]['t'] if tl else None for tl in per_line]
        wins = []
        for li in range(len(lines)):
            prev_last = next((lasts[k] for k in range(li - 1, -1, -1) if lasts[k] is not None), 0.0)
            next_first = next((firsts[k] for k in range(li + 1, len(lines)) if firsts[k] is not None), total)
            lo = prev_last + 0.05 if li else 0.0
            wins.append((lo, max(lo, next_first - 0.02)))

    out_lines = []
    for ln, toks, win in zip(lines, per_line, wins):
        r = time_line(ln['text'], toks, win, mask)
        if asr_raw:  # 无偏置诊断：只取匹配率与听到的字
            raw = time_line(ln['text'], [t for t in asr_raw(*win)], win, mask)
            r = {**r, 'match_raw': raw['match'], 'asr_raw': raw['asr']}
            r = {k: r[k] for k in ('start', 'end', 'match', 'match_raw', 'needs_review', 'asr', 'asr_raw', 'chars')}
        out_lines.append({'i': ln['i'], 'text': unicodedata.normalize('NFC', ln['text']), **r})

    result = {'fps': args.fps, 'total': round(total, 3), 'backend': model_name, 'lines': out_lines}
    out.write_text(json.dumps(result, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    print(f'→ {out}  ({len(out_lines)} 句, {total:.2f}s, {model_name})')
    for r in out_lines:
        flag = '  ← needs_review，请听核' if r['needs_review'] else ''
        print(f"  L{r['i']:>2} {r['start']:7.2f}–{r['end']:7.2f}  match {r['match']:.2f}{flag}")
        if r['needs_review']:
            print(f"      稿：{r['text']}\n      听：{r['asr']}")
        elif r.get('match_raw', 1) < REVIEW_BELOW:
            print(f"      （无偏置识别只有 {r['match_raw']:.2f}：{r['asr_raw']}——时间戳可用，建议顺手听一下这句）")
    if any(r['needs_review'] for r in out_lines):
        sys.exit(2)


if __name__ == '__main__':
    main()
