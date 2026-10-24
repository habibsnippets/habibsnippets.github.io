import { store as db, saveStore, countHits, postById } from "./store.mjs";
import { requestIp } from "./security.mjs";
import { sha256, uid } from "./crypto.mjs";
import { formatDate } from "./dates.mjs";

const HASH_SECRET = process.env.DEERBLOG_HASH_SECRET || "deerblog-local-hash-secret";
const BOT = /bot|crawl|spider|slurp|preview|fetch|monitor|uptime|headless|python-requests|curl|wget|go-http|libwww|httpclient/i;

function browserOf(userAgent) {
  if (/Edg\//i.test(userAgent)) return "Edge";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Chrome\//i.test(userAgent) || /CriOS\//i.test(userAgent)) return "Chrome";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return "Other";
}

function deviceOf(userAgent) {
  if (/iPad|Tablet|PlayBook|Silk/i.test(userAgent)) return "tablet";
  if (/Mobile|iPhone|Android/i.test(userAgent)) return "mobile";
  return "desktop";
}

function referrerHost(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return "";
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/* Page views are recorded on the server, with no public JavaScript and no
   analytics cookie. A hash of IP + user agent is used only for approximate
   unique counts. Production should rotate the secret and aggregate in a
   real database instead of appending to a JSON file. */
export function recordHit(req, blog, { path: hitPath, post = null }) {
  if (!blog.analyticsActive) return;
  const userAgent = String(req.headers["user-agent"] || "");
  if (!userAgent || BOT.test(userAgent)) return;
  if (!String(req.headers.accept || "").includes("text/html")) return;

  const now = new Date();
  const state = db();
  state.hits.push({
    id: uid(12),
    blogId: blog.id,
    postId: post?.id || null,
    path: hitPath,
    createdAt: now.toISOString(),
    referrer: referrerHost(req.headers.referer),
    device: deviceOf(userAgent),
    browser: browserOf(userAgent),
    visitorHash: sha256(`${requestIp(req)}|${userAgent}|${HASH_SECRET}`).slice(0, 32),
  });

  /* Keep the local store bounded. This is a development convenience, not
     a retention policy suitable for a real platform. */
  const cutoff = Date.now() - 90 * 86400000;
  const blogHits = state.hits.filter((hit) => hit.blogId === blog.id);
  if (blogHits.length > 20000) {
    const drop = new Set(
      blogHits
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, blogHits.length - 20000)
        .map((hit) => hit.id),
    );
    state.hits = state.hits.filter((hit) => !drop.has(hit.id));
  }
  state.hits = state.hits.filter(
    (hit) => hit.blogId !== blog.id || new Date(hit.createdAt).getTime() >= cutoff,
  );
  saveStore().catch(() => {});
}

function aggregate(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item[key] || "(none)";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

export function analyticsFor(blog) {
  const hits = countHits(blog.id, 30 * 86400000);
  const unique = new Set(hits.map((hit) => hit.visitorHash).filter(Boolean)).size;

  const posts = db().posts.filter((post) => post.blogId === blog.id);
  const byPath = new Map(posts.map((post) => [`/${post.slug}/`, post.title]));
  const postCounts = new Map();
  for (const hit of hits) {
    const post = hit.postId ? postById(hit.postId) : null;
    const title = post?.title || byPath.get(hit.path);
    if (title) postCounts.set(title, (postCounts.get(title) || 0) + 1);
  }
  const topPost = [...postCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";

  const days = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 13);
  for (let i = 0; i < 14; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const key = day.toDateString();
    const count = hits.filter((hit) => new Date(hit.createdAt).toDateString() === key).length;
    days.push({
      label: formatDate(day, "j M Y"),
      short: formatDate(day, "j"),
      count,
    });
  }

  return {
    total: hits.length,
    unique,
    topPost,
    days,
    paths: aggregate(hits, "path").slice(0, 8),
    referrers: aggregate(
      hits.map((hit) => ({ ...hit, referrer: hit.referrer || "(direct)" })),
      "referrer",
    ).slice(0, 8),
    devices: aggregate(hits, "device").slice(0, 6),
    browsers: aggregate(hits, "browser").slice(0, 6),
  };
}
