import path from "node:path";
import { rm } from "node:fs/promises";

import {
  store as db,
  saveStore,
  postsForBlog,
  blogBySubdomain,
  blogByDomain,
  UPLOADS_DIR,
} from "./store.mjs";
import { verifyCsrf } from "./security.mjs";
import {
  isGet,
  readForm,
  sendDashboard,
  redirect,
  send,
  csv,
  zipStore,
  noticeFor,
  MAIN_ORIGIN,
  PUBLIC_HOSTNAME,
  cleanSubdomain,
  subdomainProblem,
  HttpError,
} from "./web.mjs";
import { serializePost } from "./content.mjs";
import {
  renderSettings,
  renderAppearance,
  renderNav,
  renderDirectives,
  renderPostTemplate,
  renderDomain,
} from "./dashboard.mjs";

const THEMES = new Set(["default", "paper", "terminal", "rose", "forest"]);
const RESERVED_BLOG_PATHS = new Set([
  "assets", "b", "dashboard", "discover", "login", "logout", "signup",
  "forgot", "reset", "about", "media", "feed", "sitemap.xml", "robots.txt",
  "favicon.svg", "subscribe", "email-subscribe", "upvote",
]);

function methodNotAllowed(req, res, allow) {
  send(req, res, 405, "Method not allowed", {
    Allow: allow,
    "Content-Type": "text/plain; charset=utf-8",
  });
}

function csrfFail(req, res) {
  sendDashboard(
    req,
    res,
    403,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Form expired</title><link rel="stylesheet" href="/assets/deer.css"></head><body class="deer dashboard"><main class="narrow prose"><h1>That form expired</h1><p>Reload the page and try again.</p></main></body></html>`,
  );
}

function badRequest(req, res, title, message) {
  sendDashboard(
    req,
    res,
    400,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="/assets/deer.css"></head><body class="deer dashboard"><main class="narrow prose"><h1>${title}</h1><p>${message}</p><p><a href="/dashboard/">Back to your blogs</a></p></main></body></html>`,
  );
}

export function exportPostsCsv(blog) {
  const fields = [
    "uid", "title", "slug", "alias", "published_date", "tags", "publish",
    "discoverable", "is_page", "content", "canonical_url", "meta_description",
    "meta_image", "lang", "class_name", "first_published_at",
  ];
  const rows = [
    fields,
    ...postsForBlog(blog.id).map((post) => [
      post.uid,
      post.title,
      post.slug,
      post.alias || "",
      post.publishedDate || "",
      (post.tags || []).join(","),
      post.publish ? "true" : "false",
      post.discoverable ? "true" : "false",
      post.isPage ? "true" : "false",
      post.content || "",
      post.canonicalUrl || "",
      post.metaDescription || "",
      post.metaImage || "",
      post.lang || "",
      post.className || "",
      post.firstPublishedAt || "",
    ]),
  ];
  return csv(rows);
}

export function exportPostsZip(blog) {
  const files = [];
  for (const post of postsForBlog(blog.id)) {
    const folder = post.isPage ? "pages" : "posts";
    const name = String(post.slug || "post").replace(/\//g, "--");
    files.push({ name: `${folder}/${name}.md`, content: serializePost(post) });
  }
  files.unshift({
    name: "README.txt",
    content: `${blog.title}\n${blog.subdomain}\n\nExported from Deerblog on ${new Date().toISOString()}.\nEach .md file keeps the raw header and Markdown body used by the editor.\n`,
  });
  return zipStore(files);
}

export async function removeBlogData(blog) {
  const postIds = new Set(
    db().posts.filter((post) => post.blogId === blog.id).map((post) => post.id),
  );
  db().posts = db().posts.filter((post) => post.blogId !== blog.id);
  db().subscribers = db().subscribers.filter((item) => item.blogId !== blog.id);
  db().hits = db().hits.filter((hit) => hit.blogId !== blog.id);
  db().upvotes = db().upvotes.filter((vote) => !postIds.has(vote.postId));
  db().uploads = db().uploads.filter((item) => item.blogId !== blog.id);
  db().blogs = db().blogs.filter((item) => item.id !== blog.id);
  await rm(path.join(UPLOADS_DIR, blog.id), { recursive: true, force: true }).catch(() => {});
}

function draftFromFields(blog, fields) {
  return {
    ...blog,
    title: String(fields.title || "").trim().slice(0, 200),
    subdomain: cleanSubdomain(fields.subdomain),
    lang: String(fields.lang || "").trim().slice(0, 10),
    blogPath: cleanSubdomain(fields.blog_path),
    dateFormat: String(fields.date_format || "").trim().slice(0, 32),
    rssAlias: cleanSubdomain(fields.rss_alias),
    analyticsActive: fields.analytics_active === "on",
    metaTag: String(fields.meta_tag || "").slice(0, 4000),
    robotsTxt: String(fields.robots_txt || "").slice(0, 10000),
  };
}

async function settings(req, res, url, { user, blog, csrf }) {
  if (isGet(req)) {
    const exportType = url.searchParams.get("export");
    if (exportType === "csv") {
      send(req, res, 200, exportPostsCsv(blog), {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${blog.subdomain}-posts.csv"`,
        "Cache-Control": "no-store",
      });
      return true;
    }
    if (exportType === "md") {
      send(req, res, 200, exportPostsZip(blog), {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${blog.subdomain}-posts.zip"`,
        "Cache-Control": "no-store",
      });
      return true;
    }
    sendDashboard(
      req,
      res,
      200,
      renderSettings({
        user,
        blog,
        csrf,
        mainOrigin: MAIN_ORIGIN,
        notice: noticeFor(url),
      }),
    );
    return true;
  }
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "GET, POST");
    return true;
  }

  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return true;
  }

  const draft = draftFromFields(blog, fields);
  const errors = [];
  if (!draft.title) errors.push("The blog title cannot be empty.");
  const subProblem = subdomainProblem(draft.subdomain);
  if (subProblem) errors.push(subProblem);
  else {
    const other = blogBySubdomain(draft.subdomain);
    if (other && other.id !== blog.id) errors.push(`The subdomain "${draft.subdomain}" is already in use.`);
  }
  if (!draft.blogPath || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(draft.blogPath)) {
    errors.push("Blog path must be letters, numbers, or hyphens.");
  } else if (RESERVED_BLOG_PATHS.has(draft.blogPath)) {
    errors.push(`"${draft.blogPath}" is reserved for the platform.`);
  }
  if (draft.rssAlias) {
    if (draft.rssAlias === draft.blogPath) errors.push("The RSS alias must differ from the blog path.");
    else if (RESERVED_BLOG_PATHS.has(draft.rssAlias) || draft.rssAlias === "feed") {
      errors.push(`"${draft.rssAlias}" is reserved for a platform feed.`);
    }
  }
  if (!draft.dateFormat) draft.dateFormat = "d M, Y";
  if (!draft.lang) draft.lang = "en";

  if (errors.length) {
    sendDashboard(
      req,
      res,
      400,
      renderSettings({
        user,
        blog: draft,
        csrf,
        mainOrigin: MAIN_ORIGIN,
        error: errors.join(" "),
      }),
    );
    return true;
  }

  const oldSubdomain = blog.subdomain;
  blog.title = draft.title;
  blog.subdomain = draft.subdomain;
  blog.lang = draft.lang;
  blog.blogPath = draft.blogPath;
  blog.dateFormat = draft.dateFormat;
  blog.rssAlias = draft.rssAlias;
  blog.analyticsActive = draft.analyticsActive;
  blog.metaTag = draft.metaTag;
  blog.robotsTxt = draft.robotsTxt;
  blog.lastModified = new Date().toISOString();
  await saveStore();
  redirect(
    res,
    blog.subdomain === oldSubdomain
      ? `/${blog.subdomain}/dashboard/settings/?notice=saved`
      : `/${blog.subdomain}/dashboard/settings/?notice=saved`,
  );
  return true;
}

async function appearance(req, res, url, { user, blog, csrf }) {
  if (isGet(req)) {
    sendDashboard(
      req,
      res,
      200,
      renderAppearance({
        user,
        blog,
        csrf,
        mainOrigin: MAIN_ORIGIN,
        notice: noticeFor(url),
      }),
    );
    return true;
  }
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "GET, POST");
    return true;
  }
  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return true;
  }
  const theme = String(fields.theme || "default");
  blog.theme = THEMES.has(theme) ? theme : "default";
  blog.overwriteStyles = fields.overwrite_styles === "on";
  blog.customStyles = String(fields.custom_styles || "").slice(0, 200000);
  blog.lastModified = new Date().toISOString();
  await saveStore();
  redirect(res, `/${blog.subdomain}/dashboard/appearance/?notice=saved`);
  return true;
}

async function nav(req, res, url, { user, blog, csrf }) {
  if (isGet(req)) {
    sendDashboard(
      req,
      res,
      200,
      renderNav({ user, blog, csrf, mainOrigin: MAIN_ORIGIN, notice: noticeFor(url) }),
    );
    return true;
  }
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "GET, POST");
    return true;
  }
  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return true;
  }
  blog.nav = String(fields.nav || "").slice(0, 20000);
  blog.lastModified = new Date().toISOString();
  await saveStore();
  redirect(res, `/${blog.subdomain}/dashboard/nav/?notice=saved`);
  return true;
}

async function directives(req, res, url, { user, blog, csrf }) {
  if (isGet(req)) {
    sendDashboard(
      req,
      res,
      200,
      renderDirectives({ user, blog, csrf, mainOrigin: MAIN_ORIGIN, notice: noticeFor(url) }),
    );
    return true;
  }
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "GET, POST");
    return true;
  }
  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return true;
  }
  blog.headerDirective = String(fields.header_directive || "").slice(0, 100000);
  blog.footerDirective = String(fields.footer_directive || "").slice(0, 100000);
  blog.lastModified = new Date().toISOString();
  await saveStore();
  redirect(res, `/${blog.subdomain}/dashboard/directives/?notice=saved`);
  return true;
}

async function postTemplate(req, res, url, { user, blog, csrf }) {
  if (isGet(req)) {
    sendDashboard(
      req,
      res,
      200,
      renderPostTemplate({ user, blog, csrf, mainOrigin: MAIN_ORIGIN, notice: noticeFor(url) }),
    );
    return true;
  }
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "GET, POST");
    return true;
  }
  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return true;
  }
  blog.postTemplate = String(fields.post_template || "").slice(0, 100000);
  blog.lastModified = new Date().toISOString();
  await saveStore();
  redirect(res, `/${blog.subdomain}/dashboard/post-template/?notice=saved`);
  return true;
}

function cleanDomain(value) {
  let domain = String(value || "").trim().toLowerCase();
  domain = domain.replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  domain = domain.replace(/^www\./, "").replace(/\.$/, "");
  return domain;
}

async function domain(req, res, url, { user, blog, csrf }) {
  if (isGet(req)) {
    sendDashboard(
      req,
      res,
      200,
      renderDomain({ user, blog, csrf, mainOrigin: MAIN_ORIGIN, notice: noticeFor(url) }),
    );
    return true;
  }
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "GET, POST");
    return true;
  }
  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return true;
  }
  if (user.plan !== "pro") {
    sendDashboard(
      req,
      res,
      403,
      renderDomain({
        user,
        blog,
        csrf,
        mainOrigin: MAIN_ORIGIN,
        error: "Custom domains are part of Deer Pro.",
      }),
    );
    return true;
  }

  const nextDomain = cleanDomain(fields.domain);
  if (nextDomain) {
    if (!/^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/.test(nextDomain)) {
      sendDashboard(
        req,
        res,
        400,
        renderDomain({
          user,
          blog,
          csrf,
          mainOrigin: MAIN_ORIGIN,
          error: "Enter a domain like notes.example.com, without a path or port.",
        }),
      );
      return true;
    }
    if (nextDomain === PUBLIC_HOSTNAME || nextDomain.endsWith(`.${PUBLIC_HOSTNAME}`)) {
      sendDashboard(
        req,
        res,
        400,
        renderDomain({
          user,
          blog,
          csrf,
          mainOrigin: MAIN_ORIGIN,
          error: "That host belongs to the Deerblog platform. Use a domain you control.",
        }),
      );
      return true;
    }
    const other = blogByDomain(nextDomain);
    if (other && other.id !== blog.id) {
      sendDashboard(
        req,
        res,
        409,
        renderDomain({
          user,
          blog,
          csrf,
          mainOrigin: MAIN_ORIGIN,
          error: "That domain is already connected to another blog.",
        }),
      );
      return true;
    }
  }

  blog.domain = nextDomain;
  blog.lastModified = new Date().toISOString();
  await saveStore();
  redirect(res, `/${blog.subdomain}/dashboard/domain/?notice=domain-saved`);
  return true;
}

async function deleteBlog(req, res, { user, blog }) {
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "POST");
    return true;
  }
  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return true;
  }
  if (String(fields.confirm || "").trim() !== blog.subdomain) {
    badRequest(req, res, "Confirmation did not match", "Type the subdomain exactly to delete this blog.");
    return true;
  }
  await removeBlogData(blog);
  await saveStore();
  redirect(res, "/dashboard/?notice=blog-deleted");
  return true;
}

export async function handleBlogSettingsRoute(req, res, url, { user, blog, csrf, rest }) {
  try {
    if (rest === "settings") return await settings(req, res, url, { user, blog, csrf });
    if (rest === "appearance") return await appearance(req, res, url, { user, blog, csrf });
    if (rest === "nav") return await nav(req, res, url, { user, blog, csrf });
    if (rest === "directives") return await directives(req, res, url, { user, blog, csrf });
    if (rest === "post-template") return await postTemplate(req, res, url, { user, blog, csrf });
    if (rest === "domain") return await domain(req, res, url, { user, blog, csrf });
    if (rest === "delete") return await deleteBlog(req, res, { user, blog });
  } catch (err) {
    if (err instanceof HttpError) {
      badRequest(req, res, "Request problem", err.message);
      return true;
    }
    throw err;
  }
  return false;
}
