#!/usr/bin/env node
/* ============================================================
   Build the writing archive.

   Source of truth:  content/writing/posts.json      (metadata, newest first)
                     content/writing/<slug>.html     (post body, raw HTML)
                     assets/writing/<slug>/          (images)

   Output (committed, served by GitHub Pages):
                     writing/<slug>/index.html
                     writing/posts.js                (list for the homepage)

   Run after adding or editing a post:

     node tools/build-writing.mjs
   ============================================================ */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SITE = "https://habibsnippets.github.io";
const CSS_V = "13";
const JS_V = "11";

const posts = JSON.parse(await readFile(path.join(ROOT, "content/writing/posts.json"), "utf8"));

const esc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const NAV = `<header class="nav" id="nav">
  <div class="nav-inner">
    <a class="brand" href="/" aria-label="Home">
      <img class="brand-logo" src="/assets/brand-logo.png" alt="Logo" width="28" height="16">
      Habeeb
    </a>

    <nav class="nav-links" aria-label="Sections">
      <a href="/#focus">Focus</a>
      <a href="/#experience">Experience</a>
      <a href="/#work">Work</a>
      <a href="/#writing">Writing</a>
      <a href="/#articles">Articles</a>
      <a href="/#notes">Notes</a>
      <a href="/#contact">Contact</a>
    </nav>

    <button class="theme-toggle" id="themeToggle" type="button" aria-label="Switch to light theme" aria-pressed="false">
      <svg class="icon-moon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
      <svg class="icon-sun" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    </button>
  </div>
</header>`;

const FOOTER = `<footer class="footer">
  <div class="container footer-inner">
    <p>© <span id="year">2026</span> Habeeb</p>
    <p class="footer-meta">Hand-written HTML, CSS &amp; JS · Hosted on GitHub Pages</p>
    <a href="/" class="footer-top">Back home ↑</a>
  </div>
</footer>`;

function page(post, body, prev, next) {
  const url = `${SITE}/writing/${post.slug}/`;
  const firstImage = (body.match(/<img\b[^>]*\bsrc="([^"]+)"/i) || [])[1];
  const image = firstImage ? (firstImage.startsWith("http") ? firstImage : SITE + firstImage) : `${SITE}/assets/brand-logo.png`;

  const pager = [];
  if (prev) {
    pager.push(`<a class="pager-link pager-prev" href="/writing/${prev.slug}/">
        <span class="pager-dir">← Newer</span>
        <span class="pager-title">${esc(prev.title)}</span>
      </a>`);
  }
  if (next) {
    pager.push(`<a class="pager-link pager-next" href="/writing/${next.slug}/">
        <span class="pager-dir">Older →</span>
        <span class="pager-title">${esc(next.title)}</span>
      </a>`);
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(post.title)} — Habeeb</title>
<meta name="description" content="${esc(post.description)}">
<meta name="theme-color" content="#faf4e6">
<meta name="color-scheme" content="light dark">
<script>
  /* Light is the default; an explicit "dark" choice is what persists. */
  (function () {
    var t = "light";
    try { t = localStorage.getItem("theme") === "dark" ? "dark" : "light"; } catch (e) {}
    document.documentElement.setAttribute("data-theme", t);
  })();
</script>

<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(post.title)}">
<meta property="og:description" content="${esc(post.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(image)}">
<meta property="article:published_time" content="${post.dateISO}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@habeebstwt">
<meta name="twitter:title" content="${esc(post.title)}">
<meta name="twitter:description" content="${esc(post.description)}">

<link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon.png">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/assets/brand-logo.png">

<link rel="preconnect" href="https://api.fontshare.com" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css?v=${CSS_V}">

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": ${JSON.stringify(post.title)},
  "description": ${JSON.stringify(post.description)},
  "datePublished": "${post.dateISO}",
  "url": "${url}",
  "author": { "@type": "Person", "name": "Habeeb", "url": "${SITE}/" },
  "image": "${esc(image)}"
}
</script>
</head>
<body>

<div class="grain" aria-hidden="true"></div>
<div class="progress" aria-hidden="true"><span id="progressBar"></span></div>

${NAV}

<main class="post-main">
  <article class="post-page">
    <header class="post-head">
      <a class="post-back" href="/#writing">← All writing</a>
      <h1>${esc(post.title)}</h1>
      <p class="post-meta">
        <time datetime="${post.dateISO}">${esc(post.date)}</time>
        <span class="sep" aria-hidden="true">·</span>
        <span>${post.minutes} min read</span>
      </p>
    </header>

    <div class="prose">
${body}
    </div>

    ${pager.length ? `<nav class="post-pager" aria-label="More writing">\n      ${pager.join("\n      ")}\n    </nav>` : ""}
  </article>
</main>

${FOOTER}

<script src="/main.js?v=${JS_V}"></script>
</body>
</html>
`;
}

/* tables get their own horizontal scroll container so wide ones can't
   push the article past the viewport on a phone */
function wrapTables(html) {
  return html.replace(/<table\b[\s\S]*?<\/table>/gi, (t) => `<div class="table-wrap">\n${t}\n</div>`);
}

let built = 0;
const list = [];

for (let i = 0; i < posts.length; i++) {
  const post = posts[i];
  let body = await readFile(path.join(ROOT, "content/writing", `${post.slug}.html`), "utf8");

  // strip the provenance comment from the rendered page
  body = body.replace(/^<!--[\s\S]*?-->\n/, "");
  body = wrapTables(body);

  const outDir = path.join(ROOT, "writing", post.slug);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "index.html"), page(post, body.trim(), posts[i - 1], posts[i + 1]));
  built++;

  list.push({
    title: post.title,
    date: post.date,
    iso: post.dateISO,
    url: `/writing/${post.slug}/`,
    tag: "engineering",
    minutes: post.minutes,
  });
}

/* the homepage reads its list from here, so posts.json stays the only source */
await mkdir(path.join(ROOT, "writing"), { recursive: true });
await writeFile(
  path.join(ROOT, "writing/posts.js"),
  `/* Generated by tools/build-writing.mjs — edit content/writing/posts.json instead. */\n` +
    `window.WRITING_POSTS = ${JSON.stringify(list, null, 2)};\n`
);

/* Old posts stay live on bearblog, but each one should name its new home as
   the canonical URL (Dashboard → edit post → add this line above the ---). */
const canonical = posts
  .map((p) => `## ${p.title}\ncanonical_url: ${SITE}/writing/${p.slug}/\n`)
  .join("\n");
await writeFile(
  path.join(ROOT, "content/writing/bearblog-canonical.md"),
  [
    "# Canonical URLs for the bearblog originals",
    "",
    "For each post on defygrad.bearblog.dev, open it in the dashboard, add the",
    "canonical_url line shown below next to the existing title: / link: headers",
    "(above the --- separator), and save. That tells search engines the GitHub",
    "Pages copy is the original without breaking the old URL.",
    "",
    canonical,
  ].join("\n")
);

console.log(`built ${built} post pages + writing/posts.js + bearblog-canonical.md`);
