/* ============================================================
   The article shell.

   One template, two consumers:
     tools/build-writing.mjs  writes writing/<slug>/index.html
     tools/studio.mjs         renders the same page for the preview

   Keeping them together is deliberate: what the studio shows is
   literally the markup that ships, not an approximation of it.
   ============================================================ */

import { createRequire } from "node:module";
import { escapeHtml as esc } from "./md.mjs";

const require = createRequire(import.meta.url);
export const CSS_V = "16";
export const JS_V = "13";
export const SITE = "https://habibsnippets.github.io";
export const KATEX_V = require("katex/package.json").version;
export const KATEX_CSS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_V}/dist/katex.min.css`;

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

const PAGER = (prev, next) => {
  const parts = [];
  if (prev) {
    parts.push(`<a class="pager-link pager-prev" href="/writing/${prev.slug}/">
        <span class="pager-dir">← Newer</span>
        <span class="pager-title">${esc(prev.title)}</span>
      </a>`);
  }
  if (next) {
    parts.push(`<a class="pager-link pager-next" href="/writing/${next.slug}/">
        <span class="pager-dir">Older →</span>
        <span class="pager-title">${esc(next.title)}</span>
      </a>`);
  }
  return parts.length
    ? `<nav class="post-pager" aria-label="More writing">\n      ${parts.join("\n      ")}\n    </nav>`
    : "";
};

/**
 * @param {object} post  { slug, title, date, dateISO, description, minutes }
 * @param {string} body  rendered article HTML
 * @param {object|null} prev  newer post
 * @param {object|null} next  older post
 * @param {{hasMath?: boolean, preview?: boolean}} opts
 */
export function page(post, body, prev, next, opts = {}) {
  const { hasMath = false, preview = false } = opts;
  const url = `${SITE}/writing/${post.slug}/`;
  const firstImage = (body.match(/<img\b[^>]*\bsrc="([^"]+)"/i) || [])[1];
  const image = firstImage
    ? firstImage.startsWith("http")
      ? firstImage
      : SITE + firstImage
    : `${SITE}/assets/brand-logo.png`;

  const title = `<title>${esc(post.title)} — Habeeb</title>`;
  const description = preview ? "" : `\n<meta name="description" content="${esc(post.description)}">`;

  const themeBlock = `<meta name="theme-color" content="#faf4e6">
<meta name="color-scheme" content="light dark">
<script>
  /* Light is the default; an explicit "dark" choice is what persists. */
  (function () {
    var t = "light";
    try { t = localStorage.getItem("theme") === "dark" ? "dark" : "light"; } catch (e) {}
    document.documentElement.setAttribute("data-theme", t);
  })();
</script>`;

  const seo = preview
    ? ""
    : `
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
<meta name="twitter:description" content="${esc(post.description)}">`;

  const jsonld = preview
    ? ""
    : `
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
</script>`;

  /* KaTeX's stylesheet is ~23 KB and only posts with maths pull it in.
     The formulas themselves are already static HTML. */
  const mathCss = hasMath
    ? `\n<link rel="stylesheet" href="${KATEX_CSS}" crossorigin="anonymous">`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${title}${description}
${themeBlock}
${seo}

<link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon.png">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/assets/brand-logo.png">

<link rel="preconnect" href="https://api.fontshare.com" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css?v=${CSS_V}">${mathCss}
${jsonld}
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

    ${PAGER(prev, next)}
  </article>
</main>

${FOOTER}

<script src="/main.js?v=${JS_V}"></script>
</body>
</html>
`;
}
