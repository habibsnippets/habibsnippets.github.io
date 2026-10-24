import path from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import { store as db, blogBySubdomain, blogByDomain, UPLOADS_DIR } from "./store.mjs";
import { requestIp, rateLimit } from "./security.mjs";
import { escapeHtml as esc } from "./markdown.mjs";
import { uid } from "./crypto.mjs";

/* ============================================================
   Configuration, host parsing, and the few HTTP primitives the
   route modules share. Everything here is deliberately small and
   dependency-free.
   ============================================================ */

function parseHostSetting(raw) {
  let value = String(raw || "").trim().toLowerCase();
  value = value.replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "");
  const bracketed = value.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (bracketed) return { hostname: bracketed[1], port: bracketed[2] || "" };
  const match = value.match(/^([^:]+)(?::(\d+))?$/);
  if (!match) return { hostname: "localhost", port: "" };
  return { hostname: match[1] || "localhost", port: match[2] || "" };
}

const configured = parseHostSetting(process.env.DEERBLOG_HOST || "localhost");
export const PORT = Number(process.env.DEERBLOG_PORT || configured.port || 8787);
export const BIND = process.env.DEERBLOG_BIND || "127.0.0.1";
export const PUBLIC_HOSTNAME = configured.hostname;
export const PUBLIC_PORT = String(process.env.DEERBLOG_PORT || configured.port || PORT);
export const SCHEME = process.env.DEERBLOG_SECURE === "1" ? "https" : "http";
export const PORT_SUFFIX = PUBLIC_PORT && !["80", "443"].includes(PUBLIC_PORT) ? `:${PUBLIC_PORT}` : "";
export const MAIN_ORIGIN = `${SCHEME}://${PUBLIC_HOSTNAME}${PORT_SUFFIX}`;
export const APP_DIR = path.resolve(import.meta.dirname, "..");
export const PUBLIC_DIR = path.join(APP_DIR, "public");
export const ROOT_DIR = path.resolve(APP_DIR, "..");
export const KATEX_DIST = path.join(ROOT_DIR, "node_modules", "katex", "dist");

export const RESERVED_SUBDOMAINS = new Set([
  "www", "api", "admin", "app", "assets", "b", "dashboard", "discover",
  "login", "logout", "signup", "forgot", "reset", "about", "media",
  "feed", "sitemap", "robots", "favicon", "mail", "static", "support",
  "help", "status",
]);

export const isGet = (req) => req.method === "GET" || req.method === "HEAD";

export function requestHost(req) {
  const raw = String(req.headers.host || `localhost:${PORT}`).toLowerCase();
  const parsed = parseHostSetting(raw);
  return { raw, hostname: parsed.hostname, port: parsed.port || String(PORT) };
}

export function isMainHost(req) {
  const { hostname } = requestHost(req);
  return (
    hostname === PUBLIC_HOSTNAME ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

export function resolveBlogForHost(hostname) {
  const clean = String(hostname || "").toLowerCase();
  if (PUBLIC_HOSTNAME && clean.endsWith(`.${PUBLIC_HOSTNAME}`)) {
    const subdomain = clean.slice(0, -(PUBLIC_HOSTNAME.length + 1));
    if (subdomain && !subdomain.includes(".")) {
      const blog = blogBySubdomain(subdomain);
      if (blog) return blog;
    }
  }
  return blogByDomain(clean);
}

export function blogOrigin(blog) {
  const host = blog.domain || `${blog.subdomain}.${PUBLIC_HOSTNAME}`;
  return `${SCHEME}://${host}${PORT_SUFFIX}`;
}

export function cleanSubdomain(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .split(".")[0]
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export function subdomainProblem(subdomain) {
  if (!subdomain) return "Choose a subdomain using letters, numbers, and hyphens.";
  if (subdomain.length < 2) return "A subdomain must be at least 2 characters.";
  if (subdomain.length > 30) return "A subdomain must be 30 characters or fewer.";
  if (RESERVED_SUBDOMAINS.has(subdomain)) return `"${subdomain}" is reserved by the platform.`;
  return "";
}

export function plainText(markdown, length = 160) {
  return String(markdown || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[#>*_`[\]()!]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, length);
}

export function makeBlog({ userId, title, subdomain, content }) {
  const now = new Date().toISOString();
  return {
    id: uid(16),
    userId,
    title: String(title).trim().slice(0, 200),
    subdomain,
    domain: "",
    nav: "[Home](/) [About](/about/)",
    content: String(content || ""),
    metaDescription: plainText(content, 160),
    metaImage: "",
    lang: "en",
    metaTag: "",
    blogPath: "blog",
    headerDirective: "",
    footerDirective: "",
    customStyles: "",
    overwriteStyles: false,
    favicon: "🦌",
    dateFormat: "d M, Y",
    analyticsActive: true,
    postTemplate: "",
    robotsTxt: "User-agent: *\nAllow: /",
    rssAlias: "",
    theme: "default",
    createdAt: now,
    lastModified: now,
  };
}

const NOTICES = {
  saved: "Saved.",
  published: "Post published.",
  "draft-saved": "Draft saved.",
  unpublished: "Post moved to drafts.",
  deleted: "Deleted.",
  "blog-created": "Blog created. This is its dashboard.",
  "blog-deleted": "Blog deleted.",
  "domain-saved": "Custom domain saved.",
  "email-updated": "Email address updated.",
  "password-updated": "Password updated. Other sessions were signed out.",
  "subscribers-added": "Subscribers added.",
  "subscriber-removed": "Subscriber removed.",
  "media-uploaded": "Image uploaded.",
  "media-deleted": "Image deleted.",
  welcome: "Welcome to Deerblog. Write something good.",
  "account-deleted": "Account deleted.",
};

export function noticeFor(url) {
  return NOTICES[url.searchParams.get("notice") || ""] || "";
}

export function safeNext(value) {
  const next = String(value || "");
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/dashboard/";
  return next;
}

/* --- responses ------------------------------------------------ */

const BASE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function setDefaults(res, headers) {
  for (const [key, value] of Object.entries({ ...BASE_HEADERS, ...headers })) {
    if (!res.hasHeader(key)) res.setHeader(key, value);
  }
}

export function send(req, res, status, body, headers = {}) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ""));
  setDefaults(res, headers);
  res.statusCode = status;
  if (!res.hasHeader("Content-Length")) res.setHeader("Content-Length", buffer.length);
  if (req.method === "HEAD") res.end();
  else res.end(buffer);
}

export function html(req, res, status, body, headers = {}) {
  send(req, res, status, body, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
}

export function json(req, res, status, value, headers = {}) {
  send(req, res, status, JSON.stringify(value), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
}

export function redirect(res, location, status = 303) {
  res.statusCode = status;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

export function simplePage(title, message, extra = "") {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} – Deerblog</title>
<link rel="icon" href="/assets/deer.svg">
<link rel="stylesheet" href="/assets/deer.css">
</head>
<body class="deer deer-main-site">
<main class="narrow prose">
<p class="eyebrow">Deerblog</p>
<h1>${esc(title)}</h1>
${message}
${extra}
<p><a href="/">Go home</a> · <a href="/discover/">Discover blogs</a></p>
</main>
</body>
</html>`;
}

export function sendDashboard(req, res, status, body) {
  html(req, res, status, body, {
    "X-Robots-Tag": "noindex, nofollow",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
}

export function sendBlog(req, res, status, body, { sandbox = false, noindex = false } = {}) {
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (sandbox) headers["Content-Security-Policy"] = "sandbox";
  if (noindex) headers["X-Robots-Tag"] = "noindex, nofollow";
  html(req, res, status, body, headers);
}

export class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

/* --- request bodies ------------------------------------------ */

export async function readBody(req, limit = 1_000_000) {
  if (req._deerBody) return req._deerBody;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "That request is too large.");
    chunks.push(chunk);
  }
  req._deerBody = Buffer.concat(chunks);
  return req._deerBody;
}

export async function readForm(req) {
  const type = String(req.headers["content-type"] || "").toLowerCase();
  if (!type.startsWith("application/x-www-form-urlencoded")) {
    throw new HttpError(415, "Expected a form submission.");
  }
  const text = (await readBody(req, 1_000_000)).toString("utf8");
  return Object.fromEntries(new URLSearchParams(text));
}

export function parseMultipart(buffer, boundary) {
  const fields = {};
  const files = [];
  const delimiter = Buffer.from(`--${boundary}`);
  let cursor = buffer.indexOf(delimiter);
  if (cursor < 0) throw new HttpError(400, "Malformed upload.");
  cursor += delimiter.length;

  while (cursor < buffer.length) {
    if (buffer[cursor] === 45 && buffer[cursor + 1] === 45) break;
    if (buffer[cursor] === 13 && buffer[cursor + 1] === 10) cursor += 2;
    const headerEnd = buffer.indexOf("\r\n\r\n", cursor);
    if (headerEnd < 0) break;
    const headerText = buffer.subarray(cursor, headerEnd).toString("utf8");
    const next = buffer.indexOf(Buffer.from(`\r\n--${boundary}`), headerEnd + 4);
    if (next < 0) break;
    const data = buffer.subarray(headerEnd + 4, next);

    const name = (headerText.match(/\bname="([^"]*)"/i) || [])[1];
    const filename = (headerText.match(/\bfilename="([^"]*)"/i) || [])[1];
    const contentType = (headerText.match(/\bcontent-type:\s*([^\r\n]+)/i) || [])[1]?.trim() || "";
    if (name && filename !== undefined && filename !== "") {
      files.push({ field: name, filename, contentType, data });
    } else if (name) {
      fields[name] = data.toString("utf8");
    }
    cursor = next + 2 + delimiter.length;
  }
  return { fields, files };
}

export async function readMultipart(req, limit = 12 * 1024 * 1024) {
  const type = String(req.headers["content-type"] || "");
  if (!type.toLowerCase().startsWith("multipart/form-data")) {
    throw new HttpError(415, "Expected a file upload.");
  }
  const match = type.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw new HttpError(400, "Missing multipart boundary.");
  const boundary = (match[1] || match[2] || "").trim();
  const parsed = parseMultipart(await readBody(req, limit), boundary);
  return parsed;
}

export function wantsJson(req) {
  return (
    String(req.headers.accept || "").includes("application/json") ||
    String(req.headers["x-requested-with"] || "").toLowerCase() === "fetch"
  );
}

export function tooMany(req, res, key, { limit, windowMs }) {
  const result = rateLimit(`${key}:${requestIp(req)}`, { limit, windowMs });
  if (result.ok) return false;
  res.setHeader("Retry-After", String(result.retryAfter || 60));
  html(
    req,
    res,
    429,
    simplePage(
      "Slow down",
      `<p>Too many attempts from this address. Try again in about ${result.retryAfter || 60} seconds.</p>`,
    ),
    { "Retry-After": String(result.retryAfter || 60) },
  );
  return true;
}

/* --- files ---------------------------------------------------- */

export async function sendFile(req, res, filePath, contentType, cache = "public, max-age=3600") {
  let info;
  try {
    info = await stat(filePath);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType || "application/octet-stream");
  res.setHeader("Content-Length", info.size);
  res.setHeader("Cache-Control", cache);
  setDefaults(res, {});
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("end", resolve);
    stream.pipe(res);
  }).catch(() => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Could not read file.");
    }
  });
  return true;
}

const BUILT_IN_ASSETS = new Map([
  ["/assets/deer.css", ["deer.css", "text/css; charset=utf-8", "public, max-age=0, must-revalidate"]],
  ["/assets/app.js", ["app.js", "text/javascript; charset=utf-8", "public, max-age=0, must-revalidate"]],
  ["/assets/deer.svg", ["deer.svg", "image/svg+xml", "public, max-age=86400"]],
]);

export async function serveBuiltInAsset(req, res, pathname) {
  const asset = BUILT_IN_ASSETS.get(pathname);
  if (asset) {
    const [file, type, cache] = asset;
    return sendFile(req, res, path.join(PUBLIC_DIR, file), type, cache);
  }
  if (pathname === "/assets/katex.css") {
    return sendFile(
      req,
      res,
      path.join(KATEX_DIST, "katex.min.css"),
      "text/css; charset=utf-8",
      "public, max-age=86400",
    );
  }
  if (pathname.startsWith("/assets/katex/fonts/")) {
    const name = pathname.slice("/assets/katex/fonts/".length);
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) return false;
    return sendFile(
      req,
      res,
      path.join(KATEX_DIST, "fonts", name),
      "font/woff2",
      "public, max-age=31536000, immutable",
    );
  }
  if (pathname === "/favicon.ico") {
    redirect(res, "/assets/deer.svg", 302);
    return true;
  }
  return false;
}

export async function serveMedia(req, res, pathname) {
  const match = pathname.match(/^\/media\/([A-Za-z0-9_-]{1,40})\/([A-Za-z0-9._-]{1,140})$/);
  if (!match) return false;
  const upload = db().uploads.find((item) => item.blogId === match[1] && item.filename === match[2]);
  if (!upload) return false;
  return sendFile(
    req,
    res,
    path.join(UPLOADS_DIR, match[1], match[2]),
    upload.mime || "application/octet-stream",
    "public, max-age=31536000, immutable",
  );
}

/* --- output formats ------------------------------------------ */

export function csv(rows) {
  return `${rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value ?? "");
          return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\r\n")}\r\n`;
}

export function xml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/* Minimal ZIP writer: store-only, no compression. Enough for a Markdown
   export and does not require a native zip binary. */
export function zipStore(files) {
  const local = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const file of files) {
    const name = Buffer.from(String(file.name).replace(/^\/+/, ""), "utf8");
    const data = Buffer.from(String(file.content ?? ""), "utf8");
    const checksum = crc32(data);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(dosTime, 10);
    header.writeUInt16LE(dosDate, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, name, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(dosTime, 12);
    entry.writeUInt16LE(dosDate, 14);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt16LE(0, 30);
    entry.writeUInt16LE(0, 32);
    entry.writeUInt16LE(0, 34);
    entry.writeUInt16LE(0, 36);
    entry.writeUInt32LE(0, 38);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);

    offset += header.length + name.length + data.length;
  }

  const centralSize = central.reduce((total, buffer) => total + buffer.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...local, ...central, end]);
}

export function absolutizeHtml(htmlText, origin) {
  return String(htmlText).replace(/\b(href|src|action)="\/(?!\/)/g, `$1="${origin}/`);
}
