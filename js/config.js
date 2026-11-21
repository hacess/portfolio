/* Site configuration. Everything here is public; never put secrets in this file. */
window.SITE_CONFIG = {
  githubUser: "hacess",

  // Static fallback numbers, shown if the GitHub API fails or is rate-limited.
  repos: {
    "chrome-extension-manifestv3-full-page-screenshot": { stars: 15, forks: 5 },
    "chrome-extension-manifestv3-screenshot": { stars: 15, forks: 3 },
    "kairo-lite-desktop-pet": { stars: 3, forks: 0 },
    "selenium-web-scraping": { stars: 0, forks: 0 },
    "voice-browsing": { stars: 0, forks: 0 }
  },
  githubCacheHours: 6,

  // Email is assembled at runtime to keep it out of the raw HTML.
  email: { user: "chandanchakraborty712", domain: "gmail.com" },

  // Chat: pure client-side retrieval (no LLM, no API cost).
  chat: {
    knowledgeUrl: "data/knowledge.json",
    topK: 3,            // max chunks used per answer
    minScore: 2.2,      // BM25 score below which we say "I don't know"
    maxQuestionLength: 300
  }
};
