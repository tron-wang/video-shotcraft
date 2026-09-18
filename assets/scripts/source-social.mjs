#!/usr/bin/env node
// 口播模式 ④ 社群素材：找出新闻引用的社群贴文 → 拍贴文画面 + 下载贴文影片 → manifest
//
//   node source-social.mjs --discover [--out <project>] [--query "關鍵字"]...
//        ① 重读 sources/article.json 的文章网址，抽出正文里的社群贴文连结与嵌入（最准：新闻引用贴文几乎都附连结）
//        ② 每个 --query 另用搜寻引擎查 site:threads.com 等（免登入、免金钥；搜寻引擎挡爬时会明说，不会假装没结果）
//        → assets/social/candidates.json
//   node source-social.mjs --capture <贴文网址 | candidates.json 里的编号> [--segment s2] [--shot S03]
//        Playwright 以手机版面打开公开贴文：贴文截图（证据镜用）、帐号 / 内文 / 时间、贴文主影片（mp4）
//        → assets/social/<platform>-<id>/{post.png, video.mp4, post.json}、public/media/、assets/manifest.json
//
// 支援度：Threads 公开贴文（实测）。其他平台走通用路径（og 标签 + 页面第一个 <video>）：
//   Facebook / TikTok 公开贴文多半拍得到画面、影片不一定；X / Instagram 需登入 → 明确报「需要登入，未采集」；
//   YouTube 只拍画面不下载影片（平台条款）。需要登入的内容一律不绕过。
//
// 权利（lib/media-rules.mjs socialPostRights）：贴文著作权属上传者。使用者决定可用，但 manifest 一律
//   risk: high、attribution_required、画面内来源条「<平台> @帐号」、进 out/CREDITS.md，交付时逐则提醒并建议取得同意。
//   narration.config.json 的 trusted_social（如 "threads:@blocktempo"）= 使用者自己的帐号：不警示、不标注。
//   影像处理同文章图片：只裁切、缩放、极缓推拉与叠加标注；不去水印、不改内容、不消音重配成像是自己拍的。
import fs from 'node:fs';
import path from 'node:path';
import { parseSocialUrl, socialPostRights } from './lib/media-rules.mjs';
import { loadConfig, loadPlaywright, readJson, upsertManifest, writeJson } from './lib/page-utils.mjs';

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
const P = (...p) => path.join(outDir, ...p);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const config = loadConfig();

const SOCIAL_RE = /https?:\/\/(?:www\.|m\.)?(?:threads\.(?:net|com)|x\.com|twitter\.com|instagram\.com|facebook\.com|youtu\.be|youtube\.com|tiktok\.com)\/[^\s"'<>\\)]+/g;

const postsIn = (html, via) => {
  const seen = new Map();
  for (const raw of html.match(SOCIAL_RE) || []) {
    const url = raw.replace(/&amp;/g, '&').replace(/[.,;]+$/, '');
    const info = parseSocialUrl(url);
    if (!info?.isPost) continue; // 帐号首页、分享按钮、追踪像素不算
    const key = `${info.platform}:${info.postId}`;
    if (!seen.has(key)) seen.set(key, { url, ...info, via });
  }
  return [...seen.values()];
};

// ───────────────────────── discover ─────────────────────────

const runDiscover = async () => {
  const queries = many('query');
  const article = readJson(P('sources', 'article.json'), {});
  const found = [];
  if (article.url) {
    const res = await fetch(article.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36' } });
    if (res.ok) found.push(...postsIn(await res.text(), 'article'));
    else console.warn(`  读不到文章页（HTTP ${res.status}），跳过文章连结`);
  } else if (!queries.length) {
    throw new Error('sources/article.json 没有文章网址，也没给 --query；无从找起');
  }
  for (const q of queries) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${q} (site:threads.com OR site:threads.net)`)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36' } });
    const html = res.ok ? decodeURIComponent((await res.text()).replace(/uddg=/g, ' ')) : '';
    const hits = postsIn(html, `search:${q}`);
    if (!res.ok || /anomaly|captcha|unusual traffic/i.test(html)) console.warn(`  搜寻「${q}」被搜寻引擎挡下（HTTP ${res.status}）——这条路这次没有结果，不代表社群上没有`);
    else console.log(`  搜寻「${q}」：${hits.length} 则贴文`);
    found.push(...hits);
  }
  const uniq = [...new Map(found.map((c) => [`${c.platform}:${c.postId}`, c])).values()].map((c, n) => ({ n: n + 1, ...c }));
  writeJson(P('assets', 'social', 'candidates.json'), { article: article.url || null, queries, candidates: uniq });
  console.log(`→ assets/social/candidates.json  ${uniq.length} 则候选`);
  for (const c of uniq) console.log(`  ${c.n}. [${c.label}] ${c.handle || ''}  ${c.url}  (${c.via})`);
  if (uniq.length) console.log('\n采集：node source-social.mjs --capture <编号或网址> [--segment <id>] [--shot <id>]');
};

// ───────────────────────── capture ─────────────────────────

const runCapture = async (target) => {
  const segment = one('segment', null);
  const shotId = one('shot', null);
  const cand = /^\d+$/.test(target) ? readJson(P('assets', 'social', 'candidates.json'), { candidates: [] }).candidates.find((c) => String(c.n) === target) : null;
  const url = cand?.url || target;
  const info = parseSocialUrl(url);
  if (!info?.isPost) throw new Error(`不是可辨识的社群贴文网址：${url}`);
  const id = `${info.platform}-${info.postId}`.replace(/[^a-zA-Z0-9_-]/g, '');
  const dir = P('assets', 'social', id);
  fs.mkdirSync(dir, { recursive: true });

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, locale: 'zh-TW', userAgent: UA });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);

  const data = await page.evaluate(() => {
    const meta = (p) => document.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.content || null;
    // 登入墙：有密码栏，或主要内容只剩登入提示
    const wall = !!document.querySelector('input[type="password"]') || /log in to|登入以|sign in to continue/i.test(document.body.innerText.slice(0, 600));
    const videos = [...document.querySelectorAll('video')].map((v) => {
      const r = v.getBoundingClientRect();
      // 主贴文的容器：往上找到同时含帐号连结的最近祖先（平台各自的 class 不稳定，不依赖）
      let box = v.parentElement;
      for (let k = 0; box && k < 14 && !(box.querySelector('a[href*="/@"], a[href^="/"]') && box.getBoundingClientRect().height > r.height + 60); k++) box = box.parentElement;
      const br = (box || v).getBoundingClientRect();
      return { src: v.currentSrc || v.src || '', w: v.videoWidth, h: v.videoHeight, duration: v.duration, top: r.top + scrollY,
        boxTop: br.top + scrollY, boxBottom: br.bottom + scrollY, bottom: r.bottom + scrollY };
    }).filter((v) => v.src && !v.src.startsWith('blob:'));
    const blobOnly = document.querySelectorAll('video').length > 0 && videos.length === 0;
    return {
      title: document.title, description: meta('og:description'), ogTitle: meta('og:title'), image: meta('og:image'),
      published: document.querySelector('time[datetime]')?.getAttribute('datetime') || null,
      wall, blobOnly, videos,
    };
  });

  if (data.wall && !data.videos.length) {
    await browser.close();
    throw new Error(`${info.label} 这则贴文需要登入才看得到——未采集（不绕过登入）。替代：用新闻页面里对这则贴文的描述当证据镜`);
  }

  // 贴文画面：只拍主贴文所在的首屏到主影片底部，不把下方留言串拍进去
  const main = data.videos.sort((a, b) => a.top - b.top)[0] || null;
  // 「开启 App」弹窗、遮罩、悬浮导航：dialog 与不含影片的 fixed / sticky 元素藏掉
  await page.evaluate(() => {
    // 注意：有些平台把整个内容区放在 fixed 容器里——含有 <video> 的 fixed 元素不能藏（藏了整页变白，实际踩过）
    const keep = (el) => !!el.querySelector('video');
    document.querySelectorAll('[role="dialog"], [aria-modal="true"]').forEach((el) => !keep(el) && el.remove());
    for (const el of document.querySelectorAll('body *')) {
      const s = getComputedStyle(el);
      if ((s.position === 'fixed' || s.position === 'sticky') && !keep(el)) el.style.setProperty('display', 'none', 'important');
    }
    document.documentElement.style.overflow = document.body.style.overflow = 'visible';
  });
  await page.waitForTimeout(300);
  // 范围收到主贴文本身：容器顶到互动数列底；找不到容器就从影片上方 150px 到影片下方 70px
  // 上缘要含帐号列 + 内文（约在影片上方 130px 内），下缘只到互动数列（影片下方约 60px），不露出下一则
  const y0 = Math.max(0, Math.floor(main ? Math.min(main.boxTop, main.top - 130) - 8 : 0));
  const y1 = Math.ceil(main ? main.bottom + 62 : 932);
  const clipH = Math.min(1800, y1 - y0);
  await page.screenshot({ path: path.join(dir, 'post.png'), fullPage: true, clip: { x: 0, y: y0, width: 430, height: clipH } });

  let videoRel = null;
  if (info.platform === 'youtube') {
    console.warn('  YouTube：只拍画面，不下载影片（平台条款）');
  } else if (main) {
    const res = await context.request.get(main.src, { headers: { referer: url }, timeout: 120000 });
    if (res.ok()) {
      fs.writeFileSync(path.join(dir, 'video.mp4'), await res.body());
      videoRel = `public/media/${id}.mp4`;
      fs.mkdirSync(P('public', 'media'), { recursive: true });
      fs.copyFileSync(path.join(dir, 'video.mp4'), P(videoRel));
    } else console.warn(`  影片下载失败（HTTP ${res.status()}）：只保留贴文画面`);
  } else if (data.blobOnly) {
    console.warn('  影片是分段串流（blob），这版不支援下载：只保留贴文画面');
  }
  await browser.close();

  const rights = socialPostRights(info, config.trusted_social || []);
  const post = { url, ...info, title: data.title, text: data.description, published: data.published, captured_at: new Date().toISOString(),
    video: main ? { width: main.w, height: main.h, duration: +main.duration.toFixed(2) } : null };
  writeJson(path.join(dir, 'post.json'), post);

  const base = {
    source: 'social', platform: info.platform, source_url: url, author: info.handle, author_url: url.split('/post/')[0],
    license: rights.rights === 'trusted-social' ? '使用者自己的帐号（narration.config.json trusted_social）' : '著作权属上传者；使用者决定引用，须标来源',
    ...rights, caption: data.description, downloaded_at: new Date().toISOString(), used_in: shotId ? [shotId] : [], ...(segment ? { segment } : {}),
  };
  const entries = [{ id: `${id}-post`, file: `assets/social/${id}/post.png`, kind: 'screenshot', file_url: url, width: 430 * 3, height: clipH * 3, ...base }];
  if (videoRel) entries.push({ id: `${id}-video`, file: videoRel, kind: 'video', file_url: main.src.split('?')[0], width: main.w, height: main.h, duration: post.video.duration, ...base });
  upsertManifest(P('assets', 'manifest.json'), entries);

  console.log(`→ assets/social/${id}/post.png  贴文画面（${info.label} ${info.handle}）`);
  if (videoRel) console.log(`→ ${videoRel}  ${main.w}×${main.h} ${post.video.duration}s`);
  console.log(`   内文：${(data.description || '').replace(/\n/g, ' ／ ').slice(0, 60)}`);
  if (rights.risk === 'high') console.log(`   ⚠ risk: high —— ${rights.note}\n   画面内来源条：「${rights.source_strip}」；已记入 manifest，会进 out/CREDITS.md`);
  if (main && Math.min(main.w, main.h) < 1080) console.log(`   解析度 ${main.w}×${main.h} 低于 1080p：放进画框里用（clip-frame-reveal），不要全幅放大`);
};

try {
  if (flag('discover')) await runDiscover();
  else if (flag('capture')) await runCapture(args[0]);
  else console.log('用法：node source-social.mjs --discover [--query "…"]   |   --capture <编号或贴文网址> [--segment <id>] [--shot <id>]');
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
