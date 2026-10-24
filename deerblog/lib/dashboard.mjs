import { escapeHtml as esc } from "./markdown.mjs";
import { displayDate } from "./dates.mjs";
import { SITE_NAME } from "./public.mjs";
import { blogOrigin } from "./web.mjs";

export function dashboardPath(blog, suffix = "") {
  return `/${blog.subdomain}/dashboard${suffix ? `/${String(suffix).replace(/^\/+/, "")}` : "/"}`;
}

const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${esc(csrf)}">`;

function header({ user, title, subtitle = "", actions = "" }) {
  return `<header class="dash-header">
  <div><p class="eyebrow">Dashboard</p><h1>${esc(title)}</h1>${subtitle ? `<p class="dash-subtitle">${subtitle}</p>` : ""}</div>
  <div class="dash-header-actions">${actions}</div>
</header>`;
}

function navFor(user, blog, active) {
  const item = (href, label, key, badge = "") =>
    `<a class="dash-link ${active === key ? "is-active" : ""}" href="${esc(href)}">${esc(label)}${badge ? `<span class="dash-badge">${esc(badge)}</span>` : ""}</a>`;
  if (!blog) {
    return `<nav class="dash-nav">
  <p class="dash-nav-label">Account</p>
  ${item("/dashboard/", "Your blogs", "blogs")}
  ${item("/dashboard/account/", "Account", "account")}
  ${item("/dashboard/upgrade/", "Plan", "upgrade")}
  <p class="dash-nav-label">Explore</p>
  ${item("/discover/", "Discover", "discover")}
  ${item("/about/", "How it works", "about")}
</nav>`;
  }
  const base = dashboardPath(blog);
  return `<nav class="dash-nav">
  <p class="dash-nav-label">${esc(blog.subdomain)}</p>
  ${item(base, "Home", "home")}
  ${item(`${base}posts/`, "Posts", "posts")}
  ${item(`${base}pages/`, "Pages", "pages")}
  ${item(`${base}media/`, "Media", "media")}
  <p class="dash-nav-label">Audience</p>
  ${item(`${base}analytics/`, "Analytics", "analytics")}
  ${item(`${base}subscribers/`, "Subscribers", "subscribers", user.plan === "pro" ? "" : "Pro")}
  <p class="dash-nav-label">Blog</p>
  ${item(`${base}settings/`, "Settings", "settings")}
  ${item(`${base}appearance/`, "Appearance", "appearance")}
  ${item(`${base}nav/`, "Navigation", "nav")}
  ${item(`${base}directives/`, "Header & footer", "directives")}
  ${item(`${base}post-template/`, "Post template", "post-template")}
  ${item(`${base}domain/`, "Custom domain", "domain", user.plan === "pro" ? "" : "Pro")}
  <p class="dash-nav-label">Account</p>
  ${item("/dashboard/", "All blogs", "blogs")}
  ${item("/dashboard/account/", "Account", "account")}
</nav>`;
}

function shell({ user, blog, title, subtitle = "", active = "", body, csrf, mainOrigin, error = "", notice = "", actions = "", wide = false }) {
  const view = blog ? `<a class="button ghost small" href="${esc(`/b/${blog.subdomain}/`)}" target="_blank" rel="noopener">View blog</a>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} – ${SITE_NAME}</title>
<meta name="csrf-token" content="${esc(csrf)}">
<link rel="icon" href="/assets/deer.svg">
<link rel="stylesheet" href="/assets/deer.css">
</head>
<body class="deer dashboard ${wide ? "wide" : ""}">
<div class="dash-shell">
  <aside class="dash-side">
    <a class="dash-brand" href="/dashboard/"><span aria-hidden="true">🦌</span> Deerblog</a>
    ${navFor(user, blog, active)}
    <div class="dash-side-foot">
      <span>${esc(user.email)}</span>
      <form method="post" action="/logout/" class="inline-form">${csrfField(csrf)}<button class="link-button" type="submit">Log out</button></form>
    </div>
  </aside>
  <div class="dash-content">
    <div class="dash-topline">
      <div>${blog ? `<a href="${esc(dashboardPath(blog))}">${esc(blog.title)}</a><span class="slash">/</span><span>${esc(blog.subdomain)}</span>` : `<span>${esc(user.email)}</span>`}</div>
      <div class="dash-top-actions">${view}<a class="button small" href="${esc(blog ? `${dashboardPath(blog)}posts/new/` : "/dashboard/")}">${blog ? "New post" : "New blog"}</a></div>
    </div>
    ${error ? `<div class="error-box"><p>${esc(error)}</p></div>` : ""}
    ${notice ? `<div class="notice"><p>${esc(notice)}</p></div>` : ""}
    <div class="dash-main">
      ${header({ user, title, subtitle, actions })}
      ${body}
    </div>
  </div>
</div>
<script src="/assets/app.js" defer></script>
</body>
</html>`;
}

export function renderBlogList({ user, blogs, csrf, mainOrigin, error, notice }) {
  const cards = blogs
    .map(
      (blog) => `<article class="blog-card">
  <div><h2><a href="${esc(dashboardPath(blog))}">${esc(blog.title)}</a></h2><p class="muted">${esc(blog.subdomain)}.${esc(new URL(mainOrigin).hostname)}</p></div>
  <div class="card-actions"><a class="button small" href="${esc(dashboardPath(blog))}">Edit</a><a class="button ghost small" href="/b/${esc(blog.subdomain)}/" target="_blank" rel="noopener">View</a></div>
</article>`,
    )
    .join("");
  const canCreate = blogs.length < (user.maxBlogs || 1);
  const form = canCreate
    ? `<form method="post" action="/dashboard/blogs/" class="card form-card">${csrfField(csrf)}<h2>Create another blog</h2><label>Title<input name="title" required maxlength="200" placeholder="A new field notebook"></label><label>Subdomain<input name="subdomain" required pattern="[a-z0-9][a-z0-9-]{1,30}" placeholder="second-blog"></label><button class="button" type="submit">Create blog</button></form>`
    : `<div class="card"><h2>Blog limit reached</h2><p>Your plan allows ${user.maxBlogs || 1} blog${(user.maxBlogs || 1) === 1 ? "" : "s"}. <a href="/dashboard/upgrade/">Upgrade locally</a> to make more.</p></div>`;
  const body = `<div class="blog-grid">${cards}</div>${form}`;
  return shell({
    user,
    blog: null,
    title: "Your blogs",
    subtitle: "Every account can own more than one blog. This local build gates the number by plan.",
    active: "blogs",
    body,
    csrf,
    mainOrigin,
    error,
    notice,
  });
}

export function renderAccount({ user, csrf, mainOrigin, error, notice }) {
  const body = `<div class="stack">
<form method="post" action="/dashboard/account/" class="card form-card">${csrfField(csrf)}<input type="hidden" name="action" value="email"><h2>Email</h2><label>Email address<input type="email" name="email" value="${esc(user.email)}" required maxlength="254"></label><button class="button" type="submit">Update email</button></form>
<form method="post" action="/dashboard/account/" class="card form-card">${csrfField(csrf)}<input type="hidden" name="action" value="password"><h2>Password</h2><label>Current password<input type="password" name="current" required autocomplete="current-password"></label><label>New password<input type="password" name="password" required minlength="8" autocomplete="new-password"></label><button class="button" type="submit">Change password</button><p class="field-note">Changing your password signs out every other session.</p></form>
<div class="card danger-card"><h2>Delete account</h2><p>This removes the account, every blog, every post, every upload, and every subscriber. It cannot be undone.</p><form method="post" action="/dashboard/account/" class="inline-form" data-confirm="Delete this account and every blog it owns?">${csrfField(csrf)}<input type="hidden" name="action" value="delete"><label>Type <code>${esc(user.email)}</code> to confirm<input name="confirm" required autocomplete="off"></label><button class="button danger" type="submit">Delete account</button></form></div>
</div>`;
  return shell({
    user,
    blog: null,
    title: "Account",
    subtitle: "Identity and recovery for your Deerblog account.",
    active: "account",
    body,
    csrf,
    mainOrigin,
    error,
    notice,
  });
}

export function renderUpgrade({ user, csrf, mainOrigin, notice, error = "" }) {
  const pro = user.plan === "pro";
  const body = `<div class="card plan-card">
<p class="eyebrow">${pro ? "Current plan" : "Free plan"}</p>
<h2>${pro ? "Deer Pro (local demo)" : "Deer Free"}</h2>
<p>${pro ? "You can create up to 10 blogs, use a custom domain, and keep an email subscriber list." : "One blog, unlimited posts, analytics, feeds, and Markdown exports. Upgrade locally to unlock more blogs, custom domains, and subscribers."}</p>
<ul><li>${pro ? "10" : "1"} blog${pro ? "s" : ""}</li><li>Custom domain ${pro ? "enabled" : "locked"}</li><li>Email subscribers ${pro ? "enabled" : "locked"}</li><li>No payment is taken in this build</li></ul>
<form method="post" action="/dashboard/upgrade/">${csrfField(csrf)}<input type="hidden" name="plan" value="${pro ? "free" : "pro"}"><button class="button" type="submit">${pro ? "Switch to free (demo)" : "Enable Pro locally"}</button></form>
<p class="field-note">A real platform would connect Stripe or Paddle here, with idempotent webhooks and plan enforcement on the server.</p>
</div>`;
  return shell({
    user,
    blog: null,
    title: "Plan",
    subtitle: "The plan model exists; payment collection is deliberately out of scope for the local build.",
    active: "upgrade",
    body,
    csrf,
    mainOrigin,
    notice,
    error,
  });
}

export function renderStudioHome({ user, blog, raw, csrf, mainOrigin, error, notice }) {
  const body = `<form method="post" action="${esc(dashboardPath(blog))}" class="editor-form">
<div class="editor-toolbar"><button class="button" type="submit">Save homepage</button><a class="button ghost small" href="/b/${esc(blog.subdomain)}/" target="_blank" rel="noopener">View</a><span class="toolbar-note">Header lines, blank line, then Markdown.</span></div>
<div class="editor-shell">
<textarea name="raw" class="editor-area" spellcheck="true" aria-label="Blog homepage source">${esc(raw)}</textarea>
</div>
<details class="editor-help" open><summary>Homepage header</summary><pre>title: ${esc(blog.title)}
favicon: ${esc(blog.favicon || "🦌")}
meta_description: ${esc(blog.metaDescription || "")}
meta_image: ${esc(blog.metaImage || "")}

Your Markdown homepage starts here.</pre></details>
</form>`;
  return shell({
    user,
    blog,
    title: "Home",
    subtitle: `Editing the front page of ${blog.title}.`,
    active: "home",
    body,
    csrf,
    mainOrigin,
    error,
    notice,
    wide: true,
  });
}

export function renderPostsList({ user, blog, posts, csrf, mainOrigin, error, notice, pages = false }) {
  const rows = posts
    .map(
      (post) => `<tr>
  <td><a href="${esc(dashboardPath(blog, `posts/${post.uid}/`))}">${esc(post.title)}</a></td>
  <td><span class="status ${post.publish ? "published" : "draft"}">${post.publish ? "Published" : "Draft"}</span></td>
  <td>${esc(post.isPage ? "Page" : "Post")}</td>
  <td>${esc(post.publishedDate ? displayDate(post.publishedDate, blog) : "—")}</td>
  <td>${esc(post.tags?.slice(0, 3).join(", ") || "")}</td>
</tr>`,
    )
    .join("");
  const body = `<div class="table-card"><table class="post-table"><thead><tr><th>Title</th><th>Status</th><th>Type</th><th>Date</th><th>Tags</th></tr></thead><tbody>${rows || `<tr><td colspan="5">No ${pages ? "pages" : "posts"} yet.</td></tr>`}</tbody></table></div>
<p><a class="button" href="${esc(dashboardPath(blog, "posts/new/"))}${pages ? "?is_page=1" : ""}">New ${pages ? "page" : "post"}</a></p>`;
  return shell({
    user,
    blog,
    title: pages ? "Pages" : "Posts",
    subtitle: pages ? "Pages are published like posts, but stay out of the feed and blog index." : "Draft, publish, edit, and keep the raw Markdown close.",
    active: pages ? "pages" : "posts",
    body,
    csrf,
    mainOrigin,
    error,
    notice,
  });
}

export function renderEditor({ user, blog, post, raw, csrf, mainOrigin, error, notice, pageMode = false }) {
  const isNew = !post?.id;
  const publish = post?.publish;
  const previewHref = post?.id && !publish && post.previewToken
    ? `${blogOrigin(blog)}/${post.slug}/?preview=${encodeURIComponent(post.previewToken)}`
    : "";
  const body = `<form method="post" action="${esc(isNew ? dashboardPath(blog, "posts/new/") : dashboardPath(blog, `posts/${post.uid}/`))}" class="editor-form">
<input type="hidden" name="is_page" value="${pageMode || post?.isPage ? "1" : "0"}">
<input type="hidden" name="preview_uid" value="${esc(post?.uid || "")}">
<div class="editor-toolbar">
  <button class="button" type="submit" name="publish" value="true">${publish ? "Update" : "Publish"}</button>
  ${publish ? `<button class="button ghost" type="submit" name="publish" value="false">Unpublish</button>` : `<button class="button ghost" type="submit" name="publish" value="false">Save draft</button>`}
  <button class="button ghost" type="submit" formaction="${esc(dashboardPath(blog, "preview/"))}" formtarget="_blank">Preview</button>
  <a class="button ghost small" href="${esc(dashboardPath(blog, post?.isPage ? "pages/" : "posts/"))}">← Back</a>
  <span class="toolbar-spacer"></span>
  ${previewHref ? `<a class="button ghost small" href="${esc(previewHref)}" target="_blank" rel="noopener">Draft link</a><button class="button ghost small" type="button" data-copy="${esc(previewHref)}">Copy link</button>` : ""}
  ${post?.id ? `<button class="button danger small" type="submit" form="delete-post">Delete</button>` : ""}
</div>
<div class="editor-tools">
  <label class="upload-label">Insert media<input type="file" class="upload-input" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" data-upload-endpoint="${esc(dashboardPath(blog, "media/upload/"))}"></label>
  <span class="toolbar-note">${isNew ? "A new post starts as a draft unless you publish it." : `Last modified ${esc(displayDate(post.lastModified, blog))}`}</span>
</div>
<div class="editor-shell"><textarea id="post-editor" name="raw" class="editor-area" spellcheck="true" aria-label="Post source">${esc(raw)}</textarea></div>
<details class="editor-help"><summary>Post header attributes</summary><pre>title: My post
link: my-post
alias: old/path
published_date: 2026-01-20 09:30
tags: writing, notes
meta_description: A short summary for search and social.
canonical_url: https://example.com/original
is_page: false
discoverable: true

The Markdown body starts after a blank line.</pre></details>
</form>
${post?.id ? `<form id="delete-post" method="post" action="${esc(dashboardPath(blog, `posts/${post.uid}/delete/`))}" data-confirm="Delete this post permanently?">${csrfField(csrf)}</form>` : ""}`;
  return shell({
    user,
    blog,
    title: isNew ? (pageMode ? "New page" : "New post") : "Edit post",
    subtitle: isNew ? "Write a raw header, then the body. Publish when it is ready." : post.title,
    active: post?.isPage || pageMode ? "pages" : "posts",
    body,
    csrf,
    mainOrigin,
    error,
    notice,
    wide: true,
  });
}

export function renderSettings({ user, blog, csrf, mainOrigin, error, notice }) {
  const body = `<form method="post" action="${esc(dashboardPath(blog, "settings/"))}" class="card form-card">${csrfField(csrf)}
<h2>Blog details</h2>
<div class="field-grid">
<label>Title<input name="title" value="${esc(blog.title)}" required maxlength="200"></label>
<label>Subdomain<input name="subdomain" value="${esc(blog.subdomain)}" required pattern="[a-z0-9][a-z0-9-]{1,30}"></label>
<label>Language<input name="lang" value="${esc(blog.lang)}" maxlength="10"></label>
<label>Blog path<input name="blog_path" value="${esc(blog.blogPath)}" pattern="[a-z0-9][a-z0-9-]*" placeholder="blog"></label>
<label>Date format<input name="date_format" value="${esc(blog.dateFormat)}" maxlength="32"><span class="field-note">Django-style: d M, Y · j F Y · Y-m-d</span></label>
<label>RSS alias<input name="rss_alias" value="${esc(blog.rssAlias || "")}" maxlength="100" placeholder="feed"></label>
</div>
<h2>Discovery</h2>
<label class="check"><input type="checkbox" name="analytics_active" ${blog.analyticsActive ? "checked" : ""}> Collect privacy-friendly page views</label>
<label>Meta tag (raw, optional)<textarea name="meta_tag" rows="3">${esc(blog.metaTag || "")}</textarea></label>
<label>robots.txt<textarea name="robots_txt" rows="4">${esc(blog.robotsTxt || "User-agent: *\nAllow: /")}</textarea></label>
<button class="button" type="submit">Save settings</button>
</form>
<div class="card"><h2>Export</h2><p>Take your writing with you. Markdown export is a ZIP of one file per post, including the raw attributes.</p><p><a class="button ghost small" href="${esc(dashboardPath(blog, "settings/"))}?export=csv">Export posts CSV</a> <a class="button ghost small" href="${esc(dashboardPath(blog, "settings/"))}?export=md">Export Markdown ZIP</a></p></div>
<div class="card danger-card"><h2>Delete this blog</h2><p>This permanently removes every post, page, upload, subscriber, and analytics row for <strong>${esc(blog.title)}</strong>. Your account stays.</p><form method="post" action="${esc(dashboardPath(blog, "delete/"))}" data-confirm="Delete this blog and all of its content?">${csrfField(csrf)}<label>Type <code>${esc(blog.subdomain)}</code> to confirm<input name="confirm" required autocomplete="off"></label><button class="button danger" type="submit">Delete blog</button></form></div>`;
  return shell({
    user,
    blog,
    title: "Settings",
    subtitle: "Address, language, feeds, and discovery.",
    active: "settings",
    body,
    csrf,
    mainOrigin,
    error,
    notice,
  });
}

export function renderAppearance({ user, blog, csrf, mainOrigin, error, notice }) {
  const themes = [
    ["default", "Default — warm paper, serif"],
    ["paper", "Paper — quiet, compact"],
    ["terminal", "Terminal — monospace, green"],
    ["rose", "Rose — soft, editorial"],
    ["forest", "Forest — green, earthy"],
  ];
  const body = `<form method="post" action="${esc(dashboardPath(blog, "appearance/"))}" class="card form-card">${csrfField(csrf)}
<h2>Theme</h2>
<label>Preset<select name="theme">${themes.map(([value, label]) => `<option value="${value}" ${blog.theme === value ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
<label class="check"><input type="checkbox" name="overwrite_styles" ${blog.overwriteStyles ? "checked" : ""}> Do not apply preset variables (custom CSS is in charge)</label>
<h2>Custom CSS</h2>
<label>Appended after the theme stylesheet<textarea name="custom_styles" rows="14" class="code-area">${esc(blog.customStyles || "")}</textarea></label>
<button class="button" type="submit">Save appearance</button>
<p class="field-note">Custom CSS is written by the blog owner. A production platform must scope it carefully, strip <code>&lt;/style&gt;</code>, and isolate tenants on separate origins.</p>
</form>`;
  return shell({
    user,
    blog,
    title: "Appearance",
    subtitle: "A small theme system, plus an escape hatch.",
    active: "appearance",
    body,
    csrf,
    mainOrigin,
    error,
    notice,
  });
}

export function renderNav({ user, blog, csrf, mainOrigin, error, notice }) {
  const body = `<form method="post" action="${esc(dashboardPath(blog, "nav/"))}" class="card form-card">${csrfField(csrf)}<h2>Navigation</h2><p>Markdown links, one line or many. They are rendered in the blog header.</p><textarea name="nav" rows="8" class="code-area">${esc(blog.nav || "")}</textarea><p class="field-note">Example: <code>[Home](/) [About](/about/) [Blog](/blog/)</code></p><button class="button" type="submit">Save navigation</button></form>`;
  return shell({
    user,
    blog,
    title: "Navigation",
    subtitle: "The links at the top of every public page.",
    active: "nav",
    body,
    csrf,
    mainOrigin,
    error,
    notice,
  });
}

export function renderDirectives({ user, blog, csrf, mainOrigin, error, notice }) {
  const body = `<form method="post" action="${esc(dashboardPath(blog, "directives/"))}" class="stack">${csrfField(csrf)}
<div class="card form-card"><h2>Header directive</h2><p>Raw HTML injected into the document head. Only enable this for code you trust.</p><textarea name="header_directive" rows="8" class="code-area">${esc(blog.headerDirective || "")}</textarea></div>
<div class="card form-card"><h2>Footer directive</h2><p>Markdown or HTML rendered above the Deerblog footer.</p><textarea name="footer_directive" rows="8" class="code-area">${esc(blog.footerDirective || "")}</textarea></div>
<button class="button" type="submit">Save directives</button>
<p class="field-note">This is the most dangerous feature in any blogging platform. A blog on a shared origin could run JavaScript in another blog’s origin; Deerblog isolates blogs by hostname and sandboxes path-based previews.</p>
</form>`;
  return shell({
    user,
    blog,
    title: "Header & footer",
    subtitle: "Raw directives for analytics snippets, fonts, or a small signature.",
    active: "directives",
    body,
    csrf,
    mainOrigin,
    error,
    notice,
  });
}

export function renderPostTemplate({ user, blog, csrf, mainOrigin, error, notice }) {
  const body = `<form method="post" action="${esc(dashboardPath(blog, "post-template/"))}" class="card form-card">${csrfField(csrf)}<h2>Post template</h2><p>This pre-populates every new post. Separate the header from the body with <code>___</code>.</p><textarea name="post_template" rows="18" class="code-area">${esc(blog.postTemplate || "")}</textarea><button class="button" type="submit">Save template</button></form>`;
  return shell({
    user,
    blog,
    title: "Post template",
    subtitle: "Start every post with the same shape.",
    active: "post-template",
    body,
    csrf,
    mainOrigin,
    error,
    notice,
  });
}

export function renderDomain({ user, blog, csrf, mainOrigin, error, notice }) {
  const body = `<div class="card form-card"><h2>Custom domain</h2>
<p>Current address: <code>${esc(blog.subdomain)}.${esc(new URL(mainOrigin).hostname)}</code></p>
${user.plan === "pro" ? `<form method="post" action="${esc(dashboardPath(blog, "domain/"))}">${csrfField(csrf)}<label>Domain<input name="domain" value="${esc(blog.domain || "")}" placeholder="notes.example.com"></label><button class="button" type="submit">Save domain</button><p class="field-note">For local testing, add <code>127.0.0.1 notes.example.com</code> to <code>/etc/hosts</code>, then visit <code>http://notes.example.com:${esc(new URL(mainOrigin).port || "8787")}</code>.</p></form>` : `<p>Custom domains are part of Deer Pro. <a href="/dashboard/upgrade/">Enable Pro locally</a> to try the flow.</p>`}
</div>
<div class="card"><h2>What DNS does in production</h2><p>The blog owner creates a CNAME from their domain to the platform, the platform verifies ownership, issues a certificate through ACME, and routes by the <code>Host</code> header. None of that can be simulated by an HTML form alone.</p></div>`;
  return shell({
    user,
    blog,
    title: "Custom domain",
    subtitle: "A host-header route, with a real DNS and TLS story in production.",
    active: "domain",
    body,
    csrf,
    mainOrigin,
    error,
    notice,
  });
}

export function renderMedia({ user, blog, uploads, csrf, mainOrigin, error, notice }) {
  const cards = uploads
    .map(
      (file) => `<figure class="media-card"><img src="${esc(file.url)}" alt="${esc(file.originalName || file.filename)}" loading="lazy"><figcaption><span>${esc(file.filename)}</span><span class="muted">${Math.max(1, Math.round(file.bytes / 1024))} KB</span></figcaption><div class="media-actions"><button type="button" class="button ghost small" data-copy="${esc(new URL(file.url, mainOrigin).href)}">Copy URL</button><form method="post" action="${esc(dashboardPath(blog, `media/${file.id}/delete/`))}" class="inline-form" data-confirm="Delete this file?">${csrfField(csrf)}<button class="button danger small" type="submit">Delete</button></form></div></figure>`,
    )
    .join("");
  const body = `<div class="card form-card"><h2>Upload an image</h2><p>PNG, JPEG, GIF, WebP, or AVIF. Up to 10 MB. The file is stored under this blog’s namespace.</p><form class="upload-form" action="${esc(dashboardPath(blog, "media/upload/"))}" method="post" enctype="multipart/form-data" data-upload-endpoint="${esc(dashboardPath(blog, "media/upload/"))}">${csrfField(csrf)}<input type="file" name="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" required><button class="button" type="submit">Upload</button><p class="upload-status" role="status"></p></form></div>
<div class="media-grid">${cards || `<div class="empty-state"><p>No media yet. Upload the first image.</p></div>`}</div>
<p class="field-note">A real deployment would move these bytes to object storage, strip EXIF, generate responsive sizes, and scan for malware.</p>`;
  return shell({
    user,
    blog,
    title: "Media",
    subtitle: "Files uploaded for this blog, with a copyable URL.",
    active: "media",
    body,
    csrf,
    mainOrigin,
    error,
    notice,
    wide: true,
  });
}

export function renderAnalytics({ user, blog, stats, csrf, mainOrigin, error, notice }) {
  const max = Math.max(1, ...stats.days.map((d) => d.count));
  const bars = stats.days
    .map((day) => `<div class="bar-wrap" title="${esc(day.label)}: ${day.count} views"><div class="bar" style="height:${Math.max(2, Math.round((day.count / max) * 100))}%"></div><span>${esc(day.short)}</span></div>`)
    .join("");
  const rows = (items, key = "name") =>
    items.length
      ? `<table class="mini-table"><tbody>${items.map((item) => `<tr><td>${esc(item[key])}</td><td>${item.count}</td></tr>`).join("")}</tbody></table>`
      : `<p class="muted">No data yet.</p>`;
  const body = `${blog.analyticsActive ? "" : `<div class="notice"><p>Analytics collection is disabled in Settings. Historic data is still shown.</p></div>`}
<div class="stat-grid">
  <div class="stat"><span>Views · 30 days</span><strong>${stats.total}</strong></div>
  <div class="stat"><span>Unique visitors</span><strong>${stats.unique}</strong></div>
  <div class="stat"><span>Top post</span><strong class="small-stat">${esc(stats.topPost || "—")}</strong></div>
</div>
<div class="card"><h2>Last 14 days</h2><div class="chart">${bars || '<p class="muted">No views yet.</p>'}</div></div>
<div class="grid-2">
  <div class="card"><h2>Top pages</h2>${rows(stats.paths)}</div>
  <div class="card"><h2>Referrers</h2>${rows(stats.referrers)}</div>
  <div class="card"><h2>Devices</h2>${rows(stats.devices)}</div>
  <div class="card"><h2>Browsers</h2>${rows(stats.browsers)}</div>
</div>
<p class="field-note">No cookies, no fingerprinting, and no raw IPs. An IP is hashed with a server secret for deduplication and discarded on rotation.</p>`;
  return shell({
    user,
    blog,
    title: "Analytics",
    subtitle: "Server-side page views, aggregated for the dashboard.",
    active: "analytics",
    body,
    csrf,
    mainOrigin,
    error,
    notice,
  });
}

export function renderSubscribers({ user, blog, subscribers, csrf, mainOrigin, error, notice }) {
  if (user.plan !== "pro") {
    const body = `<div class="card"><p class="eyebrow">Deer Pro</p><h2>Email subscribers</h2><p>Collect email addresses from a form on your blog, export them as CSV or text, and use them with your own email provider.</p><p>The demo account has Pro enabled. <a href="/dashboard/upgrade/">Enable Pro locally</a> to try this page.</p></div>`;
    return shell({ user, blog, title: "Subscribers", active: "subscribers", body, csrf, mainOrigin, error, notice });
  }
  const rows = subscribers
    .map(
      (sub) => `<tr><td>${esc(sub.email)}</td><td>${esc(displayDate(sub.createdAt, blog))}</td><td><form method="post" action="${esc(dashboardPath(blog, "subscribers/"))}" class="inline-form">${csrfField(csrf)}<input type="hidden" name="remove" value="${esc(sub.id)}"><button class="link-button danger-text" type="submit">Remove</button></form></td></tr>`,
    )
    .join("");
  const body = `<div class="table-card"><table class="post-table"><thead><tr><th>Email</th><th>Subscribed</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="3">No subscribers yet.</td></tr>'}</tbody></table></div>
<div class="card form-card"><h2>Add subscribers in bulk</h2><form method="post" action="${esc(dashboardPath(blog, "subscribers/"))}">${csrfField(csrf)}<label>One email per line<textarea name="emails" rows="6"></textarea></label><button class="button" type="submit">Add emails</button></form></div>
<p><a class="button ghost" href="${esc(dashboardPath(blog, "subscribers/export.csv/"))}">Export CSV</a> <a class="button ghost" href="${esc(dashboardPath(blog, "subscribers/export.txt/"))}">Export text</a></p>
<p class="field-note">Deerblog stores the list but does not send email. See the README for SPF, DKIM, DMARC, double opt-in, unsubscribe, bounce, and complaint handling.</p>`;
  return shell({
    user,
    blog,
    title: "Subscribers",
    subtitle: `${subscribers.length} email subscriber${subscribers.length === 1 ? "" : "s"}.`,
    active: "subscribers",
    body,
    csrf,
    mainOrigin,
    error,
    notice,
  });
}

export function renderDashboard404({ user, csrf, mainOrigin }) {
  const body = `<div class="card"><h1>Not found</h1><p>That page does not exist, or it belongs to another account.</p><p><a href="/dashboard/">Back to your blogs</a></p></div>`;
  return shell({ user, blog: null, title: "Not found", active: "", body, csrf, mainOrigin });
}
