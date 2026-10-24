# Writing

Source of truth for the `/writing/` pages. Nothing here is served directly —
`tools/build-writing.mjs` renders it into `writing/<slug>/index.html`.

```
content/writing/posts.json     metadata, newest first
content/writing/<slug>.html    post body (raw HTML, no <html> wrapper)
assets/writing/<slug>/         images for that post
```

## Add a post

1. Pick a slug, e.g. `kernel-fusion`.
2. Add an entry to the **top** of `posts.json`:

   ```json
   {
     "slug": "kernel-fusion",
     "title": "Kernel Fusion, Slowly",
     "date": "02 Nov, 2026",
     "dateISO": "2026-11-02",
     "minutes": 6,
     "description": "One sentence for search results and link previews."
   }
   ```

3. Write `content/writing/kernel-fusion.html` — the body only, starting at `<h2>`
   (the page supplies the `<h1>`). Drop images in `assets/writing/kernel-fusion/`
   and reference them as `/assets/writing/kernel-fusion/name.png`.
4. Run:

   ```bash
   node tools/build-writing.mjs
   ```

5. Commit the fragment, the metadata, the images **and** the generated
   `writing/` output. GitHub Pages serves the generated files.

## Notes

- `writing/posts.js` is generated from `posts.json`; the homepage list reads it.
  Never edit it by hand.
- `bearblog-canonical.md` is generated too: the canonical URL to paste into each
  original bearblog post so search engines credit the copy here.
- `tools/import-bearblog.mjs` is the one-off migration tool (`--force` re-imports
  and overwrites local edits). You shouldn't need it again.
- Prose styling lives under `.prose` in `styles.css`; lists, tables, code blocks
  and images are already handled.
