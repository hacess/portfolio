# Chandan Chakraborty: portfolio

A single-page static portfolio: plain HTML, CSS and vanilla JavaScript, with no build step, no framework and no paid APIs.

- **Ask my portfolio:** a retrieval chat that runs entirely in the browser. It ranks the chunks in `data/knowledge.json` with BM25 and replies with sentences taken from them, plus source links. Nothing is generated, so it cannot hallucinate. When nothing relevant is found, it says so.
- **Pip:** a small original pixel-art pet, inspired by the Kairo desktop pet. It walks along the bottom of the page and waits in the margin beside whichever section is on screen.
- **Case studies:** each one follows Problem → Constraints → Architecture (inline SVG) → Key decisions → Outcome.
- **Open-source cards:** stars and forks load live from the GitHub API, are cached in `localStorage` for 6 hours, and fall back to the numbers in `js/config.js` if the API fails.

## Structure

```
index.html            page markup (all sections, SEO tags, JSON-LD)
css/styles.css        blueprint theme, light/dark tokens, layout
js/config.js          public config: GitHub user, fallback stats, email parts, chat tuning
js/app.js             theme toggle, nav highlight, skills map, GitHub stats, email, contact form
js/chat.js            retrieval engine (BM25) + chat UI
js/mascot.js          the pet (sprite is defined in this file)
data/knowledge.json   the chat's knowledge base
assets/               favicon, icons, mascot.svg, og-image.png, resume PDF (you add it)
sitemap.xml, robots.txt, .nojekyll
```

## Preview locally

The chat loads `data/knowledge.json` with `fetch`, and browsers block that for `file://` pages. Serve the folder with any static server instead:

```bash
cd "chandan resume"
python3 -m http.server 8080
# open http://localhost:8080
```

or `npx serve .`

## Deploy to GitHub Pages

1. Create a repository, for example `hacess/portfolio`, and push the contents of this folder to `main`. **Do not push `chandan_chakraborty_resume.pages`**, because it contains your phone number. `.gitignore` already excludes it.
2. In the repository, go to **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, then `main` and `/ (root)`.
3. After about a minute the site is live at `https://hacess.github.io/portfolio/`. All paths are relative, so it works from a sub-path.

## Domain

The site is set up for **https://hacess.github.io/portfolio/** (canonical link, Open Graph and Twitter tags, JSON-LD, `sitemap.xml`). To get exactly that URL, name the repository `portfolio` under the `hacess` account.

Search engines only read `robots.txt` at the root of a host, so on a `/portfolio/` sub-path it is ignored. Submit `https://hacess.github.io/portfolio/sitemap.xml` in Google Search Console instead.

### Moving to a codedbrainy.com subdomain later

1. At your DNS provider, add a **CNAME** record: name `portfolio` (or any name), value `hacess.github.io`.
2. In the repository, go to **Settings → Pages → Custom domain**, enter `portfolio.codedbrainy.com` and save.
3. Once the certificate is issued, tick **Enforce HTTPS**.
4. Replace `https://hacess.github.io/portfolio/` with the new URL in `index.html` (canonical, `og:url`, `og:image`, `twitter:image`, JSON-LD), `sitemap.xml` and `robots.txt`.

## Update the knowledge base

All chat answers come from `data/knowledge.json`. Each chunk looks like this:

```json
{
  "id": "unique-id",
  "title": "Shown on the source chip",
  "section": "#anchor-on-the-page",
  "text": "One to three first-person sentences. These sentences ARE the answers.",
  "tags": ["keywords", "people", "might", "search", "for"]
}
```

Tips:

- Keep each chunk to one topic and short. The best-matching chunk is shown whole, and supporting chunks add one sentence each.
- Write in first person ("I built…").
- Put likely search words in `tags`. Tags and titles count double in ranking.
- If people ask a reasonable question and get "I don't have that information", add a chunk for it or a synonym in `SYNONYMS` in `js/chat.js`.
- Tuning is in `js/config.js`: `minScore` is the relevance threshold (raise it to make the chat more cautious) and `topK` is the number of chunks per answer.
- After editing, check the JSON is valid: `python3 -m json.tool data/knowledge.json > /dev/null`.

## Why there is no LLM mode

It's deliberate: the site has no running costs and no API keys. The "How this works" panel explains the design. Retrieval, a relevance threshold and extractive answers with citations are the same grounding ideas I use in production RAG systems, taken to the point where there is no model left to hallucinate.

If you ever want generated answers, add them as an optional layer behind a server-side proxy so the API key never reaches the browser. Until then, nothing in this repository calls a paid service. The only network calls are Google Fonts and the public, unauthenticated GitHub API.

## Before going live

- `assets/chandan_chakraborty_resume.pdf` is a copy of the resume with the phone number removed. When you update your resume, export a new copy without the phone number.
- Search `index.html` for `TODO`; there should be none left.
