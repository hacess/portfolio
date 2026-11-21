/* Page behaviour: theme, nav state, skills map, GitHub stats, email + contact form. */
(function () {
  "use strict";

  var cfg = window.SITE_CONFIG || {};

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) { return null; }
  }
  window.siteStore = store;

  /* ---------- Theme ---------- */
  function initTheme() {
    var btn = document.getElementById("theme-toggle");
    var label = document.getElementById("theme-label");
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    function current() {
      var t = document.documentElement.getAttribute("data-theme");
      return t || (mq.matches ? "dark" : "light");
    }
    function sync() {
      var next = current() === "dark" ? "light" : "dark";
      label.textContent = "Switch to " + next + " theme";
      btn.setAttribute("aria-label", "Switch to " + next + " theme");
    }
    btn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      store("theme", next);
      sync();
    });
    if (mq.addEventListener) mq.addEventListener("change", sync);
    sync();
  }

  /* ---------- Nav: highlight the section in view ---------- */
  function initNav() {
    var links = Array.prototype.slice.call(document.querySelectorAll(".site-nav a"));
    if (!("IntersectionObserver" in window)) return;
    var map = {};
    links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.removeAttribute("aria-current"); });
        var a = map[e.target.id];
        if (a) {
          a.setAttribute("aria-current", "true");
          if (a.scrollIntoView && window.innerWidth < 720) {
            var nav = a.closest(".site-nav");
            nav.scrollTo({ left: a.offsetLeft - 16, behavior: "smooth" });
          }
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---------- Skills system map ---------- */
  function initSkills() {
    var panel = document.getElementById("skill-panel");
    var tpl = document.getElementById("skill-data");
    if (!panel || !tpl) return;
    var data = {};
    Array.prototype.forEach.call(tpl.content.querySelectorAll("[data-skill]"), function (n) {
      data[n.getAttribute("data-skill")] = {
        title: n.getAttribute("data-title"),
        link: n.getAttribute("data-link"),
        linkText: n.getAttribute("data-link-text"),
        items: n.textContent.split("|")
      };
    });
    var nodes = Array.prototype.slice.call(document.querySelectorAll("button.sysnode"));
    nodes.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var open = btn.getAttribute("aria-expanded") === "true";
        nodes.forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
        if (open) { panel.hidden = true; return; }
        var d = data[btn.getAttribute("data-skill")];
        btn.setAttribute("aria-expanded", "true");
        panel.querySelector(".skill-panel__title").textContent = d.title;
        var list = panel.querySelector(".skill-panel__list");
        list.textContent = "";
        d.items.forEach(function (s) { var li = document.createElement("li"); li.textContent = s.trim(); list.appendChild(li); });
        var p = panel.querySelector(".skill-panel__link");
        p.textContent = "";
        if (d.link) {
          p.appendChild(document.createTextNode("Related: "));
          var a = document.createElement("a");
          a.href = d.link; a.textContent = d.linkText + " →";
          p.appendChild(a);
        }
        panel.hidden = false;
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) {
        var openBtn = document.querySelector('button.sysnode[aria-expanded="true"]');
        panel.hidden = true;
        nodes.forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
        if (openBtn) openBtn.focus();
      }
    });
  }

  /* ---------- GitHub stars/forks (live, cached, graceful fallback) ---------- */
  function initGitHub() {
    var cards = Array.prototype.slice.call(document.querySelectorAll("[data-repo]"));
    var status = document.getElementById("gh-status");
    if (!cards.length || !cfg.githubUser) return;
    var KEY = "gh-stats-v1";
    var ttl = (cfg.githubCacheHours || 6) * 3600 * 1000;

    function render(stats) {
      cards.forEach(function (card) {
        var s = stats[card.getAttribute("data-repo")];
        if (!s) return;
        var st = card.querySelector('[data-stat="stars"]');
        var fk = card.querySelector('[data-stat="forks"]');
        if (st) st.textContent = s.stars;
        if (fk) fk.textContent = s.forks;
        card.setAttribute("data-stars", s.stars);
      });
    }
    function setStatus(t) { if (status) status.textContent = t; }

    var cached = null;
    try { cached = JSON.parse(store(KEY) || "null"); } catch (e) { cached = null; }
    render(cfg.repos || {});
    if (cached && cached.data) render(cached.data);
    if (cached && Date.now() - cached.ts < ttl) { setStatus("(cached " + ago(cached.ts) + ")"); return; }
    if (!window.fetch) return;

    var repos = cards.map(function (c) { return c.getAttribute("data-repo"); });
    Promise.all(repos.map(function (r) {
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 6000);
      return fetch("https://api.github.com/repos/" + encodeURIComponent(cfg.githubUser) + "/" + encodeURIComponent(r), {
        headers: { Accept: "application/vnd.github+json" },
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      }).then(function (j) {
        return [r, { stars: j.stargazers_count, forks: j.forks_count }];
      }).catch(function () { return null; });
    })).then(function (results) {
      var data = (cached && cached.data) || {};
      var ok = 0;
      results.forEach(function (pair) { if (pair) { data[pair[0]] = pair[1]; ok++; } });
      if (ok) {
        store(KEY, JSON.stringify({ ts: Date.now(), data: data }));
        render(data);
        setStatus(ok === repos.length ? "(live)" : "(partly live; GitHub limited some requests)");
      } else {
        setStatus(cached ? "(GitHub unavailable; showing cached numbers)" : "(GitHub unavailable; showing saved numbers)");
      }
    });

    function ago(ts) {
      var m = Math.round((Date.now() - ts) / 60000);
      return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.round(m / 60) + " h ago";
    }
  }

  /* ---------- Email (assembled at runtime) + mailto contact form ---------- */
  function emailAddress() {
    var e = cfg.email || {};
    return e.user && e.domain ? e.user + "@" + e.domain : "";
  }

  function initEmail() {
    var link = document.getElementById("email-link");
    var addr = emailAddress();
    if (!link || !addr) return;
    link.href = "mailto:" + addr;
    link.textContent = addr;
  }

  function initContactForm() {
    var form = document.getElementById("contact-form");
    if (!form) return;
    var err = document.getElementById("cf-error");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = form.elements.name.value.trim();
      var subject = form.elements.subject.value.trim();
      var message = form.elements.message.value.trim();
      if (!name || !message) {
        err.textContent = !name ? "Please add your name." : "Please write a short message.";
        (!name ? form.elements.name : form.elements.message).focus();
        return;
      }
      err.textContent = "";
      var subj = subject || "Hello from your portfolio";
      var body = message + "\n\n— " + name;
      window.location.href = "mailto:" + emailAddress() +
        "?subject=" + encodeURIComponent(subj) + "&body=" + encodeURIComponent(body);
    });
  }

  function init() {
    var y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
    initTheme();
    initNav();
    initSkills();
    initGitHub();
    initEmail();
    initContactForm();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
