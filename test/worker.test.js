import test from 'node:test';
import assert from 'node:assert/strict';
import Worker from '../src/index.js';
import { normalizeNpmTime, normalizePyPiData, SOURCES } from '../src/sources.js';

class MemoryKV {
    constructor(entries = {}) {
        this.values = new Map(Object.entries(entries));
    }

    async get(key, type) {
        if (!this.values.has(key)) return null;
        const value = this.values.get(key);
        if (type === 'json') return typeof value === 'string' ? JSON.parse(value) : value;
        return value;
    }

    async put(key, value) {
        this.values.set(key, value);
    }

    async list() {
        return { keys: [...this.values.keys()].map((name) => ({ name })) };
    }
}

function env(kv, overrides = {}) {
    return {
        echopoint_kv: kv,
        GITHUB_TOKEN: 'github-token',
        REFRESH_TOKEN: 'refresh-token',
        ASSETS: { fetch: async () => new Response('asset') },
        ...overrides,
    };
}

test('summary refresh is authenticated and stores all-time and private-language data', async () => {
    const kv = new MemoryKV();
    const workerEnv = env(kv);
    const originalFetch = globalThis.fetch;
    let upstreamCalls = 0;

    globalThis.fetch = async (_url, options) => {
        upstreamCalls++;
        assert.equal(options.method, 'POST');
        assert.equal(options.headers.Authorization, 'Bearer github-token');
        assert.equal(options.headers['Content-Type'], 'application/json');
        const query = JSON.parse(options.body).query;
        if (query.includes('privateLanguages')) {
            return new Response(JSON.stringify({
                data: {
                    user: {
                        repositories: {
                            totalCount: 1,
                            pageInfo: { hasNextPage: false, endCursor: null },
                            nodes: [{
                                nameWithOwner: 'ujjwalvivek/woodpecker',
                                languages: { edges: [{ size: 10, node: { name: 'Rust' } }] },
                            }],
                        },
                    },
                },
            }), { status: 200 });
        }
        return new Response(JSON.stringify({
            data: {
                user: {
                    login: 'ujjwalvivek',
                    contributionsCollection: {
                        totalCommitContributions: 1,
                        contributionCalendar: { totalContributions: 1 },
                    },
                    y2016: {
                        totalCommitContributions: 7,
                        totalPullRequestContributions: 2,
                        totalIssueContributions: 3,
                        totalPullRequestReviewContributions: 1,
                        totalRepositoryContributions: 1,
                        restrictedContributionsCount: 2,
                        contributionCalendar: {
                            totalContributions: 7,
                            weeks: [{ contributionDays: [{ date: '2016-01-01', contributionCount: 7, color: '#1' }] }],
                        },
                    },
                },
            },
        }), { status: 200, headers: { ETag: 'summary-v1' } });
    };

    try {
        const unauthorized = await Worker.fetch(
            new Request('https://example.test/v1/refresh?scope=summary', { method: 'POST' }),
            workerEnv,
            {},
        );
        assert.equal(unauthorized.status, 401);
        assert.equal(upstreamCalls, 0);

        const response = await Worker.fetch(
            new Request('https://example.test/v1/refresh?scope=summary', {
                method: 'POST',
                headers: { Authorization: 'Bearer refresh-token' },
            }),
            workerEnv,
            {},
        );
        assert.equal(response.status, 200);
        assert.equal(upstreamCalls, 2);

        const summary = await kv.get('github:ujjwalvivek:summary', 'json');
        assert.equal(summary.data.user.allTime.totalContributions, 7);
        assert.equal(summary.data.user.allTime.totalCommitContributions, 7);
        assert.equal(summary.data.user.contributionsCollection.totalIssueContributions, 3);
        assert.equal((await kv.get('_meta:source_state', 'json')).sources['github:ujjwalvivek:summary'].etag, 'summary-v1');
        assert.deepEqual((await kv.get('github:private:ujjwalvivek:langs', 'json')).languages, { Rust: 10 });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('public store omits private repository records and internal refresh state', async () => {
    const kv = new MemoryKV({
        'github:portfolio:repo': JSON.stringify({ private: true, name: 'portfolio' }),
        'github:portfolio:langs': JSON.stringify({ Rust: 100 }),
        'github:private:ujjwalvivek:langs': JSON.stringify({ languages: { Rust: 25, Go: 10 } }),
        '_meta:source_state': JSON.stringify({ sources: { 'github:portfolio:repo': { signature: 'secret' } } }),
    });
    const workerEnv = env(kv);

    const publicStore = await Worker.fetch(new Request('https://example.test/v1/store'), workerEnv, {});
    const store = await publicStore.json();
    assert.equal(publicStore.status, 200);
    assert.equal(store['github:portfolio:repo'], undefined);
    assert.equal(store['github:portfolio:langs'], undefined);
    assert.deepEqual(store['github:private:ujjwalvivek:langs'].languages, { Rust: 25, Go: 10 });

    const internalState = await Worker.fetch(
        new Request('https://example.test/v1/store/_meta:source_state'),
        workerEnv,
        {},
    );
    assert.equal(internalState.status, 404);

    const privateKey = await Worker.fetch(
        new Request('https://example.test/v1/store/github:portfolio:repo'),
        workerEnv,
        {},
    );
    assert.equal(privateKey.status, 401);

    const privateLanguages = await Worker.fetch(
        new Request('https://example.test/v1/langs?repo=portfolio'),
        workerEnv,
        {},
    );
    assert.equal(privateLanguages.status, 401);
    assert.equal(privateLanguages.headers.get('Cache-Control'), 'private, no-store');

    const authorizedPrivateKey = await Worker.fetch(
        new Request('https://example.test/v1/store/github:portfolio:repo', {
            headers: { Authorization: 'Bearer refresh-token' },
        }),
        workerEnv,
        {},
    );
    assert.equal(authorizedPrivateKey.status, 200);
    assert.equal((await authorizedPrivateKey.json()).private, true);
});

test('source list removes duplicate owner lookups and stays within weighted budget', () => {
    const userSources = SOURCES.filter((source) => source.key.endsWith(':user'));
    const commitCost = Math.max(...SOURCES.map((source) => Number(source.cost || 1)));
    assert.equal(userSources.length, 1);
    assert.equal(SOURCES.some((source) => source.key === 'github:private:ujjwalvivek:langs'), true);
    assert.ok(commitCost <= 6);
});

test('PyPI sources normalize package metadata and expose a Python badge', async () => {
    const pypiSource = SOURCES.find((source) => source.key === 'pypi:echohub');
    assert.ok(pypiSource);
    assert.equal(pypiSource.url, 'https://pypi.org/pypi/echohub/json');
    assert.deepEqual(normalizePyPiData({
        info: {
            name: 'echohub',
            version: '2.3.4',
            summary: 'EchoHub package',
            requires_python: '>=3.11',
            license: 'MIT',
            home_page: 'https://example.test/echohub',
        },
    }), {
        name: 'echohub',
        version: '2.3.4',
        summary: 'EchoHub package',
        requires_python: '>=3.11',
        license: 'MIT',
        home_page: 'https://example.test/echohub',
    });

    const kv = new MemoryKV({
        'pypi:echohub': JSON.stringify({ name: 'echohub', version: '2.3.4' }),
    });
    const response = await Worker.fetch(
        new Request('https://example.test/svg/badges/pypi?package=echohub'),
        env(kv),
        {},
    );
    const svg = await response.text();
    assert.equal(response.status, 200);
    assert.match(svg, />v2\.3\.4<\/text>/);
    assert.match(svg, /M14\.25\.18/);
});

test('targeted PyPI refresh bypasses unrelated due sources', async () => {
    const kv = new MemoryKV();
    const workerEnv = env(kv);
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';

    globalThis.fetch = async (url) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify({
            info: {
                name: 'echohub',
                version: '9.9.9',
                summary: 'EchoHub package',
            },
        }), { status: 200, headers: { ETag: 'pypi-v1' } });
    };

    try {
        const response = await Worker.fetch(
            new Request('https://example.test/v1/refresh?scope=pypi&package=echohub', {
                method: 'POST',
                headers: { Authorization: 'Bearer refresh-token' },
            }),
            workerEnv,
            {},
        );
        const result = await response.json();
        assert.equal(response.status, 200);
        assert.equal(result.success, 1);
        assert.equal(result.processed, 1);
        assert.equal(requestedUrl, 'https://pypi.org/pypi/echohub/json');
        assert.equal((await kv.get('pypi:echohub', 'json')).version, '9.9.9');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('generic targeted source refresh handles registry sources', async () => {
    const kv = new MemoryKV();
    const workerEnv = env(kv);
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';

    globalThis.fetch = async (url) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify({ name: 'journey-engine', version: '8.8.8' }), {
            status: 200,
            headers: { ETag: 'npm-v1' },
        });
    };

    try {
        const response = await Worker.fetch(
            new Request('https://example.test/v1/refresh?scope=source&key=npm%3Ajourney-engine', {
                method: 'POST',
                headers: { Authorization: 'Bearer refresh-token' },
            }),
            workerEnv,
            {},
        );
        const result = await response.json();
        assert.equal(response.status, 200);
        assert.equal(result.success, 1);
        assert.equal(result.processed, 1);
        assert.equal(requestedUrl, 'https://registry.npmjs.org/@ujjwalvivek/journey-engine/latest');
        assert.equal((await kv.get('npm:journey-engine', 'json')).version, '8.8.8');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('profile SVG keeps private commit details out of the public surface', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const kv = new MemoryKV({
        'github:ujjwalvivek:summary': JSON.stringify({
            data: {
                user: {
                    allTime: {
                        totalContributions: 12,
                        weeks: [{ contributionDays: [{ date: today, contributionCount: 2 }] }],
                        startDate: today,
                        endDate: today,
                    },
                    contributionsCollection: {
                        totalCommitContributions: 8,
                        totalPullRequestContributions: 3,
                        totalIssueContributions: 1,
                    },
                },
            },
        }),
        'github:journey:repo': JSON.stringify({ private: false }),
        'github:journey:commits': JSON.stringify([
            { date: today, message: 'public commit', sha: 'public123', additions: 2, deletions: 0 },
        ]),
        'github:woodpecker:repo': JSON.stringify({ private: true }),
        'github:woodpecker:commits': JSON.stringify([
            { date: today, message: 'private commit should stay private', sha: 'secret12' },
        ]),
        'github:journey:langs': JSON.stringify({ Rust: 100 }),
        'github:private:ujjwalvivek:langs': JSON.stringify({ languages: { Go: 20 } }),
    });

    const response = await Worker.fetch(
        new Request('https://example.test/svg/profile?profileWidth=860&profileCommitLimit=2'),
        env(kv),
        {},
    );
    const svg = await response.text();

    assert.equal(response.status, 200);
    assert.match(svg, /<title>Profile telemetry<\/title>/);
    assert.match(svg, /public commit/);
    assert.doesNotMatch(svg, /private commit should stay private/);
    assert.match(svg, />12<\/text>/);
});

test('first incremental run adopts legacy KV values instead of re-fetching them all', async () => {
    const entries = { '_meta:last_updated': new Date().toISOString() };
    for (const source of SOURCES) {
        if (source.key === 'github:ujjwalvivek:summary' || source.key === 'github:private:ujjwalvivek:langs') continue;
        entries[source.key] = JSON.stringify({ cached: true });
    }

    const kv = new MemoryKV(entries);
    const workerEnv = env(kv);
    const originalFetch = globalThis.fetch;
    const requests = [];

    globalThis.fetch = async (_url, options) => {
        requests.push(JSON.parse(options.body).query);
        if (requests.at(-1).includes('privateLanguages')) {
            return new Response(JSON.stringify({
                data: {
                    user: {
                        repositories: {
                            totalCount: 0,
                            pageInfo: { hasNextPage: false, endCursor: null },
                            nodes: [],
                        },
                    },
                },
            }), { status: 200 });
        }
        return new Response(JSON.stringify({
            data: {
                user: {
                    login: 'ujjwalvivek',
                    contributionsCollection: { contributionCalendar: { totalContributions: 0 } },
                    y2016: {
                        contributionCalendar: {
                            totalContributions: 0,
                            weeks: [{ contributionDays: [{ date: '2016-01-01', contributionCount: 0 }] }],
                        },
                    },
                },
            },
        }), { status: 200 });
    };

    try {
        const response = await Worker.fetch(
            new Request('https://example.test/v1/refresh', {
                method: 'POST',
                headers: { Authorization: 'Bearer refresh-token' },
            }),
            workerEnv,
            {},
        );
        const result = await response.json();
        assert.equal(response.status, 200);
        assert.equal(result.migrated_from_legacy, true);
        assert.equal(result.due, 2);
        assert.equal(result.processed, 2);
        assert.equal(requests.length, 2);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('unchanged weighted sources only spend one fetch of budget', async () => {
    const kv = new MemoryKV();
    const workerEnv = env(kv);
    const originalFetch = globalThis.fetch;
    let commitsChanged = true;
    const requested = [];

    globalThis.fetch = async (url, options = {}) => {
        requested.push(String(url));
        const headers = options.headers || {};
        const isCommitList = String(url).includes('/commits?per_page=5');
        if (headers['If-None-Match'] && !(isCommitList && commitsChanged)) {
            return new Response(null, { status: 304 });
        }
        if (isCommitList) {
            return new Response(JSON.stringify([{
                sha: 'abc',
                url: 'https://api.github.com/repos/ujjwalvivek/portfolio/commits/abc',
                html_url: 'https://github.com/ujjwalvivek/portfolio/commit/abc',
                commit: { message: 'msg', author: { name: 'me', date: '2026-10-01T00:00:00Z' } },
            }]), { status: 200, headers: { ETag: `"commits-${requested.length}"` } });
        }
        if (String(url).endsWith('/commits/abc')) {
            return new Response(JSON.stringify({ stats: { additions: 3, deletions: 1 } }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ETag: '"v1"' } });
    };

    const refreshRepo = async () => {
        const response = await Worker.fetch(
            new Request('https://example.test/v1/refresh?scope=repo&repo=portfolio', {
                method: 'POST',
                headers: { Authorization: 'Bearer refresh-token' },
            }),
            workerEnv,
            {},
        );
        assert.equal(response.status, 200);
        return response.json();
    };

    try {
        const first = await refreshRepo();
        const sourceCount = first.processed;
        const commitCost = Math.max(...SOURCES.map((source) => Number(source.cost || 1)));
        assert.equal(first.fetch_budget_used, sourceCount + commitCost - 1, 'first fetch reserves the full weight');

        commitsChanged = false;
        const unchanged = await refreshRepo();
        assert.equal(unchanged.not_modified, sourceCount);
        assert.equal(unchanged.fetch_budget_used, sourceCount, '304s cost one fetch each');

        commitsChanged = true;
        const changed = await refreshRepo();
        assert.equal(changed.fetch_budget_used, sourceCount + commitCost - 1, 'a 200 pays for enrichment');
        const commits = await kv.get('github:portfolio:commits', 'json');
        assert.equal(commits[0].additions, 3);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('private store requires the token and includes private records', async () => {
    const kv = new MemoryKV({
        'github:portfolio:repo': JSON.stringify({ private: true, name: 'portfolio' }),
        'github:portfolio:langs': JSON.stringify({ Rust: 100 }),
        'github:journey:repo': JSON.stringify({ private: false, name: 'journey' }),
        'github:private:ujjwalvivek:langs': JSON.stringify({ languages: { Rust: 25 } }),
        '_meta:source_state': JSON.stringify({ sources: {} }),
        '_meta:last_updated': '2026-10-15T00:00:00.000Z',
    });
    const workerEnv = env(kv);
    const get = (headers = {}) => Worker.fetch(
        new Request('https://example.test/v1/private', { headers }),
        workerEnv,
        {},
    );

    for (const headers of [{}, { Authorization: 'Bearer wrong' }]) {
        const denied = await get(headers);
        assert.equal(denied.status, 401);
        assert.equal(denied.headers.get('Cache-Control'), 'private, no-store');
        assert.equal((await denied.json())['github:portfolio:repo'], undefined);
    }

    const allowed = await get({ Authorization: 'Bearer refresh-token' });
    const store = await allowed.json();
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(store['github:portfolio:repo'].private, true);
    assert.deepEqual(store['github:portfolio:langs'], { Rust: 100 });
    assert.equal(store['github:journey:repo'].name, 'journey');
    assert.ok(store['github:private:ujjwalvivek:langs']);
    assert.equal(store['_meta:last_updated'], '2026-10-15T00:00:00.000Z');
    assert.equal(store['_meta:source_state'], undefined, 'internal state stays hidden');

    const publicStore = await (await Worker.fetch(new Request('https://example.test/v1/store'), workerEnv, {})).json();
    assert.equal(publicStore['github:portfolio:repo'], undefined, 'public dump is unchanged');
});

test('private store is unavailable when no token is configured', async () => {
    const workerEnv = env(new MemoryKV(), { REFRESH_TOKEN: undefined });
    const response = await Worker.fetch(new Request('https://example.test/v1/private'), workerEnv, {});
    assert.equal(response.status, 503);
});

test('a repo without releases is scheduled normally, not retried as a failure', async () => {
    const kv = new MemoryKV({ 'github:portfolio:release': JSON.stringify({ tag_name: 'v0.1.0' }) });
    const workerEnv = env(kv);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
        if (String(url).endsWith('/releases/latest')) return new Response('{"message":"Not Found"}', { status: 404 });
        return new Response(JSON.stringify([]), { status: 200 });
    };

    try {
        const response = await Worker.fetch(
            new Request('https://example.test/v1/refresh?scope=repo&repo=portfolio', {
                method: 'POST',
                headers: { Authorization: 'Bearer refresh-token' },
            }),
            workerEnv,
            {},
        );
        const result = await response.json();
        assert.equal(result.failed, 0);
        assert.deepEqual(result.failures, []);
        assert.equal(await kv.get('github:portfolio:release', 'json'), null, 'a deleted release is cleared');

        const state = await kv.get('_meta:source_state', 'json');
        const meta = state.sources['github:portfolio:release'];
        assert.equal(meta.lastError, null);
        const hoursUntilDue = (Date.parse(meta.nextDueAt) - Date.now()) / 3_600_000;
        assert.ok(hoursUntilDue > 11, `next check in ${hoursUntilDue.toFixed(1)}h, not the 15 minute retry`);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('npm time source keeps only publish dates and a version count', () => {
    assert.deepEqual(normalizeNpmTime({
        'dist-tags': { latest: '1.3.0' },
        time: { created: '2025-01-01T00:00:00Z', modified: '2026-05-01T00:00:00Z', '1.3.0': '2026-04-30T00:00:00Z' },
        versions: { '1.2.0': {}, '1.3.0': {} },
    }), {
        latest: '1.3.0',
        published_at: '2026-04-30T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
        modified_at: '2026-05-01T00:00:00Z',
        versions: 2,
    });
    const npmKeys = SOURCES.map((source) => source.key).filter((key) => key.startsWith('npm:'));
    assert.ok(npmKeys.some((key) => key.endsWith(':downloads')));
    assert.ok(npmKeys.some((key) => key.endsWith(':time')));
});
