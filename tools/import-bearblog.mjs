#!/usr/bin/env node
/* ============================================================
   Import posts from defygrad.bearblog.dev into content/writing/.

   One-time migration tool (kept for provenance): for every post in
   content/writing/posts.json that still has a `source`, fetch the page,
   lift the article body out of <main>, download its images into
   assets/writing/<slug>/, and write content/writing/<slug>.html.

   Existing fragments are left alone unless --force is passed.

     node tools/import-bearblog.mjs [--force]
   ============================================================ */

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const POSTS_JSON = path.join(ROOT, "content/writing/posts.json");
const WRITING_DIR = path.join(ROOT, "content/writing");
const ASSET_DIR = path.join(ROOT, "assets/writing");
const FORCE = process.argv.includes("--force");
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const posts = JSON.parse(await readFile(POSTS_JSON, "utf8"));

/* ---------- helpers ---------- */

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&amp;/g, "&");
}

/** Slice the article body out of a bearblog page. */
function extractBody(html) {
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));

  // Everything after the timestamp is content; everything from the upvote
  // form (or the first script, if upvoting is off) is site chrome.
  const afterTime = main.indexOf("</time>");
  let start = afterTime === -1 ? main.indexOf("</h1>") + 5 : afterTime;
  const closeP = main.indexOf("</p>", start);
  start = closeP === -1 ? start : closeP + 4;

  const endMarks = [
    main.indexOf('<form id="upvote-form"'),
    main.indexOf('<div class="upvote'),
    main.indexOf("<script"),
  ].filter((i) => i > start);
  const end = endMarks.length ? Math.min(...endMarks) : main.length;

  let body = main.slice(start, end).trim();

  body = body
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<form\b[\s\S]*?<\/form>/gi, "")
    .trim();

  // The page supplies the <h1>, so content headings shift down one level.
  body = body.replace(/<(\/?)h([1-5])\b/gi, (_, close, level) => `<${close}h${+level + 1}`);

  return body;
}

/** JPEG / PNG / GIF / WebP intrinsic size, so pages reserve space. */
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 10 && buf.toString("ascii", 0, 3) === "GIF") {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

function safeName(url, index) {
  const base = decodeURIComponent(new URL(url).pathname.split("/").pop() || "image");
  return `${String(index + 1).padStart(2, "0")}-${base.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
}

/* bearblog's meta description is the whole post, entities and all, so build
   a real summary from the opening paragraph instead. */
function summarise(body) {
  const paras = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => plainText(m[1]));
  const first =
    paras.find((t) => t.length > 90) || paras.find((t) => t.length > 30) || paras[0] || "";
  const clean = first.replace(/\s+/g, " ").trim();
  if (clean.length <= 158) return clean;
  const cut = clean.slice(0, 158);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 110)).replace(/[,;:.\-–—]$/, "") + "…";
}

function plainText(fragment) {
  return decodeEntities(
    fragment
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- run ---------- */

let written = 0, images = 0, skipped = 0;
const report = [];

await mkdir(WRITING_DIR, { recursive: true });

for (const post of posts) {
  const fragmentPath = path.join(WRITING_DIR, `${post.slug}.html`);
  if (existsSync(fragmentPath) && !FORCE) {
    skipped++;
    continue;
  }
  if (!post.source) {
    report.push(`- ${post.slug}: no source URL, skipped`);
    continue;
  }

  const res = await fetch(post.source, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    report.push(`- ${post.slug}: HTTP ${res.status}`);
    continue;
  }
  const html = await res.text();
  let body = extractBody(html);

  const description = summarise(body);

  /* images: download once, rewrite to a site-local path */
  const dir = path.join(ASSET_DIR, post.slug);
  await mkdir(dir, { recursive: true });

  const srcs = [...body.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
  const unique = [...new Set(srcs)];
  const localFor = new Map();

  for (let i = 0; i < unique.length; i++) {
    const src = unique[i];
    if (!/^https?:\/\//i.test(src)) continue;
    try {
      const name = safeName(src, i);
      const dest = path.join(dir, name);
      let buf;
      if (existsSync(dest)) {
        buf = await readFile(dest);
      } else {
        const imgRes = await fetch(src, { headers: { "User-Agent": UA } });
        if (!imgRes.ok) throw new Error("HTTP " + imgRes.status);
        buf = Buffer.from(await imgRes.arrayBuffer());
        await writeFile(dest, buf);
      }
      const size = imageSize(buf);
      localFor.set(src, { src: `/assets/writing/${post.slug}/${name}`, ...(size || {}) });
      images++;
    } catch (err) {
      report.push(`- ${post.slug}: image failed ${src} (${err.message})`);
    }
  }

  body = body.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcMatch) return tag;
    const local = localFor.get(srcMatch[1]);
    if (!local) return tag;
    const alt = (tag.match(/\balt=["']([^"']*)["']/i) || [, ""])[1];
    const dims = local.width && local.height ? ` width="${local.width}" height="${local.height}"` : "";
    return `<img src="${local.src}" alt="${alt}"${dims} loading="lazy" decoding="async">`;
  });

  const text = plainText(body);
  const words = text ? text.split(/\s+/).length : 0;
  const minutes = Math.max(1, Math.round(words / 220));

  post.description = description;
  post.words = words;
  post.minutes = minutes;

  await writeFile(
    fragmentPath,
    `<!-- Imported from ${post.source} on ${new Date().toISOString().slice(0, 10)}. Edit freely. -->\n${body}\n`
  );
  written++;
  report.push(`- ${post.slug}: ${words} words, ${unique.length} image(s)`);
}

await writeFile(POSTS_JSON, JSON.stringify(posts, null, 2) + "\n");

console.log(`imported ${written}, skipped ${skipped} (already present), images ${images}`);
if (report.length) console.log(report.join("\n"));
