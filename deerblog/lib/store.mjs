import path from "node:path";
import { mkdir, readFile, writeFile, rename, rm, access } from "node:fs/promises";
import { hashPassword, uid, randomToken } from "./crypto.mjs";

const APP_ROOT = path.resolve(import.meta.dirname, "..");
export const DATA_DIR = process.env.DEERBLOG_DATA
  ? path.resolve(process.env.DEERBLOG_DATA)
  : path.join(APP_ROOT, "data");
export const STORE_FILE = path.join(DATA_DIR, "store.json");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

const now = () => new Date().toISOString();
const daysAgo = (days, minutes = 0) => {
  const d = new Date(Date.now() - days * 86400000 - minutes * 60000);
  return d.toISOString();
};
const daysAhead = (days) => new Date(Date.now() + days * 86400000).toISOString();

const emptyState = () => ({
  version: 1,
  users: [],
  blogs: [],
  posts: [],
  sessions: [],
  resetTokens: [],
  subscribers: [],
  upvotes: [],
  hits: [],
  uploads: [],
});

async function seedState() {
  const state = emptyState();
  const demoHash = await hashPassword("deerblog123");
  const fernHash = await hashPassword("fernforest");
  const demoUser = {
    id: uid(16),
    email: "demo@deerblog.test",
    passwordHash: demoHash,
    createdAt: daysAgo(120),
    plan: "pro",
    maxBlogs: 10,
    dashboardStyles: "",
    dashboardFooter: "",
  };
  const fernUser = {
    id: uid(16),
    email: "fern@deerblog.test",
    passwordHash: fernHash,
    createdAt: daysAgo(80),
    plan: "free",
    maxBlogs: 1,
    dashboardStyles: "",
    dashboardFooter: "",
  };
  state.users.push(demoUser, fernUser);

  const demoBlog = {
    id: uid(16),
    userId: demoUser.id,
    title: "Demo Deer",
    subdomain: "demo",
    domain: "",
    nav: "[Home](/) [Blog](/blog/) [About](/about/)",
    content:
      "A quiet place for field notes, small diagrams, and things made by hand.\n\n" +
      "This is a local Deerblog demo. Edit this page from the dashboard, or [sign up](/) and make your own.",
    metaDescription: "A quiet place for field notes, small diagrams, and things made by hand.",
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
    createdAt: daysAgo(120),
    lastModified: daysAgo(1),
  };
  const fernBlog = {
    id: uid(16),
    userId: fernUser.id,
    title: "Fern Notes",
    subdomain: "fern",
    domain: "",
    nav: "[Home](/) [Blog](/blog/)",
    content: "Short notes from under the ferns. Everything here is a work in progress.",
    metaDescription: "Short notes from under the ferns.",
    metaImage: "",
    lang: "en",
    metaTag: "",
    blogPath: "blog",
    headerDirective: "",
    footerDirective: "",
    customStyles: "",
    overwriteStyles: false,
    favicon: "🌿",
    dateFormat: "d M, Y",
    analyticsActive: true,
    postTemplate: "",
    robotsTxt: "User-agent: *\nAllow: /",
    rssAlias: "",
    theme: "paper",
    createdAt: daysAgo(80),
    lastModified: daysAgo(4),
  };
  state.blogs.push(demoBlog, fernBlog);

  const post = (blog, data) => {
    const published = data.publishedDate ? data.publishedDate : null;
    return {
      id: uid(16),
      uid: uid(10),
      blogId: blog.id,
      title: data.title,
      slug: data.slug,
      alias: data.alias || "",
      publishedDate: published,
      lastModified: data.lastModified || daysAgo(1),
      tags: data.tags || [],
      publish: data.publish !== false,
      discoverable: data.discoverable !== false,
      isPage: !!data.isPage,
      content: data.content,
      canonicalUrl: data.canonicalUrl || "",
      metaDescription: data.metaDescription || "",
      metaImage: data.metaImage || "",
      lang: data.lang || "",
      className: data.className || "",
      firstPublishedAt: published,
      upvotes: data.upvotes || 0,
      previewToken: randomToken(12),
    };
  };

  state.posts.push(
    post(demoBlog, {
      title: "Welcome to Deerblog",
      slug: "welcome-to-deerblog",
      publishedDate: daysAgo(3),
      lastModified: daysAgo(3),
      tags: ["welcome", "demo"],
      upvotes: 7,
      content:
        "Deerblog is a small, calm home for writing. It is an original local study of how a multi-tenant blogging platform works.\n\n" +
        "## What is here\n\n" +
        "- Accounts and multiple blogs\n" +
        "- A raw-header Markdown editor\n" +
        "- Pages, drafts, tags, feeds, sitemaps and analytics\n" +
        "- Media uploads and custom domains\n\n" +
        "Everything on this page was rendered from Markdown on the server. The public blog does not need JavaScript.\n\n" +
        "{{ email-signup }}",
    }),
    post(demoBlog, {
      title: "The tiny web is a feature",
      slug: "the-tiny-web",
      publishedDate: daysAgo(9),
      lastModified: daysAgo(9),
      tags: ["web", "demo"],
      upvotes: 12,
      content:
        "Speed is a feature. A page should arrive before you have time to wonder whether it is coming.\n\n" +
        "> The best performance optimisation is deleting something.\n\n" +
        "Deerblog renders public pages on the server, ships one stylesheet, and stores no tracking cookies. The whole thing can run in a single Node process because the interesting part is the shape of the product, not a Kubernetes cluster.\n\n" +
        "{{ previous_post }}",
    }),
    post(demoBlog, {
      title: "Markdown playground",
      slug: "markdown-playground",
      publishedDate: daysAgo(1),
      lastModified: daysAgo(1),
      tags: ["markdown", "math", "demo"],
      upvotes: 3,
      content:
        "A small sample of what the renderer supports.\n\n" +
        "## Lists and links\n\n" +
        "1. Ordered things\n" +
        "2. Unordered chaos\n\n" +
        "Read [the Markdown guide](https://commonmark.org/help/) or write an [inline note](/about/).\n\n" +
        "```js\nconst deer = { calm: true, fast: true };\nconsole.log(deer);\n```\n\n" +
        "| Feature | Status |\n| --- | --- |\n| Tables | yes |\n| Math | yes |\n| Raw HTML | owner-controlled |\n\n" +
        "Inline maths like $E = mc^2$ and a display block:\n\n" +
        "$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$\n\n" +
        "## Recent posts\n\n" +
        "{{ posts limit:3 }}\n\n" +
        "{{ next_post }}",
    }),
    post(demoBlog, {
      title: "About",
      slug: "about",
      publishedDate: daysAgo(30),
      lastModified: daysAgo(30),
      tags: [],
      isPage: true,
      discoverable: false,
      content:
        "This is a demo page. Pages are written and published like posts, but they are left out of the blog feed and can be linked from the navigation.\n\n" +
        "Try editing this from **Dashboard → Pages**.",
    }),
    post(demoBlog, {
      title: "Notes from the draft folder",
      slug: "draft-notes",
      publish: false,
      discoverable: false,
      lastModified: daysAgo(0, 40),
      tags: ["draft"],
      content: "This is a draft. Only you can see it while signed in, or through its preview link.\n\nIt is still a real post in every other way.",
    }),
  );

  state.posts.push(
    post(fernBlog, {
      title: "On walking slowly",
      slug: "on-walking-slowly",
      publishedDate: daysAgo(5),
      lastModified: daysAgo(5),
      tags: ["walking", "notes"],
      upvotes: 5,
      content:
        "The point of a walk is not to arrive. It is to notice that the path has edges.\n\n" +
        "A short note from under the ferns.",
    }),
    post(fernBlog, {
      title: "Field note: rain",
      slug: "field-note-rain",
      publishedDate: daysAgo(15),
      lastModified: daysAgo(15),
      tags: ["rain", "notes"],
      upvotes: 2,
      content:
        "Rain makes the garden legible. Every slope and hollow shows up in the same grey handwriting.\n\n" +
        "{{ email-signup }}",
    }),
  );

  state.subscribers.push(
    { id: uid(12), blogId: demoBlog.id, email: "reader@example.com", createdAt: daysAgo(20) },
    { id: uid(12), blogId: demoBlog.id, email: "another@example.com", createdAt: daysAgo(6) },
  );

  /* A little seeded analytics makes the dashboard useful on first run. */
  const paths = ["/", "/blog/", "/welcome-to-deerblog/", "/the-tiny-web/", "/markdown-playground/"];
  const referrers = ["", "https://news.ycombinator.com/", "https://www.google.com/", "https://example.com/note"];
  const devices = ["desktop", "mobile", "desktop", "tablet"];
  const browsers = ["Chrome", "Firefox", "Safari", "Chrome"];
  const visitors = Array.from({ length: 34 }, (_, i) => `seed-visitor-${i}`);
  for (let i = 0; i < 160; i++) {
    const day = Math.floor(Math.random() * 24);
    state.hits.push({
      id: uid(12),
      blogId: demoBlog.id,
      postId: null,
      path: paths[Math.floor(Math.random() * paths.length)],
      createdAt: daysAgo(day, Math.floor(Math.random() * 1440)),
      referrer: referrers[Math.floor(Math.random() * referrers.length)],
      device: devices[Math.floor(Math.random() * devices.length)],
      browser: browsers[Math.floor(Math.random() * browsers.length)],
      visitorHash: visitors[Math.floor(Math.random() * visitors.length)],
    });
  }

  return state;
}

let state = null;
let writeChain = Promise.resolve();

export async function initStore({ reset = false } = {}) {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(UPLOADS_DIR, { recursive: true });

  if (reset) await rm(STORE_FILE, { force: true }).catch(() => {});

  try {
    state = JSON.parse(await readFile(STORE_FILE, "utf8"));
    state.version ||= 1;
    for (const key of Object.keys(emptyState())) if (!Array.isArray(state[key])) state[key] = [];
    state.sessions = state.sessions.filter((s) => new Date(s.expiresAt).getTime() > Date.now());
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    state = await seedState();
    await saveStore();
  }
  return state;
}

export function store() {
  if (!state) throw new Error("store not initialised");
  return state;
}

export function saveStore() {
  const snapshot = JSON.stringify(state, null, 2) + "\n";
  writeChain = writeChain.then(async () => {
    const tmp = `${STORE_FILE}.${process.pid}.tmp`;
    await writeFile(tmp, snapshot);
    await rename(tmp, STORE_FILE);
  });
  return writeChain;
}

export function mutate(fn) {
  const result = fn(state);
  return saveStore().then(() => result);
}

/* --- queries ------------------------------------------------- */

export const userById = (id) => store().users.find((u) => u.id === id) || null;
export const userByEmail = (email) =>
  store().users.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null;
export const blogsForUser = (userId) =>
  store().blogs.filter((b) => b.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
export const blogBySubdomain = (subdomain) =>
  store().blogs.find((b) => b.subdomain.toLowerCase() === String(subdomain).toLowerCase()) || null;
export const blogById = (id) => store().blogs.find((b) => b.id === id) || null;

export function blogByDomain(domain) {
  const clean = String(domain || "").toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "");
  if (!clean) return null;
  return (
    store().blogs.find((b) => {
      const candidate = String(b.domain || "").toLowerCase().replace(/^www\./, "");
      return candidate && candidate === clean;
    }) || null
  );
}

export const postsForBlog = (blogId) =>
  store()
    .posts.filter((p) => p.blogId === blogId)
    .sort((a, b) => String(b.publishedDate || b.lastModified).localeCompare(String(a.publishedDate || a.lastModified)));

export const publicPostsForBlog = (blogId, { includePages = false } = {}) =>
  postsForBlog(blogId).filter(
    (p) => p.publish && (!p.publishedDate || new Date(p.publishedDate).getTime() <= Date.now()) && (includePages || !p.isPage),
  );

export function findPost(blogId, slugOrAlias) {
  const slug = String(slugOrAlias || "").replace(/^\/+|\/+$/g, "");
  const posts = store().posts;
  return (
    posts.find((p) => p.blogId === blogId && p.slug.toLowerCase() === slug.toLowerCase()) ||
    posts.find((p) => p.blogId === blogId && p.alias && p.alias.toLowerCase() === slug.toLowerCase()) ||
    null
  );
}

export const postById = (id) => store().posts.find((p) => p.id === id) || null;
export const subscribersForBlog = (blogId) =>
  store().subscribers.filter((s) => s.blogId === blogId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
export const uploadsForBlog = (blogId) =>
  store().uploads.filter((u) => u.blogId === blogId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export function allPublicPosts({ discoverOnly = false } = {}) {
  const cutoff = Date.now();
  return store()
    .posts.filter(
      (p) =>
        p.publish &&
        !p.isPage &&
        new Date(p.publishedDate || 0).getTime() <= cutoff &&
        (!discoverOnly || p.discoverable),
    )
    .sort((a, b) => String(b.publishedDate || "").localeCompare(String(a.publishedDate || "")));
}

export function blogForPost(post) {
  return blogById(post.blogId);
}

export function countHits(blogId, sinceMs = 0) {
  const since = Date.now() - sinceMs;
  return store().hits.filter((h) => h.blogId === blogId && new Date(h.createdAt).getTime() >= since);
}

export async function resetStore() {
  return initStore({ reset: true });
}
