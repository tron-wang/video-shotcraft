// Unit tests for assets/scripts/lib/media-rules.mjs（口播模式素材规则，纯函数）。

import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs module without type declarations
import { articleImageRights, buildCredits, detectAgency, entryProblems, extractCredit, isTrusted, openverseAllowed, rankCandidates } from '../lib/media-rules.mjs';

const TRUSTED = ['blocktempo.com'];

describe('isTrusted', () => {
  it('主网域、www 与子网域都算；相似网域不算', () => {
    expect(isTrusted('https://www.blocktempo.com/a/1', TRUSTED)).toBe(true);
    expect(isTrusted('https://news.blocktempo.com/a', TRUSTED)).toBe(true);
    expect(isTrusted('https://notblocktempo.com/a', TRUSTED)).toBe(false);
    expect(isTrusted('https://blocktempo.com.evil.io/a', TRUSTED)).toBe(false);
    expect(isTrusted('not a url', TRUSTED)).toBe(false);
  });
});

describe('detectAgency / extractCredit', () => {
  it('认得通讯社与图库字样', () => {
    expect(detectAgency('圖／路透社')).toBe('Reuters');
    expect(detectAgency('(Photo by John Doe/Getty Images)')).toBe('Getty');
    expect(detectAgency('圖片來源： Photo AC')).toBe('Photo AC');
    expect(detectAgency('記者王小明攝')).toBeNull();
    expect(detectAgency('A HAPPY day')).toBeNull();
  });

  it('抽来源字样且不跨行', () => {
    expect(extractCredit('秋天的奧入瀨溪流與紅葉\n圖片來源： Photo AC')).toBe('Photo AC');
    expect(extractCredit('攝影：Gin')).toBe('Gin');
    expect(extractCredit('一張沒有來源的圖')).toBeNull();
  });
});

describe('articleImageRights', () => {
  const base = { pageUrl: 'https://tohoku.letsgojp.com/archives/1', site: '樂吃購' };

  it('一般媒体：需标注，图说优先于 alt', () => {
    const r = articleImageRights({ ...base, caption: '攝影：Gin', alt: '青森犬' }, TRUSTED);
    expect(r).toMatchObject({ rights: 'article', attribution_required: true, risk: 'normal', credit: '圖片來源：樂吃購／Gin' });
  });

  it('图库字样 → risk high，但不剔除', () => {
    const r = articleImageRights({ ...base, caption: '圖片來源： Photo AC' }, TRUSTED);
    expect(r.risk).toBe('high');
    expect(r.attribution_required).toBe(true);
    expect(r.note).toMatch(/使用者判断/);
  });

  it('已授权网域：不标注、不警示，通讯社字样只备注', () => {
    const r = articleImageRights({ pageUrl: 'https://www.blocktempo.com/x', site: '動區', caption: '圖源：路透' }, TRUSTED);
    expect(r).toMatchObject({ rights: 'trusted-domain', attribution_required: false, credit: null, risk: 'none' });
    expect(r.note).toMatch(/仅备注/);
  });
});

describe('rankCandidates', () => {
  const c = (id: string, o: object) => ({ id, kind: 'photo', width: 3000, height: 4500, attribution_required: false, rank: 0, ...o });

  it('达标 + 方向一致优先；不达标标 below_min', () => {
    const out = rankCandidates([c('small', { width: 800, height: 1200 }), c('wide', { width: 4500, height: 3000 }), c('good', {})], 'portrait');
    expect(out.map((x: { id: string }) => x.id)).toEqual(['good', 'wide', 'small']);
    expect(out[2].below_min).toBe(true);
  });

  it('同分时免署名在前，但不因要标注而降权', () => {
    const out = rankCandidates([c('uns', { attribution_required: true }), c('pex', {})], 'portrait');
    expect(out[0].id).toBe('pex');
    expect(out[0].score).toBe(out[1].score);
  });

  it('影片下限是短边 1080', () => {
    expect(rankCandidates([c('v', { kind: 'video', width: 1080, height: 1920 })])[0].below_min).toBe(false);
  });
});

describe('openverseAllowed', () => {
  it('只准 cc0 / pdm', () => {
    expect(openverseAllowed({ license: 'cc0' })).toBe(true);
    expect(openverseAllowed({ license: 'PDM' })).toBe(true);
    expect(openverseAllowed({ license: 'by-sa' })).toBe(false);
    expect(openverseAllowed({})).toBe(false);
  });
});

describe('buildCredits / entryProblems', () => {
  const uns = { id: 'u1', source: 'unsplash', attribution_required: true, author: 'Ann Lee', author_url: 'https://unsplash.com/@ann', source_url: 'https://unsplash.com/photos/x', credit: 'Photo by Ann Lee on Unsplash', license: 'Unsplash License', download_tracked: true };
  const art = { id: 'a1', source: 'article', attribution_required: true, credit: '圖片來源：某報／路透', source_url: 'https://news.example/1', license: 'x', risk: 'high', note: '通讯社', file: 'assets/article/01.jpg' };
  const pex = { id: 'p1', source: 'pexels', attribution_required: false, source_url: 'https://pexels.com/1', license: 'Pexels License' };

  it('两种格式各一份，只收实际用到的', () => {
    const md = buildCredits([uns, art, pex], new Set(['u1', 'p1']));
    expect(md).toContain('Photo by Ann Lee on Unsplash — https://unsplash.com/photos/x');
    expect(md).toContain('Photos: Ann Lee / Unsplash');
    expect(md).not.toContain('某報');
  });

  it('高风险图片单独列出', () => {
    expect(buildCredits([art], new Set(['a1']))).toContain('需要你判斷的高風險素材');
  });

  it('没有需标注素材时明说', () => {
    expect(buildCredits([pex], new Set(['p1']))).toContain('本片無需標註的素材');
  });

  it('entryProblems：无 URL、缺授权、Unsplash 未追踪下载', () => {
    expect(entryProblems(pex)).toEqual([]);
    expect(entryProblems(uns)).toEqual([]);
    expect(entryProblems({ attribution_required: false })).toHaveLength(2);
    expect(entryProblems({ ...uns, download_tracked: false })[0]).toMatch(/download_location/);
  });
});

// @ts-expect-error — plain .mjs module without type declarations
import { parseSocialUrl, socialPostRights } from '../lib/media-rules.mjs';

describe('parseSocialUrl', () => {
  it('认得 Threads / X / YouTube 贴文，抽出帐号与贴文 id', () => {
    expect(parseSocialUrl('https://www.threads.com/@ntuacurry_0602/post/DdWsYRtD87b')).toMatchObject({ platform: 'threads', handle: '@ntuacurry_0602', postId: 'DdWsYRtD87b', isPost: true });
    expect(parseSocialUrl('https://x.com/BlockTempo/status/123')).toMatchObject({ platform: 'x', handle: '@blocktempo', postId: '123' });
    expect(parseSocialUrl('https://www.youtube.com/watch?v=abc123')).toMatchObject({ platform: 'youtube', postId: 'abc123' });
  });

  it('帐号首页、分享按钮、追踪像素不算贴文；非社群网址返回 null', () => {
    expect(parseSocialUrl('https://twitter.com/BlockTempo')?.isPost).toBe(false);
    expect(parseSocialUrl('https://www.facebook.com/tr?id=1&ev=PageView')?.isPost).toBe(false);
    expect(parseSocialUrl('https://www.blocktempo.com/a')).toBeNull();
    expect(parseSocialUrl('nope')).toBeNull();
  });
});

describe('socialPostRights', () => {
  const post = { platform: 'threads', label: 'Threads', handle: '@someone' };

  it('别人的贴文：高风险、需标注、有来源条', () => {
    const r = socialPostRights(post, []);
    expect(r).toMatchObject({ rights: 'social-post', attribution_required: true, risk: 'high', credit: '影片來源：Threads @someone', source_strip: 'Threads @someone' });
  });

  it('白名单帐号（不分大小写）：不警示、不标注', () => {
    expect(socialPostRights(post, ['Threads:@SomeOne'])).toMatchObject({ rights: 'trusted-social', attribution_required: false, risk: 'none' });
  });
});
