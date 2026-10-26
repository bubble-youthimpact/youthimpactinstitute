# Youth Impact Institute website

Static site for GitHub Pages. You edit files in `content/`, run one command, and the finished site is written to `docs/`.

## Build

```
node build.mjs            # builds the site into docs/
node build.mjs --missing  # also lists every image that hasn't been added yet
```

Needs Node 18+. No packages to install.

## Publish on GitHub Pages

1. Push this folder to a GitHub repository.
2. Repository → Settings → Pages → Source: "Deploy from a branch", Branch: `main`, folder: `/docs`.
3. The custom domain comes from `cname` in `content/site.json` (written to `docs/CNAME`).

Run `node build.mjs` and commit `docs/` every time you change content.

## Adding content

### Articles — `content/articles/<slug>.md`
The file name becomes the URL: `investing-in-health.md` → `/articles/investing-in-health/`.

```
---
title: Investing in Health: The Boom of Pharmaceutical Stocks
author: Jungwon Aiden Kim
date: 2026-08-25
image: articles/investing-in-health.jpg
type: report            (optional — shows a "Report" tag)
excerpt: ...            (optional — otherwise taken from the start of the text)
---
Article text here. Blank line between paragraphs.

### A subheading
- bullet point
- **bold** and *italic* and [links](https://example.com)

## References
- Everything under "## References" goes into the collapsible References box.
```

Order: newest `date` first everywhere. Give each article a `category` (its topic); it is used for the "Spotlight on …" heading and the tag on the article page.

### Policy memos — `content/memos/policy-memo-<n>.md`
Front matter: `title`, `number`, `subject`, `date`, optional `author`. Use `## Executive Summary`, `## Background`… for sections and `### …` for sub-sections.

### Campaigns — `content/campaigns/<slug>.md`
Front matter: `title`, `author`, `date`, `image`, `supporters` (the "joined" number), `website` (optional "Visit website" button).
Sign-ups are counted in Firebase (see below); no email is sent for them.

### Members — `content/members.json`
`name`, `role`, `photo`, optional `bio`. A member gets their own page listing every article where `author` matches their name.

### Home page — `content/home.json`
Leave the fields empty and the home page fills itself newest-first: lead, 4 right-column articles, featured article, featured report, 2 spotlights, then the grid. A new article pushes everything down one spot. Put an article's slug in a field only to pin it there.

### About — `content/about.json`

### Images
Put them in `content/images/…` using the paths the content files point to (e.g. `content/images/articles/investing-in-health.jpg`). Until an image exists, a navy placeholder is shown. Recommended sizes: articles 1600×1067 (3:2), report banner 2400×780, member photos square.

## Live campaign sign-up count (Firebase)

The "joined this campaign" number counts real sign-ups once Firebase is connected:

1. Create a project at console.firebase.google.com → add a **Web app** → copy its config values into `"firebase"` in `content/site.json`.
2. Build → Firestore Database → Create database (production mode).
3. Firestore → Rules → paste the contents of `firestore.rules` → Publish.
4. Run `node build.mjs` and publish.

The number shown is `supporters` from the campaign file (sign-ups from the old site) plus every new sign-up. Each email counts once per campaign. Firestore stores only an anonymous code per sign-up, and no email is sent for campaign sign-ups (only the Contact form emails you).

## Icons and link previews

`python3 tools/make_share_images.py` (needs `pip install pillow`) makes the favicon, app icons, the default link-preview image, and a 1200×630 preview image for every article and campaign in `content/images/og/`. Run it after adding articles (existing images are kept), then run `node build.mjs`.

Each page has its own title, description (≤160 characters), Open Graph/Twitter preview tags, and articles include Google-friendly structured data. `sitemap.xml`, `robots.txt`, `site.webmanifest` and `404.html` are generated automatically.
