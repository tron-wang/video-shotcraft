#!/usr/bin/env node
// 口播模式 ④ 素材采集：多源搜候选 → Agent 看图选片 → 下载 + manifest → 配额检查 → 标注清单
//
//   node source-media.mjs [--out <project>] [--orientation portrait|landscape] [--only <segment>]
//        读 assets/needs.json，逐段逐概念词并行查各来源，候选存 assets/candidates/<segment>/
//        （candidates.json + 缩图 + sheet.jpg 联络表，给 Agent 用眼睛选）
//   node source-media.mjs --pick <segment> <candidateId> [--shot S03]
//        下载原档到 public/media/，写 assets/manifest.json（Unsplash 先呼叫 download_location）
//   node source-media.mjs --check      对照 src/shotlist.json（没有则对照 needs.json）做配额检查
//   node source-media.mjs --credits    只收实际进成片的素材 → out/CREDITS.md
//
// assets/needs.json（分段草案，由 Agent 写）：
//   { "segments": [ { "id": "s1-hook", "lines": [1], "role": "hook", "mode": "video",
//                     "queries": ["students queue outside building", "crowd waiting line campus"] } ] }
//   mode ∈ video | photo | screenshot | chart | text；只有 video / photo 会上网搜。
//
// 来源与授权（规格 ④.2）。金钥读 skill 根目录 .env（栏位名不分大小写），缺金钥的来源自动跳过：
//   Pexels    pexels_api_key        影片+照片  Pexels License，免署名
//   Pixabay   pixabay_api_key       影片+照片  Content License，免署名
//   Unsplash  unsplash_access_key   照片       可商用；API 条款要求标注摄影师与 Unsplash → attribution_required
//   Openverse 免金钥                照片       只取 license=cc0,pdm，其余一律过滤
// 不接：Wikimedia Commons（CC-BY-SA 有相同方式分享义务）、任何搜寻引擎图片结果。
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCredits, entryProblems, openverseAllowed, rankCandidates } from './lib/media-rules.mjs';
import { readJson, upsertManifest, writeJson } from './lib/page-utils.mjs';

const args = process.argv.slice(2);
const one = (name, fallback) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 ? args.splice(k, 2)[1] : fallback;
};
const flag = (name) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 && !!args.splice(k, 1);
};
const outDir = path.resolve(one('out', '.'));
const P = (...p) => path.join(outDir, ...p);
const PER_QUERY = 8;
const UA = 'video-shotcraft-narration/1.0';

const env = (() => {
  const file = fileURLToPath(new URL('../../.env', import.meta.url));
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim().toLowerCase(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
})();

// ───────────────────────── 快取与节流 ─────────────────────────

const cacheDir = P('assets', 'candidates', '.cache');
const cached = async (key, fn) => {
  const file = path.join(cacheDir, `${crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); // 候选结果存档后不重查
  const data = await fn();
  writeJson(file, data);
  return data;
};

// 每个来源串行 + 最小间隔。Unsplash Demo 金钥每小时 50 次：请求时间戳落盘，跨次执行也算。
const GAP_MS = { pexels: 250, pixabay: 700, unsplash: 1500, openverse: 1100 };
const chains = {};
const throttled = (source, fn) => {
  const run = async () => {
    if (source === 'unsplash') {
      const file = path.join(cacheDir, 'unsplash-requests.json');
      const recent = readJson(file, []).filter((t) => Date.now() - t < 3600e3);
      if (recent.length >= 45) throw new Error('Unsplash 本小时请求已近 50 次上限，稍后再跑（已查过的概念词有快取，不会重查）');
      writeJson(file, [...recent, Date.now()]);
    }
    const out = await fn();
    await new Promise((r) => setTimeout(r, GAP_MS[source]));
    return out;
  };
  chains[source] = (chains[source] || Promise.resolve()).then(run, run);
  return chains[source];
};

const getJson = async (url, headers = {}) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
  return res.json();
};

// ───────────────────────── 各来源 → 统一候选格式 ─────────────────────────
// { id, source, kind, width, height, duration?, thumb, file_url, source_url, author, author_url,
//   license, license_url, attribution_required, credit, download_location?, rank }

const LICENSES = {
  pexels: ['Pexels License（免署名可商用）', 'https://www.pexels.com/license/'],
  pixabay: ['Pixabay Content License（免署名可商用）', 'https://pixabay.com/service/license-summary/'],
  unsplash: ['Unsplash License（可商用；API 条款要求标注）', 'https://unsplash.com/license'],
};
const lic = (s) => ({ license: LICENSES[s][0], license_url: LICENSES[s][1] });

const SOURCES = {
  pexels: {
    key: 'pexels_api_key',
    kinds: ['video', 'photo'],
    async search(q, kind, orient) {
      const h = { Authorization: env.pexels_api_key };
      const qs = `query=${encodeURIComponent(q)}&orientation=${orient}&per_page=${PER_QUERY}`;
      if (kind === 'photo') {
        const d = await getJson(`https://api.pexels.com/v1/search?${qs}`, h);
        return d.photos.map((p, rank) => ({
          id: `pexels-${p.id}`, source: 'pexels', kind, width: p.width, height: p.height, thumb: p.src.medium, file_url: p.src.original,
          source_url: p.url, author: p.photographer, author_url: p.photographer_url, ...lic('pexels'), attribution_required: false, credit: null, rank,
        }));
      }
      const d = await getJson(`https://api.pexels.com/videos/search?${qs}`, h);
      return d.videos.map((v, rank) => {
        const best = v.video_files.filter((f) => f.width && f.height).sort((a, b) => Math.min(b.width, b.height) - Math.min(a.width, a.height))
          .find((f) => Math.min(f.width, f.height) <= 2160) || v.video_files[0];
        return {
          id: `pexels-v${v.id}`, source: 'pexels', kind, width: best.width, height: best.height, duration: v.duration, thumb: v.image, file_url: best.link,
          source_url: v.url, author: v.user?.name, author_url: v.user?.url, ...lic('pexels'), attribution_required: false, credit: null, rank,
        };
      });
    },
  },
  pixabay: {
    key: 'pixabay_api_key',
    kinds: ['video', 'photo'],
    async search(q, kind, orient) {
      const base = `key=${env.pixabay_api_key}&q=${encodeURIComponent(q)}&per_page=${PER_QUERY}&safesearch=true`;
      if (kind === 'photo') {
        const d = await getJson(`https://pixabay.com/api/?${base}&image_type=photo&orientation=${orient === 'portrait' ? 'vertical' : 'horizontal'}`);
        return d.hits.map((p, rank) => {
          // 未审核金钥只拿得到 largeImageURL（长边 1280）；拿得到 fullHDURL / imageURL 就用大的
          const url = p.imageURL || p.fullHDURL || p.largeImageURL;
          const long = p.imageURL ? Math.max(p.imageWidth, p.imageHeight) : p.fullHDURL ? 1920 : 1280;
          const k = long / Math.max(p.imageWidth, p.imageHeight);
          return {
            id: `pixabay-${p.id}`, source: 'pixabay', kind, width: Math.round(p.imageWidth * k), height: Math.round(p.imageHeight * k), thumb: p.webformatURL, file_url: url,
            source_url: p.pageURL, author: p.user, author_url: `https://pixabay.com/users/${p.user}-${p.user_id}/`, ...lic('pixabay'), attribution_required: false, credit: null, rank,
          };
        });
      }
      const d = await getJson(`https://pixabay.com/api/videos/?${base}`);
      return d.hits.map((v, rank) => {
        const f = v.videos.large?.url ? v.videos.large : v.videos.medium;
        return {
          id: `pixabay-v${v.id}`, source: 'pixabay', kind, width: f.width, height: f.height, duration: v.duration, thumb: f.thumbnail || v.videos.tiny?.thumbnail, file_url: f.url,
          source_url: v.pageURL, author: v.user, author_url: `https://pixabay.com/users/${v.user}-${v.user_id}/`, ...lic('pixabay'), attribution_required: false, credit: null, rank,
        };
      });
    },
  },
  unsplash: {
    key: 'unsplash_access_key',
    kinds: ['photo'],
    async search(q, kind, orient) {
      const d = await getJson(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&orientation=${orient}&per_page=${PER_QUERY}&content_filter=high`,
        { Authorization: `Client-ID ${env.unsplash_access_key}`, 'Accept-Version': 'v1' });
      return d.results.map((p, rank) => {
        const w = Math.min(p.width, 3000);
        return {
          id: `unsplash-${p.id}`, source: 'unsplash', kind, width: w, height: Math.round((p.height * w) / p.width), thumb: p.urls.small, file_url: `${p.urls.raw}&w=${w}&q=90&fm=jpg`,
          source_url: p.links.html, author: p.user.name, author_url: p.user.links.html, ...lic('unsplash'),
          attribution_required: true, credit: `Photo by ${p.user.name} on Unsplash`, download_location: p.links.download_location, rank,
        };
      });
    },
  },
  openverse: {
    key: null,
    kinds: ['photo'],
    async search(q, kind, orient) {
      const d = await getJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm&page_size=${PER_QUERY}&aspect_ratio=${orient === 'portrait' ? 'tall' : 'wide'}&mature=false`);
      return d.results.filter(openverseAllowed).map((p, rank) => ({
        id: `openverse-${p.id}`, source: 'openverse', kind, width: p.width, height: p.height, thumb: p.thumbnail, file_url: p.url,
        source_url: p.foreign_landing_url, author: p.creator || '(unknown)', author_url: p.creator_url || null,
        license: p.license === 'cc0' ? 'CC0 1.0（公有领域贡献）' : 'Public Domain Mark 1.0', license_url: p.license_url, attribution_required: false, credit: null, rank,
      }));
    },
  },
};

const download = async (url, file) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
};

// ───────────────────────── search ─────────────────────────

const runSearch = async () => {
  const needs = readJson(P('assets', 'needs.json'));
  if (!needs) throw new Error('缺 assets/needs.json（分段草案：每段 2–4 个英文视觉概念词 + mode），格式见本脚本开头');
  const orient = one('orientation', needs.orientation || 'portrait');
  const only = one('only');
  const active = Object.entries(SOURCES).filter(([name, s]) => {
    if (!s.key || env[s.key]) return true;
    console.warn(`  跳过 ${name}：.env 没有 ${s.key}`);
    return false;
  });

  for (const seg of needs.segments.filter((s) => !only || s.id === only)) {
    if (!['video', 'photo'].includes(seg.mode)) {
      console.log(`${seg.id}  mode=${seg.mode}，不上网搜（screenshot → capture-page.mjs；chart / text → 自产）`);
      continue;
    }
    // 降级阶梯的前两阶一起查：要影片的段同时备照片
    const kinds = seg.mode === 'video' ? ['video', 'photo'] : ['photo'];
    const jobs = [];
    for (const q of seg.queries) for (const kind of kinds) for (const [name, s] of active) {
      if (!s.kinds.includes(kind)) continue;
      jobs.push(cached(`${name}|${kind}|${orient}|${q}`, () => throttled(name, () => s.search(q, kind, orient)))
        .then((list) => list.map((c) => ({ ...c, query: q })))
        .catch((err) => (console.warn(`  ${name}「${q}」${kind}：${err.message}`), [])));
    }
    const all = (await Promise.all(jobs)).flat();
    const uniq = [...new Map(all.map((c) => [c.id, c])).values()];
    const ranked = kinds.flatMap((k) => rankCandidates(uniq.filter((c) => c.kind === k), orient));
    // 达标的够 3 个就不留不达标的
    const ok = ranked.filter((c) => !c.below_min);
    const keep = (ok.length >= 3 ? ok : ranked).slice(0, 24);

    const dir = P('assets', 'candidates', seg.id);
    fs.mkdirSync(dir, { recursive: true });
    await Promise.all(keep.map(async (c, n) => {
      c.n = n + 1;
      c.preview = `${String(n + 1).padStart(2, '0')}-${c.id}.jpg`;
      if (c.thumb && !fs.existsSync(path.join(dir, c.preview))) await download(c.thumb, path.join(dir, c.preview)).catch(() => (c.preview = null));
    }));
    writeJson(path.join(dir, 'candidates.json'), { segment: seg.id, role: seg.role, mode: seg.mode, queries: seg.queries, orientation: orient, candidates: keep });
    contactSheet(dir, keep);
    const by = (k) => keep.filter((c) => c.kind === k).length;
    console.log(`${seg.id}  ${keep.length} 笔候选（影片 ${by('video')}、照片 ${by('photo')}）${keep.length ? '' : '  ← 无候选：改概念词，或往下降级（截图 → 自产图表）'}`);
  }
  console.log('\n选片（Agent 看 sheet.jpg 与缩图）：主体与概念词一致、无可辨识品牌或人脸特写、色调与风格档相近、影片长度 ≥ 该镜时长。\n选定：node source-media.mjs --pick <segment> <candidateId> [--shot S03]');
};

/** 联络表：4 栏缩图，左上角编号 = candidates.json 的 n。没有 ffmpeg 就略过。 */
const contactSheet = (dir, cands) => {
  const files = cands.filter((c) => c.preview).slice(0, 24);
  if (!files.length) return;
  const cols = 4, w = 360, h = 480;
  const inputs = files.flatMap((c) => ['-i', path.join(dir, c.preview)]);
  const label = (c) => `drawtext=text='${c.n} ${c.source}${c.kind === 'video' ? ' ▶' : ''}':x=8:y=8:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=6`;
  const build = (withLabel) => {
    const scaled = files.map((c, k) => `[${k}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x222222${withLabel ? `,${label(c)}` : ''}[v${k}]`);
    const layout = files.map((_, k) => `${(k % cols) * w}_${Math.floor(k / cols) * h}`).join('|');
    const stack = files.length > 1 ? `${files.map((_, k) => `[v${k}]`).join('')}xstack=inputs=${files.length}:layout=${layout}:fill=0x222222[out]` : '[v0]null[out]';
    execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', [...scaled, stack].join(';'), '-map', '[out]', '-frames:v', '1', '-q:v', '4', path.join(dir, 'sheet.jpg')], { stdio: 'pipe' });
  };
  try {
    build(true);
  } catch {
    try { build(false); } catch { /* 没有 ffmpeg：Agent 逐张看缩图 */ }
  }
};

// ───────────────────────── pick ─────────────────────────

const runPick = async (segment, candId) => {
  const shot = one('shot');
  const file = P('assets', 'candidates', segment, 'candidates.json');
  const c = readJson(file, { candidates: [] }).candidates.find((x) => x.id === candId || String(x.n) === candId);
  if (!c) throw new Error(`${file} 里没有候选 ${candId}`);

  let tracked = false;
  if (c.source === 'unsplash') {
    // API 条款：实际选用时先打 download_location（下载计数），只列候选时不打
    await throttled('unsplash', () => getJson(c.download_location, { Authorization: `Client-ID ${env.unsplash_access_key}`, 'Accept-Version': 'v1' }));
    tracked = true;
  }
  const ext = c.kind === 'video' ? 'mp4' : (path.extname(new URL(c.file_url).pathname).slice(1).toLowerCase().replace('jpeg', 'jpg') || 'jpg');
  const rel = `public/media/${segment}-${c.id}.${/^(jpg|png|webp|mp4|mov|avif)$/.test(ext) ? ext : 'jpg'}`;
  await download(c.file_url, P(rel));
  const { n, preview, score, rank, below_min, thumb, download_location, ...keep } = c;
  upsertManifest(P('assets', 'manifest.json'), [{
    ...keep, file: rel, segment, downloaded_at: new Date().toISOString(), used_in: shot ? [shot] : [],
    rights: 'stock', risk: 'none', ...(c.source === 'unsplash' ? { download_tracked: tracked } : {}),
  }]);
  console.log(`→ ${rel}  ${c.width}×${c.height}${c.duration ? ` ${c.duration}s` : ''}  ${c.license}${c.attribution_required ? `  [需标注：${c.credit}]` : ''}`);
  if (below_min) console.warn('  解析度低于下限（影片 1080p / 照片短边 1600）：成片里不要放大使用');
};

// ───────────────────────── check / credits ─────────────────────────

const shotsOf = () => {
  const sl = readJson(P('src', 'shotlist.json'));
  if (sl) return { from: 'src/shotlist.json', shots: (sl.shots || sl).map((s) => ({ id: s.id, mode: s.material?.mode, files: [s.material?.file, ...(s.material?.files || [])].filter(Boolean) })) };
  const needs = readJson(P('assets', 'needs.json'));
  if (!needs) return null;
  const m = readJson(P('assets', 'manifest.json'), { entries: [] }).entries;
  return { from: 'assets/needs.json（尚无 shotlist，按分段草案检查）', shots: needs.segments.map((s) => ({ id: s.id, mode: s.mode, files: m.filter((e) => e.segment === s.id).map((e) => e.file) })) };
};

const runCheck = () => {
  const plan = shotsOf();
  if (!plan) throw new Error('缺 src/shotlist.json 或 assets/needs.json');
  const manifest = readJson(P('assets', 'manifest.json'), { entries: [] }).entries;
  const byFile = new Map(manifest.map((e) => [e.file, e]));
  const norm = (f) => (byFile.has(f) ? f : [...byFile.keys()].find((k) => k.endsWith(f.replace(/^\.?\/?(public\/)?/, ''))) || f);
  const fails = [];
  let pure = 0;
  for (const s of plan.shots) {
    const selfMade = ['chart', 'text'].includes(s.mode);
    if (selfMade && !s.files.length) { pure++; continue; }
    if (!s.files.length) { fails.push(`${s.id}：没有素材行（mode=${s.mode}）`); continue; }
    for (const f of s.files.map(norm)) {
      if (!fs.existsSync(P(f))) fails.push(`${s.id}：档案不存在 ${f}`);
      const e = byFile.get(f);
      if (!e) fails.push(`${s.id}：${f} 不在 manifest（没有 URL 的档案不准进成片）`);
      else entryProblems(e).forEach((p) => fails.push(`${s.id}：${f} ${p}`));
    }
  }
  if (pure > plan.shots.length / 3) fails.push(`纯动效镜 ${pure}/${plan.shots.length}，超过 1/3`);
  console.log(`配额检查（${plan.from}）：${plan.shots.length} 镜，纯动效 ${pure}，manifest ${manifest.length} 笔`);
  if (fails.length) {
    console.log(`FAIL\n  ${fails.join('\n  ')}`);
    process.exit(2);
  }
  console.log('PASS');
};

const runCredits = () => {
  const manifest = readJson(P('assets', 'manifest.json'), { entries: [] }).entries;
  const sl = readJson(P('src', 'shotlist.json'));
  let used = null;
  if (sl) {
    const files = (sl.shots || sl).flatMap((s) => [s.material?.file, ...(s.material?.files || [])]).filter(Boolean).map((f) => f.replace(/^\.?\/?(public\/)?/, ''));
    used = new Set(manifest.filter((e) => files.some((f) => e.file.endsWith(f))).map((e) => e.id));
  } else {
    // 尚无 shotlist：文章图片全量下载过，只收已指派到段落 / 镜头的
    used = new Set(manifest.filter((e) => e.segment || e.used_in?.length).map((e) => e.id));
  }
  fs.mkdirSync(P('out'), { recursive: true });
  const text = buildCredits(manifest, used);
  fs.writeFileSync(P('out', 'CREDITS.md'), text);
  const n = manifest.filter((e) => used.has(e.id) && e.attribution_required);
  console.log(`→ out/CREDITS.md  需标注 ${n.length} 笔（Unsplash ${n.filter((e) => e.source === 'unsplash').length}、文章图片 ${n.filter((e) => e.source === 'article').length}）${sl ? '' : '  [尚无 shotlist，按已指派素材计]'}`);
};

// ───────────────────────── main ─────────────────────────

try {
  if (flag('check')) runCheck();
  else if (flag('credits')) runCredits();
  else if (flag('pick')) await runPick(args[0], args[1]);
  else await runSearch();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
