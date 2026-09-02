#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_ECHOPOINT_URL = 'https://echopoint.ujjwalvivek.com';
const REQUEST_TIMEOUT_MS = 30_000;
// A due batch may contain many sequential upstream requests. Cloudflare HTTP
// requests can remain open while the client is connected, so give refreshes
// more time than the short config/deployment checks.
const REFRESH_TIMEOUT_MS = 120_000;

function usage() {
    console.log(`Usage:
  npm run deploy:refresh
  npm run deploy:refresh -- repo-alias [repo-alias ...]
  npm run deploy:refresh -- --all
  npm run deploy:refresh -- --summary

With no aliases, the script compares the deployed config before and after the
deployment and refreshes newly added, changed, or incompletely cached tracked
repositories. It also directly refreshes newly added, changed, or missing
configured non-GitHub sources (npm, PyPI, Crates.io, Docker, and status checks),
even when the normal due batch is full.
`);
}

function parseArgs(args) {
    const aliases = [];
    let all = false;
    let summary = false;

    for (const arg of args) {
        if (arg === '--help' || arg === '-h') {
            usage();
            process.exit(0);
        }
        if (arg === '--all') {
            all = true;
            continue;
        }
        if (arg === '--summary') {
            summary = true;
            continue;
        }
        if (arg.startsWith('-')) {
            throw new Error(`Unknown option: ${arg}`);
        }
        aliases.push(arg);
    }

    if (all && aliases.length > 0) {
        throw new Error('Use either --all or explicit repository aliases, not both.');
    }

    return { aliases: [...new Set(aliases)], all, summary };
}

function echoPointUrl() {
    const raw = process.env.ECHOPOINT_URL || DEFAULT_ECHOPOINT_URL;
    return raw.replace(/\/+$/, '');
}

function normalizeRepo(repo) {
    return {
        alias: String(repo?.alias || repo?.name || ''),
        tracked: repo?.tracked !== false,
        private: repo?.private === true,
        // The public config intentionally omits owner/name for private repos.
        // Alias, tracked state, and visibility are enough for change detection.
        owner: repo?.private === true ? null : (repo?.owner || null),
        name: repo?.private === true ? null : (repo?.name || null),
    };
}

function repoMap(config) {
    return new Map(
        (config?.github?.repos || [])
            .map(normalizeRepo)
            .filter((repo) => repo.alias)
            .map((repo) => [repo.alias, repo]),
    );
}

function sameRepo(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function changedRepositoryAliases(before, after) {
    const aliases = new Set([...before.keys(), ...after.keys()]);
    return [...aliases].filter((alias) => !sameRepo(before.get(alias), after.get(alias)));
}

function privateConfigChanged(before, after) {
    const aliases = new Set([...before.keys(), ...after.keys()]);
    return [...aliases].some((alias) => {
        const oldRepo = before.get(alias);
        const newRepo = after.get(alias);
        return Boolean(oldRepo?.private) !== Boolean(newRepo?.private)
            || Boolean(oldRepo?.tracked) !== Boolean(newRepo?.tracked)
            || (!oldRepo && newRepo?.private)
            || (oldRepo?.private && !newRepo);
    });
}

function configuredSourceMap(config) {
    const collections = ['npm', 'crates', 'docker', 'pypi', 'status'];
    const entries = [];

    for (const kind of collections) {
        for (const entry of config?.[kind] || []) {
            const alias = String(
                entry?.alias
                || entry?.package
                || entry?.crate
                || entry?.repository
                || '',
            );
            if (!alias) continue;

            const key = kind === 'docker'
                ? `docker:${alias}:tags`
                : `${kind}:${alias}`;
            entries.push([key, { ...entry, alias }]);
        }
    }

    return new Map(entries);
}

function changedSourceKeys(beforeConfig, afterConfig) {
    const before = configuredSourceMap(beforeConfig);
    const after = configuredSourceMap(afterConfig);
    const keys = new Set([...before.keys(), ...after.keys()]);
    return [...keys].filter((key) =>
        after.has(key) && JSON.stringify(before.get(key)) !== JSON.stringify(after.get(key))
    );
}

async function missingSourceKeys(config) {
    const keys = [...configuredSourceMap(config).keys()];
    const results = await Promise.all(keys.map(async (key) => {
        try {
            await requestJson(`/v1/store/${encodeURIComponent(key)}`);
            return null;
        } catch (error) {
            if (error.status === 404) return key;
            throw error;
        }
    }));
    return results.filter(Boolean);
}

function trackedRepositoryAliases(config) {
    return (config?.github?.repos || [])
        .filter((repo) => repo?.tracked !== false)
        .map((repo) => String(repo?.alias || repo?.name || ''))
        .filter(Boolean);
}

async function missingRepositoryAliases(config, token) {
    const aliases = trackedRepositoryAliases(config);
    const requiredSuffixes = ['repo', 'langs'];
    const options = { headers: { Authorization: `Bearer ${token}` } };

    const results = await Promise.all(aliases.map(async (alias) => {
        const missing = await Promise.all(requiredSuffixes.map(async (suffix) => {
            const key = `github:${alias}:${suffix}`;
            try {
                await requestJson(`/v1/store/${encodeURIComponent(key)}`, options);
                return false;
            } catch (error) {
                if (error.status === 404) return true;
                throw error;
            }
        }));
        return missing.some(Boolean) ? alias : null;
    }));

    return results.filter(Boolean);
}

async function requestJson(path, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${echoPointUrl()}${path}`, {
            ...options,
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                ...(options.headers || {}),
            },
        });
        const text = await response.text();
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = null;
        }

        if (!response.ok) {
            const detail = body?.error || body?.message || `HTTP ${response.status}`;
            const error = new Error(`${path}: ${detail}`);
            error.status = response.status;
            throw error;
        }

        return body;
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error(`${path}: request timed out after ${timeoutMs / 1000}s`);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

async function promptForSecret() {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
        throw new Error('ECHOPOINT_REFRESH_TOKEN is not set and no interactive terminal is available.');
    }

    const stdin = process.stdin;
    const previousRaw = stdin.isRaw;
    const previousEncoding = stdin.readableEncoding;
    process.stdout.write('EchoPoint REFRESH_TOKEN (hidden): ');

    return new Promise((resolve, reject) => {
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
                    reject(new Error('Cancelled.'));
                    return;
                }
                if (char === '\r' || char === '\n') {
                    cleanup();
                    process.stdout.write('\n');
                    resolve(value.trim());
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

async function getRefreshToken() {
    const token = (process.env.ECHOPOINT_REFRESH_TOKEN || process.env.REFRESH_TOKEN)?.trim();
    return token || promptForSecret();
}

function runDeploy() {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const env = { ...process.env };
    // The deployment process does not need the refresh token. Avoid passing it
    // to npm/Wrangler when it was supplied through the environment.
    delete env.ECHOPOINT_REFRESH_TOKEN;
    delete env.REFRESH_TOKEN;

    return new Promise((resolve, reject) => {
        const child = spawn(npm, ['run', 'deploy'], {
            cwd: ROOT,
            env,
            stdio: 'inherit',
        });
        child.on('error', reject);
        child.on('exit', (code, signal) => {
            if (signal) reject(new Error(`Deployment stopped by ${signal}.`));
            else if (code !== 0) reject(new Error(`Deployment failed with exit code ${code}.`));
            else resolve();
        });
    });
}

async function refresh(token, scope, alias = null) {
    const params = new URLSearchParams({ scope });
    if (alias) params.set(scope === 'repo' ? 'repo' : 'package', alias);

    return requestJson(`/v1/refresh?${params.toString()}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
    }, REFRESH_TIMEOUT_MS);
}

async function refreshSource(token, key) {
    const params = new URLSearchParams({ scope: 'source', key });
    return requestJson(`/v1/refresh?${params.toString()}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
    }, REFRESH_TIMEOUT_MS);
}

function isExpectedMissingRelease(failure) {
    return failure?.status === 404 && String(failure.key || '').endsWith(':release');
}

function reportRefresh(label, result) {
    if (!result?.ok) {
        console.error(`✗ ${label}: ${result?.error || 'refresh failed'}`);
        return true;
    }

    const failures = Array.isArray(result.failures) ? result.failures : [];
    const blockingFailures = failures.filter((failure) => !isExpectedMissingRelease(failure));
    console.log(`✓ ${label}: ${result.success ?? 0} succeeded, ${result.changed ?? 0} changed, ${result.failed ?? 0} failed`);

    for (const failure of failures) {
        const status = failure.status ? `HTTP ${failure.status}` : (failure.error || 'error');
        const suffix = isExpectedMissingRelease(failure) ? ' (expected when no release exists)' : '';
        console.warn(`  ! ${failure.key || label}: ${status}${suffix}`);
    }

    return blockingFailures.length > 0;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const token = await getRefreshToken();
    if (!token) throw new Error('A non-empty ECHOPOINT_REFRESH_TOKEN is required.');

    console.log(`Reading current config from ${echoPointUrl()}...`);
    const beforeConfig = await requestJson('/v1/config');
    const before = repoMap(beforeConfig);

    console.log('Deploying Worker and dashboard...');
    await runDeploy();

    console.log('Reading deployed config...');
    const afterConfig = await requestJson('/v1/config');
    const after = repoMap(afterConfig);
    const changedAliases = changedRepositoryAliases(before, after);
    const missingRepositories = await missingRepositoryAliases(afterConfig, token);
    const changedSources = changedSourceKeys(beforeConfig, afterConfig);
    const missingSources = await missingSourceKeys(afterConfig);
    const sourcesToRefresh = [...new Set([...changedSources, ...missingSources])];

    if (sourcesToRefresh.length > 0) {
        console.log(`Detected configured source changes or missing data: ${sourcesToRefresh.join(', ')}`);
    }

    let aliases;
    if (options.all) {
        aliases = [...after.values()]
            .filter((repo) => repo.tracked)
            .map((repo) => repo.alias);
        console.log(`--all selected: refreshing ${aliases.length} tracked repositories.`);
    } else if (options.aliases.length > 0) {
        aliases = options.aliases;
    } else {
        aliases = [...new Set([
            ...changedAliases.filter((alias) => after.get(alias)?.tracked),
            ...missingRepositories,
        ])];
        if (aliases.length > 0) {
            console.log(`Detected repository changes or missing data: ${aliases.join(', ')}`);
        }
    }

    for (const alias of aliases) {
        const repo = after.get(alias);
        if (!repo || !repo.tracked) {
            throw new Error(`Repository is not present as a tracked entry in deployed config: ${alias}`);
        }
    }

    let failed = false;
    for (const key of sourcesToRefresh) {
        try {
            const result = await refreshSource(token, key);
            failed ||= reportRefresh(`source/${key}`, result);
        } catch (error) {
            failed = true;
            console.error(`✗ source/${key}: ${error.message}`);
        }
    }

    for (const alias of aliases) {
        try {
            const result = await refresh(token, 'repo', alias);
            failed ||= reportRefresh(`repo/${alias}`, result);
        } catch (error) {
            failed = true;
            console.error(`✗ repo/${alias}: ${error.message}`);
        }
    }

    const privateChanged = privateConfigChanged(before, after);
    const explicitPrivateRefresh = aliases.some((alias) => after.get(alias)?.private);
    if (options.summary || privateChanged || explicitPrivateRefresh) {
        try {
            const result = await refresh(token, 'summary');
            failed ||= reportRefresh('summary', result);
        } catch (error) {
            failed = true;
            console.error(`✗ summary: ${error.message}`);
        }
    }

    // A new non-GitHub source has no repository alias to target. The Worker
    // scheduler already knows which sources are new, invalidated, or due, so
    // this bounded pass handles PyPI/npm/Crates/Docker additions without a
    // full backfill. Sources already refreshed above are no longer due.
    let dueRefreshCompleted = false;
    try {
        const result = await refresh(token, 'due');
        dueRefreshCompleted = Boolean(result?.ok);
        failed ||= reportRefresh('due', result);
    } catch (error) {
        failed = true;
        console.error(`✗ due: ${error.message}`);
    }

    if (aliases.length === 0 && sourcesToRefresh.length === 0 && !options.summary && !privateChanged && dueRefreshCompleted) {
        console.log('No repository config changes detected; the incremental due pass handled any other new or due sources.');
    }

    if (failed) process.exitCode = 1;
}

main().catch((error) => {
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
});
