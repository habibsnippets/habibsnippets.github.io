import path from "node:path";
import { mkdir, writeFile, unlink } from "node:fs/promises";

import {
  store as db,
  saveStore,
  uploadsForBlog,
  subscribersForBlog,
  UPLOADS_DIR,
} from "./store.mjs";
import { uid, validEmail } from "./crypto.mjs";
import { verifyCsrf } from "./security.mjs";
import {
  isGet,
  readForm,
  readMultipart,
  sendDashboard,
  redirect,
  send,
  json,
  csv,
  wantsJson,
  tooMany,
  noticeFor,
  MAIN_ORIGIN,
  HttpError,
} from "./web.mjs";
import { renderMedia, renderAnalytics, renderSubscribers } from "./dashboard.mjs";
import { analyticsFor } from "./stats.mjs";

const MAX_UPLOAD = 10 * 1024 * 1024;

function methodNotAllowed(req, res, allow) {
  send(req, res, 405, "Method not allowed", {
    Allow: allow,
    "Content-Type": "text/plain; charset=utf-8",
  });
}

function csrfFail(req, res, wantsJsonResponse = false) {
  if (wantsJsonResponse) {
    json(req, res, 403, { ok: false, error: "The security token expired. Reload and try again." });
    return;
  }
  sendDashboard(
    req,
    res,
    403,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Form expired</title><link rel="stylesheet" href="/assets/deer.css"></head><body class="deer dashboard"><main class="narrow prose"><h1>That form expired</h1><p>Reload the page and try again.</p></main></body></html>`,
  );
}

function detectImage(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: "png", mime: "image/png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  if (buffer.length >= 6) {
    const head = buffer.subarray(0, 6).toString("ascii");
    if (head === "GIF87a" || head === "GIF89a") return { ext: "gif", mime: "image/gif" };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return { ext: "webp", mime: "image/webp" };
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") return { ext: "avif", mime: "image/avif" };
  }
  return null;
}

async function media(req, res, url, { user, blog, csrf, rest }) {
  if (rest === "media") {
    if (!isGet(req)) {
      methodNotAllowed(req, res, "GET");
      return true;
    }
    sendDashboard(
      req,
      res,
      200,
      renderMedia({
        user,
        blog,
        uploads: uploadsForBlog(blog.id),
        csrf,
        mainOrigin: MAIN_ORIGIN,
        notice: noticeFor(url),
      }),
    );
    return true;
  }

  if (rest === "media/upload") {
    if (req.method !== "POST") {
      methodNotAllowed(req, res, "POST");
      return true;
    }
    const jsonResponse = wantsJson(req);
    try {
      const { fields, files } = await readMultipart(req, MAX_UPLOAD + 1024 * 1024);
      if (!verifyCsrf(req, fields)) {
        csrfFail(req, res, jsonResponse);
        return true;
      }
      if (tooMany(req, res, `upload:${blog.id}`, { limit: 60, windowMs: 60 * 60 * 1000 })) return true;
      const file = files.find((item) => item.field === "file") || files[0];
      if (!file) throw new HttpError(400, "Choose an image to upload.");
      if (file.data.length > MAX_UPLOAD) throw new HttpError(413, "That image is larger than 10 MB.");
      const type = detectImage(file.data);
      if (!type) throw new HttpError(415, "Only PNG, JPEG, GIF, WebP, or AVIF images are accepted.");

      const base =
        String(file.filename || "image")
          .replace(/\.[^.]+$/, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 48) || "image";
      const filename = `${base}-${uid(6)}.${type.ext}`;
      const directory = path.join(UPLOADS_DIR, blog.id);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, filename), file.data);

      const upload = {
        id: uid(12),
        blogId: blog.id,
        filename,
        originalName: String(file.filename || filename).slice(0, 200),
        mime: type.mime,
        bytes: file.data.length,
        url: `/media/${blog.id}/${filename}`,
        createdAt: new Date().toISOString(),
      };
      db().uploads.push(upload);
      await saveStore();

      if (jsonResponse) {
        json(req, res, 201, { ok: true, url: upload.url, filename: upload.filename });
      } else {
        redirect(res, `/${blog.subdomain}/dashboard/media/?notice=media-uploaded`);
      }
      return true;
    } catch (err) {
      if (err instanceof HttpError) {
        if (jsonResponse) json(req, res, err.status, { ok: false, error: err.message });
        else redirect(res, `/${blog.subdomain}/dashboard/media/?error=upload`);
        return true;
      }
      throw err;
    }
  }

  const deletion = rest.match(/^media\/([A-Za-z0-9_-]+)\/delete$/);
  if (deletion) {
    if (req.method !== "POST") {
      methodNotAllowed(req, res, "POST");
      return true;
    }
    const fields = await readForm(req);
    if (!verifyCsrf(req, fields)) {
      csrfFail(req, res);
      return true;
    }
    const upload = db().uploads.find((item) => item.id === deletion[1] && item.blogId === blog.id);
    if (upload) {
      await unlink(path.join(UPLOADS_DIR, blog.id, upload.filename)).catch(() => {});
      db().uploads = db().uploads.filter((item) => item.id !== upload.id);
      await saveStore();
    }
    redirect(res, `/${blog.subdomain}/dashboard/media/?notice=media-deleted`);
    return true;
  }

  return false;
}

function subscribers(req, res, url, { user, blog, csrf, rest }) {
  const pro = user.plan === "pro";

  if (rest === "subscribers") {
    if (isGet(req)) {
      sendDashboard(
        req,
        res,
        200,
        renderSubscribers({
          user,
          blog,
          subscribers: subscribersForBlog(blog.id),
          csrf,
          mainOrigin: MAIN_ORIGIN,
          notice: noticeFor(url),
          error: url.searchParams.get("error") === "upload" ? "The upload did not work." : "",
        }),
      );
      return true;
    }
    if (req.method !== "POST") {
      methodNotAllowed(req, res, "GET, POST");
      return true;
    }
    if (!pro) {
      sendDashboard(
        req,
        res,
        403,
        renderSubscribers({
          user,
          blog,
          subscribers: [],
          csrf,
          mainOrigin: MAIN_ORIGIN,
          error: "Email subscribers are part of Deer Pro.",
        }),
      );
      return true;
    }
    return (async () => {
      const fields = await readForm(req);
      if (!verifyCsrf(req, fields)) {
        csrfFail(req, res);
        return true;
      }
      if (fields.remove) {
        db().subscribers = db().subscribers.filter(
          (item) => !(item.blogId === blog.id && item.id === fields.remove),
        );
        await saveStore();
        redirect(res, `/${blog.subdomain}/dashboard/subscribers/?notice=subscriber-removed`);
        return true;
      }
      const emails = String(fields.emails || "")
        .split(/[\s,;]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      const existing = new Set(
        db().subscribers
          .filter((item) => item.blogId === blog.id)
          .map((item) => item.email.toLowerCase()),
      );
      let added = 0;
      for (const email of emails) {
        if (!validEmail(email) || existing.has(email)) continue;
        existing.add(email);
        db().subscribers.push({
          id: uid(12),
          blogId: blog.id,
          email,
          createdAt: new Date().toISOString(),
        });
        added++;
      }
      if (added) await saveStore();
      redirect(res, `/${blog.subdomain}/dashboard/subscribers/?notice=subscribers-added`);
      return true;
    })();
  }

  if (rest === "subscribers/export.csv" || rest === "subscribers/export.txt") {
    if (!isGet(req)) {
      methodNotAllowed(req, res, "GET");
      return true;
    }
    if (!pro) {
      send(req, res, 403, "Email subscribers are part of Deer Pro.", {
        "Content-Type": "text/plain; charset=utf-8",
      });
      return true;
    }
    const list = subscribersForBlog(blog.id);
    if (rest.endsWith(".csv")) {
      const body = csv([["email", "created_at"], ...list.map((item) => [item.email, item.createdAt])]);
      send(req, res, 200, body, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${blog.subdomain}-subscribers.csv"`,
        "Cache-Control": "no-store",
      });
    } else {
      send(req, res, 200, `${list.map((item) => item.email).join("\n")}\n`, {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${blog.subdomain}-subscribers.txt"`,
        "Cache-Control": "no-store",
      });
    }
    return true;
  }

  return false;
}

async function analytics(req, res, { user, blog, csrf }) {
  if (!isGet(req)) {
    methodNotAllowed(req, res, "GET");
    return true;
  }
  sendDashboard(
    req,
    res,
    200,
    renderAnalytics({
      user,
      blog,
      stats: analyticsFor(blog),
      csrf,
      mainOrigin: MAIN_ORIGIN,
    }),
  );
  return true;
}

export async function handleAudienceRoute(req, res, url, { user, blog, csrf, rest }) {
  if (rest === "analytics") return analytics(req, res, { user, blog, csrf });
  if (rest === "media" || rest === "media/upload" || rest.startsWith("media/")) {
    return media(req, res, url, { user, blog, csrf, rest });
  }
  if (rest === "subscribers" || rest.startsWith("subscribers/")) {
    return subscribers(req, res, url, { user, blog, csrf, rest });
  }
  return false;
}
