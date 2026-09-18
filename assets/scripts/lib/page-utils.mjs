// fetch-article.mjs 与 capture-page.mjs 共用的 Playwright 工具。
// Playwright 装在影片专案里（npm i -D playwright && npx playwright install chromium），
// 所以先按脚本位置找，找不到再按 cwd 找。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const loadPlaywright = async () => {
  try {
    return await import('playwright');
  } catch {
    try {
      return createRequire(path.join(process.cwd(), 'package.json'))('playwright');
    } catch {
      console.error('找不到 playwright。在影片专案目录执行：npm i -D playwright && npx playwright install chromium');
      process.exit(1);
    }
  }
};

export const openPage = async (url, { width = 1280, height = 900, scale = 2, locale = 'zh-TW' } = {}) => {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: scale, locale,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  return { browser, context, page };
};

/** 滚到底再回顶：触发懒载入图片；同时把 loading=lazy 改 eager、data-src 补回 src。 */
export const wakeLazyContent = async (page) => {
  await page.evaluate(async () => {
    for (const img of document.querySelectorAll('img')) {
      img.loading = 'eager';
      const real = img.dataset.src || img.dataset.lazySrc || img.dataset.original;
      if (real && (!img.src || img.src.startsWith('data:'))) img.src = real;
    }
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
};

/** 截图前清场：固定定位的浮层（cookie 条、订阅弹窗、悬浮导航）会在分块截图里反复出现。 */
export const hideOverlays = async (page) => {
  await page.addStyleTag({ content: '*{scroll-behavior:auto!important} ::-webkit-scrollbar{display:none}' });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const s = getComputedStyle(el);
      if ((s.position === 'fixed' || s.position === 'sticky') && el.offsetHeight < window.innerHeight * 0.9) {
        el.style.setProperty('visibility', 'hidden', 'important');
      }
    }
  });
};

/** 全页长图。单张纹理过高 Chromium 会截坏，所以按 ≤ maxTileCss 分块截，再用 ffmpeg 竖向拼成 page.png。
 * 返回 { width, height, scale, tiles:[{file,y,h}], stitched }（坐标均为 CSS px）。 */
export const captureFullPage = async (page, outDir, { scale = 2, maxTileCss = 4000, maxHeightCss = 30000 } = {}) => {
  fs.mkdirSync(outDir, { recursive: true });
  const dims = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
  }));
  const height = Math.min(dims.height, maxHeightCss);
  const tiles = [];
  for (let y = 0, n = 0; y < height; y += maxTileCss, n++) {
    const h = Math.min(maxTileCss, height - y);
    const file = `tile-${String(n).padStart(2, '0')}.png`;
    await page.screenshot({ path: path.join(outDir, file), fullPage: true, clip: { x: 0, y, width: dims.width, height: h } });
    tiles.push({ file, y, h });
  }
  let stitched = null;
  if (tiles.length === 1) {
    fs.renameSync(path.join(outDir, tiles[0].file), path.join(outDir, 'page.png'));
    tiles[0].file = stitched = 'page.png';
  } else {
    try {
      const args = ['-v', 'error', '-y', ...tiles.flatMap((t) => ['-i', path.join(outDir, t.file)]),
        '-filter_complex', `vstack=inputs=${tiles.length}`, path.join(outDir, 'page.png')];
      execFileSync('ffmpeg', args);
      stitched = 'page.png';
    } catch {
      console.warn('  ffmpeg 拼接失败，保留分块 tile-*.png（boxes.json 的 tiles 有各块的 y 偏移）');
    }
  }
  return { width: dims.width, height, truncated: dims.height > height, scale, tiles, stitched };
};

export const slugify = (url) => {
  const u = new URL(url);
  return `${u.hostname.replace(/^www\./, '')}${u.pathname}`.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).toLowerCase();
};

export const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
export const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`);
};

/** skill 根目录的 narration.config.json。 */
export const loadConfig = () =>
  readJson(fileURLToPath(new URL('../../../narration.config.json', import.meta.url)), { trusted_domains: [], show_source_strip: true });

/** manifest.json：按 id 合并写回。 */
export const upsertManifest = (file, entries) => {
  const m = readJson(file, { version: 1, entries: [] });
  for (const e of entries) {
    const k = m.entries.findIndex((x) => x.id === e.id);
    if (k >= 0) m.entries[k] = { ...m.entries[k], ...e };
    else m.entries.push(e);
  }
  writeJson(file, m);
  return m;
};
