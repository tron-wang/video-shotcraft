#!/usr/bin/env node
// 口播模式 ④.3 网页「拍摄」：来源网页 → 全页 2× 长图 + 兴趣点 DOM 坐标
//
//   node capture-page.mjs <url> [--out <project>] [--slug name] [--width 1280] [--scale 2]
//        [--text "要标出的原文句子"]...   在页面里找这段文字，记下逐行矩形（供 marker-sweep / 圈注）
//        [--select "css 选择器"]...        记下元素矩形（供 page-anchor-tour 停靠）
//        [--auto]                          自动记下 h1–h3、正文图片、blockquote
//        [--segment s3-evidence] [--shot S03]  记进 manifest，供 source-media.mjs --check 对照
//
// 产出 assets/pages/<slug>/{page.png, boxes.json}，并在 manifest 记一笔 kind: "screenshot"。
// boxes.json 的坐标一律是整页坐标系的 CSS px（乘 scale 才是 page.png 的像素），全部机器实测，
// 成片里用相机在长图上滚动、停靠、放大、画线——不要把整张图静态贴上去。
// 证据镜属引用：画面内须有来源条标出处。
//
// 本地产品页面的三件套采集（cutout 透明抠图）仍用 capture-template.mjs。
import path from 'node:path';
import { hostOf } from './lib/media-rules.mjs';
import { captureFullPage, hideOverlays, openPage, slugify, upsertManifest, wakeLazyContent, writeJson } from './lib/page-utils.mjs';

const args = process.argv.slice(2);
const one = (name, fallback) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 ? args.splice(k, 2)[1] : fallback;
};
const many = (name) => {
  const out = [];
  for (let k = args.indexOf(`--${name}`); k >= 0; k = args.indexOf(`--${name}`)) out.push(args.splice(k, 2)[1]);
  return out;
};
const flag = (name) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 && !!args.splice(k, 1);
};

const outDir = path.resolve(one('out', '.'));
const width = Number(one('width', 1280));
const scale = Number(one('scale', 2));
const texts = many('text');
const selectors = many('select');
const auto = flag('auto');
const segment = one('segment', null);
const shotId = one('shot', null);
const url = args[0];
if (!url) {
  console.error('用法：node capture-page.mjs <url> [--out <project>] [--text "原文句子"]... [--select "css"]... [--auto]');
  process.exit(1);
}
const slug = one('slug', slugify(url));
const dir = path.join(outDir, 'assets', 'pages', slug);

const { browser, page } = await openPage(url, { width, scale });
await wakeLazyContent(page);
await hideOverlays(page);

const boxes = await page.evaluate(({ texts, selectors, auto }) => {
  const abs = (r) => ({ x: +(r.left + scrollX).toFixed(1), y: +(r.top + scrollY).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) });
  const visible = (r) => r.width > 2 && r.height > 2;
  const out = [];

  // 文字：跨节点找到这句话，用 Range 取逐行矩形
  const norm = (s) => s.replace(/\s+/g, '');
  for (const [n, needle] of texts.entries()) {
    const want = norm(needle);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (t) => (t.parentElement?.closest('script,style,noscript') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const map = []; // 去空白后的每个字符 → [文本节点, 偏移]
    let flat = '';
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      for (let k = 0; k < t.data.length; k++) {
        if (/\s/.test(t.data[k])) continue;
        flat += t.data[k];
        map.push([t, k]);
      }
    }
    const at = flat.indexOf(want);
    if (at < 0) {
      out.push({ key: `text-${n + 1}`, kind: 'text', text: needle, found: false });
      continue;
    }
    const range = document.createRange();
    range.setStart(...map[at]);
    const [endNode, endOff] = map[at + want.length - 1];
    range.setEnd(endNode, endOff + 1);
    // 同一行被 inline 元素拆开的矩形按 y 合并
    const lines = [];
    for (const r of [...range.getClientRects()].filter(visible)) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.top - r.top) < r.height * 0.5) {
        last.right = Math.max(last.right, r.right);
        last.left = Math.min(last.left, r.left);
        last.bottom = Math.max(last.bottom, r.bottom);
      } else lines.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
    const rects = lines.map((l) => abs({ left: l.left, top: l.top, width: l.right - l.left, height: l.bottom - l.top }));
    out.push({ key: `text-${n + 1}`, kind: 'text', text: needle, found: true, ...abs(range.getBoundingClientRect()), rects });
  }

  const pushEls = (key, kind, els, extra = () => ({})) =>
    els.forEach((el, k) => {
      const r = el.getBoundingClientRect();
      if (visible(r)) out.push({ key: els.length > 1 ? `${key}-${k + 1}` : key, kind, ...extra(el), ...abs(r) });
    });

  selectors.forEach((sel, n) => pushEls(`sel-${n + 1}`, 'element', [...document.querySelectorAll(sel)].slice(0, 20), () => ({ selector: sel })));
  if (auto) {
    pushEls('heading', 'heading', [...document.querySelectorAll('h1, h2, h3')].filter((e) => e.innerText.trim()).slice(0, 30), (e) => ({ text: e.innerText.trim().slice(0, 80) }));
    pushEls('image', 'image', [...document.querySelectorAll('article img, main img, figure img')].filter((e) => e.naturalWidth >= 400).slice(0, 30), (e) => ({ alt: e.alt || '' }));
    pushEls('quote', 'quote', [...document.querySelectorAll('blockquote')].slice(0, 10), (e) => ({ text: e.innerText.trim().slice(0, 80) }));
  }
  return out;
}, { texts, selectors, auto });

const title = await page.title();
const shot = await captureFullPage(page, dir, { scale });
await browser.close();

const inside = boxes.filter((b) => b.found !== false && b.y + b.h <= shot.height);
writeJson(path.join(dir, 'boxes.json'), {
  url, title, site: hostOf(url), captured_at: new Date().toISOString(),
  scale, page: { width: shot.width, height: shot.height, truncated: shot.truncated }, image: shot.stitched, tiles: shot.tiles,
  note: '坐标是整页 CSS px；page.png 的像素 = 坐标 × scale',
  boxes,
});
upsertManifest(path.join(outDir, 'assets', 'manifest.json'), [{
  id: `page-${slug}`, file: `assets/pages/${slug}/${shot.stitched || shot.tiles[0].file}`, kind: 'screenshot', source: 'playwright',
  source_url: url, file_url: url, author: hostOf(url), author_url: null,
  license: '引用（网页截图）：只用于证据镜，画面内须有来源条',
  attribution_required: false, credit: null, rights: 'quotation', risk: 'normal', source_strip: hostOf(url),
  width: shot.width * scale, height: shot.height * scale, downloaded_at: new Date().toISOString(), used_in: shotId ? [shotId] : [], ...(segment ? { segment } : {}),
}]);

console.log(`→ assets/pages/${slug}/  ${shot.width * scale}×${shot.height * scale}px（${shot.tiles.length} 块${shot.stitched ? '，已拼成 page.png' : ''}）${shot.truncated ? '  页面过长已截断' : ''}`);
console.log(`→ boxes.json  ${inside.length} 个兴趣点`);
const missing = boxes.filter((b) => b.found === false);
if (missing.length) {
  console.warn(`  找不到这些文字（请照页面原文逐字给，含标点）：\n${missing.map((b) => `    「${b.text}」`).join('\n')}`);
  process.exit(2);
}
