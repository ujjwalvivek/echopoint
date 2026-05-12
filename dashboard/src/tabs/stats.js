import styles from './stats.module.css';
import epStyles from './docs.module.css'

const API_BASE = import.meta.env.VITE_ECHOPOINT_URL || 'https://echopoint.ujjwalvivek.com';

const FALLBACK_CONFIG = {
    github: {
        owner: 'ujjwalvivek',
        repos: [
            { alias: 'portfolio', owner: 'ujjwalvivek', name: 'portfolio', tracked: true },
            { alias: 'journey', owner: 'ujjwalvivek', name: 'journey', tracked: true },
            { alias: 'synclippy', owner: 'ujjwalvivek', name: 'synclippy', tracked: true },
        ],
    },
    npm: [
        { alias: 'journey-engine', package: '@ujjwalvivek/journey-engine' },
        { alias: 'dino-blink', package: '@ujjwalvivek/dino-blink' },
    ],
    crates: [
        { alias: 'journey-engine', crate: 'journey-engine' },
    ],
    docker: [
        { alias: 'synclippy', namespace: 'ujjwalvivek', repository: 'synclippy' },
    ],
};

async function fetchConfig() {
    try {
        const res = await fetch(`${API_BASE}/v1/config`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch {
        return FALLBACK_CONFIG;
    }
}

function relTime(dateStr) {
    if (!dateStr) return ':';
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function truncate(str, len = 50) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
}

function renderCard(title, subtitle, contentHtml, rawData = null) {
    let rawHtml = '';
    if (rawData) {
        rawHtml = `
            <div class="${styles.rawToggle}">Toggle Raw JSON</div>
            <div class="${styles.rawContent}">${JSON.stringify(rawData, null, 2)}</div>
        `;
    }

    return `
        <div class="${styles.card}">
            <div class="${styles.cardHeader}">
                <span class="${styles.cardTitle}">${title}</span>
                <span class="${styles.cardSub}">${subtitle}</span>
            </div>
            <div class="${styles.cardBody}">
                ${contentHtml}
            </div>
            ${rawHtml}
        </div>
    `;
}

function makeRow(label, value, colorClass = '') {
    return `
        <div class="${styles.row}">
            <span class="${styles.label}">${label}</span>
            <span class="${styles.value} ${colorClass ? styles[colorClass] : ''}">${value}</span>
        </div>
    `;
}

function pendingCard(title, rows = '') {
    return renderCard(title, 'pending',
        makeRow('Status', 'No cached data yet', 'red') +
        rows
    );
}

export async function renderStats(container) {
    container.innerHTML = `<div class="${styles.statsContainer}">
        <div class="loading">Fetching data from Echopoint Worker...</div>
    </div>`;

    try {
        const [res, config] = await Promise.all([
            fetch(`${API_BASE}/v1/store`),
            fetchConfig(),
        ]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const store = await res.json();

        const lastRun = store['_meta:last_run'] || { success: 0, failed: 0, total: 0 };
        const lastUpdated = store['_meta:last_updated'];
        const trackedRepos = (config.github?.repos || [])
            .filter(repo => repo.tracked !== false);
        const trackedRepoAliases = trackedRepos.map(repo => repo.alias || repo.name);
        const trackedReposLabel = trackedRepoAliases.join(', ') || 'none';

        const userSummary = store[`github:${config.github?.owner || FALLBACK_CONFIG.github.owner}:summary`];
        let userSummaryHtml = '';
        if (userSummary && userSummary.data && userSummary.data.user) {
            const u = userSummary.data.user;
            const c = u.contributionsCollection;
            const calendar = c.contributionCalendar;
            userSummaryHtml = `
                <div class="${styles.section}">
                    <div class="${styles.grid} ${styles.fullWidthGrid}">
                        ${renderCard(u.login, 'Summary',
                makeRow('Past Year Total', calendar.totalContributions?.toLocaleString(), 'green') +
                makeRow('Total Commits', c.totalCommitContributions?.toLocaleString(), 'blue') +
                makeRow('Total PRs', c.totalPullRequestContributions?.toLocaleString(), 'peach') +
                makeRow('Repos Contributed', c.totalRepositoriesWithContributedIssues?.toLocaleString(), 'purple') +
                makeRow('Restricted', c.restrictedContributionsCount?.toLocaleString())
                , userSummary)}
                    </div>
                </div>
            `;
        }

        const repoHtml = trackedRepos.map(repo => {
            const alias = repo.alias || repo.name;
            const data = store[`github:${alias}:repo`];
            const rel = store[`github:${alias}:release`];
            const commits = store[`github:${alias}:commits`] || [];
            const deps = store[`github:${alias}:deployments`] || [];
            const tags = store[`github:${alias}:tags`] || [];
            if (!data) {
                return pendingCard(`github:${alias}`,
                    makeRow('Repo', `${repo.owner}/${repo.name}`) +
                    makeRow('Tracked', 'yes', 'blue')
                );
            }

            let content = makeRow('Stars', data.stargazers_count, 'peach') +
                makeRow('Forks', data.forks_count) +
                makeRow('Issues', data.open_issues_count, 'red') +
                makeRow('Branch', data.default_branch) +
                makeRow('Size', `${(data.size / 1024).toFixed(1)} MB`, 'purple') +
                makeRow('Release', rel?.tag_name || 'None', 'blue') +
                makeRow('Deployments', deps.length > 0 ? deps[0].environment : 'None') +
                makeRow('Tags', tags.length, 'green') +
                `<div style="margin-top:1rem;margin-bottom:0.5rem;font-size:0.75rem;font-weight:bold;color:var(--text-muted)">Recent Commits</div>
                           <ul class="${styles.list}">
                           ${commits.map(c => `
                               <li class="${styles.listItem}">
                                   <span class="${styles.listMsg}">${truncate(c.message, 45)}</span>
                                   <div class="${styles.listMeta}">
                                       <span>${c.sha.slice(0, 7)}</span>
                                       <span><span style="color:var(--accent-green)">+${c.additions}</span> <span style="color:var(--accent-red)">-${c.deletions}</span></span>
                                   </div>
                               </li>
                           `).join('')}
                           </ul>`;

            return renderCard(`github:${alias}`, relTime(data.pushed_at), content, data);
        }).join('');

        const npmHtml = (config.npm || []).map(pkg => {
            const alias = pkg.alias || pkg.package;
            const data = store[`npm:${alias}`];
            if (!data) {
                return pendingCard(`npm:${alias}`, makeRow('Package', pkg.package));
            }
            const sizeMb = data.dist?.unpackedSize ? (data.dist.unpackedSize / 1024 / 1024).toFixed(2) + ' MB' : 'N/A';
            const content = makeRow('Version', data.version, 'green') +
                makeRow('Files', data.dist?.fileCount || 'N/A', 'blue') +
                makeRow('Size', sizeMb, 'purple') +
                makeRow('SHA', truncate(data.dist?.shasum || data.gitHead, 12), 'peach') +
                makeRow('Keywords', truncate((data.keywords || []).join(', '), 25)) +
                makeRow('Description', truncate(data.description, 35));
            return renderCard(`npm:${alias}`, 'latest', content, data);
        }).join('');

        const langRepo = trackedRepos.find(repo => repo.alias === 'journey') || trackedRepos[0];
        const langRepoAlias = langRepo?.alias || langRepo?.name;
        const journeyLangs = langRepoAlias ? store[`github:${langRepoAlias}:langs`] || {} : {};
        const totalBytes = Object.values(journeyLangs).reduce((a, b) => a + b, 0);
        let langsHtml = '';
        if (totalBytes > 0) {
            langsHtml = `<div style="margin-top:1rem;margin-bottom:0.5rem;font-size:0.75rem;font-weight:bold;color:var(--text-muted)">Language Bytes (GitHub)</div>`;
            langsHtml += Object.entries(journeyLangs).map(([l, b]) => makeRow(l, b.toLocaleString(), 'blue')).join('');
            langsHtml += makeRow('Total Bytes', totalBytes.toLocaleString(), 'green');
        }

        const crateHtml = (config.crates || []).map((crate, idx) => {
            const alias = crate.alias || crate.crate;
            const crateData = store[`crates:${alias}`];
            if (!crateData || !crateData.crate) {
                return pendingCard(`crates:${alias}`, makeRow('Crate', crate.crate));
            }
            return renderCard(`crates:${alias}`, 'latest',
                makeRow('Version', crateData.crate.max_version, 'peach') +
                makeRow('Downloads', crateData.crate.downloads?.toLocaleString(), 'purple') +
                (idx === 0 ? langsHtml : ''),
                crateData
            );
        }).join('');

        const dockerHtml = (config.docker || []).map(image => {
            const alias = image.alias || image.repository;
            const dockerData = store[`docker:${alias}:tags`];
            if (!dockerData || !dockerData.results) {
                return pendingCard(`docker:${alias}`, makeRow('Image', `${image.namespace}/${image.repository}`));
            }
            return renderCard(`docker:${alias}`, 'tags',
                `<ul class="${styles.list}">
                 ${dockerData.results.slice(0, 5).map(t => `
                     <li class="${styles.listItem}">
                         <div class="${styles.listMeta}">
                             <span style="color:var(--text);font-size:0.8rem">${t.name}</span>
                             <span>${relTime(t.last_updated)}</span>
                         </div>
                     </li>
                 `).join('')}
                 </ul>`,
                dockerData
            );
        }).join('');

        container.innerHTML = `
            <div class="${styles.statsContainer}">

            <div class="${epStyles.endpoint}">
                <div class="${epStyles.endpointHeader}">
                    <span class="${epStyles.method} ${epStyles.get}">DUMP</span>
                    <span class="${epStyles.path}">User Aggregated Data</span>
                </div>
                <p>ALL data from the Echopoint KV store.</p>
                <p style="margin-bottom:1rem;color:var(--text-muted);font-size:0.8rem;"><strong>Tracked Repos:</strong> ${trackedReposLabel}</p>
                <div class="${styles.systemBar}">
                    <div class="${styles.sysItem}">
                        <div class="${styles.dot} ${lastRun.failed > 0 ? styles.error : ''}"></div>
                        Status
                    </div>
                    <div class="${styles.sysItem}">
                        Updated: <span class="${styles.sysValue}">${relTime(lastUpdated)}</span>
                    </div>
                    <div class="${styles.sysItem}">
                        Cron Sources: <span class="${styles.sysValue} ${lastRun.failed > 0 ? styles.error : ''}">${lastRun.success} / ${lastRun.total}</span>
                    </div>
                    ${lastRun.failed > 0 ? `<div class="${styles.sysItem}" style="color:var(--accent-red)">({Failed count: ${lastRun.failed}})</div>` : ''}
                </div>
                ${userSummaryHtml}
            </div>

            <div class="${epStyles.endpoint}">
                <div class="${epStyles.endpointHeader}">
                    <span class="${epStyles.method} ${epStyles.get}">DUMP</span>
                    <span class="${epStyles.path}">GitHub Repositories</span>
                </div>
                <div class="${styles.grid}">
                        ${repoHtml}
                </div>
            </div>

            <div class="${epStyles.endpoint}">
                <div class="${epStyles.endpointHeader}">
                    <span class="${epStyles.method} ${epStyles.get}">DUMP</span>
                    <span class="${epStyles.path}">Package Registries</span>
                </div>
                <div class="${styles.grid}">
                        ${npmHtml}
                        ${crateHtml}
                        ${dockerHtml}
                    </div>
            </div>
        `;

        container.querySelectorAll(`.${styles.rawToggle}`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target.nextElementSibling;
                target.classList.toggle(styles.open);
                e.target.innerText = target.classList.contains(styles.open) ? 'Hide Raw JSON' : 'Toggle Raw JSON';
            });
        });

    } catch (err) {
        container.innerHTML = `
            <div class="${styles.statsContainer}">
                <div style="color:var(--accent-red); padding: 2rem; background: var(--surface0); border-radius: var(--radius)">
                    <h3>Failed to load dashboard data</h3>
                    <p>${err.message}</p>
                </div>
            </div>
        `;
    }
}
