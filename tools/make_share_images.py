#!/usr/bin/env python3
"""Make the site's icons and link-preview (share) images.

Usage: python3 tools/make_share_images.py      (needs: pip install pillow)

Writes into static/ (copied to the site root by build.mjs):
  favicon.ico, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png
  images/og-default.jpg                 1200x630 default share image
Writes into content/images/og/:
  <slug>.jpg                            1200x630 share image per article / campaign
Run it again after adding articles; existing share images are skipped.
"""
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / 'tools' / 'fonts'
NAVY = (34, 24, 78)
NAVY_DEEP = (24, 16, 54)
LAVENDER = (201, 194, 238)
W, H = 1200, 630
S = 2  # render at 2x, then downscale for crisp text


def font(weight, size):
    return ImageFont.truetype(str(FONTS / f'rashi-{weight}.ttf'), size * S)


def icon(size):
    im = Image.new('RGB', (size * S, size * S), NAVY)
    d = ImageDraw.Draw(im)
    f = font(400, int(size * 0.44))
    box = d.textbbox((0, 0), 'YII', font=f)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((size * S - w) / 2 - box[0], (size * S - h) / 2 - box[1]), 'YII', font=f, fill='white')
    return im.resize((size, size), Image.LANCZOS)


def logo(d, x, y, size, color='white'):
    fy, fn = font(400, size), font(400, int(size * 0.86))
    d.text((x, y), 'YII', font=fy, fill=color, anchor='ls')
    xb = x + d.textlength('YII', font=fy) + size * 0.42 * S
    d.rectangle((xb, y - size * 0.95 * S, xb + 2 * S, y + size * 0.2 * S), fill=color)
    d.text((xb + size * 0.42 * S, y), 'Youth Impact Institute', font=fn, fill=color, anchor='ls')


def default_card(path):
    im = Image.new('RGB', (W * S, H * S), NAVY)
    d = ImageDraw.Draw(im)
    # quiet band at the bottom, like the site's footer
    d.rectangle((0, (H - 120) * S, W * S, H * S), fill=NAVY_DEEP)
    logo(d, 90 * S, 250 * S, 64)
    d.text((92 * S, 330 * S), 'A global, student-run think tank', font=font(400, 34), fill=LAVENDER, anchor='ls')
    d.text((92 * S, (H - 50) * S), 'Research  ·  UN Policy Memos  ·  Campaigns', font=font(400, 26), fill='white', anchor='ls')
    d.text(((W - 90) * S, (H - 50) * S), 'youthimpactinstitute.com', font=font(400, 26), fill=LAVENDER, anchor='rs')
    im.resize((W, H), Image.LANCZOS).save(path, quality=90, optimize=True)


def wrap(d, text, f, width):
    words, lines, line = text.split(), [], ''
    for w in words:
        t = (line + ' ' + w).strip()
        if d.textlength(t, font=f) <= width: line = t
        else: lines.append(line); line = w
    if line: lines.append(line)
    return lines


def article_card(src, title, kind, path):
    """Photo on the left, title panel on the right."""
    im = Image.new('RGB', (W * S, H * S), NAVY)
    photo = Image.open(src).convert('RGB')
    pw = 620
    im.paste(ImageOps.fit(photo, (pw * S, H * S), Image.LANCZOS), (0, 0))
    d = ImageDraw.Draw(im)
    x, width = (pw + 56) * S, (W - pw - 100) * S
    d.text((x, 92 * S), kind.upper(), font=font(700, 20), fill=LAVENDER, anchor='ls')
    for size in (44, 40, 36, 32, 28):
        f = font(700, size); lines = wrap(d, title, f, width)
        if len(lines) <= 6: break
    lines = lines[:6]
    y = 150 * S
    for ln in lines:
        d.text((x, y), ln, font=f, fill='white', anchor='la'); y += int(size * 1.28 * S)
    logo(d, x, (H - 56) * S, 26)
    im.resize((W, H), Image.LANCZOS).save(path, quality=86, optimize=True)


def front_matter(p):
    m = re.match(r'---\n(.*?)\n---', p.read_text(), re.S)
    return dict(re.findall(r'^(\w+): ?(.*)$', m.group(1), re.M)) if m else {}


def main():
    static = ROOT / 'static'
    (static / 'images').mkdir(parents=True, exist_ok=True)
    icon(32).save(static / 'favicon-32.png')
    icon(180).save(static / 'apple-touch-icon.png')
    icon(192).save(static / 'icon-192.png')
    icon(512).save(static / 'icon-512.png')
    icon(48).save(static / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    default_card(static / 'images' / 'og-default.jpg')

    out = ROOT / 'content' / 'images' / 'og'
    out.mkdir(parents=True, exist_ok=True)
    made = 0
    for kind, folder in (('Article', 'articles'), ('Campaign', 'campaigns')):
        for p in sorted((ROOT / 'content' / folder).glob('*.md')):
            fm = front_matter(p)
            img = ROOT / 'content' / 'images' / fm.get('image', '_none_')
            dest = out / (f'campaign-{p.stem}.jpg' if folder == 'campaigns' else f'{p.stem}.jpg')
            if dest.exists() or not img.is_file(): continue
            k = 'Report' if fm.get('type') == 'report' else (fm.get('category') or kind)
            article_card(img, fm.get('title', ''), k, dest); made += 1
    print(f'icons + default share image written; {made} new share images')


if __name__ == '__main__':
    main()
