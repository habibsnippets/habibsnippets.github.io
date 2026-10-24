import {
  store as db,
  saveStore,
  publicPostsForBlog,
  findPost,
  postById,
  userById,
} from "./store.mjs";
import { currentAuth, ensureVoter, voterFor } from "./security.mjs";
import { sha256, uid, safeEqual } from "./crypto.mjs";
import {
  isGet,
  redirect,
  send,
  sendBlog,
  tooMany,
  readForm,
  blogOrigin,
  MAIN_ORIGIN,
  HttpError,
} from "./web.mjs";
import {
  renderBlogHome,
  renderPostsPage,
  renderPostPage,
  renderSubscribePage,
  renderBlog404,
} from "./public.mjs";
import { atomFeed, rssFeed, sitemapXml, robotsTxt, faviconSvg } from "./feeds.mjs";
import { recordHit } from "./stats.mjs";

const PAGE_SIZE = 20;

function publicState(post) {
  if (!post.publish) return false;
  if (!post.publishedDate) return true;
  return new Date(post.publishedDate).getTime() <= Date.now();
}

function ownerCheck(req, blog) {
  const { user } = currentAuth(req);
  return Boolean(user && user.id === blog.userId);
}

function ctxFor(blog, prefix, sandbox) {
  return {
    origin: blogOrigin(blog),
    mainOrigin: MAIN_ORIGIN,
    prefix,
    publicPosts: publicPostsForBlog(blog.id),
    fallback: sandbox,
  };
}

function send404(req, res, blog, ctx) {
  sendBlog(req, res, 404, renderBlog404({ blog, ctx }), {
    sandbox: ctx.fallback,
    noindex: true,
  });
}

export async function serveBlog(req, res, url, blog, { prefix = "", sandbox = false } = {}) {
  let subPath;
  try {
    subPath = decodeURIComponent(prefix ? url.pathname.slice(prefix.length) || "/" : url.pathname);
  } catch {
    const ctx = ctxFor(blog, prefix, sandbox);
    send404(req, res, blog, ctx);
    return;
  }
  subPath = subPath.replace(/\/{2,}/g, "/");
  if (!subPath.startsWith("/")) subPath = `/${subPath}`;

  const ctx = ctxFor(blog, prefix, sandbox);
  const posts = ctx.publicPosts;
  const blogPath = blog.blogPath || "blog";
  const rssAlias = blog.rssAlias || "";

  /* --- feeds, sitemap, robots, favicon ----------------------- */
  if (subPath === "/feed" || (rssAlias && subPath === `/${rssAlias}`)) {
    redirect(res, `${prefix}${subPath}/${url.search}`);
    return;
  }
  if (subPath === "/feed/" || (rssAlias && subPath === `/${rssAlias}/`)) {
    const rss = url.searchParams.get("type") === "rss";
    send(req, res, 200, rss ? rssFeed(blog, posts) : atomFeed(blog, posts), {
      "Content-Type": rss ? "application/rss+xml; charset=utf-8" : "application/atom+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    });
    return;
  }
  if (subPath === "/sitemap.xml") {
    send(req, res, 200, sitemapXml(blog, publicPostsForBlog(blog.id, { includePages: true })), {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    });
    return;
  }
  if (subPath === "/robots.txt") {
    send(req, res, 200, robotsTxt(blog), {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    });
    return;
  }
  if (subPath === "/favicon.svg") {
    send(req, res, 200, faviconSvg(blog), {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    });
    return;
  }

  /* --- public forms ------------------------------------------ */
  if (subPath === "/subscribe/") {
    const owner = userById(blog.userId);
    let message = "";
    if (!owner || owner.plan !== "pro") message = "Email subscriptions are not enabled on this blog.";
    else if (url.searchParams.get("ok") === "1") message = "You are on the list. New posts will arrive by email when this blog is connected to a sender.";
    else if (url.searchParams.get("error") === "invalid") message = "That email address did not look right.";
    else if (url.searchParams.get("error") === "limit") message = "Too many attempts. Try again later.";
    sendBlog(req, res, 200, renderSubscribePage({ blog, ctx, message }), {
      sandbox,
    });
    return;
  }

  if (subPath === "/email-subscribe/") {
    if (req.method !== "POST") {
      send(req, res, 405, "Method not allowed", { Allow: "POST", "Content-Type": "text/plain; charset=utf-8" });
      return;
    }
    const fields = await readForm(req);
    if (tooMany(req, res, `subscribe:${blog.id}`, { limit: 12, windowMs: 60 * 60 * 1000 })) return;
    const owner = userById(blog.userId);
    if (!owner || owner.plan !== "pro") {
      redirect(res, `${prefix}/subscribe/?error=disabled`);
      return;
    }
    const email = String(fields.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      redirect(res, `${prefix}/subscribe/?error=invalid`);
      return;
    }
    const exists = db().subscribers.some(
      (item) => item.blogId === blog.id && item.email.toLowerCase() === email,
    );
    if (!exists) {
      db().subscribers.push({
        id: uid(12),
        blogId: blog.id,
        email,
        createdAt: new Date().toISOString(),
      });
      await saveStore();
    }
    redirect(res, `${prefix}/subscribe/?ok=1`);
    return;
  }

  if (subPath === "/upvote/") {
    if (req.method !== "POST") {
      send(req, res, 405, "Method not allowed", { Allow: "POST", "Content-Type": "text/plain; charset=utf-8" });
      return;
    }
    if (tooMany(req, res, `upvote:${blog.id}`, { limit: 80, windowMs: 60 * 60 * 1000 })) return;
    const fields = await readForm(req);
    const post = db().posts.find((item) => item.blogId === blog.id && item.uid === fields.uid);
    if (!post || !publicState(post)) {
      send404(req, res, blog, ctx);
      return;
    }
    const voter = ensureVoter(req, res);
    const voterHash = sha256(voter);
    const already = db().upvotes.some((item) => item.postId === post.id && item.voterHash === voterHash);
    if (!already) {
      db().upvotes.push({
        id: uid(12),
        postId: post.id,
        voterHash,
        createdAt: new Date().toISOString(),
      });
      post.upvotes = Number(post.upvotes || 0) + 1;
      await saveStore();
    }
    redirect(res, `${prefix}/${post.slug}/`);
    return;
  }

  /* --- home and blog index ----------------------------------- */
  if (subPath === "/") {
    sendBlog(req, res, 200, renderBlogHome({ blog, posts, ctx }), { sandbox });
    recordHit(req, blog, { path: "/" });
    return;
  }

  if (subPath === `/${blogPath}`) {
    redirect(res, `${prefix}/${blogPath}/${url.search}`);
    return;
  }
  if (subPath === `/${blogPath}/`) {
    const query = String(url.searchParams.get("q") || "").trim();
    const tags = query
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 6);
    const filtered = tags.length
      ? posts.filter((post) => tags.every((tag) => (post.tags || []).includes(tag)))
      : posts;
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const page = Math.min(totalPages, Math.max(1, Number.parseInt(url.searchParams.get("page"), 10) || 1));
    const pagePosts = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const availableTags = [...new Set(posts.flatMap((post) => post.tags || []))].sort();
    sendBlog(
      req,
      res,
      200,
      renderPostsPage({
        blog,
        posts: pagePosts,
        activeTags: tags,
        availableTags,
        ctx,
        title: blogPath.replace(/-/g, " "),
        page,
        totalPages,
        query,
      }),
      { sandbox },
    );
    recordHit(req, blog, { path: `/${blogPath}/` });
    return;
  }

  /* --- a post or page ---------------------------------------- */
  const candidate = subPath.replace(/^\/+|\/+$/g, "");
  if (!candidate || candidate.includes("..")) {
    send404(req, res, blog, ctx);
    return;
  }
  const post = findPost(blog.id, candidate);
  if (!post) {
    send404(req, res, blog, ctx);
    return;
  }

  const published = publicState(post);
  const owner = ownerCheck(req, blog);
  /* A draft preview link carries the post's random preview token. It works
     across hosts without a session cookie, is read-only, and renders under
     the same sandbox CSP as an owner preview. */
  const token = String(url.searchParams.get("preview") || "");
  const linkPreview = !published && Boolean(post.previewToken) && Boolean(token) && safeEqual(token, post.previewToken);
  if (!published && !owner && !linkPreview) {
    send404(req, res, blog, ctx);
    return;
  }

  if (!subPath.endsWith("/") && candidate === post.slug) {
    redirect(res, `${prefix}/${post.slug}/${url.search}`);
    return;
  }

  const preview = !published;
  let upvoted = false;
  if (published) {
    const voter = voterFor(req);
    if (voter) {
      const voterHash = sha256(voter);
      upvoted = db().upvotes.some((item) => item.postId === post.id && item.voterHash === voterHash);
    }
  }

  sendBlog(
    req,
    res,
    200,
    renderPostPage({
      blog,
      post,
      posts,
      ctx,
      preview,
      upvoted,
    }),
    { sandbox: sandbox || preview, noindex: preview },
  );
  if (published) recordHit(req, blog, { path: `/${post.slug}/`, post });
}
