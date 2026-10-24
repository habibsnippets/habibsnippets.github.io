import { renderContent } from "./public.mjs";
import { blogOrigin, absolutizeHtml, xml } from "./web.mjs";

const MAX_FEED_ITEMS = 20;

function feedPosts(posts) {
  return posts.slice(0, MAX_FEED_ITEMS);
}

function entryContent(blog, post, posts) {
  return absolutizeHtml(
    renderContent(post.content || "", {
      blog,
      post,
      prefix: "",
      publicPosts: posts,
    }).html,
    blogOrigin(blog),
  );
}

function postUrl(blog, post) {
  return `${blogOrigin(blog)}/${post.slug}/`;
}

export function atomFeed(blog, posts) {
  const origin = blogOrigin(blog);
  const items = feedPosts(posts);
  const updated = items[0]?.publishedDate || blog.lastModified || new Date().toISOString();
  const entries = items
    .map((post) => {
      const url = postUrl(blog, post);
      return `<entry>
  <title>${xml(post.title)}</title>
  <link href="${xml(url)}"/>
  <id>${xml(url)}</id>
  <published>${xml(post.publishedDate || post.lastModified || updated)}</published>
  <updated>${xml(post.lastModified || post.publishedDate || updated)}</updated>
  <summary>${xml(post.metaDescription || "")}</summary>
  <content type="html">${xml(entryContent(blog, post, items))}</content>
</entry>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${xml(blog.title)}</title>
  <subtitle>${xml(blog.metaDescription || "")}</subtitle>
  <link href="${xml(`${origin}/`)}"/>
  <link rel="self" href="${xml(`${origin}/feed/`)}" type="application/atom+xml"/>
  <id>${xml(`${origin}/`)}</id>
  <updated>${xml(updated)}</updated>
  <author><name>${xml(blog.title)}</name><uri>${xml(`${origin}/`)}</uri></author>
${entries}
</feed>`;
}

export function rssFeed(blog, posts) {
  const origin = blogOrigin(blog);
  const items = feedPosts(posts);
  const updated = items[0]?.publishedDate || blog.lastModified || new Date().toISOString();
  const entries = items
    .map((post) => {
      const url = postUrl(blog, post);
      const content = entryContent(blog, post, items);
      return `<item>
  <title>${xml(post.title)}</title>
  <link>${xml(url)}</link>
  <guid isPermaLink="true">${xml(url)}</guid>
  <pubDate>${xml(new Date(post.publishedDate || post.lastModified || updated).toUTCString())}</pubDate>
  <description>${xml(post.metaDescription || "")}</description>
  <content:encoded>${xml(content)}</content:encoded>
</item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${xml(blog.title)}</title>
  <link>${xml(`${origin}/`)}</link>
  <description>${xml(blog.metaDescription || blog.title)}</description>
  <language>${xml(blog.lang || "en")}</language>
  <lastBuildDate>${xml(new Date(updated).toUTCString())}</lastBuildDate>
  <atom:link href="${xml(`${origin}/feed/?type=rss`)}" rel="self" type="application/rss+xml"/>
${entries}
</channel>
</rss>`;
}

export function sitemapXml(blog, posts) {
  const origin = blogOrigin(blog);
  const urls = [
    { loc: `${origin}/`, lastmod: blog.lastModified },
    { loc: `${origin}/${blog.blogPath || "blog"}/`, lastmod: blog.lastModified },
    ...posts.map((post) => ({
      loc: `${origin}/${post.slug}/`,
      lastmod: post.lastModified || post.publishedDate,
    })),
  ];
  const body = urls
    .map(
      (url) => `  <url><loc>${xml(url.loc)}</loc>${
        url.lastmod ? `<lastmod>${xml(new Date(url.lastmod).toISOString())}</lastmod>` : ""
      }</url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

export function robotsTxt(blog) {
  const origin = blogOrigin(blog);
  let body = String(blog.robotsTxt || "User-agent: *\nAllow: /").trim();
  if (!/^sitemap:/im.test(body)) body += `\n\nSitemap: ${origin}/sitemap.xml`;
  return `${body}\n`;
}

export function faviconSvg(blog) {
  const raw = String(blog.favicon || "🦌");
  const glyph = Array.from(raw.replace(/^https?:\/\/\S+$/i, ""))[0] || "🦌";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="18" fill="#f7f2e7"/>
  <text x="50" y="52" dominant-baseline="middle" text-anchor="middle" font-size="72" font-family="system-ui, sans-serif">${xml(glyph)}</text>
</svg>`;
}
