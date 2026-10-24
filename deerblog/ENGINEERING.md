# Deerblog engineering notes

Deerblog is a compact implementation of a hard product shape: many independent
blogs, one shared application, a private editor, public reading surfaces, and a
small business around plans, domains, subscribers, and analytics. The local
build deliberately stops short of production infrastructure, but the boundaries
are real. This document records the engineering challenges, the choices made
here, and what changes for a production deployment or for the writer studio.

## 1. System shape

```
Browser
  │
  ├── Host: localhost:8787              → main site, auth, dashboard
  ├── Host: demo.localhost:8787         → one public blog
  ├── Host: notes.example.test          → custom-domain blog
  └── Path: /b/demo/…                   → sandboxed fallback for the same blog
        │
        ▼
  server.mjs
        │  host resolution
        ├── main.mjs          landing, discover, about, sitemap
        ├── auth.mjs          signup, login, reset
        ├── blog.mjs          public posts, feeds, subscribe, upvotes
        ├── dashboard-routes.mjs
        ├── blog-settings-routes.mjs
        └── audience-routes.mjs
              │
              ▼
        store.mjs (JSON) + uploads/
```

Public pages are server-rendered strings. The dashboard is the only place that
loads JavaScript, and only for uploads, copy buttons, confirmations, and editor
conveniences. This keeps the public surface small, cacheable, and easy to audit.

The data model is intentionally plain:

- `users` own `blogs`
- `blogs` own `posts`, `subscribers`, `hits`, and `uploads`
- `posts` are posts or pages, with raw-header metadata and Markdown content
- `sessions` store token hashes, never raw tokens
- `upvotes` deduplicate by post and visitor hash

## 2. Multi-tenancy, DNS, TLS, and the cookie boundary

The central challenge is that “one application” must behave like many
independent sites.

### Host routing

`lib/web.mjs` resolves a request in this order:

1. Main host (`localhost`, `127.0.0.1`, configured `DEERBLOG_HOST`).
2. A known subdomain of the configured public hostname.
3. A custom domain stored on a blog.
4. Unknown host → 404 page.

The path fallback (`/b/<subdomain>/…`) exists because `*.localhost` is not
universally resolved by every client. It is a development convenience and a
security compromise: all path-fallback blogs share the main origin. Deerblog
therefore serves those pages with `Content-Security-Policy: sandbox` and a
visible “path preview” banner. Owner scripts and forms cannot run there.

### Production DNS and certificates

A real deployment needs:

- An apex domain for the application and a wildcard DNS record for blog
  subdomains (`*.deerblog.example`).
- Per-custom-domain verification. The current build trusts the `Host` header
  once a domain is saved; production should require a DNS TXT or CNAME proof
  before routing traffic.
- On-demand TLS (for example, a reverse proxy that asks the application whether
  a hostname is allowed before issuing a certificate). A wildcard certificate
  covers subdomains but not arbitrary custom domains.
- Apex/`www` normalization rules and explicit handling for domains that point at
  the platform but are not connected.
- A clear 404/“domain not connected” page that does not leak whether a domain
  belongs to another account.

### Cookies across hosts

Session cookies are host-only. That is a deliberate security boundary: a script
on `demo.localhost` should not automatically receive a dashboard session for
`localhost`. The tradeoff is that an owner cannot view a draft on the blog's own
subdomain just by being signed in on the main host.

Deerblog solves this with read-only draft preview links:

```
https://demo.example/post-slug/?preview=<random-token>
```

The token is generated per post, compared in constant time, and only unlocks an
unpublished post. The preview is `noindex`, `no-store`, and sandboxed. A
production system can choose among:

- signed, expiring preview URLs (best default),
- a parent-domain cookie scoped to a dedicated apex domain, with CSRF and
  origin checks adjusted accordingly,
- a separate preview hostname with its own auth flow.

The important rule is not to widen the session cookie just to make previews
convenient.

## 3. Identity, sessions, CSRF, and abuse resistance

### Password storage

Passwords use scrypt with a 16-byte salt and parameters stored in the hash
string. The format allows future upgrades without invalidating existing hashes.
The implementation uses `crypto.timingSafeEqual` for verification.

Production additions:

- breached-password checks,
- optional MFA/passkeys,
- login notifications,
- stricter password policy or entropy estimation,
- pepper management if a secret is stored outside the database.

### Sessions

Session tokens are 32 random bytes. The store keeps only SHA-256 hashes. Cookies
are `HttpOnly`, `SameSite=Lax`, and optionally `Secure`. Sessions expire after
30 days. Password changes and account deletion rotate or remove sessions.

Production additions:

- idle timeout in addition to absolute expiry,
- session listing and remote revocation,
- device metadata,
- rotation on privilege changes,
- a shared session store (Redis/Postgres) for multiple app instances.

### CSRF

Deerblog uses double-submit CSRF: a random cookie plus a hidden `_csrf` field.
The comparison is constant-time. Every state-changing form must include the
field; missing or stale tokens return 403. This works because the app does not
accept cross-site form posts and uses `SameSite=Lax` cookies.

Production additions:

- explicit `Origin`/`Referer` checks,
- per-form or per-session tokens if the product grows sensitive actions,
- careful handling of custom domains (each origin has its own cookie jar).

### Rate limits and enumeration

`lib/security.mjs` has in-memory per-IP buckets for login, signup, password
reset, subscribe, and upvote. This is enough for a local demo but not for a
multi-instance deployment. Production needs a shared limiter (Redis or a edge
WAF), progressive delays, and monitoring.

Login and password-reset responses should not reveal whether an email exists.
Deerblog returns the same “check your email” style response for reset requests;
production should preserve that property in the mail path too.

### Password reset

Reset tokens are random, hashed at rest, single-use, and time-limited. A
successful reset invalidates the token. Production adds email delivery,
deliverability monitoring, and a rule that reset links are invalidated by a
password change or account deletion.

## 4. Tenant isolation and XSS

This is the most important security boundary in a blogging platform.

### Authorization

Every dashboard route resolves the blog from the URL and then checks
`blog.userId === user.id`. A signed-in user cannot edit another user's blog by
changing the subdomain in the URL. Post, page, media, subscriber, and export
routes repeat the ownership check rather than trusting a hidden form field.

Production should centralize this in a policy layer and add tests for every
route. The current build relies on route-level checks; a missed check is a
tenant-isolation bug.

### Raw HTML and custom CSS

Blog owners are allowed to write raw HTML in their own posts and custom CSS in
their own theme. That is a feature of a blogging platform, but it means owner
content is untrusted from the platform's perspective.

The origin boundary is the main defense:

- Each blog normally lives on its own subdomain or custom domain.
- The main application origin never renders owner HTML.
- Path fallback and previews are sandboxed.
- Custom CSS is scoped to the blog document; it cannot run JavaScript.
- `headerDirective` and `footerDirective` are owner-controlled raw HTML, so they
  are only safe on the blog's own origin.

A production platform should also consider:

- a strict CSP on public blogs, with an explicit allowlist for embeds,
- sanitizing or gating `<script>` in posts,
- a separate “unsafe custom code” plan or review flow,
- subresource integrity for shared assets,
- isolating user-uploaded SVG (Deerblog only accepts raster formats).

### Media

Uploads are checked by magic bytes, limited to 10 MB, renamed with random
suffixes, and stored under `uploads/<blogId>/`. They are served with a long
cache lifetime and `nosniff`. The path is validated before reading.

Production still needs:

- image re-encoding to strip EXIF/GPS and normalize formats,
- decompression-bomb limits (pixel dimensions, not just bytes),
- malware scanning,
- per-plan quotas and bandwidth accounting,
- object storage and a CDN,
- lifecycle rules for deleted blogs and orphaned files.

## 5. Content model and the raw editor

The editor is deliberately close to the file format. A post is a header block
followed by Markdown:

```text
title: ...
link: ...
alias: ...
published_date: ...
tags: ...
meta_description: ...
canonical_url: ...
is_page: false
discoverable: true

Body
```

### Parsing

`lib/content.mjs` accepts a blank line or `___` as the separator, validates
known headers, rejects unknown ones, normalizes slugs and aliases, and
serializes the post back to the editor. Keeping the source format readable makes
exports trustworthy and makes the editor portable.

### Publishing state

A post is public when `publish` is true and its `publishedDate` is not in the
future. Drafts are visible only to the owner or through a preview token. Pages
are public but excluded from the blog index and feeds.

Production additions:

- explicit revision history with diffs and restore,
- autosave with conflict detection,
- collaborative editing (CRDT/OT) if multiple authors are needed,
- scheduled publishing via a job queue rather than request-time checks,
- content sanitization policy per plan,
- importers for Markdown, WordPress, and Bear-style exports.

### Markdown and directives

`lib/markdown.mjs` uses `marked` and KaTeX. Tables are wrapped in a scroll
container. `lib/directives.mjs` resolves template expressions after rendering,
while protecting `<pre>` and `<code>` blocks so tutorials can show the syntax.

Directives are intentionally small and deterministic. A production version
should treat them as a template language with a documented allowlist, not as
arbitrary code execution.

## 6. Analytics without surveillance

Deerblog records a page view only when:

- the response is HTML,
- analytics is enabled for the blog,
- the user agent does not look like a bot,
- the path is a public post or home page.

It stores a daily timestamp, path, referrer, device/browser bucket, and a
visitor hash derived from IP + user agent + a server secret. It does not store
raw IPs or set analytics cookies. The dashboard aggregates the last 30 days.

Production considerations:

- hash rotation and retention policy,
- aggregation tables or a columnar store instead of raw rows,
- bot detection beyond user-agent matching,
- consent requirements by jurisdiction,
- sampling for very large blogs,
- separation of public analytics from owner-only dashboards,
- protection against forged page views.

The current JSON store is fine for a demo but not for high write volume. A
production schema would write page views asynchronously (queue or batched
inserts) and pre-aggregate daily totals.

## 7. Subscribers and email deliverability

The local build stores subscribers and exports CSV/TXT. There is no SMTP. A
real product needs:

- double opt-in and a confirmation token,
- unsubscribe links with signed tokens,
- SPF, DKIM, and DMARC for the sending domain,
- bounce and complaint processing,
- suppression lists and reputation monitoring,
- a queue with retries and idempotency,
- per-blog sender identities and reply-to handling,
- GDPR/CCPA deletion and export,
- rate limits and abuse controls for imports.

Email is one of the hardest operational parts of a blogging product. It should
be isolated behind a provider adapter, with webhooks feeding a delivery event
table.

## 8. Plans, payments, and entitlements

Deerblog simulates plans with a toggle. The real flow needs:

- a payment provider (Stripe or equivalent),
- checkout sessions and customer portal links,
- webhook signature verification,
- idempotent webhook processing,
- entitlement checks on every gated action (custom domain, subscribers, blog
  count, storage),
- grace periods, dunning, refunds, and downgrade behavior,
- tax/VAT handling,
- audit logs for plan changes.

Never trust a plan field posted by the browser. The server must derive
entitlements from its own subscription record.

## 9. Discovery, upvotes, and moderation

Discover lists public, discoverable posts. Upvotes are deduplicated by a
visitor cookie hash and post. Production needs:

- ranking that resists spam and vote rings,
- rate limits and anomaly detection,
- report/block/mute flows,
- a moderation queue and admin console,
- legal takedown handling,
- NSFW/spam classification,
- per-blog opt-out and per-post opt-out,
- transparent appeal paths.

A shared Discover feed also creates a cache-invalidation problem: publishing,
unpublishing, or changing discoverability must update the feed promptly or
within a documented delay.

## 10. SEO, feeds, and caching

The public surface emits canonical URLs, Open Graph/Twitter metadata, Atom/RSS,
sitemaps, robots.txt, and per-blog favicons. Correctness details matter:

- canonical URLs use the blog's real origin, not the path fallback,
- aliases redirect but do not become canonical,
- drafts and future posts never enter sitemaps or feeds,
- pages enter the sitemap but not the feed,
- `noindex` is applied to previews, 404s, and error pages,
- feeds escape XML and use absolute URLs,
- custom domains do not leak the platform subdomain in canonical links.

Production adds ETags, conditional requests, CDN caching with purge-on-publish,
and a clear cache key that includes host and path.

## 11. Persistence, scale, and reliability

### Current store

`lib/store.mjs` keeps everything in memory and persists a single JSON document
with a write-temp-then-rename strategy. This is simple, inspectable, and fast
for local use. It is not safe for multiple processes, large datasets, or
concurrent writers.

### Production schema

A relational database is the natural fit:

```
users(id, email, password_hash, plan, created_at)
blogs(id, user_id, subdomain, domain, title, theme, settings…)
posts(id, blog_id, slug, alias, title, content, publish, published_at, …)
post_revisions(id, post_id, content, created_at, author_id)
sessions(id, user_id, token_hash, expires_at, …)
subscribers(id, blog_id, email, confirmed_at, unsubscribed_at, …)
page_views(id, blog_id, post_id, path, created_at, visitor_hash, …)
upvotes(post_id, voter_hash, created_at)
uploads(id, blog_id, key, content_type, bytes, created_at)
```

Indexes: `blogs(subdomain)`, `blogs(domain)`, `posts(blog_id, slug)`,
`posts(blog_id, publish, published_at)`, `sessions(token_hash)`,
`subscribers(blog_id, email)`, `page_views(blog_id, created_at)`.

Use transactions for blog deletion, account deletion, and plan changes. Use
foreign keys with deliberate cascade behavior. Keep raw content and rendered
content separate if rendering is expensive; otherwise render on read and cache.

### Backups and observability

Production needs:

- automated backups with restore drills,
- point-in-time recovery,
- structured logs with request IDs,
- metrics for latency, error rate, queue depth, and publish failures,
- tracing for the host-resolution and rendering path,
- alerts for certificate expiry, email bounce spikes, and payment webhook
  failures,
- audit logs for admin and destructive actions.

## 12. Deployment and performance

The local server is a single Node process. A production deployment would put a
reverse proxy or edge in front for TLS, compression, static assets, rate
limiting, and DDoS protection. The app can remain a stateless Node service if
sessions and data move to shared stores.

Performance work:

- cache rendered public pages by host + path + content version,
- purge on publish/unpublish/settings change,
- serve media from object storage/CDN,
- stream large exports instead of building them in memory,
- paginate everything,
- cap feed size,
- avoid loading all posts for analytics or discover,
- use prepared statements and connection pooling.

## 13. Testing strategy

The local build was exercised with end-to-end HTTP smoke tests covering:

- landing, auth, static assets, sitemaps, robots,
- signup, login, logout, reset, password change,
- post/page create, publish, unpublish, scheduling, aliases,
- preview CSP and invalid headers,
- settings, themes, navigation, directives, custom domains,
- media upload/delete and subscriber export,
- analytics recording, upvotes, plan gates,
- ownership isolation, CSRF failures, path traversal, open redirects,
- Atom/RSS/sitemap XML validity.

Production should add:

- unit tests for parsing, dates, directives, and entitlement rules,
- property tests for slug/alias normalization,
- route-level authorization matrix tests,
- browser tests for the editor and responsive layouts,
- load tests for feeds, Discover, and analytics writes,
- fuzzing for multipart and Markdown input,
- dependency and container scanning.

## 14. Applying this to the writer studio

The studio is a local writing surface with a canvas. Deerblog contributes the
publishing half of the product. The mapping is direct:

| Deerblog | Studio |
| --- | --- |
| User | Writer/editor account |
| Blog | Project, notebook, or publication |
| Post | Document or chapter |
| Page | Standalone page |
| Raw header | Front matter / document metadata |
| Theme | Publication template |
| Directive | Template slot or embed |
| Media | Project asset |
| Subscriber | Reader / reviewer / newsletter contact |
| Analytics | Reading and engagement metrics |
| Discover | Public gallery or community feed |
| Export | Backup and portability |

### What transfers unchanged

- Host-aware public routing and canonical URLs.
- Ownership checks at every mutation.
- Server-rendered public pages with a small, auditable surface.
- Raw Markdown/front-matter storage and export.
- Media namespacing and validation.
- Draft previews with unguessable links.
- Feeds, sitemaps, robots, and SEO metadata.
- Plan/entitlement checks.
- Privacy-friendly analytics.

### What the studio needs beyond Deerblog

- **Collaboration:** CRDT or OT, presence, comments, and conflict resolution.
  This changes the document model from “last write wins” to a versioned log.
- **Revisions:** every save should produce a revision with author, timestamp,
  and a diff. Restoring a revision should create a new revision, not rewrite
  history.
- **Permissions:** workspace roles (owner, editor, commenter, viewer) and
  per-document sharing. Deerblog's single-owner model is not enough.
- **Canvas assets:** the canvas produces images and structured scenes. Treat
  them as first-class assets with stable IDs, thumbnails, and a render pipeline.
- **Offline and autosave:** local-first editing with a sync queue and explicit
  conflict UI.
- **Publishing pipeline:** preview builds, scheduled releases, custom domains,
  and cache invalidation.
- **Notifications:** comments, mentions, review requests, and publish events.
- **Search:** full-text search across documents and revisions.
- **Billing:** seats, storage, custom domains, and usage-based limits.
- **Audit and compliance:** export, deletion, retention, and access logs.

### A practical migration path

1. Keep the studio's editor and canvas client-side.
2. Replace local-only persistence with a document API that stores front matter,
   body, and canvas asset references.
3. Add revisions and ownership checks before adding collaboration.
4. Reuse Deerblog's public renderer for a “publish” target, initially on a
   subdomain.
5. Add media storage and a CDN.
6. Add analytics and subscribers only after publishing is stable.
7. Add plans and custom domains last; they multiply operational complexity.

The architectural lesson is that a writing product is two systems with a narrow
waist: a rich private editor and a constrained public publishing surface. Keeping
that waist explicit — content format, ownership, rendering, caching, and
exports — is what makes both Deerblog and a studio maintainable.

## 15. Production readiness checklist

- [ ] PostgreSQL with migrations and backups
- [ ] Shared session and rate-limit store
- [ ] Real DNS verification and on-demand TLS
- [ ] Parent-domain or signed preview strategy documented and tested
- [ ] SMTP provider with SPF/DKIM/DMARC and bounce handling
- [ ] Payment provider with signed, idempotent webhooks
- [ ] Image re-encoding, EXIF stripping, malware scanning, quotas
- [ ] Object storage and CDN with purge-on-publish
- [ ] Moderation, reporting, and admin audit tools
- [ ] Structured logs, metrics, tracing, and alerts
- [ ] Load tests for feeds, Discover, analytics, and exports
- [ ] Authorization matrix tests for every route
- [ ] Import/export compatibility tests
- [ ] Clear license and terms for user content

Deerblog intentionally leaves these as documented gaps rather than pretending a
single JSON file is a platform. The local build is complete enough to exercise
the product shape; the checklist is the distance between that shape and an
operable service.
