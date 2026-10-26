#!/usr/bin/env python3
"""Import the Bubble "FullArticles" CSV exports into content/.

Usage: python3 tools/import_bubble.py export1.csv [export2.csv ...]

- Rows with policyMemo? = yes  -> content/memos/policy-memo-<n>.md
- every other row               -> content/articles/<slug>.md
- Bubble BBCode is converted to HTML.
- Every image (main + inline) is listed in tools/image-manifest.tsv so
  tools/download-images.sh can fetch them all into content/images/.
- content/home.json is rebuilt from the [Section] columns.
"""
import csv, html, json, re, sys, unicodedata
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, unquote

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / 'content'
csv.field_size_limit(10**9)

# Old-site spotlight headings, keyed by section column.
SPOTLIGHT_CATEGORY = {'[Section] Spotlight1': 'Immigration', '[Section] Spotlight2': 'AI'}

def slugify(s, n=8):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"['’‘]", '', s)
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return '-'.join(s.split('-')[:n]) or 'untitled'

def strip_bb(s):
    s = re.sub(r'\[/?[a-zA-Z]+(?:[= ][^\]]*)?\]', '', s or '')
    return re.sub(r'\s+', ' ', s).strip()

def parse_date(s, fallback=''):
    s = strip_bb(s)
    s = re.sub(r'^Date\s*:?\s*', '', s, flags=re.I).replace('. ', ', ').strip()
    for fmt in ('%B %d, %Y', '%B %d %Y', '%b %d, %Y'):
        try: return datetime.strptime(s, fmt).strftime('%Y-%m-%d')
        except ValueError: pass
    m = re.match(r'(\w{3} \d{1,2}, \d{4})', fallback or '')
    if m: return datetime.strptime(m.group(1), '%b %d, %Y').strftime('%Y-%m-%d')
    return ''

def source_caption(s):
    m = re.fullmatch(r'<\s*(?:Source\s*:\s*)?(.*?)\s*>', s.strip(), flags=re.I)
    return 'Source: ' + (m.group(1) if m else s.strip())

def fm_value(v):
    v = str(v).replace('\n', ' ').strip()
    return v

manifest = []  # (url, local path)
def add_image(url, local_base):
    url = url.strip()
    if url.startswith('//'): url = 'https:' + url
    clean = url.split('?')[0]
    ext = Path(unquote(urlparse(clean).path)).suffix.lower() or '.jpg'
    if ext not in ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg'): ext = '.jpg'
    local = f'{local_base}{ext}'
    manifest.append((clean, local))
    return local

LINK = lambda href, text: f'<a href="{html.escape(href, quote=True)}" target="_blank" rel="noopener">{text}</a>'

def inline(t):
    """t is already HTML-escaped text containing BBCode."""
    t = re.sub(r'\[url=([^\]]+)\](.*?)\[/url\]', lambda m: LINK(html.unescape(m.group(1)), m.group(2)), t, flags=re.S)
    t = re.sub(r'\[url\](.*?)\[/url\]', lambda m: LINK(html.unescape(m.group(1)), m.group(1)), t, flags=re.S)
    t = re.sub(r'\[b\](.*?)\[/b\]', r'<strong>\1</strong>', t, flags=re.S)
    t = re.sub(r'\[i\](.*?)\[/i\]', r'<em>\1</em>', t, flags=re.S)
    t = re.sub(r'\[u\](.*?)\[/u\]', r'<u>\1</u>', t, flags=re.S)
    t = re.sub(r'\[/?(color|font|size|center|left|right|justify)(=[^\]]*)?\]', '', t)
    # bare urls not already inside an href
    t = re.sub(r'(?<!href=")(?<!">)(https?://[^\s<\]"]+)', lambda m: LINK(html.unescape(m.group(1)), m.group(1)), t)
    t = re.sub(r'\[/?[a-z]{1,8}(=[^\]]*)?\]', '', t)  # any stray tags
    return t.strip()

def bb_to_html(src, slug, heading='h2'):
    src = (src or '').replace('\r\n', '\n').replace('\r', '\n')
    # images -> placeholder tokens resolved by build.mjs
    count = [0]
    def img(m):
        count[0] += 1
        local = add_image(m.group(1), f'articles/{slug}-{count[0]}')
        return f'\n\n{{{{img:{local}}}}}\n\n'
    src = re.sub(r'\[img[^\]]*\](.*?)\[/img\]', img, src, flags=re.S)
    src = html.escape(src, quote=False)
    # lists: put each list on its own block
    src = re.sub(r'\[(ul|ol)\]', r'\n\n[\1]', src)
    src = re.sub(r'\[/(ul|ol)\]', r'[/\1]\n\n', src)

    out = []
    for block in re.split(r'\n\s*\n', src):
        block = block.strip()
        if not block: continue
        m = re.fullmatch(r'\{\{img:([^}]+)\}\}', block)
        if m: out.append(f'<figure>{{{{img:{m.group(1)}}}}}</figure>'); continue
        lm = re.fullmatch(r'\[(ul|ol)\](.*)\[/\1\]', block, flags=re.S)
        if lm:
            items = re.findall(r'\[li\](.*?)(?:\[/li\]|(?=\[li\])|$)', lm.group(2), flags=re.S)
            items = [inline(i.replace('\n', ' ')) for i in items if i.strip()]
            out.append(f'<{lm.group(1)}>' + ''.join(f'<li>{i}</li>' for i in items) + f'</{lm.group(1)}>')
            continue
        para = []
        def flush():
            if para: out.append('<p>' + '<br>'.join(para) + '</p>'); para.clear()
        for line in block.split('\n'):
            line = line.strip()
            if not line: continue
            cap = re.fullmatch(r'\[size=2\](.*)\[/size\]', line)
            if cap:
                flush(); txt = inline(cap.group(1))
                txt = re.sub(r'^(<strong>)?&lt;\s*(?:Source\s*:\s*)?(.*?)\s*&gt;(</strong>)?$', r'Source: \2', txt, flags=re.I)
                out.append(f'<p class="caption">{txt}</p>'); continue
            big = re.fullmatch(r'\[size=[3-9]\](.*)\[/size\]', line)
            hd = re.fullmatch(r'\[b\]([^\[]{1,140}?)\[/b\]:?', line)
            if big or (hd and not hd.group(1).strip().endswith(':') and len(hd.group(1)) < 140):
                flush(); out.append(f'<{heading}>{inline((big or hd).group(1))}</{heading}>'); continue
            para.append(inline(line))
        flush()
    return '\n'.join(out)

def refs_to_html(src):
    lines = [l.strip() for l in (src or '').replace('\r', '').split('\n') if l.strip()]
    if not lines: return ''
    return '<ul>' + ''.join(f'<li>{inline(html.escape(l, quote=False))}</li>' for l in lines) + '</ul>'

def main(paths):
    rows = []
    for p in paths:
        with open(p, encoding='utf-8-sig', newline='') as f: rows += list(csv.DictReader(f))
    for d in ('articles', 'memos'):
        for f in (CONTENT / d).glob('*.md'): f.unlink()
    (CONTENT / 'articles').mkdir(parents=True, exist_ok=True); (CONTENT / 'memos').mkdir(parents=True, exist_ok=True)

    home = {'lead': None, 'secondary': [], 'featuredArticle': None, 'featuredReport': None, 'spotlights': [None, None], 'gridCount': 48}
    used_slugs = set(); n_art = n_memo = 0
    for r in rows:
        if r.get('*status', '').strip().lower() not in ('publish', 'pubish'): continue
        title = re.sub(r'^[^\w“"\'(]+', '', r['01_Title']).strip()
        if r.get('policyMemo?', '').strip().lower() == 'yes':
            num = int(re.search(r'(\d+)', title).group(1))
            body = bb_to_html(r['07_Content'], f'policy-memo-{num}', heading='h3')
            refs = refs_to_html(r['08_References'])
            fm = {'title': f'Policy Memo {num}', 'number': num, 'subject': re.sub(r'^Subject\s*:\s*', '', strip_bb(r['06_Description']), flags=re.I),
                  'date': parse_date(r['05_Published Date'], r.get('Creation Date', '')), 'format': 'html'}
            write(CONTENT / 'memos' / f'policy-memo-{num}.md', fm, body, refs); n_memo += 1
            continue
        slug = slugify(title)
        while slug in used_slugs: slug += '-2'
        used_slugs.add(slug)
        fm = {'title': title, 'author': re.sub(r'^By\s+', '', r['04_Author'].strip()),
              'date': parse_date(r['05_Published Date'], r.get('Creation Date', '')), 'format': 'html'}
        if r['02_Main Image'].strip(): fm['image'] = add_image(r['02_Main Image'], f'articles/{slug}')
        if r['03_Source Main Image'].strip(): fm['imageCaption'] = source_caption(strip_bb(r['03_Source Main Image']))
        if r['06_Description'].strip(): fm['excerpt'] = strip_bb(r['06_Description'])
        for col, cat in SPOTLIGHT_CATEGORY.items():
            if r.get(col, '').strip().lower() == 'yes':
                fm['category'] = cat; home['spotlights'][0 if col.endswith('1') else 1] = slug
        if r.get('[Section] FeaturedReport', '').strip().lower() == 'yes': fm['type'] = 'report'; home['featuredReport'] = slug
        if r.get('[Section] FeaturedArticle', '').strip().lower() == 'yes': home['featuredArticle'] = slug
        if r.get('[Section] MainLeft', '').strip().lower() == 'yes': home['lead'] = slug
        if r.get('[Section] MainRight', '').strip().lower() == 'yes': home['secondary'].append((fm['date'], slug))
        if r.get('[Section] All', '').strip().lower() != 'yes': fm['hideFromHome'] = 'true'
        write(CONTENT / 'articles' / f'{slug}.md', fm, bb_to_html(r['07_Content'], slug), refs_to_html(r['08_References'])); n_art += 1

    home['secondary'] = [s for _, s in sorted(home['secondary'], reverse=True)]
    home = {'lead': None, 'secondary': [], 'featuredArticle': None, 'featuredReport': None, 'spotlights': [], 'gridCount': 48}  # empty = filled newest-first
    (CONTENT / 'home.json').write_text(json.dumps(home, indent=2, ensure_ascii=False) + '\n')
    seen = set(); lines = []
    for url, local in manifest:
        if local not in seen: seen.add(local); lines.append(f'{url}\t{local}')
    (ROOT / 'tools' / 'image-manifest.tsv').write_text('\n'.join(lines) + '\n')
    print(f'{n_art} articles, {n_memo} memos, {len(lines)} images in tools/image-manifest.tsv')

def write(path, fm, body, refs):
    head = '\n'.join(f'{k}: {fm_value(v)}' for k, v in fm.items() if v not in (None, ''))
    text = f'---\n{head}\n---\n{body}\n'
    if refs: text += f'\n<!-- references -->\n{refs}\n'
    path.write_text(text)

if __name__ == '__main__':
    main(sys.argv[1:])
