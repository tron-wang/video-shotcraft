#!/usr/bin/env node
// 口播模式 ⓪ 取材：文章网址（或纯文字档）→ sources/ + assets/article/ + manifest
//
//   node fetch-article.mjs <url | path/to/article.md> [--out <project>] [--min-width 600]
//
// 产出（相对 --out，预设 cwd）：
//   sources/article.md      正文（frontmatter：url title site author published hero）
//   sources/article.json    同内容的机读版（图片清单含图说与权利判定）
//   sources/page-<slug>/    全页 2× 截图存证（page.png 或 tile-*.png）
//   sources/rights.md       头图与文内图片的权利判定（通讯社 / 图库字样 → risk: high）
//   sources/facts.md        骨架（只在不存在时建立；内容由 Agent 填，红线：没有来源句的数字不能进口播稿）
//   assets/article/NN.ext   原始解析度的头图与文内图
//   assets/manifest.json    文章图片条目（source: "article"）
//
// 已授权网域（skill 根目录 narration.config.json 的 trusted_domains）：图文视为已授权，
// 不需标注、不警示；图说里的通讯社字样只记备注。
import fs from 'node:fs';
import path from 'node:path';
import { articleImageRights, hostOf, isTrusted } from './lib/media-rules.mjs';
import { captureFullPage, hideOverlays, loadConfig, openPage, slugify, upsertManifest, wakeLazyContent, writeJson } from './lib/page-utils.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 ? args.splice(k, 2)[1] : fallback;
};
const outDir = path.resolve(opt('out', '.'));
const minWidth = Number(opt('min-width', 600));
const input = args[0];
if (!input) {
  console.error('用法：node fetch-article.mjs <url | article.md> [--out <project>]');
  process.exit(1);
}
const P = (...p) => path.join(outDir, ...p);
const config = loadConfig();

const FACTS_SKELETON = `# facts.md — 片中会说到的每个数字、人名、机构、日期

红线：**没有来源句的数字不能进口播稿。** 每条附原文来源句与截图档名。

| # | 事实（将出现在稿或画面里的写法） | 类型 | 来源句（原文照抄） | 出处 |
|---|---|---|---|---|
| 1 |  | 数字 / 人名 / 机构 / 日期 |  | sources/article.md · sources/page-…/page.png |
`;

const ensureFacts = () => {
  if (!fs.existsSync(P('sources', 'facts.md'))) fs.writeFileSync(P('sources', 'facts.md'), FACTS_SKELETON);
};

// ── 纯文字输入：直接存 article.md ──
if (!/^https?:\/\//.test(input)) {
  fs.mkdirSync(P('sources'), { recursive: true });
  const text = fs.readFileSync(input, 'utf8');
  fs.writeFileSync(P('sources', 'article.md'), text.startsWith('---') ? text : `---\nurl: null\nfetched_at: ${new Date().toISOString()}\n---\n\n${text}`);
  fs.writeFileSync(P('sources', 'rights.md'), '# rights.md\n\n来源是使用者提供的纯文字，没有文章图片。\n');
  ensureFacts();
  console.log(`→ ${P('sources', 'article.md')}（纯文字，无图片）`);
  process.exit(0);
}

const url = input;
const trusted = isTrusted(url, config.trusted_domains);
console.log(`抓取 ${url}${trusted ? '  [已授权网域]' : ''}`);
const { browser, context, page } = await openPage(url);
await wakeLazyContent(page);

// ── 页面内抽取：meta、正文容器、区块、图片 ──
const data = await page.evaluate((minW) => {
  const meta = (...names) => {
    for (const n of names) {
      const el = document.querySelector(`meta[property="${n}"], meta[name="${n}"]`);
      if (el?.content) return el.content.trim();
    }
    return null;
  };
  let ld = {};
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const flat = [JSON.parse(s.textContent)].flat().flatMap((x) => x['@graph'] || x);
      const art = flat.find((x) => /Article|NewsArticle|BlogPosting/.test([x['@type']].flat().join(' ')));
      if (art) ld = art;
    } catch { /* 坏掉的 JSON-LD 不理 */ }
  }
  const ldAuthor = [ld.author].flat().filter(Boolean).map((a) => (typeof a === 'string' ? a : a.name)).filter(Boolean).join('、');

  // 正文容器：直属 <p> 文字量最大的祖先。
  // 无限卷动的站（动区）会在下方接上下一篇文章：只计第一个 h1 与下一个 h1 之间的段落。
  const h1s = [...document.querySelectorAll('h1')];
  const nextH1 = h1s[1];
  const inMain = (p) => !nextH1 || !!(p.compareDocumentPosition(nextH1) & Node.DOCUMENT_POSITION_FOLLOWING);
  const score = new Map();
  for (const p of document.querySelectorAll('p')) {
    if (!inMain(p)) continue;
    const len = p.innerText.trim().length;
    if (len < 20) continue;
    for (let el = p.parentElement, depth = 0; el && el !== document.body && depth < 3; el = el.parentElement, depth++) {
      score.set(el, (score.get(el) || 0) + len / (depth + 1));
    }
  }
  const root = [...score.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || document.querySelector('article') || document.body;

  const bestSrc = (img) => {
    const set = (img.getAttribute('srcset') || img.dataset.srcset || '').split(',').map((s) => s.trim().split(/\s+/)).filter((x) => x[0]);
    const widest = set.map(([u, d]) => [u, parseFloat(d) || 0]).sort((a, b) => b[1] - a[1])[0];
    const raw = widest?.[0] || img.currentSrc || img.src;
    try { return new URL(raw, location.href).href; } catch { return null; }
  };

  const blocks = [];
  const images = [];
  const seen = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  for (let el = walker.currentNode; el; el = walker.nextNode()) {
    const tag = el.tagName;
    if (/^(SCRIPT|STYLE|NAV|ASIDE|FOOTER|FORM|IFRAME)$/.test(tag)) continue;
    if (/^H[1-4]$/.test(tag)) blocks.push({ type: 'h', level: +tag[1], text: el.innerText.trim() });
    else if (tag === 'P' || tag === 'LI' || tag === 'BLOCKQUOTE') {
      const text = el.innerText.trim();
      if (text && !el.querySelector('p, li')) blocks.push({ type: tag === 'BLOCKQUOTE' ? 'quote' : tag === 'LI' ? 'li' : 'p', text });
    } else if (tag === 'IMG') {
      const src = bestSrc(el);
      if (!src || seen.has(src) || src.startsWith('data:') || (el.naturalWidth || el.width) < minW) continue;
      seen.add(src);
      const fig = el.closest('figure');
      const caption = (fig?.querySelector('figcaption')?.innerText || el.closest('.wp-caption')?.querySelector('.wp-caption-text')?.innerText || '').trim();
      const r = el.getBoundingClientRect();
      images.push({ src, alt: (el.alt || el.title || '').trim(), caption, width: el.naturalWidth, height: el.naturalHeight, page_y: Math.round(r.top + scrollY) });
      blocks.push({ type: 'img', index: images.length - 1 });
    }
  }
  return {
    title: meta('og:title', 'twitter:title') || ld.headline || document.querySelector('h1')?.innerText.trim() || document.title,
    site: meta('og:site_name', 'application-name') || ld.publisher?.name || null,
    author: meta('author', 'article:author', 'dable:author') || ldAuthor || null,
    published: meta('article:published_time', 'pubdate', 'date') || ld.datePublished || document.querySelector('time[datetime]')?.getAttribute('datetime') || null,
    description: meta('og:description', 'description'),
    hero: meta('og:image', 'twitter:image'),
    blocks, images,
  };
}, minWidth);

// ── 存证截图 ──
await hideOverlays(page);
const slug = slugify(url);
const shot = await captureFullPage(page, P('sources', `page-${slug}`));

// ── 下载图片（头图 + 文内图，原始解析度；带 referer，避免防盗链） ──
fs.mkdirSync(P('assets', 'article'), { recursive: true });
const list = [];
if (data.hero && !data.images.some((i) => i.src === data.hero)) list.push({ src: data.hero, alt: '', caption: '', role: 'hero' });
list.push(...data.images.map((i, k) => ({ ...i, role: i.src === data.hero || (k === 0 && !list.length && !data.hero) ? 'hero' : 'inline' })));

const entries = [];
for (const [k, img] of list.entries()) {
  try {
    const res = await context.request.get(img.src, { headers: { referer: url }, timeout: 30000 });
    if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
    const type = res.headers()['content-type'] || '';
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[type.split(';')[0]] || path.extname(new URL(img.src).pathname).slice(1) || 'jpg';
    const file = `assets/article/${String(k + 1).padStart(2, '0')}.${ext}`;
    fs.writeFileSync(P(file), await res.body());
    const rights = articleImageRights({ pageUrl: url, site: data.site, caption: img.caption, alt: img.alt }, config.trusted_domains);
    img.file = file;
    const inBody = data.images.find((i) => i.src === img.src);
    if (inBody) inBody.file = file; // list 是拷贝，article.md 的图片连结要回写到正文区块
    entries.push({
      id: `article-${String(k + 1).padStart(2, '0')}`, file, kind: 'photo', source: 'article', role: img.role,
      source_url: url, file_url: img.src, author: data.site || hostOf(url), author_url: null,
      license: trusted ? '已授权网域（narration.config.json）' : '版权属媒体或摄影者；使用者决定可用，须标来源',
      ...rights, caption: img.caption || img.alt || null, width: img.width || null, height: img.height || null,
      downloaded_at: new Date().toISOString(), used_in: [],
    });
  } catch (err) {
    console.warn(`  跳过 ${img.src}：${err.message}`);
  }
}
await browser.close();

// ── 写档 ──
// 来源条用的短名：设定档有就用，否则取 og:site_name 的第一段
const label = Object.entries(config.site_labels || {}).find(([d]) => isTrusted(url, [d]))?.[1] || (data.site || hostOf(url)).split(/\s*[-｜|–—:：]\s*/)[0];
const fm = { url, title: data.title, site: data.site, source_label: label, author: data.author, published: data.published, fetched_at: new Date().toISOString(), hero: list.find((i) => i.role === 'hero')?.file || null, trusted_domain: trusted };
const body = data.blocks.map((b) => {
  if (b.type === 'h') return `\n${'#'.repeat(Math.max(2, b.level))} ${b.text}\n`;
  if (b.type === 'li') return `- ${b.text}`;
  if (b.type === 'quote') return `> ${b.text.replace(/\n/g, '\n> ')}\n`;
  if (b.type === 'img') {
    const i = data.images[b.index];
    return i.file ? `\n![${i.caption || i.alt || ''}](../${i.file})\n` : '';
  }
  return `${b.text}\n`;
}).join('\n').replace(/\n{3,}/g, '\n\n');
fs.writeFileSync(P('sources', 'article.md'), `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n\n# ${data.title}\n${body}\n`);
writeJson(P('sources', 'article.json'), { ...fm, description: data.description, screenshot: { dir: `sources/page-${slug}`, ...shot }, images: entries.map(({ id, file, role, caption, risk, note, credit }) => ({ id, file, role, caption, risk, note, credit })) });

const high = entries.filter((e) => e.risk === 'high');
fs.writeFileSync(P('sources', 'rights.md'), [
  '# rights.md — 文章图片权利判定', '',
  `来源：${url}`,
  trusted
    ? `**已授权网域**（${hostOf(url)} 在 narration.config.json 的 trusted_domains 内）：图文视为已授权，不需标注、不警示。`
    : '新闻头图与文内图片可直接当素材（使用者 2026-09-18 决定）：画面内加来源条、写进 CREDITS.md；影像处理限于裁切、缩放、极缓推拉与叠加标注，不去水印、不改内容。',
  '',
  '| 档案 | 角色 | risk | 标注 | 图说 | 备注 |', '|---|---|---|---|---|---|',
  ...entries.map((e) => `| ${e.file} | ${e.role} | ${e.risk} | ${e.credit || '—'} | ${(e.caption || '').replace(/\s*\n\s*/g, ' · ').replace(/\|/g, '／').slice(0, 60)} | ${e.note || ''} |`),
  '',
  ...(high.length ? [`**${high.length} 张 risk: high**：权利人不是该新闻媒体。交付时要提醒使用者自行判断是否保留，并各附一个免署名替代候选（source-media.mjs）。`, ''] : []),
].join('\n'));
upsertManifest(P('assets', 'manifest.json'), entries);
ensureFacts();

const chars = data.blocks.filter((b) => b.text).reduce((n, b) => n + b.text.length, 0);
console.log(`→ sources/article.md  「${data.title}」 ${chars} 字；${data.site || '?'} · ${data.author || '作者?'} · ${data.published || '日期?'}`);
console.log(`→ sources/page-${slug}/  ${shot.width}×${shot.height}css @${shot.scale}x，${shot.tiles.length} 块${shot.truncated ? '（页面过长已截断）' : ''}`);
console.log(`→ assets/article/  ${entries.length} 张图${high.length ? `，其中 ${high.length} 张 risk: high` : ''}；→ sources/rights.md、assets/manifest.json`);
if (chars < 200) console.warn('  正文不到 200 字：可能是付费墙或需登入，请检查 sources/article.md');
