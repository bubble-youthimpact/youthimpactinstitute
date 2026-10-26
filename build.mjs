// Youth Impact Institute — static site builder (no dependencies).
// Usage: node build.mjs   → writes the finished site into ./docs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const C = (...p) => path.join(ROOT, 'content', ...p);
const OUT = path.join(ROOT, 'docs');

const readJSON = (f) => JSON.parse(fs.readFileSync(C(f), 'utf8'));
const site = readJSON('site.json');
const home = readJSON('home.json');
const members = readJSON('members.json');
const about = readJSON('about.json');
const BASE = (site.base || '').replace(/\/$/, '');
const u = (p) => BASE + p; // url helper
const BUILD = Date.now().toString(36);

/* ---------------- helpers ---------------- */
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return `${MONTHS[m - 1]} ${String(day).padStart(2, '0')}, ${y}`;
};

function parseFrontMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
    else if (v === 'true' || v === 'false') v = v === 'true';
    else v = v.replace(/^["']|["']$/g, '');
    data[key] = v;
  }
  return { data, body: m[2] };
}

function inline(s) {
  let t = esc(s);
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, src) => `<img src="${imgUrl(src)}" alt="${a}" loading="lazy">`);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, href) => {
    const ext = /^https?:/.test(href);
    return `<a href="${ext ? href : u(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${txt}</a>`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  // bare URLs (common in reference lists)
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  return t;
}

function markdown(src = '') {
  const lines = src.replace(/\r/g, '').split('\n');
  const out = [];
  let para = [], list = null;
  const flushP = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushL = () => { if (list) { out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`); list = null; } };
  for (const line of lines) {
    const l = line.trim();
    let m;
    if (!l) { flushP(); flushL(); continue; }
    if (/^---+$/.test(l)) { flushP(); flushL(); out.push('<hr>'); continue; }
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { flushP(); flushL(); const n = Math.min(m[1].length + 1, 4); out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
    if ((m = l.match(/^[-*]\s+(.*)$/))) { flushP(); if (!list || list.type !== 'ul') { flushL(); list = { type: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = l.match(/^\d+[.)]\s+(.*)$/))) { flushP(); if (!list || list.type !== 'ol') { flushL(); list = { type: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = l.match(/^>\s?(.*)$/))) { flushP(); flushL(); out.push(`<blockquote><p>${inline(m[1])}</p></blockquote>`); continue; }
    if ((m = l.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) { flushP(); flushL(); out.push(`<figure>${image(m[2], m[1])}${m[1] ? `<figcaption>${esc(m[1])}</figcaption>` : ''}</figure>`); continue; }
    if (/^<\/?[a-z]/i.test(l)) { flushP(); flushL(); out.push(line); continue; }
    if (list) { list.items[list.items.length - 1] += ' ' + l; continue; }
    para.push(l);
  }
  flushP(); flushL();
  return out.join('\n');
}

// content imported from Bubble is stored as HTML (format: html); {{img:path}} becomes an image or placeholder
function render(item, text) {
  if (item.format !== 'html') return markdown(text);
  return text.replace(/\{\{img:([^}]+)\}\}/g, (_, src) => image(src.trim(), ''));
}
const plain = (t) => t.replace(/<[^>]+>/g, ' ').replace(/\{\{img:[^}]+\}\}/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

// split "## References" (or "## Sources") off the end of a body
function splitRefs(body) {
  const k = body.indexOf('<!-- references -->');
  if (k >= 0) return { main: body.slice(0, k).trim(), refs: body.slice(k + 19).trim() };
  const m = body.match(/\n#{1,3}\s*(References|Sources|Works Cited)\s*\n([\s\S]*)$/i);
  if (!m) return { main: body, refs: '' };
  return { main: body.slice(0, m.index), refs: m[2].trim() };
}

/* ---------------- images ---------------- */
const usedImages = new Set();
function imgUrl(src) {
  if (/^https?:/.test(src)) return src;
  usedImages.add(src);
  return u('/images/' + src.replace(/^\/?(images\/)?/, ''));
}
const imgExists = (src) => src && (/^https?:/.test(src) || fs.existsSync(C('images', src.replace(/^\/?(images\/)?/, ''))));
function image(src, alt = '', cls = '') {
  if (imgExists(src)) return `<img class="${cls}" src="${imgUrl(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
  return `<div class="ph ${cls}" role="img" aria-label="${esc(alt)}"><span>YII</span></div>`;
}

/* ---------------- load content ---------------- */
function loadDir(dir) {
  const d = C(dir);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.md')).map((f) => {
    const { data, body } = parseFrontMatter(fs.readFileSync(path.join(d, f), 'utf8'));
    return { slug: data.slug || f.replace(/\.md$/, ''), ...data, body: body.trim() };
  });
}
// newest first. When both items have a date, the newer date wins.
// Items without a date keep their place from the old site via `order` (items with no `order` go first).
const byDate = (a, b) => (a.date && b.date && a.date !== b.date) ? b.date.localeCompare(a.date) : ((a.order ?? -1) - (b.order ?? -1)) || (b.date || '').localeCompare(a.date || '');

const articles = loadDir('articles').filter((a) => !a.draft).sort(byDate);
const memos = loadDir('memos').filter((a) => !a.draft).sort((a, b) => (b.number || 0) - (a.number || 0));
const campaigns = loadDir('campaigns').filter((a) => !a.draft).sort(byDate);
const findArticle = (slug) => articles.find((a) => a.slug === slug);
const memberByName = Object.fromEntries(members.map((m) => [m.name.toLowerCase(), m]));
for (const m of members) m.slug = m.slug || slugify(m.name);

function excerptOf(a, n = 320) {
  if (a.excerpt) return a.excerpt;
  const text = plain(splitRefs(a.body).main).replace(/^#.*$/gm, '').replace(/[*_`>#\-]|\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
  return text.length > n ? text.slice(0, n).replace(/\s+\S*$/, '') + '…' : text;
}
const readMins = (a) => Math.max(1, Math.round(plain(a.body).split(/\s+/).filter(Boolean).length / 220));
function authorLink(name) {
  if (!name) return '';
  const m = memberByName[name.toLowerCase()];
  return m ? `<a class="author" href="${u('/members/' + m.slug + '/')}">${esc(name)}</a>` : `<span class="author">${esc(name)}</span>`;
}

/* ---------------- icons ---------------- */
const I = {
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  insta: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4c5 0 9 3.1 9 7s-4 7-9 7c-.9 0-1.8-.1-2.6-.3L5 20l1.2-3.6C4.2 15.1 3 13.2 3 11c0-3.9 4-7 9-7z"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  memo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
};

/* ---------------- layout ---------------- */
// search engines show ~160 characters of a description
const clip = (t, n) => (t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '').replace(/[.,;:\s…]+$/, '') + '…');
const NAV = [
  { href: '/about/', key: 'nav.about', label: 'About' },
  { href: '/articles/', key: 'nav.articles', label: 'Articles & Reports' },
  { href: '/campaigns/', key: 'nav.campaigns', label: 'Campaigns' },
  { href: '/members/', key: 'nav.members', label: 'Members' },
  { href: '/contact/', key: 'nav.contact', label: 'Contact' },
];
const logo = (tag = 'a') => `<${tag} class="logo" ${tag === 'a' ? `href="${u('/')}"` : ''} aria-label="${esc(site.name)} home"><span class="logo-short">${esc(site.short)}</span><span class="logo-bar"></span><span class="logo-name">${esc(site.name)}</span></${tag}>`;

function contactItem(it) {
  const map = {
    email: [I.mail, `mailto:${it.value}`],
    instagram: [I.insta, `https://instagram.com/${it.value.replace(/^@/, '')}`],
    phone: [I.phone, `tel:${it.value.replace(/[^\d+]/g, '')}`],
    kakao: [I.chat, it.url || null],
  };
  const [icon, href] = map[it.type] || ['', it.url];
  const inner = `${icon}<span><small>${esc(it.label)}</small>${esc(it.value)}</span>`;
  return `<li>${href ? `<a href="${href}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ''}>${inner}</a>` : `<span class="nolink">${inner}</span>`}</li>`;
}

function layout({ title, description, active = '', body, path: p = '/', ogImage, ogType = 'website', meta = '', jsonLd, noindex = false, bodyClass = '' }) {
  const fullTitle = title ? `${title} | ${site.name}` : `${site.name} | ${site.tagline}`;
  const desc = clip((description || site.description).replace(/\s+/g, ' ').trim(), 160);
  // share image: a 1200x630 JPG from content/images/og/ (made by tools/make_share_images.py), else the default card
  const og = ogImage && imgExists(ogImage) ? site.url + imgUrl(ogImage) : site.url + u('/images/og-default.jpg');
  const ogAlt = title || `${site.name} | ${site.tagline}`;
  const navLinks = NAV.map((n) => `<a href="${u(n.href)}" data-i18n="${n.key}"${active === n.href ? ' aria-current="page"' : ''}>${n.label}</a>`).join('');
  const mobileLinks = NAV.map((n) => `<li><a href="${u(n.href)}"${active === n.href ? ' aria-current="page"' : ''}><span data-i18n="${n.key}">${n.label}</span>${I.arrow}</a></li>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${site.url}${u(p)}">`}
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title || `${site.name} | ${site.tagline}`)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${site.url}${u(p)}">
<meta property="og:image" content="${og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(ogAlt)}">
<meta property="og:locale" content="en_US">
${meta}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title || site.name)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${og}">
<meta name="theme-color" content="#22184E">
<link rel="icon" href="${u('/favicon.ico')}" sizes="48x48">
<link rel="icon" href="${u('/favicon-32.png')}" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="${u('/apple-touch-icon.png')}">
<link rel="manifest" href="${u('/site.webmanifest')}">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>\n` : ''}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Rashi+Hebrew:wght@400;500;600;700&family=Noto+Serif+KR:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${u('/assets/styles.css')}?v=${BUILD}">
<script src="${u('/assets/main.js')}?v=${BUILD}" defer></script>
</head>
<body class="${bodyClass}">
<a class="skip" href="#main" data-i18n="ui.skip">Skip to content</a>
<header class="site-header">
  <div class="wrap header-inner">
    ${logo()}
    <nav class="main-nav" aria-label="Main">${navLinks}</nav>
    <div class="header-actions">
      <button class="menu-btn" type="button" data-menu-open aria-label="Open menu" aria-controls="mobile-menu" aria-expanded="false">${I.menu}</button>
    </div>
  </div>
  <div class="progress" aria-hidden="true"><span></span></div>
</header>
<div class="mobile-menu" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu" hidden>
  <div class="mm-top">${logo()}<button class="mm-close" type="button" data-menu-close aria-label="Close menu">${I.close}</button></div>
  <ul class="mm-links">${mobileLinks}</ul>
</div>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="foot-top">${logo()}</div>
    <div class="foot-grid">
      <div class="foot-col"><h2 data-i18n="ui.explore">Explore</h2><ul class="foot-nav">${NAV.map((n) => `<li><a href="${u(n.href)}" data-i18n="${n.key}">${n.label}</a></li>`).join('')}<li><a href="${u('/policy-memos/')}" data-i18n="nav.memos">Policy Memos</a></li></ul></div>
      ${site.contacts.map((g) => `<div class="foot-col"><h2>${esc(g.heading)}</h2><ul class="contact-list">${g.items.map(contactItem).join('')}</ul></div>`).join('')}
    </div>
    <div class="foot-bottom"><span>© ${new Date().getFullYear()} ${esc(site.name)}.</span> <span data-i18n="ui.rights">All rights reserved.</span></div>
  </div>
</footer>
</body>
</html>`;
}

/* ---------------- components ---------------- */
const articleUrl = (a) => u(`/articles/${a.slug}/`);
const memoUrl = (m) => u(`/policy-memos/${m.slug}/`);
const campaignUrl = (c) => u(`/campaigns/${c.slug}/`);

function cardSmall(a) {
  return `<article class="card-sm">
  <a class="media" href="${articleUrl(a)}" tabindex="-1" aria-hidden="true">${image(a.image, a.title)}</a>
  <h3><a href="${articleUrl(a)}">${esc(a.title)}</a></h3>
  <p class="byline">${esc(a.author || '')}</p>
</article>`;
}

function memoCard(m, tone = 'dark') {
  return `<a class="memo-card memo-${tone}" href="${memoUrl(m)}">
  <h3>${I.memo}<span>${esc(m.title)}</span></h3>
  <p><strong data-i18n="ui.subject">Subject:</strong> ${esc(m.subject || '')}</p>
  <p class="memo-date"><strong data-i18n="ui.date">Date:</strong> ${fmtDate(m.date)}</p>
</a>`;
}

function sectionHead(labelHtml, link) {
  return `<div class="sec-head"><h2>${labelHtml}</h2>${link ? `<a class="more" href="${u(link.href)}"><span data-i18n="${link.key}">${link.label}</span>${I.arrow}</a>` : ''}</div>`;
}

/* ---------------- pages ---------------- */
const pages = [];
const page = (p, html) => pages.push([p, html]);

// HOME
{
  // Home slots fill from the newest article down, in this order:
  // lead (1) → right column (4) → featured article (1) → featured report (1) → spotlights (2) → grid.
  // A new article takes the lead and pushes everything down one spot.
  // To pin something instead, put its slug in content/home.json (lead, secondary, featuredArticle, featuredReport, spotlights).
  const taken = new Set();
  const nextNew = () => articles.find((a) => !taken.has(a) && !pinned.has(a));
  const pinned = new Set([home.lead, ...(home.secondary || []), home.featuredArticle, home.featuredReport, ...(home.spotlights || [])].map(findArticle).filter(Boolean));
  const take = (slug) => { const a = findArticle(slug) || nextNew(); if (a) taken.add(a); return a; };
  const lead = take(home.lead);
  const side = [0, 1, 2, 3].map((i) => take((home.secondary || [])[i])).filter(Boolean);
  const feat = take(home.featuredArticle);
  const report = take(home.featuredReport);
  const spotList = [0, 1].map((i) => take((home.spotlights || [])[i])).filter(Boolean);
  const spots = spotList.map((a) => ({ a, label: a.category || '' }));
  const used = new Set([lead, ...side, feat, report, ...spots.map((s) => s.a)].filter(Boolean).map((a) => a.slug));
  const rest = articles.filter((a) => !used.has(a.slug));
  const gridCount = home.gridCount || 48;

  const body = `
<section class="hero wrap">
  <article class="hero-lead">
    <a class="media" href="${articleUrl(lead)}" tabindex="-1" aria-hidden="true">${image(lead.image, lead.title)}</a>
    <h1><a href="${articleUrl(lead)}">${esc(lead.title)}</a></h1>
    <p class="excerpt">${esc(excerptOf(lead))}</p>
    <p class="byline">${esc(lead.author || '')}${lead.date ? `<br><time datetime="${lead.date}">${fmtDate(lead.date)}</time>` : ''}</p>
  </article>
  <div class="hero-side">${side.map(cardSmall).join('')}</div>
</section>

${memos.length ? `<section class="band band-1"><div class="wrap">
  ${sectionHead('<span data-i18n="home.memos">UN Policy Memos</span>', { href: '/policy-memos/', key: 'ui.viewAll', label: 'View all' })}
  <div class="memo-grid">${memos.slice(0, 4).map((m) => memoCard(m)).join('')}</div>
</div></section>` : ''}

${feat ? `<section class="band band-2"><div class="wrap">
  ${sectionHead('<span data-i18n="home.featuredArticle">Featured Article</span>')}
  <article class="feature">
    <a class="media" href="${articleUrl(feat)}" tabindex="-1" aria-hidden="true">${image(feat.image, feat.title)}</a>
    <div>
      <h3><a href="${articleUrl(feat)}">${esc(feat.title)}</a></h3>
      <p class="excerpt">${esc(excerptOf(feat, 640))}</p>
      <a class="more" href="${articleUrl(feat)}"><span data-i18n="ui.readArticle">Read article</span>${I.arrow}</a>
    </div>
  </article>
</div></section>` : ''}

${report ? `<section class="band band-1"><div class="wrap">
  ${sectionHead('<span data-i18n="home.featuredReport">Featured Report</span>')}
  <a class="report" href="${articleUrl(report)}">
    ${image(report.image, report.title)}
    <div class="report-cap"><h3>${esc(report.title)}</h3><p><span data-i18n="ui.presentedBy">Presented by</span> ${esc(report.author || '')}</p></div>
  </a>
</div></section>` : ''}

${spots.length ? `<section class="band band-2"><div class="wrap spot-grid">
  ${spots.map((s) => `<div class="spot">
    ${sectionHead(`Spotlight on <b>${esc(s.label)}</b>`)}
    <article>
      <a class="media" href="${articleUrl(s.a)}" tabindex="-1" aria-hidden="true">${image(s.a.image, s.a.title)}</a>
      <h3><a href="${articleUrl(s.a)}">${esc(s.a.title)}</a></h3>
      <p class="excerpt">${esc(excerptOf(s.a))}</p>
      <p class="byline"><span data-i18n="ui.commentaryBy">Commentary by</span> ${esc(s.a.author || '')}${s.a.date ? `<br><time datetime="${s.a.date}">${fmtDate(s.a.date).replace(/ 0(\d),/, ' $1,')}</time>` : ''}</p>
    </article>
  </div>`).join('')}
</div></section>` : ''}

<section class="wrap from-yii">
  ${sectionHead('<span data-i18n="home.fromYii">From Youth Impact Institute</span>', { href: '/articles/', key: 'ui.viewAll', label: 'View all' })}
  <div class="grid-4">${rest.slice(0, gridCount).map(cardSmall).join('')}</div>
  ${rest.length > gridCount ? `<div class="center"><a class="btn" href="${u('/articles/')}" data-i18n="ui.allArticles">See all articles</a></div>` : ''}
</section>`;
  page('/', layout({ body, path: '/', bodyClass: 'home', jsonLd: {
    '@context': 'https://schema.org', '@type': 'Organization', name: site.name, alternateName: site.short, url: site.url + u('/'),
    logo: site.url + u('/icon-512.png'), description: site.description,
    sameAs: site.contacts.flatMap((g) => g.items).filter((i) => i.type === 'instagram').map((i) => `https://instagram.com/${i.value.replace(/^@/, '')}`),
  } }));
}

// ALL ARTICLES
{
  const authors = [...new Set(articles.map((a) => a.author).filter(Boolean))].sort();
  const body = `
<section class="wrap page">
  <h1 class="page-title" data-i18n="page.articles">All Articles &amp; Reports</h1>
  <div class="filters" role="search">
    <label class="search">${I.search}<input type="search" placeholder="Search articles" data-i18n-ph="ui.search" data-filter-q aria-label="Search articles"></label>
    <select data-filter-author aria-label="Filter by author"><option value="" data-i18n="ui.allAuthors">All authors</option>${authors.map((a) => `<option>${esc(a)}</option>`).join('')}</select>
  </div>
  <p class="result-count" aria-live="polite"><span data-count>${articles.length}</span> <span data-i18n="ui.results">results</span></p>
  <ol class="list" data-list>
  ${articles.map((a) => `<li class="list-item" data-author="${esc(a.author || '')}" data-text="${esc((a.title + ' ' + (a.author || '') + ' ' + excerptOf(a, 400)).toLowerCase())}">
    <a class="media" href="${articleUrl(a)}" tabindex="-1" aria-hidden="true">${image(a.image, a.title)}</a>
    <div>
      ${a.type === 'report' ? '<span class="tag" data-i18n="ui.report">Report</span>' : ''}
      <h2><a href="${articleUrl(a)}">${esc(a.title)}</a></h2>
      <p class="excerpt">${esc(excerptOf(a))}</p>
      <p class="byline">${esc(a.author || '')}${a.date ? ` · <time datetime="${a.date}">${fmtDate(a.date)}</time>` : ''}</p>
    </div>
  </li>`).join('')}
  </ol>
  <p class="empty" data-empty hidden data-i18n="ui.noResults">No articles match your search.</p>
  <div class="center"><button class="btn" type="button" data-load-more data-i18n="ui.loadMore">Load more</button></div>
</section>`;
  page('/articles/', layout({ title: 'Articles & Reports', description: `Research articles and reports by ${site.name}'s student members on global affairs, policy, health, education and more.`, body, active: '/articles/', path: '/articles/' }));
}

function shareBar() {
  return `<div class="share" aria-label="Share">
  <button type="button" class="chip" data-share>${I.share}<span data-i18n="ui.share">Share</span></button>
  <button type="button" class="chip" data-copy>${I.link}<span data-i18n="ui.copyLink">Copy link</span></button>
</div>`;
}
function refsBlock(refs) {
  if (!refs) return '';
  return `<details class="refs"><summary><span data-i18n="ui.references">References</span>${I.arrow}</summary><div class="prose refs-body">${/^</.test(refs) ? refs : markdown(refs)}</div></details>`;
}

// ARTICLE DETAIL
for (const a of articles) {
  const { main, refs } = splitRefs(a.body);
  const related = articles.filter((x) => x !== a && x.author === a.author).concat(articles.filter((x) => x !== a && x.author !== a.author)).slice(0, 4);
  const body = `
<article class="wrap article">
  <header class="art-head">
    ${a.category || a.type === 'report' ? `<div class="tags">${a.type === 'report' ? '<span class="tag">Report</span>' : ''}${a.category ? `<a class="tag" href="${u('/articles/')}?q=${encodeURIComponent(a.category)}">${esc(a.category)}</a>` : ''}</div>` : ''}
    <h1>${esc(a.title)}</h1>
    <p class="art-meta">${authorLink(a.author)}${a.date ? `<span class="dot">·</span><time datetime="${a.date}">${fmtDate(a.date)}</time>` : ''}${a.body ? `<span class="dot">·</span><span class="rt">${I.clock}${readMins(a)} <span data-i18n="ui.minRead">min read</span></span>` : ''}</p>
  </header>
  <figure class="art-hero">${image(a.image, a.title)}${a.imageCaption ? `<figcaption>${esc(a.imageCaption)}</figcaption>` : ''}</figure>
  <div class="art-body">
    ${shareBar()}
    <div class="prose">${main ? render(a, main) : `<p>${esc(a.excerpt || '')}</p><p class="muted" data-i18n="ui.comingSoon">The full text of this article will be available soon.</p>`}</div>
    ${refsBlock(refs)}
  </div>
</article>
${related.length ? `<section class="wrap related">${sectionHead('<span data-i18n="ui.moreFrom">More from Youth Impact Institute</span>', { href: '/articles/', key: 'ui.viewAll', label: 'View all' })}<div class="grid-4">${related.map(cardSmall).join('')}</div></section>` : ''}`;
  page(`/articles/${a.slug}/`, layout({
    title: a.title, description: excerptOf(a, 160), body, active: '/articles/', path: `/articles/${a.slug}/`,
    ogImage: `og/${a.slug}.jpg`, ogType: 'article', bodyClass: 'reading',
    meta: `${a.date ? `<meta property="article:published_time" content="${a.date}">\n` : ''}${a.author ? `<meta property="article:author" content="${esc(a.author)}">\n<meta name="author" content="${esc(a.author)}">\n` : ''}${a.category ? `<meta property="article:section" content="${esc(a.category)}">\n` : ''}`,
    jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: clip(excerptOf(a), 160), datePublished: a.date || undefined,
      author: a.author ? { '@type': 'Person', name: a.author } : undefined, image: imgExists(`og/${a.slug}.jpg`) ? site.url + imgUrl(`og/${a.slug}.jpg`) : undefined,
      publisher: { '@type': 'Organization', name: site.name, logo: { '@type': 'ImageObject', url: site.url + u('/icon-512.png') } }, mainEntityOfPage: site.url + u(`/articles/${a.slug}/`) },
  }));
}

// MEMOS
{
  const body = `
<section class="wrap page">
  <h1 class="page-title" data-i18n="page.memos">UN Policy Memos</h1>
  <p class="lede" data-i18n="page.memosLede">Short, actionable policy recommendations written by YII members.</p>
  <div class="memo-grid memo-grid-light">${memos.map((m) => memoCard(m, 'light')).join('')}</div>
</section>`;
  page('/policy-memos/', layout({ title: 'UN Policy Memos', description: `UN policy memos by ${site.name}: short, actionable recommendations from students on issues that shape young people's futures.`, body, active: '/articles/', path: '/policy-memos/' }));
}
for (const m of memos) {
  const { main, refs } = splitRefs(m.body);
  const i = memos.indexOf(m);
  const prev = memos[i + 1], next = memos[i - 1];
  const body = `
<article class="wrap article memo">
  <header class="art-head">
    <a class="back" href="${u('/policy-memos/')}">${I.arrow}<span data-i18n="home.memos">UN Policy Memos</span></a>
    <h1>${I.memo}<span>${esc(m.title)}</span></h1>
    <dl class="memo-meta">
      ${m.subject ? `<div><dt data-i18n="ui.subjectL">Subject</dt><dd>${esc(m.subject)}</dd></div>` : ''}
      <div><dt data-i18n="ui.dateL">Date</dt><dd><time datetime="${m.date}">${fmtDate(m.date)}</time></dd></div>
      ${m.author ? `<div><dt data-i18n="ui.authorL">Author</dt><dd>${authorLink(m.author)}</dd></div>` : ''}
    </dl>
  </header>
  <div class="art-body">
    ${shareBar()}
    <div class="prose">${main ? render(m, main) : '<p class="muted" data-i18n="ui.memoSoon">The full text of this memo will be available soon.</p>'}</div>
    ${refsBlock(refs)}
    <nav class="pager" aria-label="More memos">
      ${prev ? `<a href="${memoUrl(prev)}"><small data-i18n="ui.previous">Previous</small>${esc(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a class="next" href="${memoUrl(next)}"><small data-i18n="ui.next">Next</small>${esc(next.title)}</a>` : ''}
    </nav>
  </div>
</article>`;
  page(`/policy-memos/${m.slug}/`, layout({ title: m.title + (m.subject ? ': ' + m.subject : ''), description: `${m.title} by ${site.name}${m.subject ? `: ${m.subject}` : ''}. A student-written policy recommendation.`, body, active: '/articles/', path: `/policy-memos/${m.slug}/` }));
}

// CAMPAIGNS
{
  const body = `
<section class="wrap page">
  <h1 class="page-title" data-i18n="page.campaigns">Campaigns</h1>
  <div class="camp-grid">
  ${campaigns.map((c) => `<article class="camp-card">
    <a class="media" href="${campaignUrl(c)}" tabindex="-1" aria-hidden="true">${image(c.image, c.title)}</a>
    <div class="camp-body">
      <h2><a href="${campaignUrl(c)}">${esc(c.title)}</a></h2>
      <p class="excerpt">${esc(excerptOf(c, 220))}</p>
      <p class="byline"><span data-i18n="ui.by">By</span> ${esc(c.author || '')}</p>
      <a class="btn" href="${campaignUrl(c)}" data-i18n="ui.viewDetails">View details</a>
    </div>
  </article>`).join('')}
  </div>
</section>`;
  page('/campaigns/', layout({ title: 'Campaigns', description: `Join ${site.name}'s student-led advocacy campaigns on humanitarian crises and global issues.`, body, active: '/campaigns/', path: '/campaigns/' }));
}
for (const c of campaigns) {
  const { main, refs } = splitRefs(c.body);
  const fb = site.firebase && site.firebase.apiKey
    ? `<script>window.YII_FIREBASE = ${JSON.stringify(site.firebase)};</script><script type="module" src="${u('/assets/campaign.js')}?v=${BUILD}"></script>`
    : '';
  const body = `${fb}
<article class="wrap campaign">
  <h1>${esc(c.title)}</h1>
  <figure class="camp-hero">${image(c.image, c.title)}</figure>
  <div class="camp-layout">
    <aside class="camp-side">
      <div class="panel count"><strong data-count-num data-base="${Number(c.supporters || 0)}">${Number(c.supporters || 0).toLocaleString('en-US')}</strong><span data-i18n="ui.joined">joined this campaign</span></div>
      <form class="panel join" data-join data-campaign="${esc(c.slug)}">
        <h2 data-i18n="ui.joinCampaign">Join this campaign</h2>
        <input type="text" name="_honey" class="hp" tabindex="-1" autocomplete="off">
        <div class="row2">
          <label><span data-i18n="ui.lastName">Last name</span><input name="last_name" required autocomplete="family-name"></label>
          <label><span data-i18n="ui.firstName">First name</span><input name="first_name" required autocomplete="given-name"></label>
        </div>
        <label><span data-i18n="ui.email">Email</span><input type="email" name="email" required autocomplete="email"></label>
        <button class="btn btn-block" type="submit" data-i18n="ui.joinCampaign">Join this campaign</button>
        <div class="thanks thanks-below" data-thanks hidden><p>Thank you for joining! Your support has been counted.</p></div>
        <div class="thanks thanks-below form-note" data-already hidden><p>You've already joined this campaign with this email. Thank you!</p></div>
        <div class="thanks thanks-below form-error" data-error hidden><p>Something went wrong and your sign-up wasn't saved. Please try again.</p></div>
      </form>
    </aside>
    <div class="camp-main">
      <p class="art-meta"><span data-i18n="ui.by">By</span>${authorLink(c.author)}</p>
      ${shareBar()}
      <div class="prose">${render(c, main)}</div>
      ${refsBlock(refs)}
      ${c.website ? `<p class="center"><a class="btn" href="${esc(c.website)}" target="_blank" rel="noopener"><span data-i18n="ui.visitWebsite">Visit website</span>${I.ext}</a></p>` : ''}
    </div>
  </div>
</article>`;
  page(`/campaigns/${c.slug}/`, layout({ title: c.title, description: excerptOf(c, 160), body, active: '/campaigns/', path: `/campaigns/${c.slug}/`, ogImage: `og/campaign-${c.slug}.jpg` }));
}

// MEMBERS
{
  const body = `
<section class="wrap page">
  <h1 class="page-title center-title" data-i18n="page.members">Members</h1>
  <ul class="member-grid">
  ${members.map((m) => {
    const n = articles.filter((a) => a.author && a.author.toLowerCase() === m.name.toLowerCase()).length;
    return `<li><a class="member" href="${u('/members/' + m.slug + '/')}">
      ${imgExists(m.photo) ? image(m.photo, m.name, 'portrait') : `<div class="portrait avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg></div>`}
      <h2>${esc(m.name)}</h2>
      ${m.role ? `<p>${esc(m.role)}</p>` : ''}
      ${n ? `<span class="count-chip">${n} <span data-i18n="${n === 1 ? 'ui.article' : 'ui.articlesN'}">${n === 1 ? 'article' : 'articles'}</span></span>` : ''}
    </a></li>`;
  }).join('')}
  </ul>
</section>`;
  page('/members/', layout({ title: 'Members', description: `Meet the student researchers and writers of ${site.name}.`, body, active: '/members/', path: '/members/' }));
}
for (const m of members) {
  const mine = articles.filter((a) => a.author && a.author.toLowerCase() === m.name.toLowerCase());
  const myMemos = memos.filter((x) => x.author && x.author.toLowerCase() === m.name.toLowerCase());
  const body = `
<section class="wrap page member-page">
  <a class="back" href="${u('/members/')}">${I.arrow}<span data-i18n="page.members">Members</span></a>
  <header class="member-head">
    ${imgExists(m.photo) ? image(m.photo, m.name, 'portrait') : `<div class="portrait avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg></div>`}
    <div><h1>${esc(m.name)}</h1>${m.role ? `<p class="role">${esc(m.role)}</p>` : ''}${m.bio ? `<p>${esc(m.bio)}</p>` : ''}</div>
  </header>
  ${mine.length || myMemos.length ? `${sectionHead('<span data-i18n="ui.publications">Publications</span>')}<div class="grid-4">${mine.map(cardSmall).join('')}</div>${myMemos.length ? `<div class="memo-grid memo-grid-light">${myMemos.map((x) => memoCard(x, 'light')).join('')}</div>` : ''}` : '<p class="muted" data-i18n="ui.noPubs">No publications yet.</p>'}
</section>`;
  page(`/members/${m.slug}/`, layout({ title: m.name, description: `${m.name}${m.role ? ' — ' + m.role : ''} at ${site.name}`, body, active: '/members/', path: `/members/${m.slug}/` }));
}

// ABOUT
{
  const body = `
<section class="wrap page about">
  <h1 class="page-title center-title">${esc(about.title)}</h1>
  ${about.sections.map((s, i) => `<section class="about-row${i % 2 ? ' flip' : ''}">
    <div class="about-text"><h2>${esc(s.heading)}</h2><div class="prose">${markdown(s.body)}</div></div>
    <figure class="about-media">${image(s.image, s.heading)}</figure>
  </section>`).join('')}
</section>`;
  page('/about/', layout({ title: 'About', description: `Who we are, our mission and what we do: ${site.name} connects high school students worldwide through research, advocacy and leadership.`, body, active: '/about/', path: '/about/' }));
}

// CONTACT
{
  const next = `${site.url}${u('/contact/')}?sent=1`;
  const body = `
<section class="wrap page contact">
  <h1 class="page-title">Contact Us</h1>
  <div class="contact-layout">
    <div class="contact-info">
      <p class="lede-text">Questions about our research, campaigns or joining YII? Send us a message and we'll get back to you by email.</p>
      ${site.contacts.map((g) => `<div class="contact-group"><h2>${esc(g.heading)}</h2><ul class="contact-list">${g.items.map(contactItem).join('')}</ul></div>`).join('')}
    </div>
    <form class="panel contact-form" action="https://formsubmit.co/${esc(site.contactFormEmail || site.formEmail)}" method="POST" data-contact>
      <input type="hidden" name="_subject" value="New message from the Youth Impact Institute website">
      <input type="hidden" name="_next" value="${esc(next)}">
      <input type="hidden" name="_template" value="table">
      <input type="text" name="_honey" class="hp" tabindex="-1" autocomplete="off">
      <div class="row2">
        <label for="c-name"><span>Name</span><input id="c-name" name="name" required autocomplete="name"></label>
        <label for="c-email"><span>Email</span><input id="c-email" type="email" name="email" required autocomplete="email"></label>
      </div>
      <label for="c-topic"><span>Topic</span>
        <select id="c-topic" name="topic">
          <option>General question</option><option>Joining YII</option><option>Research &amp; articles</option><option>Campaigns</option><option>Partnerships</option><option>Other</option>
        </select>
      </label>
      <label for="c-msg"><span>Message</span><textarea id="c-msg" name="message" rows="7" required></textarea></label>
      <button class="btn btn-block" type="submit">Send message</button>
      <div class="thanks thanks-below" data-thanks hidden><p>Thank you! Your message has been sent. We'll reply to you by email.</p></div>
    </form>
  </div>
</section>`;
  page('/contact/', layout({ title: 'Contact Us', description: `Contact ${site.name} about our research, campaigns, partnerships or joining as a member.`, body, active: '/contact/', path: '/contact/' }));
}

// 404
page('/404.html', layout({
  title: 'Page not found', path: '/404.html', noindex: true, body: `
<section class="wrap notfound">
  <p class="nf-code">404</p>
  <h1 data-i18n="nf.title">We couldn't find that page</h1>
  <p data-i18n="nf.text">The page may have moved, or the link may be mistyped.</p>
  <div class="nf-actions"><a class="btn" href="${u('/')}" data-i18n="nf.home">Back to home</a><a class="btn btn-ghost" href="${u('/articles/')}" data-i18n="ui.allArticles">See all articles</a></div>
</section>` }));

/* ---------------- write ---------------- */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const [p, html] of pages) {
  const file = p.endsWith('.html') ? path.join(OUT, p) : path.join(OUT, p, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}
fs.cpSync(path.join(ROOT, 'src'), path.join(OUT, 'assets'), { recursive: true });
fs.cpSync(path.join(ROOT, 'static'), OUT, { recursive: true });
if (fs.existsSync(C('images'))) fs.cpSync(C('images'), path.join(OUT, 'images'), { recursive: true });
if (site.cname) fs.writeFileSync(path.join(OUT, 'CNAME'), site.cname + '\n');
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
fs.writeFileSync(path.join(OUT, 'site.webmanifest'), JSON.stringify({ name: site.name, short_name: site.short, description: site.description, start_url: u('/'), display: 'standalone', background_color: '#ffffff', theme_color: '#22184E',
  icons: [{ src: u('/icon-192.png'), sizes: '192x192', type: 'image/png' }, { src: u('/icon-512.png'), sizes: '512x512', type: 'image/png' }] }, null, 2));
const urls = pages.map(([p]) => p).filter((p) => !p.endsWith('.html'));
const lastmod = Object.fromEntries([...articles.map((a) => [`/articles/${a.slug}/`, a.date]), ...memos.map((m) => [`/policy-memos/${m.slug}/`, m.date])].filter(([, d]) => d));
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((p) => `  <url><loc>${site.url}${u(p)}</loc>${lastmod[p] ? `<lastmod>${lastmod[p]}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site.url}${u('/sitemap.xml')}\n`);

const missing = [...usedImages].filter((s) => !imgExists(s));
const allImgs = [...articles, ...campaigns].map((a) => a.image).concat(members.map((m) => m.photo), about.sections.map((s) => s.image)).filter(Boolean);
const missingAll = [...new Set(allImgs.filter((s) => !imgExists(s)).concat(missing))];
console.log(`Built ${pages.length} pages → docs/  (${articles.length} articles, ${memos.length} memos, ${campaigns.length} campaigns, ${members.length} members)`);
if (missingAll.length) console.log(`${missingAll.length} images not added yet (showing placeholders). Run "node build.mjs --missing" to list them.`);
if (process.argv.includes('--missing')) missingAll.forEach((s) => console.log('  content/images/' + s));
