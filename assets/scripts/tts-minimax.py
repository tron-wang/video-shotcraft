#!/usr/bin/env python3
"""口播模式 ② 配音：script/lines.json → audio/line-{i}.mp3 + audio/vo.wav + audio/vo-map.json

    python tts-minimax.py --lines script/lines.json [--out-dir audio] [--gap 0.35]
        [--only 3,5]        只重合成这几句（改稿后用），其余沿用现有 line-*.mp3
        [--concat-only]     不调 API，只把现有 line-*.mp3 重新拼接（自带逐句配音时也走这条）
        [--speed 1.0] [--model speech-02-hd] [--env PATH]

逐句合成的原因：任一句改稿只重合成那一句。稿文与音色的哈希记在 vo-map.json，
未变的句子自动跳过，不重复计费。

金钥读 skill 根目录 .env：minimax_api_key / minimax_voice_id（国际站 api.minimax.io）。
只用标准库 + ffmpeg。MiniMax 输出音档的商用条款依使用者帐号方案，请自行确认。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

API = 'https://api.minimax.io/v1/t2a_v2'
OUT_SR = 48000
SKILL_ROOT = Path(__file__).resolve().parents[2]


def read_env(path: Path) -> dict:
    if not path.exists():
        sys.exit(f'找不到 {path}（需要 minimax_api_key 与 minimax_voice_id）')
    env = {}
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip().lower()] = v.strip().strip('"\'')
    return env


def synth(text: str, key: str, voice: str, model: str, speed: float) -> bytes:
    body = {
        'model': model, 'text': text, 'stream': False, 'language_boost': 'Chinese',
        'voice_setting': {'voice_id': voice, 'speed': speed, 'vol': 1.0, 'pitch': 0},
        'audio_setting': {'sample_rate': 32000, 'bitrate': 128000, 'format': 'mp3', 'channel': 1},
    }
    req = urllib.request.Request(API, data=json.dumps(body).encode('utf-8'), headers={
        'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read())
    base = payload.get('base_resp') or {}
    if base.get('status_code') != 0 or not (payload.get('data') or {}).get('audio'):
        sys.exit(f"MiniMax 合成失败：{base.get('status_code')} {base.get('status_msg')}")
    return bytes.fromhex(payload['data']['audio'])


def decode(path: Path) -> bytes:
    """→ 48k 单声道 s16le PCM。"""
    cmd = ['ffmpeg', '-v', 'error', '-i', str(path), '-f', 's16le', '-ac', '1', '-ar', str(OUT_SR), '-']
    return subprocess.run(cmd, check=True, capture_output=True).stdout


def rms_db(pcm: bytes) -> float:
    import array
    import math
    a = array.array('h', pcm)
    if not a:
        return -120.0
    return 10 * math.log10(sum(s * s for s in a) / len(a) / 32768 ** 2 + 1e-12)


def fingerprint(text: str, voice: str, model: str, speed: float) -> str:
    return hashlib.sha1(f'{model}|{voice}|{speed}|{text}'.encode('utf-8')).hexdigest()[:12]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--lines', required=True, type=Path)
    ap.add_argument('--out-dir', type=Path, default=Path('audio'))
    ap.add_argument('--gap', type=float, default=0.35, help='句间气口（秒）')
    ap.add_argument('--lead', type=float, default=0.0, help='片头静音（秒）')
    ap.add_argument('--only', default='', help='逗号分隔的句号，强制重合成')
    ap.add_argument('--concat-only', action='store_true')
    ap.add_argument('--speed', type=float, default=1.0)
    ap.add_argument('--model', default='speech-02-hd')
    ap.add_argument('--env', type=Path, default=SKILL_ROOT / '.env')
    args = ap.parse_args()

    lines = json.loads(args.lines.read_text(encoding='utf-8'))
    args.out_dir.mkdir(parents=True, exist_ok=True)
    map_path = args.out_dir / 'vo-map.json'
    old = {m['i']: m for m in json.loads(map_path.read_text(encoding='utf-8'))['lines']} if map_path.exists() else {}
    force = {int(x) for x in args.only.split(',') if x.strip()}

    key = voice = ''
    if not args.concat_only:
        env = read_env(args.env)
        key, voice = env.get('minimax_api_key', ''), env.get('minimax_voice_id', '')
        if not key or not voice:
            sys.exit(f'{args.env} 缺 minimax_api_key 或 minimax_voice_id')

    pcm_all = bytearray(b'\x00\x00' * int(args.lead * OUT_SR))
    entries, problems = [], []
    for n, ln in enumerate(lines):
        i, f = ln['i'], args.out_dir / f"line-{ln['i']}.mp3"
        fp = fingerprint(ln['text'], voice, args.model, args.speed)
        if args.concat_only:
            if not f.exists():
                sys.exit(f'--concat-only 但缺 {f}')
            fp = old.get(i, {}).get('hash', '')
        elif i in force or not f.exists() or old.get(i, {}).get('hash') != fp:
            f.write_bytes(synth(ln['text'], key, voice, args.model, args.speed))
            print(f'  合成 L{i}  {ln["text"][:24]}')
        else:
            print(f'  沿用 L{i}（稿与音色未变）')

        pcm = decode(f)
        dur = len(pcm) / 2 / OUT_SR
        if dur <= 0:
            problems.append(f'L{i} 音档时长为 0')
        # 截断检查：正常收尾的句子，尾端 0.2s 应已衰减
        tail = rms_db(pcm[-int(0.2 * OUT_SR) * 2:])
        if tail > -30:
            problems.append(f'L{i} 尾端 0.2s 仍有 {tail:.1f} dB，疑似截断')

        start = len(pcm_all) / 2 / OUT_SR
        pcm_all += pcm
        entries.append({'i': i, 'file': f.name, 'start': round(start, 4), 'end': round(start + dur, 4),
                        'duration': round(dur, 4), 'hash': fp})
        if n < len(lines) - 1:
            pcm_all += b'\x00\x00' * int(args.gap * OUT_SR)

    vo = args.out_dir / 'vo.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ac', '1', '-ar', str(OUT_SR), '-i', '-', str(vo)],
                   input=bytes(pcm_all), check=True)
    total = len(pcm_all) / 2 / OUT_SR
    map_path.write_text(json.dumps({'sample_rate': OUT_SR, 'gap': args.gap, 'total': round(total, 4),
                                    'lines': entries}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'→ {vo}  {total:.2f}s，{len(entries)} 句；→ {map_path}')
    if problems:
        print('检查未过：\n  ' + '\n  '.join(problems))
        sys.exit(2)


if __name__ == '__main__':
    main()
