# Deerblog

A local, original study of a calm multi-tenant blogging platform, built in the
spirit of Bear Blog without copying its source, templates, or assets.

Deerblog is a working application, not a mockup. You can create an account, get
your own blog at a subdomain, write and publish Markdown, change themes, upload
media, read analytics, collect subscribers, export everything, and browse other
blogs on Discover. It runs on Node's standard library plus the repository's
existing `marked` and `katex` dependencies. There is no database server, auth
framework, build step, or front-end framework.

```
Main site      http://localhost:8787/
Demo blog      http://demo.localhost:8787/   (or /b/demo/)
Dashboard      http://localhost:8787/dashboard/
```

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
npm run deerblog:reset     # create data/store.json with demo content and start
# or
npm run deerblog           # start with the existing store
```

The server binds to `127.0.0.1:8787` by default. Open
<http://localhost:8787/>.

### Demo accounts

| Account | Password | Plan | Blog |
| --- | --- | --- | --- |
| `demo@deerblog.test` | `deerblog123` | Pro | `demo.localhost:8787` |
| `fern@deerblog.test` | `fernforest` | Free | `fern.localhost:8787` |

The demo account is Pro so that custom domains, subscribers, and multiple blogs
can be tested. The free account demonstrates plan gates.

### Local hosts

`*.localhost` resolves to loopback in current Chrome, Firefox, and Safari. If
your client does not resolve it, every blog also works through the path
fallback:

```
http://localhost:8787/b/demo/
http://localhost:8787/b/demo/blog/
http://localhost:8787/b/demo/welcome-to-deerblog/
```

Path fallback pages are deliberately sandboxed: owner scripts and forms cannot
run on the shared main origin. The canonical URL still points at the blog's own
host.

To test a custom domain locally, add a line to `/etc/hosts`:

```
127.0.0.1 notes.example.test
```

Then connect `notes.example.test` in **Dashboard → Custom domain** and visit
<http://notes.example.test:8787/>. Custom domains are a Pro feature.

## What works

### Accounts and blogs

- Two-step signup: blog details first, account credentials second.
- Email/password login with scrypt hashes and hashed session tokens.
- Forgot/reset password with single-use, expiring tokens.
- Account email change, password change, and account deletion.
- Multiple blogs per account, limited by plan (`free: 1`, `pro: 10` in the
  local demo).
- Blog deletion with typed confirmation; it removes posts, pages, media,
  subscribers, and analytics for that blog only.

### Writing and publishing

- Raw-header Markdown editor, similar in feel to Bear's workflow:

  ```text
  title: A small field note
  link: a-small-field-note
  alias: notes/old-name.html
  published_date: 2026-10-24 09:30
  tags: notes, making
  meta_description: A short summary for search and social.
  canonical_url: https://example.com/original
  is_page: false
  discoverable: true

  The Markdown body starts here.
  ```

- Blank line or `___` between headers and body.
- Drafts, publish/unpublish, scheduled posts (future dates stay hidden), and
  pages (excluded from feeds and the blog index).
- Post aliases redirect to the canonical slug.
- Canonical URLs, per-post meta description/image, language, custom class name,
  and discoverable flag.
- Live POST preview with a sandbox CSP, plus shareable read-only draft links
  (`?preview=<random token>`) that work across hosts without a session cookie.
- Markdown via `marked`, KaTeX math, tables with horizontal overflow, and
  template directives resolved after rendering.
- Media library with image upload, insertion into the editor, copy URL, and
  delete. PNG, JPEG, GIF, WebP, and AVIF up to 10 MB.

### Presentation

- Five original themes: `default`, `paper`, `terminal`, `rose`, `forest`.
- Custom CSS with an optional "do not apply preset variables" mode.
- Navigation Markdown, header/footer directives, custom favicon, language,
  date format, meta tag, and `robots.txt`.
- Blog path rename (`/blog/` to `/notes/`, for example) with the old path
  returning 404 rather than silently aliasing.
- Public pages are server-rendered and load no JavaScript.

### Feeds, SEO, and discovery

- Atom feed at `/feed/`, RSS at `/feed/?type=rss`, optional RSS alias.
- `sitemap.xml` with published posts and pages, excluding drafts.
- Per-blog `robots.txt` and favicon.
- Main-site landing, About, Discover with search, and random-post link.
- Upvotes deduplicated per browser, with a one-vote-per-post rule.
- Canonical links, Open Graph/Twitter metadata, and `noindex` for previews and
  404 pages.

### Audience and operations

- Privacy-friendly page-view analytics: daily totals, top posts, referrers,
  device/browser buckets, and a 30-day chart. Bots and non-HTML requests are
  ignored.
- Email subscriber list with add/remove and CSV/TXT export.
- Post CSV export and Markdown ZIP export (one file per post plus a README).
- Plan gates for custom domains and email subscribers.
- Typed confirmations for destructive actions and CSRF protection on every
  state-changing form.
- Per-IP rate limits for login, signup, password reset, subscribe, and upvote.

## Architecture

```
deerblog/
├── server.mjs                  HTTP entry, host dispatch, startup/reset
├── lib/
│   ├── web.mjs                 config, hosts, responses, multipart, static/media
│   ├── auth.mjs                signup, login, reset, sessions, rate limits
│   ├── blog.mjs                public blog routing, posts, feeds, upvotes
│   ├── main.mjs                landing, discover, about, path fallback
│   ├── dashboard-routes.mjs    dashboard, editor, preview, delete
│   ├── blog-settings-routes.mjs settings, appearance, nav, domain, exports
│   ├── audience-routes.mjs     media, analytics, subscribers
│   ├── public.mjs              public/auth HTML templates
│   ├── dashboard.mjs           dashboard/editor/settings HTML templates
│   ├── content.mjs             raw-header parse/serialize, publish state
│   ├── markdown.mjs            marked + KaTeX + table wrapping
│   ├── directives.mjs          Bear-style template directives
│   ├── feeds.mjs               Atom, RSS, sitemap, robots, favicon
│   ├── stats.mjs               page-view recording and aggregation
│   ├── store.mjs               JSON schema, queries, seeds, atomic persistence
│   ├── security.mjs            sessions, CSRF, cookies, rate limits
│   ├── crypto.mjs              scrypt, tokens, hashing, safe comparison
│   └── dates.mjs               display and input date formatting
├── public/
│   ├── deer.css                public themes + dashboard styles
│   ├── app.js                  small dashboard-only behaviours
│   └── deer.svg                original deer mark
└── data/
    ├── store.json              generated local data (gitignored)
    └── uploads/                generated media (gitignored)
```

### Request flow

1. `server.mjs` reads the `Host` header.
2. The main host serves landing, auth, Discover, About, and `/dashboard/`.
3. A known subdomain or custom domain resolves to one blog and serves its
   public pages.
4. `/b/<subdomain>/…` resolves the same blog through a sandboxed path prefix.
5. Static assets and `/media/<blogId>/…` are served with path checks and
   long-lived immutable caching for media.

### Data model

The local store is a single JSON document with `users`, `blogs`, `posts`,
`sessions`, `resetTokens`, `subscribers`, `upvotes`, `hits`, and `uploads`.
Writes go to a temporary file and are renamed into place, so a crash cannot
leave a half-written store. This is a deliberate local-development choice, not
a production database.

### Security model

- Passwords use scrypt with a per-password salt; parameters are stored with the
  hash so they can be upgraded later.
- Session tokens are random 32-byte values. Only their SHA-256 hashes are
  stored. Cookies are `HttpOnly`, `SameSite=Lax`, and optionally `Secure`.
- CSRF uses a double-submit cookie plus a hidden form field, compared in
  constant time.
- Every dashboard lookup checks that the signed-in user owns the blog.
- HTML output is escaped by default. Blog owners may use raw HTML in their own
  posts, which is intentional, but owner content never runs on the main origin:
  path fallback and previews use `Content-Security-Policy: sandbox`.
- Uploads are size-limited, checked by magic bytes, stored under a per-blog
  directory, and served with `X-Content-Type-Options: nosniff`.
- Redirects after login only accept same-site absolute paths.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEERBLOG_HOST` | `localhost` | Public hostname used for blog origins and cookies |
| `DEERBLOG_PORT` | `8787` | Listening port |
| `DEERBLOG_BIND` | `127.0.0.1` | Bind address |
| `DEERBLOG_SECURE` | `0` | Set `1` when serving over HTTPS |
| `DEERBLOG_SECURE_COOKIES` | `0` | Set `1` to add `Secure` to cookies |
| `DEERBLOG_HASH_SECRET` | generated | Secret used for analytics visitor hashes |
| `DEERBLOG_DATA` | `deerblog/data` | Data directory |
| `DEERBLOG_TRUST_PROXY` | `0` | Trust `X-Forwarded-For` for client IPs |

Reset the local store at any time:

```bash
npm run deerblog:reset
```

This deletes `deerblog/data/store.json` and `deerblog/data/uploads/` and
reseeds the demo content. Stop the server first if it is already running.

## Known local limitations

- The JSON store is single-process and not safe for multiple server instances.
- There is no SMTP. Password-reset and subscriber flows show local links rather
  than sending mail.
- Payments are simulated by the plan toggle; there are no webhooks.
- Custom domains resolve through the `Host` header; real DNS and TLS
  certificates are out of scope.
- Uploaded images are validated by type but not re-encoded, so EXIF metadata and
  decompression bombs need production handling.
- There is no admin/moderation console, audit log, import tool, or public API.
- Session cookies are host-only. Draft preview links solve cross-host owner
  preview without weakening the cookie boundary; production can alternatively
  use a parent-domain cookie on a dedicated apex domain.
- `*.localhost` may require a browser that resolves loopback subdomains. Use the
  `/b/<subdomain>/` fallback if yours does not.

## Applying the architecture to the writer studio

The studio in `tools/studio/` is a local writing surface with a canvas. Deerblog
shows how the same server-side ideas can turn that surface into a multi-user
product:

| Deerblog concept | Writer studio equivalent |
| --- | --- |
| Blog | Project, notebook, or publication |
| Subdomain / custom domain | Workspace slug or published site domain |
| Post | Document, draft, or chapter |
| Page | Standalone page (About, colophon, landing) |
| Raw-header Markdown | Portable document source with front matter |
| Dashboard | Studio workspace and publishing controls |
| Media library | Shared assets with per-project quotas |
| Themes | Document and publication templates |
| Directives | Template slots for embeds, navigation, and components |
| Analytics | Reading and engagement metrics |
| Subscribers | Readers, newsletter list, or review circle |
| Discover | Public gallery or community feed |
| Exports | Backup, portability, and “leave whenever you want” |

The reusable core is the boundary between private editing and public reading:
authenticated ownership checks, a versioned content model, server-rendered
public output, tenant-aware host routing, media namespacing, feeds/sitemaps,
exports, and an analytics pipeline that does not depend on third-party scripts.
The studio can keep its richer client-side editing experience while publishing
through the same kind of narrow, auditable server surface.

For a real studio, the next changes would be collaborative editing (CRDT or
operational transforms), document revisions, workspace roles, background jobs,
object storage, PostgreSQL, transactional email, and a proper asset pipeline.
See [ENGINEERING.md](ENGINEERING.md) for the detailed production path.

## License and provenance

Deerblog is an original implementation. It does not include Bear Blog source
code, templates, or visual assets. Bear Blog's license restricts offering
substantial Bear functionality as a managed service; Deerblog is intended as a
local engineering study and a base for original work, not as a Bear clone to
operate commercially.
