import {
  store as db,
  saveStore,
  userByEmail,
  blogsForUser,
  blogBySubdomain,
  postsForBlog,
  publicPostsForBlog,
} from "./store.mjs";
import {
  uid,
  randomToken,
  hashPassword,
  verifyPassword,
  normalizeEmail,
  validEmail,
  passwordProblem,
} from "./crypto.mjs";
import {
  currentAuth,
  csrfToken,
  verifyCsrf,
  clearCookie,
} from "./security.mjs";
import {
  isGet,
  readForm,
  sendDashboard,
  redirect,
  send,
  simplePage,
  tooMany,
  noticeFor,
  MAIN_ORIGIN,
  cleanSubdomain,
  makeBlog,
  subdomainProblem,
  blogOrigin,
  HttpError,
} from "./web.mjs";
import { parseHome, serializeHome, serializePost, postFromRaw } from "./content.mjs";
import {
  renderBlogList,
  renderAccount,
  renderUpgrade,
  renderStudioHome,
  renderPostsList,
  renderEditor,
  renderDashboard404,
} from "./dashboard.mjs";
import { renderPostPage } from "./public.mjs";
import { handleAudienceRoute } from "./audience-routes.mjs";
import { handleBlogSettingsRoute, removeBlogData } from "./blog-settings-routes.mjs";

function methodNotAllowed(req, res, allow) {
  send(req, res, 405, "Method not allowed", {
    Allow: allow,
    "Content-Type": "text/plain; charset=utf-8",
  });
}

function csrfFail(req, res) {
  sendDashboard(
    req,
    res,
    403,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Form expired</title><link rel="stylesheet" href="/assets/deer.css"></head><body class="deer dashboard"><main class="narrow prose"><h1>That form expired</h1><p>Reload the page and try again.</p></main></body></html>`,
  );
}

function requireUser(req, res, url) {
  const auth = currentAuth(req);
  if (!auth.user) {
    redirect(res, `/login/?next=${encodeURIComponent(url.pathname + url.search)}`);
    return null;
  }
  return auth;
}

function dashboard404(req, res, user, csrf) {
  sendDashboard(
    req,
    res,
    404,
    renderDashboard404({ user, csrf, mainOrigin: MAIN_ORIGIN }),
  );
}

async function blogList(req, res, url, user, csrf) {
  if (isGet(req)) {
    sendDashboard(
      req,
      res,
      200,
      renderBlogList({
        user,
        blogs: blogsForUser(user.id),
        csrf,
        mainOrigin: MAIN_ORIGIN,
        notice: noticeFor(url),
      }),
    );
    return true;
  }
  return false;
}

async function createBlog(req, res, user, csrf) {
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "POST");
    return true;
  }
  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return true;
  }
  if (tooMany(req, res, "create-blog", { limit: 20, windowMs: 60 * 60 * 1000 })) return true;

  const title = String(fields.title || "").trim().slice(0, 200);
  const subdomain = cleanSubdomain(fields.subdomain);
  const blogs = blogsForUser(user.id);
  const errors = [];
  if (!title) errors.push("Give the blog a title.");
  const subProblem = subdomainProblem(subdomain);
  if (subProblem) errors.push(subProblem);
  else if (blogBySubdomain(subdomain)) errors.push("That subdomain is already taken.");
  if (blogs.length >= (user.maxBlogs || 1)) {
    errors.push(`Your plan allows ${user.maxBlogs || 1} blog${(user.maxBlogs || 1) === 1 ? "" : "s"}.`);
  }

  if (errors.length) {
    sendDashboard(
      req,
      res,
      400,
      renderBlogList({
        user,
        blogs,
        csrf,
        mainOrigin: MAIN_ORIGIN,
        error: errors.join(" "),
      }),
    );
    return true;
  }

  const blog = makeBlog({
    userId: user.id,
    title,
    subdomain,
    content: "A new blog on Deerblog. Edit this homepage from the dashboard.",
  });
  db().blogs.push(blog);
  await saveStore();
  redirect(res, `/${blog.subdomain}/dashboard/?notice=blog-created`);
  return true;
}

async function account(req, res, url, auth, csrf) {
  const { user, session } = auth;
  if (isGet(req)) {
    sendDashboard(
      req,
      res,
      200,
      renderAccount({
        user,
        csrf,
        mainOrigin: MAIN_ORIGIN,
        notice: noticeFor(url),
      }),
    );
    return true;
  }
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "GET, POST");
    return true;
  }

  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return true;
  }
  const action = String(fields.action || "");

  if (action === "email") {
    const email = normalizeEmail(fields.email);
    const errors = [];
    if (!validEmail(email)) errors.push("Enter a valid email address.");
    const other = userByEmail(email);
    if (other && other.id !== user.id) errors.push("That email belongs to another account.");
    if (errors.length) {
      sendDashboard(
        req,
        res,
        400,
        renderAccount({
          user,
          csrf,
          mainOrigin: MAIN_ORIGIN,
          error: errors.join(" "),
        }),
      );
      return true;
    }
    user.email = email;
    await saveStore();
    redirect(res, "/dashboard/account/?notice=email-updated");
    return true;
  }

  if (action === "password") {
    const current = String(fields.current || "");
    const password = String(fields.password || "");
    const errors = [];
    if (!(await verifyPassword(current, user.passwordHash))) errors.push("Current password is not correct.");
    const problem = passwordProblem(password);
    if (problem) errors.push(problem);
    if (errors.length) {
      sendDashboard(
        req,
        res,
        400,
        renderAccount({
          user,
          csrf,
          mainOrigin: MAIN_ORIGIN,
          error: errors.join(" "),
        }),
      );
      return true;
    }
    user.passwordHash = await hashPassword(password);
    db().sessions = db().sessions.filter(
      (item) => item.userId !== user.id || item.id === session.id,
    );
    await saveStore();
    redirect(res, "/dashboard/account/?notice=password-updated");
    return true;
  }

  if (action === "delete") {
    if (normalizeEmail(fields.confirm) !== user.email.toLowerCase()) {
      sendDashboard(
        req,
        res,
        400,
        renderAccount({
          user,
          csrf,
          mainOrigin: MAIN_ORIGIN,
          error: "Type your email address exactly to confirm deletion.",
        }),
      );
      return true;
    }
    for (const blog of blogsForUser(user.id)) await removeBlogData(blog);
    db().sessions = db().sessions.filter((item) => item.userId !== user.id);
    db().resetTokens = db().resetTokens.filter((item) => item.userId !== user.id);
    db().users = db().users.filter((item) => item.id !== user.id);
    await saveStore();
    clearCookie(res, "deer_session");
    redirect(res, "/");
    return true;
  }

  sendDashboard(
    req,
    res,
    400,
    renderAccount({
      user,
      csrf,
      mainOrigin: MAIN_ORIGIN,
      error: "Unknown account action.",
    }),
  );
  return true;
}

async function upgrade(req, res, url, user, csrf) {
  if (isGet(req)) {
    sendDashboard(
      req,
      res,
      200,
      renderUpgrade({
        user,
        csrf,
        mainOrigin: MAIN_ORIGIN,
        notice: noticeFor(url),
      }),
    );
    return true;
  }
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "GET, POST");
    return true;
  }
  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return true;
  }
  const plan = fields.plan === "pro" ? "pro" : "free";
  if (plan === "free" && blogsForUser(user.id).length > 1) {
    sendDashboard(
      req,
      res,
      400,
      renderUpgrade({
        user,
        csrf,
        mainOrigin: MAIN_ORIGIN,
        error: "Delete extra blogs before returning to the free plan.",
      }),
    );
    return true;
  }
  user.plan = plan;
  user.maxBlogs = plan === "pro" ? 10 : 1;
  await saveStore();
  redirect(res, "/dashboard/upgrade/?notice=saved");
  return true;
}

function defaultPostRaw(blog) {
  return blog.postTemplate || "title: \nlink: \ntags: \n\n";
}

async function studioHome(req, res, url, { user, blog, csrf }) {
  if (isGet(req)) {
    sendDashboard(
      req,
      res,
      200,
      renderStudioHome({
        user,
        blog,
        raw: serializeHome(blog),
        csrf,
        mainOrigin: MAIN_ORIGIN,
        notice: noticeFor(url),
      }),
    );
    return true;
  }
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "GET, POST");
    return true;
  }
  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return true;
  }
  const raw = String(fields.raw || "");
  const parsed = parseHome(raw);
  if (parsed.errors.length) {
    sendDashboard(
      req,
      res,
      400,
      renderStudioHome({
        user,
        blog,
        raw,
        csrf,
        mainOrigin: MAIN_ORIGIN,
        error: parsed.errors.join(" "),
      }),
    );
    return true;
  }
  blog.title = parsed.value.title;
  blog.favicon = parsed.value.favicon;
  blog.metaDescription = parsed.value.metaDescription;
  blog.metaImage = parsed.value.metaImage;
  blog.content = parsed.value.content;
  blog.lastModified = new Date().toISOString();
  await saveStore();
  redirect(res, `/${blog.subdomain}/dashboard/?notice=saved`);
  return true;
}

function postListPage(req, res, url, { user, blog, csrf, pages }) {
  if (!isGet(req)) {
    methodNotAllowed(req, res, "GET");
    return true;
  }
  const posts = postsForBlog(blog.id).filter((post) => Boolean(post.isPage) === pages);
  sendDashboard(
    req,
    res,
    200,
    renderPostsList({
      user,
      blog,
      posts,
      csrf,
      mainOrigin: MAIN_ORIGIN,
      notice: noticeFor(url),
      pages,
    }),
  );
  return true;
}

async function editor(req, res, url, { user, blog, csrf, post, pageMode }) {
  if (isGet(req)) {
    sendDashboard(
      req,
      res,
      200,
      renderEditor({
        user,
        blog,
        post,
        raw: post ? serializePost(post) : defaultPostRaw(blog),
        csrf,
        mainOrigin: MAIN_ORIGIN,
        notice: noticeFor(url),
        pageMode,
      }),
    );
    return true;
  }
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "GET, POST");
    return true;
  }

  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return true;
  }
  const raw = String(fields.raw || "");
  const publish = fields.publish === "true";
  const forcePage = fields.is_page === "1" || Boolean(post?.isPage);
  const parsed = postFromRaw(raw, {
    blog,
    posts: db().posts,
    current: post,
    publish,
    forcePage,
  });
  if (forcePage) parsed.value.isPage = true;

  if (parsed.errors.length) {
    sendDashboard(
      req,
      res,
      400,
      renderEditor({
        user,
        blog,
        post,
        raw,
        csrf,
        mainOrigin: MAIN_ORIGIN,
        error: parsed.errors.join(" "),
        pageMode: pageMode || Boolean(post?.isPage),
      }),
    );
    return true;
  }

  const nowDate = new Date().toISOString();
  const wasPublished = Boolean(post?.publish);
  let saved;
  if (post) {
    Object.assign(post, parsed.value, {
      id: post.id,
      uid: post.uid,
      blogId: post.blogId,
      lastModified: nowDate,
      upvotes: post.upvotes,
      previewToken: post.previewToken,
    });
    saved = post;
  } else {
    saved = {
      ...parsed.value,
      id: uid(16),
      uid: uid(10),
      blogId: blog.id,
      lastModified: nowDate,
      upvotes: 0,
      previewToken: randomToken(12),
    };
    db().posts.push(saved);
  }
  await saveStore();

  const notice = wasPublished && !saved.publish
    ? "unpublished"
    : saved.publish
      ? "published"
      : "draft-saved";
  redirect(res, `/${blog.subdomain}/dashboard/posts/${saved.uid}/?notice=${notice}`);
  return true;
}

async function preview(req, res, { user, blog, csrf }) {
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "POST");
    return true;
  }
  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return true;
  }
  const raw = String(fields.raw || "");
  const current = fields.preview_uid
    ? db().posts.find((item) => item.blogId === blog.id && item.uid === fields.preview_uid) || null
    : null;
  const forcePage = fields.is_page === "1" || Boolean(current?.isPage);
  const parsed = postFromRaw(raw, {
    blog,
    posts: db().posts,
    current,
    publish: false,
    forcePage,
  });
  if (forcePage) parsed.value.isPage = true;

  if (parsed.errors.length) {
    const items = parsed.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("");
    send(
      req,
      res,
      400,
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Preview error</title><link rel="stylesheet" href="/assets/deer.css"></head><body class="deer"><main class="narrow prose"><p class="eyebrow">Preview</p><h1>Fix the header first</h1><ul>${items}</ul><p>Close this tab, fix the post, and preview again.</p></main></body></html>`,
      {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "sandbox",
        "X-Robots-Tag": "noindex, nofollow",
      },
    );
    return true;
  }

  const posts = publicPostsForBlog(blog.id);
  const ctx = {
    origin: blogOrigin(blog),
    mainOrigin: MAIN_ORIGIN,
    prefix: `/b/${blog.subdomain}`,
    publicPosts: posts,
    fallback: false,
  };
  const previewPost = {
    ...parsed.value,
    id: "preview",
    uid: "preview",
    blogId: blog.id,
    lastModified: new Date().toISOString(),
  };
  send(
    req,
    res,
    200,
    renderPostPage({
      blog,
      post: previewPost,
      posts,
      ctx,
      preview: true,
      upvoted: false,
    }),
    {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "sandbox",
      "X-Robots-Tag": "noindex, nofollow",
    },
  );
  return true;
}

async function deletePost(req, res, { user, blog, post }) {
  if (req.method !== "POST") {
    methodNotAllowed(req, res, "POST");
    return true;
  }
  const fields = await readForm(req);
  if (!verifyCsrf(req, fields)) {
    csrfFail(req, res);
    return true;
  }
  db().posts = db().posts.filter((item) => item.id !== post.id);
  db().upvotes = db().upvotes.filter((item) => item.postId !== post.id);
  db().hits = db().hits.filter((item) => item.postId !== post.id && item.path !== `/${post.slug}/`);
  await saveStore();
  redirect(
    res,
    `/${blog.subdomain}/dashboard/${post.isPage ? "pages" : "posts"}/?notice=deleted`,
  );
  return true;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function blogDashboard(req, res, url, auth, blog, rest) {
  const csrf = csrfToken(req, res);
  const common = { user: auth.user, blog, csrf };

  if (!rest) return studioHome(req, res, url, common);
  if (rest === "posts") return postListPage(req, res, url, { ...common, pages: false });
  if (rest === "pages") return postListPage(req, res, url, { ...common, pages: true });

  if (rest === "posts/new") {
    const pageMode = url.searchParams.get("is_page") === "1";
    return editor(req, res, url, { ...common, post: null, pageMode });
  }

  const deleteMatch = rest.match(/^posts\/([A-Za-z0-9_-]+)\/delete$/);
  if (deleteMatch) {
    const post = db().posts.find((item) => item.blogId === blog.id && item.uid === deleteMatch[1]);
    if (!post) {
      dashboard404(req, res, auth.user, csrf);
      return true;
    }
    return deletePost(req, res, { user: auth.user, blog, post });
  }

  const editMatch = rest.match(/^posts\/([A-Za-z0-9_-]+)$/);
  if (editMatch) {
    const post = db().posts.find((item) => item.blogId === blog.id && item.uid === editMatch[1]);
    if (!post) {
      dashboard404(req, res, auth.user, csrf);
      return true;
    }
    return editor(req, res, url, {
      ...common,
      post,
      pageMode: Boolean(post.isPage),
    });
  }

  if (rest === "preview") return preview(req, res, { user: auth.user, blog, csrf });

  if (
    await handleAudienceRoute(req, res, url, {
      user: auth.user,
      blog,
      csrf,
      rest,
    })
  ) {
    return true;
  }

  if (await handleBlogSettingsRoute(req, res, url, { ...common, rest })) {
    return true;
  }

  dashboard404(req, res, auth.user, csrf);
  return true;
}

export async function handleDashboard(req, res, url, pathname) {
  if (pathname === "/dashboard") {
    redirect(res, `/dashboard/${url.search}`, 308);
    return true;
  }

  if (pathname === "/dashboard/" || pathname === "/dashboard/blogs/" || pathname === "/dashboard/account/" || pathname === "/dashboard/upgrade/") {
    const auth = requireUser(req, res, url);
    if (!auth) return true;
    const csrf = csrfToken(req, res);
    if (pathname === "/dashboard/blogs/") {
      if (isGet(req)) await blogList(req, res, url, auth.user, csrf);
      else await createBlog(req, res, auth.user, csrf);
      return true;
    }
    if (pathname === "/dashboard/account/") {
      await account(req, res, url, auth, csrf);
      return true;
    }
    if (pathname === "/dashboard/upgrade/") {
      await upgrade(req, res, url, auth.user, csrf);
      return true;
    }
    if (!isGet(req)) {
      send(req, res, 405, "Method not allowed", { Allow: "GET", "Content-Type": "text/plain; charset=utf-8" });
      return true;
    }
    await blogList(req, res, url, auth.user, csrf);
    return true;
  }

  if (pathname === "/dashboard/blogs") {
    redirect(res, `/dashboard/blogs/${url.search}`, 308);
    return true;
  }
  if (pathname === "/dashboard/account") {
    redirect(res, `/dashboard/account/${url.search}`, 308);
    return true;
  }
  if (pathname === "/dashboard/upgrade") {
    redirect(res, `/dashboard/upgrade/${url.search}`, 308);
    return true;
  }

  const match = pathname.match(/^\/([a-z0-9-]+)\/dashboard(?:\/(.*))?$/);
  if (!match) return false;

  const auth = requireUser(req, res, url);
  if (!auth) return true;
  const subdomain = match[1];
  const blog = blogBySubdomain(subdomain);
  if (!blog || blog.userId !== auth.user.id) {
    dashboard404(req, res, auth.user, csrfToken(req, res));
    return true;
  }
  const rest = (match[2] || "").replace(/^\/+|\/+$/g, "");
  await blogDashboard(req, res, url, auth, blog, rest);
  return true;
}
