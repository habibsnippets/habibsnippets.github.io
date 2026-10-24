import { escapeHtml } from "./markdown.mjs";
import { displayDate } from "./dates.mjs";

/* Bear-style template directives. They are resolved after Markdown rendering,
   outside <pre> and <code>, so a tutorial can safely show the syntax. */
export function applyDirectives(html, ctx) {
  const protectedBlocks = [];
  let output = String(html).replace(/<(pre|code)\b[\s\S]*?<\/\1>/gi, (block) => {
    const key = `\u0001DEER_PROTECTED_${protectedBlocks.length}\u0001`;
    protectedBlocks.push(block);
    return key;
  });

  output = output.replace(/\{\{\s*([\s\S]*?)\s*\}\}/g, (whole, expression) => {
    try {
      const replacement = resolve(expression, ctx);
      return replacement === null ? whole : replacement;
    } catch {
      return whole;
    }
  });

  output = output.replace(/<p>\s*(<ul class="deer-posts">[\s\S]*?<\/ul>)\s*<\/p>/g, "$1");
  output = output.replace(/<p>\s*(<form class="deer-subscribe">[\s\S]*?<\/form>)\s*<\/p>/g, "$1");

  for (let i = 0; i < protectedBlocks.length; i++) {
    output = output.replace(`\u0001DEER_PROTECTED_${i}\u0001`, protectedBlocks[i]);
  }
  return output;
}

function resolve(expression, ctx) {
  const { blog, post } = ctx;
  const text = String(expression).trim();

  if (/^email[-_]signup$/.test(text)) {
    return `<form class="deer-subscribe" action="${escapeHtml(ctx.prefix)}/email-subscribe/" method="post"><label>Get new posts by email<input type="email" name="email" placeholder="you@example.com" required autocomplete="email"></label><button type="submit">Subscribe</button></form>`;
  }

  if (/^posts\b/.test(text)) {
    return renderPostList(text.slice(5), ctx);
  }

  if (text === "next_post" || text === "previous_post") {
    return renderAdjacent(text, ctx);
  }

  if (text === "blog_title") return escapeHtml(blog.title || "");
  if (text === "blog_description") return escapeHtml(blog.metaDescription || "");
  if (text === "blog_link") return escapeHtml(ctx.blogHref());
  if (text === "blog_created_date") return escapeHtml(displayDate(blog.createdAt, blog));
  if (text === "blog_last_modified") return escapeHtml(displayDate(blog.lastModified, blog));
  if (text === "blog_last_posted") {
    const latest = ctx.publicPosts?.[0];
    return escapeHtml(latest ? displayDate(latest.publishedDate, blog) : "");
  }
  if (text === "tags") return renderTags(ctx);
  if (text === "post_title") return escapeHtml(post?.title || "");
  if (text === "post_description") return escapeHtml(post?.metaDescription || "");
  if (text === "post_published_date") return escapeHtml(post?.publishedDate ? displayDate(post.publishedDate, blog) : "");
  if (text === "post_last_modified") return escapeHtml(post?.lastModified ? displayDate(post.lastModified, blog) : "");
  if (text === "post_link") return escapeHtml(post ? ctx.postHref(post) : "");
  return null;
}

function parseArgs(text) {
  const args = {};
  const regex = /(\w+):(?:"([^"]*)"|'([^']*)'|([^\s|]+))/g;
  let match;
  while ((match = regex.exec(text))) {
    args[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return args;
}

function renderPostList(argsText, ctx) {
  const args = parseArgs(argsText);
  let posts = [...(ctx.publicPosts || [])];
  const tags = String(args.tag || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length) posts = posts.filter((p) => tags.every((tag) => p.tags?.includes(tag)));
  if (args.from) posts = posts.filter((p) => new Date(p.publishedDate) >= new Date(`${args.from}T00:00:00`));
  if (args.to) posts = posts.filter((p) => new Date(p.publishedDate) < new Date(`${args.to}T00:00:00`));
  if (args.order === "asc") posts.sort((a, b) => String(a.publishedDate).localeCompare(String(b.publishedDate)));
  const limit = Math.max(1, Math.min(100, parseInt(args.limit, 10) || 10));
  posts = posts.slice(0, limit);

  const showDescription = /true/i.test(args.description || "");
  const showImage = /true/i.test(args.image || "");
  const showContent = /true/i.test(args.content || "");
  if (!posts.length) return '<ul class="deer-posts"><li>No posts yet</li></ul>';

  const items = posts
    .map((item) => {
      const content = showContent
        ? ctx.renderContent
          ? `<div class="deer-post-excerpt">${ctx.renderContent(item)}</div>`
          : ""
        : "";
      const image =
        showImage && item.metaImage
          ? `<img class="deer-post-image" src="${escapeHtml(item.metaImage)}" alt="${escapeHtml(item.title)}" loading="lazy">`
          : "";
      const description = showDescription && item.metaDescription
        ? `<p class="deer-post-description">${escapeHtml(item.metaDescription)}</p>`
        : "";
      return `<li><time datetime="${escapeHtml(item.publishedDate || "")}">${escapeHtml(displayDate(item.publishedDate, ctx.blog))}</time> <a href="${escapeHtml(ctx.postHref(item))}">${escapeHtml(item.title)}</a>${description}${image}${content}</li>`;
    })
    .join("");
  return `<ul class="deer-posts">${items}</ul>`;
}

function renderAdjacent(kind, ctx) {
  const posts = ctx.publicPosts || [];
  if (!ctx.post) return "";
  const index = posts.findIndex((p) => p.id === ctx.post.id);
  if (index < 0) return "";
  const target = kind === "next_post" ? posts[index + 1] : posts[index - 1];
  if (!target) return "";
  const arrow = kind === "next_post" ? "→" : "←";
  const label = kind === "next_post" ? "Next" : "Previous";
  return `<p class="deer-adjacent"><a href="${escapeHtml(ctx.postHref(target))}"><small>${label}</small> ${arrow} ${escapeHtml(target.title)}</a></p>`;
}

function renderTags(ctx) {
  const tags = [...new Set((ctx.publicPosts || []).flatMap((p) => p.tags || []))].sort();
  if (!tags.length) return "";
  return `<span class="deer-tags">${tags
    .map((tag) => `<a href="${escapeHtml(ctx.tagsHref(tag))}">#${escapeHtml(tag)}</a>`)
    .join(" ")}</span>`;
}
