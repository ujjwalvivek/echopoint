#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, getTrackedGitHubRepos } from '../src/config.js';

export const DEFAULT_WEBHOOK_URL = 'https://echopoint.ujjwalvivek.com/v1/github/webhook';
export const DEFAULT_EVENTS = ['push', 'release'];

const GITHUB_API = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const REQUEST_TIMEOUT_MS = 30_000;
const SUPPORTED_EVENTS = new Set(['push', 'release']);

function usage() {
    console.log(`Usage:
  npm run webhooks:sync -- --dry-run
  npm run webhooks:sync -- --apply
  npm run webhooks:sync -- --apply --repo backdater
  npm run webhooks:sync -- --apply --events push
  npm run webhooks:sync -- --remove
  npm run webhooks:sync -- --remove --apply
  npm run webhooks:sync -- --remove --apply --repo backdater

The default mode is dry-run. --apply creates or updates the EchoPoint hook
for every tracked GitHub repository in src/config.js. --remove targets hooks
whose URL matches the configured EchoPoint URL; it is also dry-run unless
combined with --apply. Use --repo more than once to limit the operation.
`);
}

function parseEvents(raw) {
    if (raw === undefined || raw === null || raw === '') return [...DEFAULT_EVENTS];

    const events = String(raw)
        .split(',')
        .map((event) => event.trim().toLowerCase())
        .filter(Boolean);
    const unique = [...new Set(events)];
    const unsupported = unique.filter((event) => !SUPPORTED_EVENTS.has(event));
    if (unique.length === 0) throw new Error('--events must contain at least one event.');
    if (unsupported.length > 0) {
        throw new Error(`Unsupported webhook event(s): ${unsupported.join(', ')}. Use push or release.`);
    }
    return unique;
}

export function parseArgs(args) {
    let apply = false;
    let dryRun = false;
    let remove = false;
    let url = process.env.ECHOPOINT_WEBHOOK_URL?.trim() || DEFAULT_WEBHOOK_URL;
    let events = [...DEFAULT_EVENTS];
    const repos = [];

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--help' || arg === '-h') {
            usage();
            process.exit(0);
        }
        if (arg === '--apply') {
            apply = true;
            continue;
        }
        if (arg === '--dry-run') {
            dryRun = true;
            continue;
        }
        if (arg === '--remove') {
            remove = true;
            continue;
        }
        if (arg === '--repo') {
            const value = args[++index];
            if (!value || value.startsWith('-')) throw new Error('--repo requires an alias.');
            repos.push(value);
            continue;
        }
        if (arg.startsWith('--repo=')) {
            const value = arg.slice('--repo='.length).trim();
            if (!value) throw new Error('--repo requires an alias.');
            repos.push(value);
            continue;
        }
        if (arg === '--events') {
            const value = args[++index];
            if (value === undefined || value.startsWith('-')) throw new Error('--events requires a value.');
            events = parseEvents(value);
            continue;
        }
        if (arg.startsWith('--events=')) {
            events = parseEvents(arg.slice('--events='.length));
            continue;
        }
        if (arg === '--url') {
            url = String(args[++index] || '').trim();
            if (!url) throw new Error('--url requires a URL.');
            continue;
        }
        if (arg.startsWith('--url=')) {
            url = arg.slice('--url='.length).trim();
            if (!url) throw new Error('--url requires a URL.');
            continue;
        }
        throw new Error(`Unknown option: ${arg}`);
    }

    if (apply && dryRun) throw new Error('Use either --apply or --dry-run, not both.');

    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== 'https:') throw new Error('HTTPS is required.');
        url = parsedUrl.toString().replace(/\/$/, '');
    } catch {
        throw new Error(`Invalid webhook URL: ${url}`);
    }

    return {
        apply,
        dryRun: !apply,
        events,
        remove,
        repos: [...new Set(repos)],
        url,
    };
}

function repoMatchesAlias(repo, rawAlias) {
    const value = String(rawAlias).trim().toLowerCase();
    return [repo.alias, repo.name, `${repo.owner}/${repo.name}`]
        .filter(Boolean)
        .some((candidate) => String(candidate).toLowerCase() === value);
}

export function selectRepositories(config = CONFIG, aliases = []) {
    const repositories = getTrackedGitHubRepos(config);
    const missingIdentity = repositories.filter((repo) => !repo.owner || !repo.name);
    if (missingIdentity.length > 0) {
        throw new Error(
            `Tracked repository config is missing owner/name: ${missingIdentity.map((repo) => repo.alias).join(', ')}`
        );
    }

    if (aliases.length === 0) return repositories;

    const selected = aliases.map((alias) => {
        const repo = repositories.find((candidate) => repoMatchesAlias(candidate, alias));
        if (!repo) throw new Error(`Unknown or untracked repository alias: ${alias}`);
        return repo;
    });
    return [...new Map(selected.map((repo) => [repo.alias, repo])).values()];
}

function requestError(path, response, body) {
    const error = new Error(`${path}: HTTP ${response.status}${body?.message ? ` — ${body.message}` : ''}`);
    error.status = response.status;
    return error;
}

async function githubRequest(path, {
    token,
    method = 'GET',
    body,
    fetchImpl = globalThis.fetch,
} = {}) {
    if (!token) throw new Error('A GitHub API token is required.');
    if (typeof fetchImpl !== 'function') throw new Error('fetch is not available in this Node runtime.');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
    };
    const fetchOptions = {
        method,
        headers,
        signal: controller.signal,
    };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(body);
    }

    try {
        const response = await fetchImpl(`${GITHUB_API}${path}`, fetchOptions);
        const text = await response.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = null;
        }
        if (!response.ok) throw requestError(path, response, data);
        return data;
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error(`${path}: request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

export function webhookPayload({ url, events, secret }) {
    return {
        name: 'web',
        active: true,
        events: [...events],
        config: {
            url,
            content_type: 'json',
            insecure_ssl: '0',
            ...(secret === undefined ? {} : { secret }),
        },
    };
}

function sortedEqual(left = [], right = []) {
    return [...left].sort().join('\0') === [...right].sort().join('\0');
}

function hookNeedsVisibleUpdate(hook, desired) {
    return hook.name !== desired.name
        || hook.active !== desired.active
        || !sortedEqual(hook.events, desired.events)
        || hook.config?.url !== desired.config.url
        || hook.config?.content_type !== desired.config.content_type
        || String(hook.config?.insecure_ssl ?? '') !== desired.config.insecure_ssl;
}

export async function syncRepository(repo, {
    apply = false,
    events = DEFAULT_EVENTS,
    fetchImpl = globalThis.fetch,
    remove = false,
    secret,
    token,
    url = DEFAULT_WEBHOOK_URL,
} = {}) {
    const path = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/hooks`;
    const hooks = await githubRequest(`${path}?per_page=100`, { token, fetchImpl });
    if (!Array.isArray(hooks)) throw new Error(`${path}: expected a webhook list.`);

    const matches = hooks.filter((hook) => hook.config?.url === url);
    const duplicateCount = Math.max(0, matches.length - 1);

    if (remove) {
        if (matches.length === 0) {
            return { alias: repo.alias, action: 'already-removed', duplicateCount, hookId: null, removedCount: 0 };
        }
        if (!apply) {
            return {
                alias: repo.alias,
                action: 'would-remove',
                duplicateCount,
                hookId: matches[0].id || null,
                removedCount: matches.length,
            };
        }

        for (const hook of matches) {
            await githubRequest(`${path}/${encodeURIComponent(hook.id)}`, {
                token,
                method: 'DELETE',
                fetchImpl,
            });
        }
        return {
            alias: repo.alias,
            action: 'removed',
            duplicateCount,
            hookId: matches[0].id || null,
            removedCount: matches.length,
        };
    }

    const desired = webhookPayload({ url, events, secret });

    if (matches.length === 0) {
        if (!apply) {
            return { alias: repo.alias, action: 'would-create', duplicateCount, hookId: null };
        }
        const created = await githubRequest(path, {
            token,
            method: 'POST',
            body: desired,
            fetchImpl,
        });
        return {
            alias: repo.alias,
            action: 'created',
            duplicateCount,
            hookId: created?.id || null,
        };
    }

    const existing = matches[0];
    const visibleUpdate = hookNeedsVisibleUpdate(existing, desired);
    if (!apply) {
        return {
            alias: repo.alias,
            action: 'would-update',
            duplicateCount,
            hookId: existing.id || null,
            visibleUpdate,
        };
    }

    // GitHub masks the stored secret in list responses, so it cannot be
    // compared safely. Sending the desired config makes --apply repair both
    // visible settings and the HMAC secret without deleting the hook.
    const updated = await githubRequest(`${path}/${encodeURIComponent(existing.id)}`, {
        token,
        method: 'PATCH',
        body: desired,
        fetchImpl,
    });
    return {
        alias: repo.alias,
        action: 'updated',
        duplicateCount,
        hookId: updated?.id || existing.id || null,
        visibleUpdate,
    };
}

function environmentValue(...names) {
    for (const name of names) {
        const value = process.env[name]?.trim();
        if (value) return value;
    }
    return '';
}

async function promptHidden(label) {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
        throw new Error(`${label} is not set and no interactive terminal is available.`);
    }

    const stdin = process.stdin;
    const previousRaw = stdin.isRaw;
    const previousEncoding = stdin.readableEncoding;
    process.stdout.write(`${label} (hidden): `);

    return new Promise((resolvePrompt, rejectPrompt) => {
        let value = '';

        const cleanup = () => {
            stdin.off('data', onData);
            stdin.setRawMode(previousRaw || false);
            stdin.setEncoding(previousEncoding || null);
            stdin.pause();
        };

        const onData = (chunk) => {
            for (const char of String(chunk)) {
                if (char === '\u0003') {
                    cleanup();
                    process.stdout.write('\n');
                    rejectPrompt(new Error('Cancelled.'));
                    return;
                }
                if (char === '\r' || char === '\n') {
                    cleanup();
                    process.stdout.write('\n');
                    resolvePrompt(value.trim());
                    return;
                }
                if (char === '\u007f' || char === '\b') {
                    value = value.slice(0, -1);
                    continue;
                }
                value += char;
            }
        };

        stdin.setRawMode(true);
        stdin.setEncoding('utf8');
        stdin.resume();
        stdin.on('data', onData);
    });
}

async function requiredEnvironmentValue(label, ...names) {
    const value = environmentValue(...names) || await promptHidden(label);
    if (!value) throw new Error(`${label} must not be empty.`);
    return value;
}

function printResult(result, mode) {
    const suffix = result.removedCount > 0
        ? ` (${result.removedCount} hook${result.removedCount === 1 ? '' : 's'})`
        : result.hookId ? ` (hook ${result.hookId})` : '';
    const duplicate = result.duplicateCount > 0
        ? `; ${result.duplicateCount} duplicate URL hook(s) left untouched`
        : '';
    console.log(`${mode} ${result.alias}${suffix}${duplicate}`);
}

export async function run(options, {
    config = CONFIG,
    fetchImpl = globalThis.fetch,
    token,
    secret,
} = {}) {
    const repositories = selectRepositories(config, options.repos);
    const githubToken = token || environmentValue('GITHUB_WEBHOOK_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN');
    if (!githubToken) throw new Error('GITHUB_TOKEN (or GITHUB_WEBHOOK_TOKEN) is required.');
    const webhookSecret = options.apply && !options.remove
        ? (secret || await requiredEnvironmentValue('GITHUB_WEBHOOK_SECRET', 'GITHUB_WEBHOOK_SECRET'))
        : secret;

    const operation = options.remove ? 'removing' : 'syncing';
    console.log(`${options.apply ? 'Applying' : 'Dry run:'} ${operation} ${repositories.length} tracked GitHub webhook(s) for ${options.url}`);
    if (!options.apply) console.log('No GitHub changes will be made. Use --apply to confirm the operation.');

    const results = [];
    for (const repo of repositories) {
        try {
            const result = await syncRepository(repo, {
                apply: options.apply,
                events: options.events,
                fetchImpl,
                remove: options.remove,
                secret: webhookSecret,
                token: githubToken,
                url: options.url,
            });
            results.push(result);
            printResult(result, result.action);
        } catch (error) {
            const result = { alias: repo.alias, action: 'failed', error };
            results.push(result);
            console.error(`FAIL ${repo.alias}: ${error.message}`);
        }
    }

    const counts = results.reduce((summary, result) => {
        summary[result.action] = (summary[result.action] || 0) + 1;
        return summary;
    }, {});
    console.log(`Summary: ${Object.entries(counts).map(([action, count]) => `${action}=${count}`).join(', ')}`);
    if (results.some((result) => result.action === 'failed')) process.exitCode = 1;
    return results;
}

const isMainModule = process.argv[1]
    && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
    try {
        const options = parseArgs(process.argv.slice(2));
        await run(options);
    } catch (error) {
        console.error(`FAIL ${error.message}`);
        process.exitCode = 1;
    }
}
