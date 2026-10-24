import {
  store as db,
  saveStore,
  userByEmail,
  blogBySubdomain,
} from "./store.mjs";
import {
  hashPassword,
  verifyPassword,
  normalizeEmail,
  validEmail,
  passwordProblem,
  randomToken,
  sha256,
  uid,
} from "./crypto.mjs";
import {
  currentAuth,
  createSession,
  destroySession,
  csrfToken,
  verifyCsrf,
} from "./security.mjs";
import {
  MAIN_ORIGIN,
  cleanSubdomain,
  makeBlog,
  subdomainProblem,
  plainText,
  isGet,
  readForm,
  html,
  redirect,
  simplePage,
  tooMany,
  safeNext,
  noticeFor,
  HttpError,
} from "./web.mjs";
import {
  renderSignupStep1,
  renderSignupStep2,
  renderLogin,
  renderForgot,
  renderReset,
} from "./public.mjs";

function authPage(req, res, status, body, extraHeaders = {}) {
  html(req, res, status, body, {
    "X-Robots-Tag": "noindex, nofollow",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
}

function csrfFail(req, res) {
  authPage(
    req,
    res,
    403,
    simplePage(
      "That form expired",
      "<p>The security token for this form is missing or stale. Go back, reload the page, and try again.</p>",
    ),
  );
}

function methodNotAllowed(req, res, allow) {
  html(req, res, 405, simplePage("Method not allowed", "<p>That request is not valid here.</p>"), {
    Allow: allow,
  });
}

function resetTokenRecord(token) {
  if (!token) return null;
  const hash = sha256(token);
  const record = db().resetTokens.find((item) => item.tokenHash === hash);
  if (!record) return null;
  if (new Date(record.expiresAt).getTime() <= Date.now()) return null;
  return record;
}

async function signup(req, res) {
  const existing = currentAuth(req).user;
  if (existing) {
    redirect(res, "/dashboard/");
    return;
  }

  if (isGet(req)) {
    authPage(
      req,
      res,
      200,
      renderSignupStep1({
        values: {},
        errors: [],
        user: null,
        origin: MAIN_ORIGIN,
        csrf: csrfToken(req, res),
      }),
    );
    return;
  }
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "GET, POST");
    return;
  }

  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return;
  }
  if (tooMany(req, res, "signup", { limit: 12, windowMs: 60 * 60 * 1000 })) return;

  const values = {
    title: String(fields.title || "").trim().slice(0, 200),
    subdomain: cleanSubdomain(fields.subdomain),
    content: String(fields.content || "").trim().slice(0, 100000),
    email: normalizeEmail(fields.email),
    password: String(fields.password || ""),
  };
  const isStep2 = ["email", "password", "agree"].some((key) => key in fields);

  const blogErrors = [];
  if (!values.title) blogErrors.push("Give your blog a title.");
  const subProblem = subdomainProblem(values.subdomain);
  if (subProblem) blogErrors.push(subProblem);
  else if (blogBySubdomain(values.subdomain)) blogErrors.push("That subdomain is already taken.");
  if (!values.content) blogErrors.push("Write a little homepage text so the page is not empty.");

  const accountErrors = [];
  if (isStep2) {
    if (!validEmail(values.email)) accountErrors.push("Enter a valid email address.");
    else if (userByEmail(values.email)) accountErrors.push("An account with that email already exists.");
    const passwordProblemText = passwordProblem(values.password);
    if (passwordProblemText) accountErrors.push(passwordProblemText);
    if (fields.agree !== "on") accountErrors.push("Please accept the local terms.");
  }

  if (!isStep2) {
    if (blogErrors.length) {
      authPage(
        req,
        res,
        400,
        renderSignupStep1({
          values,
          errors: blogErrors,
          user: null,
          origin: MAIN_ORIGIN,
          csrf: csrfToken(req, res),
        }),
      );
      return;
    }
    authPage(
      req,
      res,
      200,
      renderSignupStep2({
        values,
        errors: [],
        user: null,
        origin: MAIN_ORIGIN,
        csrf: csrfToken(req, res),
      }),
    );
    return;
  }

  if (blogErrors.length) {
    authPage(
      req,
      res,
      400,
      renderSignupStep1({
        values,
        errors: blogErrors,
        user: null,
        origin: MAIN_ORIGIN,
        csrf: csrfToken(req, res),
      }),
    );
    return;
  }
  if (accountErrors.length) {
    authPage(
      req,
      res,
      400,
      renderSignupStep2({
        values,
        errors: accountErrors,
        user: null,
        origin: MAIN_ORIGIN,
        csrf: csrfToken(req, res),
      }),
    );
    return;
  }

  /* Re-check uniqueness after the expensive hash and before committing. */
  if (blogBySubdomain(values.subdomain)) {
    authPage(
      req,
      res,
      409,
      renderSignupStep1({
        values,
        errors: ["That subdomain was just taken. Pick another one."],
        user: null,
        origin: MAIN_ORIGIN,
        csrf: csrfToken(req, res),
      }),
    );
    return;
  }
  if (userByEmail(values.email)) {
    authPage(
      req,
      res,
      409,
      renderSignupStep2({
        values,
        errors: ["That email was just registered. Log in instead."],
        user: null,
        origin: MAIN_ORIGIN,
        csrf: csrfToken(req, res),
      }),
    );
    return;
  }

  const user = {
    id: uid(16),
    email: values.email,
    passwordHash: await hashPassword(values.password),
    createdAt: new Date().toISOString(),
    plan: "free",
    maxBlogs: 1,
    dashboardStyles: "",
    dashboardFooter: "",
  };
  const blog = makeBlog({
    userId: user.id,
    title: values.title,
    subdomain: values.subdomain,
    content: values.content,
  });
  blog.metaDescription = plainText(values.content, 160);

  db().users.push(user);
  db().blogs.push(blog);
  await saveStore();
  createSession(res, user.id);
  redirect(res, `/${blog.subdomain}/dashboard/?notice=welcome`);
}

async function login(req, res, url) {
  const existing = currentAuth(req).user;
  if (existing) {
    redirect(res, "/dashboard/");
    return;
  }

  const notice = noticeFor(url) || (url.searchParams.get("notice") === "password-updated" ? "Password updated. Log in with your new password." : "");

  if (isGet(req)) {
    authPage(
      req,
      res,
      200,
      renderLogin({
        email: "",
        next: url.searchParams.get("next") || "",
        notice,
        user: null,
        origin: MAIN_ORIGIN,
        csrf: csrfToken(req, res),
      }),
    );
    return;
  }
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "GET, POST");
    return;
  }

  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return;
  }

  const email = normalizeEmail(fields.email);
  const password = String(fields.password || "");
  const next = safeNext(fields.next);

  if (tooMany(req, res, `login-account:${email}`, { limit: 12, windowMs: 10 * 60 * 1000 })) return;
  if (tooMany(req, res, "login-ip", { limit: 40, windowMs: 10 * 60 * 1000 })) return;

  const user = userByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    authPage(
      req,
      res,
      401,
      renderLogin({
        email,
        next,
        error: "That email and password do not match. Try again.",
        user: null,
        origin: MAIN_ORIGIN,
        csrf: csrfToken(req, res),
      }),
    );
    return;
  }

  createSession(res, user.id);
  redirect(res, next);
}

async function logout(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "POST");
    return;
  }
  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return;
  }
  await destroySession(req, res);
  redirect(res, "/");
}

async function forgot(req, res) {
  if (isGet(req)) {
    authPage(
      req,
      res,
      200,
      renderForgot({
        user: null,
        origin: MAIN_ORIGIN,
        csrf: csrfToken(req, res),
      }),
    );
    return;
  }
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "GET, POST");
    return;
  }

  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return;
  }
  if (tooMany(req, res, "forgot", { limit: 8, windowMs: 60 * 60 * 1000 })) return;

  const email = normalizeEmail(fields.email);
  if (!validEmail(email)) {
    authPage(
      req,
      res,
      400,
      renderForgot({
        error: "Enter a valid email address.",
        user: null,
        origin: MAIN_ORIGIN,
        csrf: csrfToken(req, res),
      }),
    );
    return;
  }

  const user = userByEmail(email);
  let link = "";
  if (user) {
    const token = randomToken(32);
    db().resetTokens = db().resetTokens.filter(
      (item) => item.userId !== user.id || new Date(item.expiresAt).getTime() > Date.now(),
    );
    db().resetTokens.push({
      id: uid(12),
      userId: user.id,
      tokenHash: sha256(token),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    await saveStore();
    link = `${MAIN_ORIGIN}/reset/?token=${encodeURIComponent(token)}`;
  }

  authPage(
    req,
    res,
    200,
    renderForgot({
      link,
      notice: link
        ? "Local demo: no email is sent. Use the link below within one hour."
        : "If an account exists for that address, a reset link would be sent. Nothing was revealed here.",
      user: null,
      origin: MAIN_ORIGIN,
      csrf: csrfToken(req, res),
    }),
  );
}

async function reset(req, res, url) {
  if (isGet(req)) {
    const token = url.searchParams.get("token") || "";
    if (!resetTokenRecord(token)) {
      authPage(
        req,
        res,
        400,
        renderForgot({
          error: "That reset link is invalid or has expired. Request a new one.",
          user: null,
          origin: MAIN_ORIGIN,
          csrf: csrfToken(req, res),
        }),
      );
      return;
    }
    authPage(
      req,
      res,
      200,
      renderReset({
        token,
        user: null,
        origin: MAIN_ORIGIN,
        csrf: csrfToken(req, res),
      }),
    );
    return;
  }
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "GET, POST");
    return;
  }

  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return;
  }
  if (tooMany(req, res, "reset", { limit: 12, windowMs: 60 * 60 * 1000 })) return;

  const token = String(fields.token || "");
  const record = resetTokenRecord(token);
  if (!record) {
    authPage(
      req,
      res,
      400,
      renderForgot({
        error: "That reset link is invalid or has expired. Request a new one.",
        user: null,
        origin: MAIN_ORIGIN,
        csrf: csrfToken(req, res),
      }),
    );
    return;
  }

  const password = String(fields.password || "");
  const problem = passwordProblem(password);
  if (problem) {
    authPage(
      req,
      res,
      400,
      renderReset({
        token,
        error: problem,
        user: null,
        origin: MAIN_ORIGIN,
        csrf: csrfToken(req, res),
      }),
    );
    return;
  }

  const user = db().users.find((item) => item.id === record.userId);
  if (!user) {
    authPage(
      req,
      res,
      400,
      renderForgot({
        error: "That account no longer exists.",
        user: null,
        origin: MAIN_ORIGIN,
        csrf: csrfToken(req, res),
      }),
    );
    return;
  }

  user.passwordHash = await hashPassword(password);
  db().resetTokens = db().resetTokens.filter((item) => item.userId !== user.id);
  db().sessions = db().sessions.filter((session) => session.userId !== user.id);
  await saveStore();
  redirect(res, "/login/?notice=password-updated");
}

export async function handleAuth(req, res, url, pathname) {
  try {
    if (pathname === "/signup/") {
      await signup(req, res);
      return true;
    }
    if (pathname === "/login/") {
      await login(req, res, url);
      return true;
    }
    if (pathname === "/logout/") {
      await logout(req, res);
      return true;
    }
    if (pathname === "/forgot/") {
      await forgot(req, res);
      return true;
    }
    if (pathname === "/reset/") {
      await reset(req, res, url);
      return true;
    }
  } catch (err) {
    if (err instanceof HttpError) {
      authPage(
        req,
        res,
        err.status,
        simplePage(err.status === 413 ? "Too large" : "Request problem", `<p>${escapeText(err.message)}</p>`),
        err.headers,
      );
      return true;
    }
    throw err;
  }
  return false;
}

function escapeText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
