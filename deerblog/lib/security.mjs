import crypto from "node:crypto";
import { randomToken, sha256, uid } from "./crypto.mjs";
import { store, saveStore } from "./store.mjs";

const SESSION_COOKIE = "deer_session";
const CSRF_COOKIE = "deer_csrf";
const VOTER_COOKIE = "deer_voter";
const SESSION_DAYS = 30;

export function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function cookie(name, value, { maxAge, httpOnly = true, sameSite = "Lax", path = "/" } = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (maxAge !== undefined) bits.push(`Max-Age=${Math.floor(maxAge)}`);
  if (httpOnly) bits.push("HttpOnly");
  if (process.env.DEERBLOG_SECURE_COOKIES === "1") bits.push("Secure");
  return bits.join("; ");
}

export function appendCookie(res, value) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) res.setHeader("Set-Cookie", value);
  else if (Array.isArray(existing)) res.setHeader("Set-Cookie", [...existing, value]);
  else res.setHeader("Set-Cookie", [String(existing), value]);
}

function setCookie(res, name, value, options) {
  appendCookie(res, cookie(name, value, options));
}

export function clearCookie(res, name) {
  appendCookie(res, cookie(name, "", { maxAge: 0 }));
}

export function ensureCsrf(req, res) {
  if (req._deerCsrf) return req._deerCsrf;
  const existing = parseCookies(req)[CSRF_COOKIE];
  const token = existing || randomToken(24);
  req._deerCsrf = token;
  if (!existing) {
    setCookie(res, CSRF_COOKIE, token, { maxAge: 60 * 60 * 24 * 365, sameSite: "Lax" });
  }
  return token;
}

export function csrfInput(req, res) {
  return `<input type="hidden" name="_csrf" value="${escapeAttr(ensureCsrf(req, res))}">`;
}

export function csrfToken(req, res) {
  return ensureCsrf(req, res);
}

export function verifyCsrf(req, fields = {}) {
  const cookieToken = parseCookies(req)[CSRF_COOKIE] || "";
  const sent = String(fields._csrf || req.headers["x-csrf"] || "");
  if (!cookieToken || !sent || cookieToken.length !== sent.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(sent));
  } catch {
    return false;
  }
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function createSession(res, userId) {
  const token = randomToken(32);
  const session = {
    id: uid(12),
    userId,
    tokenHash: sha256(token),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000).toISOString(),
  };
  store().sessions.push(session);
  saveStore().catch(() => {});
  setCookie(res, SESSION_COOKIE, token, {
    maxAge: SESSION_DAYS * 86400,
    sameSite: "Lax",
  });
  return session;
}

export function sessionFor(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const hash = sha256(token);
  const session = store().sessions.find((s) => s.tokenHash === hash) || null;
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
  return session;
}

export function currentUser(req) {
  const session = sessionFor(req);
  if (!session) return null;
  return store().users.find((u) => u.id === session.userId) || null;
}

export function currentAuth(req) {
  const session = sessionFor(req);
  if (!session) return { user: null, session: null };
  const user = store().users.find((u) => u.id === session.userId) || null;
  return { user, session };
}

export async function destroySession(req, res) {
  const session = sessionFor(req);
  if (session) {
    store().sessions = store().sessions.filter((s) => s.id !== session.id);
    await saveStore();
  }
  clearCookie(res, SESSION_COOKIE);
}

export function rotateSessionsFor(userId) {
  store().sessions = store().sessions.filter((s) => s.userId !== userId);
  return saveStore();
}

export function ensureVoter(req, res) {
  const cookies = parseCookies(req);
  if (cookies[VOTER_COOKIE]) return cookies[VOTER_COOKIE];
  const token = randomToken(18);
  setCookie(res, VOTER_COOKIE, token, { maxAge: 60 * 60 * 24 * 365, sameSite: "Lax" });
  return token;
}

export function voterFor(req) {
  return parseCookies(req)[VOTER_COOKIE] || "";
}

export function requestIp(req) {
  if (process.env.DEERBLOG_TRUST_PROXY === "1") {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress || "local";
}

/* Small in-process limiter. A real deployment needs Redis or another shared
   store so limits survive restarts and work across processes. */
const buckets = new Map();

export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.reset <= now) {
    bucket = { count: 0, reset: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count++;
  if (bucket.count > limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.reset - now) / 1000) };
  }
  return { ok: true, remaining: limit - bucket.count };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.reset <= now) buckets.delete(key);
}, 60000).unref();
