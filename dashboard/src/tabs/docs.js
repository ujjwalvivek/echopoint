import styles from './docs.module.css';
import { renderPlayground, updatePlaygroundContext } from './playground.js';
import { renderStats } from './stats.js';

let DOCS_DATA = [];
export const API_BASE = import.meta.env.VITE_ECHOPOINT_URL || 'https://echopoint.ujjwalvivek.com';

export function initDocsData(ICONS) {
    const iconKeys = Object.keys(ICONS).join(', ');

    DOCS_DATA = [
        {
            id: 'quick-start',
            title: 'Quick Start',
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
            `
        },
        {
            id: 'svg-routes',
            title: 'SVG Routes',
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
                            <tr><td><code>/svg/badges/custom</code></td><td><code>leftText</code>, <code>rightText</code></td><td><code>code</code></td><td>static</td></tr>
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
                            <tr><td><code>/svg/langs</code></td><td><code>repo</code> optional</td><td><code>github:{alias}:langs</code></td></tr>
                            <tr><td><code>/svg/commits</code></td><td><code>repo</code> optional</td><td><code>github:{alias}:commits</code></td></tr>
                            <tr><td><code>/svg/releases</code></td><td><code>repo</code> optional</td><td><code>github:{alias}:releases</code></td></tr>
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
                            <tr><td><code>bg</code>, <code>badgeColor</code>, <code>textColor</code></td><td>Badge colors. Use hex without <code>#</code> in URLs.</td></tr>
                            <tr><td><code>rx</code>, <code>px</code>, <code>py</code></td><td>Radius and padding.</td></tr>
                            <tr><td><code>limit</code>, <code>width</code>, <code>height</code></td><td>Route-specific sizing controls.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
            `
        },
        {
            id: 'rest-ops',
            title: 'REST / Ops',
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
            `
        },
        {
            id: 'rules',
            title: 'Rules',
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
                </ul>
            </div>

            <div class="${styles.endpoint}">
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
            </div>

            <div class="${styles.endpoint}">
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
            </div>

            <div class="${styles.endpoint}">
                <div class="${styles.endpointHeader}">
                    <span class="${styles.method} ${styles.ws}">ICONS</span>
                    <span class="${styles.path}">Available Keys</span>
                </div>
                <p><code>${iconKeys}</code></p>
            </div>
            `
        },
        {
            id: 'user-stats',
            title: 'User Stats Dashboard',
            isStats: true,
            content: ``
        }
    ];

    const docsSections = DOCS_DATA.filter((doc) => !doc.isStats);
    const statsSection = DOCS_DATA.find((doc) => doc.isStats);
    const docsPageToc = docsSections.map((doc) => `
        <button class="${styles.docTocButton}" type="button" data-scroll-target="doc-${doc.id}">
            ${doc.title}
        </button>
    `).join('');
    const combinedDocsContent = docsSections.map((doc, index) => `
        <section class="${styles.docSection}" id="doc-${doc.id}">
            <div class="${styles.sectionLabel}">${String(index + 1).padStart(2, '0')}</div>
            <h2>${doc.title}</h2>
            ${doc.content}
        </section>
    `).join(`<hr class="${styles.sectionDivider}" />`);

    DOCS_DATA = [
        {
            id: 'docs',
            title: 'Docs',
            hasPlayground: true,
            defaultPath: '/svg/badges/stars',
            defaultParams: { repo: 'echopoint', logo: 'github' },
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
            `
        },
        {
            ...statsSection,
            title: 'User Stats'
        }
    ];

    return DOCS_DATA;
}

export function renderDocs(container, activeId) {
    const docData = DOCS_DATA.find(d => d.id === activeId);
    const layoutCls = docData?.isStats ? styles.statsLayout : '';
    const navHtml = DOCS_DATA.map((d) => {
        const activeCls = d.id === activeId ? styles.active : '';
        return '<span class="' + styles.navItem + ' ' + activeCls + '" data-id="' + d.id + '">' + d.title + '</span>';
    }).join('');

    const contentHtml = DOCS_DATA.map((d) => {
        const activeCls = d.id === activeId ? styles.active : '';
        return '<div class="' + styles.section + ' ' + activeCls + '" id="section-' + d.id + '">' + d.content + '</div>';
    }).join('');

    container.innerHTML = `
        <div class="${styles.container} ${layoutCls}">
            <aside class="${styles.sidebar}">
                <div class="${styles.sidebarTitle}">Content</div>
                <nav class="${styles.nav}" id="docsNav">
                    ${navHtml}
                </nav>
                <div id="sidebarClickerMount"></div>
            </aside>
            <div class="${styles.contentWrapper}">
                <main class="${styles.docsContent}">
                    ${contentHtml}
                </main>
            </div>
            <div id="playgroundMount"></div>
        </div>
    `;

    const playgroundMount = container.querySelector('#playgroundMount');

    renderPlayground(playgroundMount, API_BASE);

    if (docData?.hasPlayground) {
        updatePlaygroundContext(docData.defaultPath, docData.defaultParams);
    } else {
        updatePlaygroundContext(null);
    }

    if (docData?.isStats) {
        const sec = container.querySelector('#section-' + activeId);
        if (sec && !sec.innerHTML.trim()) {
            renderStats(sec);
        }
    }

    const docsNav = container.querySelector('#docsNav');
    if (docsNav) {
        docsNav.addEventListener('click', (e) => {
            if (e.target.classList.contains(styles.navItem)) {
                e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                history.pushState(null, null, '#' + e.target.dataset.id);
                window.dispatchEvent(new Event('hashchange'));
            }
        });

        setTimeout(() => {
            const activeItem = docsNav.querySelector('.' + styles.active);
            if (activeItem) activeItem.scrollIntoView({ block: 'nearest', inline: 'center' });
        }, 50);
    }

    container.querySelectorAll('[data-scroll-target]').forEach((button) => {
        button.addEventListener('click', () => {
            const target = container.querySelector('#' + button.dataset.scrollTarget);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}
