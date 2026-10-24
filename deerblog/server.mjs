#!/usr/bin/env node
/* ============================================================
   Deerblog — an original, local study of a calm multi-tenant
   blogging platform.

     npm run deerblog         → http://localhost:8787
     npm run deerblog:reset   → wipe local data, reseed, start

   Public pages are server-rendered. The dashboard is the only
   place that loads JavaScript, and only for uploads, copy buttons,
   preview insertion, and destructive-action confirmations.

   Hosts:
     localhost:8787                main site + dashboard
     <subdomain>.localhost:8787    a user's blog
     <custom-domain>               resolved from the Host header
     /b/<subdomain>/…              sandboxed path fallback
   ============================================================ */

import http from "node:http";

import { initStore, blogBySubdomain } from "./lib/store.mjs";
import {
  PORT,
  BIND,
  SCHEME,
  MAIN_ORIGIN,
  PUBLIC_HOSTNAME,
  PORT_SUFFIX,
  isMainHost,
  resolveBlogForHost,
  requestHost,
  serveBuiltInAsset,
  serveMedia,
  send,
  redirect,
  simplePage,
  HttpError,
} from "./lib/web.mjs";
import { handleMain } from "./lib/main.mjs";
import { serveBlog } from "./lib/blog.mjs";

function errorText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function absolutePage(title, message, status = 404) {
  return {
    status,
    body: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${errorText(title)} – Deerblog</title>
<link rel="icon" href="/assets/deer.svg">
<link rel="stylesheet" href="/assets/deer.css">
</head>
<body class="deer deer-main-site">
<main class="narrow prose">
<p class="eyebrow">Deerblog</p>
<h1>${errorText(title)}</h1>
${message}
<p><a href="${MAIN_ORIGIN}/">Go to the main site</a> · <a href="${MAIN_ORIGIN}/discover/">Discover blogs</a></p>
</main>
</body>
</html>`,
  };
}

function missingFile(req, res) {
  const page = absolutePage("Not found", "<p>That file or page does not exist on this host.</p>");
  send(req, res, page.status, page.body, {
    "Content-Type": "text/html; charset=utf-8",
    "X-Robots-Tag": "noindex, nofollow",
    "Cache-Control": "no-store",
  });
}

function unknownHost(req, res) {
  const host = requestHost(req).hostname;
  const page = absolutePage(
    "No blog at this address",
    `<p>Deerblog does not know the host <code>${errorText(host)}</code>. If you are testing a custom domain locally, add it to <code>/etc/hosts</code> and make sure it is connected in the blog dashboard.</p>`,
  );
  send(req, res, page.status, page.body, {
    "Content-Type": "text/html; charset=utf-8",
    "X-Robots-Tag": "noindex, nofollow",
    "Cache-Control": "no-store",
  });
}

function internalError(req, res, err) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  if (err instanceof HttpError) {
    send(
      req,
      res,
      err.status,
      absolutePage(
        err.status === 413 ? "Request too large" : "Request problem",
        `<p>${errorText(err.message)}</p>`,
        err.status,
      ).body,
      {
        "Content-Type": "text/html; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
        ...err.headers,
      },
    );
    return;
  }
  console.error("[deerblog]", err);
  send(
    req,
    res,
    500,
    absolutePage(
      "Something went wrong",
      "<p>The server hit an unexpected error. The console has the details.</p>",
      500,
    ).body,
    { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  );
}

async function handleRequest(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  const pathname = url.pathname;

  if (await serveBuiltInAsset(req, res, pathname)) return;
  if (pathname.startsWith("/assets/") || pathname === "/favicon.ico") {
    missingFile(req, res);
    return;
  }
  if (pathname.startsWith("/media/")) {
    if (await serveMedia(req, res, pathname)) return;
    missingFile(req, res);
    return;
  }

  if (isMainHost(req)) {
    await handleMain(req, res, url);
    return;
  }

  const host = requestHost(req);
  const blog = resolveBlogForHost(host.hostname);
  if (!blog) {
    unknownHost(req, res);
    return;
  }

  const ownDashboard = new RegExp(
    `^/${blog.subdomain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/dashboard(?:/|$)`,
  );
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/") || ownDashboard.test(pathname)) {
    redirect(res, `${MAIN_ORIGIN}${pathname}${url.search}`, 308);
    return;
  }

  await serveBlog(req, res, url, blog, { prefix: "", sandbox: false });
}

async function main() {
  const reset = process.argv.includes("--reset");
  await initStore({ reset });

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => internalError(req, res, err));
  });

  server.listen(PORT, BIND, () => {
    const demo = blogBySubdomain("demo");
    console.log("");
    console.log(`  🦌 Deerblog is running at ${MAIN_ORIGIN}/`);
    console.log(`     Main + dashboard : ${MAIN_ORIGIN}/dashboard/`);
    console.log(`     Demo blog        : ${MAIN_ORIGIN}/b/demo/`);
    if (demo) {
      console.log(`     Subdomain form   : ${SCHEME}://demo.${PUBLIC_HOSTNAME}${PORT_SUFFIX}/`);
    }
    console.log(`     Demo account     : demo@deerblog.test / deerblog123`);
    console.log(`     Bind address     : ${BIND}:${PORT}`);
    if (reset) console.log("     Data was reset and reseeded.");
    console.log("");
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[deerblog] Port ${PORT} is already in use. Set DEERBLOG_PORT to another port.`);
    } else {
      console.error("[deerblog]", err);
    }
    process.exitCode = 1;
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
    });
  }
}

main();
