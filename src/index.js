import { generateBadge } from './svg/badges.js';
import { generateCalendar } from './svg/calendar.js';
import { generateStreakBadge } from './svg/streak.js';
import { generateLangsBar } from './svg/langs.js';
import { generateLangsBarV2 } from './svg/langs-v2.js';
import { generateCommitsList } from './svg/commits.js';
import { generateReleasesList } from './svg/releases.js';
import { generateProjectCard } from './svg/project.js';
import { generateProfileTelemetry } from './svg/profile.js';
import { parseParams, ICONS, errorSvg } from './svg/params.js';
import { SOURCES, SOURCE_SCHEMA_VERSION, githubHeaders } from './sources.js';
import { allTimeCalendar } from './contributions.js';
import { languageDisplayOrder } from './language-display.js';
import { CONFIG, getStatusChecks, getTrackedGitHubRepos, isPrivateGitHubRepo, publicConfig, resolveGitHubRepo, resolvePyPiPackage, resolveStatusCheck } from './config.js';
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const SUMMARY_KEY = `github:${CONFIG.github.owner}:summary`;
const PRIVATE_LANGS_KEY = `github:private:${CONFIG.github.owner}:langs`;
const SOURCE_STATE_KEY = '_meta:source_state';
const SOURCE_STATE_VERSION = 1;
const REFRESH_FETCH_BUDGET = 45;
const REFRESH_RETRY_SECONDS = 15 * 60;
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
    pypi: 'python',
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

async function aggregateLanguages(env, rawRepo = null, request = null) {
    const kv = env.echopoint_kv;
    const repos = resolveRepoList(rawRepo);
    const configuredPrivate = privateRepoAliases();

    if (rawRepo && repos.length === 1) {
        const repo = repos[0];
        const repoData = await cachedKvGet(kv, `github:${repo.alias}:repo`, 'json');
        const privateRepo = configuredPrivate.has(repo.alias) || repoData?.private === true;
        if (privateRepo && (!request || !hasPrivateDataAccess(request, env))) {
            return { error: 'Private repository language data requires authorization' };
        }
    }

    const entries = await Promise.all(repos.map(async (repo) => {
        const repoData = await cachedKvGet(kv, `github:${repo.alias}:repo`, 'json');
        const privateRepo = configuredPrivate.has(repo.alias) || repoData?.private === true;
        if (!rawRepo && privateRepo) return null;

        const data = await cachedKvGet(kv, `github:${repo.alias}:langs`, 'json');
        return data && !data.message ? data : null;
    }));

    const aggregate = {};
    for (const data of entries) {
        if (!data) continue;
        for (const [language, bytes] of Object.entries(data)) {
            aggregate[language] = (aggregate[language] || 0) + Number(bytes || 0);
        }
    }

    // This aggregate is deliberately the only public representation of
    // auto-discovered private repository languages.
    if (!rawRepo) {
        const privateData = await cachedKvGet(kv, PRIVATE_LANGS_KEY, 'json');
        for (const [language, bytes] of Object.entries(privateData?.languages || {})) {
            aggregate[language] = (aggregate[language] || 0) + Number(bytes || 0);
        }
    }

    return aggregate;
}

function sourceCost(source) {
    const n = Number(source.cost || 1);
    return Number.isFinite(n) && n > 0 ? n : 1;
}

function safeSourceBody(source) {
    if (!source.body) return null;
    if (typeof source.body !== 'function') return source.body;
    try {
        return source.body();
    } catch {
        return source.body.toString();
    }
}

function sourceSignature(source, env = {}) {
    return JSON.stringify({
        schema: SOURCE_SCHEMA_VERSION,
        sourceSchema: source.schemaVersion || null,
        key: source.key,
        url: source.url,
        method: source.method || 'GET',
        auth: source.auth || null,
        authConfigured: source.auth === 'github' ? Boolean(env.GITHUB_TOKEN) : null,
        body: safeSourceBody(source),
        transform: source.transform?.toString() || null,
        validate: source.validate?.toString() || null,
        merge: source.merge?.toString() || null,
        paginated: Boolean(source.paginated),
        paginateEvery: source.paginateEvery || null,
        statusCheck: source.statusCheck || null,
        cost: sourceCost(source),
        priority: source.priority || 0,
        refreshEvery: source.refreshEvery || null,
    });
}

function sourceInterval(source) {
    const seconds = Number(source.refreshEvery || 24 * 60 * 60);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 24 * 60 * 60;
}

function nextDueAt(source, now = Date.now()) {
    return new Date(now + sourceInterval(source) * 1000).toISOString();
}

function sourceDue(meta, signature, now, force = false) {
    if (force || !meta || meta.signature !== signature) return true;
    if (!meta.nextDueAt) return true;
    const dueAt = Date.parse(meta.nextDueAt);
    return !Number.isFinite(dueAt) || dueAt <= now;
}

function validSourceState(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.sources !== 'object') {
        return { version: SOURCE_STATE_VERSION, sources: {} };
    }
    return {
        version: SOURCE_STATE_VERSION,
        sources: raw.sources,
    };
}

async function loadSourceState(kv, env) {
    const raw = await kv.get(SOURCE_STATE_KEY, 'json');
    const state = validSourceState(raw);
    if (raw?.version === SOURCE_STATE_VERSION) {
        return { state, migratedFromLegacy: false };
    }

    // The previous scheduler already wrote source values and a global
    // last-updated timestamp, but had no per-source metadata. Adopt those
    // values so a deployment of the incremental scheduler does not re-fetch
    // every unchanged source immediately.
    const legacyUpdated = await kv.get('_meta:last_updated');
    const legacyTime = Date.parse(legacyUpdated || '');
    if (!Number.isFinite(legacyTime)) {
        return { state, migratedFromLegacy: Boolean(raw) };
    }

    const existingKeys = new Set((await kv.list()).keys.map(({ name }) => name));
    for (const source of SOURCES) {
        // These are new or shape-changing sources and must be populated now.
        if (source.key === SUMMARY_KEY || source.key === PRIVATE_LANGS_KEY) continue;
        if (!existingKeys.has(source.key)) continue;

        const updatedAt = new Date(legacyTime).toISOString();
        state.sources[source.key] = {
            signature: sourceSignature(source, env),
            lastCheckedAt: updatedAt,
            lastSuccessAt: updatedAt,
            lastChangedAt: updatedAt,
            lastError: null,
            nextDueAt: nextDueAt(source, legacyTime),
        };
    }

    return { state, migratedFromLegacy: true };
}

function addConditionalHeaders(headers, meta, method) {
    if (method !== 'GET' || !meta) return;
    if (meta.etag) headers['If-None-Match'] = meta.etag;
    if (meta.lastModified) headers['If-Modified-Since'] = meta.lastModified;
}

function constantTimeEqual(aValue, bValue) {
    const a = new TextEncoder().encode(aValue || '');
    const b = new TextEncoder().encode(bValue || '');
    const length = Math.max(a.length, b.length);
    let difference = a.length ^ b.length;
    for (let i = 0; i < length; i++) {
        difference |= (a[i] || 0) ^ (b[i] || 0);
    }
    return difference === 0;
}

function bearerMatches(request, secret) {
    if (!secret || !request) return false;
    const presented = request.headers.get('Authorization') || '';
    const expected = `Bearer ${secret}`;
    return constantTimeEqual(presented, expected);
}

function signatureMatches(presented, expected) {
    return constantTimeEqual(presented, expected);
}

function authFailure(secretName) {
    return jsonResponse({ error: `${secretName} is not configured` }, 503);
}

function hasPrivateDataAccess(request, env) {
    return [env.DATA_TOKEN, env.REFRESH_TOKEN]
        .filter(Boolean)
        .some((secret) => bearerMatches(request, secret));
}

function privateRepoAliases() {
    return new Set(
        trackedRepos()
            .filter((repo) => isPrivateGitHubRepo(repo))
            .map((repo) => repo.alias || repo.name)
    );
}

async function collectRecentCommits(env, rawRepo, request) {
    const privateAccess = hasPrivateDataAccess(request, env);
    const repos = resolveRepoList(rawRepo);
    const entries = await Promise.all(repos.map(async (repo) => {
        const repoData = await cachedKvGet(env.echopoint_kv, `github:${repo.alias}:repo`, 'json');
        const privateRepo = isPrivateGitHubRepo(repo) || repoData?.private === true;
        if (privateRepo && !privateAccess) return [];

        const commits = await cachedKvGet(env.echopoint_kv, `github:${repo.alias}:commits`, 'json');
        return Array.isArray(commits) ? commits : [];
    }));

    return entries.flat().sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function collectProfileSources(env) {
    const definitions = [
        ...(CONFIG.npm || []).map((source) => ({
            alias: source.alias,
            kind: 'npm',
            logo: 'npm',
            key: `npm:${source.alias}`,
        })),
        ...(CONFIG.crates || []).map((source) => ({
            alias: source.alias,
            kind: 'rust',
            logo: 'rust',
            key: `crates:${source.alias}`,
        })),
        ...(CONFIG.docker || []).map((source) => ({
            alias: source.alias,
            kind: 'docker',
            logo: 'docker',
            key: `docker:${source.alias}:tags`,
        })),
        ...(CONFIG.pypi || []).map((source) => ({
            alias: source.alias,
            kind: 'python',
            logo: 'python',
            key: `pypi:${source.alias}`,
        })),
    ];

    return Promise.all(definitions.map(async (source) => {
        const data = await cachedKvGet(env.echopoint_kv, source.key, 'json');
        let version = data?.version || data?.crate?.max_version || data?.info?.version;
        if (source.key.startsWith('docker:')) {
            const nonLatest = data?.results?.find((tag) => tag.name !== 'latest');
            version = nonLatest?.name || null;
        }
        return {
            alias: source.alias,
            kind: source.kind,
            logo: source.logo,
            version: version ? `v${version}` : ':',
        };
    }));
}

function keyForRepoAlias(key, alias) {
    return key.startsWith(`github:${alias}:`);
}

function isPrivateKey(key, aliases) {
    for (const alias of aliases) {
        if (!keyForRepoAlias(key, alias)) continue;
        const suffix = key.slice(`github:${alias}:`.length);
        if (['repo', 'release', 'releases', 'commits', 'commit_count', 'contributors', 'tags', 'deployments', 'langs'].includes(suffix)) {
            return true;
        }
    }
    return false;
}

function activeSourceKeys() {
    return new Set(SOURCES.map((source) => source.key));
}

const PUBLIC_META_KEYS = new Set(['_meta:last_updated', '_meta:last_run']);

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

function jsonResponse(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS, ...extraHeaders },
    });
}

function svgResponse(svgStr, cacheControl = 'public, max-age=300') {
    return new Response(svgStr, {
        status: 200,
        headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            'Cache-Control': cacheControl,
            ...CORS
        }
    });
}

//? GET /v1/store
async function handleGetAll(env) {
    const keys = await env.echopoint_kv.list();
    const entries = [];
    const activeKeys = activeSourceKeys();

    await Promise.all(
        keys.keys
            .filter((key) => activeKeys.has(key.name))
            .map(async ({ name }) => {
                const val = await cachedKvGet(env.echopoint_kv, name, 'json');
                entries.push([name, val]);
            })
    );

    // Hide private repository records from the public dump. The configured
    // visibility is the first signal; the API response is the fallback for a
    // repo that was added without a visibility flag.
    const hiddenAliases = privateRepoAliases();
    for (const [name, value] of entries) {
        const repoMatch = name.match(/^github:([^:]+):repo$/);
        if (repoMatch && value?.private === true) hiddenAliases.add(repoMatch[1]);
    }

    const result = {};
    for (const [name, value] of entries) {
        if (!isPrivateKey(name, hiddenAliases)) result[name] = value;
    }

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
async function handleGetKey(key, env, request) {
    if (!activeSourceKeys().has(key) && !PUBLIC_META_KEYS.has(key)) {
        return jsonResponse({ error: 'Key not found', key }, 404);
    }

    const val = await env.echopoint_kv.get(key, 'json');
    if (val === null) {
        return jsonResponse({ error: 'Key not found', key }, 404);
    }

    const aliases = privateRepoAliases();
    const repoMatch = key.match(/^github:([^:]+):repo$/);
    if (repoMatch && val?.private === true) aliases.add(repoMatch[1]);
    const sourceMatch = key.match(/^github:([^:]+):(repo|release|releases|commits|commit_count|contributors|tags|deployments|langs)$/);
    if (sourceMatch && !aliases.has(sourceMatch[1])) {
        const repoData = await env.echopoint_kv.get(`github:${sourceMatch[1]}:repo`, 'json');
        if (repoData?.private === true) aliases.add(sourceMatch[1]);
    }
    const privateKey = isPrivateKey(key, aliases);
    if (privateKey && !hasPrivateDataAccess(request, env)) {
        return jsonResponse({ error: 'Private data requires authorization' }, 401);
    }

    return jsonResponse(val, 200, privateKey ? { 'Cache-Control': 'private, no-store' } : {});
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

function hex(bytes) {
    return [...new Uint8Array(bytes)]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('');
}

async function verifyWebhookSignature(body, signature, secret) {
    if (!signature || !secret) return false;

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const digest = await crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        new TextEncoder().encode(body)
    );
    return signatureMatches(signature, `sha256=${hex(digest)}`);
}

function webhookRefreshKeys(eventName, repository) {
    const keys = new Set([SUMMARY_KEY, PRIVATE_LANGS_KEY]);
    if (!repository) return [...keys];

    const repo = trackedRepos().find((candidate) =>
        `${candidate.owner}/${candidate.name}`.toLowerCase() === repository.toLowerCase()
    );
    if (!repo) return [...keys];

    const prefix = `github:${repo.alias}:`;
    const relevantSuffixes = eventName === 'push'
        ? ['repo', 'commits', 'commit_count', 'langs']
        : eventName === 'release'
            ? ['repo', 'release', 'releases']
            : ['repo'];

    for (const suffix of relevantSuffixes) keys.add(`${prefix}${suffix}`);
    return [...keys];
}

async function handleGitHubWebhook(request, env, ctx) {
    if (!env.GITHUB_WEBHOOK_SECRET) return authFailure('GITHUB_WEBHOOK_SECRET');

    const body = await request.text();
    const signature = request.headers.get('X-Hub-Signature-256');
    if (!(await verifyWebhookSignature(body, signature, env.GITHUB_WEBHOOK_SECRET))) {
        return jsonResponse({ error: 'Invalid webhook signature' }, 401);
    }

    const eventName = request.headers.get('X-GitHub-Event') || 'unknown';
    if (eventName === 'ping') return jsonResponse({ ok: true, event: 'ping' });

    let payload;
    try {
        payload = JSON.parse(body);
    } catch {
        return jsonResponse({ error: 'Invalid webhook JSON' }, 400);
    }

    const keys = webhookRefreshKeys(eventName, payload.repository?.full_name);
    const refresh = handleScheduled(env, { keys, force: true, scope: 'webhook' });
    if (ctx?.waitUntil) {
        ctx.waitUntil(refresh);
    } else {
        await refresh;
    }

    return jsonResponse({
        ok: true,
        queued: Boolean(ctx?.waitUntil),
        event: eventName,
        keys,
    });
}

//? Main fetch handler (router)
async function handleFetch(request, env, ctx) {
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
        //* Refreshing is always administrative; do not leave it public when
        //* the secret was forgotten during deployment.
        if (!env.REFRESH_TOKEN) return authFailure('REFRESH_TOKEN');
        if (!bearerMatches(request, env.REFRESH_TOKEN)) {
            return jsonResponse({ error: 'Unauthorized' }, 401);
        }

        const scope = url.searchParams.get('scope') || 'due';
        const options = { scope, force: scope !== 'due' };
        if (scope === 'repo') {
            const repo = resolveGitHubRepo(url.searchParams.get('repo'), CONFIG);
            if (!repo) return jsonResponse({ error: 'Unknown or untracked repository' }, 400);
            options.repoAlias = repo.alias;
        } else if (scope === 'pypi') {
            const pkg = resolvePyPiPackage(url.searchParams.get('package'), CONFIG);
            if (!pkg) return jsonResponse({ error: 'Unknown or untracked PyPI package' }, 400);
            options.keys = [`pypi:${pkg.alias}`];
        } else if (scope === 'source') {
            const key = url.searchParams.get('key');
            if (!key || !activeSourceKeys().has(key)) {
                return jsonResponse({ error: 'Unknown or inactive source key' }, 400);
            }
            options.keys = [key];
        } else if (!['due', 'all', 'summary'].includes(scope)) {
            return jsonResponse({ error: 'scope must be due, summary, repo, pypi, source, or all' }, 400);
        }

        const result = await handleScheduled(env, options);
        return jsonResponse({ ok: true, msg: 'Refresh triggered', ...result });
    }

    if (path === '/v1/langs') {
        const rawRepo = url.searchParams.get('repo');
        const data = await aggregateLanguages(env, rawRepo, request);
        if (data.error) return jsonResponse(data, 401, { 'Cache-Control': 'private, no-store' });
        let privateRepo = false;
        if (rawRepo) {
            const repo = resolveGitHubRepo(rawRepo, CONFIG);
            if (repo) {
                const repoData = await cachedKvGet(env.echopoint_kv, `github:${repo.alias}:repo`, 'json');
                privateRepo = isPrivateGitHubRepo(repo) || repoData?.private === true;
            }
        }
        return jsonResponse(data, 200, privateRepo ? { 'Cache-Control': 'private, no-store' } : {});
    }

    if (path === '/v1/langv2' || path === '/v1/langs2') {
        const rawRepo = url.searchParams.get('repo');
        const data = await aggregateLanguages(env, rawRepo, request);
        if (data.error) return jsonResponse(data, 401, { 'Cache-Control': 'private, no-store' });

        // Preserve exact byte values; only insertion order is curated for
        // clients that display JSON object entries in order.
        const ordered = Object.fromEntries(
            languageDisplayOrder(data, CONFIG.languageDisplay).map((name) => [name, data[name]]),
        );
        let privateRepo = false;
        if (rawRepo) {
            const repo = resolveGitHubRepo(rawRepo, CONFIG);
            if (repo) {
                const repoData = await cachedKvGet(env.echopoint_kv, `github:${repo.alias}:repo`, 'json');
                privateRepo = isPrivateGitHubRepo(repo) || repoData?.private === true;
            }
        }
        return jsonResponse(ordered, 200, privateRepo ? { 'Cache-Control': 'private, no-store' } : {});
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
        let privateSvg = false;

        if (opts.repo) {
            const requestedRepo = resolveGitHubRepo(opts.repo, CONFIG);
            if (requestedRepo) {
                const configuredPrivate = isPrivateGitHubRepo(requestedRepo);
                const repoData = await cachedKvGet(kv, `github:${requestedRepo.alias}:repo`, 'json');
                privateSvg = configuredPrivate || repoData?.private === true;
                if (privateSvg && !hasPrivateDataAccess(request, env)) {
                    return svgResponse(errorSvg('Private repo data requires authorization'), 'private, no-store');
                }
            }
        }

        const renderSvg = (svg) => svgResponse(svg, privateSvg ? 'private, no-store' : undefined);

        if (route === 'status') {
            const check = resolveStatusCheck(opts.target, CONFIG);
            if (!check) {
                return renderSvg(generateBadge('status', '?target= required', { ...opts, logo: opts.logo || 'globe' }, '#f87171'));
            }

            const data = await cachedKvGet(kv, `status:${check.alias}`, 'json');
            const state = statusState(data);
            const label = data?.label || check.label || check.alias;
            return renderSvg(generateBadge(label, state, { ...opts, logo: opts.logo || 'globe' }, statusColor(state)));
        }

        if (route === 'badges/contributions') {
            const summary = await cachedKvGet(kv, SUMMARY_KEY, 'json');
            const user = summary?.data?.user;
            const total = allTimeCalendar(user)?.totalContributions || 0;
            return renderSvg(generateBadge('contributions', total, badgeOpts, '#4c1'));
        }

        if (route === 'badges/commits') {
            const summary = await cachedKvGet(kv, SUMMARY_KEY, 'json');
            const user = summary?.data?.user;
            const total = user?.allTime?.totalCommitContributions
                || user?.contributionsCollection?.totalCommitContributions
                || 0;
            return renderSvg(generateBadge('total commits', total, badgeOpts, '#4c1'));
        }

        if (route === 'badges/prs') {
            const summary = await cachedKvGet(kv, SUMMARY_KEY, 'json');
            const total = summary?.data?.user?.contributionsCollection?.totalPullRequestContributions || 0;
            return renderSvg(generateBadge('pull requests', total, badgeOpts, '#007ec6'));
        }

        if (route === 'badges/issues') {
            const summary = await cachedKvGet(kv, SUMMARY_KEY, 'json');
            const user = summary?.data?.user;
            const total = user?.allTime?.totalIssueContributions
                || user?.contributionsCollection?.totalIssueContributions
                || 0;
            return renderSvg(generateBadge('issues', total, badgeOpts, '#e24329'));
        }

        if (route === 'badges/stars') {
            const repo = resolveRequiredRepo(opts.repo);
            if (!repo) return renderSvg(generateBadge('stars', '?repo= required', badgeOpts, '#494949'));
            const data = await cachedKvGet(kv, `github:${repo.alias}:repo`, 'json');
            const count = data?.stargazers_count ?? 0;
            return renderSvg(generateBadge('stars', `${count}`, badgeOpts, '#494949'));
        }

        if (route === 'badges/release') {
            const repo = resolveRequiredRepo(opts.repo);
            if (!repo) return renderSvg(generateBadge('release', '?repo= required', badgeOpts, '#a855f7'));
            const rel = await cachedKvGet(kv, `github:${repo.alias}:release`, 'json');
            const tag = rel?.tag_name || ':';
            return renderSvg(generateBadge('release', tag, badgeOpts, '#a855f7'));
        }

        if (route === 'badges/npm') {
            const pkg = opts.package;
            if (!pkg) return renderSvg(generateBadge('npm', '?package= required', badgeOpts, '#cb3837'));
            const data = await cachedKvGet(kv, `npm:${pkg}`, 'json');
            const ver = data?.version ? `v${data.version}` : ':';
            return renderSvg(generateBadge('npm', ver, badgeOpts, '#cb3837'));
        }

        if (route === 'badges/cargo') {
            const crate = opts.crate;
            if (!crate) return renderSvg(generateBadge('cargo', '?crate= required', badgeOpts, '#dea584'));
            const data = await cachedKvGet(kv, `crates:${crate}`, 'json');
            const ver = data?.crate?.max_version ? `v${data.crate.max_version}` : ':';
            return renderSvg(generateBadge('cargo', ver, badgeOpts, '#dea584'));
        }

        if (route === 'badges/docker') {
            const img = opts.image;
            if (!img) return renderSvg(generateBadge('docker', '?image= required', badgeOpts, '#2496ed'));
            const data = await cachedKvGet(kv, `docker:${img}:tags`, 'json');
            let ver = ':';
            if (data?.results?.length > 0) {
                const nonLatest = data.results.find(t => t.name !== 'latest');
                if (nonLatest) ver = `v${nonLatest.name}`;
            }
            return renderSvg(generateBadge('docker', ver, badgeOpts, '#2496ed'));
        }

        if (route === 'badges/pypi') {
            const pkg = opts.package;
            if (!pkg) return renderSvg(generateBadge('PyPI', '?package= required', badgeOpts, '#3775a9'));
            const configured = (CONFIG.pypi || []).find((entry) => entry.alias === pkg || entry.package === pkg);
            const alias = configured?.alias || pkg;
            const data = await cachedKvGet(kv, `pypi:${alias}`, 'json');
            const version = data?.version || data?.info?.version;
            const ver = version ? `v${version}` : ':';
            return renderSvg(generateBadge('PyPI', ver, badgeOpts, '#3775a9'));
        }

        if (route === 'badges/ghcr') {
            const repo = resolveRequiredRepo(opts.repo);
            if (!repo) return renderSvg(generateBadge('ghcr', '?repo= required', badgeOpts, '#2da44e'));
            const rel = await cachedKvGet(kv, `github:${repo.alias}:release`, 'json');
            const tag = rel?.tag_name || ':';
            return renderSvg(generateBadge('ghcr', tag, badgeOpts, '#2da44e'));
        }

        if (route === 'badges/updated') {
            const repo = resolveRequiredRepo(opts.repo);
            if (!repo) return renderSvg(generateBadge('updated', '?repo= required', badgeOpts, '#6cc644'));
            const data = await cachedKvGet(kv, `github:${repo.alias}:repo`, 'json');
            let text = ':';
            if (data?.pushed_at) {
                const diff = Math.floor((Date.now() - new Date(data.pushed_at).getTime()) / (1000 * 60 * 60 * 24));
                if (diff === 0) text = 'today';
                else if (diff === 1) text = 'yesterday';
                else text = `${diff}d ago`;
            }
            return renderSvg(generateBadge('updated', text, badgeOpts, '#6cc644'));
        }

        if (route === 'badges/docs') {
            return renderSvg(generateBadge('Docs', null, badgeOpts, '#3b82f6'));
        }

        if (route === 'badges/custom') {
            const left = opts.leftText || 'label';
            const right = opts.rightText || null;
            return renderSvg(generateBadge(left, right, badgeOpts, opts.badgeColor || '#555'));
        }

        if (route === 'badges/health') {
            const repo = resolveRequiredRepo(opts.repo);
            if (!repo) return renderSvg(generateBadge('health', '?repo= required', badgeOpts, '#4ade80'));
            return renderSvg(generateBadge(repo.alias, 'tracked', badgeOpts, '#4ade80'));
        }

        if (route === 'calendar') {
            const summary = await cachedKvGet(kv, SUMMARY_KEY, 'json');
            const calendarGrid = allTimeCalendar(summary?.data?.user);
            return renderSvg(generateCalendar(calendarGrid, opts));
        }

        if (route === 'streak') {
            const summary = await cachedKvGet(kv, SUMMARY_KEY, 'json');
            const calendarGrid = allTimeCalendar(summary?.data?.user);
            return renderSvg(generateStreakBadge(calendarGrid, opts));
        }

        if (route === 'langs') {
            const agg = await aggregateLanguages(env, opts.repo, request);
            if (agg.error) return renderSvg(errorSvg(agg.error));
            return renderSvg(generateLangsBar(agg, opts));
        }

        if (route === 'langv2' || route === 'langs2') {
            const agg = await aggregateLanguages(env, opts.repo, request);
            if (agg.error) return renderSvg(errorSvg(agg.error));
            return renderSvg(generateLangsBarV2(agg, opts, CONFIG.languageDisplay));
        }

        if (route === 'profile') {
            const [summary, languages, commits, sources] = await Promise.all([
                cachedKvGet(kv, SUMMARY_KEY, 'json'),
                aggregateLanguages(env, opts.repo, request),
                collectRecentCommits(env, opts.repo, request),
                collectProfileSources(env),
            ]);
            if (languages.error) return renderSvg(errorSvg(languages.error));
            const user = summary?.data?.user;
            const calendarGrid = allTimeCalendar(user);
            return renderSvg(generateProfileTelemetry({
                calendarGrid,
                commits,
                languages,
                sources,
                metrics: {
                    contributions: calendarGrid?.totalContributions || 0,
                    commits: user?.allTime?.totalCommitContributions
                        || user?.contributionsCollection?.totalCommitContributions
                        || 0,
                    pullRequests: user?.contributionsCollection?.totalPullRequestContributions || 0,
                    issues: user?.allTime?.totalIssueContributions
                        || user?.contributionsCollection?.totalIssueContributions
                        || 0,
                },
            }, opts, CONFIG.languageDisplay));
        }

        if (route === 'project') {
            const repo = resolveRequiredRepo(opts.repo);
            if (!repo) return renderSvg(generateProjectCard(null, {}, opts));
            const [repoData, release, langs, commits, commitCount] = await Promise.all([
                cachedKvGet(kv, `github:${repo.alias}:repo`, 'json'),
                cachedKvGet(kv, `github:${repo.alias}:release`, 'json'),
                cachedKvGet(kv, `github:${repo.alias}:langs`, 'json'),
                cachedKvGet(kv, `github:${repo.alias}:commits`, 'json'),
                cachedKvGet(kv, `github:${repo.alias}:commit_count`, 'json'),
            ]);
            return renderSvg(generateProjectCard(repo, { repo: repoData, release, langs, commits, commitCount }, opts));
        }

        if (route === 'commits') {
            const all = await collectRecentCommits(env, opts.repo, request);
            const top3 = all.slice(0, opts.limit ?? 3);
            return renderSvg(generateCommitsList(top3, opts));
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
            return renderSvg(generateReleasesList(top5, opts));
        }

        return jsonResponse({ error: 'SVG route not found' }, 404);
    }

    if (path.startsWith('/v1/store/')) {
        const key = decodeURIComponent(path.slice('/v1/store/'.length));
        return handleGetKey(key, env, request);
    }

    //? delegated to ClickerDO
    if (path === '/v1/click') {
        const id = env.CLICKER.idFromName('global');
        const stub = env.CLICKER.get(id);
        return stub.fetch(request);
    }

    if (path === '/v1/github/webhook') {
        if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
        return handleGitHubWebhook(request, env, ctx);
    }

    //? Authenticated proxy for GitHub Contents API
    if (path === '/v1/github/contents') {
        const dataSecretConfigured = env.DATA_TOKEN || env.REFRESH_TOKEN;
        if (!dataSecretConfigured) return authFailure('DATA_TOKEN or REFRESH_TOKEN');
        if (!hasPrivateDataAccess(request, env)) {
            return jsonResponse({ error: 'Unauthorized' }, 401);
        }

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
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', ...CORS },
            });
        } catch (err) {
            return jsonResponse({ error: 'GitHub API proxy failed', message: err.message }, 502);
        }
    }

    return env.ASSETS.fetch(request);
}

//? Refresh only sources that are new, invalidated, or due. A bounded run is
//? still necessary because Workers Free allows only 50 external subrequests
//? per invocation; source cost reserves room for commit enrichment calls.
async function handleScheduled(env, options = {}) {
    const kv = env.echopoint_kv;
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const { state, migratedFromLegacy } = await loadSourceState(kv, env);
    const force = Boolean(options.force || options.scope === 'all' || options.scope === 'webhook');
    const explicitKeys = options.keys ? new Set(options.keys) : null;
    const candidates = [];

    for (const [index, source] of SOURCES.entries()) {
        if (explicitKeys && !explicitKeys.has(source.key)) continue;
        // A summary refresh must also update the sanitized private-language
        // aggregate; both values drive the contribution/language dashboard.
        if (options.scope === 'summary' && ![SUMMARY_KEY, PRIVATE_LANGS_KEY].includes(source.key)) continue;
        if (options.repoAlias && !source.key.startsWith(`github:${options.repoAlias}:`)) continue;

        const storedMeta = state.sources[source.key];
        const meta = storedMeta || {};
        const signature = sourceSignature(source, env);
        if (!sourceDue(meta, signature, now, force)) continue;

        candidates.push({
            index,
            source,
            meta,
            signature,
            dirty: !storedMeta || storedMeta.signature !== signature,
        });
    }

    candidates.sort((a, b) => {
        if (a.dirty !== b.dirty) return a.dirty ? -1 : 1;
        const priorityDelta = Number(b.source.priority || 0) - Number(a.source.priority || 0);
        if (priorityDelta !== 0) return priorityDelta;
        const aChecked = Date.parse(a.meta.lastCheckedAt || '') || 0;
        const bChecked = Date.parse(b.meta.lastCheckedAt || '') || 0;
        return aChecked - bChecked || a.index - b.index;
    });

    let successCount = 0;
    let failCount = 0;
    let processedCount = 0;
    let changedCount = 0;
    let notModifiedCount = 0;
    let budgetSkippedCount = 0;
    let budgetUsed = 0;
    const failures = [];

    for (const candidate of candidates) {
        const { source, meta, signature } = candidate;
        const cost = sourceCost(source);
        if (budgetUsed + cost > REFRESH_FETCH_BUDGET) {
            budgetSkippedCount++;
            continue;
        }

        processedCount++;
        budgetUsed += cost;
        // A changed source definition must restart pagination and must not
        // reuse validators belonging to the old URL/query/transform.
        const sourceMeta = candidate.dirty
            ? { ...meta, etag: null, lastModified: null, paginationCursor: null }
            : meta;
        let nextMeta = {
            ...sourceMeta,
            signature,
            lastCheckedAt: nowIso,
        };

        try {
            if (source.statusCheck?.kind === 'internal') {
                await kv.put(source.key, JSON.stringify(statusSnapshot(source, {
                    ok: true,
                    state: 'online',
                    status: 200,
                    latency_ms: 0,
                })));
                nextMeta = {
                    ...nextMeta,
                    lastSuccessAt: nowIso,
                    lastChangedAt: nowIso,
                    lastError: null,
                    nextDueAt: nextDueAt(source, now),
                };
                successCount++;
                changedCount++;
                state.sources[source.key] = nextMeta;
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

            const method = (source.method || 'GET').toUpperCase();
            addConditionalHeaders(headers, sourceMeta, method);
            if (method !== 'GET' && source.body) headers['Content-Type'] = 'application/json';
            if (source.url?.includes('crates.io')) {
                headers['Accept'] = 'application/json'; //* crates.io requires an explicit Accept header
            }

            const fetchOpts = { headers, method };
            if (source.body) fetchOpts.body = typeof source.body === 'function' ? source.body(env, sourceMeta) : source.body;

            const started = Date.now();
            const res = await fetch(source.url, fetchOpts);
            const latencyMs = Date.now() - started;
            const etag = res.headers.get('ETag') || sourceMeta.etag || null;
            const lastModified = res.headers.get('Last-Modified') || sourceMeta.lastModified || null;

            if (source.statusCheck) {
                let snapshot;
                if (res.status === 304) {
                    const previous = await kv.get(source.key, 'json');
                    snapshot = statusSnapshot(source, {
                        ...(previous || {}),
                        checked_at: nowIso,
                        latency_ms: latencyMs,
                    });
                } else {
                    const ok = isExpectedStatus(res.status, source.statusCheck.expectStatus);
                    snapshot = statusSnapshot(source, {
                        ok,
                        state: ok ? 'online' : 'offline',
                        status: res.status,
                        latency_ms: latencyMs,
                    });
                }
                await kv.put(source.key, JSON.stringify(snapshot));
                nextMeta = {
                    ...nextMeta,
                    etag,
                    lastModified,
                    lastSuccessAt: nowIso,
                    lastChangedAt: nowIso,
                    lastError: null,
                    nextDueAt: nextDueAt(source, now),
                };
                successCount++;
                changedCount++;
                state.sources[source.key] = nextMeta;
                continue;
            }

            if (res.status === 304) {
                nextMeta = {
                    ...nextMeta,
                    etag,
                    lastModified,
                    lastSuccessAt: nowIso,
                    lastError: null,
                    nextDueAt: nextDueAt(source, now),
                };
                successCount++;
                notModifiedCount++;
                state.sources[source.key] = nextMeta;
                continue;
            }

            if (!res.ok) {
                const retryAfter = Number(res.headers.get('Retry-After'));
                const retrySeconds = Number.isFinite(retryAfter) && retryAfter > 0
                    ? Math.max(60, retryAfter)
                    : REFRESH_RETRY_SECONDS;
                const message = `HTTP ${res.status}`;
                console.warn(`[echopoint] ${source.key} → ${message}`);
                nextMeta = {
                    ...nextMeta,
                    etag,
                    lastModified,
                    lastError: message,
                    nextDueAt: new Date(now + retrySeconds * 1000).toISOString(),
                };
                failCount++;
                failures.push({ key: source.key, status: res.status });
                state.sources[source.key] = nextMeta;
                continue;
            }

            let data = await res.json();
            if (source.validate && !source.validate(data)) {
                const detail = data?.errors?.[0]?.message || 'source validation failed';
                throw new Error(detail);
            }
            if (source.transform) data = await source.transform(data, env, res);
            if (source.merge) {
                const previous = await kv.get(source.key, 'json');
                data = await source.merge(data, previous, sourceMeta);
            }

            await kv.put(source.key, JSON.stringify(data));
            nextMeta = {
                ...nextMeta,
                etag,
                lastModified,
                lastSuccessAt: nowIso,
                lastChangedAt: nowIso,
                lastError: null,
                nextDueAt: source.paginated && data?.next_cursor
                    ? new Date(now + Number(source.paginateEvery || sourceInterval(source)) * 1000).toISOString()
                    : nextDueAt(source, now),
                ...(source.paginated ? { paginationCursor: data?.next_cursor || null } : {}),
            };
            successCount++;
            changedCount++;
        } catch (err) {
            const message = err?.message || String(err);
            console.error(`[echopoint] ${source.key} failed:`, message);
            nextMeta = {
                ...nextMeta,
                lastError: message,
                nextDueAt: new Date(now + REFRESH_RETRY_SECONDS * 1000).toISOString(),
            };
            failCount++;
            failures.push({ key: source.key, error: message });
            if (source.statusCheck) {
                await kv.put(source.key, JSON.stringify(statusSnapshot(source, {
                    ok: false,
                    state: 'offline',
                    status: null,
                    latency_ms: null,
                    error: message,
                })));
                changedCount++;
            }
        }

        state.sources[source.key] = nextMeta;
    }

    // Drop metadata for sources removed from config while leaving old KV data
    // recoverable. The public dump only serves active source keys.
    const activeKeys = activeSourceKeys();
    state.sources = Object.fromEntries(
        Object.entries(state.sources).filter(([key]) => activeKeys.has(key))
    );
    await kv.put(SOURCE_STATE_KEY, JSON.stringify(state));

    if (changedCount > 0) {
        await kv.put('_meta:last_updated', nowIso);
    }
    await kv.put('_meta:last_run', JSON.stringify({
        strategy: 'incremental',
        scope: options.scope || 'due',
        success: successCount,
        failed: failCount,
        changed: changedCount,
        not_modified: notModifiedCount,
        processed: processedCount,
        due: candidates.length,
        budget_skipped: budgetSkippedCount,
        total: SOURCES.length,
        migrated_from_legacy: migratedFromLegacy,
        fetch_budget_used: budgetUsed,
        fetch_budget_limit: REFRESH_FETCH_BUDGET,
        failures,
    }));

    console.log(`[echopoint] Incremental refresh: ${successCount} ok, ${failCount} failed, ${notModifiedCount} unchanged, ${processedCount}/${candidates.length} due sources processed`);
    return {
        strategy: 'incremental',
        scope: options.scope || 'due',
        success: successCount,
        failed: failCount,
        changed: changedCount,
        not_modified: notModifiedCount,
        processed: processedCount,
        due: candidates.length,
        budget_skipped: budgetSkippedCount,
        total: SOURCES.length,
        migrated_from_legacy: migratedFromLegacy,
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
