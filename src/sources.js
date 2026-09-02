import { CONFIG, getStatusChecks, getTrackedGitHubRepos, isPrivateGitHubRepo } from './config.js';
import { mergePrivateLanguageData, normalizePrivateLanguageData, normalizeSummaryData } from './contributions.js';

const gh = (path) => `https://api.github.com${path}`;
const HOUR = 60 * 60;
const DAY = 24 * HOUR;

// Bump this only when a transform changes the meaning/shape of cached data.
// URL/body/config changes are included automatically in the source signature.
export const SOURCE_SCHEMA_VERSION = '2026-09-02-v3';

const REFRESH = {
    summary: 2 * HOUR,
    privateLanguages: 12 * HOUR,
    repository: 12 * HOUR,
    release: 12 * HOUR,
    releases: DAY,
    commits: 6 * HOUR,
    commitCount: DAY,
    contributors: 7 * DAY,
    tags: 7 * DAY,
    deployments: 12 * HOUR,
    languages: 12 * HOUR,
    user: 7 * DAY,
    package: DAY,
    crate: DAY,
    docker: 12 * HOUR,
    pypi: DAY,
    status: 2 * HOUR,
};

function scheduled(source, priority, refreshEvery) {
    return {
        ...source,
        priority,
        refreshEvery,
        schemaVersion: SOURCE_SCHEMA_VERSION,
    };
}

function githubRepoSources(repoConfig) {
    const { alias, owner, name } = repoConfig;
    const prefix = `github:${alias}`;
    const base = `/repos/${owner}/${name}`;

    return [
        scheduled({ key: `${prefix}:repo`, url: gh(base), auth: 'github' }, 75, REFRESH.repository),
        scheduled({ key: `${prefix}:release`, url: gh(`${base}/releases/latest`), auth: 'github' }, 55, REFRESH.release),
        scheduled({ key: `${prefix}:releases`, url: gh(`${base}/releases?per_page=5`), auth: 'github' }, 45, REFRESH.releases),
        scheduled({
            key: `${prefix}:commits`, url: gh(`${base}/commits?per_page=5`), auth: 'github',
            cost: CONFIG.refresh.commitEnrichment.enabled ? 1 + CONFIG.refresh.commitEnrichment.limit : 1,
            transform: (commits, env) => enrichCommits(commits, env, CONFIG.refresh.commitEnrichment)
        }, 85, REFRESH.commits),
        scheduled({
            key: `${prefix}:commit_count`, url: gh(`${base}/commits?per_page=1`), auth: 'github',
            transform: (commits, _env, res) => commitCountFromResponse(commits, res)
        }, 25, REFRESH.commitCount),
        scheduled({ key: `${prefix}:contributors`, url: gh(`${base}/contributors?per_page=10`), auth: 'github' }, 15, REFRESH.contributors),
        scheduled({ key: `${prefix}:tags`, url: gh(`${base}/tags?per_page=5`), auth: 'github' }, 15, REFRESH.tags),
        scheduled({ key: `${prefix}:deployments`, url: gh(`${base}/deployments?per_page=5`), auth: 'github' }, 35, REFRESH.deployments),
        scheduled({ key: `${prefix}:langs`, url: gh(`${base}/languages`), auth: 'github' }, 90, REFRESH.languages),
    ];
}

function commitCountFromResponse(commits, res) {
    const link = res.headers.get('Link') || '';
    const lastLink = link.split(',').find((part) => part.includes('rel="last"')) || '';
    const lastPage = lastLink.match(/[?&]page=(\d+)/)?.[1];
    if (lastPage) {
        return { total: Number(lastPage) };
    }
    return { total: Array.isArray(commits) ? commits.length : 0 };
}

async function enrichCommits(commits, env, options) {
    if (!Array.isArray(commits)) return commits;
    if (!options.enabled) return commits;

    const enriched = await Promise.all(
        commits.slice(0, options.limit).map(async (commit) => {
            try {
                const res = await fetch(commit.url, {
                    headers: githubHeaders(env),
                });
                const detail = await res.json();
                return {
                    sha: commit.sha,
                    message: commit.commit.message.split('\n')[0],
                    url: commit.html_url,
                    author: commit.commit.author?.name,
                    date: commit.commit.author?.date,
                    additions: detail.stats?.additions || 0,
                    deletions: detail.stats?.deletions || 0,
                };
            } catch {
                return {
                    sha: commit.sha,
                    message: commit.commit.message.split('\n')[0],
                    url: commit.html_url,
                    author: commit.commit.author?.name,
                    date: commit.commit.author?.date,
                    additions: 0,
                    deletions: 0,
                };
            }
        })
    );
    return enriched;
}

export function buildSummaryQuery(login = CONFIG.github.owner, startYear = CONFIG.github.startYear) {
    const currentYear = new Date().getUTCFullYear();
    const yearAliases = [];
    for (let y = startYear; y <= currentYear; y++) {
        yearAliases.push(`y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      totalRepositoryContributions
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            contributionCount
            date
            color
          }
        }
      }
    }`);
    }

    return JSON.stringify({
        query: `
query userInfo($login: String!) {
  user(login: $login) {
    name
    login
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      totalRepositoryContributions
      totalRepositoriesWithContributedIssues
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
      }
    }
    ${yearAliases.join('\n    ')}
  }
}
            `,
        variables: { login }
    });
}

export function buildPrivateLanguagesQuery(login = CONFIG.github.owner, after = null) {
    return JSON.stringify({
        query: `
query privateLanguages($login: String!, $after: String) {
  user(login: $login) {
    repositories(
      first: 100
      after: $after
      affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
      privacy: PRIVATE
    ) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        nameWithOwner
        languages(first: 100, orderBy: { field: SIZE, direction: DESC }) {
          edges {
            size
            node {
              name
            }
          }
        }
      }
    }
  }
}
        `,
        variables: { login, after },
    });
}

const CONFIGURED_PRIVATE_REPOSITORIES = getTrackedGitHubRepos(CONFIG)
    .filter((repo) => isPrivateGitHubRepo(repo))
    .map((repo) => `${repo.owner}/${repo.name}`);

export function githubHeaders(env) {
    const headers = {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'echopoint-collector',
        'X-GitHub-Api-Version': '2022-11-28',
    };
    if (env.GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`;
    }
    return headers;
}

export function normalizePyPiData(data, fallbackName = null) {
    const info = data?.info || {};
    return {
        name: info.name || fallbackName,
        version: info.version || null,
        summary: info.summary || null,
        requires_python: info.requires_python || null,
        license: info.license || null,
        home_page: info.home_page || info.project_url || null,
    };
}

export const SOURCES = [
    //? repos
    ...getTrackedGitHubRepos(CONFIG).flatMap(githubRepoSources),

    //? One owner lookup is enough; the old implementation fetched this
    //? identical endpoint once for every configured repository.
    scheduled({
        key: `github:${CONFIG.github.owner}:user`,
        url: gh(`/users/${CONFIG.github.owner}`),
        auth: 'github',
    }, 10, REFRESH.user),

    //? npm
    ...CONFIG.npm.map((pkg) => scheduled({
        key: `npm:${pkg.alias}`,
        url: `https://registry.npmjs.org/${pkg.package}/latest`,
    }, 50, REFRESH.package)),

    //? crates.io
    ...CONFIG.crates.map((crate) => scheduled({
        key: `crates:${crate.alias}`,
        url: `https://crates.io/api/v1/crates/${crate.crate}`,
    }, 40, REFRESH.crate)),

    //? Docker Hub
    ...CONFIG.docker.map((image) => scheduled({
        key: `docker:${image.alias}:tags`,
        url: `https://hub.docker.com/v2/namespaces/${image.namespace}/repositories/${image.repository}/tags?page_size=10`,
    }, 40, REFRESH.docker)),

    //? PyPI
    ...CONFIG.pypi.map((pkg) => scheduled({
        key: `pypi:${pkg.alias}`,
        url: `https://pypi.org/pypi/${encodeURIComponent(pkg.package)}/json`,
        transform: (data) => normalizePyPiData(data, pkg.package),
        validate: (data) => Boolean(data?.info?.version),
    }, 50, REFRESH.pypi)),

    //? configured uptime/status checks
    ...getStatusChecks(CONFIG).map((check) => scheduled({
        key: `status:${check.alias}`,
        url: check.url || null,
        statusCheck: {
            alias: check.alias,
            label: check.label,
            kind: check.kind || 'http',
            expectStatus: check.expectStatus || 200,
        },
    }, check.kind === 'internal' ? 60 : 80, REFRESH.status)),

    //? Authenticated private-repository language totals. The response is
    //? reduced to totals before it reaches KV, so private repository names
    //? are never cached or exposed by the public store endpoint.
    scheduled({
        key: `github:private:${CONFIG.github.owner}:langs`,
        url: 'https://api.github.com/graphql',
        method: 'POST',
        auth: 'github',
        body: (_env, state = {}) => buildPrivateLanguagesQuery(CONFIG.github.owner, state.paginationCursor || null),
        transform: (data) => normalizePrivateLanguageData(data, CONFIGURED_PRIVATE_REPOSITORIES),
        merge: (page, previous, state) => mergePrivateLanguageData(page, previous, Boolean(state.paginationCursor)),
        paginated: true,
        paginateEvery: 2 * HOUR,
        validate: (data) => Boolean(data?.data?.user) && !data.errors?.length,
    }, 95, REFRESH.privateLanguages),

    //? GitHub GraphQL for User Stats
    scheduled({
        key: `github:${CONFIG.github.owner}:summary`,
        url: 'https://api.github.com/graphql',
        method: 'POST',
        auth: 'github',
        body: () => buildSummaryQuery(CONFIG.github.owner, CONFIG.github.startYear),
        transform: (data) => normalizeSummaryData(data, CONFIG.github.startYear),
        validate: (data) => Boolean(data?.data?.user) && !data.errors?.length,
    }, 100, REFRESH.summary)
];
