import { generateBadge } from './svg/badges.js';
import { generateCalendar } from './svg/calendar.js';
import { generateStreakBadge } from './svg/streak.js';
import { generateLangsBar } from './svg/langs.js';
import { generateCommitsList } from './svg/commits.js';
import { generateReleasesList } from './svg/releases.js';
import { generateProjectCard } from './svg/project.js';
import { parseParams, ICONS } from './svg/params.js';
import { SOURCES, githubHeaders } from './sources.js';
import { CONFIG, getStatusChecks, getTrackedGitHubRepos, publicConfig, resolveGitHubRepo, resolveStatusCheck } from './config.js';
export { ClickerDO } from './clicker.js';


//? Deduplicates reads when multiple SVG badges hit the same key in one page load.
let kvCache;

function resetKvCache() {
    kvCache = new Map();
}

function cachedKvGet(kv, key, type = 'json') {
    const cacheKey = `${key}:${type}`;
    if (kvCache.has(cacheKey)) return kvCache.get(cacheKey);
    const p = kv.get(key, type);
    kvCache.set(cacheKey, p);
    return p;
}

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

const SUMMARY_KEY = `github:${CONFIG.github.owner}:summary`;
const REFRESH_FETCH_BUDGET = 45;
const DEFAULT_BADGE_LOGOS = {
    contributions: 'github',
    commits: 'github',
    prs: 'github',
    issues: 'github',
    stars: 'github',
    release: 'github',
    npm: 'npm',
    cargo: 'rust',
    docker: 'docker',
    ghcr: 'github',
    updated: 'github',
    docs: 'docs',
    health: 'github',
};

function trackedRepos() {
    return getTrackedGitHubRepos(CONFIG);
}

function resolveRequiredRepo(rawRepo) {
    return resolveGitHubRepo(rawRepo, CONFIG);
}

function resolveRepoList(rawRepo) {
    if (!rawRepo) return trackedRepos();
    const repo = resolveGitHubRepo(rawRepo, CONFIG);
    return repo ? [repo] : trackedRepos();
}

function sourceCost(source) {
    const n = Number(source.cost || 1);
    return Number.isFinite(n) && n > 0 ? n : 1;
}

function withDefaultBadgeLogo(opts, badgeRoute) {
    const logo = DEFAULT_BADGE_LOGOS[badgeRoute];
    if (!logo || opts.logo) return opts;
    return { ...opts, logo };
}

function statusState(data) {
    if (!data) return 'unknown';
    if (data.ok) return 'online';
    if (data.status || data.error) return 'offline';
    return 'unknown';
}

function statusColor(state) {
    if (state === 'online') return '#68d391';
    if (state === 'offline') return '#f87171';
    return '#fbbf24';
}

function statusHeaders(statusCheck) {
    return {
        'User-Agent': 'echopoint-status',
        'Accept': statusCheck.accept || '*/*',
    };
}

function isExpectedStatus(actual, expected) {
    if (Array.isArray(expected)) return expected.includes(actual);
    return actual === (expected || 200);
}

function statusSnapshot(source, payload) {
    const check = source.statusCheck;
    return {
        alias: check.alias,
        label: check.label || check.alias,
        kind: check.kind || 'http',
        url: source.url || null,
        expect_status: check.expectStatus || 200,
        checked_at: new Date().toISOString(),
        ...payload,
    };
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS },
    });
}

function svgResponse(svgStr) {
    return new Response(svgStr, {
        status: 200,
        headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
            ...CORS
        }
    });
}

//? GET /v1/store
async function handleGetAll(env) {
    const keys = await env.echopoint_kv.list();
    const result = {};

    await Promise.all(
        keys.keys
            .filter((key) => !key.name.startsWith('_meta:'))
            .map(async ({ name }) => {
                const val = await cachedKvGet(env.echopoint_kv, name, 'json');
                result[name] = val;
            })
    );

    //? Include meta for dashboard status bar
    const lastUpdated = await env.echopoint_kv.get('_meta:last_updated');
    const lastRun = await env.echopoint_kv.get('_meta:last_run', 'json');
    if (lastUpdated) result['_meta:last_updated'] = lastUpdated;
    if (lastRun) result['_meta:last_run'] = lastRun;

    return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=120',
            ...CORS
        }
    });
}

//? GET /v1/store/:key
async function handleGetKey(key, env) {
    const val = await env.echopoint_kv.get(key, 'json');
    if (val === null) {
        return jsonResponse({ error: 'Key not found', key }, 404);
    }
    return jsonResponse(val);
}

//? GET /v1/health
async function handleHealth(env) {
    const lastUpdated = await env.echopoint_kv.get('_meta:last_updated');
    const sourceCount = SOURCES.length;
    return new Response(JSON.stringify({
        ok: true,
        service: 'echopoint',
        sources: sourceCount,
        last_updated: lastUpdated || null,
        timestamp: new Date().toISOString(),
    }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=120',
            ...CORS
        }
    });
}

async function handleStatus(env, rawAlias = null) {
    if (rawAlias) {
        const check = resolveStatusCheck(rawAlias, CONFIG);
        if (!check) return jsonResponse({ error: 'Unknown status target' }, 404);

        const data = await cachedKvGet(env.echopoint_kv, `status:${check.alias}`, 'json');
        if (!data) {
            return jsonResponse({
                alias: check.alias,
                label: check.label,
                state: 'unknown',
                ok: false,
                checked_at: null,
            }, 404);
        }

        return jsonResponse(data);
    }

    const entries = await Promise.all(
        getStatusChecks(CONFIG).map(async (check) => {
            const data = await cachedKvGet(env.echopoint_kv, `status:${check.alias}`, 'json');
            return data || {
                alias: check.alias,
                label: check.label,
                state: 'unknown',
                ok: false,
                checked_at: null,
            };
        })
    );

    return jsonResponse({ checks: entries });
}

//? Main fetch handler (router)
async function handleFetch(request, env) {
    resetKvCache();
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: CORS });
    }

    const path = url.pathname;

    if (path === '/v1/health') {
        return handleHealth(env);
    }

    if (path === '/v1/status') {
        return handleStatus(env);
    }

    if (path.startsWith('/v1/status/')) {
        return handleStatus(env, decodeURIComponent(path.slice('/v1/status/'.length)));
    }

    if (path === '/v1/config') {
        return jsonResponse(publicConfig(CONFIG));
    }

    if (path === '/v1/store') {
        return handleGetAll(env);
    }

    if (path === '/v1/refresh') {
        //* Auth gate
        if (env.REFRESH_TOKEN) {
            const auth = request.headers.get('Authorization');
            if (auth !== `Bearer ${env.REFRESH_TOKEN}`) {
                return jsonResponse({ error: 'Unauthorized' }, 401);
            }
        }
        const result = await handleScheduled(env);
        return jsonResponse({ ok: true, msg: 'Refresh triggered', ...result });
    }

    if (path === '/v1/langs') {
        const agg = {};
        for (const repo of trackedRepos()) {
            const r = await cachedKvGet(env.echopoint_kv, `github:${repo.alias}:langs`, 'json');
            if (!r || r.message) continue;
            for (const [l, b] of Object.entries(r)) {
                agg[l] = (agg[l] || 0) + b;
            }
        }
        return jsonResponse(agg);
    }

    if (path === '/v1/icons') {
        return jsonResponse(ICONS, 200, { 'Cache-Control': 'public, max-age=86400' });
    }

    //? Router for SVG rendering
    if (path.startsWith('/svg/')) {
        const route = path.slice('/svg/'.length);
        const opts = parseParams(url);
        const badgeRoute = route.startsWith('badges/') ? route.slice('badges/'.length) : null;
        const badgeOpts = withDefaultBadgeLogo(opts, badgeRoute);
        const kv = env.echopoint_kv;

        if (route === 'status') {
            const check = resolveStatusCheck(opts.target, CONFIG);
            if (!check) {
                return svgResponse(generateBadge('status', '?target= required', { ...opts, logo: opts.logo || 'globe' }, '#f87171'));
            }

            const data = await cachedKvGet(kv, `status:${check.alias}`, 'json');
            const state = statusState(data);
            const label = data?.label || check.label || check.alias;
            return svgResponse(generateBadge(label, state, { ...opts, logo: opts.logo || 'globe' }, statusColor(state)));
        }

        if (route === 'badges/contributions') {
            const summary = await cachedKvGet(kv, SUMMARY_KEY, 'json');
            const user = summary?.data?.user;
            let total = 0;
            if (user) {
                const currentYear = new Date().getFullYear();
                for (let year = CONFIG.github.startYear; year <= currentYear; year++) {
                    const y = user[`y${year}`];
                    if (y) {
                        total += (y.contributionCalendar?.totalContributions || 0) + (y.restrictedContributionsCount || 0);
                    }
                }
            }
            return svgResponse(generateBadge('contributions', total, badgeOpts, '#4c1'));
        }

        if (route === 'badges/commits') {
            const summary = await cachedKvGet(kv, SUMMARY_KEY, 'json');
            const user = summary?.data?.user;
            let total = 0;
            if (user) {
                const currentYear = new Date().getFullYear();
                for (let year = CONFIG.github.startYear; year <= currentYear; year++) {
                    const y = user[`y${year}`];
                    if (y && y.totalCommitContributions) {
                        total += y.totalCommitContributions;
                    }
                }
                if (total === 0) total = user.contributionsCollection?.totalCommitContributions || 0;
            }
            return svgResponse(generateBadge('total commits', total, badgeOpts, '#4c1'));
        }

        if (route === 'badges/prs') {
            const summary = await cachedKvGet(kv, SUMMARY_KEY, 'json');
            const total = summary?.data?.user?.contributionsCollection?.totalPullRequestContributions || 0;
            return svgResponse(generateBadge('pull requests', total, badgeOpts, '#007ec6'));
        }

        if (route === 'badges/issues') {
            const summary = await cachedKvGet(kv, SUMMARY_KEY, 'json');
            const total = summary?.data?.user?.contributionsCollection?.totalRepositoriesWithContributedIssues || 0;
            return svgResponse(generateBadge('issues', total, badgeOpts, '#e24329'));
        }

        if (route === 'badges/stars') {
            const repo = resolveRequiredRepo(opts.repo);
            if (!repo) return svgResponse(generateBadge('stars', '?repo= required', badgeOpts, '#494949'));
            const data = await cachedKvGet(kv, `github:${repo.alias}:repo`, 'json');
            const count = data?.stargazers_count ?? 0;
            return svgResponse(generateBadge('stars', `${count}`, badgeOpts, '#494949'));
        }

        if (route === 'badges/release') {
            const repo = resolveRequiredRepo(opts.repo);
            if (!repo) return svgResponse(generateBadge('release', '?repo= required', badgeOpts, '#a855f7'));
            const rel = await cachedKvGet(kv, `github:${repo.alias}:release`, 'json');
            const tag = rel?.tag_name || ':';
            return svgResponse(generateBadge('release', tag, badgeOpts, '#a855f7'));
        }

        if (route === 'badges/npm') {
            const pkg = opts.package;
            if (!pkg) return svgResponse(generateBadge('npm', '?package= required', badgeOpts, '#cb3837'));
            const data = await cachedKvGet(kv, `npm:${pkg}`, 'json');
            const ver = data?.version ? `v${data.version}` : ':';
            return svgResponse(generateBadge('npm', ver, badgeOpts, '#cb3837'));
        }

        if (route === 'badges/cargo') {
            const crate = opts.crate;
            if (!crate) return svgResponse(generateBadge('cargo', '?crate= required', badgeOpts, '#dea584'));
            const data = await cachedKvGet(kv, `crates:${crate}`, 'json');
            const ver = data?.crate?.max_version ? `v${data.crate.max_version}` : ':';
            return svgResponse(generateBadge('cargo', ver, badgeOpts, '#dea584'));
        }

        if (route === 'badges/docker') {
            const img = opts.image;
            if (!img) return svgResponse(generateBadge('docker', '?image= required', badgeOpts, '#2496ed'));
            const data = await cachedKvGet(kv, `docker:${img}:tags`, 'json');
            let ver = ':';
            if (data?.results?.length > 0) {
                const nonLatest = data.results.find(t => t.name !== 'latest');
                if (nonLatest) ver = `v${nonLatest.name}`;
            }
            return svgResponse(generateBadge('docker', ver, badgeOpts, '#2496ed'));
        }

        if (route === 'badges/ghcr') {
            const repo = resolveRequiredRepo(opts.repo);
            if (!repo) return svgResponse(generateBadge('ghcr', '?repo= required', badgeOpts, '#2da44e'));
            const rel = await cachedKvGet(kv, `github:${repo.alias}:release`, 'json');
            const tag = rel?.tag_name || ':';
            return svgResponse(generateBadge('ghcr', tag, badgeOpts, '#2da44e'));
        }

        if (route === 'badges/updated') {
            const repo = resolveRequiredRepo(opts.repo);
            if (!repo) return svgResponse(generateBadge('updated', '?repo= required', badgeOpts, '#6cc644'));
            const data = await cachedKvGet(kv, `github:${repo.alias}:repo`, 'json');
            let text = ':';
            if (data?.pushed_at) {
                const diff = Math.floor((Date.now() - new Date(data.pushed_at).getTime()) / (1000 * 60 * 60 * 24));
                if (diff === 0) text = 'today';
                else if (diff === 1) text = 'yesterday';
                else text = `${diff}d ago`;
            }
            return svgResponse(generateBadge('updated', text, badgeOpts, '#6cc644'));
        }

        if (route === 'badges/docs') {
            return svgResponse(generateBadge('Docs', null, badgeOpts, '#3b82f6'));
        }

        if (route === 'badges/custom') {
            const left = opts.leftText || 'label';
            const right = opts.rightText || null;
            return svgResponse(generateBadge(left, right, badgeOpts, opts.badgeColor || '#555'));
        }

        if (route === 'badges/health') {
            const repo = resolveRequiredRepo(opts.repo);
            if (!repo) return svgResponse(generateBadge('health', '?repo= required', badgeOpts, '#4ade80'));
            return svgResponse(generateBadge(repo.alias, 'tracked', badgeOpts, '#4ade80'));
        }

        if (route === 'calendar') {
            const summary = await cachedKvGet(kv, SUMMARY_KEY, 'json');
            const calendarGrid = summary?.data?.user?.contributionsCollection?.contributionCalendar;
            return svgResponse(generateCalendar(calendarGrid, opts));
        }

        if (route === 'streak') {
            const summary = await cachedKvGet(kv, SUMMARY_KEY, 'json');
            const calendarGrid = summary?.data?.user?.contributionsCollection?.contributionCalendar;
            return svgResponse(generateStreakBadge(calendarGrid, opts));
        }

        if (route === 'langs') {
            const repos = resolveRepoList(opts.repo);
            const agg = {};
            for (const repo of repos) {
                const r = await cachedKvGet(kv, `github:${repo.alias}:langs`, 'json');
                if (!r || r.message) continue;
                for (const [l, b] of Object.entries(r)) {
                    agg[l] = (agg[l] || 0) + b;
                }
            }
            return svgResponse(generateLangsBar(agg, opts));
        }

        if (route === 'project') {
            const repo = resolveRequiredRepo(opts.repo);
            if (!repo) return svgResponse(generateProjectCard(null, {}, opts));
            const [repoData, release, langs, commits, commitCount] = await Promise.all([
                cachedKvGet(kv, `github:${repo.alias}:repo`, 'json'),
                cachedKvGet(kv, `github:${repo.alias}:release`, 'json'),
                cachedKvGet(kv, `github:${repo.alias}:langs`, 'json'),
                cachedKvGet(kv, `github:${repo.alias}:commits`, 'json'),
                cachedKvGet(kv, `github:${repo.alias}:commit_count`, 'json'),
            ]);
            return svgResponse(generateProjectCard(repo, { repo: repoData, release, langs, commits, commitCount }, opts));
        }

        if (route === 'commits') {
            const repos = resolveRepoList(opts.repo);
            const all = [];
            for (const repo of repos) {
                const r = await cachedKvGet(kv, `github:${repo.alias}:commits`, 'json');
                if (Array.isArray(r)) all.push(...r);
            }
            all.sort((a, b) => new Date(b.date) - new Date(a.date));
            const top3 = all.slice(0, opts.limit ?? 3);
            return svgResponse(generateCommitsList(top3, opts));
        }

        if (route === 'releases') {
            const repos = resolveRepoList(opts.repo);
            const all = [];
            for (const repo of repos) {
                const r = await cachedKvGet(kv, `github:${repo.alias}:releases`, 'json');
                if (Array.isArray(r)) all.push(...r);
            }
            all.sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));
            const top5 = all.slice(0, opts.limit ?? 5);
            return svgResponse(generateReleasesList(top5, opts));
        }

        return jsonResponse({ error: 'SVG route not found' }, 404);
    }

    if (path.startsWith('/v1/store/')) {
        const key = decodeURIComponent(path.slice('/v1/store/'.length));
        return handleGetKey(key, env);
    }

    //? delegated to ClickerDO
    if (path === '/v1/click') {
        const id = env.CLICKER.idFromName('global');
        const stub = env.CLICKER.get(id);
        return stub.fetch(request);
    }

    //? Authenticated proxy for GitHub Contents API
    if (path === '/v1/github/contents') {
        const repo = resolveRequiredRepo(url.searchParams.get('repo'));
        const ghPath = url.searchParams.get('path') || '';
        if (!repo) {
            return jsonResponse({ error: 'Invalid or missing repo param' }, 400);
        }
        const ghUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${ghPath}`;
        try {
            const res = await fetch(ghUrl, { headers: githubHeaders(env) });
            const data = await res.json();
            return new Response(JSON.stringify(data), {
                status: res.status,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...CORS },
            });
        } catch (err) {
            return jsonResponse({ error: 'GitHub API proxy failed', message: err.message }, 502);
        }
    }

    return env.ASSETS.fetch(request);
}

//? refreshes data from upstream
async function handleScheduled(env) {
    console.log(`[echopoint] Starting scheduled refresh at ${new Date().toISOString()}`);

    let successCount = 0;
    let failCount = 0;
    let processedCount = 0;
    let budgetUsed = 0;
    const failures = [];
    const totalSources = SOURCES.length;
    const rawCursor = await env.echopoint_kv.get('_meta:refresh_cursor');
    const parsedCursor = parseInt(rawCursor || '0', 10);
    const startCursor = Number.isFinite(parsedCursor) && parsedCursor >= 0 && parsedCursor < totalSources ? parsedCursor : 0;

    for (let offset = 0; offset < totalSources; offset++) {
        const source = SOURCES[(startCursor + offset) % totalSources];
        const cost = sourceCost(source);
        if (processedCount > 0 && budgetUsed + cost > REFRESH_FETCH_BUDGET) break;

        processedCount++;
        budgetUsed += cost;

        try {
            if (source.statusCheck?.kind === 'internal') {
                await env.echopoint_kv.put(source.key, JSON.stringify(statusSnapshot(source, {
                    ok: true,
                    state: 'online',
                    status: 200,
                    latency_ms: 0,
                })));
                successCount++;
                continue;
            }

            const headers = {};

            if (source.statusCheck) {
                Object.assign(headers, statusHeaders(source.statusCheck));
            } else if (source.auth === 'github') {
                Object.assign(headers, githubHeaders(env));
            } else {
                headers['User-Agent'] = 'echopoint-collector';
            }

            if (source.url.includes('crates.io')) {
                headers['Accept'] = 'application/json'; //* crates.io requires an explicit Accept header
            }

            const fetchOpts = { headers };
            if (source.method) fetchOpts.method = source.method;
            if (source.body) fetchOpts.body = typeof source.body === 'function' ? source.body(env) : source.body;

            const started = Date.now();
            const res = await fetch(source.url, fetchOpts);
            const latencyMs = Date.now() - started;

            if (source.statusCheck) {
                const ok = isExpectedStatus(res.status, source.statusCheck.expectStatus);
                await env.echopoint_kv.put(source.key, JSON.stringify(statusSnapshot(source, {
                    ok,
                    state: ok ? 'online' : 'offline',
                    status: res.status,
                    latency_ms: latencyMs,
                })));
                successCount++;
                continue;
            }

            if (!res.ok) {
                console.warn(`[echopoint] ${source.key} → HTTP ${res.status}`);
                failCount++;
                failures.push({ key: source.key, status: res.status });
            } else {
                let data = await res.json();

                if (source.transform) {
                    data = await source.transform(data, env, res);
                }

                //? no TTL, cron overwrites
                await env.echopoint_kv.put(source.key, JSON.stringify(data));
                successCount++;
            }
        } catch (err) {
            console.error(`[echopoint] ${source.key} failed:`, err.message);
            failCount++;
            failures.push({ key: source.key, error: err.message });
            if (source.statusCheck) {
                await env.echopoint_kv.put(source.key, JSON.stringify(statusSnapshot(source, {
                    ok: false,
                    state: 'offline',
                    status: null,
                    latency_ms: null,
                    error: err.message,
                })));
            }
        }
    }

    const nextCursor = totalSources > 0 ? (startCursor + processedCount) % totalSources : 0;

    await env.echopoint_kv.put(
        '_meta:last_updated',
        new Date().toISOString()
    );
    await env.echopoint_kv.put('_meta:refresh_cursor', String(nextCursor));
    await env.echopoint_kv.put(
        '_meta:last_run',
        JSON.stringify({
            success: successCount,
            failed: failCount,
            processed: processedCount,
            total: totalSources,
            start_cursor: startCursor,
            next_cursor: nextCursor,
            fetch_budget_used: budgetUsed,
            fetch_budget_limit: REFRESH_FETCH_BUDGET,
            failures,
        })
    );

    console.log(`[echopoint] Refresh batch complete: ${successCount} ok, ${failCount} failed, ${processedCount}/${totalSources} processed, next cursor ${nextCursor}`);
    return {
        success: successCount,
        failed: failCount,
        processed: processedCount,
        total: totalSources,
        next_cursor: nextCursor,
        fetch_budget_used: budgetUsed,
        fetch_budget_limit: REFRESH_FETCH_BUDGET,
        failures,
    };
}

const Worker = {
    fetch: handleFetch,
    scheduled(event, env, ctx) {
        ctx.waitUntil(handleScheduled(env));
    },
};

export default Worker;
