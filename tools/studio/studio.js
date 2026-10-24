/* ============================================================
   Writing studio — client.

   Plain DOM, no framework. The server owns every fact: the list,
   the files, the build. This file only collects keystrokes and
   shows what came back.
   ============================================================ */

import { mountCanvas } from "./canvas.js";

const $ = (id) => document.getElementById(id);

const el = {
  newPost: $("newPost"),
  search: $("search"),
  list: $("list"),
  gitState: $("gitState"),
  copyPush: $("copyPush"),
  title: $("title"),
  statusChip: $("statusChip"),
  metaLine: $("metaLine"),
  saveBtn: $("saveBtn"),
  publishBtn: $("publishBtn"),
  menuBtn: $("menuBtn"),
  menu: $("menu"),
  openPost: $("openPost"),
  unpublishBtn: $("unpublishBtn"),
  deleteBtn: $("deleteBtn"),
  slug: $("slug"),
  date: $("date"),
  desc: $("desc"),
  banner: $("banner"),
  panes: $("panes"),
  modeWrite: $("modeWrite"),
  modeDraw: $("modeDraw"),
  paneHint: $("paneHint"),
  writeSurface: $("writeSurface"),
  drawSurface: $("drawSurface"),
  toolbar: $("toolbar"),
  editor: $("editor"),
  stats: $("stats"),
  savedState: $("savedState"),
  preview: $("preview"),
  toggleSplit: $("toggleSplit"),
  fileInput: $("fileInput"),
  toast: $("toast"),
};

const state = {
  posts: [],
  git: null,
  meta: null, // saved metadata for the open post, null for a brand-new one
  legacy: false,
  dirty: false,
  saving: false,
  slugLocked: false,
  previewOn: true,
  mode: "write", // write | draw
  words: 0,
  minutes: 1,
};

/* The diagram canvas owns its own scene. It asks us for the slug,
   calls save() when an export needs a post to live under, and hands
   the finished markdown back for insertion. */
const canvasStudio = mountCanvas({
  root: el.drawSurface,
  getSlug: () => state.meta?.slug || null,
  ensureSlug: async () => {
    if (state.meta?.slug) return state.meta.slug;
    await save({ silent: true });
    return state.meta?.slug || null;
  },
  insertMarkdown: (markdown) => {
    setMode("write");
    insert(markdown);
  },
  notify: toast,
});

/* --- tiny helpers ----------------------------------------- */

const escapeHtml = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const todayISO = () => new Date().toISOString().slice(0, 10);

const slugify = (s = "") =>
  String(s)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const WORD = /\s+/;

const countWords = (text = "") =>
  text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .split(WORD)
    .filter(Boolean).length;

async function api(path, opts) {
  const res = await fetch(path, opts);
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { error: raw || `HTTP ${res.status}` };
  }
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.output = data.output;
    throw err;
  }
  return data;
}

const postJson = (path, payload) =>
  api(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

let toastTimer;
function toast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.toast.hidden = true), 2600);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast("Copied");
}

/* --- write / draw ------------------------------------------ */

function setMode(mode) {
  const drawing = mode === "draw";
  if (drawing && (state.legacy || el.modeDraw.disabled)) return;
  if (mode === state.mode) return;

  state.mode = drawing ? "draw" : "write";
  el.writeSurface.hidden = drawing;
  el.drawSurface.hidden = !drawing;
  el.modeWrite.classList.toggle("is-active", !drawing);
  el.modeDraw.classList.toggle("is-active", drawing);
  el.modeWrite.setAttribute("aria-selected", String(!drawing));
  el.modeDraw.setAttribute("aria-selected", String(drawing));
  el.paneHint.textContent = drawing ? "diagram · png" : "markdown";

  if (drawing) {
    el.editor.blur();
    canvasStudio.open();
  } else {
    canvasStudio.close();
    el.editor.focus({ preventScroll: true });
  }
}

el.modeWrite.addEventListener("click", () => setMode("write"));
el.modeDraw.addEventListener("click", () => setMode("draw"));

/* --- list -------------------------------------------------- */

async function refreshList() {
  const data = await api("/api/posts");
  state.posts = data.posts;
  state.git = data.git;
  renderList();
  renderGit();
}

function renderList() {
  const q = el.search.value.trim().toLowerCase();
  const match = (p) => !q || p.title.toLowerCase().includes(q) || p.slug.includes(q);
  const drafts = state.posts.filter((p) => p.draft && match(p));
  const published = state.posts.filter((p) => !p.draft && match(p));

  const item = (p) => `
    <button class="item" type="button" role="listitem" data-slug="${escapeHtml(p.slug)}"
            aria-current="${state.meta?.slug === p.slug ? "true" : "false"}">
      <span class="item-title">${escapeHtml(p.title)}</span>
      <span class="item-meta">${escapeHtml(p.date || "")} · ${p.minutes || 1} min${p.hasBody ? "" : " · no file"}</span>
    </button>`;

  const groups = [];
  if (drafts.length) groups.push(`<div class="group">Drafts · ${drafts.length}</div>${drafts.map(item).join("")}`);
  if (published.length) {
    groups.push(`<div class="group">Published · ${published.length}</div>${published.map(item).join("")}`);
  }
  if (!groups.length) groups.push(`<p class="group">nothing matches</p>`);
  el.list.innerHTML = groups.join("");
}

function renderGit() {
  if (!state.git) return;
  el.gitState.textContent = state.git.clean
    ? `clean · ${state.git.branch}`
    : `${state.git.changed} uncommitted · ${state.git.branch}`;
}

el.list.addEventListener("click", (event) => {
  const button = event.target.closest(".item");
  if (button) openPost(button.dataset.slug);
});

el.search.addEventListener("input", renderList);

/* --- opening ----------------------------------------------- */

async function openPost(slug) {
  if (state.dirty) await save({ silent: true });

  const data = await api(`/api/post?slug=${encodeURIComponent(slug)}`);
  state.meta = data.meta;
  state.legacy = data.markdown === null && !!data.legacyHtml;
  state.slugLocked = true;
  state.dirty = false;

  el.title.value = data.meta.title;
  el.slug.value = data.meta.slug;
  el.date.value = data.meta.dateISO || "";
  el.desc.value = data.meta.description || "";
  el.editor.value = data.markdown ?? data.legacyHtml ?? "";
  el.editor.disabled = state.legacy;
  el.slug.disabled = el.date.disabled = el.desc.disabled = state.legacy;
  el.toolbar.hidden = state.legacy;
  el.saveBtn.disabled = el.publishBtn.disabled = state.legacy;

  state.words = data.meta.words || countWords(el.editor.value);
  state.minutes = data.meta.minutes || 1;

  hideBanner();
  if (state.legacy) {
    el.preview.removeAttribute("srcdoc");
    el.preview.src = `/writing/${slug}/`;
    showBanner(
      "note",
      `<strong>Imported HTML post.</strong> This one was migrated from Bearblog as raw HTML, so the studio can preview it but not edit it — change <code>content/writing/${escapeHtml(slug)}.html</code> in your editor instead.`
    );
  } else {
    el.preview.removeAttribute("src");
    renderPreview();
  }

  /* Each post gets its own local diagram scene. */
  el.modeDraw.disabled = state.legacy;
  el.modeDraw.title = state.legacy
    ? "Imported HTML posts are read-only"
    : "Draw diagrams — the editable scene stays in this browser";
  if (state.legacy) setMode("write");
  canvasStudio.setSlug(slug);

  updateChrome();
  markClean();
  renderList();
}

function updateChrome() {
  const meta = state.meta;
  const draft = meta ? !!meta.draft : true;

  el.statusChip.textContent = meta ? (draft ? "Draft" : "Published") : "New";
  el.statusChip.dataset.state = draft ? "draft" : "published";

  el.publishBtn.textContent = draft ? "Publish" : "Update";

  const words = state.words || countWords(el.editor.value);
  const minutes = Math.max(1, Math.round(words / 210));
  el.stats.textContent = `${words} word${words === 1 ? "" : "s"} · ~${minutes} min`;

  el.metaLine.textContent = meta
    ? `/writing/${meta.slug}/`
    : "not saved yet";

  el.openPost.href = meta ? `/writing/${meta.slug}/` : "#";
  el.openPost.setAttribute("aria-disabled", meta ? "false" : "true");
  el.unpublishBtn.disabled = !meta || draft;
  el.deleteBtn.disabled = !meta;
}

function markDirty() {
  state.dirty = true;
  el.savedState.textContent = "unsaved changes";
  el.savedState.dataset.state = "dirty";
}

function markClean(at) {
  el.savedState.textContent = at ? `saved ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "saved";
  el.savedState.dataset.state = "saved";
}

/* --- banner ------------------------------------------------ */

function showBanner(kind, html) {
  el.banner.hidden = false;
  el.banner.dataset.kind = kind;
  el.banner.innerHTML = html;
}

function hideBanner() {
  el.banner.hidden = true;
  el.banner.innerHTML = "";
}

el.banner.addEventListener("click", (event) => {
  const copyBtn = event.target.closest("[data-copy]");
  if (copyBtn) copy(copyBtn.dataset.copy);
  if (event.target.closest("[data-dismiss]")) hideBanner();
});

/* --- saving ------------------------------------------------ */

function collectMeta() {
  return {
    slug: el.slug.value.trim(),
    title: el.title.value,
    dateISO: el.date.value || todayISO(),
    description: el.desc.value,
    draft: state.meta ? !!state.meta.draft : true,
  };
}

function uniqueSlug(base) {
  const root = base || "untitled";
  if (!state.posts.some((p) => p.slug === root)) return root;
  let n = 2;
  while (state.posts.some((p) => p.slug === `${root}-${n}`)) n++;
  return `${root}-${n}`;
}

async function save({ silent = false } = {}) {
  if (state.legacy || state.saving) return state.meta;

  if (!state.meta) {
    if (!el.slug.value.trim()) el.slug.value = uniqueSlug(slugify(el.title.value) || slugify(todayISO()));
    if (!el.title.value.trim() && !el.editor.value.trim()) return null;
    if (!el.title.value.trim()) el.title.value = "Untitled";
  }

  const meta = collectMeta();
  if (!meta.slug) return null;

  state.saving = true;
  el.savedState.textContent = "saving…";
  el.savedState.dataset.state = "";

  try {
    const data = await postJson("/api/post", { meta, markdown: el.editor.value });
    const wasNew = !state.meta;
    state.meta = data.meta;
    state.dirty = false;
    markClean(data.savedAt);
    updateChrome();
    if (wasNew) {
      el.slug.value = data.meta.slug;
      el.slug.disabled = false;
      /* The scene was created under the scratch key; carry it over. */
      canvasStudio.setSlug(data.meta.slug, { migrate: true });
    }
    await refreshList();
    if (!silent) toast("Saved");
    return data.meta;
  } catch (err) {
    el.savedState.textContent = err.message;
    el.savedState.dataset.state = "error";
    if (!silent) showBanner("error", `<strong>Could not save.</strong> ${escapeHtml(err.message)}`);
    return null;
  } finally {
    state.saving = false;
  }
}

let saveTimer;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (state.dirty) save({ silent: true });
  }, 1400);
}

/* --- preview ----------------------------------------------- */

let previewTimer;

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 320);
}

async function renderPreview() {
  if (state.legacy || !state.previewOn) return;
  let scroll = 0;
  try {
    scroll = el.preview.contentWindow?.scrollY || 0;
  } catch {
    /* cross-origin during the first paint */
  }

  el.preview.onload = () => {
    try {
      el.preview.contentWindow?.scrollTo(0, scroll);
    } catch {}
    el.preview.onload = null;
  };

  try {
    const data = await postJson("/api/preview", { meta: collectMeta(), markdown: el.editor.value });
    el.preview.srcdoc = data.html;
    state.words = data.words;
    state.minutes = data.minutes;
    updateChrome();
  } catch (err) {
    showBanner("error", `<strong>Preview failed.</strong> ${escapeHtml(err.message)}`);
  }
}

/* --- writing surface --------------------------------------- */

el.title.addEventListener("input", () => {
  if (!state.slugLocked) el.slug.value = slugify(el.title.value);
  markDirty();
  scheduleSave();
  schedulePreview();
});

el.slug.addEventListener("input", () => {
  state.slugLocked = el.slug.value.trim().length > 0;
  el.slug.value = slugify(el.slug.value);
  markDirty();
  scheduleSave();
});

for (const field of [el.date, el.desc]) {
  field.addEventListener("input", () => {
    markDirty();
    scheduleSave();
    schedulePreview();
  });
}

el.editor.addEventListener("input", () => {
  markDirty();
  state.words = countWords(el.editor.value);
  updateChrome();
  scheduleSave();
  schedulePreview();
});

/* Tab indents instead of leaving the field. */
el.editor.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  event.preventDefault();
  const { selectionStart: start, selectionEnd: end } = el.editor;
  el.editor.setRangeText("  ", start, end, "end");
  el.editor.dispatchEvent(new Event("input"));
});

/* --- selection helpers ------------------------------------- */

function insert(text, selectFrom, selectTo) {
  const start = el.editor.selectionStart;
  const end = el.editor.selectionEnd;
  el.editor.setRangeText(text, start, end, "end");
  if (typeof selectFrom === "number") {
    el.editor.selectionStart = start + selectFrom;
    el.editor.selectionEnd = start + (selectTo ?? selectFrom);
  }
  el.editor.focus();
  el.editor.dispatchEvent(new Event("input"));
}

function surround(before, after, placeholder = "") {
  const start = el.editor.selectionStart;
  const end = el.editor.selectionEnd;
  const selected = el.editor.value.slice(start, end) || placeholder;
  insert(before + selected + after, before.length, before.length + selected.length);
}

function prefixLine(prefix) {
  const start = el.editor.selectionStart;
  const lineStart = el.editor.value.lastIndexOf("\n", start - 1) + 1;
  el.editor.setRangeText(prefix, lineStart, lineStart, "end");
  el.editor.focus();
  el.editor.dispatchEvent(new Event("input"));
}

function block(text, caret) {
  const start = el.editor.selectionStart;
  const atLineStart = start === 0 || el.editor.value[start - 1] === "\n";
  const pad = atLineStart ? "" : "\n";
  insert(pad + text + "\n", pad.length + (caret ?? text.length), pad.length + (caret ?? text.length));
}

const commands = {
  h2: () => prefixLine("## "),
  bold: () => surround("**", "**", "bold text"),
  italic: () => surround("*", "*", "italic"),
  strike: () => surround("~~", "~~", "text"),
  code: () => surround("`", "`", "code"),
  link: () => {
    const { selectionStart: s, selectionEnd: e, value } = el.editor;
    const selected = value.slice(s, e);
    if (/^https?:\/\//.test(selected)) insert(`[](${selected})`, 1, 1);
    else surround("[", "](https://)", "link text");
  },
  image: () => el.fileInput.click(),
  math: () => surround("$", "$", "E = mc^2"),
  mathblock: () => block("$$\n\\frac{a}{b} = c\n$$", 3),
  ul: () => prefixLine("- "),
  ol: () => prefixLine("1. "),
  quote: () => prefixLine("> "),
  codeblock: () => block("```python\n\n```", 12),
  table: () => block("| Column | Column |\n| --- | --- |\n| cell | cell |", 30),
  hr: () => block("---"),
};

el.toolbar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-cmd]");
  if (!button) return;
  commands[button.dataset.cmd]?.();
});

/* --- images ------------------------------------------------ */

async function insertImage(file) {
  if (!file.type.startsWith("image/")) return toast("That is not an image");

  try {
    if (!state.meta || state.dirty) {
      const saved = await save({ silent: true });
      if (!saved) return toast("Add a title first");
    }

    el.savedState.textContent = "uploading image…";
    const res = await fetch(`/api/upload?slug=${encodeURIComponent(state.meta.slug)}`, {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-filename": encodeURIComponent(file.name || "image.png"),
      },
      body: file,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "upload failed");

    const alt = (file.name || "image").replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
    block(`![${alt}](${data.path})`);
    toast(`Added ${data.name} · ${Math.round(data.bytes / 1024)} KB`);
    markClean();
  } catch (err) {
    showBanner("error", `<strong>Image upload failed.</strong> ${escapeHtml(err.message)}`);
  }
}

el.fileInput.addEventListener("change", () => {
  const file = el.fileInput.files?.[0];
  el.fileInput.value = "";
  if (file) insertImage(file);
});

el.editor.addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  el.editor.style.background = "rgba(11, 98, 196, 0.04)";
});

el.editor.addEventListener("dragleave", () => {
  el.editor.style.background = "";
});

el.editor.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  event.preventDefault();
  el.editor.style.background = "";
  insertImage(file);
});

el.editor.addEventListener("paste", (event) => {
  const file = Array.from(event.clipboardData?.files || []).find((f) => f.type.startsWith("image/"));
  if (file) {
    event.preventDefault();
    insertImage(file);
    return;
  }

  /* The canvas copies a full ![diagram](path) snippet, but if only a
     bare image path is on the clipboard, wrap it automatically.
     Relative names keep working — the build resolves them against
     the post's asset folder. */
  const text = event.clipboardData?.getData("text/plain")?.trim() || "";
  if (
    text &&
    !text.includes("](") &&
    /^(?:https?:\/\/|\/|\.\/)?[^\s]+\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(text)
  ) {
    event.preventDefault();
    insert(`![diagram](${text})`);
  }
});

/* --- publish ----------------------------------------------- */

/* "built 23 post pages + writing/posts.js …" -> "23 pages rebuilt" */
const builtLine = (output = "") => {
  const n = (output.match(/built (\d+) post/) || [])[1];
  return n ? `${n} pages rebuilt` : "the archive was rebuilt";
};

async function publish() {
  if (state.legacy) return;

  if (!state.meta) {
    const saved = await save({ silent: true });
    if (!saved) return toast("Add a title first");
  }
  if (state.dirty) await save({ silent: true });

  el.publishBtn.disabled = true;
  el.publishBtn.textContent = "Building…";

  try {
    const data = await postJson("/api/publish", { meta: collectMeta(), markdown: el.editor.value });
    state.meta = { ...state.meta, draft: false };
    state.dirty = false;
    updateChrome();
    await refreshList();

    showBanner(
      "ok",
      `<strong>Published locally.</strong> ${builtLine(data.output)} — your site is still the old one until you push:
       <div class="banner-row">
         <code>${escapeHtml(data.git.command)}</code>
         <button class="linkish" type="button" data-copy="${escapeHtml(data.git.command)}">copy</button>
         <button class="linkish" type="button" data-dismiss>dismiss</button>
       </div>`
    );
    toast("Published locally — now push");
  } catch (err) {
    showBanner(
      "error",
      `<strong>Publish failed.</strong> ${escapeHtml(err.message)}${err.output ? `<code>${escapeHtml(err.output)}</code>` : ""}`
    );
    updateChrome();
  } finally {
    el.publishBtn.disabled = false;
    el.publishBtn.textContent = state.meta?.draft ? "Publish" : "Update";
  }
}

async function unpublish() {
  closeMenu();
  if (!state.meta) return;
  try {
    const data = await postJson("/api/unpublish", { meta: collectMeta(), markdown: el.editor.value });
    state.meta = { ...state.meta, draft: true };
    updateChrome();
    await refreshList();
    showBanner("note", `<strong>Back in drafts.</strong> ${builtLine(data.output)} — push to remove it from the live site.`);
  } catch (err) {
    showBanner("error", `<strong>Could not unpublish.</strong> ${escapeHtml(err.message)}`);
  }
}

async function remove() {
  closeMenu();
  if (!state.meta) return;
  const ok = confirm(`Delete “${state.meta.title}”?\n\nThis removes the markdown, its images and the built page from the repo.`);
  if (!ok) return;

  try {
    const data = await postJson("/api/delete", { slug: state.meta.slug });
    resetEditor();
    await refreshList();
    showBanner("note", `<strong>Deleted.</strong> ${builtLine(data.output)} — the files are gone; push to finish.`);
  } catch (err) {
    showBanner("error", `<strong>Could not delete.</strong> ${escapeHtml(err.message)}`);
  }
}

/* --- chrome ------------------------------------------------ */

function resetEditor() {
  state.meta = null;
  state.legacy = false;
  state.dirty = false;
  state.slugLocked = false;
  state.words = 0;

  el.title.value = "";
  el.slug.value = "";
  el.slug.disabled = false;
  el.slugLocked = false;
  el.date.value = todayISO();
  el.date.disabled = false;
  el.desc.value = "";
  el.desc.disabled = false;
  el.editor.value = "";
  el.editor.disabled = false;
  el.toolbar.hidden = false;
  el.saveBtn.disabled = false;
  el.publishBtn.disabled = false;
  el.preview.removeAttribute("src");
  el.preview.removeAttribute("srcdoc");

  hideBanner();
  el.modeDraw.disabled = false;
  el.modeDraw.title = "Draw diagrams — the editable scene stays in this browser";
  canvasStudio.setSlug(null, { reset: true });
  if (state.mode === "draw") setMode("write");

  updateChrome();
  markClean();
  renderList();
  el.title.focus({ preventScroll: true });
}

el.newPost.addEventListener("click", async () => {
  if (state.dirty) await save({ silent: true });
  resetEditor();
});

el.saveBtn.addEventListener("click", () => save());

el.publishBtn.addEventListener("click", publish);

el.unpublishBtn.addEventListener("click", unpublish);

el.deleteBtn.addEventListener("click", remove);

function openMenu() {
  el.menu.hidden = false;
  el.menuBtn.setAttribute("aria-expanded", "true");
}
function closeMenu() {
  el.menu.hidden = true;
  el.menuBtn.setAttribute("aria-expanded", "false");
}
el.menuBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  el.menu.hidden ? openMenu() : closeMenu();
});
document.addEventListener("click", (event) => {
  if (!el.menu.contains(event.target) && event.target !== el.menuBtn) closeMenu();
});

el.toggleSplit.addEventListener("click", () => {
  state.previewOn = !state.previewOn;
  el.panes.classList.toggle("no-preview", !state.previewOn);
  el.toggleSplit.textContent = state.previewOn ? "hide" : "preview";
  if (state.previewOn) renderPreview();
});

el.copyPush.addEventListener("click", () =>
  copy(`git add -A && git commit -m "writing update" && git push origin ${state.git?.branch || "main"}`)
);

document.addEventListener("keydown", (event) => {
  const mod = event.metaKey || event.ctrlKey;
  if (mod && event.key.toLowerCase() === "s") {
    event.preventDefault();
    save();
  }
  if (event.key === "Escape") closeMenu();
  if (!mod || document.activeElement !== el.editor) return;
  const key = event.key.toLowerCase();
  if (key === "b" || key === "i" || key === "k") {
    event.preventDefault();
    commands[{ b: "bold", i: "italic", k: "link" }[key]]();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

/* --- boot -------------------------------------------------- */

(async function boot() {
  /* below 900px the panes stack, so start on the editor and let the
     toggle switch to the preview instead of the other way round */
  if (window.innerWidth <= 900) {
    state.previewOn = false;
    el.panes.classList.add("no-preview");
    el.toggleSplit.textContent = "preview";
  }

  try {
    await refreshList();
    if (state.posts.length) await openPost(state.posts[0].slug);
    else resetEditor();
  } catch (err) {
    showBanner("error", `<strong>The studio could not reach its server.</strong> ${escapeHtml(err.message)}`);
  }
})();
