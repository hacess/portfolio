/*
 * "Ask my portfolio" — client-side retrieval assistant.
 * No LLM, no API calls, no cost. Pipeline:
 *   question -> guardrails -> tokenize/stem/expand -> BM25 over knowledge chunks
 *   -> relevance threshold -> extractive answer (sentences copied from my own text) -> source chips
 * Because answers are extracted, never generated, the assistant cannot invent facts.
 */
(function (root) {
  "use strict";

  /* ---------- Text processing ---------- */
  var STOP = new Set(("a an the and or but if of to in on at by for with from as is are was were be been being am " +
    "do does did doing have has had having i me my mine myself you your yours yourself's we our they them their " +
    "he she it its this that these those there here what which who whom whose when where why how can could " +
    "would should will shall may might must about into over under again further then once just also very really " +
    "so than too only own same some any all each both few more most other such no nor not now up down out off " +
    "tell show give explain describe please let know want like get got thing things kind sort much many lot " +
    "chandan chakraborty him his work worked working use used using").split(/\s+/));
  // Note: "yourself", "experience", "built" etc. are kept on purpose: they carry intent.
  STOP.delete("yourself");

  // Query expansion: maps a (stemmed) query term to extra terms that appear in my content.
  var SYNONYMS = {
    yourself: ["about", "summary", "architect"],
    ai: ["llm", "rag", "claude", "gemini"],
    genai: ["llm", "rag"],
    gpt: ["llm"],
    chatgpt: ["llm"],
    openai: ["llm"],
    ml: ["ai", "llm"],
    hallucinat: ["hallucination"],
    vector: ["pgvector", "embedding"],
    embed: ["embedding", "pgvector"],
    cloud: ["aws"],
    amazon: ["aws"],
    devop: ["jenkins", "docker", "cicd"],
    deploy: ["deployment", "jenkins", "aws"],
    cach: ["redis"],
    fast: ["performance", "redis"],
    perform: ["performance"],
    db: ["database"],
    postgr: ["postgresql", "pgvector"],
    hire: ["contact", "email"],
    email: ["contact"],
    mail: ["email", "contact"],
    reach: ["contact"],
    phone: ["contact"],
    linkedin: ["contact"],
    github: ["github", "open", "source"],
    repo: ["github", "project"],
    opensourc: ["open", "source", "github"],
    side: ["project"],
    hobby: ["side", "project"],
    pet: ["kairo", "mascot"],
    mascot: ["kairo", "pet"],
    exp: ["experience", "years"],
    year: ["experience"],
    senior: ["senior", "experience"],
    job: ["role", "career"],
    career: ["role", "career"],
    compani: ["company", "employer"],
    employ: ["company", "employer"],
    live: ["location", "based"],
    locat: ["location"],
    degre: ["education"],
    colleg: ["education"],
    univers: ["education"],
    lead: ["leadership", "team"],
    manag: ["leadership", "team"],
    mentor: ["leadership", "team"],
    team: ["leadership"],
    microservic: ["microservices"],
    saa: ["saas"],
    scal: ["scalable"],
    extens: ["extension", "chrome"],
    plugin: ["extension", "chrome"],
    scrap: ["scraping", "selenium"],
    stack: ["skills", "languages", "frameworks"],
    tech: ["skills", "stack"],
    skill: ["skills"],
    languag: ["languages"],
    framework: ["frameworks"],
    frontend: ["frontend", "react", "vue"],
    backend: ["backend", "api"],
    decis: ["decision", "why"],
    tradeoff: ["decision"],
    choos: ["decision", "why"],
    chose: ["decision", "why"],
    pdf: ["document", "ocr"],
    ocr: ["ocr", "document"],
    document: ["document", "pipeline"],
    certif: ["certification"]
  };

  function stem(w) {
    if (w.length <= 3) return w;
    if (/ies$/.test(w) && w.length > 4) w = w.slice(0, -3) + "y";
    else if (/sses$/.test(w)) w = w.slice(0, -2);
    else if (/[^su]s$/.test(w)) w = w.slice(0, -1);
    if (/ing$/.test(w) && w.length > 5) w = w.slice(0, -3);
    else if (/ed$/.test(w) && w.length > 4) w = w.slice(0, -2);
    if (/ation$/.test(w) && w.length > 7) w = w.slice(0, -5);
    if (/ions?$/.test(w) && w.length > 6) w = w.replace(/ions?$/, "");
    if (/e$/.test(w) && w.length > 4) w = w.slice(0, -1);
    return w;
  }

  function normalize(text) {
    return String(text).toLowerCase()
      .replace(/ci\s*\/\s*cd/g, " cicd ")
      .replace(/manifest\s*v3/g, " mv3 manifestv3 ")
      .replace(/open[\s-]source/g, " opensource open source ")
      .replace(/e-commerce/g, " ecommerce ")
      .replace(/45,000\+?/g, " 45000 ")
      .replace(/['’]s\b/g, "")
      .replace(/[^a-z0-9+#.\s-]/g, " ")
      .replace(/[.\-]+(\s|$)/g, " ")
      .replace(/(^|\s)[.\-]+/g, " ");
  }

  function tokenize(text) {
    var out = [];
    normalize(text).split(/[\s\-]+/).forEach(function (t) {
      if (!t || t.length < 2 || STOP.has(t)) return;
      var s = stem(t);
      if (s && !STOP.has(s)) out.push(s);
    });
    return out;
  }

  // Also index synonym keys by their stemmed form so lookups work after stemming.
  var SYN = Object.create(null);
  Object.keys(SYNONYMS).forEach(function (k) { SYN[k] = SYNONYMS[k]; SYN[stem(k)] = SYN[stem(k)] || SYNONYMS[k]; });

  function expandQuery(tokens) {
    var out = tokens.slice();
    tokens.forEach(function (t) {
      var syn = SYN[t];
      if (syn) syn.forEach(function (x) { tokenize(x).forEach(function (s) { out.push(s); }); });
    });
    return out;
  }

  /* ---------- BM25 index ---------- */
  function buildIndex(chunks) {
    var docs = chunks.map(function (c) {
      // Title and tags are weighted by repetition; they summarise the chunk's intent.
      var tagText = (c.tags || []).join(" ");
      var toks = tokenize(c.title + " " + c.title + " " + c.text + " " + tagText + " " + tagText);
      var tf = Object.create(null);
      toks.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
      return { chunk: c, tf: tf, len: toks.length };
    });
    var df = Object.create(null);
    docs.forEach(function (d) { Object.keys(d.tf).forEach(function (t) { df[t] = (df[t] || 0) + 1; }); });
    var avgLen = docs.reduce(function (s, d) { return s + d.len; }, 0) / Math.max(docs.length, 1);
    return { docs: docs, df: df, N: docs.length, avgLen: avgLen };
  }

  function bm25(index, queryTokens) {
    var k1 = 1.2, b = 0.75;
    var uniq = Array.from(new Set(queryTokens));
    // Original (non-expanded) terms count fully; expansion terms count half.
    return index.docs.map(function (d) {
      var score = 0, matched = 0;
      uniq.forEach(function (t) {
        var f = d.tf[t];
        if (!f) return;
        matched++;
        var n = index.df[t] || 0;
        var idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
        score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / index.avgLen));
      });
      return { chunk: d.chunk, score: score, matched: matched };
    }).sort(function (a, b) { return b.score - a.score; });
  }

  // Words that carry little meaning when a more specific term is present
  // ("experience with AWS" is about AWS, not about my years of experience).
  var GENERIC = new Set(["experienc", "built", "build", "made", "mak", "creat", "done", "project", "background"]);

  function search(index, question, opts) {
    opts = opts || {};
    var base = tokenize(question);
    var specific = base.filter(function (t) { return !GENERIC.has(t); });
    if (specific.length) base = specific;
    var expanded = expandQuery(base);
    var ranked = bm25(index, expanded);
    var minScore = opts.minScore != null ? opts.minScore : 2.2;
    var topK = opts.topK || 3;
    var best = ranked[0] ? ranked[0].score : 0;
    var hits = ranked.filter(function (r, i) {
      return r.score >= minScore && r.score >= best * 0.5 && i < topK;
    });
    return { tokens: base, expanded: expanded, hits: hits, ranked: ranked };
  }

  /* ---------- Guardrails ---------- */
  var INJECTION = /(ignore|disregard|forget|override)\b.{0,40}\b(instruction|prompt|rule|previous|above|context)|system\s*prompt|you\s+are\s+now|act\s+as\b|pretend\s+(to\s+be|you)|jailbreak|developer\s+mode|reveal\s+(your|the)\s+(prompt|instructions)|print\s+(your|the)\s+(prompt|instructions)/i;
  var GREETING = /^\s*(hi|hello|hey|hiya|yo|good\s+(morning|afternoon|evening)|namaste)\b[\s!.?]*$/i;
  var THANKS = /^\s*(thanks|thank\s+you|thx|cheers|great|cool|nice)\b[\s!.?]*$/i;

  /* ---------- Answer composition (extractive) ---------- */
  function sentences(text) {
    // Split only where a sentence end is followed by a capital letter (keeps "B.Tech", "github.com").
    return text.split(/(?<=[.!?])\s+(?=[A-Z])/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  // True when less than half of the sentence's terms already appear in the answer so far.
  function novel(sentence, existing) {
    var have = new Set(tokenize(existing));
    var toks = tokenize(sentence);
    if (!toks.length) return false;
    var seen = toks.filter(function (t) { return have.has(t); }).length;
    return seen / toks.length < 0.5;
  }

  function composeAnswer(result) {
    var qset = new Set(result.expanded);
    var used = [];
    var parts = [];
    var addedSupport = false;
    result.hits.forEach(function (hit, i) {
      var ss = sentences(hit.chunk.text);
      if (i === 0) {
        // The best chunk is short and self-contained: use it whole (max 3 sentences).
        ss.slice(0, 3).forEach(function (s) { parts.push(s); });
        used.push(hit.chunk);
      } else {
        // Supporting chunks: add only their single most relevant sentence.
        var bestS = null, bestN = 0;
        ss.forEach(function (s) {
          var n = tokenize(s).filter(function (t) { return qset.has(t); }).length;
          if (n > bestN) { bestN = n; bestS = s; }
        });
        // At most one supporting sentence, and only if it adds new information.
        if (bestS && bestN >= 1 && parts.length < 4 && !addedSupport && novel(bestS, parts.join(" "))) {
          parts.push(bestS);
          addedSupport = true;
          used.push(hit.chunk);
        }
      }
    });
    return { text: parts.join(" "), sources: used };
  }

  function answer(index, question, opts) {
    var q = String(question || "").trim();
    var maxLen = (opts && opts.maxQuestionLength) || 300;
    if (!q) return { type: "empty", text: "Type a question about my work, skills or projects.", sources: [] };
    if (q.length > maxLen) {
      return { type: "too-long", text: "That question is a bit long for me. Could you keep it under " + maxLen + " characters?", sources: [] };
    }
    if (INJECTION.test(q)) {
      return {
        type: "guardrail",
        text: "I only answer questions about my work using the content on this site, and I treat everything typed here as a question, not as instructions. Try asking about my RAG work, my experience or my projects.",
        sources: []
      };
    }
    if (GREETING.test(q)) {
      return { type: "greeting", text: "Hi! Ask me about my experience, the RAG and LLM systems I've built, my architecture decisions or my open-source projects.", sources: [] };
    }
    if (THANKS.test(q)) {
      return { type: "thanks", text: "Glad that helped. If you'd like to talk, the contact section has my email.", sources: [] };
    }
    var result = search(index, q, opts);
    if (!result.hits.length) {
      return {
        type: "no-match",
        text: "I don't have that information on this site, so I won't guess. Feel free to email me and I'll answer directly.",
        sources: [{ title: "Contact", section: "#contact" }],
        debug: result
      };
    }
    var a = composeAnswer(result);
    return { type: "answer", text: a.text, sources: a.sources, debug: result };
  }

  var Engine = { tokenize: tokenize, stem: stem, buildIndex: buildIndex, search: search, answer: answer };

  if (typeof module !== "undefined" && module.exports) { module.exports = Engine; return; }
  root.PortfolioChatEngine = Engine;

  /* ---------- UI ---------- */
  var cfg = (root.SITE_CONFIG && root.SITE_CONFIG.chat) || {};
  var index = null;
  var loading = null;

  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (loading) return loading;
    loading = fetch(cfg.knowledgeUrl || "data/knowledge.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) { index = buildIndex(data.chunks); return index; })
      .catch(function (e) { loading = null; throw e; });
    return loading;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function goToSection(hash) {
    var target = document.querySelector(hash);
    if (!target) return;
    var reduce = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    var heading = target.querySelector("h1, h2, h3") || target;
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
    if (history.replaceState) history.replaceState(null, "", hash);
  }

  function init() {
    var form = document.getElementById("chat-form");
    if (!form) return;
    var input = document.getElementById("chat-input");
    var log = document.getElementById("chat-log");
    var empty = document.getElementById("chat-empty");
    var status = document.getElementById("chat-status");
    var sendBtn = form.querySelector("button[type=submit]");
    var busy = false;

    function addMessage(role, text, sources) {
      if (empty) empty.hidden = true;
      var msg = el("div", "msg msg--" + role);
      var who = el("span", "msg__who", role === "user" ? "You" : "Chandan (auto)");
      var body = el("p", "msg__text", text);
      msg.appendChild(who);
      msg.appendChild(body);
      if (sources && sources.length) {
        var list = el("div", "msg__sources");
        list.appendChild(el("span", "msg__sources-label", "Sources:"));
        var seen = {};
        sources.forEach(function (s) {
          var key = s.title + s.section;
          if (seen[key]) return;
          seen[key] = true;
          var chip = el("a", "source-chip", s.title);
          chip.href = s.section;
          chip.addEventListener("click", function (e) { e.preventDefault(); goToSection(s.section); });
          list.appendChild(chip);
        });
        msg.appendChild(list);
      }
      log.appendChild(msg);
      log.scrollTop = log.scrollHeight;
      return msg;
    }

    function ask(question) {
      question = String(question || "").trim();
      if (!question || busy) return;
      busy = true;
      sendBtn.disabled = true;
      addMessage("user", question);
      var pending = el("div", "msg msg--bot msg--loading");
      pending.appendChild(el("span", "msg__who", "Chandan (auto)"));
      var dots = el("p", "msg__text");
      dots.innerHTML = '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="visually-hidden">Searching my notes…</span>';
      pending.appendChild(dots);
      log.appendChild(pending);
      log.scrollTop = log.scrollHeight;
      status.textContent = "Searching…";

      var started = Date.now();
      loadIndex().then(function (idx) {
        var res = answer(idx, question, cfg);
        // A short minimum delay so the loading state is perceptible, not flickery.
        var wait = Math.max(0, 280 - (Date.now() - started));
        setTimeout(function () {
          pending.remove();
          addMessage("bot", res.text, res.sources);
          status.textContent = "Answer: " + res.text;
          root.dispatchEvent(new CustomEvent("portfolio:answer", { detail: { type: res.type } }));
          done();
        }, wait);
      }).catch(function () {
        pending.remove();
        addMessage("bot", "Sorry, I couldn't load my notes. If you opened this file directly, serve the folder with a local web server. You can also email me.", [{ title: "Contact", section: "#contact" }]);
        status.textContent = "Error loading knowledge base.";
        done();
      });
    }

    function done() {
      busy = false;
      sendBtn.disabled = false;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = input.value;
      input.value = "";
      ask(q);
      input.focus();
    });

    document.querySelectorAll("[data-ask]").forEach(function (chip) {
      chip.addEventListener("click", function () { ask(chip.getAttribute("data-ask")); });
    });

    document.querySelectorAll("[data-focus-chat]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.preventDefault();
        input.scrollIntoView({ block: "center" });
        input.focus();
      });
    });

    if (cfg.maxQuestionLength) input.maxLength = cfg.maxQuestionLength;

    // Warm the index in the background once the page is idle.
    (root.requestIdleCallback || function (f) { setTimeout(f, 600); })(function () { loadIndex().catch(function () {}); });

    root.PortfolioChat = { ask: ask };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(typeof window !== "undefined" ? window : globalThis);
