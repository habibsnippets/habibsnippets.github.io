#!/usr/bin/env node
/* ============================================================
   Refresh the static writing list on the homepage.

   Source:   content/writing/posts.json
   Output:   index.html, between the writing-list markers.

   The homepage is plain HTML — no client-side renderer — so this
   keeps the list current when a new post is published.

   Runs as part of `npm run build`.
   ============================================================ */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const INDEX = path.join(ROOT, "index.html");
const POSTS = path.join(ROOT, "content/writing/posts.json");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

function formatDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

const posts = JSON.parse(await readFile(POSTS, "utf8"));
const published = posts.filter((post) => !post.draft);

const rows = published
  .map(
    (post) =>
      `      <li><time datetime="${post.dateISO}">${formatDate(post.dateISO)}</time>` +
      `<a href="/writing/${post.slug}/">${escapeHtml(post.title)}</a></li>`
  )
  .join("\n");

const html = await readFile(INDEX, "utf8");
const pattern =
  /(<!-- writing-list:start -->)[\s\S]*?(<!-- writing-list:end -->)/;

if (!pattern.test(html)) {
  throw new Error("writing-list markers not found in index.html");
}

const next = html.replace(
  pattern,
  `$1\n    <ul class="writing-list">\n${rows}\n    </ul>\n    $2`
);

if (next !== html) {
  await writeFile(INDEX, next);
  console.log(`updated index.html with ${published.length} writing links`);
} else {
  console.log(`index.html already has all ${published.length} writing links`);
}
