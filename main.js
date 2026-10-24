/* ============================================================
   Portfolio interactions
   ------------------------------------------------------------
   1. Theme switch (persisted, drives the canvas palette too)
   2. Hero canvas: drifting feature points + live "detections"
   3. Scroll reveal, nav state, reading progress
   4. Writing: search, tag filter, progressive disclosure
   5. Card spotlight, keyboard shortcuts
   6. Footer year
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

  /* ── 1. Theme ───────────────────────────────────────────── */
  (function theme() {
    var root = document.documentElement;
    var btn = document.getElementById("themeToggle");
    var meta = document.querySelector('meta[name="theme-color"]');

    function apply(name, persist) {
      root.setAttribute("data-theme", name);
      if (meta) meta.setAttribute("content", name === "light" ? "#faf4e6" : "#08080a");
      if (btn) {
        btn.setAttribute("aria-pressed", name === "light" ? "true" : "false");
        btn.setAttribute("aria-label", name === "light" ? "Switch to dark theme" : "Switch to light theme");
        btn.setAttribute("title", name === "light" ? "Switch to dark theme" : "Switch to light theme");
      }
      if (persist) {
        try { localStorage.setItem("theme", name); } catch (e) {}
      }
      try {
        document.dispatchEvent(new CustomEvent("themechange", { detail: name }));
      } catch (e) {
        var evt = document.createEvent("Event");
        evt.initEvent("themechange", true, true);
        document.dispatchEvent(evt);
      }
    }

    var themeTimer;

    /* View Transitions gives a real cross-fade (gradients included);
       otherwise fall back to transitioning the colour properties. */
    function commit(next) {
      /* Reduced motion: swap instantly, no cross-fade at all. */
      if (reduced) {
        apply(next, true);
        return;
      }
      if (typeof document.startViewTransition === "function") {
        document.startViewTransition(function () { apply(next, true); });
        return;
      }
      root.classList.add("is-theming");
      apply(next, true);
      clearTimeout(themeTimer);
      themeTimer = setTimeout(function () {
        root.classList.remove("is-theming");
        /* Force a recalc so the final colours are committed cleanly. */
        void root.offsetWidth;
      }, 480);
    }

    var stored = null;
    try { stored = localStorage.getItem("theme"); } catch (e) {}
    apply(stored === "dark" ? "dark" : "light", false);

    /* Delegated so the handler survives any re-render of the button. */
    document.addEventListener("click", function (e) {
      var trigger = e.target && e.target.closest ? e.target.closest("#themeToggle") : null;
      if (!trigger) return;
      commit(root.getAttribute("data-theme") === "light" ? "dark" : "light");
    });
  })();

  /* ── 2. Hero canvas ─────────────────────────────────────── */
  (function heroCanvas() {
    var canvas = document.getElementById("viz");
    if (!canvas || reduced) return;

    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var w = 0, h = 0, dpr = 1;
    var points = [], boxes = [], targets = [];
    var C = {};

    function readColors() {
      var cs = getComputedStyle(document.documentElement);
      function get(name) { return cs.getPropertyValue(name).trim(); }
      var isDark = document.documentElement.getAttribute("data-theme") === "dark";
      C = {
        dot: get("--viz-dot"),
        line: get("--viz-line"),
        box: get("--viz-box"),
        boxStrong: get("--viz-box-strong"),
        label: get("--viz-label"),
        labelBg: get("--viz-label-bg"),
        cursor: get("--viz-cursor"),
        cursorLabel: get("--viz-cursor-label"),
        isDark: isDark
      };
    }
    readColors();
    document.addEventListener("themechange", readColors);
    var mouse = { x: -9999, y: -9999, active: false };
    var raf = null, running = false;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      /* A phone repaints this full-bleed canvas every frame. Past 1.5× the
         extra pixels are invisible at that size but cost real fill rate. */
      dpr = Math.min(window.devicePixelRatio || 1, w < 520 ? 1.5 : 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    /* ── Vector Drawings for Detected Objects ── */
    function drawCatSitting(ctx, x, y, bw, bh, isDetected, isDark, t) {
      ctx.save();
      ctx.translate(x, y);
      var strokeColor = isDetected
        ? (isDark ? "rgba(125, 211, 252, 0.95)" : "rgba(2, 132, 199, 0.95)")
        : (isDark ? "rgba(255, 255, 255, 0.35)" : "rgba(30, 41, 59, 0.38)");
      var fillColor = isDetected
        ? (isDark ? "rgba(125, 211, 252, 0.16)" : "rgba(2, 132, 199, 0.12)")
        : (isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(30, 41, 59, 0.07)");
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = fillColor;
      ctx.lineWidth = isDetected ? 1.8 : 1.3;

      // Body silhouette
      ctx.beginPath();
      ctx.moveTo(14, bh - 4);
      ctx.bezierCurveTo(10, bh - 22, 16, bh - 42, 22, bh - 48);
      ctx.lineTo(20, bh - 56);
      ctx.lineTo(26, bh - 68);
      ctx.lineTo(32, bh - 58);
      ctx.lineTo(40, bh - 58);
      ctx.lineTo(46, bh - 68);
      ctx.lineTo(50, bh - 56);
      ctx.bezierCurveTo(58, bh - 44, 62, bh - 22, 54, bh - 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Tail
      var tailSway = Math.sin(t * 0.002) * 5;
      ctx.beginPath();
      ctx.moveTo(52, bh - 6);
      ctx.bezierCurveTo(66, bh - 10, 68 + tailSway, bh - 34, 60 + tailSway, bh - 42);
      ctx.bezierCurveTo(56 + tailSway, bh - 46, 52, bh - 44, 54, bh - 40);
      ctx.bezierCurveTo(62, bh - 34, 60, bh - 16, 48, bh - 6);
      ctx.fill();
      ctx.stroke();

      // Eyes
      var eyeColor = isDetected ? (isDark ? "#7dd3fc" : "#0284c7") : strokeColor;
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.arc(28, bh - 53, 1.8, 0, Math.PI * 2);
      ctx.arc(42, bh - 53, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Whiskers
      ctx.beginPath();
      ctx.moveTo(18, bh - 50); ctx.lineTo(6, bh - 53);
      ctx.moveTo(18, bh - 48); ctx.lineTo(6, bh - 48);
      ctx.moveTo(52, bh - 50); ctx.lineTo(64, bh - 53);
      ctx.moveTo(52, bh - 48); ctx.lineTo(64, bh - 48);
      ctx.stroke();

      ctx.restore();
    }

    function drawCatWalking(ctx, x, y, bw, bh, isDetected, isDark, t) {
      ctx.save();
      ctx.translate(x, y);
      var strokeColor = isDetected
        ? (isDark ? "rgba(94, 234, 212, 0.95)" : "rgba(13, 148, 136, 0.95)")
        : (isDark ? "rgba(255, 255, 255, 0.35)" : "rgba(30, 41, 59, 0.38)");
      var fillColor = isDetected
        ? (isDark ? "rgba(94, 234, 212, 0.16)" : "rgba(13, 148, 136, 0.12)")
        : (isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(30, 41, 59, 0.07)");
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = fillColor;
      ctx.lineWidth = isDetected ? 1.8 : 1.3;

      var step = Math.sin(t * 0.003) * 3;
      ctx.beginPath();
      ctx.moveTo(bw - 14, 22);
      ctx.lineTo(bw - 18, 10);
      ctx.lineTo(bw - 24, 18);
      ctx.lineTo(bw - 28, 11);
      ctx.lineTo(bw - 32, 20);
      ctx.bezierCurveTo(bw - 45, 18, 28, 22, 18, 28);
      var tailWave = Math.cos(t * 0.003) * 4;
      ctx.bezierCurveTo(10, 24, 4 + tailWave, 12, 8 + tailWave, 6);
      ctx.bezierCurveTo(12 + tailWave, 6, 12, 26, 16, 32);
      ctx.lineTo(14 - step, bh - 3);
      ctx.lineTo(20 - step, bh - 3);
      ctx.lineTo(24, 34);
      ctx.lineTo(bw - 38, 34);
      ctx.lineTo(bw - 34 + step, bh - 3);
      ctx.lineTo(bw - 28 + step, bh - 3);
      ctx.lineTo(bw - 26, 28);
      ctx.bezierCurveTo(bw - 20, 28, bw - 12, 28, bw - 14, 22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      var eyeColor = isDetected ? (isDark ? "#5eead4" : "#0d9488") : strokeColor;
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.arc(bw - 18, 20, 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    function drawPerson(ctx, x, y, bw, bh, isDetected, isDark, t) {
      ctx.save();
      ctx.translate(x, y);
      var strokeColor = isDetected
        ? (isDark ? "rgba(196, 181, 253, 0.95)" : "rgba(124, 58, 237, 0.95)")
        : (isDark ? "rgba(255, 255, 255, 0.35)" : "rgba(30, 41, 59, 0.38)");
      var fillColor = isDetected
        ? (isDark ? "rgba(196, 181, 253, 0.16)" : "rgba(124, 58, 237, 0.10)")
        : (isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(30, 41, 59, 0.07)");
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = fillColor;
      ctx.lineWidth = isDetected ? 1.8 : 1.3;

      var cx = bw / 2;
      var breath = Math.sin(t * 0.002) * 1.5;

      var headR = 12;
      var headY = 16 + breath;
      ctx.beginPath();
      ctx.arc(cx, headY, headR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      var neckY = headY + headR;
      var hipY = neckY + 46;
      var shoulderW = 20;
      var hipW = 14;

      ctx.beginPath();
      ctx.moveTo(cx - shoulderW, neckY + 6);
      ctx.lineTo(cx + shoulderW, neckY + 6);
      ctx.lineTo(cx + hipW, hipY);
      ctx.lineTo(cx - hipW, hipY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      var feetY = bh - 4;
      var kneeY = hipY + (feetY - hipY) * 0.52;
      ctx.beginPath();
      ctx.moveTo(cx - 8, hipY);
      ctx.lineTo(cx - 10, kneeY);
      ctx.lineTo(cx - 11, feetY);
      ctx.moveTo(cx + 8, hipY);
      ctx.lineTo(cx + 10, kneeY);
      ctx.lineTo(cx + 11, feetY);
      ctx.stroke();

      var elbowY = neckY + 24;
      var wristY = neckY + 44;
      ctx.beginPath();
      ctx.moveTo(cx - shoulderW, neckY + 6);
      ctx.lineTo(cx - shoulderW - 5, elbowY);
      ctx.lineTo(cx - shoulderW - 2, wristY);
      ctx.moveTo(cx + shoulderW, neckY + 6);
      ctx.lineTo(cx + shoulderW + 5, elbowY);
      ctx.lineTo(cx + shoulderW + 2, wristY);
      ctx.stroke();

      if (isDetected) {
        var jointColor = isDark ? "#c4b5fd" : "#7c3aed";
        var joints = [
          [cx, headY],
          [cx - shoulderW, neckY + 6], [cx + shoulderW, neckY + 6],
          [cx - shoulderW - 5, elbowY], [cx + shoulderW + 5, elbowY],
          [cx - shoulderW - 2, wristY], [cx + shoulderW + 2, wristY],
          [cx - 8, hipY], [cx + 8, hipY],
          [cx - 10, kneeY], [cx + 10, kneeY],
          [cx - 11, feetY], [cx + 11, feetY]
        ];
        ctx.fillStyle = jointColor;
        for (var j = 0; j < joints.length; j++) {
          ctx.beginPath();
          ctx.arc(joints[j][0], joints[j][1], 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    function drawCar(ctx, x, y, bw, bh, isDetected, isDark, t) {
      ctx.save();
      ctx.translate(x, y);
      var strokeColor = isDetected
        ? (isDark ? "rgba(56, 189, 248, 0.95)" : "rgba(2, 132, 199, 0.95)")
        : (isDark ? "rgba(255, 255, 255, 0.35)" : "rgba(30, 41, 59, 0.38)");
      var fillColor = isDetected
        ? (isDark ? "rgba(56, 189, 248, 0.16)" : "rgba(2, 132, 199, 0.10)")
        : (isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(30, 41, 59, 0.07)");
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = fillColor;
      ctx.lineWidth = isDetected ? 1.8 : 1.3;

      var wheelR = 8.5;
      var wheelY = bh - 6;
      var frontWheelX = bw - 24;
      var backWheelX = 26;

      // Car body silhouette
      ctx.beginPath();
      ctx.moveTo(6, bh - 10);
      ctx.lineTo(6, bh - 22);
      ctx.bezierCurveTo(10, bh - 26, 16, bh - 27, 24, bh - 27);
      ctx.lineTo(38, 12);
      ctx.lineTo(bw - 42, 12);
      ctx.lineTo(bw - 24, bh - 25);
      ctx.lineTo(bw - 6, bh - 24);
      ctx.bezierCurveTo(bw - 4, bh - 18, bw - 4, bh - 12, bw - 6, bh - 10);
      ctx.lineTo(frontWheelX + wheelR + 3, bh - 10);
      ctx.arc(frontWheelX, wheelY, wheelR + 3, 0, Math.PI, true);
      ctx.lineTo(backWheelX + wheelR + 3, bh - 10);
      ctx.arc(backWheelX, wheelY, wheelR + 3, 0, Math.PI, true);
      ctx.lineTo(6, bh - 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Wheels
      ctx.fillStyle = isDark ? "#18181b" : "#475569";
      ctx.beginPath();
      ctx.arc(frontWheelX, wheelY, wheelR, 0, Math.PI * 2);
      ctx.arc(backWheelX, wheelY, wheelR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Hubcaps
      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(frontWheelX, wheelY, 3, 0, Math.PI * 2);
      ctx.arc(backWheelX, wheelY, 3, 0, Math.PI * 2);
      ctx.fill();

      // Windows
      ctx.beginPath();
      ctx.moveTo(39, 15);
      ctx.lineTo(54, 15);
      ctx.lineTo(54, bh - 25);
      ctx.lineTo(27, bh - 25);
      ctx.closePath();
      ctx.moveTo(58, 15);
      ctx.lineTo(bw - 44, 15);
      ctx.lineTo(bw - 28, bh - 25);
      ctx.lineTo(58, bh - 25);
      ctx.closePath();
      ctx.stroke();

      if (isDetected) {
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(bw - 8, bh - 18, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f43f5e";
        ctx.beginPath();
        ctx.arc(8, bh - 19, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    function drawBird(ctx, x, y, bw, bh, isDetected, isDark, t) {
      ctx.save();
      ctx.translate(x, y);
      var strokeColor = isDetected
        ? (isDark ? "rgba(244, 114, 182, 0.95)" : "rgba(219, 39, 119, 0.95)")
        : (isDark ? "rgba(255, 255, 255, 0.35)" : "rgba(30, 41, 59, 0.38)");
      var fillColor = isDetected
        ? (isDark ? "rgba(244, 114, 182, 0.16)" : "rgba(219, 39, 119, 0.10)")
        : (isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(30, 41, 59, 0.07)");
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = fillColor;
      ctx.lineWidth = isDetected ? 1.8 : 1.3;

      var flap = Math.sin(t * 0.005) * 4;

      ctx.beginPath();
      ctx.moveTo(bw - 4, 16);
      ctx.lineTo(bw - 11, 13);
      ctx.bezierCurveTo(bw - 13, 8, bw - 20, 8, bw - 24, 14);
      ctx.bezierCurveTo(bw - 30, 20, 18, 26, 6, 36);
      ctx.lineTo(4, 40);
      ctx.lineTo(12, 36);
      ctx.lineTo(16, 33);
      ctx.lineTo(18, bh - 3);
      ctx.lineTo(24, bh - 3);
      ctx.lineTo(25, 31);
      ctx.bezierCurveTo(bw - 16, 32, bw - 10, 26, bw - 11, 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(bw - 20, 17);
      ctx.bezierCurveTo(bw - 28, 16 + flap, 14, 23 + flap, 10, 31);
      ctx.bezierCurveTo(18, 28, bw - 16, 26, bw - 20, 17);
      ctx.fill();
      ctx.stroke();

      var eyeColor = isDetected ? (isDark ? "#f472b6" : "#db2777") : strokeColor;
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.arc(bw - 16, 14, 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    function drawDog(ctx, x, y, bw, bh, isDetected, isDark, t) {
      ctx.save();
      ctx.translate(x, y);
      var strokeColor = isDetected
        ? (isDark ? "rgba(252, 211, 77, 0.95)" : "rgba(217, 119, 6, 0.95)")
        : (isDark ? "rgba(255, 255, 255, 0.35)" : "rgba(30, 41, 59, 0.38)");
      var fillColor = isDetected
        ? (isDark ? "rgba(252, 211, 77, 0.16)" : "rgba(217, 119, 6, 0.10)")
        : (isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(30, 41, 59, 0.07)");
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = fillColor;
      ctx.lineWidth = isDetected ? 1.8 : 1.3;

      var wag = Math.sin(t * 0.005) * 6;
      ctx.beginPath();
      ctx.moveTo(bw - 12, 28);
      ctx.lineTo(bw - 24, 20);
      ctx.bezierCurveTo(bw - 28, 8, bw - 38, 12, bw - 34, 28);
      ctx.bezierCurveTo(bw - 40, 36, 26, 36, 18, 44);
      ctx.bezierCurveTo(12, 42, 6 + wag, 22, 12 + wag, 18);
      ctx.bezierCurveTo(16 + wag, 24, 18, 46, 22, 54);
      ctx.lineTo(16, bh - 3);
      ctx.lineTo(24, bh - 3);
      ctx.lineTo(30, 52);
      ctx.lineTo(bw - 30, 52);
      ctx.lineTo(bw - 28, bh - 3);
      ctx.lineTo(bw - 20, bh - 3);
      ctx.lineTo(bw - 18, 38);
      ctx.lineTo(bw - 12, 34);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      var eyeColor = isDetected ? (isDark ? "#fcd34d" : "#d97706") : strokeColor;
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.arc(bw - 20, 24, 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
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

      // Populate realistic computer vision detection targets on the right side
      var isWide = w >= 860;
      targets = [
        {
          type: "person",
          label: "person",
          baseConf: 0.97,
          bw: 62,
          bh: 136,
          x: isWide ? w * 0.54 : w * 0.48,
          y: Math.max(60, h * 0.16),
          detectedByBox: false,
          detectedByMouse: false
        },
        {
          type: "bird",
          label: "bird",
          baseConf: 0.94,
          bw: 50,
          bh: 44,
          x: isWide ? w * 0.73 : w * 0.68,
          y: Math.max(50, h * 0.12),
          detectedByBox: false,
          detectedByMouse: false
        },
        {
          type: "car",
          label: "car",
          baseConf: 0.95,
          bw: 114,
          bh: 54,
          x: isWide ? w * 0.70 : w * 0.62,
          y: Math.max(130, h * 0.38),
          detectedByBox: false,
          detectedByMouse: false
        },
        {
          type: "cat_sitting",
          label: "cat",
          baseConf: 0.98,
          bw: 68,
          bh: 72,
          x: isWide ? w * 0.85 : w * 0.75,
          y: Math.max(180, h * 0.60),
          detectedByBox: false,
          detectedByMouse: false
        },
        {
          type: "cat_walking",
          label: "cat",
          baseConf: 0.96,
          bw: 84,
          bh: 56,
          x: isWide ? w * 0.54 : w * 0.38,
          y: Math.max(220, h * 0.70),
          detectedByBox: false,
          detectedByMouse: false
        }
      ];

      if (isWide && w > 1100) {
        targets.push({
          type: "dog",
          label: "dog",
          baseConf: 0.93,
          bw: 76,
          bh: 68,
          x: w * 0.86,
          y: Math.max(70, h * 0.18),
          detectedByBox: false,
          detectedByMouse: false
        });
      }

      // Initialize roaming scanning boxes
      boxes = [
        {
          x: targets[0].x - 12,
          y: targets[0].y - 12,
          bw: targets[0].bw + 24,
          bh: targets[0].bh + 24,
          vx: 0.28,
          vy: 0.18,
          state: "tracking",
          targetIdx: 0,
          timer: 160,
          label: "person",
          conf: 0.96,
          phase: 0
        },
        {
          x: targets[1].x + 40,
          y: targets[1].y - 30,
          bw: 120,
          bh: 95,
          vx: -0.22,
          vy: 0.25,
          state: "roaming",
          targetIdx: -1,
          timer: 80,
          label: "",
          conf: 0,
          phase: 1.8
        },
        {
          x: targets[2].x - 60,
          y: targets[2].y + 20,
          bw: 110,
          bh: 85,
          vx: 0.24,
          vy: -0.20,
          state: "roaming",
          targetIdx: -1,
          timer: 140,
          label: "",
          conf: 0,
          phase: 3.4
        }
      ];
    }

    function corner(x, y, len, sx, sy) {
      ctx.beginPath();
      ctx.moveTo(x + sx * len, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + sy * len);
      ctx.stroke();
    }

    function drawBox(b, t) {
      var bw = b.bw, bh = b.bh;
      var x = b.x, y = b.y;

      var isLocked = b.state === "tracking" && b.label;

      if (isLocked) {
        // Active detection bounding box
        ctx.strokeStyle = C.boxStrong;
        ctx.lineWidth = 1.6;
        ctx.strokeRect(x + 0.5, y + 0.5, bw, bh);

        // Strong corner brackets
        ctx.strokeStyle = C.boxStrong;
        ctx.lineWidth = 2.2;
        var len = Math.min(16, Math.min(bw, bh) * 0.35);
        corner(x, y, len, 1, 1);
        corner(x + bw, y, len, -1, 1);
        corner(x, y + bh, len, 1, -1);
        corner(x + bw, y + bh, len, -1, -1);

        // Sweep scan beam inside the box
        var scanOffset = ((t * 0.0016) % 1);
        var scanY = y + bh * scanOffset;
        ctx.save();
        ctx.strokeStyle = C.isDark ? "rgba(125, 211, 252, 0.4)" : "rgba(2, 132, 199, 0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 2, scanY);
        ctx.lineTo(x + bw - 2, scanY);
        ctx.stroke();
        ctx.restore();

        // Confidence score badge: "cat 0.98", "person 0.96", etc.
        ctx.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
        var confVal = (b.conf + Math.sin(t * 0.003 + b.phase) * 0.008).toFixed(2);
        var text = b.label + " " + confVal;
        var tw = ctx.measureText(text).width;
        var ly = y > 24 ? y - 6 : y + bh + 15;

        ctx.fillStyle = C.labelBg;
        ctx.fillRect(x - 0.5, ly - 12, tw + 12, 16);
        ctx.strokeStyle = C.boxStrong;
        ctx.lineWidth = 0.8;
        ctx.strokeRect(x - 0.5, ly - 12, tw + 12, 16);

        ctx.fillStyle = C.label;
        ctx.fillText(text, x + 5, ly);
      } else {
        // Roaming / scanning reticle
        ctx.save();
        ctx.strokeStyle = C.box;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.strokeRect(x + 0.5, y + 0.5, bw, bh);
        ctx.restore();

        // Corner reticles
        ctx.strokeStyle = C.box;
        ctx.lineWidth = 1.4;
        var rlen = 10;
        corner(x, y, rlen, 1, 1);
        corner(x + bw, y, rlen, -1, 1);
        corner(x, y + bh, rlen, 1, -1);
        corner(x + bw, y + bh, len, -1, -1);

        // Scanning hint
        ctx.font = "10px 'JetBrains Mono', ui-monospace, monospace";
        var scanText = "scanning…";
        var stw = ctx.measureText(scanText).width;
        var sly = y > 22 ? y - 5 : y + bh + 14;
        ctx.fillStyle = C.labelBg;
        ctx.fillRect(x, sly - 10, stw + 8, 14);
        ctx.fillStyle = C.isDark ? "rgba(255, 255, 255, 0.5)" : "rgba(30, 41, 59, 0.55)";
        ctx.fillText(scanText, x + 4, sly);
      }
    }

    function drawMouseBox() {
      if (!mouse.active) return;

      var canvasRect = canvas.getBoundingClientRect();
      var wordSeeEl = document.getElementById("wordSee");
      var wordReasonEl = document.getElementById("wordReason");

      var wordTargets = [];
      if (wordSeeEl) {
        var rS = wordSeeEl.getBoundingClientRect();
        wordTargets.push({
          label: "see",
          baseConf: 0.98,
          x: rS.left - canvasRect.left,
          y: rS.top - canvasRect.top,
          bw: rS.width,
          bh: rS.height,
          isH1Word: true
        });
      }
      if (wordReasonEl) {
        var rR = wordReasonEl.getBoundingClientRect();
        wordTargets.push({
          label: "reason",
          baseConf: 0.98,
          x: rR.left - canvasRect.left,
          y: rR.top - canvasRect.top,
          bw: rR.width,
          bh: rR.height,
          isH1Word: true
        });
      }

      // Check all targets + heading words
      var allTargets = targets.concat(wordTargets);
      var hoveredTarget = null;
      var minDist = Infinity;
      for (var i = 0; i < allTargets.length; i++) {
        var trg = allTargets[i];
        var pad = trg.isH1Word ? 14 : 22;
        if (mouse.x >= trg.x - pad && mouse.x <= trg.x + trg.bw + pad &&
            mouse.y >= trg.y - pad && mouse.y <= trg.y + trg.bh + pad) {
          var cx = trg.x + trg.bw / 2, cy = trg.y + trg.bh / 2;
          var d = Math.hypot(mouse.x - cx, mouse.y - cy);
          if (d < minDist) {
            minDist = d;
            hoveredTarget = trg;
          }
        }
      }

      ctx.save();
      if (hoveredTarget) {
        hoveredTarget.detectedByMouse = true;
        var hx = hoveredTarget.x - 10, hy = hoveredTarget.y - 10;
        var hw = hoveredTarget.bw + 20, hh = hoveredTarget.bh + 20;

        ctx.strokeStyle = C.cursor;
        ctx.lineWidth = 1.8;
        ctx.strokeRect(hx + 0.5, hy + 0.5, hw, hh);

        var mlen = 14;
        corner(hx, hy, mlen, 1, 1);
        corner(hx + hw, hy, mlen, -1, 1);
        corner(hx, hy + hh, mlen, 1, -1);
        corner(hx + hw, hy + hh, mlen, -1, -1);

        // Scan beam
        var mscan = ((Date.now() * 0.002) % 1);
        ctx.strokeStyle = C.isDark ? "rgba(196, 181, 253, 0.4)" : "rgba(124, 58, 237, 0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx + 2, hy + hh * mscan);
        ctx.lineTo(hx + hw - 2, hy + hh * mscan);
        ctx.stroke();

        ctx.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
        var mconf = (hoveredTarget.baseConf + 0.01).toFixed(2);
        var mtext = hoveredTarget.label + " " + mconf;
        var mtw = ctx.measureText(mtext).width;
        var mly = hy > 24 ? hy - 6 : hy + hh + 16;

        ctx.fillStyle = C.labelBg;
        ctx.fillRect(hx, mly - 12, mtw + 12, 16);
        ctx.strokeStyle = C.cursor;
        ctx.lineWidth = 0.8;
        ctx.strokeRect(hx, mly - 12, mtw + 12, 16);
        ctx.fillStyle = C.cursorLabel;
        ctx.fillText(mtext, hx + 5, mly);
      } else {
        var bw = 140, bh = 104;
        var mx = mouse.x - bw / 2, my = mouse.y - bh / 2;

        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = C.cursor;
        ctx.lineWidth = 1;
        ctx.strokeRect(mx + 0.5, my + 0.5, bw, bh);

        ctx.font = "10px 'JetBrains Mono', ui-monospace, monospace";
        var text = "cursor 0.99";
        var tw = ctx.measureText(text).width;
        ctx.fillStyle = C.labelBg;
        ctx.fillRect(mx, my + bh + 3, tw + 10, 15);
        ctx.fillStyle = C.cursorLabel;
        ctx.fillText(text, mx + 4, my + bh + 14);
      }
      ctx.restore();
    }

    function frame(t) {
      ctx.clearRect(0, 0, w, h);

      // Reset detection flags each frame
      for (var ti = 0; ti < targets.length; ti++) {
        targets[ti].detectedByBox = false;
        targets[ti].detectedByMouse = false;
      }

      // Feature lines
      for (var i = 0; i < points.length; i++) {
        var p = points[i];
        for (var j = i + 1; j < points.length; j++) {
          var q = points[j];
          var dx = p.x - q.x, dy = p.y - q.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 15600) {
            var a = (1 - d2 / 15600) * 0.16;
            ctx.strokeStyle = "rgba(" + C.line + ", " + a.toFixed(3) + ")";
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }

      // Mouse attraction
      if (mouse.active) {
        for (var k = 0; k < points.length; k++) {
          var pt = points[k];
          var mdx = mouse.x - pt.x, mdy = mouse.y - pt.y;
          var md2 = mdx * mdx + mdy * mdy;
          if (md2 < 26000 && md2 > 1) {
            var f = (1 - md2 / 26000) * 0.012;
            pt.vx += mdx * f * 0.05;
            pt.vy += mdy * f * 0.05;
          }
        }
      }

      // Feature particles
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

        ctx.fillStyle = C.dot;
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }

      // Update detector boxes state machine
      for (var b = 0; b < boxes.length; b++) {
        var box = boxes[b];

        if (box.state === "tracking" && box.targetIdx >= 0 && box.targetIdx < targets.length) {
          var trg = targets[box.targetIdx];
          trg.detectedByBox = true;

          // Smoothly lock onto target bounds with padding
          var targetX = trg.x - 12;
          var targetY = trg.y - 12;
          var targetW = trg.bw + 24;
          var targetH = trg.bh + 24;

          box.x += (targetX - box.x) * 0.12;
          box.y += (targetY - box.y) * 0.12;
          box.bw += (targetW - box.bw) * 0.12;
          box.bh += (targetH - box.bh) * 0.12;

          box.timer--;
          if (box.timer <= 0) {
            // Unlock and resume roaming
            box.state = "roaming";
            box.targetIdx = -1;
            box.label = "";
            box.timer = 120 + Math.random() * 100;
            // Eject in random direction
            box.vx = (Math.random() - 0.5) * 0.6;
            box.vy = (Math.random() - 0.5) * 0.6;
          }
        } else {
          // Roaming state
          box.x += box.vx;
          box.y += box.vy;

          if (box.x < 10) { box.x = 10; box.vx *= -1; }
          if (box.x > w - box.bw - 10) { box.x = w - box.bw - 10; box.vx *= -1; }
          if (box.y < 10) { box.y = 10; box.vy *= -1; }
          if (box.y > h - box.bh - 10) { box.y = h - box.bh - 10; box.vy *= -1; }

          // Check for collision / overlap with any target
          for (var tIdx = 0; tIdx < targets.length; tIdx++) {
            var cand = targets[tIdx];
            var boxCenterX = box.x + box.bw / 2;
            var boxCenterY = box.y + box.bh / 2;
            var candCenterX = cand.x + cand.bw / 2;
            var candCenterY = cand.y + cand.bh / 2;
            var dist = Math.hypot(boxCenterX - candCenterX, boxCenterY - candCenterY);

            // If close enough or bounding boxes intersect
            if (dist < Math.max(cand.bw, cand.bh) * 0.85) {
              box.state = "tracking";
              box.targetIdx = tIdx;
              box.label = cand.label;
              box.conf = cand.baseConf;
              box.timer = 180 + Math.floor(Math.random() * 120); // hold lock for 3-5 seconds
              cand.detectedByBox = true;
              break;
            }
          }
        }
      }

      // First draw Mouse Box detection (which sets detectedByMouse)
      drawMouseBox();

      // Render Targets (Cats, Person, Car, Bird, Dog)
      for (var k = 0; k < targets.length; k++) {
        var tObj = targets[k];
        var isDet = tObj.detectedByBox || tObj.detectedByMouse;

        if (tObj.type === "person") {
          drawPerson(ctx, tObj.x, tObj.y, tObj.bw, tObj.bh, isDet, C.isDark, t);
        } else if (tObj.type === "cat_sitting") {
          drawCatSitting(ctx, tObj.x, tObj.y, tObj.bw, tObj.bh, isDet, C.isDark, t);
        } else if (tObj.type === "cat_walking") {
          drawCatWalking(ctx, tObj.x, tObj.y, tObj.bw, tObj.bh, isDet, C.isDark, t);
        } else if (tObj.type === "car") {
          drawCar(ctx, tObj.x, tObj.y, tObj.bw, tObj.bh, isDet, C.isDark, t);
        } else if (tObj.type === "bird") {
          drawBird(ctx, tObj.x, tObj.y, tObj.bw, tObj.bh, isDet, C.isDark, t);
        } else if (tObj.type === "dog") {
          drawDog(ctx, tObj.x, tObj.y, tObj.bw, tObj.bh, isDet, C.isDark, t);
        }
      }

      // Draw all bounding boxes
      for (var bi = 0; bi < boxes.length; bi++) {
        drawBox(boxes[bi], t);
      }

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
      /* Touch has no cursor: without this a scroll gesture leaves the
         dashed "cursor" box parked wherever the finger last was. */
      if (e.pointerType === "touch") return;
      var r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.active = true;
    });
    canvas.addEventListener("pointerleave", function () {
      mouse.active = false;
    });
    canvas.addEventListener("pointercancel", function () {
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

  /* ── 3. Scroll reveal, nav, progress ────────────────────── */
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
    var linkStrip = document.querySelector(".nav-links");
    var lastActive = null;
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

      /* On phones the strip scrolls, so keep the active link in view. */
      if (current && current !== lastActive && linkStrip) {
        var box = linkStrip.getBoundingClientRect();
        var rect = current.getBoundingClientRect();
        if (rect.left < box.left + 4) {
          linkStrip.scrollLeft -= box.left + 4 - rect.left;
        } else if (rect.right > box.right - 18) {
          linkStrip.scrollLeft += rect.right - (box.right - 18);
        }
      }
      lastActive = current;
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


  /* ── 5. Cursor spotlight on cards ───────────────────────── */
  (function spotlight() {
    if (reduced || !window.matchMedia("(hover: hover)").matches) return;
    var cards = $$(".card, .contact-tile, .notes-card");

    cards.forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (e.clientX - r.left) + "px");
        card.style.setProperty("--my", (e.clientY - r.top) + "px");
      });
    });
  })();

  /* ── 6. Footer year ─────────────────────────────────────── */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
