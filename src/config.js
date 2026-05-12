export const CONFIG = {
    tenant: "default",
    github: {
        owner: "ujjwalvivek",
        startYear: 2016,
        repos: [
            {
                alias: "portfolio",
                owner: "ujjwalvivek",
                name: "portfolio",
                tracked: true,
            },
            {
                alias: "journey",
                owner: "ujjwalvivek",
                name: "journey",
                tracked: true,
            },
            {
                alias: "synclippy",
                owner: "ujjwalvivek",
                name: "synclippy",
                tracked: true,
            },
            {
                alias: "requiem",
                owner: "ujjwalvivek",
                name: "requiem",
                tracked: true,
            },
            {
                alias: "dino-blink",
                owner: "ujjwalvivek",
                name: "dino-blink",
                tracked: true,
            },
            {
                alias: "echopoint",
                owner: "ujjwalvivek",
                name: "echopoint",
                tracked: true,
            },
            {
                alias: "substrate",
                owner: "ujjwalvivek",
                name: "substrate",
                tracked: true,
            },
            {
                alias: "baremetal",
                owner: "ujjwalvivek",
                name: "baremetal",
                tracked: true,
            },
        ],
    },
    npm: [
        { alias: "journey-engine", package: "@ujjwalvivek/journey-engine" },
        { alias: "dino-blink", package: "@ujjwalvivek/dino-blink" },
        { alias: "requiem", package: "@ujjwalvivek/requiem" },
    ],
    crates: [{ alias: "journey-engine", crate: "journey-engine" }],
    docker: [
        {
            alias: "synclippy",
            namespace: "ujjwalvivek",
            repository: "synclippy",
        },
    ],
    refresh: {
        commitEnrichment: {
            enabled: true,
            limit: 5,
        },
    },
};

export function getTrackedGitHubRepos(config = CONFIG) {
    return config.github.repos.filter((repo) => repo.tracked !== false);
}

export function resolveGitHubRepo(rawRepo, config = CONFIG) {
    if (!rawRepo || typeof rawRepo !== "string") return null;

    const value = rawRepo.trim();
    if (!value) return null;

    return (
        getTrackedGitHubRepos(config).find(
            (repo) =>
                value === repo.alias ||
                value === repo.name ||
                value === `${repo.owner}/${repo.name}`,
        ) || null
    );
}

export function publicConfig(config = CONFIG) {
    return {
        tenant: config.tenant,
        github: {
            owner: config.github.owner,
            startYear: config.github.startYear,
            repos: config.github.repos.map((repo) => ({
                alias: repo.alias,
                owner: repo.owner,
                name: repo.name,
                tracked: repo.tracked !== false,
            })),
        },
        npm: config.npm.map((pkg) => ({
            alias: pkg.alias,
            package: pkg.package,
        })),
        crates: config.crates.map((crate) => ({
            alias: crate.alias,
            crate: crate.crate,
        })),
        docker: config.docker.map((image) => ({
            alias: image.alias,
            namespace: image.namespace,
            repository: image.repository,
        })),
        refresh: {
            commitEnrichment: {
                enabled: config.refresh.commitEnrichment.enabled,
                limit: config.refresh.commitEnrichment.limit,
            },
        },
    };
}
