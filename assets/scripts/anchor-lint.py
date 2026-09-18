#!/usr/bin/env python3
"""口播模式 ⑧ 机器检查：词锚、镜尾保护带、素材与授权、选卡规则。

    python anchor-lint.py [--project .] [--timing audio/timing.json] [--shotlist src/shotlist.json]
                          [--fps 30]

对照 timing.json 检查 src/shotlist.json：
  FAIL  词锚找不到（稿改了词不在）/ 词锚落在所属镜头之外 / 距镜尾 < 0.5s
        anchor 写了 frame 但与 timing 算出的帧相差 > 0.1s（手敲帧号或稿已重配）
        该镜涵盖的句子有 needs_review / 素材档不存在 / 素材不在 manifest 或授权栏为空
        纯动效镜 > 1/3 / 同一张卡当主角 > 2 次 / 连续两镜同卡 / 镜头边界没写转场
  WARN  词锚距镜尾 0.5–0.6s / 开镜到第一个词锚 > 1.5s 而这镜没有素材承载 /
        词锚不在片语开头（句中字时间戳约 ±0.1–0.2s，片语首字才准）

只用标准库。退出码：有 FAIL → 2，否则 0。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PUNCT = set('，。、；：？！,.;:?!「」『』（）()《》—…· ')
TAIL_FAIL, TAIL_WARN = 0.5, 0.6
LEAD_WARN = 1.5
FRAME_TOL = 0.1


def word_time(line: dict, word: str, nth: int = 1):
    k = -1
    for _ in range(nth):
        k = line['text'].find(word, k + 1)
        if k < 0:
            return None, None
    return line['chars'][k]['start'], k


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--project', type=Path, default=Path('.'))
    ap.add_argument('--timing', type=Path)
    ap.add_argument('--shotlist', type=Path)
    ap.add_argument('--fps', type=int)
    args = ap.parse_args()
    root = args.project

    timing_path = args.timing or next((p for p in (root / 'audio/timing.json', root / 'src/timing.json') if p.exists()), None)
    shotlist_path = args.shotlist or root / 'src/shotlist.json'
    if not timing_path or not shotlist_path.exists():
        sys.exit('缺 timing.json 或 src/shotlist.json')
    timing = json.loads(timing_path.read_text(encoding='utf-8'))
    raw = json.loads(shotlist_path.read_text(encoding='utf-8'))
    shots = raw['shots'] if isinstance(raw, dict) else raw
    fps = args.fps or timing.get('fps', 30)
    lines = {ln['i']: ln for ln in timing['lines']}
    manifest_path = root / 'assets/manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))['entries'] if manifest_path.exists() else []
    by_file = {e['file']: e for e in manifest}

    fails, warns = [], []
    pure, card_uses, prev_card = 0, {}, None

    for n, s in enumerate(shots):
        sid = s.get('id', f'#{n + 1}')
        ids = s.get('lines') or []
        missing = [i for i in ids if i not in lines]
        if missing or not ids:
            fails.append(f'{sid}：lines {missing or "为空"} 不在 timing.json')
            continue
        start = lines[ids[0]]['start']
        end = lines[ids[-1]]['end'] + float(s.get('hold', 0.4))

        for i in ids:
            if lines[i].get('needs_review'):
                fails.append(f'{sid}：第 {i} 句 needs_review（match {lines[i]["match"]}），先听核再做镜头')

        # ── 词锚 ──
        times = []
        for a in s.get('anchors') or []:
            li, word = a.get('line', ids[0]), a.get('word', '')
            what = f'{sid} 锚「{word}」（{a.get("action", "")}）'
            if li not in ids:
                fails.append(f'{what}：第 {li} 句不属于本镜 lines {ids}')
                continue
            t, k = word_time(lines[li], word, int(a.get('nth', 1)))
            if t is None:
                fails.append(f'{what}：第 {li} 句里找不到这个词——稿改了就要同步改词锚')
                continue
            times.append(t)
            tail = end - t
            if tail < TAIL_FAIL:
                fails.append(f'{what}：距镜尾 {tail:.2f}s < {TAIL_FAIL}s，提前或移到下一镜')
            elif tail < TAIL_WARN:
                warns.append(f'{what}：距镜尾 {tail:.2f}s，偏紧')
            if 'frame' in a and abs(a['frame'] / fps - t) > FRAME_TOL:
                fails.append(f'{what}：写死的 frame {a["frame"]}（{a["frame"] / fps:.2f}s）与 timing {t:.2f}s 差 '
                             f'{abs(a["frame"] / fps - t):.2f}s > {FRAME_TOL}s——改用 f(tWord(...))')
            if k > 0 and lines[li]['text'][k - 1] not in PUNCT:
                warns.append(f'{what}：不在片语开头，时间戳精度约 ±0.1–0.2s；能换成片语首词更稳')

        # ── 素材 ──
        mat = s.get('material') or {}
        files = [f for f in [mat.get('file'), *(mat.get('files') or [])] if f]
        if not files:
            if mat.get('mode') in ('chart', 'text'):
                pure += 1
            else:
                fails.append(f'{sid}：没有素材行（mode={mat.get("mode")}）')
            if times and min(times) - start > LEAD_WARN:
                warns.append(f'{sid}：开镜 {min(times) - start:.1f}s 后才有第一个词锚，且没有素材承载——别让空画布等词')
        for f in files:
            if not (root / f).exists() and not (root / 'public' / f).exists():
                fails.append(f'{sid}：素材档不存在 {f}')
            e = by_file.get(f) or next((v for k2, v in by_file.items() if k2.endswith(f.removeprefix('public/'))), None)
            if not e:
                fails.append(f'{sid}：{f} 不在 assets/manifest.json（没有 URL 的档案不准进成片）')
            elif not e.get('license'):
                fails.append(f'{sid}：{f} 的 manifest 授权栏为空')

        # ── 选卡与转场 ──
        card = (s.get('card') or {}).get('name')
        if card:
            card_uses[card] = card_uses.get(card, 0) + 1
            if card == prev_card:
                fails.append(f'{sid}：与上一镜连续使用同一张卡 {card}')
        prev_card = card
        if n > 0 and not str(s.get('transition_in', '')).strip():
            fails.append(f'{sid}：没写 transition_in——禁止裸切')

    for card, c in card_uses.items():
        if c > 2:
            fails.append(f'卡 {card} 当了 {c} 次主角（上限 2）')
    if shots and pure > len(shots) / 3:
        fails.append(f'纯动效镜 {pure}/{len(shots)}，超过 1/3')

    print(f'anchor-lint：{len(shots)} 镜，纯动效 {pure}；{timing_path} × {shotlist_path}')
    for w in warns:
        print(f'  WARN  {w}')
    for f in fails:
        print(f'  FAIL  {f}')
    print('FAIL' if fails else 'PASS')
    sys.exit(2 if fails else 0)


if __name__ == '__main__':
    main()
