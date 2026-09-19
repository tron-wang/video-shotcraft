#!/usr/bin/env python3
"""字幕模式：影片网址 → 下载 → 语音辨识 → （Agent 翻译 / 校对）→ 繁中字幕 → 烧录成片

    PY=~/.cache/shotcraft-asr/venv/bin/python
    $PY subtitle.py fetch      --url URL --out PROJ [--cookies-from-browser chrome] [--max-height 1080]
    $PY subtitle.py transcribe --out PROJ [--model large-v3-turbo] [--lang en]
    #   → Agent 读 subs/cues.json，写 subs/zh.json（中文来源已预填繁体，Agent 只校对）
    $PY subtitle.py build      --out PROJ [--style outline|plate] [--bilingual] [--position bottom|top] [--margin-v PX]
    $PY subtitle.py still      --out PROJ [--t 12.5 --t 40] [--auto 4]
    $PY subtitle.py burn       --out PROJ [--crf 18]

专案目录：
    source/video.mp4  source/meta.json        fetch 产出（来源网址、作者、画幅、时长）
    subs/asr.json                              transcribe 原始辨识（含逐词时间）
    subs/cues.json                             切好的字幕条 [{i,start,end,src}]——时间真值
    subs/zh.json                               [{i, zh}]——Agent 写的繁中字幕（字串，或字串阵列=在该条内再拆）
    subs/zh.ass  out/<名>.zh-TW.srt            build 产出
    stills/*.png                               still 产出（带字幕的检查帧）
    out/<名>-中文字幕.mp4                       burn 产出（使用者说「汇出」才跑）

依赖：yt-dlp、ffmpeg（需 libass + fontconfig）、faster-whisper（MIT，与 align.py 共用 venv）；
中文来源预填繁体优先用 opencc CLI（s2twp），没有则退回 zhconv。
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

CACHE = Path.home() / '.cache' / 'shotcraft-asr'
SR = 16000

# 字幕条切分（来源语言侧）
CUE_MAX_DUR = 6.0        # 单条最长秒数
CUE_MIN_DUR = 0.8        # 单条最短秒数（不足时往后借空档）
CUE_LINGER = 0.4         # 句尾多停留，方便读完
GAP_BREAK = 0.6          # 词间静音超过此值必断
LATIN_MAX_CHARS = 42     # 拉丁语系单条上限（约等于中文 14–18 字）
READ_SPEED_WARN = 9.0    # 中文每秒字数超过此值提示

# 画幅 → 字幕规格（与 assets/lib/Subtitles.tsx 同一套：直式 16 字 / 横式 24 字一行）
def layout(w: int, h: int) -> dict:
    if w < h:  # 直式：避开社群平台底部按钮区
        font, cap, orient, margin_v = round(w * 0.048), 16, 'portrait', round(h * 0.2)
    else:
        font, cap, orient, margin_v = round(h * 0.05), 24, 'landscape', round(h * 0.06)
    # 接近 4:3 的横式片宽度不够 24 字，一行字数再按可用宽度（85%）收紧
    return {'orient': orient, 'font': font, 'max': min(cap, int(w * 0.85 / font)), 'margin_v': margin_v}

CJK = re.compile(r'[぀-ヿ㐀-鿿豈-﫿가-힯]')
LATIN = re.compile(r'[A-Za-z0-9]')
SENT_END = re.compile(r'[.?!。？！…]["」』”]?$')
CLAUSE_END = re.compile(r'[,，、;；:：]$')
HALLUCINATIONS = ('字幕由', '請不吝點贊', '请不吝点赞', '訂閱', '订阅', 'Amara.org', '字幕志愿者', '字幕志願者')


def die(msg: str):
    print(f'✗ {msg}', file=sys.stderr)
    sys.exit(1)


def load(p: Path):
    return json.loads(p.read_text(encoding='utf-8'))


def save(p: Path, data):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def ffprobe(path: Path) -> dict:
    out = subprocess.run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', str(path)],
                         check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def video_info(proj: Path) -> dict:
    meta = proj / 'source' / 'meta.json'
    if not meta.exists():
        die(f'找不到 {meta}，先跑 fetch')
    return load(meta)


# ───────────────────────── fetch ─────────────────────────

def cmd_fetch(a):
    proj = Path(a.out).expanduser()
    src = proj / 'source'
    src.mkdir(parents=True, exist_ok=True)
    h = a.max_height
    fmt = (f'bv*[height<={h}][ext=mp4]+ba[ext=m4a]/b[height<={h}][ext=mp4]/'
           f'bv*[height<={h}]+ba/b[height<={h}]/b')
    cmd = ['yt-dlp', '--no-playlist', '-f', fmt, '--merge-output-format', 'mp4',
           '--write-info-json', '-o', str(src / 'video.%(ext)s'), a.url]
    if a.cookies_from_browser:
        cmd[1:1] = ['--cookies-from-browser', a.cookies_from_browser]
    print('→', ' '.join(cmd))
    if subprocess.run(cmd).returncode != 0:
        die('yt-dlp 下载失败；X / Threads / IG 需登入的影片加 --cookies-from-browser chrome 再试')

    video = src / 'video.mp4'
    if not video.exists():
        cands = [p for p in src.glob('video.*') if p.suffix not in ('.json', '.part')]
        if not cands:
            die('下载完成但找不到影片档')
        # 非 mp4 容器（webm/mkv）统一转 mp4，后面 ffmpeg 流程只认一种
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(cands[0]), '-c:v', 'libx264', '-crf', '16',
                        '-c:a', 'aac', '-b:a', '192k', str(video)], check=True)
        cands[0].unlink()

    info_p = src / 'video.info.json'
    info = load(info_p) if info_p.exists() else {}
    probe = ffprobe(video)
    v = next(s for s in probe['streams'] if s['codec_type'] == 'video')
    w, hgt = int(v['width']), int(v['height'])
    rot = int((v.get('tags') or {}).get('rotate', 0) or 0)
    for sd in v.get('side_data_list') or []:
        rot = int(sd.get('rotation', rot) or rot)
    if abs(rot) in (90, 270):
        w, hgt = hgt, w
    meta = {
        'url': a.url,
        'webpage_url': info.get('webpage_url', a.url),
        'title': info.get('title'),
        'uploader': info.get('uploader') or info.get('channel'),
        'uploader_url': info.get('uploader_url') or info.get('channel_url'),
        'upload_date': info.get('upload_date'),
        'extractor': info.get('extractor_key'),
        'license': info.get('license'),
        'duration': float(probe['format']['duration']),
        'width': w,
        'height': hgt,
        'has_audio': any(s['codec_type'] == 'audio' for s in probe['streams']),
    }
    save(src / 'meta.json', meta)
    print(f'✓ source/video.mp4  {w}×{hgt}  {meta["duration"]:.1f}s  「{meta["title"]}」 by {meta["uploader"]}')
    if not meta['has_audio']:
        print('⚠ 这支影片没有音轨，无法辨识语音')


# ───────────────────────── transcribe ─────────────────────────

def width_of(text: str) -> float:
    """字幕宽度估算：汉字/假名/谚文 = 1，其余 = 0.5。"""
    return sum(1 if CJK.match(c) else 0.5 for c in text if not c.isspace())


def is_cjk_lang(lang: str) -> bool:
    return lang in ('zh', 'ja', 'ko', 'yue')


def segment_cues(segments: list[dict], lang: str, max_line: int) -> list[dict]:
    """把 whisper 的段落依逐词时间切成字幕条。中文来源一条 ≤ 一行；拉丁语系 ≤ 42 字元。"""
    cjk = is_cjk_lang(lang)
    limit = max_line if cjk else LATIN_MAX_CHARS / 2  # width_of 以 0.5 计拉丁字元
    joiner = '' if cjk else ' '
    cues: list[dict] = []

    def flush(buf):
        if not buf:
            return
        text = joiner.join(w['word'].strip() for w in buf).strip()
        if text:
            cues.append({'start': buf[0]['start'], 'end': buf[-1]['end'], 'src': text})

    for seg in segments:
        words = [w for w in seg['words'] if w['word'].strip()]
        buf: list[dict] = []
        for k, w in enumerate(words):
            if buf:
                cur = joiner.join(x['word'].strip() for x in buf)
                gap = w['start'] - buf[-1]['end']
                dur = w['end'] - buf[0]['start']
                prev = buf[-1]['word'].strip()
                over = width_of(cur + w['word']) > limit
                if (gap > GAP_BREAK or dur > CUE_MAX_DUR or over
                        or (SENT_END.search(prev) and buf[-1]['end'] - buf[0]['start'] >= 1.0)
                        or (CLAUSE_END.search(prev) and width_of(cur) >= limit * 0.6)):
                    flush(buf)
                    buf = []
            buf.append(w)
        flush(buf)

    # 时间整理：不重叠、最短时长、句尾停留
    for k, c in enumerate(cues):
        nxt = cues[k + 1]['start'] if k + 1 < len(cues) else c['end'] + 10
        room = max(c['end'], nxt - 0.05)
        c['end'] = min(room, max(c['end'] + CUE_LINGER, c['start'] + CUE_MIN_DUR))
        c['start'], c['end'] = round(c['start'], 3), round(c['end'], 3)
    return [{'i': k, **c} for k, c in enumerate(cues)]


def to_traditional(texts: list[str]) -> list[str]:
    if shutil.which('opencc'):
        joined = '\n'.join(t.replace('\n', ' ') for t in texts)
        out = subprocess.run(['opencc', '-c', 's2twp'], input=joined, capture_output=True, text=True, check=True).stdout
        lines = out.rstrip('\n').split('\n')
        if len(lines) == len(texts):
            return lines
    import zhconv
    return [zhconv.convert(t, 'zh-tw') for t in texts]


def cmd_transcribe(a):
    proj = Path(a.out).expanduser()
    meta = video_info(proj)
    if not meta.get('has_audio', True):
        die('来源影片没有音轨')
    from faster_whisper import WhisperModel
    import numpy as np

    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(proj / 'source' / 'video.mp4'),
                          '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], check=True, capture_output=True).stdout
    audio = np.frombuffer(raw, dtype=np.float32)
    print(f'→ 载入 faster-whisper {a.model}（首次会下载模型到 {CACHE / "whisper"}）')
    model = WhisperModel(a.model, device='cpu', compute_type='int8', download_root=str(CACHE / 'whisper'))

    lang = a.lang
    if not lang:
        lang, prob, _ = model.detect_language(audio)
        print(f'→ 侦测语言：{lang}（{prob:.2f}）')
    prompt = '以下是普通話的句子，有標點符號。' if lang == 'zh' else None
    seg_iter, info = model.transcribe(audio, language=lang, word_timestamps=True, vad_filter=True,
                                      condition_on_previous_text=False, initial_prompt=prompt, beam_size=5)
    segments = []
    for s in seg_iter:
        text = s.text.strip()
        if any(h in text for h in HALLUCINATIONS) or (s.no_speech_prob > 0.6 and s.avg_logprob < -1.0):
            print(f'  略过疑似幻觉段 {s.start:.1f}s：{text}')
            continue
        segments.append({'start': s.start, 'end': s.end, 'text': text,
                         'words': [{'start': w.start, 'end': w.end, 'word': w.word} for w in (s.words or [])]})
        print(f'  {s.start:7.1f}s  {text}')
    save(proj / 'subs' / 'asr.json', {'model': a.model, 'language': lang, 'segments': segments})

    L = layout(meta['width'], meta['height'])
    cues = segment_cues(segments, lang, L['max'])
    save(proj / 'subs' / 'cues.json', {'language': lang, 'orient': L['orient'], 'max_chars': L['max'], 'cues': cues})
    print(f'✓ subs/cues.json  {len(cues)} 条，来源语言 {lang}')

    zh_p = proj / 'subs' / 'zh.json'
    if lang in ('zh', 'yue'):
        if zh_p.exists() and not a.force:
            print('  subs/zh.json 已存在，不覆盖（要重来加 --force）')
        else:
            trad = to_traditional([c['src'] for c in cues])
            save(zh_p, [{'i': c['i'], 'zh': t} for c, t in zip(cues, trad)])
            print('✓ subs/zh.json 已预填繁体——下一步：Agent 逐条校对错字、专有名词、台湾用语')
    else:
        print('→ 下一步：Agent 依 subs/cues.json 逐条翻成繁体中文，写 subs/zh.json（[{"i":0,"zh":"…"}, …]）')


# ───────────────────────── build ─────────────────────────

def clean_zh(t: str) -> str:
    """台湾字幕惯例：句中逗号类 → 空白，句尾句号类删掉，保留？！与引号。"""
    t = t.strip()
    t = re.sub(r'[，、；：,;:]+', ' ', t)
    t = re.sub(r'。+|\.(?=\s|$)', ' ', t)  # 半形句点只在词尾删，保留 3.5、U.S. 里的点
    t = re.sub(r'…+|\.{3,}', '⋯', t)
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'\s+(?=[」』）)])|(?<=[「『（(])\s+', '', t)
    return t.rstrip('⋯ ').strip() or t


def wrap_zh(t: str, max_chars: int) -> list[str]:
    if width_of(t) <= max_chars:
        return [t]
    n = len(t)
    best, best_score = None, 1e9
    for k in range(1, n):
        a, b = t[:k].rstrip(), t[k:].lstrip()
        if not a or not b:
            continue
        if LATIN.match(t[k - 1]) and LATIN.match(t[k]):
            continue  # 不切开英文词 / 数字
        score = abs(width_of(a) - width_of(b)) + (0 if t[k - 1] == ' ' or t[k] == ' ' else 2)
        if t[k] in '」』）)？！' or t[k - 1] in '「『（(':
            score += 5
        if score < best_score:
            best, best_score = [a, b], score
    return best or [t]


def srt_time(s: float) -> str:
    ms = round(s * 1000)
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'


def ass_time(s: float) -> str:
    cs = round(s * 100)
    return f'{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}'


def ass_escape(t: str) -> str:
    return t.replace('\\', '＼').replace('{', '｛').replace('}', '｝')


def cmd_build(a):
    proj = Path(a.out).expanduser()
    meta = video_info(proj)
    cues_p, zh_p = proj / 'subs' / 'cues.json', proj / 'subs' / 'zh.json'
    if not cues_p.exists():
        die('找不到 subs/cues.json，先跑 transcribe')
    if not zh_p.exists():
        die('找不到 subs/zh.json——Agent 要先把 cues.json 翻成繁中写进去')
    cdata = load(cues_p)
    cues = {c['i']: c for c in cdata['cues']}
    zh = {e['i']: e['zh'] for e in load(zh_p)}
    missing = [i for i in cues if i not in zh]
    if missing:
        die(f'subs/zh.json 缺第 {missing[:20]} 条（空字串 "" 表示刻意不上字）')

    W, H = meta['width'], meta['height']
    L = layout(W, H)
    maxc = L['max']
    events, errors, warns = [], [], []
    for i in sorted(cues):
        c, z = cues[i], zh[i]
        parts = z if isinstance(z, list) else [z]
        parts = [clean_zh(p) for p in parts]
        parts = [p for p in parts if p]
        if not parts:
            continue
        # 阵列 = 在这条的时间内依字数比例再拆
        total = sum(max(len(p), 1) for p in parts)
        t = c['start']
        for p in parts:
            dur = (c['end'] - c['start']) * max(len(p), 1) / total
            lines = [ln for seg in p.split('\n') for ln in wrap_zh(seg.strip(), maxc)]
            if len(lines) > 2 or any(width_of(ln) > maxc * 1.15 for ln in lines):
                errors.append(f'第 {i} 条太长（{p}）——缩短，或在 zh.json 写成阵列拆成两条')
            if dur > 0 and width_of(p) / dur > READ_SPEED_WARN:
                warns.append(f'第 {i} 条读速 {width_of(p) / dur:.1f} 字/秒（{p}）')
            events.append({'i': i, 'start': t, 'end': t + dur, 'lines': lines,
                           'src': c['src'] if len(parts) == 1 else None})
            t += dur
    if errors:
        die('\n  '.join(['字幕超出版面：'] + errors))
    for k in range(len(events) - 1):
        events[k]['end'] = min(events[k]['end'], events[k + 1]['start'])

    # SRT
    name = a.name or 'video'
    srt = [f'{n}\n{srt_time(e["start"])} --> {srt_time(e["end"])}\n' + '\n'.join(e['lines']) + '\n'
           for n, e in enumerate(events, 1)]
    (proj / 'out').mkdir(exist_ok=True)
    srt_p = proj / 'out' / f'{name}.zh-TW.srt'
    srt_p.write_text('\n'.join(srt), encoding='utf-8')

    # ASS
    fs = L['font']
    margin_v = a.margin_v if a.margin_v is not None else L['margin_v']
    align = 8 if a.position == 'top' else 2
    if a.style == 'plate':  # 与 Subtitles.tsx 同色的深色字幕底板
        style = (f'Style: Default,PingFang TC,{fs},&H00FFFFFF,&H00FFFFFF,&H2E121212,&H2E121212,-1,0,0,0,'
                 f'100,100,0,0,3,{round(fs * 0.28)},0,{align},60,60,{margin_v},1')
    else:  # 白字黑边 + 轻阴影，压在任何画面上都读得到
        style = (f'Style: Default,PingFang TC,{fs},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,'
                 f'100,100,0,0,1,{max(2, round(fs * 0.075))},{max(1, round(fs * 0.04))},{align},60,60,{margin_v},1')
    src_fs = round(fs * 0.6)
    body = []
    for e in events:
        text = r'\N'.join(ass_escape(ln) for ln in e['lines'])
        if a.bilingual and e['src']:
            text += r'\N{\fs%d\c&HD8D8D8&\b0}%s' % (src_fs, ass_escape(e['src']))
        body.append(f'Dialogue: 0,{ass_time(e["start"])},{ass_time(e["end"])},Default,,0,0,0,,{text}')
    ass = '\n'.join([
        '[Script Info]', 'ScriptType: v4.00+', f'PlayResX: {W}', f'PlayResY: {H}',
        'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
        '[V4+ Styles]',
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, '
        'Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, '
        'MarginL, MarginR, MarginV, Encoding',
        style, '',
        '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
        *body, '',
    ])
    (proj / 'subs' / 'zh.ass').write_text(ass, encoding='utf-8')
    save(proj / 'subs' / 'build.json', {'name': name, 'style': a.style, 'bilingual': a.bilingual,
                                        'position': a.position, 'margin_v': margin_v, 'events': len(events)})
    for w in warns:
        print(f'  ⚠ {w}')
    print(f'✓ subs/zh.ass + out/{srt_p.name}  {len(events)} 条  （{L["orient"]}，{fs}px，一行 ≤ {maxc} 字）')


# ───────────────────────── still / burn ─────────────────────────

def need_ass(proj: Path) -> Path:
    p = proj / 'subs' / 'zh.ass'
    if not p.exists():
        die('找不到 subs/zh.ass，先跑 build')
    return p


def cmd_still(a):
    proj = Path(a.out).expanduser()
    need_ass(proj)
    times = list(a.t or [])
    if not times:
        cues = load(proj / 'subs' / 'cues.json')['cues']
        zh = {e['i']: e['zh'] for e in load(proj / 'subs' / 'zh.json')}
        shown = [c for c in cues if zh.get(c['i'])]
        if not shown:
            die('没有可显示的字幕条')
        longest = max(shown, key=lambda c: width_of(''.join(zh[c['i']]) if isinstance(zh[c['i']], list) else zh[c['i']]))
        n = max(1, a.auto)
        picks = {shown[round(k * (len(shown) - 1) / max(n - 1, 1))]['i'] for k in range(n - 1)} | {longest['i']}
        times = [round((c['start'] + min(c['end'], c['start'] + 1.2)) / 2, 2) for c in shown if c['i'] in picks]
    out = proj / 'stills'
    out.mkdir(exist_ok=True)
    for t in times:
        dst = out / f'still-{t:08.2f}s.png'
        # -copyts 让 ass 滤镜看到原始时间轴（否则 -ss 之后时间从 0 起算、字幕对不上）
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-copyts', '-i', 'source/video.mp4',
                        '-vf', 'ass=subs/zh.ass', '-frames:v', '1', str(dst.relative_to(proj))],
                       cwd=proj, check=True)
        print(f'✓ {dst}')


def cmd_burn(a):
    proj = Path(a.out).expanduser()
    need_ass(proj)
    build = load(proj / 'subs' / 'build.json')
    dst = Path('out') / f'{build["name"]}-中文字幕.mp4'
    probe = ffprobe(proj / 'source' / 'video.mp4')
    acodec = next((s['codec_name'] for s in probe['streams'] if s['codec_type'] == 'audio'), None)
    audio = ['-an'] if acodec is None else (['-c:a', 'copy'] if acodec in ('aac', 'mp3') else ['-c:a', 'aac', '-b:a', '192k'])
    cmd = ['ffmpeg', '-v', 'error', '-stats', '-y', '-i', 'source/video.mp4', '-vf', 'ass=subs/zh.ass',
           '-c:v', 'libx264', '-crf', str(a.crf), '-preset', 'medium', '-pix_fmt', 'yuv420p',
           *audio, '-movflags', '+faststart', str(dst)]
    print('→', ' '.join(cmd))
    subprocess.run(cmd, cwd=proj, check=True)
    d_in = float(probe['format']['duration'])
    d_out = float(ffprobe(proj / dst)['format']['duration'])
    flag = '✓' if abs(d_in - d_out) < 0.2 else '⚠ 时长不符'
    print(f'{flag} {proj / dst}  （来源 {d_in:.2f}s / 成片 {d_out:.2f}s）')


def main():
    ap = argparse.ArgumentParser(description='字幕模式：影片网址 → 繁中字幕成片')
    sub = ap.add_subparsers(dest='cmd', required=True)

    p = sub.add_parser('fetch', help='下载影片 + 来源资讯')
    p.add_argument('--url', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--cookies-from-browser', help='需登入的平台（X / Threads / IG）用，如 chrome')
    p.add_argument('--max-height', type=int, default=1080)
    p.set_defaults(fn=cmd_fetch)

    p = sub.add_parser('transcribe', help='语音辨识 → 字幕条')
    p.add_argument('--out', required=True)
    p.add_argument('--model', default='large-v3-turbo', help='faster-whisper 模型；赶时间用 small')
    p.add_argument('--lang', help='来源语言代码（en / ja / zh…）；不给就自动侦测')
    p.add_argument('--force', action='store_true', help='中文来源时覆盖既有 zh.json')
    p.set_defaults(fn=cmd_transcribe)

    p = sub.add_parser('build', help='zh.json → ASS + SRT')
    p.add_argument('--out', required=True)
    p.add_argument('--name', help='输出档名（预设 video）')
    p.add_argument('--style', choices=['outline', 'plate'], default='outline')
    p.add_argument('--bilingual', action='store_true', help='中文下方加小字原文')
    p.add_argument('--position', choices=['bottom', 'top'], default='bottom')
    p.add_argument('--margin-v', type=int, help='字幕离画面边缘的距离（px），避开原片既有字幕时用')
    p.set_defaults(fn=cmd_build)

    p = sub.add_parser('still', help='出带字幕的检查静帧')
    p.add_argument('--out', required=True)
    p.add_argument('--t', type=float, action='append', help='时间点（秒），可多次')
    p.add_argument('--auto', type=int, default=4, help='没给 --t 时自动挑几张（含最长的一条）')
    p.set_defaults(fn=cmd_still)

    p = sub.add_parser('burn', help='烧录字幕成片（使用者说「汇出」才跑）')
    p.add_argument('--out', required=True)
    p.add_argument('--crf', type=int, default=18)
    p.set_defaults(fn=cmd_burn)

    a = ap.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
