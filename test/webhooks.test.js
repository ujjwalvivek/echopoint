import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_EVENTS,
    DEFAULT_WEBHOOK_URL,
    parseArgs,
    selectRepositories,
    syncRepository,
} from '../scripts/sync-webhooks.mjs';

const config = {
    github: {
        repos: [
            { alias: 'public-one', owner: 'ujjwalvivek', name: 'public-one', tracked: true },
            { alias: 'private-one', owner: 'ujjwalvivek', name: 'private-one', tracked: true, private: true },
            { alias: 'ignored', owner: 'ujjwalvivek', name: 'ignored', tracked: false },
        ],
    },
};

test('webhook CLI defaults to a safe dry-run with push and release events', () => {
    assert.deepEqual(parseArgs([]), {
        apply: false,
        dryRun: true,
        events: DEFAULT_EVENTS,
        remove: false,
        repos: [],
        url: DEFAULT_WEBHOOK_URL,
    });
    assert.deepEqual(parseArgs(['--apply', '--repo=private-one', '--events', 'push']), {
        apply: true,
        dryRun: false,
        events: ['push'],
        remove: false,
        repos: ['private-one'],
        url: DEFAULT_WEBHOOK_URL,
    });
    assert.deepEqual(parseArgs(['--remove', '--apply', '--repo', 'private-one']), {
        apply: true,
        dryRun: false,
        events: DEFAULT_EVENTS,
        remove: true,
        repos: ['private-one'],
        url: DEFAULT_WEBHOOK_URL,
    });
});

test('repository selection includes private tracked entries and rejects unknown aliases', () => {
    assert.deepEqual(selectRepositories(config).map((repo) => repo.alias), ['public-one', 'private-one']);
    assert.deepEqual(selectRepositories(config, ['private-one']).map((repo) => repo.name), ['private-one']);
    assert.throws(() => selectRepositories(config, ['missing']), /Unknown or untracked/);
});

test('dry-run plans a missing hook without creating it', async () => {
    const calls = [];
    const result = await syncRepository(config.github.repos[0], {
        token: 'github-token',
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return new Response('[]', { status: 200 });
        },
    });

    assert.equal(result.action, 'would-create');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'GET');
});

test('apply updates an existing matching hook and sends the webhook secret', async () => {
    const calls = [];
    const result = await syncRepository(config.github.repos[1], {
        apply: true,
        events: ['push', 'release'],
        secret: 'webhook-secret',
        token: 'github-token',
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            if (options.method === 'GET') {
                return new Response(JSON.stringify([{
                    id: 42,
                    name: 'web',
                    active: true,
                    events: ['push'],
                    config: {
                        url: DEFAULT_WEBHOOK_URL,
                        content_type: 'json',
                        insecure_ssl: '0',
                    },
                }]), { status: 200 });
            }
            return new Response(JSON.stringify({ id: 42 }), { status: 200 });
        },
    });

    assert.equal(result.action, 'updated');
    assert.equal(result.hookId, 42);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].options.method, 'PATCH');
    const body = JSON.parse(calls[1].options.body);
    assert.equal(body.config.secret, 'webhook-secret');
    assert.deepEqual(body.events, ['push', 'release']);
});

test('remove dry-run reports matching hooks without deleting them', async () => {
    const calls = [];
    const result = await syncRepository(config.github.repos[0], {
        remove: true,
        token: 'github-token',
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return new Response(JSON.stringify([{
                id: 9,
                name: 'web',
                active: true,
                events: ['push'],
                config: { url: DEFAULT_WEBHOOK_URL },
            }]), { status: 200 });
        },
    });

    assert.equal(result.action, 'would-remove');
    assert.equal(result.removedCount, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'GET');
});

test('remove apply deletes every matching EchoPoint hook and preserves unrelated hooks', async () => {
    const calls = [];
    const result = await syncRepository(config.github.repos[0], {
        apply: true,
        remove: true,
        token: 'github-token',
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            if (options.method === 'GET') {
                return new Response(JSON.stringify([
                    { id: 9, config: { url: DEFAULT_WEBHOOK_URL } },
                    { id: 10, config: { url: DEFAULT_WEBHOOK_URL } },
                    { id: 11, config: { url: 'https://other.example/hook' } },
                ]), { status: 200 });
            }
            return new Response(null, { status: 204 });
        },
    });

    assert.equal(result.action, 'removed');
    assert.equal(result.removedCount, 2);
    assert.deepEqual(calls.map(({ options }) => options.method), ['GET', 'DELETE', 'DELETE']);
    assert.deepEqual(calls.slice(1).map(({ url }) => url), [
        'https://api.github.com/repos/ujjwalvivek/public-one/hooks/9',
        'https://api.github.com/repos/ujjwalvivek/public-one/hooks/10',
    ]);
});
