# Writing

Source of truth for `/writing/`. Nothing here is served directly —
`tools/build-writing.mjs` renders it into `writing/<slug>/index.html`.

```
content/writing/posts.json     metadata + draft flag, newest first
content/writing/<slug>.md      post body, written in markdown
content/writing/<slug>.html    legacy posts imported from Bearblog (raw HTML)
assets/writing/<slug>/         images for that post
writing/<slug>/index.html      generated — committed, served by Pages
writing/posts.js               generated — the homepage list reads this
```

## The studio (usual way)

```bash
npm install          # once: marked + katex, only needed by the local tools
npm run studio       # http://127.0.0.1:4321
```

- **New post** → write → the draft autosaves into `content/writing/<slug>.md`.
- **Image** button, drag-and-drop, or paste: the file lands in
  `assets/writing/<slug>/` and the markdown link is inserted for you.
- **Preview** is rendered by the same code as the build, so it is the page.
- **Publish** flips the post out of drafts and rebuilds everything. It does not
  touch git — the banner shows the exact command:

  ```bash
  git add -A && git commit -m "…" && git push origin main
  ```

GitHub Pages serves the committed files, so that push is what goes live.

Published posts stay editable in the studio; **Update** republishes them.
**Move back to drafts** pulls the page out of the next build. Imported `.html`
posts are preview-only — edit those files directly.

## Diagrams

**Draw** opens a small Excalidraw-style canvas in place of the editor, with the
preview still on the right. Scenes autosave in the browser (`localStorage`, one
per post) while you work; only the exported PNG is committed.

- Tools: select `V`, pan `H`, rectangle `R`, diamond `D`, ellipse `O`, line `L`,
  arrow `A`, text `T`. Shift-click to multi-select, drag a box on empty canvas
  to marquee-select, and drag a selection's handles to resize.
- Style the selection from the toolbar: stroke and fill colours (including
  custom swatches), none/solid/hachure fill, stroke width and style, sketch
  roughness, opacity, and font family, size and alignment for text.
- `Space`-drag or the hand tool pans. `⌘/Ctrl`+wheel or the zoom buttons zoom;
  **fit** frames the drawing. `⌘/Ctrl+Z` / `⇧⌘/Ctrl+Z` undo and redo,
  `⌘/Ctrl+C` / `V` / `D` copy, paste and duplicate, `Delete` removes.
- **Export** → drag a box around the diagram. The panel previews the crop at 2×
  with a transparent background. **Save to post** writes
  `assets/writing/<slug>/diagram-<timestamp>.png`, copies the markdown snippet,
  and offers **Insert** to paste it at the cursor. **Copy image** and
  **Download** work without saving.

Give a new post a title before saving its diagram — the studio needs a slug to
know which asset folder to use. Imported `.html` posts are read-only, so their
Draw tab is disabled.

## Without the studio

1. Add an entry to the **top** of `posts.json`:

   ```json
   {
     "slug": "kernel-fusion",
     "title": "Kernel Fusion, Slowly",
     "date": "02 Nov, 2026",
     "dateISO": "2026-11-02",
     "description": "One sentence for search results and link previews.",
     "draft": true
   }
   ```

2. Write `content/writing/kernel-fusion.md`. Start at `##` — the page supplies
   the `<h1>`. Drop `"draft": true` (or set it to `false`) to publish.
3. `npm run build`
4. Commit the markdown, the metadata, the images **and** the generated
   `writing/` output.

`words` and `minutes` are computed at build time when absent, so you can leave
them out.

## Markdown

Standard markdown plus tables, fenced code and maths:

````markdown
## Heading

**bold** *italic* ~~strike~~ `code`

- list           1. list           > quote          ---

| a | b |
|---|---|

```python
code block
```

Inline $E = mc^2$ and display:

$$
\int_0^1 x \, dx = \frac{1}{2}
$$

![alt text](/assets/writing/<slug>/plot.png)
````

`\(…\)` and `\[…\]` work too. Maths is rendered by KaTeX **at build time** into
plain HTML, so readers download no maths JavaScript; posts that contain maths
also pull in KaTeX's stylesheet from a CDN. A bare filename
(`![plot](plot.png)`) resolves to that post's asset folder.

## Notes

- `writing/posts.js` and `bearblog-canonical.md` are generated. Never edit them.
- The build also keeps the "Essays 23" style counts in `index.html` in sync.
- `tools/import-bearblog.mjs` is the one-off migration tool (`--force` re-imports
  and overwrites local edits). You shouldn't need it again.
- Editing `styles.css` or `main.js` means bumping `CSS_V` / `JS_V` in
  `tools/post-page.mjs` (and the two `?v=` values in `index.html`).
- Prose styling lives under `.prose` in `styles.css`.
