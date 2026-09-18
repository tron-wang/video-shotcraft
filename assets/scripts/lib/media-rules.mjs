// 口播模式素材规则（纯函数，无 IO）：已授权网域、通讯社警示、候选排序、标注清单。
// 规格见 docs/narration-mode-spec.md ⓪ 与 ④。

/** 通讯社 / 图库字样：权利人通常不是刊登的媒体，标 risk: high。 */
const AGENCIES = [
  ['Getty', /getty\s*images?|gettyimages/i],
  ['AP', /\bAP\s?(photo|images?)?\b|associated\s+press|美聯社|美联社/],
  ['Reuters', /reuters|路透/i],
  ['AFP', /\bAFP\b|法新社/],
  ['Bloomberg', /bloomberg|彭博/i],
  ['EPA', /\bEPA\b|歐新社|欧新社/],
  ['中央社', /中央社|\bCNA\b/],
  ['Shutterstock', /shutterstock/i],
  ['達志影像', /達志|达志/],
  ['Alamy', /alamy/i],
  ['iStock', /\bistock(photo)?\b/i],
  ['Photo AC', /photo\s?AC|photo-ac|写真AC/i],
  ['PIXTA', /pixta/i],
  ['Adobe Stock', /adobe\s?stock/i],
  ['Wikimedia Commons（授权逐张不同，多为 CC-BY-SA）', /wikimedia|wikipedia|維基|维基/i],
  ['東方IC / 視覺中國', /東方\s?IC|东方\s?IC|視覺中國|视觉中国/i],
];

export const detectAgency = (text = '') => {
  const hit = AGENCIES.find(([, re]) => re.test(text));
  return hit ? hit[0] : null;
};

/** 从图说 / alt 里抽「图片来源」字样。抽不到返回 null，由媒体名兜底。 */
export const extractCredit = (text = '') => {
  const m = text.match(
    /(?:圖片來源|图片来源|圖源|图源|圖／|圖\/|圖：|图：|攝影|摄影|照片來源|照片来源|photo(?:\s+(?:by|credit))?|credit|source|image)\s*[:：／/|｜]?\s*([^\n。；;）)】\]]{2,60})/i,
  );
  return m ? m[1].trim().replace(/^[:：\s]+/, '') : null;
};

export const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** 主网域或其子网域在白名单内。 */
export const isTrusted = (url, trusted = []) => {
  const host = hostOf(url);
  return trusted.some((d) => {
    const t = d.toLowerCase().replace(/^www\./, '');
    return host === t || host.endsWith(`.${t}`);
  });
};

/** 文章图片的权利判定 → manifest 字段。 */
export const articleImageRights = ({ pageUrl, site, caption = '', alt = '' }, trusted = []) => {
  const agency = detectAgency(`${caption}\n${alt}`);
  const who = extractCredit(caption) || extractCredit(alt); // 图说优先；正则不跨行，不会把 alt 吃进来
  if (isTrusted(pageUrl, trusted)) {
    return {
      rights: 'trusted-domain', attribution_required: false, credit: null, risk: 'none',
      note: agency ? `图说出现「${agency}」字样（已授权网域，仅备注）` : null,
    };
  }
  return {
    rights: 'article', attribution_required: true,
    credit: `圖片來源：${site || hostOf(pageUrl)}${who ? `／${who}` : ''}`,
    risk: agency ? 'high' : 'normal',
    note: agency ? `图说出现「${agency}」字样：权利人很可能不是该媒体，是否保留请使用者判断` : null,
  };
};

// ───────────────────────── 候选筛选与排序 ─────────────────────────

export const MIN = { videoShort: 1080, photoShort: 1600 };

/** 解析度是否达标：影片短边 ≥1080，照片短边 ≥1600。 */
export const meetsMin = (c) => Math.min(c.width || 0, c.height || 0) >= (c.kind === 'video' ? MIN.videoShort : MIN.photoShort);

export const orientationOf = (c) => (c.height > c.width * 1.1 ? 'portrait' : c.width > c.height * 1.1 ? 'landscape' : 'square');

/** 分数高者优先。不因要标注而降权；同分时免署名来源在前（减少标注条目）。 */
export const rankCandidates = (cands, want = 'portrait') =>
  cands
    .map((c) => ({
      ...c,
      below_min: !meetsMin(c),
      score: (meetsMin(c) ? 4 : 0) + (orientationOf(c) === want ? 2 : orientationOf(c) === 'square' ? 1 : 0) + Math.max(0, 1 - (c.rank ?? 0) / 8),
    }))
    .sort((a, b) => b.score - a.score || Number(a.attribution_required) - Number(b.attribution_required));

/** Openverse 只准 CC0 / 公有领域标记，客户端再验一次。 */
export const openverseAllowed = (r) => ['cc0', 'pdm'].includes(String(r.license || '').toLowerCase());

// ───────────────────────── 标注清单 ─────────────────────────

/** manifest 条目 → out/CREDITS.md 文本。usedIds 为 null 表示尚无 shotlist，收全部已选用条目。 */
export const buildCredits = (entries, usedIds = null) => {
  const used = entries.filter((e) => e.attribution_required && (usedIds ? usedIds.has(e.id) : true));
  if (!used.length) return '# CREDITS\n\n本片無需標註的素材。\n';
  const uns = used.filter((e) => e.source === 'unsplash');
  const art = used.filter((e) => e.source === 'article');
  const other = used.filter((e) => !['unsplash', 'article'].includes(e.source));

  const full = [
    ...uns.map((e) => `Photo by ${e.author} on Unsplash — ${e.source_url}`),
    ...art.map((e) => `${e.credit} — ${e.source_url}`),
    ...other.map((e) => `${e.credit} — ${e.source_url}`),
  ];
  const short = [];
  if (uns.length) short.push(`Photos: ${[...new Set(uns.map((e) => e.author))].join(', ')} / Unsplash`);
  const artCredits = [...new Set([...art, ...other].map((e) => e.credit))];
  if (artCredits.length) short.push(artCredits.join('；'));

  const risky = used.filter((e) => e.risk === 'high');
  return [
    '# CREDITS', '',
    `本片用了 ${uns.length} 張 Unsplash 照片、${art.length} 張文章圖片。發佈時請把下面其中一版貼到影片說明欄。`, '',
    '## 完整版（含連結）', '', ...full, '',
    '## 精簡版（字數受限的平台）', '', ...short, '',
    ...(risky.length
      ? ['## 需要你判斷的高風險圖片', '', ...risky.map((e) => `- ${e.file}：${e.note}`), '']
      : []),
  ].join('\n');
};

/** manifest 条目完整性：--check 用。返回问题字符串数组。 */
export const entryProblems = (e) => {
  const p = [];
  if (!e.source_url && !e.file_url) p.push('没有 URL（不准进成片）');
  if (!e.license) p.push('授权栏为空');
  if (e.attribution_required) {
    if (!e.credit) p.push('需标注但 credit 为空');
    if (e.source === 'unsplash' && !(e.author && e.author_url && e.source_url)) p.push('Unsplash 条目缺摄影师姓名 / 个人页 / 照片页');
    if (e.source === 'unsplash' && !e.download_tracked) p.push('Unsplash 选用后未呼叫 download_location');
  }
  return p;
};
