import { escapeHtml as esc } from "./markdown.mjs";
import { renderMarkdown } from "./markdown.mjs";
import { applyDirectives } from "./directives.mjs";
import { displayDate } from "./dates.mjs";

export const SITE_NAME = "Deerblog";

const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${esc(csrf)}">`;

function absolute(origin, path) {
  return `${String(origin).replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function publicPath(prefix, path = "") {
  const base = prefix ? `${prefix.replace(/\/$/, "")}` : "";
  const clean = path ? `/${String(path).replace(/^\/+/, "")}` : "/";
  return `${base}${clean}` || "/";
}

function postHref(prefix, post) {
  return publicPath(prefix, `${post.slug}/`);
}

function tagsHref(prefix, blog, tag) {
  return `${publicPath(prefix, `${blog.blogPath || "blog"}/`)}?q=${encodeURIComponent(tag)}`;
}

function feedHref(prefix, path = "feed/") {
  return publicPath(prefix, path);
}

function renderContent(markdown, { blog, post = null, prefix, publicPosts = [] }) {
  const result = renderMarkdown(markdown, { assetBase: `/media/${blog.id}/` });
  const html = applyDirectives(result.html, {
    blog,
    post,
    prefix,
    publicPosts,
    blogHref: () => publicPath(prefix, ""),
    postHref: (item) => postHref(prefix, item),
    tagsHref: (tag) => tagsHref(prefix, blog, tag),
  });
  return { ...result, html };
}

function postList(posts, { blog, prefix }) {
  if (!posts.length) return `<ul class="deer-posts"><li>No posts yet.</li></ul>`;
  return `<ul class="deer-posts">${posts
    .map(
      (post) =>
        `<li><time datetime="${esc(post.publishedDate || "")}">${esc(displayDate(post.publishedDate, blog))}</time> <a href="${esc(postHref(prefix, post))}">${esc(post.title)}</a></li>`,
    )
    .join("")}</ul>`;
}

function seoHead({
  title,
  description,
  canonical,
  image,
  type = "website",
  siteName = SITE_NAME,
  metaTag = "",
  lang = "en",
}) {
  return `<meta name="description" content="${esc(description)}">
<meta property="og:site_name" content="${esc(siteName)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:type" content="${esc(type)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:description" content="${esc(description)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ""}
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
${image ? `<meta name="twitter:image" content="${esc(image)}">` : ""}
${metaTag || ""}
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": type === "article" ? "BlogPosting" : "WebSite",
    name: title,
    headline: title,
    url: canonical,
    description,
    ...(image ? { image } : {}),
  }).replace(/</g, "\\u003c")}</script>`;
}

function blogHead({ blog, ctx, title, description, canonical, image, type, feedTitle }) {
  const favicon = blog.favicon && /^https?:\/\//i.test(blog.favicon)
    ? blog.favicon
    : `${publicPath(ctx.prefix, "favicon.svg")}`;
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="canonical" href="${esc(canonical)}">
${seoHead({
    title,
    description,
    canonical,
    image,
    type,
    siteName: blog.title,
    metaTag: blog.metaTag,
    lang: blog.lang,
  })}
<link rel="alternate" type="application/atom+xml" href="${feedHref(ctx.prefix)}" title="${esc(feedTitle || blog.title)}">
<link rel="alternate" type="application/rss+xml" href="${feedHref(ctx.prefix)}?type=rss" title="${esc(feedTitle || blog.title)}">
<link rel="icon" href="${esc(favicon)}">
<link rel="stylesheet" href="/assets/deer.css">
<link rel="stylesheet" href="/assets/katex.css">
<style>${String(blog.customStyles || "").replace(/<\/style/gi, "<\\/style")}</style>
${blog.headerDirective || ""}`;
}

function blogBody({ blog, ctx, content, nav, footer, bodyClass, preview = false, article = "" }) {
  const theme = blog.overwriteStyles ? "theme-custom" : `theme-${blog.theme || "default"}`;
  const navHtml = nav === undefined ? renderContent(blog.nav || "", { blog, prefix: ctx.prefix, publicPosts: ctx.publicPosts }).html : nav;
  return `<body class="deer ${theme} ${bodyClass || ""}">
${preview ? `<div class="deer-preview">Preview — not public. Links and scripts are disabled in the dashboard preview.</div>` : ""}
<header class="deer-header">
  <a class="deer-title" href="${esc(publicPath(ctx.prefix))}"><span class="deer-mark" aria-hidden="true">${esc(blog.favicon || "🦌")}</span> ${esc(blog.title)}</a>
  <nav class="deer-nav">${navHtml}</nav>
</header>
<main class="deer-main ${article}">
${content}
</main>
<footer class="deer-footer">
${blog.footerDirective ? renderContent(blog.footerDirective, { blog, prefix: ctx.prefix, publicPosts: ctx.publicPosts }).html : ""}
  <span>Powered by <a href="${esc(ctx.mainOrigin)}/">Deerblog</a> · <a href="${esc(ctx.mainOrigin)}/discover/">Discover</a></span>
</footer>
</body>
</html>`;
}

function blogDoc({ blog, ctx, headTitle, description, canonical, image, type, content, bodyClass, preview }) {
  return `<!doctype html>
<html lang="${esc(blog.lang || "en")}">
<head>
${blogHead({ blog, ctx, title: headTitle, description, canonical, image, type })}
</head>
${blogBody({ blog, ctx, content, bodyClass, preview })}
</body>
</html>`;
}

export function renderBlogHome({ blog, posts, ctx }) {
  const homeHtml = blog.content
    ? renderContent(blog.content, { blog, prefix: ctx.prefix, publicPosts: posts }).html
    : "";
  const hasPostsDirective = /\{\{\s*posts\b/.test(blog.content || "");
  const recent = posts.slice(0, 5);
  const content = `${homeHtml}${
    recent.length && !hasPostsDirective
      ? `${homeHtml ? "<h2>Recent posts</h2>" : ""}${postList(recent, { blog, prefix: ctx.prefix })}`
      : ""
  }`;
  const description = blog.metaDescription || (blog.content || "").replace(/[#>*_`\[\]()!]/g, "").slice(0, 150);
  return `<!doctype html><html lang="${esc(blog.lang)}"><head>${blogHead({
    blog,
    ctx,
    title: blog.title,
    description,
    canonical: `${ctx.origin}/`,
    image: blog.metaImage,
    type: "website",
  })}</head>${blogBody({
    blog,
    ctx,
    content,
    bodyClass: "home",
  })}`;
}

export function renderPostsPage({ blog, posts, activeTags, availableTags, ctx, title, page = 1, totalPages = 1, query = "" }) {
  const base = publicPath(ctx.prefix, `${blog.blogPath || "blog"}/`);
  const filters = activeTags.length
    ? `<p class="deer-filters">Filtering ${activeTags.map((tag) => `#${esc(tag)}`).join(" ")} · <a href="${esc(base)}">clear</a></p>`
    : "";
  const tagCloud = availableTags.length
    ? `<p class="deer-tags">${availableTags
        .map((tag) => `<a href="${esc(tagsHref(ctx.prefix, blog, tag))}">#${esc(tag)}</a>`)
        .join(" ")}</p>`
    : "";
  const pageLink = (target) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (target > 1) params.set("page", String(target));
    const suffix = params.toString();
    return `${base}${suffix ? `?${suffix}` : ""}`;
  };
  const pagination = totalPages > 1
    ? `<nav class="deer-pagination" aria-label="Pagination">${
        page > 1 ? `<a href="${esc(pageLink(page - 1))}">← Newer</a>` : "<span></span>"
      }<span>Page ${page} of ${totalPages}</span>${
        page < totalPages ? `<a href="${esc(pageLink(page + 1))}">Older →</a>` : "<span></span>"
      }</nav>`
    : "";
  const empty = posts.length ? "" : `<p class="deer-empty">No posts match this filter yet.</p>`;
  const content = `<h1>${esc(title || (blog.blogPath || "Blog").replace(/-/g, " "))}</h1>${filters}${postList(posts, { blog, prefix: ctx.prefix })}${empty}${pagination}${tagCloud}`;
  return `<!doctype html><html lang="${esc(blog.lang)}"><head>${blogHead({
    blog,
    ctx,
    title: `${title || "Blog"} – ${blog.title}`,
    description: blog.metaDescription || blog.title,
    canonical: `${ctx.origin}/${blog.blogPath || "blog"}/${page > 1 ? `?page=${page}` : ""}`,
    image: blog.metaImage,
  })}</head>${blogBody({ blog, ctx, content, bodyClass: "blog-index" })}`;
}

export function renderPostPage({ blog, post, posts, ctx, preview = false, upvoted = false }) {
  const isPage = post.isPage;
  const fullPath = `${ctx.origin}/${post.slug}/`;
  const canonical = post.canonicalUrl && post.canonicalUrl.startsWith("https://") ? post.canonicalUrl : fullPath;
  const description = post.metaDescription || (post.content || "").replace(/[#>*_`\[\]()!]/g, "").slice(0, 155);
  const content = [
    preview ? "" : "",
    !isPage ? `<h1>${esc(post.title)}</h1><p class="deer-date"><time datetime="${esc(post.publishedDate || "")}">${esc(displayDate(post.publishedDate, blog))}</time>${post.firstPublishedAt && post.lastModified ? ` · updated ${esc(displayDate(post.lastModified, blog))}` : ""}</p>` : "",
    renderContent(post.content, { blog, post, prefix: ctx.prefix, publicPosts: posts }).html,
    post.canonicalUrl && canonical !== fullPath ? `<p><small><a href="${esc(canonical)}" rel="canonical">View original</a></small></p>` : "",
    !preview && post.tags?.length
      ? `<p class="deer-tags">${post.tags.map((tag) => `<a rel="nofollow" href="${esc(tagsHref(ctx.prefix, blog, tag))}">#${esc(tag)}</a>`).join(" ")}</p>`
      : "",
    !preview && post.discoverable
      ? `<form class="deer-upvote" action="${esc(publicPath(ctx.prefix, "upvote/"))}" method="post"><input type="hidden" name="uid" value="${esc(post.uid)}"><button type="submit" ${upvoted ? "disabled" : ""} aria-label="Upvote this post">${upvoted ? "♥" : "♡"}<small>${Number(post.upvotes || 0)}</small></button></form>`
      : "",
  ].join("");
  const title = isPage ? post.title : `${post.title} – ${blog.title}`;
  return `<!doctype html><html lang="${esc(post.lang || blog.lang)}"><head>${blogHead({
    blog,
    ctx,
    title,
    description,
    canonical,
    image: post.metaImage || blog.metaImage,
    type: "article",
  })}</head>${blogBody({
    blog,
    ctx,
    content,
    bodyClass: `post ${post.className || ""} ${isPage ? "page" : ""}`,
    article: "is-article",
    preview,
  })}`;
}

export function renderSubscribePage({ blog, ctx, message = "" }) {
  const content = `<h1>Subscribe</h1><p>Get new posts from ${esc(blog.title)} in your inbox.</p>
<form class="deer-subscribe" action="${esc(publicPath(ctx.prefix, "email-subscribe/"))}" method="post">
  <label>Email address<input type="email" name="email" required autocomplete="email" placeholder="you@example.com"></label>
  <button type="submit">Subscribe</button>
</form>${message ? `<p class="deer-message">${esc(message)}</p>` : ""}`;
  return `<!doctype html><html lang="${esc(blog.lang)}"><head>${blogHead({
    blog,
    ctx,
    title: `Subscribe – ${blog.title}`,
    description: blog.metaDescription,
    canonical: `${ctx.origin}/subscribe/`,
  })}</head>${blogBody({ blog, ctx, content, bodyClass: "subscribe" })}`;
}

export function renderBlog404({ blog, ctx }) {
  const content = `<h1>404</h1><p>That page wandered off.</p><p><a href="${esc(publicPath(ctx.prefix))}">Back home</a></p>`;
  return `<!doctype html><html lang="${esc(blog.lang)}"><head>${blogHead({
    blog,
    ctx,
    title: `404 – ${blog.title}`,
    description: "Not found",
    canonical: `${ctx.origin}/404/`,
  })}</head>${blogBody({ blog, ctx, content, bodyClass: "not-found" })}`;
}

/* --- main site ------------------------------------------------- */

function mainHead({ title, description, canonical, origin, user }) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
${seoHead({ title, description, canonical, type: "website", siteName: SITE_NAME })}
<link rel="icon" href="/assets/deer.svg">
<link rel="stylesheet" href="/assets/deer.css">
`;
}

function mainShell({ title, description, canonical, origin, user, body, bodyClass = "", csrf = "" }) {
  return `<!doctype html>
<html lang="en">
<head>${mainHead({ title, description, canonical, origin, user })}</head>
<body class="deer deer-main-site ${bodyClass}">
<header class="site-bar">
  <a class="site-brand" href="/"><span aria-hidden="true">🦌</span> Deerblog</a>
  <nav class="site-links">
    <a href="/discover/">Discover</a>
    ${user ? `<a href="/dashboard/">Dashboard</a><form method="post" action="/logout/" class="inline-form">${csrfField(csrf)}<button class="link-button" type="submit">Log out</button></form>` : `<a href="/login/">Log in</a><a class="button small" href="/signup/">Start writing</a>`}
  </nav>
</header>
${body}
<footer class="site-footer">
  <span>Deerblog · an original local study of a calm blogging platform.</span>
  <a href="/about/">How it works</a>
</footer>
</body>
</html>`;
}

export function renderLanding({ latest, blogs, user, origin, csrf }) {
  const posts = latest
    .slice(0, 8)
    .map((post) => {
      const blog = blogs.find((b) => b.id === post.blogId);
      if (!blog) return "";
      return `<li><a href="/b/${esc(blog.subdomain)}/${esc(post.slug)}/">${esc(post.title)}</a><span>${esc(blog.title)} · ${esc(displayDate(post.publishedDate, blog))}</span></li>`;
    })
    .join("");
  const body = `<main>
<section class="hero">
  <p class="eyebrow">A quiet corner of the web</p>
  <h1>A calm home for<br>your words.</h1>
  <p class="hero-copy">Write, publish, and keep a page of your own. No trackers, no scripts, no engagement machinery — just a fast blog with a tiny surface area.</p>
  <div class="hero-actions"><a class="button" href="/signup/">Start writing</a><a class="button ghost" href="/discover/">Explore blogs</a></div>
  <p class="hero-note">Free local demo · <a href="/b/demo/">visit the demo blog</a> · <span>no credit card</span></p>
</section>
<section class="feature-grid">
  <article><h2>Your own address</h2><p>Every blog gets a subdomain. Custom domains are a host-header lookup away.</p></article>
  <article><h2>Markdown first</h2><p>A raw header and a body. Write in Markdown, publish a clean HTML page.</p></article>
  <article><h2>No tracking scripts</h2><p>Public pages are server-rendered. Analytics are aggregated on the server, without cookies.</p></article>
  <article><h2>Yours to keep</h2><p>Export your posts as Markdown, your subscribers as CSV, and your data as a single file.</p></article>
</section>
<section class="split">
  <div>
    <h2>Recently published</h2>
    <ul class="landing-posts">${posts || "<li>No public posts yet.</li>"}</ul>
  </div>
  <aside class="demo-card">
    <p class="eyebrow">Try it now</p>
    <h2>Demo account</h2>
    <p><code>demo@deerblog.test</code><br><code>deerblog123</code></p>
    <p>Or create a blog of your own. Signup takes two steps.</p>
    <a class="button small" href="/login/">Log in</a>
  </aside>
</section>
</main>`;
  return mainShell({
    title: "Deerblog — a calm home for your words",
    description: "A fast, no-nonsense blogging platform. Write Markdown, publish a page, keep your data.",
    canonical: `${origin}/`,
    origin,
    user,
    body,
    bodyClass: "landing",
  });
}

export function renderDiscover({ posts, blogs, query = "", origin, user, csrf }) {
  const rows = posts
    .map((post) => {
      const blog = blogs.find((b) => b.id === post.blogId);
      if (!blog) return "";
      return `<li><div class="discover-meta"><a href="/b/${esc(blog.subdomain)}/">${esc(blog.title)}</a><time datetime="${esc(post.publishedDate || "")}">${esc(displayDate(post.publishedDate, blog))}</time></div><h3><a href="/b/${esc(blog.subdomain)}/${esc(post.slug)}/">${esc(post.title)}</a></h3><p>${esc(post.metaDescription || "")}</p><span class="discover-upvotes">${Number(post.upvotes || 0)} upvotes</span></li>`;
    })
    .join("");
  const body = `<main class="discover">
<h1>Discover</h1>
<p class="lede">Public posts from blogs on this Deerblog instance, newest first.</p>
<form class="search" method="get" action="/discover/"><input type="search" name="q" value="${esc(query)}" placeholder="Search titles, tags, text…"><button type="submit">Search</button></form>
<ul class="discover-list">${rows || "<li>No posts match.</li>"}</ul>
<p><a href="/discover/random/">Take me to a random post →</a></p>
</main>`;
  return mainShell({
    title: `Discover – ${SITE_NAME}`,
    description: "Public posts from Deerblog.",
    canonical: `${origin}/discover/`,
    origin,
    user,
    csrf,
    body,
    bodyClass: "discover-page",
  });
}

export function renderAuth({ title, description, body, user, origin, csrf, path = "/", showBrand = true }) {
  const content = `<main class="auth-wrap"><section class="auth-card">${showBrand ? `<a class="auth-brand" href="/">🦌 Deerblog</a>` : ""}${body}</section></main>`;
  return mainShell({
    title: `${title} – ${SITE_NAME}`,
    description,
    canonical: `${origin}${path}`,
    origin,
    user,
    csrf,
    body: content,
    bodyClass: "auth",
  });
}

export function renderSignupStep1({ values, errors, user, origin, csrf }) {
  const errorHtml = errors.length ? `<div class="error-box">${errors.map((e) => `<p>${esc(e)}</p>`).join("")}</div>` : "";
  const body = `<p class="eyebrow">Step 1 of 2</p><h1>Make a blog</h1><p class="auth-note">Pick a title and address. You can change both later.</p>${errorHtml}
<form method="post" action="/signup/" class="form">
  ${csrfField(csrf)}
  <label>Blog title<input name="title" value="${esc(values.title || "")}" required maxlength="200" placeholder="Field notes"></label>
  <label>Subdomain<div class="input-prefix"><input name="subdomain" value="${esc(values.subdomain || "")}" required pattern="[a-z0-9][a-z0-9-]{1,30}" placeholder="fieldnotes"><span>.${esc(new URL(origin).hostname)}</span></div></label>
  <label>Some homepage text<textarea name="content" rows="7" required placeholder="A quiet place for notes…">${esc(values.content || "")}</textarea></label>
  <button class="button" type="submit">Continue</button>
</form>
<p class="auth-foot">Already have an account? <a href="/login/">Log in</a></p>`;
  return renderAuth({ title: "Sign up", description: "Start a blog on Deerblog.", body, user, origin, csrf, path: "/signup/" });
}

export function renderSignupStep2({ values, errors, user, origin, csrf }) {
  const errorHtml = errors.length ? `<div class="error-box">${errors.map((e) => `<p>${esc(e)}</p>`).join("")}</div>` : "";
  const hidden = ["title", "subdomain", "content"]
    .map((key) => `<input type="hidden" name="${key}" value="${esc(values[key] || "")}">`)
    .join("");
  const body = `<p class="eyebrow">Step 2 of 2</p><h1>Create your account</h1><p class="auth-note">Your blog <strong>${esc(values.title)}</strong> will live at <code>${esc(values.subdomain)}.${esc(new URL(origin).hostname)}</code>.</p>${errorHtml}
<form method="post" action="/signup/" class="form">
  ${csrfField(csrf)}${hidden}
  <label>Email<input type="email" name="email" value="${esc(values.email || "")}" required autocomplete="email" maxlength="254"></label>
  <label>Password<input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
  <p class="field-note">At least 8 characters. This local demo stores a scrypt hash, never the password.</p>
  <label class="check"><input type="checkbox" name="agree" required> I understand this is a local demo and agree to the local terms.</label>
  <button class="button" type="submit">Create blog</button>
</form>
<p class="auth-foot"><a href="/signup/">← Change blog details</a></p>`;
  return renderAuth({ title: "Create account", description: "Create a Deerblog account.", body, user, origin, csrf, path: "/signup/" });
}

export function renderLogin({ email = "", error = "", next = "", user, origin, csrf, notice = "" }) {
  const body = `${error ? `<div class="error-box"><p>${esc(error)}</p></div>` : ""}${notice ? `<p class="notice">${esc(notice)}</p>` : ""}
<h1>Log in</h1>
<form method="post" action="/login/" class="form">
  ${csrfField(csrf)}
  ${next ? `<input type="hidden" name="next" value="${esc(next)}">` : ""}
  <label>Email<input type="email" name="email" value="${esc(email)}" required autocomplete="email"></label>
  <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
  <button class="button" type="submit">Log in</button>
</form>
<p class="auth-foot"><a href="/forgot/">Forgot your password?</a> · <a href="/signup/">Create a blog</a></p>
<p class="demo-hint">Demo account: <code>demo@deerblog.test</code> / <code>deerblog123</code></p>`;
  return renderAuth({ title: "Log in", description: "Log in to Deerblog.", body, user, origin, csrf, path: "/login/" });
}

export function renderForgot({ error = "", link = "", user, origin, csrf }) {
  const body = `<h1>Reset password</h1>${error ? `<div class="error-box"><p>${esc(error)}</p></div>` : ""}
<p>Enter the email you signed up with.</p>
<form method="post" action="/forgot/" class="form">${csrfField(csrf)}<label>Email<input type="email" name="email" required autocomplete="email"></label><button class="button" type="submit">Send reset link</button></form>
${link ? `<div class="notice"><p>Local demo: no email is sent. Use this link:</p><p><a href="${esc(link)}">${esc(link)}</a></p></div>` : ""}
<p class="auth-foot"><a href="/login/">Back to log in</a></p>`;
  return renderAuth({ title: "Reset password", description: "Reset your Deerblog password.", body, user, origin, csrf, path: "/forgot/" });
}

export function renderReset({ token, error = "", user, origin, csrf }) {
  const body = `<h1>Choose a new password</h1>${error ? `<div class="error-box"><p>${esc(error)}</p></div>` : ""}
<form method="post" action="/reset/" class="form">${csrfField(csrf)}<input type="hidden" name="token" value="${esc(token)}"><label>New password<input type="password" name="password" required minlength="8" autocomplete="new-password"></label><button class="button" type="submit">Update password</button></form>`;
  return renderAuth({ title: "New password", description: "Set a new Deerblog password.", body, user, origin, csrf, path: "/reset/" });
}

export function renderMain404({ user, origin, csrf }) {
  const body = `<main class="narrow"><h1>404</h1><p>There is no page at this address.</p><p><a href="/">Go home</a> · <a href="/discover/">Discover blogs</a></p></main>`;
  return mainShell({
    title: "404 – Deerblog",
    description: "Not found",
    canonical: `${origin}/404/`,
    origin,
    user,
    csrf,
    body,
    bodyClass: "not-found",
  });
}

export function renderAbout({ user, origin, csrf }) {
  const body = `<main class="narrow prose"><p class="eyebrow">About this build</p><h1>How Deerblog works</h1>
<p>Deerblog is an original, local implementation of the core workflows of a calm multi-tenant blog platform. It is not affiliated with Bear Blog and does not include its source code or assets.</p>
<h2>The shape of a request</h2>
<ol><li>The <code>Host</code> header decides whether this is the main site, a blog subdomain, or a custom domain.</li><li>A subdomain is looked up in the blog table. The blog’s owner, settings, and posts are loaded.</li><li>Public pages are rendered to HTML on the server. The browser gets one stylesheet.</li><li>Dashboard routes require a session cookie, an owner check, and a CSRF token on every write.</li></ol>
<h2>What is intentionally local-only</h2>
<p>Email is printed to the page instead of delivered, payments are simulated, and custom domains rely on a local hosts file. The project README and <code>ENGINEERING.md</code> describe the production gaps in detail.</p>
<p><a href="/signup/">Create a blog</a></p></main>`;
  return mainShell({
    title: "How Deerblog works",
    description: "Architecture notes for the Deerblog local study.",
    canonical: `${origin}/about/`,
    origin,
    user,
    csrf,
    body,
    bodyClass: "about-page",
  });
}
