#!/usr/bin/env node
// 口播模式 ⑦ 专案骨架：shotlist.json + timing.json → 可跑的 Remotion 专案
//
//   node scaffold-narration.mjs [--out <project>] [--style finance|tech|travel|life]
//        [--landscape] [--force]
//
// 前置：audio/vo.wav、audio/timing.json、src/shotlist.json 已就位（⑤ 之后）。
// 产出：package.json / tsconfig / remotion.config.ts、src/{index,Root,Main,timeline,theme,audio}.ts(x)、
//       src/scenes/<id>.tsx（每镜一个占位场景，已接好素材与 SlowPush）、src/lib/（timing / Subtitles /
//       SlowPush / SourceStrip 的拷贝）、public/vo/vo.wav、src/timing.json。
// 已存在的档案不覆盖（--force 才覆盖）；timeline.ts 与 timing.json 每次都重写——它们是生成物。
// 不渲染任何东西：制作期只出静帧，使用者说汇出才整片渲染。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const one = (name, fallback) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 ? args.splice(k, 2)[1] : fallback;
};
const flag = (name) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 && !!args.splice(k, 1);
};
const out = path.resolve(one('out', '.'));
const style = one('style', 'finance');
const landscape = flag('landscape');
const force = flag('force');
const SKILL = fileURLToPath(new URL('../../', import.meta.url));
const P = (...p) => path.join(out, ...p);

// narration-mode.md §风格档
const STYLES = {
  finance: { bg: '#0e1116', ink: '#f2f0ea', accent: '#e0b04b', up: '#e5484d', down: '#30a46c', plate: 'rgba(14,17,22,0.82)', radius: 6, display: '"Noto Serif TC", "Songti TC", serif', body: '"Noto Sans TC", "PingFang TC", sans-serif', frame: 'hairline' },
  tech: { bg: '#0a0c14', ink: '#eef1f7', accent: '#5b8cff', up: '#9b7bff', down: '#5b8cff', plate: 'rgba(10,12,20,0.82)', radius: 14, display: '"Noto Sans TC", "PingFang TC", sans-serif', body: '"Noto Sans TC", "PingFang TC", sans-serif', frame: 'hairline' },
  travel: { bg: '#f4efe6', ink: '#22201c', accent: '#d2572b', up: '#d2572b', down: '#2f6f8f', plate: 'rgba(34,32,28,0.80)', radius: 4, display: '"Noto Serif TC", "Songti TC", serif', body: '"Noto Sans TC", "PingFang TC", sans-serif', frame: 'paper' },
  life: { bg: '#faf7f2', ink: '#2a2622', accent: '#3f8f6b', up: '#e08a3c', down: '#3f8f6b', plate: 'rgba(42,38,34,0.78)', radius: 20, display: '"Noto Sans TC", "PingFang TC", sans-serif', body: '"Noto Sans TC", "PingFang TC", sans-serif', frame: 'paper' },
};
if (!STYLES[style]) {
  console.error(`--style 只能是 ${Object.keys(STYLES).join(' | ')}`);
  process.exit(1);
}

const need = ['audio/vo.wav', 'audio/timing.json', 'src/shotlist.json'].filter((f) => !fs.existsSync(P(f)));
if (need.length) {
  console.error(`缺：${need.join('、')}（先完成 ②③⑤）`);
  process.exit(1);
}
const timing = JSON.parse(fs.readFileSync(P('audio/timing.json'), 'utf8'));
const rawShots = JSON.parse(fs.readFileSync(P('src/shotlist.json'), 'utf8'));
const shots = rawShots.shots || rawShots;
const configFile = path.join(SKILL, 'narration.config.json');
const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
const article = fs.existsSync(P('sources/article.json')) ? JSON.parse(fs.readFileSync(P('sources/article.json'), 'utf8')) : {};

const write = (rel, content, { generated = false } = {}) => {
  if (fs.existsSync(P(rel)) && !force && !generated) return console.log(`  保留 ${rel}`);
  fs.mkdirSync(path.dirname(P(rel)), { recursive: true });
  fs.writeFileSync(P(rel), content);
  console.log(`  写入 ${rel}`);
};
const pascal = (id) => `Scene${String(id).replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c || '').toUpperCase()).replace(/^./, (c) => c.toUpperCase())}`;
const [W, H] = landscape ? [1920, 1080] : [1080, 1920];
const name = path.basename(out).replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() || 'narration-video';
const compId = name.split('-').filter(Boolean).map((s) => s[0].toUpperCase() + s.slice(1)).join('') || 'Narration';

// ── 专案档 ──
write('package.json', `${JSON.stringify({
  name, version: '1.0.0', private: true,
  scripts: { dev: 'remotion studio src/index.ts', still: `remotion still src/index.ts ${compId}`, render: `remotion render src/index.ts ${compId} out/final.mp4` },
  dependencies: { '@remotion/cli': '4.0.484', react: '19.2.7', 'react-dom': '19.2.7', remotion: '4.0.484' },
  devDependencies: { '@types/react': '19.2.17', playwright: '^1.50.0', typescript: '6.0.3' },
}, null, 2)}\n`);
write('tsconfig.json', `${JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, noEmit: true, lib: ['DOM', 'ES2022'] }, include: ['src'] }, null, 2)}\n`);
write('remotion.config.ts', `import { Config } from '@remotion/cli/config';\n\nConfig.setVideoImageFormat('jpeg');\nConfig.setOverwriteOutput(true);\nConfig.setChromiumOpenGlRenderer('angle');\nConfig.setConcurrency(4);\n`);
write('.gitignore', 'node_modules/\nout/\nassets/candidates/\n');

// ── lib 拷贝（assets/lib 的组件 copy 进专案后可自由改） ──
for (const f of ['timing.ts', 'Subtitles.tsx', 'SlowPush.tsx', 'SourceStrip.tsx']) {
  write(`src/lib/${f}`, fs.readFileSync(path.join(SKILL, 'assets/lib', f), 'utf8'));
}

// ── 生成物：timing.json + timeline.ts（唯一时间事实源） ──
write('src/timing.json', `${JSON.stringify(timing)}\n`, { generated: true });
fs.mkdirSync(P('public/vo'), { recursive: true });
fs.copyFileSync(P('audio/vo.wav'), P('public/vo/vo.wav'));

const lines = new Map(timing.lines.map((l) => [l.i, l]));
const fps = timing.fps || 30;
const LEAD = 0.3; // 片头留白（秒）：第一句前给画面一口气
let cursor = 0;
const table = shots.map((s, n) => {
  const first = lines.get(s.lines[0]);
  const last = lines.get(s.lines[s.lines.length - 1]);
  if (!first || !last) throw new Error(`${s.id}：lines ${JSON.stringify(s.lines)} 不在 timing.json`);
  // 镜头边界落在句间气口的中点；末镜 = 末句 end + hold
  const next = shots[n + 1] && lines.get(shots[n + 1].lines[0]);
  const endSec = next ? (last.end + next.start) / 2 : last.end + (s.hold ?? 0.6);
  const from = cursor;
  const to = Math.round((endSec + LEAD) * fps);
  cursor = to;
  return { id: s.id, from, duration: to - from };
});
write('src/timeline.ts', `// 生成物——勿手改：node <skill>/assets/scripts/scaffold-narration.mjs 由 shotlist.json + timing.json 重算。
// 全片时间的唯一事实源：镜头边界落在句间气口中点；配音整轨自 VO_FROM 帧起播。
import data from './timing.json';
import { createTiming, type Timing } from './lib/timing';

export const FPS = ${fps};
export const VO_FROM = ${Math.round(LEAD * fps)};
export const SHOTS = {
${table.map((t) => `  ${JSON.stringify(t.id)}: { from: ${t.from}, duration: ${t.duration} },`).join('\n')}
} as const;
export type ShotId = keyof typeof SHOTS;
export const TOTAL = ${cursor};

export const timing = data as Timing;
const q = createTiming(timing);
/** 词锚 → 全片绝对帧。 */
export const at = (line: number, word: string, nth = 1) => VO_FROM + q.f(q.tWord(line, word, nth));
/** 词锚 → 所属镜头内的相对帧（场景里用这个）。 */
export const atIn = (shot: ShotId, line: number, word: string, nth = 1) => at(line, word, nth) - SHOTS[shot].from;
export const lineIn = (shot: ShotId, line: number) => VO_FROM + q.f(q.tLine(line)) - SHOTS[shot].from;
`, { generated: true });

// ── theme ──
const T = STYLES[style];
write('src/theme.ts', `// 本片风格档（narration-mode.md §风格档：${style}）。卡进片时只换这里的 token；不改时序、缓动、几何比例、层级。
export const W = ${W};
export const H = ${H};
export const C = {
  bg: '${T.bg}',
  ink: '${T.ink}',
  accent: '${T.accent}',
  up: '${T.up}',
  down: '${T.down}',
  plate: '${T.plate}',
};
export const FONT = { display: '${T.display}', body: '${T.body}' };
export const RADIUS = ${T.radius};
export const FRAME_STYLE = '${T.frame}' as const; // clip-frame-reveal 的框式，全片只用这一种
export const SOURCE_LABEL = ${JSON.stringify(article.source_label || article.site || '')};
export const SHOW_SOURCE_STRIP = ${config.show_source_strip !== false}; // narration.config.json 的 show_source_strip
`);

// ── 场景占位 ──
for (const s of shots) {
  const comp = pascal(s.id);
  const file = s.material?.file ? s.material.file.replace(/^public\//, '') : null;
  const mode = s.material?.mode;
  const needsStrip = ['screenshot'].includes(mode) || /assets\/article\//.test(s.material?.file || '');
  const media = !file ? `<AbsoluteFill style={{ background: C.bg }} />`
    : mode === 'video' ? `<OffthreadVideo src={staticFile(${JSON.stringify(file)})} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />`
      : `<Img src={staticFile(${JSON.stringify(file)})} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />`;
  const anchors = (s.anchors || []).map((a) => `  // ${a.action || '动作'} → atIn(${JSON.stringify(s.id)}, ${a.line ?? s.lines[0]}, ${JSON.stringify(a.word)})`).join('\n');
  write(`src/scenes/${comp}.tsx`, `// ${s.id}｜${s.intent || ''}
// 卡：${s.card?.name || '（未选）'}　素材：${mode || '—'} ${s.material?.file || ''}
// 转入：${s.transition_in || '（首镜）'}
// 占位场景：素材 + 极缓相机已接好。照卡全文与 demo 源码把主角动效做进来；时间点只准用 atIn()。
import React from 'react';
import { AbsoluteFill${mode === 'video' && file ? ', OffthreadVideo' : file ? ', Img' : ''}${file ? ', staticFile' : ''} } from 'remotion';
import { SlowPush } from '../lib/SlowPush';
${needsStrip ? "import { SourceStrip } from '../lib/SourceStrip';\n" : ''}import { C${needsStrip ? ', FONT, SHOW_SOURCE_STRIP, SOURCE_LABEL' : ''} } from '../theme';
import { SHOTS${anchors ? ', atIn' : ''} } from '../timeline';

export const ${comp}: React.FC = () => {
  const { duration } = SHOTS[${JSON.stringify(s.id)}];
${anchors || '  // （本镜没有词锚）'}
${anchors ? `  void atIn;\n` : ''}  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <SlowPush duration={duration}>
        ${media}
      </SlowPush>
${needsStrip ? `      {SHOW_SOURCE_STRIP && SOURCE_LABEL ? <SourceStrip label={SOURCE_LABEL} duration={duration} plate={C.plate} accent={C.accent} fontFamily={FONT.body} /> : null}\n` : ''}    </AbsoluteFill>
  );
};
`);
}

// ── audio / Main / Root / index ──
write('src/audio.tsx', `// 声音：人声整轨 + 音效（每个主要入场一记，≤ 0.35，只放句间气口）+ BGM 垫底（≤ 0.15，不卡拍）。
import React from 'react';
import { Audio, Sequence, staticFile } from 'remotion';
import { VO_FROM } from './timeline';

// { from: 全片绝对帧（用 timeline.ts 的 at() 算）, src: 'sfx/xxx.mp3', volume }
export const SFX: { from: number; src: string; volume: number }[] = [];
export const BGM: string | null = null; // 例：'bgm/house-vibez.mp3'

export const AudioTracks: React.FC<{ bgm: boolean }> = ({ bgm }) => (
  <>
    <Sequence from={VO_FROM}>
      <Audio src={staticFile('vo/vo.wav')} />
    </Sequence>
    {SFX.map((s, k) => (
      <Sequence key={k} from={s.from} durationInFrames={90}>
        <Audio src={staticFile(s.src)} volume={Math.min(s.volume, 0.35)} />
      </Sequence>
    ))}
    {bgm && BGM ? <Audio src={staticFile(BGM)} volume={0.15} loop /> : null}
  </>
);
`);
write('src/Main.tsx', `import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { AudioTracks } from './audio';
import { Subtitles } from './lib/Subtitles';
import { C, FONT } from './theme';
import { SHOTS, VO_FROM, timing } from './timeline';
${shots.map((s) => `import { ${pascal(s.id)} } from './scenes/${pascal(s.id)}';`).join('\n')}

export const Main: React.FC<{ bgm: boolean }> = ({ bgm }) => (
  <AbsoluteFill style={{ background: C.bg }}>
${shots.map((s) => `    <Sequence from={SHOTS[${JSON.stringify(s.id)}].from} durationInFrames={SHOTS[${JSON.stringify(s.id)}].duration}><${pascal(s.id)} /></Sequence>`).join('\n')}
    {/* 关键词高亮全片 ≤ 3 次：highlights={[{ line: 2, word: '…' }]} */}
    <Subtitles timing={timing} offset={VO_FROM} accent={C.accent} plate={C.plate} fontFamily={FONT.body} />
    <AudioTracks bgm={bgm} />
  </AbsoluteFill>
);
`);
write('src/Root.tsx', `import React from 'react';
import { Composition } from 'remotion';
import { Main } from './Main';
import { H, W } from './theme';
import { FPS, TOTAL } from './timeline';

export const Root: React.FC = () => (
  <Composition id="${compId}" component={Main} durationInFrames={TOTAL} fps={FPS} width={W} height={H} defaultProps={{ bgm: true }} />
);
`);
write('src/index.ts', `import { registerRoot } from 'remotion';\nimport { Root } from './Root';\n\nregisterRoot(Root);\n`);
write('props-nobgm.json', '{ "bgm": false }\n');

console.log(`\n→ ${out}\n   ${shots.length} 镜，${cursor}f（${(cursor / fps).toFixed(1)}s），${W}×${H}，风格档 ${style}`);
console.log('下一步：npm i → 先做第一个有素材与字幕的镜头 → npx remotion still src/index.ts ' + compId + ' out/qa/first.png --frame=<n> 给使用者看。不要整片渲染。');
