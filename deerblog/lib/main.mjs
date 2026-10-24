import {
  store as db,
  blogBySubdomain,
  allPublicPosts,
} from "./store.mjs";
import { currentAuth, csrfToken } from "./security.mjs";
import {
  MAIN_ORIGIN,
  blogOrigin,
  isGet,
  html,
  send,
  redirect,
  xml,
  HttpError,
} from "./web.mjs";
import {
  renderLanding,
  renderDiscover,
  renderMain404,
  renderAbout,
} from "./public.mjs";
import { handleAuth } from "./auth.mjs";
import { handleDashboard } from "./dashboard-routes.mjs";
import { serveBlog } from "./blog.mjs";

function csrfFor(req, res, user) {
  return user ? csrfToken(req, res) : "";
}

function main404(req, res) {
  const { user } = currentAuth(req);
  html(req, res, 404, renderMain404({ user, origin: MAIN_ORIGIN, csrf: csrfFor(req, res, user) }), {
    "X-Robots-Tag": "noindex, nofollow",
  });
}

function landing(req, res) {
  const { user } = currentAuth(req);
  send(
    req,
    res,
    200,
    renderLanding({
      latest: allPublicPosts({ discoverOnly: true }),
      blogs: db().blogs,
      user,
      origin: MAIN_ORIGIN,
      csrf: csrfFor(req, res, user),
    }),
    { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  );
}

function discover(req, res, url) {
  const { user } = currentAuth(req);
  const query = String(url.searchParams.get("q") || "").trim();
  const needle = query.toLowerCase();
  let posts = allPublicPosts({ discoverOnly: true });
  if (needle) {
    posts = posts.filter((post) => {
      const haystack = [
        post.title,
        post.metaDescription,
        (post.tags || []).join(" "),
        String(post.content || "").slice(0, 4000),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }
  html(
    req,
    res,
    200,
    renderDiscover({
      posts: posts.slice(0, 100),
      blogs: db().blogs,
      query,
      origin: MAIN_ORIGIN,
      user,
      csrf: csrfFor(req, res, user),
    }),
  );
}

function randomPost(req, res) {
  const posts = allPublicPosts({ discoverOnly: true });
  if (!posts.length) {
    redirect(res, "/discover/");
    return;
  }
  const post = posts[Math.floor(Math.random() * posts.length)];
  const blog = db().blogs.find((item) => item.id === post.blogId);
  if (!blog) {
    redirect(res, "/discover/");
    return;
  }
  redirect(res, `/b/${blog.subdomain}/${post.slug}/`);
}

function about(req, res) {
  const { user } = currentAuth(req);
  html(
    req,
    res,
    200,
    renderAbout({ user, origin: MAIN_ORIGIN, csrf: csrfFor(req, res, user) }),
  );
}

function mainSitemap(req, res) {
  const urls = [
    { loc: `${MAIN_ORIGIN}/`, lastmod: new Date().toISOString().slice(0, 10) },
    { loc: `${MAIN_ORIGIN}/discover/`, lastmod: new Date().toISOString().slice(0, 10) },
    { loc: `${MAIN_ORIGIN}/about/`, lastmod: new Date().toISOString().slice(0, 10) },
  ];
  for (const blog of db().blogs) {
    urls.push({ loc: `${blogOrigin(blog)}/`, lastmod: blog.lastModified });
    urls.push({ loc: `${blogOrigin(blog)}/${blog.blogPath || "blog"}/`, lastmod: blog.lastModified });
  }
  const body = urls
    .map(
      (item) => `  <url><loc>${xml(item.loc)}</loc>${
        item.lastmod ? `<lastmod>${xml(new Date(item.lastmod).toISOString())}</lastmod>` : ""
      }</url>`,
    )
    .join("\n");
  send(
    req,
    res,
    200,
    `<?xml version="1.0" encoding="utf-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`,
    { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
  );
}

function mainRobots(req, res) {
  send(
    req,
    res,
    200,
    `User-agent: *\nAllow: /\n\nSitemap: ${MAIN_ORIGIN}/sitemap.xml\n`,
    { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  );
}

async function pathFallback(req, res, url, subdomain) {
  const blog = blogBySubdomain(subdomain);
  if (!blog) {
    main404(req, res);
    return;
  }
  const prefix = `/b/${blog.subdomain}`;
  await serveBlog(req, res, url, blog, { prefix, sandbox: true });
}

export async function handleMain(req, res, url) {
  const pathname = url.pathname;

  /* Path fallback for blogs. This is useful when .localhost subdomains are
     unavailable, and is intentionally sandboxed by serveBlog. */
  const fallback = pathname.match(/^\/b\/([a-zA-Z0-9-]+)(\/.*)?$/);
  if (fallback) {
    if (!fallback[2]) {
      redirect(res, `/b/${fallback[1].toLowerCase()}/${url.search}`, 308);
      return true;
    }
    await pathFallback(req, res, url, fallback[1].toLowerCase());
    return true;
  }

  if (await handleAuth(req, res, url, pathname)) return true;

  if (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    /^\/[a-z0-9-]+\/dashboard(?:\/|$)/.test(pathname)
  ) {
    if (await handleDashboard(req, res, url, pathname)) return true;
    main404(req, res);
    return true;
  }

  if (pathname === "/") {
    if (!isGet(req)) {
      send(req, res, 405, "Method not allowed", { Allow: "GET", "Content-Type": "text/plain" });
      return true;
    }
    landing(req, res);
    return true;
  }

  if (pathname === "/discover") {
    redirect(res, `/discover/${url.search}`, 308);
    return true;
  }
  if (pathname === "/discover/") {
    if (!isGet(req)) {
      send(req, res, 405, "Method not allowed", { Allow: "GET", "Content-Type": "text/plain" });
      return true;
    }
    discover(req, res, url);
    return true;
  }
  if (pathname === "/discover/random" || pathname === "/discover/random/") {
    randomPost(req, res);
    return true;
  }

  if (pathname === "/about") {
    redirect(res, `/about/${url.search}`, 308);
    return true;
  }
  if (pathname === "/about/") {
    about(req, res);
    return true;
  }

  if (pathname === "/sitemap.xml") {
    mainSitemap(req, res);
    return true;
  }
  if (pathname === "/robots.txt") {
    mainRobots(req, res);
    return true;
  }
  if (pathname === "/favicon.svg") {
    redirect(res, "/assets/deer.svg", 302);
    return true;
  }

  /* Slashless aliases for the fixed auth and dashboard routes. */
  const slashMap = new Map([
    ["/signup", "/signup/"],
    ["/login", "/login/"],
    ["/forgot", "/forgot/"],
    ["/reset", "/reset/"],
    ["/logout", "/logout/"],
  ]);
  if (slashMap.has(pathname)) {
    redirect(res, `${slashMap.get(pathname)}${url.search}`, 308);
    return true;
  }

  main404(req, res);
  return true;
}

export { HttpError };
