/* ============================================================
   Portfolio interactions
   ------------------------------------------------------------
   1. Hero canvas: drifting feature points + live "detections"
   2. Scroll reveal, nav state, reading progress
   3. Project filters
   4. Writing: search, tag filter, progressive disclosure
   5. Copy email, card spotlight, keyboard shortcuts
   ============================================================ */

(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* The real writing archive, pulled from defygrad.bearblog.dev. */
  var POSTS = [
    { title: "Continual Learning", date: "22 Sep, 2026", iso: "2026-09-22", url: "https://defygrad.bearblog.dev/continual-learning/", tag: "engineering" },
    { title: "1 hour sprint approach", date: "10 Sep, 2026", iso: "2026-09-10", url: "https://defygrad.bearblog.dev/1-hour-sprint-approach/", tag: "reflection" },
    { title: "go with your gut feeling", date: "02 Sep, 2026", iso: "2026-09-02", url: "https://defygrad.bearblog.dev/go-with-your-gut-feeling/", tag: "reflection" },
    { title: "you have got nothing to lose", date: "27 Aug, 2026", iso: "2026-08-27", url: "https://defygrad.bearblog.dev/you-have-got-nothing-to-lose/", tag: "reflection" },
    { title: "when will it make sense", date: "26 Aug, 2026", iso: "2026-08-26", url: "https://defygrad.bearblog.dev/when-will-it-make-sense/", tag: "reflection" },
    { title: "don't half ass it", date: "24 Aug, 2026", iso: "2026-08-24", url: "https://defygrad.bearblog.dev/dont-half-ass-it/", tag: "reflection" },
    { title: "you are the competition", date: "22 Aug, 2026", iso: "2026-08-22", url: "https://defygrad.bearblog.dev/you-are-the-competition/", tag: "reflection" },
    { title: "this feels weird", date: "20 Aug, 2026", iso: "2026-08-20", url: "https://defygrad.bearblog.dev/this-feels-weird/", tag: "reflection" },
    { title: "The Idea of Chaining", date: "13 Jul, 2026", iso: "2026-07-13", url: "https://defygrad.bearblog.dev/the-idea-of-chaining/", tag: "engineering" },
    { title: "dataloaders part 1", date: "13 Jul, 2026", iso: "2026-07-13", url: "https://defygrad.bearblog.dev/dataloaders-part-1/", tag: "engineering" },
    { title: "The T4 Ceiling: Why Vanilla VLMs Fail on Video", date: "09 Apr, 2026", iso: "2026-04-09", url: "https://defygrad.bearblog.dev/the-t4-ceiling-why-vanilla-vlms-fail-on-video/", tag: "engineering" },
    { title: "Zero to ROS2 - Building pub/sub from scratch", date: "02 Apr, 2026", iso: "2026-04-02", url: "https://defygrad.bearblog.dev/zero-to-ros2-building-pubsub-from-scratch/", tag: "engineering" },
    { title: "CNN Build - Weight Init Rabbit Hole", date: "18 Mar, 2026", iso: "2026-03-18", url: "https://defygrad.bearblog.dev/cnn-build-weight-init-rabbit-hole/", tag: "engineering" },
    { title: "understanding ZeRO!", date: "17 Mar, 2026", iso: "2026-03-17", url: "https://defygrad.bearblog.dev/understanding-zero/", tag: "engineering" },
    { title: "i tried to teach a math ai to say no", date: "13 Mar, 2026", iso: "2026-03-13", url: "https://defygrad.bearblog.dev/math-ai-say-no/", tag: "engineering" },
    { title: "DeepSeek V3 Deep Dive", date: "09 Mar, 2026", iso: "2026-03-09", url: "https://defygrad.bearblog.dev/studying-about-deepseek-v3/", tag: "engineering" },
    { title: "simplifying DDP", date: "23 Feb, 2026", iso: "2026-02-23", url: "https://defygrad.bearblog.dev/simplifying-ddp/", tag: "engineering" },
    { title: "PPO for LLMs: Why We Clip, Why We Normalize, and Why It's Still Hard", date: "20 Feb, 2026", iso: "2026-02-20", url: "https://defygrad.bearblog.dev/ppo-for-llms-why-we-clip-why-we-normalize-and-why-its-still-hard/", tag: "engineering" },
    { title: "Bradley Terry Model", date: "15 Feb, 2026", iso: "2026-02-15", url: "https://defygrad.bearblog.dev/bradley-terry-model/", tag: "engineering" },
    { title: "From Points to Token: A 3D Learning Log - Part 1", date: "05 Jan, 2026", iso: "2026-01-05", url: "https://defygrad.bearblog.dev/from-points-to-token-a-3d-learning-log/", tag: "engineering" },
    { title: "Engineering Fully Local Retrieval-Augmented Generation Systems", date: "29 Nov, 2025", iso: "2025-11-29", url: "https://defygrad.bearblog.dev/engineering-fully-local-retrieval-augmented-generation-systems/", tag: "engineering" },
    { title: "SDXL something", date: "19 Nov, 2025", iso: "2025-11-19", url: "https://defygrad.bearblog.dev/sdxl-something/", tag: "engineering" },
    { title: "Log Number System for Low Precision Training", date: "09 Oct, 2025", iso: "2025-10-09", url: "https://defygrad.bearblog.dev/lns/", tag: "engineering" },
    { title: "Automatic Differentiation", date: "29 Sep, 2025", iso: "2025-09-29", url: "https://defygrad.bearblog.dev/automatic-differentiation/", tag: "engineering" },
    { title: "ResNet, So Simple Your Grandma Could Understand", date: "18 Sep, 2025", iso: "2025-09-18", url: "https://defygrad.bearblog.dev/resnet-so-simple-your-grandma-could-understand/", tag: "engineering" },
    { title: "Wolpert's No Free Lunch Theorem", date: "16 Sep, 2025", iso: "2025-09-16", url: "https://defygrad.bearblog.dev/wolperts-no-free-lunch-theorem/", tag: "engineering" },
    { title: "Improving Data Quality", date: "10 Mar, 2025", iso: "2025-03-10", url: "https://defygrad.bearblog.dev/improving-data-quality/", tag: "engineering" },
    { title: "Advanced Keras Techniques", date: "22 Feb, 2025", iso: "2025-02-22", url: "https://defygrad.bearblog.dev/advanced-keras-techniques/", tag: "engineering" },
    { title: "Data and Concept Drift", date: "26 Jan, 2025", iso: "2025-01-26", url: "https://defygrad.bearblog.dev/data-and-concept-drift/", tag: "engineering" }
  ];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ── 1. Hero canvas ─────────────────────────────────────── */
  (function heroCanvas() {
    var canvas = document.getElementById("viz");
    if (!canvas || reduced) return;

    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var w = 0, h = 0, dpr = 1;
    var points = [], boxes = [];
    var mouse = { x: -9999, y: -9999, active: false };
    var raf = null, running = false;

    var BOX_SEED = [
      { label: "person", conf: 0.97, w: 120, h: 158, x: 0.64, y: 0.20, vx: 0.14, vy: 0.09 },
      { label: "vehicle", conf: 0.92, w: 156, h: 104, x: 0.30, y: 0.62, vx: -0.11, vy: 0.07 },
      { label: "sign", conf: 0.84, w: 92, h: 92, x: 0.80, y: 0.70, vx: 0.09, vy: -0.12 }
    ];

    function resize() {
      var rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function seed() {
      var count = Math.round((w * h) / 24000);
      count = Math.max(26, Math.min(78, count));
      points = [];
      for (var i = 0; i < count; i++) {
        points.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.24,
          vy: (Math.random() - 0.5) * 0.24,
          r: Math.random() < 0.25 ? 1.8 : 1.15
        });
      }
      boxes = BOX_SEED.map(function (b) {
        return {
          label: b.label, conf: b.conf, bw: b.w, bh: b.h,
          x: b.x * w, y: b.y * h, vx: b.vx, vy: b.vy,
          phase: Math.random() * Math.PI * 2
        };
      });
    }

    function corner(x, y, len, sx, sy) {
      ctx.beginPath();
      ctx.moveTo(x + sx * len, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + sy * len);
      ctx.stroke();
    }

    function drawBox(b, t) {
      var x = b.x + Math.sin(t * 0.0004 + b.phase) * 12;
      var y = b.y + Math.cos(t * 0.0005 + b.phase) * 8;
      var bw = b.bw, bh = b.bh;

      x = Math.max(8, Math.min(w - bw - 8, x));
      y = Math.max(8, Math.min(h - bh - 8, y));

      // frame
      ctx.strokeStyle = "rgba(125, 211, 252, 0.30)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, bw, bh);

      // corner ticks
      ctx.strokeStyle = "rgba(125, 211, 252, 0.85)";
      ctx.lineWidth = 1.6;
      var len = 12;
      corner(x, y, len, 1, 1);
      corner(x + bw, y, len, -1, 1);
      corner(x, y + bh, len, 1, -1);
      corner(x + bw, y + bh, len, -1, -1);

      // label
      ctx.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
      var text = b.label + " " + b.conf.toFixed(2);
      var tw = ctx.measureText(text).width;
      var ly = y > 20 ? y - 6 : y + bh + 14;

      ctx.fillStyle = "rgba(8, 8, 10, 0.72)";
      ctx.fillRect(x - 0.5, ly - 11, tw + 10, 15);
      ctx.fillStyle = "rgba(125, 211, 252, 0.82)";
      ctx.fillText(text, x + 4, ly);
    }

    function drawMouseBox() {
      if (!mouse.active) return;
      var bw = 150, bh = 112;
      var x = mouse.x - bw / 2, y = mouse.y - bh / 2;

      ctx.save();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = "rgba(196, 181, 253, 0.55)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, bw, bh);
      ctx.restore();

      ctx.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
      var text = "you 0.99";
      var tw = ctx.measureText(text).width;
      ctx.fillStyle = "rgba(8, 8, 10, 0.72)";
      ctx.fillRect(x, y + bh + 3, tw + 10, 15);
      ctx.fillStyle = "rgba(196, 181, 253, 0.9)";
      ctx.fillText(text, x + 4, y + bh + 14);
    }

    function frame(t) {
      ctx.clearRect(0, 0, w, h);

      // links between nearby features
      for (var i = 0; i < points.length; i++) {
        var p = points[i];
        for (var j = i + 1; j < points.length; j++) {
          var q = points[j];
          var dx = p.x - q.x, dy = p.y - q.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 15600) {
            var a = (1 - d2 / 15600) * 0.16;
            ctx.strokeStyle = "rgba(148, 197, 255, " + a.toFixed(3) + ")";
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }

      // mouse attraction halo
      if (mouse.active) {
        for (var k = 0; k < points.length; k++) {
          var pt = points[k];
          var mx = mouse.x - pt.x, my = mouse.y - pt.y;
          var md2 = mx * mx + my * my;
          if (md2 < 26000 && md2 > 1) {
            var f = (1 - md2 / 26000) * 0.012;
            pt.vx += mx * f * 0.05;
            pt.vy += my * f * 0.05;
          }
        }
      }

      // features
      for (var m = 0; m < points.length; m++) {
        var s = points[m];
        s.x += s.vx;
        s.y += s.vy;
        s.vx *= 0.995;
        s.vy *= 0.995;
        if (Math.abs(s.vx) < 0.02) s.vx += (Math.random() - 0.5) * 0.03;
        if (Math.abs(s.vy) < 0.02) s.vy += (Math.random() - 0.5) * 0.03;

        if (s.x < -10) s.x = w + 10;
        if (s.x > w + 10) s.x = -10;
        if (s.y < -10) s.y = h + 10;
        if (s.y > h + 10) s.y = -10;

        ctx.fillStyle = "rgba(180, 214, 255, 0.42)";
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }

      for (var b = 0; b < boxes.length; b++) {
        boxes[b].x += boxes[b].vx;
        boxes[b].y += boxes[b].vy;
        if (boxes[b].x < 0 || boxes[b].x > w - boxes[b].bw) boxes[b].vx *= -1;
        if (boxes[b].y < 0 || boxes[b].y > h - boxes[b].bh) boxes[b].vy *= -1;
        drawBox(boxes[b], t);
      }

      drawMouseBox();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    }

    canvas.addEventListener("pointermove", function (e) {
      var r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.active = true;
    });
    canvas.addEventListener("pointerleave", function () {
      mouse.active = false;
    });

    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else start();
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) start(); else stop();
        });
      }, { threshold: 0.01 }).observe(canvas);
    }

    resize();
    start();
  })();

  /* ── 2. Scroll reveal, nav, progress ────────────────────── */
  (function scrollChrome() {
    var revealables = $$("[data-reveal]");

    if (!reduced && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
      revealables.forEach(function (el) { io.observe(el); });
    } else {
      revealables.forEach(function (el) { el.classList.add("is-in"); });
    }

    var nav = document.getElementById("nav");
    var bar = document.getElementById("progressBar");
    var links = $$(".nav-links a");
    var sections = links.map(function (a) {
      return document.getElementById(a.getAttribute("href").slice(1));
    }).filter(Boolean);

    var ticking = false;

    function onScroll() {
      var y = window.scrollY || window.pageYOffset;
      var docH = document.documentElement.scrollHeight - window.innerHeight;

      if (nav) nav.classList.toggle("is-scrolled", y > 12);
      if (bar) bar.style.width = (docH > 0 ? Math.min(100, (y / docH) * 100) : 0) + "%";

      var current = null;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].getBoundingClientRect().top <= 140) current = links[i];
      }
      links.forEach(function (a) {
        a.classList.toggle("is-active", a === current);
      });
      ticking = false;
    }

    window.addEventListener("scroll", function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(onScroll);
      }
    }, { passive: true });

    onScroll();
  })();

  /* ── 3. Project filters ─────────────────────────────────── */
  (function workFilters() {
    var chips = $$("[data-filter]");
    var cards = $$("#workGrid .work-card");
    var empty = document.getElementById("workEmpty");
    if (!chips.length) return;

    function setPressed(group, active) {
      group.forEach(function (c) {
        c.setAttribute("aria-pressed", c === active ? "true" : "false");
      });
    }
    setPressed(chips, chips[0]);

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        var filter = chip.getAttribute("data-filter");
        chips.forEach(function (c) { c.classList.toggle("is-active", c === chip); });
        setPressed(chips, chip);

        var shown = 0;
        cards.forEach(function (card) {
          var match = filter === "all" || card.getAttribute("data-cat") === filter;
          card.classList.toggle("is-hidden", !match);
          if (match) shown++;
        });
        if (empty) empty.hidden = shown !== 0;
      });
    });
  })();

  /* ── 4. Writing list ────────────────────────────────────── */
  (function writing() {
    var list = document.getElementById("postList");
    var search = document.getElementById("writingSearch");
    var empty = document.getElementById("postEmpty");
    var more = document.getElementById("showMore");
    var wchips = $$("[data-wfilter]");
    if (!list || !POSTS.length) return;

    var PREVIEW = 8;
    var state = { tag: "all", query: "", expanded: false };

    function render() {
      var q = state.query.trim().toLowerCase();
      var filtering = q.length > 0 || state.tag !== "all";

      var visible = POSTS.filter(function (post) {
        var tagOk = state.tag === "all" || post.tag === state.tag;
        var queryOk = !q || post.title.toLowerCase().indexOf(q) !== -1;
        return tagOk && queryOk;
      });

      var limit = filtering || state.expanded ? visible.length : PREVIEW;
      var slice = visible.slice(0, limit);

      list.innerHTML = "";

      slice.forEach(function (post) {
        var li = document.createElement("li");
        li.className = "post-row";

        var a = document.createElement("a");
        a.className = "post-link";
        a.href = post.url;
        a.target = "_blank";
        a.rel = "noopener";

        var date = document.createElement("span");
        date.className = "post-date";
        date.textContent = post.date;

        var title = document.createElement("span");
        title.className = "post-title";
        title.textContent = post.title;
        if (post.tag === "reflection") {
          var badge = document.createElement("span");
          badge.className = "post-badge";
          badge.textContent = "note to self";
          title.appendChild(badge);
        }

        var arrow = document.createElement("span");
        arrow.className = "post-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "↗";

        a.appendChild(date);
        a.appendChild(title);
        a.appendChild(arrow);
        li.appendChild(a);
        list.appendChild(li);
      });

      if (empty) empty.hidden = visible.length !== 0;

      if (more) {
        more.hidden = filtering || state.expanded || visible.length <= PREVIEW;
        more.innerHTML = "Show all " + POSTS.length + " posts" +
          '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 6.5 8 10.5l4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      }
    }

    if (search) {
      var searchTimer;
      search.addEventListener("input", function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          state.query = search.value;
          state.expanded = false;
          render();
        }, 90);
      });
    }

    wchips.forEach(function (c) {
      c.setAttribute("aria-pressed", c.classList.contains("is-active") ? "true" : "false");
    });

    wchips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        state.tag = chip.getAttribute("data-wfilter");
        state.expanded = false;
        wchips.forEach(function (c) {
          c.classList.toggle("is-active", c === chip);
          c.setAttribute("aria-pressed", c === chip ? "true" : "false");
        });
        render();
      });
    });

    if (more) {
      more.addEventListener("click", function () {
        state.expanded = true;
        render();
      });
    }

    render();

    /* "/" focuses search, Escape leaves it */
    document.addEventListener("keydown", function (e) {
      var tag = (e.target && e.target.tagName) || "";
      var typing = tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable;

      if (e.key === "/" && !typing) {
        e.preventDefault();
        document.getElementById("writing").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
        if (search) setTimeout(function () { search.focus(); }, reduced ? 0 : 420);
      }
      if (e.key === "Escape" && document.activeElement === search) {
        search.value = "";
        state.query = "";
        render();
        search.blur();
      }
    });

    var hint = document.getElementById("searchHint");
    if (hint) {
      hint.addEventListener("click", function () {
        document.getElementById("writing").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
        if (search) setTimeout(function () { search.focus(); }, reduced ? 0 : 420);
      });
    }
  })();

  /* ── 5. Copy email ──────────────────────────────────────── */
  (function copyEmail() {
    var btn = document.getElementById("copyEmail");
    var hint = document.getElementById("copyHint");
    var toast = document.getElementById("toast");
    if (!btn) return;

    var email = btn.getAttribute("data-email");
    var toastTimer;

    function showToast(msg) {
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add("is-visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        toast.classList.remove("is-visible");
      }, 2100);
    }

    btn.addEventListener("click", function () {
      var done = function () {
        showToast("Copied " + email);
        if (hint) hint.textContent = "Copied to clipboard";
        setTimeout(function () {
          if (hint) {
            hint.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>Click to copy';
          }
        }, 2200);
      };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(email).then(done, fallback);
      } else {
        fallback();
      }

      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = email;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); }
        catch (err) { showToast("Copy failed — email is " + email); }
        document.body.removeChild(ta);
      }
    });
  })();

  /* ── 6. Cursor spotlight on cards ───────────────────────── */
  (function spotlight() {
    if (reduced || !window.matchMedia("(hover: hover)").matches) return;
    var cards = $$(".card, .contact-tile, .contact-primary, .notes-card");

    cards.forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (e.clientX - r.left) + "px");
        card.style.setProperty("--my", (e.clientY - r.top) + "px");
      });
    });
  })();

  /* ── 7. Résumé: only link it if the PDF exists ───────────── */
  (function resume() {
    var btn = document.getElementById("resumeBtn");
    if (!btn) return;
    if (location.protocol === "file:") return;

    fetch(btn.getAttribute("href"), { method: "HEAD", cache: "no-store" })
      .then(function (res) {
        if (!res.ok) btn.hidden = true;
        else btn.hidden = false;
      })
      .catch(function () {
        btn.hidden = false;
      });
  })();

  /* ── 8. Footer year ─────────────────────────────────────── */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
