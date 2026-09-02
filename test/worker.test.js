import test from 'node:test';
import assert from 'node:assert/strict';
import Worker from '../src/index.js';
import { normalizePyPiData, SOURCES } from '../src/sources.js';

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
