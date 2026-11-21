/*
 * "Pip": a small original pixel-art pet, inspired by my Kairo desktop pet.
 * - Walks along the bottom of the viewport and sits in the page gutter next to the section in view.
 * - Reacts to project-card hovers and chat answers; greets first-time visitors.
 * - Never blocks clicks (pointer-events: none), hidden when there is no free gutter,
 *   no roaming with prefers-reduced-motion, and an on/off toggle saved in localStorage.
 */
(function () {
  "use strict";

  // 16x14 sprite. o = outline, B = body, L = belly, E = eye, W = eye shine, C = cheek, a/b = legs.
  var SPRITE = [
    "...oo......oo...",
    "..oBBo....oBBo..",
    "..oBBBooooBBBo..",
    ".oBBBBBBBBBBBBo.",
    ".oBBBBBBBBBBBBo.",
    "oBBWEBBBBBBWEBBo",
    "oBBEEBBBBBBEEBBo",
    "oBCBBBBooBBBBCBo",
    "oBBBBBBBBBBBBBBo",
    "oBBLLLLLLLLLLBBo",
    ".oBLLLLLLLLLLBo.",
    "..oooooooooooo..",
    "...aa......bb...",
    "...aa......bb..."
  ];
  var COLORS = { o: "#1d2433", B: "#f59e42", L: "#ffe2b8", E: "#1d2433", W: "#ffffff", C: "#ff8a7a", a: "#1d2433", b: "#1d2433" };

  function buildSprite() {
    var groups = { body: "", eyes: "", a: "", b: "" };
    SPRITE.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var ch = row[x];
        if (ch === ".") continue;
        var r = '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + COLORS[ch] + '"/>';
        if (ch === "E" || ch === "W") groups.eyes += r;
        else if (ch === "a") groups.a += r;
        else if (ch === "b") groups.b += r;
        else groups.body += r;
      }
    });
    return '<svg viewBox="0 0 16 14" xmlns="http://www.w3.org/2000/svg">' +
      '<g class="leg-a">' + groups.a + '</g><g class="leg-b">' + groups.b + '</g>' +
      '<g>' + groups.body + '</g><g class="eyes">' + groups.eyes + '</g></svg>';
  }

  var SECTION_HINTS = {
    hero: "Hi, I'm Pip! Try a question chip in the chat →",
    skills: "Psst: click a box to expand it.",
    "case-studies": "Each case has a little architecture diagram.",
    projects: "Hover a card, I love stars ★",
    decisions: "Why X over Y, in a few lines.",
    contact: "Say hi! It opens your email app."
  };

  var PET_W = 48;
  var MIN_GUTTER = 64;    // need this much free space beside content to show the pet

  function init() {
    var pet = document.getElementById("pet");
    var toggle = document.getElementById("pet-toggle");
    if (!pet || !toggle) return;
    var body = pet.querySelector(".pet__body");
    var bubble = pet.querySelector(".pet__bubble");
    body.innerHTML = buildSprite();

    var store = window.siteStore || function () { return null; };
    var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
    var enabled = store("pet") !== "off";
    var x = -PET_W, targetX = null, raf = null, lastT = 0;
    var bubbleTimer = null, idleTimer = null;
    var currentSection = "hero";
    var shownHints = {};
    var side = "right";

    function wrapRect() {
      var w = document.querySelector("main .wrap");
      return w ? w.getBoundingClientRect() : { left: 0, right: window.innerWidth };
    }
    function gutter() {
      var r = wrapRect();
      return Math.min(r.left, window.innerWidth - r.right);
    }
    function fits() { return gutter() >= MIN_GUTTER; }

    function restX(s) {
      var r = wrapRect();
      if (s === "left") return Math.max(4, r.left / 2 - PET_W / 2);
      return Math.min(window.innerWidth - PET_W - 4, r.right + (window.innerWidth - r.right) / 2 - PET_W / 2);
    }

    function place() {
      pet.style.transform = "translateX(" + Math.round(x) + "px)";
    }

    function walkTo(nx) {
      targetX = nx;
      if (reduceMQ.matches) { x = nx; targetX = null; place(); return; }
      if (!raf) { lastT = 0; raf = requestAnimationFrame(step); }
    }

    function step(t) {
      if (!lastT) lastT = t;
      var dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;
      if (targetX == null) { stop(); return; }
      var dx = targetX - x;
      var speed = Math.abs(dx) > 300 ? 420 : 170; // hurry across the page, stroll in the gutter
      if (Math.abs(dx) < 2) { x = targetX; targetX = null; place(); stop(); return; }
      if (Math.abs(dx) > 120) bubble.hidden = true; // don't drag a bubble across content
      pet.classList.add("is-walking");
      pet.classList.toggle("is-left", dx < 0);
      x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
      place();
      raf = requestAnimationFrame(step);
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      pet.classList.remove("is-walking");
      if (pending) { var p = pending; pending = null; say(p[0], p[1]); }
    }

    var pending = null;
    function say(text, ms) {
      if (!enabled || pet.hidden) return;
      // While crossing the page, queue the message until the pet reaches its gutter.
      if (targetX != null && Math.abs(targetX - x) > 120) { pending = [text, ms]; return; }
      // Keep the bubble inside the free gutter so it never covers page content.
      var room = Math.floor(gutter() - 12);
      if (room < 110) return;
      var w = Math.min(220, room);
      pet.style.setProperty("--bubble-max", w + "px");
      var onLeft = x + PET_W / 2 < window.innerWidth / 2;
      // Anchor the bubble to the outer screen edge of the gutter; tail points at the pet.
      if (onLeft) {
        bubble.style.left = (6 - x) + "px"; bubble.style.right = "auto";
        pet.style.setProperty("--tail", Math.max(8, x - 6 + PET_W / 2 - 5) + "px");
      } else {
        var rightGap = window.innerWidth - (x + PET_W);
        bubble.style.left = "auto"; bubble.style.right = (6 - rightGap) + "px";
        pet.style.setProperty("--tail", Math.max(8, rightGap - 6 + PET_W / 2 - 5) + "px");
      }
      pet.classList.toggle("bubble-right", !onLeft);
      bubble.textContent = text;
      bubble.hidden = false;
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(function () { bubble.hidden = true; }, ms || 3200);
    }
    function hop() {
      if (reduceMQ.matches) return;
      pet.classList.remove("is-hop");
      void pet.offsetWidth; // restart animation
      pet.classList.add("is-hop");
      setTimeout(function () { pet.classList.remove("is-hop"); }, 450);
    }

    function scheduleIdle() {
      clearTimeout(idleTimer);
      if (reduceMQ.matches) return;
      idleTimer = setTimeout(function () {
        if (!enabled || pet.hidden || targetX != null) return scheduleIdle();
        // Small wander inside the current gutter.
        var base = restX(side);
        var g = gutter();
        var range = Math.max(0, (g - PET_W) / 2 - 6);
        walkTo(base + (Math.random() * 2 - 1) * range);
        scheduleIdle();
      }, 5000 + Math.random() * 5000);
    }

    function update() {
      var show = enabled && fits();
      pet.hidden = !show;
      if (!show) { stop(); bubble.hidden = true; return; }
      walkTo(restX(side));
    }

    function onSection(id) {
      if (id === currentSection) return;
      currentSection = id;
      side = side === "right" ? "left" : "right";
      if (!enabled || !fits()) return;
      walkTo(restX(side));
      if (SECTION_HINTS[id] && !shownHints[id]) {
        shownHints[id] = true;
        setTimeout(function () { say(SECTION_HINTS[id]); }, reduceMQ.matches ? 0 : 900);
      }
    }

    function setEnabled(on, persist) {
      enabled = on;
      toggle.setAttribute("aria-pressed", String(on));
      toggle.setAttribute("aria-label", on ? "Hide the mascot" : "Show the mascot");
      if (persist) store("pet", on ? "on" : "off");
      update();
      if (on && persist) { hop(); say("I'm back!"); }
    }

    toggle.addEventListener("click", function () { setEnabled(!enabled, true); });

    // Section tracking.
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) onSection(e.target.id); });
      }, { rootMargin: "-45% 0px -50% 0px" });
      document.querySelectorAll("main > section[id]").forEach(function (s) { io.observe(s); });
    }

    // React to project cards (mouse and keyboard focus).
    document.querySelectorAll(".project").forEach(function (card) {
      var lastReact = 0;
      function react() {
        var now = Date.now();
        if (now - lastReact < 2500) return;
        lastReact = now;
        hop();
        var stars = card.getAttribute("data-stars");
        var name = card.querySelector("h3").textContent.trim();
        say(stars && +stars > 0 ? "★ " + stars + " stars on " + name.split(" ").slice(0, 3).join(" ") + "!" : "Ooh, " + name + "!", 2400);
      }
      card.addEventListener("mouseenter", react);
      card.addEventListener("focusin", react);
    });

    // React to chat answers.
    window.addEventListener("portfolio:answer", function (e) {
      var t = e.detail && e.detail.type;
      if (t === "answer") { hop(); say("Found it in my notes!", 2000); }
      else if (t === "no-match") say("Hmm, not on this site. Email works!", 2600);
      else if (t === "guardrail") say("Nice try 😄 I only answer from my notes.", 2600);
    });

    var resizeT;
    window.addEventListener("resize", function () {
      clearTimeout(resizeT);
      resizeT = setTimeout(update, 120);
    });
    if (reduceMQ.addEventListener) reduceMQ.addEventListener("change", update);

    setEnabled(enabled, false);
    if (!enabled) return;
    // Enter from the left edge, walk to the gutter, then greet first-time visitors.
    x = reduceMQ.matches ? restX(side) : -PET_W;
    place();
    update();
    scheduleIdle();
    if (store("pet-greeted") !== "1") {
      store("pet-greeted", "1");
      shownHints.hero = true;
      setTimeout(function () { hop(); say(SECTION_HINTS.hero, 4500); }, reduceMQ.matches ? 200 : 1400);
    }
  }

  window.PipSprite = buildSprite;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
