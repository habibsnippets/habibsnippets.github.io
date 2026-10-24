#!/usr/bin/env node
/* ============================================================
   The writing studio — a local, Bearblog-shaped editor that
   writes straight into this repository.

     node tools/studio.mjs      →  http://127.0.0.1:4321

   It is a normal file-based tool, not a service: it binds to
   localhost only, holds no state of its own, and every "publish"
   is just files on disk plus a rebuild. GitHub Pages does the
   rest when you push.

   Posts live as:
     content/writing/<slug>.md      markdown, the thing you write
     content/writing/posts.json     metadata + draft flag (the index)
     assets/writing/<slug>/         images dropped into the editor
   ============================================================ */

import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, unlink, access, rm } from "node:fs/promises";

import { renderMarkdown, readingMinutes } from "./md.mjs";
import { page } from "./post-page.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONTENT = path.join(ROOT, "content/writing");
const UI = path.join(ROOT, "tools/studio");
const PORT = Number(process.env.PORT) || 4321;
const HOST = "127.0.0.1";
const run = promisify(execFile);

/* --- file helpers ----------------------------------------- */

const postsFile = path.join(CONTENT, "posts.json");
const slugOk = (s) => /^[a-z0-9][a-z0-9-]{0,80}$/.test(s || "");
const exists = (p) => access(p).then(() => true, () => false);

async function readPosts() {
  try {
    return JSON.parse(await readFile(postsFile, "utf8"));
  } catch {
    return [];
  }
}

async function writePosts(posts) {
  await writeFile(postsFile, JSON.stringify(posts, null, 2) + "\n");
}

function sortPosts(posts) {
  return posts.sort((a, b) => String(b.dateISO || "").localeCompare(String(a.dateISO || "")));
}

async function bodyPath(slug) {
  for (const ext of [".md", ".html"]) {
    const p = path.join(CONTENT, slug + ext);
    if (await exists(p)) return p;
  }
  return null;
}

/* a one-line summary for search results / link previews */
function autoDescription(markdown, max = 180) {
  const line =
    markdown
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\$\$([\s\S]*?)\$\$/g, " ")
      .replace(/\$([^$\n]+)\$/g, "$1")
      .split(/\n\s*\n/)
      .map((p) => p.replace(/^#+\s+/gm, "").replace(/[*_`>#]/g, "").trim())
      .find((p) => p.length > 40) || "";
  const flat = line.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1).replace(/[,;:.\s]+\S*$/, "") + "…" : flat;
}

/* same shape as the imported posts: "22 Sep, 2026" */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const prettyDate = (iso) => {
  const [year, month, day] = String(iso).split("-");
  return `${day} ${MONTHS[Number(month) - 1] || "Jan"}, ${year}`;
};

/* --- http helpers ----------------------------------------- */

function send(res, code, body, type = "application/json") {
  const payload = type === "application/json" ? JSON.stringify(body) : body;
  res.writeHead(code, {
    "content-type": type,
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function body(req, limit = 6 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      req.destroy();
      throw new Error("that file is too big (limit 6 MB)");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const json = async (req) => JSON.parse((await body(req)).toString("utf8") || "{}");

async function gitState() {
  try {
    const [{ stdout: status }, { stdout: branch }] = await Promise.all([
      run("git", ["status", "--porcelain"], { cwd: ROOT }),
      run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: ROOT }),
    ]);
    const changed = status.split("\n").filter(Boolean);
    return { branch: branch.trim(), changed: changed.length, clean: changed.length === 0 };
  } catch {
    return { branch: "main", changed: 0, clean: true, unavailable: true };
  }
}

function gitCommand(message, branch) {
  const safe = message.replace(/["\\$`]/g, "");
  return `git add -A && git commit -m "${safe}" && git push origin ${branch || "main"}`;
}

/* --- saving ------------------------------------------------ */

async function savePost(meta, markdown) {
  if (!slugOk(meta.slug)) throw Object.assign(new Error("slug must be lowercase letters, digits and dashes"), { code: 400 });

  await mkdir(CONTENT, { recursive: true });
  const posts = await readPosts();
  const i = posts.findIndex((p) => p.slug === meta.slug);
  const previous = i >= 0 ? posts[i] : null;

  const text = String(markdown ?? "");
  const words = renderMarkdown(text, { slug: meta.slug }).words;
  const today = new Date().toISOString().slice(0, 10);

  const entry = {
    ...(previous || {}),
    slug: meta.slug,
    title: (meta.title || "").trim() || "Untitled",
    date: prettyDate(meta.dateISO || today),
    dateISO: meta.dateISO || today,
    description: (meta.description || "").trim() || autoDescription(text) || (meta.title || "Untitled"),
    words,
    minutes: readingMinutes(words),
    tag: meta.tag || previous?.tag || "engineering",
    draft: meta.draft !== false,
  };

  /* a new post must not silently overwrite an existing file with the same slug */
  if (i < 0 && (await bodyPath(meta.slug))) {
    throw Object.assign(new Error(`“${meta.slug}” already belongs to another post — pick a different slug`), { code: 409 });
  }

  await writeFile(path.join(CONTENT, `${meta.slug}.md`), text);
  if (i >= 0) posts[i] = entry;
  else posts.push(entry);
  sortPosts(posts);
  await writePosts(posts);

  const saved = (await readPosts()).find((p) => p.slug === meta.slug);
  return { ...saved, draft: !!saved.draft };
}

/* --- api --------------------------------------------------- */

async function api(req, res, url) {
  const route = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");

  if (req.method === "GET" && route === "posts") {
    const posts = await readPosts();
    const withFlags = await Promise.all(
      posts.map(async (p) => ({
        ...p,
        draft: !!p.draft,
        hasBody: !!(await bodyPath(p.slug)),
      }))
    );
    return send(res, 200, {
      posts: withFlags,
      git: await gitState(),
      counts: {
        published: withFlags.filter((p) => !p.draft).length,
        drafts: withFlags.filter((p) => p.draft).length,
      },
    });
  }

  if (req.method === "GET" && route === "post") {
    const slug = url.searchParams.get("slug") || "";
    const meta = (await readPosts()).find((p) => p.slug === slug);
    if (!meta) return send(res, 404, { error: "no such post" });
    const file = await bodyPath(slug);
    const raw = file ? await readFile(file, "utf8") : "";
    return send(res, 200, {
      meta: { ...meta, draft: !!meta.draft },
      markdown: file?.endsWith(".md") ? raw : null,
      /* legacy imported posts are HTML, not markdown — read-only in the studio */
      legacyHtml: file?.endsWith(".html") ? raw : null,
    });
  }

  if (req.method === "POST" && route === "post") {
    const { meta = {}, markdown = "" } = await json(req);
    try {
      const saved = await savePost(meta, markdown);
      return send(res, 200, { meta: saved, savedAt: new Date().toISOString() });
    } catch (err) {
      return send(res, err.code || 500, { error: err.message });
    }
  }

  if (req.method === "POST" && route === "upload") {
    const slug = url.searchParams.get("slug") || "";
    if (!slugOk(slug)) return send(res, 400, { error: "save the post first" });

    let name = decodeURIComponent(req.headers["x-filename"] || "image.png");
    const ext = path.extname(name).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"].includes(ext)) {
      return send(res, 400, { error: `unsupported image type "${ext || "none"}"` });
    }
    /* filenames only need to be URL-safe; a non-latin name falls back to "image" */
    const base =
      path
        .basename(name, ext)
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "image";
    const dir = path.join(ROOT, "assets/writing", slug);
    await mkdir(dir, { recursive: true });

    let file = path.join(dir, base + ext);
    for (let n = 2; await exists(file); n++) file = path.join(dir, `${base}-${n}${ext}`);

    const bytes = await body(req, 20 * 1024 * 1024);
    if (!bytes.length) return send(res, 400, { error: "empty file" });
    await writeFile(file, bytes);

    const rel = `/assets/writing/${slug}/${path.basename(file)}`;
    return send(res, 200, { path: rel, name: path.basename(file), bytes: bytes.length });
  }

  if (req.method === "POST" && route === "preview") {
    const { meta = {}, markdown = "" } = await json(req);
    const slug = slugOk(meta.slug) ? meta.slug : "draft";
    const out = renderMarkdown(String(markdown), { slug });
    const words = out.words;
    const post = {
      slug: meta.slug || "draft",
      title: meta.title || "Untitled",
      dateISO: meta.dateISO || new Date().toISOString().slice(0, 10),
      date: prettyDate(meta.dateISO || new Date().toISOString().slice(0, 10)),
      description: meta.description || "",
      minutes: readingMinutes(words),
    };
    return send(res, 200, { html: page(post, out.html, null, null, { hasMath: out.hasMath, preview: true }), words, minutes: post.minutes });
  }

  if (req.method === "POST" && (route === "publish" || route === "unpublish")) {
    const { meta = {}, markdown = "" } = await json(req);
    if (!slugOk(meta.slug)) return send(res, 400, { error: "bad slug" });

    /* always save first, so publishing can never ship stale text */
    let saved;
    try {
      saved = await savePost(meta, markdown);
    } catch (err) {
      return send(res, err.code || 500, { error: err.message });
    }

    const posts = await readPosts();
    const i = posts.findIndex((p) => p.slug === saved.slug);
    if (i >= 0) posts[i].draft = route === "unpublish";
    await writePosts(posts);

    const result = await build();
    const git = await gitState();
    if (result.code !== 0) {
      return send(res, 500, { error: "build failed", output: result.out });
    }

    return send(res, 200, {
      ok: true,
      draft: route === "unpublish",
      output: result.out,
      git: { ...git, command: gitCommand(`${saved.title} post`, git.branch) },
    });
  }

  if (req.method === "POST" && route === "delete") {
    const { slug } = await json(req);
    if (!slugOk(slug)) return send(res, 400, { error: "bad slug" });
    const posts = (await readPosts()).filter((p) => p.slug !== slug);
    await writePosts(posts);
    for (const ext of [".md", ".html"]) await unlink(path.join(CONTENT, slug + ext)).catch(() => {});
    await rm(path.join(ROOT, "writing", slug), { recursive: true, force: true });
    await rm(path.join(ROOT, "assets/writing", slug), { recursive: true, force: true });
    const result = await build();
    return send(res, 200, { ok: result.code === 0, output: result.out, git: await gitState() });
  }

  return send(res, 404, { error: "unknown endpoint" });
}

/* --- build ------------------------------------------------- */

function build() {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [path.join(ROOT, "tools/build-writing.mjs")],
      { cwd: ROOT, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({ code: err ? 1 : 0, out: (stdout + stderr).trim() })
    );
  });
}

/* --- static files ------------------------------------------ */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
};

async function serveStatic(res, url) {
  /* "/" is the studio; every other path is served from the repo so the
     preview iframe can load the real stylesheet, script and images */
  let rel = url.pathname === "/" ? "tools/studio/index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  /* mirror GitHub Pages: a directory serves its index.html */
  if (rel.endsWith("/") || rel === "") rel += "index.html";
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) return send(res, 403, { error: "nope" });

  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
      "content-length": data.length,
    });
    res.end(data);
  } catch {
    send(res, 404, { error: "not found" });
  }
}

/* --- boot -------------------------------------------------- */

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (url.pathname.startsWith("/api/")) await api(req, res, url);
    else await serveStatic(res, url);
  } catch (err) {
    send(res, 500, { error: err.message });
  }
});

server.listen(PORT, HOST, async () => {
  const posts = await readPosts();
  const drafts = posts.filter((p) => p.draft).length;
  console.log(`\n  writing studio  →  http://${HOST}:${PORT}`);
  console.log(`  ${posts.length - drafts} published · ${drafts} draft${drafts === 1 ? "" : "s"}`);
  console.log(`  ctrl-c to stop\n`);
});
