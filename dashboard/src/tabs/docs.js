import styles from "./docs.module.css";
import { renderPlayground, updatePlaygroundContext } from "./playground.js";
import { renderStats } from "./stats.js";

let DOCS_DATA = [];
export const API_BASE =
    import.meta.env.VITE_ECHOPOINT_URL || "https://echopoint.ujjwalvivek.com";
const MONO_BADGE_PARAMS =
    "bg=111111&badgeColor=2b2b2b&textColor=e8e8e8&border=555555&borderWidth=2&rx=0&px=6&py=4";
const MONO_CARD_PARAMS =
    "bg=111111&border=555555&borderWidth=1&rx=0&px=8&py=8&textColor=e8e8e8&accentColor=cfcfcf&lineColor=555555&positiveColor=cfcfcf&negativeColor=8a8a8a";
const MONO_LANG_PARAMS = `${MONO_CARD_PARAMS}&pctColor=a6a6a6&color1=e8e8e8&color2=c0c0c0&color3=969696&color4=6d6d6d&color5=464646&color6=2a2a2a`;

function relTime(dateStr) {
    if (!dateStr) return ":";
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (!Number.isFinite(diff) || diff < 0) return ":";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function fmtCount(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n.toLocaleString() : ":";
}

function sidebarRow(label, value, tone = "") {
    return `
        <div class="${styles.sidebarStatRow}">
            <span>${label}</span>
            <strong class="${tone ? styles[tone] : ""}">${value}</strong>
        </div>
    `;
}

let cachedSidebarHtml = null;

function buildSidebarHtml(store, config, status) {
    const lastRun = store["_meta:last_run"] || {};
    const updated = store["_meta:last_updated"];
    const repos = (config?.github?.repos || []).filter(
        (repo) => repo.tracked !== false,
    );
    const packages =
        (config?.npm || []).length +
        (config?.crates || []).length +
        (config?.docker || []).length;
    const statusItems = Array.isArray(status?.checks)
        ? status.checks
        : Object.values(status || {});
    const offline = statusItems.filter(
        (item) => item && item.ok === false,
    ).length;
    const failures = Number(lastRun.failed || 0);
    const success = Number(lastRun.success || 0);
    const total = Number(lastRun.total || 0);

    return `
        <div class="${styles.sidebarBlock}">
            <div class="${styles.sidebarTitle}">Echopoint</div>
            <div class="${styles.sidebarBadges}">
                <img src="${API_BASE}/svg/status?target=echopoint&logo=globe&${MONO_BADGE_PARAMS}" alt="System status" />
                <img src="${API_BASE}/svg/badges/stars?repo=echopoint&logo=github&${MONO_BADGE_PARAMS}" alt="Echopoint stars" />
                <img src="${API_BASE}/svg/langs?repo=echopoint&limit=4&width=250&borderWidth=4&height=8&responsive=true&${MONO_LANG_PARAMS}" alt="Echopoint language mix" />
                <img src="${API_BASE}/svg/commits?repo=echopoint&limit=4&width=250&borderWidth=6&px=16&responsive=true&${MONO_CARD_PARAMS}" alt="Echopoint recent commits" />
            </div>
        </div>

        <div class="${styles.sidebarBlock}">
            <div class="${styles.sidebarTitle}">Refresh</div>
            ${sidebarRow("Updated", relTime(updated))}
            ${sidebarRow("Sources", `${fmtCount(success)} / ${fmtCount(total)}`, failures > 0 ? "warn" : "ok")}
            ${sidebarRow("Failed", fmtCount(failures), failures > 0 ? "bad" : "")}
            ${sidebarRow("Cursor", lastRun.next_cursor ?? ":")}
            ${sidebarRow("Budget", `${fmtCount(lastRun.fetch_budget_used)} / ${fmtCount(lastRun.fetch_budget_limit)}`)}
        </div>

        <div class="${styles.sidebarBlock}">
            <div class="${styles.sidebarTitle}">Coverage</div>
            ${sidebarRow("Repos", fmtCount(repos.length))}
            ${sidebarRow("Registries", fmtCount(packages))}
            ${sidebarRow("Checks", fmtCount(config?.status?.length || 0), offline > 0 ? "warn" : "ok")}
        </div>
    `;
}

async function fetchSidebarData() {
    const [storeRes, configRes, statusRes] = await Promise.all([
        fetch(`${API_BASE}/v1/store`),
        fetch(`${API_BASE}/v1/config`),
        fetch(`${API_BASE}/v1/status`).catch(() => null),
    ]);
    const store = storeRes.ok ? await storeRes.json() : {};
    const config = configRes.ok ? await configRes.json() : null;
    const status = statusRes?.ok ? await statusRes.json() : {};
    return { store, config, status };
}

async function renderSidebarTelemetry(mount) {
    if (!mount) return;

    if (cachedSidebarHtml) {
        mount.innerHTML = cachedSidebarHtml;
        fetchSidebarData().then(({ store, config, status }) => {
            cachedSidebarHtml = buildSidebarHtml(store, config, status);
            if (document.body.contains(mount)) {
                mount.innerHTML = cachedSidebarHtml;
            }
        });
        return;
    }

    mount.innerHTML = `
        <div class="${styles.sidebarLoading}">Loading Echopoint...</div>
    `;

    try {
        const { store, config, status } = await fetchSidebarData();
        cachedSidebarHtml = buildSidebarHtml(store, config, status);
        mount.innerHTML = cachedSidebarHtml;
    } catch (err) {
        mount.innerHTML = `
            <div class="${styles.sidebarBlock}">
                <div class="${styles.sidebarTitle}">Echopoint</div>
                ${sidebarRow("Status", err.message || "Unavailable", "bad")}
            </div>
        `;
    }
}

export function initDocsData(ICONS) {
    const iconKeys = Object.keys(ICONS).join(", ");

    DOCS_DATA = [
        {
            id: "quick-start",
            title: "Quick Start",
            content: `
            <div class="${styles.endpoint}">
                <div class="${styles.endpointHeader}">
                    <span class="${styles.method} ${styles.ws}">API</span>
                    <span class="${styles.path}">Base</span>
                </div>
                <pre class="${styles.codeBlock}"><strong>BASE_URL</strong> = https://echopoint.ujjwalvivek.com</pre>
                <p>Refresh writes configured telemetry to KV. REST and SVG routes read KV only.</p>
            </div>

            <div class="${styles.endpoint}">
                <div class="${styles.endpointHeader}">
                    <span class="${styles.method} ${styles.get}">COPY</span>
                    <span class="${styles.path}">Common URLs</span>
                </div>
                <pre class="${styles.codeBlock}">![Stars](https://echopoint.ujjwalvivek.com/svg/badges/stars?repo=echopoint)</pre>
                <pre class="${styles.codeBlock}">![Streak](https://echopoint.ujjwalvivek.com/svg/streak)</pre>
                <pre class="${styles.codeBlock}">![Status](https://echopoint.ujjwalvivek.com/svg/status?target=echopoint)</pre>
                <pre class="${styles.codeBlock}">![Languages](https://echopoint.ujjwalvivek.com/svg/langs?repo=journey)</pre>
                <pre class="${styles.codeBlock}">curl -X POST -H "Authorization: Bearer $TOKEN" https://echopoint.ujjwalvivek.com/v1/refresh</pre>
            </div>

            <div class="${styles.endpoint}">
                <div class="${styles.endpointHeader}">
                    <span class="${styles.method} ${styles.get}">CHECK</span>
                    <span class="${styles.path}">When Data Looks Missing</span>
                </div>
                <pre class="${styles.codeBlock}">curl -s https://echopoint.ujjwalvivek.com/v1/store/_meta:last_run</pre>
                <p>Configured sources can show as pending until a refresh batch writes their KV keys.</p>
            </div>
            `,
        },
        {
            id: "svg-routes",
            title: "SVG Routes",
            content: `
            <div class="${styles.endpoint}">
                <div class="${styles.endpointHeader}">
                    <span class="${styles.method} ${styles.ws}">SVG</span>
                    <span class="${styles.path}">Badges</span>
                </div>
                <div class="${styles.tableWrapper}">
                    <table>
                        <thead><tr><th>Route</th><th>Params</th><th>Icon</th><th>Data</th></tr></thead>
                        <tbody>
                            <tr><td><code>/svg/badges/contributions</code></td><td>-</td><td><code>github</code></td><td><code>github:{owner}:summary</code></td></tr>
                            <tr><td><code>/svg/badges/commits</code></td><td>-</td><td><code>github</code></td><td><code>github:{owner}:summary</code></td></tr>
                            <tr><td><code>/svg/badges/prs</code></td><td>-</td><td><code>github</code></td><td><code>github:{owner}:summary</code></td></tr>
                            <tr><td><code>/svg/badges/issues</code></td><td>-</td><td><code>github</code></td><td><code>github:{owner}:summary</code></td></tr>
                            <tr><td><code>/svg/badges/stars</code></td><td><code>repo</code></td><td><code>github</code></td><td><code>github:{alias}:repo</code></td></tr>
                            <tr><td><code>/svg/badges/release</code></td><td><code>repo</code></td><td><code>github</code></td><td><code>github:{alias}:release</code></td></tr>
                            <tr><td><code>/svg/badges/updated</code></td><td><code>repo</code></td><td><code>github</code></td><td><code>github:{alias}:repo</code></td></tr>
                            <tr><td><code>/svg/badges/ghcr</code></td><td><code>repo</code></td><td><code>github</code></td><td><code>github:{alias}:release</code></td></tr>
                            <tr><td><code>/svg/badges/npm</code></td><td><code>package</code></td><td><code>npm</code></td><td><code>npm:{alias}</code></td></tr>
                            <tr><td><code>/svg/badges/cargo</code></td><td><code>crate</code></td><td><code>rust</code></td><td><code>crates:{alias}</code></td></tr>
                            <tr><td><code>/svg/badges/docker</code></td><td><code>image</code></td><td><code>docker</code></td><td><code>docker:{alias}:tags</code></td></tr>
                            <tr><td><code>/svg/badges/docs</code></td><td>-</td><td><code>docs</code></td><td>static</td></tr>
                            <tr><td><code>/svg/badges/custom</code></td><td><code>leftText</code>, <code>rightText</code></td><td>-</td><td>static</td></tr>
                            <tr><td><code>/svg/badges/health</code></td><td><code>repo</code></td><td><code>github</code></td><td>config only</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="${styles.endpoint}">
                <div class="${styles.endpointHeader}">
                    <span class="${styles.method} ${styles.ws}">SVG</span>
                    <span class="${styles.path}">Cards</span>
                </div>
                <div class="${styles.tableWrapper}">
                    <table>
                        <thead><tr><th>Route</th><th>Params</th><th>Data</th></tr></thead>
                        <tbody>
                            <tr><td><code>/svg/streak</code></td><td>-</td><td><code>github:{owner}:summary</code></td></tr>
                            <tr><td><code>/svg/calendar</code></td><td>-</td><td><code>github:{owner}:summary</code></td></tr>
                            <tr><td><code>/svg/status</code></td><td><code>target</code> optional</td><td><code>status:{alias}</code></td></tr>
                            <tr><td><code>/svg/langs</code></td><td><code>repo</code> optional</td><td><code>github:{alias}:langs</code></td></tr>
                            <tr><td><code>/svg/commits</code></td><td><code>repo</code> optional</td><td><code>github:{alias}:commits</code></td></tr>
                            <tr><td><code>/svg/releases</code></td><td><code>repo</code> optional</td><td><code>github:{alias}:releases</code></td></tr>
                            <tr><td><code>/svg/project</code></td><td><code>repo</code></td><td><code>github:{alias}:repo</code>, <code>:langs</code>, <code>:commits</code>, <code>:commit_count</code></td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="${styles.endpoint}">
                <div class="${styles.endpointHeader}">
                    <span class="${styles.method} ${styles.get}">PARAMS</span>
                    <span class="${styles.path}">Common Params</span>
                </div>
                <div class="${styles.tableWrapper}">
                    <table>
                        <thead><tr><th>Param</th><th>Use</th></tr></thead>
                        <tbody>
                            <tr><td><code>repo</code></td><td>Configured alias or configured <code>owner/name</code>.</td></tr>
                            <tr><td><code>logo</code></td><td>Explicit icon key. <code>logo=none</code> disables default route icons.</td></tr>
                            <tr><td><code>target</code></td><td>Configured status alias for <code>/svg/status</code>.</td></tr>
                            <tr><td><code>bg</code>, <code>badgeColor</code>, <code>textColor</code></td><td>Badge colors. Use hex without <code>#</code> in URLs.</td></tr>
                            <tr><td><code>rx</code>, <code>px</code>, <code>py</code></td><td>Radius and padding.</td></tr>
                            <tr><td><code>limit</code>, <code>width</code>, <code>height</code></td><td>Route-specific sizing controls.</td></tr>
                            <tr><td><code>responsive=true</code></td><td>Use fluid SVG dimensions where supported. Currently: <code>/svg/calendar</code>, <code>/svg/langs</code>, <code>/svg/commits</code>.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
            `,
        },
        {
            id: "rest-ops",
            title: "REST APIs",
            content: `
            <div class="${styles.endpoint}">
                <div class="${styles.endpointHeader}">
                    <span class="${styles.method} ${styles.get}">REST</span>
                    <span class="${styles.path}">Endpoints</span>
                </div>
                <div class="${styles.tableWrapper}">
                    <table>
                        <thead><tr><th>Route</th><th>Method</th><th>Use</th></tr></thead>
                        <tbody>
                            <tr><td><code>/v1/config</code></td><td>GET</td><td>Public config: owner, repos, packages, refresh settings.</td></tr>
                            <tr><td><code>/v1/store</code></td><td>GET</td><td>KV dump for dashboard/debugging.</td></tr>
                            <tr><td><code>/v1/store/:key</code></td><td>GET</td><td>Direct KV read.</td></tr>
                            <tr><td><code>/v1/status</code></td><td>GET</td><td>All configured status snapshots.</td></tr>
                            <tr><td><code>/v1/status/:alias</code></td><td>GET</td><td>One configured status snapshot.</td></tr>
                            <tr><td><code>/v1/langs</code></td><td>GET</td><td>Aggregated cached language bytes.</td></tr>
                            <tr><td><code>/v1/refresh</code></td><td>POST</td><td>Run one bounded refresh batch.</td></tr>
                            <tr><td><code>/v1/health</code></td><td>GET</td><td>Service status and last update timestamp.</td></tr>
                            <tr><td><code>/v1/icons</code></td><td>GET</td><td>Available SVG icon path data.</td></tr>
                            <tr><td><code>/v1/click</code></td><td>GET / POST / WS</td><td>Durable Object click counter.</td></tr>
                            <tr><td><code>/v1/github/contents</code></td><td>GET</td><td>GitHub contents proxy for configured repos only.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="${styles.endpoint}">
                <div class="${styles.endpointHeader}">
                    <span class="${styles.method} ${styles.post}">OPS</span>
                    <span class="${styles.path}">Refresh</span>
                </div>
                <pre class="${styles.codeBlock}">curl -X POST -H "Authorization: Bearer $TOKEN" https://echopoint.ujjwalvivek.com/v1/refresh</pre>
                <div class="${styles.tableWrapper}">
                    <table>
                        <thead><tr><th>Field</th><th>Meaning</th></tr></thead>
                        <tbody>
                            <tr><td><code>processed</code></td><td>Sources attempted in this batch.</td></tr>
                            <tr><td><code>success</code></td><td>KV writes completed.</td></tr>
                            <tr><td><code>failed</code></td><td>Failed upstream requests or transforms.</td></tr>
                            <tr><td><code>next_cursor</code></td><td>Start point for the next batch.</td></tr>
                            <tr><td><code>failures</code></td><td>Failed keys with status/error when present.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
            `,
        },
        {
            id: "rules",
            title: "Rules",
            content: `
            <div class="${styles.endpoint}">
                <div class="${styles.endpointHeader}">
                    <span class="${styles.method} ${styles.get}">CONFIG</span>
                    <span class="${styles.path}">Resolution</span>
                </div>
                <ul>
                    <li><code>repo</code> resolves through <code>src/config.js</code>.</li>
                    <li>Accepted repo values are configured aliases and configured <code>owner/name</code> values.</li>
                    <li>Arbitrary GitHub repositories are not proxied.</li>
                    <li><code>/v1/config</code> exposes public config only; secrets are not returned.</li>
                    <li>Status checks are configured aliases only. Public routes do not fetch arbitrary URLs.</li>
                </ul>
                <div class="${styles.endpointHeader}">
                    <span class="${styles.method} ${styles.post}">REFRESH</span>
                    <span class="${styles.path}">Population</span>
                </div>
                <ul>
                    <li>Cron runs every 2 hours.</li>
                    <li>Refresh is cursor-based and may take multiple runs for large configs.</li>
                    <li>SVG routes do not fetch upstream APIs during render.</li>
                    <li>Pending dashboard cards usually mean the matching KV key has not been written yet.</li>
                </ul>
                <div class="${styles.endpointHeader}">
                    <span class="${styles.method} ${styles.get}">COMPAT</span>
                    <span class="${styles.path}">Embeds</span>
                </div>
                <ul>
                    <li>Existing SVG paths remain valid.</li>
                    <li>Legacy KV key names remain active: <code>github:{alias}:*</code>, <code>npm:{alias}</code>, <code>crates:{alias}</code>, <code>docker:{alias}:tags</code>.</li>
                    <li>Explicit <code>logo=</code> wins over route defaults.</li>
                    <li><code>logo=none</code> disables default icons.</li>
                </ul>
                <div class="${styles.endpointHeader}">
                    <span class="${styles.method} ${styles.ws}">ICONS</span>
                    <span class="${styles.path}">Available Keys</span>
                </div>
                <p><code>${iconKeys}</code></p>
            </div>
            `,
        },
        {
            id: "user-stats",
            title: "User Stats Dashboard",
            isStats: true,
            content: ``,
        },
    ];

    const docsSections = DOCS_DATA.filter((doc) => !doc.isStats);
    const statsSection = DOCS_DATA.find((doc) => doc.isStats);
    const docsPageToc = docsSections
        .map(
            (doc) => `
        <button class="${styles.docTocButton}" type="button" data-scroll-target="doc-${doc.id}">
            ${doc.title}
        </button>
    `,
        )
        .join("");
    const combinedDocsContent = docsSections
        .map(
            (doc, index) => `
        <section class="${styles.docSection}" id="doc-${doc.id}">
            <div class="${styles.sectionLabel}">${String(index + 1).padStart(2, "0")}</div>
            <h2>${doc.title}</h2>
            ${doc.content}
        </section>
    `,
        )
        .join(` `);

    DOCS_DATA = [
        {
            id: "docs",
            title: "Docs",
            hasPlayground: true,
            defaultPath: "/svg/badges/stars",
            defaultParams: { repo: "echopoint", logo: "github" },
            content: `
                <div class="${styles.docPageIntro}">
                    <span class="${styles.method} ${styles.ws}">DOCS</span>
                    <h2>Echopoint Reference</h2>
                    <p>One page for architecture, REST routes, SVG routes, source keys, and compatibility rules. The playground stays available on the right so a route can be tested without leaving the reference.</p>
                    <div class="${styles.docToc}">
                        ${docsPageToc}
                    </div>
                </div>
                ${combinedDocsContent}
            `,
        },
        {
            ...statsSection,
            title: "User Stats",
        },
    ];

    return DOCS_DATA;
}

export function renderDocs(container, activeId) {
    const docData = DOCS_DATA.find((d) => d.id === activeId);
    const layoutCls = docData?.isStats ? styles.statsLayout : "";
    const sidebarOpen = window.matchMedia("(min-width: 769px)").matches
        ? " open"
        : "";

    const contentHtml = DOCS_DATA.map((d) => {
        const activeCls = d.id === activeId ? styles.active : "";
        return (
            '<div class="' +
            styles.section +
            " " +
            activeCls +
            '" id="section-' +
            d.id +
            '">' +
            d.content +
            "</div>"
        );
    }).join("");

    container.innerHTML = `
        <div class="${styles.container} ${layoutCls}">
            <aside class="${styles.sidebar}">
                <details class="${styles.sidebarDetails}"${sidebarOpen}>
                    <summary class="${styles.sidebarSummary}">
                        <span>Echopoint Stats</span>
                    </summary>
                    <div class="${styles.sidebarBody}">
                        <div id="sidebarStatsMount"></div>
                    </div>
                </details>
                <div class="${styles.sidebarClicker}" id="sidebarClickerMount"></div>
            </aside>
            <div class="${styles.contentWrapper}">
                <main class="${styles.docsContent}">
                    ${contentHtml}
                </main>
            </div>
            <div id="playgroundMount"></div>
        </div>
    `;

    const playgroundMount = container.querySelector("#playgroundMount");

    renderPlayground(playgroundMount, API_BASE);
    renderSidebarTelemetry(container.querySelector("#sidebarStatsMount"));

    if (docData?.hasPlayground) {
        updatePlaygroundContext(docData.defaultPath, docData.defaultParams);
    } else {
        updatePlaygroundContext(null);
    }

    if (docData?.isStats) {
        const sec = container.querySelector("#section-" + activeId);
        if (sec && !sec.innerHTML.trim()) {
            renderStats(sec);
        }
    }

    container.querySelectorAll("[data-scroll-target]").forEach((button) => {
        button.addEventListener("click", () => {
            const target = container.querySelector(
                "#" + button.dataset.scrollTarget,
            );
            if (target)
                target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    });
}
