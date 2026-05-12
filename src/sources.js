import { CONFIG, getTrackedGitHubRepos } from './config.js';

const gh = (path) => `https://api.github.com${path}`;

function githubRepoSources(repoConfig) {
    const { alias, owner, name } = repoConfig;
    const prefix = `github:${alias}`;
    const base = `/repos/${owner}/${name}`;

    return [
        { key: `${prefix}:repo`, url: gh(base), auth: 'github' },
        { key: `${prefix}:release`, url: gh(`${base}/releases/latest`), auth: 'github' },
        { key: `${prefix}:releases`, url: gh(`${base}/releases?per_page=5`), auth: 'github' },
        {
            key: `${prefix}:commits`, url: gh(`${base}/commits?per_page=5`), auth: 'github',
            cost: CONFIG.refresh.commitEnrichment.enabled ? 1 + CONFIG.refresh.commitEnrichment.limit : 1,
            transform: (commits, env) => enrichCommits(commits, env, CONFIG.refresh.commitEnrichment)
        },
        { key: `${prefix}:contributors`, url: gh(`${base}/contributors?per_page=10`), auth: 'github' },
        { key: `${prefix}:tags`, url: gh(`${base}/tags?per_page=5`), auth: 'github' },
        { key: `${prefix}:deployments`, url: gh(`${base}/deployments?per_page=5`), auth: 'github' },
        { key: `${prefix}:langs`, url: gh(`${base}/languages`), auth: 'github' },
        { key: `${prefix}:user`, url: gh(`/users/${owner}`), auth: 'github' },
    ];
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
    const currentYear = new Date().getFullYear();
    const yearAliases = [];
    for (let y = startYear; y <= currentYear; y++) {
        yearAliases.push(`y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") { contributionCalendar { totalContributions } restrictedContributionsCount }`);
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
      totalRepositoriesWithContributedIssues
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
    }
    ${yearAliases.join('\n    ')}
  }
}
            `,
        variables: { login }
    });
}

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

export const SOURCES = [
    //? repos
    ...getTrackedGitHubRepos(CONFIG).flatMap(githubRepoSources),

    //? npm
    ...CONFIG.npm.map((pkg) => ({
        key: `npm:${pkg.alias}`,
        url: `https://registry.npmjs.org/${pkg.package}/latest`,
    })),

    //? crates.io
    ...CONFIG.crates.map((crate) => ({
        key: `crates:${crate.alias}`,
        url: `https://crates.io/api/v1/crates/${crate.crate}`,
    })),

    //? Docker Hub
    ...CONFIG.docker.map((image) => ({
        key: `docker:${image.alias}:tags`,
        url: `https://hub.docker.com/v2/namespaces/${image.namespace}/repositories/${image.repository}/tags?page_size=10`,
    })),

    //? GitHub GraphQL for User Stats
    {
        key: `github:${CONFIG.github.owner}:summary`,
        url: 'https://api.github.com/graphql',
        method: 'POST',
        auth: 'github',
        body: () => buildSummaryQuery(CONFIG.github.owner, CONFIG.github.startYear)
    }
];
