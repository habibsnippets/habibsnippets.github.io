import { Marked } from "marked";
import katex from "katex";

/* A deliberately Bear-compatible Markdown surface: GitHub-flavoured
   Markdown, raw HTML, fenced code, tables, and KaTeX rendered at source
   time. Public pages never download a maths runtime. */

export const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const slugify = (value = "") =>
  String(value)
    .replace(/<[^>]+>/g, "")
    .toLowerCase()
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "section";

export function wrapTables(html) {
  return html.replace(/<table\b[\s\S]*?<\/table>/gi, (table) => `<div class="table-wrap">\n${table}\n</div>`);
}

const headingIds = () => {
  const seen = new Map();
  return (base) => {
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
};

function external(href = "") {
  return /^https?:\/\//i.test(href) && !/^https?:\/\/(www\.)?(localhost|127\.0\.0\.1)(:|\/|$)/i.test(href);
}

const marked = new Marked({ gfm: true, breaks: false });
let nextHeadingId = headingIds();
let assetBase = "";

marked.use({
  renderer: {
    heading(token) {
      const depth = Math.min(Math.max(token.depth, 1) + (token.depth === 1 ? 1 : 0), 6);
      const text = this.parser.parseInline(token.tokens);
      const id = nextHeadingId(slugify(text));
      return `<h${depth} id="${id}">${text}</h${depth}>\n`;
    },
    link(token) {
      const text = this.parser.parseInline(token.tokens);
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
      const href = escapeHtml(token.href);
      if (!external(token.href)) return `<a href="${href}"${title}>${text}</a>`;
      return `<a href="${href}"${title} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    image(token) {
      const alt = escapeHtml(token.text || "");
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
      let src = token.href || "";
      if (!/^(https?:|\/|data:|#)/i.test(src)) src = `${assetBase}${src.replace(/^\.\//, "")}`;
      return `<img src="${escapeHtml(src)}" alt="${alt}"${title} loading="lazy" decoding="async">`;
    },
  },
});

const C = "\u0000";

function renderTex(tex, display) {
  try {
    return katex.renderToString(tex.trim(), {
      displayMode: display,
      throwOnError: false,
      strict: "ignore",
      output: "htmlAndMathml",
      trust: false,
    });
  } catch (err) {
    return `<code class="math-error" title="${escapeHtml(err.message)}">${escapeHtml(tex)}</code>`;
  }
}

function extractMath(text, store) {
  const push = (tex, display) => {
    store.push({ tex, display });
    return `${C}m${store.length - 1}${C}`;
  };
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => push(tex, true));
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => push(tex, true));
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => push(tex, false));
  text = text.replace(
    /(^|[^\\$])\$(?![\s$])([^\n$]+?)(?<![\s\\])\$(?![\d$])/g,
    (_, pre, tex) => pre + push(tex, false),
  );
  return text;
}

function restoreMath(html, store) {
  if (!store.length) return html;
  html = html.replace(
    new RegExp(`<p>\\s*${C}m(\\d+)${C}\\s*</p>`, "g"),
    (_, i) => `<div class="math-block">${renderTex(store[+i].tex, true)}</div>`,
  );
  return html.replace(new RegExp(`${C}m(\\d+)${C}`, "g"), (_, i) => {
    const { tex, display } = store[+i];
    if (!display) return renderTex(tex, false);
    return `<span class="math-block math-block-inline">${renderTex(tex, true)}</span>`;
  });
}

/**
 * @param {string} markdown
 * @param {{assetBase?: string}} [opts]
 * @returns {{html: string, hasMath: boolean, words: number}}
 */
export function renderMarkdown(markdown, opts = {}) {
  const store = [];
  const segments = String(markdown || "")
    .replace(/\r\n/g, "\n")
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g);
  const source = segments.map((seg, i) => (i % 2 === 1 ? seg : extractMath(seg, store))).join("");

  nextHeadingId = headingIds();
  assetBase = opts.assetBase || "";

  let html = marked.parse(source);
  html = restoreMath(html, store);
  html = wrapTables(html);

  const words = String(markdown || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

  return { html, hasMath: store.length > 0, words };
}

export const readingMinutes = (words) => Math.max(1, Math.round(Number(words) / 210));
