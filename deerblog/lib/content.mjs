import { dateInputValue, parseLocalDate } from "./dates.mjs";
import { slugify } from "./markdown.mjs";

const POST_HEADER_KEYS = [
  "title", "link", "alias", "published_date", "canonical_url",
  "meta_description", "meta_image", "lang", "tags", "discoverable",
  "is_page", "class_name",
];

const HOME_HEADER_KEYS = ["title", "favicon", "meta_description", "meta_image"];

function splitRaw(raw) {
  const lines = String(raw || "").replace(/\r\n/g, "\n").split("\n");
  const headers = [];
  let index = 0;
  let started = false;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "___") {
      index++;
      break;
    }
    if (!line.trim()) {
      if (started) {
        index++;
        break;
      }
      index++;
      continue;
    }
    const match = line.match(/^([a-z_]+)\s*:\s*(.*)$/i);
    if (!match) break;
    headers.push([match[1].toLowerCase(), match[2]]);
    started = true;
    index++;
  }
  return { headers, body: lines.slice(index).join("\n").replace(/^\n+/, "") };
}

function truthyValue(value) {
  const text = String(value).trim().toLowerCase();
  if (text === "true") return true;
  if (text === "false") return false;
  return null;
}

export function cleanSlugPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((part) =>
      part
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join("/");
}

export function cleanAlias(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .map((part) => part.replace(/[^a-z0-9._~-]+/g, "-").replace(/-+/g, "-"))
    .filter(Boolean)
    .join("/");
}

function uniqueSlug(blogId, wanted, posts, currentId = "") {
  const used = new Set(
    posts
      .filter((p) => p.blogId === blogId && p.id !== currentId)
      .flatMap((p) => [p.slug.toLowerCase(), String(p.alias || "").toLowerCase()])
      .filter(Boolean),
  );
  let slug = wanted || "post";
  if (!used.has(slug)) return slug;
  let suffix = "-new";
  while (used.has(`${slug}${suffix}`)) suffix += "-new";
  return `${slug}${suffix}`;
}

export function parseHome(raw) {
  const { headers, body } = splitRaw(raw);
  const result = {
    title: "",
    favicon: "",
    metaDescription: "",
    metaImage: "",
    content: body,
  };
  const errors = [];
  for (const [key, value] of headers) {
    const clean = value.trim();
    if (!HOME_HEADER_KEYS.includes(key)) {
      errors.push(`"${key}" is not a valid homepage header.`);
      continue;
    }
    if (key === "title") result.title = clean;
    if (key === "favicon") {
      if (clean.length > 100) errors.push("Favicon is too long. Use one emoji or a URL.");
      else result.favicon = clean;
    }
    if (key === "meta_description") result.metaDescription = clean;
    if (key === "meta_image") result.metaImage = clean;
  }
  if (!result.title) result.title = "My blog";
  return { value: result, errors };
}

export function serializeHome(blog) {
  const lines = [`title: ${blog.title}`];
  if (blog.favicon) lines.push(`favicon: ${blog.favicon}`);
  if (blog.metaDescription) lines.push(`meta_description: ${blog.metaDescription}`);
  if (blog.metaImage) lines.push(`meta_image: ${blog.metaImage}`);
  return `${lines.join("\n")}\n\n${blog.content || ""}`;
}

export function serializePost(post) {
  const lines = [`title: ${post.title}`, `link: ${post.slug}`];
  if (post.alias) lines.push(`alias: ${post.alias}`);
  if (post.publishedDate) lines.push(`published_date: ${dateInputValue(post.publishedDate)}`);
  if (post.canonicalUrl) lines.push(`canonical_url: ${post.canonicalUrl}`);
  if (post.metaDescription) lines.push(`meta_description: ${post.metaDescription}`);
  if (post.metaImage) lines.push(`meta_image: ${post.metaImage}`);
  if (post.lang) lines.push(`lang: ${post.lang}`);
  if (post.tags?.length) lines.push(`tags: ${post.tags.join(", ")}`);
  if (post.isPage) lines.push("is_page: true");
  if (!post.discoverable) lines.push("discoverable: false");
  if (post.className) lines.push(`class_name: ${post.className}`);
  return `${lines.join("\n")}\n\n${post.content || ""}`;
}

export function postFromRaw(raw, { blog, posts, current = null, publish = false, forcePage = false }) {
  const { headers, body } = splitRaw(raw);
  const errors = [];
  const data = {
    title: "New post",
    slug: "",
    alias: "",
    publishedDate: current?.publishedDate || null,
    canonicalUrl: "",
    metaDescription: "",
    metaImage: "",
    lang: "",
    tags: [],
    discoverable: true,
    isPage: forcePage || !!current?.isPage,
    className: "",
    content: body,
  };

  for (const [key, rawValue] of headers) {
    const value = rawValue.trim();
    if (!POST_HEADER_KEYS.includes(key)) {
      errors.push(`"${key}" is not a valid post header.`);
      continue;
    }
    if (key === "title") data.title = value || "New post";
    if (key === "link") data.slug = value;
    if (key === "alias") data.alias = cleanAlias(value);
    if (key === "canonical_url") data.canonicalUrl = value;
    if (key === "meta_description") {
      if (value.length > 200) errors.push("meta_description must be 200 characters or fewer.");
      else data.metaDescription = value;
    }
    if (key === "meta_image") data.metaImage = value;
    if (key === "lang") {
      if (value.length > 10) errors.push("lang must be 10 characters or fewer.");
      else data.lang = value;
    }
    if (key === "tags") {
      const tags = [];
      for (const tag of value.split(",")) {
        const clean = tag.trim();
        if (clean && !tags.includes(clean)) tags.push(clean);
      }
      data.tags = tags.slice(0, 40);
    }
    if (key === "discoverable") {
      const parsed = truthyValue(value);
      if (parsed === null) errors.push('discoverable must be "true" or "false".');
      else data.discoverable = parsed;
    }
    if (key === "is_page") {
      const parsed = truthyValue(value);
      if (parsed === null) errors.push('is_page must be "true" or "false".');
      else data.isPage = parsed;
    }
    if (key === "class_name") data.className = slugify(value);
    if (key === "published_date") {
      if (!value) data.publishedDate = null;
      else {
        const parsed = parseLocalDate(value);
        if (!parsed) errors.push("Bad date format. Use YYYY-MM-DD HH:MM.");
        else data.publishedDate = parsed.toISOString();
      }
    }
  }

  data.title = data.title.trim() || "New post";
  data.content = body;

  const wanted = cleanSlugPart(data.slug) || slugify(data.title) || "post";
  data.slug = uniqueSlug(blog.id, wanted, posts, current?.id || "");

  if (data.alias) {
    const alias = cleanAlias(data.alias);
    if (!alias) errors.push("alias is not a valid path.");
    else if (
      posts.some(
        (p) =>
          p.id !== current?.id &&
          p.blogId === blog.id &&
          (p.slug.toLowerCase() === alias.toLowerCase() ||
            String(p.alias || "").toLowerCase() === alias.toLowerCase()),
      )
    ) {
      errors.push("That alias already belongs to another post.");
    } else data.alias = alias;
  }

  if (publish && !data.publishedDate) data.publishedDate = new Date().toISOString();
  if (!publish && !current) data.publishedDate = data.publishedDate || null;

  const firstPublished = current?.firstPublishedAt || (publish ? data.publishedDate || new Date().toISOString() : null);

  return {
    value: {
      ...(current || {}),
      ...data,
      firstPublishedAt: firstPublished,
    },
    errors,
  };
}
