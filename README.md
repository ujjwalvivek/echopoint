![Echopoint SVG](https://echopoint.ujjwalvivek.com/svg/badges/custom?leftText=Cloudflare&rightText=Workers&badgeColor=ff7b00) ![Echopoint SVG](https://echopoint.ujjwalvivek.com/svg/badges/custom?leftText=Javascript&badgeColor=003780&logo=javascript) ![Echopoint SVG](https://echopoint.ujjwalvivek.com/svg/badges/custom?leftText=Cloudflare&rightText=KV&badgeColor=ff7b00) ![Echopoint SVG](https://echopoint.ujjwalvivek.com/svg/badges/custom?leftText=CSS&badgeColor=9e0000&logo=css)

Echopoint is a telemetry aggregation service and dynamic SVG generation engine. It runs on the edge using Cloudflare Workers and provides a docs/dashboard for managing and previewing the generated assets.

## Quick Start: Using the SVGs

Echopoint generates dynamic SVGs on the fly via URL parameters. This is perfect for embedding real-time statistics and custom badges into GitHub READMEs, personal websites, or Notion pages.

You can use the live SVG builder at **[echopoint.ujjwalvivek.com](https://echopoint.ujjwalvivek.com)** to visually configure, preview, and copy the markdown for any endpoint.

### Example 1: A Custom Badge

Simply use markdown image syntax to embed a badge:

```markdown
![Custom Badge](https://echopoint.ujjwalvivek.com/svg/badges/custom?leftText=Hello&rightText=World&badgeColor=ff7b00)
```

### Example 2: A GitHub Contribution Calendar

```markdown
![GitHub Calendar](https://echopoint.ujjwalvivek.com/svg/calendar?ytd=1&level0=1e1e2e&level1=cba6f7&level2=f38ba8&level3=fab387&level4=a6e3a1)
```

Just drop these URLs into any `<img>` tag or markdown file!

## What does it have?

- **Worker (`/src`):** A Cloudflare Worker that aggregates data from various sources (GitHub, npm, PyPI, Crates.io, Docker Hub), caches it in a Cloudflare KV store via cron triggers, and exposes REST endpoints. It also contains the SVG generation engine (`/svg/*`) to render dynamic, customizable badges, GitHub contribution calendars, commit streaks, and language bars on the fly.
- **Dashboard (`/dashboard`):** A zero-dep SPA. It serves as interactive documentation, a live viewer for the aggregated KV store data, and a real-time playground to visually configure and preview the SVG endpoints.
- **Edge-Cached Telemetry:** Automatically fetches and caches stats from GitHub (contributions, repos, commits), npm (downloads, versions), PyPI (package metadata and versions), Crates.io, and Docker Hub, ensuring zero-latency loads and eliminating rate limits.
- **Dynamic SVGs:** Generates fully customizable SVG badges and cards directly on the edge. Supports extensive parameterization for colors, text, layouts, and icons.
- **Unified Dashboard:** Contains an mdbook-style API reference, a live SVG builder with real-time preview, and a visual dump of all stored telemetry data.
- **Theming System:** The dashboard features multiple built-in color palettes (based on Catppuccin and Monochrome) alongside a procedural HSL dark-mode theme generator.

## Run Locally (2 Minutes)

If you want to run the backend engine or dashboard yourself:

### Prerequisites

```bash
- Node.js (v22+)
- Local Cloudflare Worker setup (Wrangler context)
```

### Running the Worker (Backend)

The worker manages the data aggregation and API endpoints.

```bash
npm install
npm run dev
npm run deploy
```

### Running the Dashboard (Frontend)

The dashboard is a separate frontend project located in the `dashboard/` directory.

```bash
cd dashboard
npm install
npm run dev
npm run build
```

## Environment Variables

The worker requires specific environment variables and secrets (like GitHub access tokens) to fetch data from external APIs. These are configured via `wrangler secret put` for sensitive keys. The dashboard uses `VITE_ECHOPOINT_URL` to point to the active worker URL.

### Private contributions and all-time data

The GitHub summary query merges contribution calendars from `github.startYear` through today. Streaks use that complete history rather than a fixed one-year window. Calendar SVGs default to the current year so they remain readable as badges; use `year=YYYY` for a historical year or `all=1` for the explicitly requested full-history view. `window` and `ytd` provide compact current-period views. GitHub's private-contribution display setting must be enabled for private activity to appear in the contribution graph.

Private repository language totals are discovered through GitHub GraphQL and merged into `/v1/langs` and the dashboard without storing repository names. To show a named private repository in repository cards or repo-specific SVGs, add it to `CONFIG.github.repos` with `private: true`:

```js
{ alias: "internal-tool", owner: "ujjwalvivek", name: "internal-tool", tracked: true, private: true }
```

The public config hides the owner/name for entries marked private. Raw private keys, private repo SVGs, and the contents proxy require an authorization token.

### Package registry sources

Registry entries are configured in `src/config.js`. PyPI projects use the project name from PyPI and are cached under `pypi:{alias}`:

```js
pypi: [
    { alias: "echohub", package: "echohub" },
    { alias: "pysitegen", package: "pysitegen" },
]
```

The corresponding version badge is:

```markdown
![PyPI](https://echopoint.ujjwalvivek.com/svg/badges/pypi?package=echohub)
```

### Language display V2

`/v1/langs` and `/svg/langs` remain raw byte-ranked language data. The parallel `/v1/langv2` and `/svg/langv2` routes apply the presentation-only `languageDisplay` profile from `src/config.js`. The SVG route displays three sections: Languages (including HTML and CSS), Frameworks, and Esolangs. The JSON route returns the same raw totals in that presentation order. Byte totals and percentages still use all collected language data.

```js
languageDisplay: {
    primary: ["Rust", "TypeScript", "JavaScript", "Go"],
    frameworks: ["Astro", "Svelte", "Vue", "React", "Angular"],
    esolangs: ["Brainfuck"],
    limit: 6,
}
```

`limit` applies independently to each section. Framework and esolang names are matched against the language keys returned by GitHub; add a key to the corresponding list when a new syntax appears in the collected data.

Use `langv2` to evaluate the curated view without changing the original language endpoint:

```markdown
![Languages V2](https://echopoint.ujjwalvivek.com/svg/langv2?limit=6)
```

### Secrets

`GITHUB_TOKEN` needs account read access (`read:user`) and access to the private repositories being collected. `REFRESH_TOKEN` protects manual refreshes and is required by `/v1/refresh`. `DATA_TOKEN` is optional and adds a dedicated token for private data reads; either data token or refresh token is accepted there. `GITHUB_WEBHOOK_SECRET` is required only when using the GitHub webhook endpoint.

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put REFRESH_TOKEN
npx wrangler secret put DATA_TOKEN
npx wrangler secret put GITHUB_WEBHOOK_SECRET
```

### Incremental refresh

Cron runs every two hours, but it no longer walks a global cursor and re-fetches an arbitrary batch on every run. Each source records its own signature, refresh interval, ETag/Last-Modified validators, and pagination cursor. A refresh processes only new, changed, or due sources; conditional `304 Not Modified` responses avoid rewriting unchanged data.

Use the authenticated endpoint for targeted refreshes:

```bash
curl -X POST -H "Authorization: Bearer $REFRESH_TOKEN" https://echopoint.ujjwalvivek.com/v1/refresh
curl -X POST -H "Authorization: Bearer $REFRESH_TOKEN" "https://echopoint.ujjwalvivek.com/v1/refresh?scope=summary"
curl -X POST -H "Authorization: Bearer $REFRESH_TOKEN" "https://echopoint.ujjwalvivek.com/v1/refresh?scope=repo&repo=journey"
curl -X POST -H "Authorization: Bearer $REFRESH_TOKEN" "https://echopoint.ujjwalvivek.com/v1/refresh?scope=pypi&package=echohub"
curl -X POST -H "Authorization: Bearer $REFRESH_TOKEN" "https://echopoint.ujjwalvivek.com/v1/refresh?scope=source&key=npm%3Ajourney-engine"
```

`scope=summary` refreshes both the all-time contribution summary and the sanitized private-language aggregate.
`scope=pypi&package=...` refreshes one configured PyPI project without waiting behind unrelated due sources. The generic `scope=source&key=...` form does the same for any active non-GitHub source, such as `npm:...`, `crates:...`, `docker:...:tags`, or `status:...`.

The first deployment, or an explicit `scope=all`, is still split into bounded batches because Cloudflare Workers Free limits external subrequests per invocation. After initial population, ordinary refreshes do not require repeatedly fetching all configured sources. A GitHub repository webhook can be pointed at `/v1/github/webhook` to refresh important repository data immediately; the cron remains the fallback.

For the normal add-or-change-config workflow, use the one-shot helper. It compares the deployed config before and after deployment, refreshes newly added, changed, or incompletely cached tracked repositories, directly refreshes every newly added/changed/missing non-GitHub source, refreshes the summary when private-repository configuration changed, and runs one bounded due pass for everything else:

```bash
npm run deploy:refresh
```

The helper loads `.env` automatically and reads `ECHOPOINT_REFRESH_TOKEN` (or `REFRESH_TOKEN`) from it/the environment. If neither exists, it asks for the token without echoing the value. `.env` is never deployed to Cloudflare. To refresh a specific alias even when it was not detected as changed:

```bash
npm run deploy:refresh -- marslander
```

Use `--summary` to force the aggregate refresh or `--all` only when intentionally backfilling every tracked repository. A `404` for a repository's `:release` source is reported as an expected warning when that repository has no release.

<!-- releasegen:license:start -->
## License

This source code is licensed under the [MIT License](LICENSE).
<!-- releasegen:license:end -->
