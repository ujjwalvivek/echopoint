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
            {
                alias: "devhub",
                owner: "ujjwalvivek",
                name: "devhub",
                tracked: true,
            },
            {
                alias: "ujjwalvivek",
                owner: "ujjwalvivek",
                name: "ujjwalvivek",
                tracked: true,
            },
            {
                alias: "thereckoning",
                owner: "ujjwalvivek",
                name: "thereckoning",
                tracked: true,
            },
            {
                alias: "root",
                owner: "ujjwalvivek",
                name: "root",
                tracked: true,
            },
            {
                alias: "pysitegen",
                owner: "ujjwalvivek",
                name: "pysitegen",
                tracked: true,
            },
            {
                alias: "easyapply",
                owner: "ujjwalvivek",
                name: "easyapply",
                tracked: true,
            },
            {
                alias: "tinyts",
                owner: "ujjwalvivek",
                name: "tinyts",
                tracked: true,
            },
            {
                alias: "gogs",
                owner: "ujjwalvivek",
                name: "gogs",
                tracked: true,
            },
            {
                alias: "greedysnek",
                owner: "ujjwalvivek",
                name: "greedysnek",
                tracked: true,
            },
            {
                alias: "unityCoordinationFramework",
                owner: "ujjwalvivek",
                name: "unityCoordinationFramework",
                tracked: true,
            },
            {
                alias: "loom",
                owner: "ujjwalvivek",
                name: "loom",
                tracked: true,
            },
            {
                alias: "svgmetro",
                owner: "ujjwalvivek",
                name: "svgmetro",
                tracked: true,
            },
            {
                alias: "devhub-gpui",
                owner: "ujjwalvivek",
                name: "devhub-gpui",
                tracked: true,
            },
            {
                alias: "chessengine",
                owner: "ujjwalvivek",
                name: "chessengine",
                tracked: true,
            },
            {
                alias: "kuki",
                owner: "ujjwalvivek",
                name: "kuki",
                tracked: true,
            },
            {
                alias: "llmeter",
                owner: "ujjwalvivek",
                name: "llmeter",
                tracked: true,
            },
            {
                alias: "woodpecker",
                owner: "ujjwalvivek",
                name: "woodpecker",
                tracked: true,
            },
            {
                alias: "cutubagi",
                owner: "ujjwalvivek",
                name: "cutubagi",
                tracked: true,
            },
            {
                alias: "pixess",
                owner: "ujjwalvivek",
                name: "pixess",
                tracked: true,
            },
            {
                alias: "stonkclimbracing",
                owner: "ujjwalvivek",
                name: "stonkclimbracing",
                tracked: true,
            },
            {
                alias: "mazerunner",
                owner: "ujjwalvivek",
                name: "mazerunner",
                tracked: true,
            },
            {
                alias: "bootsnaktor",
                owner: "ujjwalvivek",
                name: "bootsnaktor",
                tracked: true,
            },
            {
                alias: "gitedit",
                owner: "ujjwalvivek",
                name: "gitedit",
                tracked: true,
            },
            {
                alias: "rubis",
                owner: "ujjwalvivek",
                name: "rubis",
                tracked: true,
            },
            {
                alias: "tinybench",
                owner: "ujjwalvivek",
                name: "tinybench",
                tracked: true,
            },
            {
                alias: "helide",
                owner: "ujjwalvivek",
                name: "helide",
                tracked: true,
            },
            {
                alias: "r2go",
                owner: "ujjwalvivek",
                name: "r2go",
                tracked: true,
            },
            {
                alias: "voxelhalla",
                owner: "ujjwalvivek",
                name: "voxelhalla",
                tracked: true,
            },
            {
                alias: "8bitaxe",
                owner: "ujjwalvivek",
                name: "8bitaxe",
                tracked: true,
            },
            {
                alias: "echohub",
                owner: "ujjwalvivek",
                name: "echohub",
                tracked: true,
            },
        ],
    },
    npm: [
        { alias: "journey-engine", package: "@ujjwalvivek/journey-engine" },
        { alias: "dino-blink", package: "@ujjwalvivek/dino-blink" },
        { alias: "requiem", package: "@ujjwalvivek/requiem" },
        { alias: "tinyts", package: "@ujjwalvivek/tinyts" },
        { alias: "svgmetro", package: "@ujjwalvivek/svg-metro" },
    ],
    crates: [
        { alias: "journey-engine", crate: "journey-engine" },
        { alias: "journey-sound", crate: "journey-sound" },
        { alias: "journey-sequencer", crate: "journey-sequencer" },
    ],
    docker: [
        {
            alias: "synclippy",
            namespace: "ujjwalvivek",
            repository: "synclippy",
        },
    ],
    status: [
        {
            alias: "echopoint",
            label: "system status",
            kind: "internal",
            expectStatus: 200,
        },
        {
            alias: "site",
            label: "website",
            url: "https://ujjwalvivek.com",
            expectStatus: 200,
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

export function getStatusChecks(config = CONFIG) {
    return config.status || [];
}

export function resolveStatusCheck(rawTarget, config = CONFIG) {
    const checks = getStatusChecks(config);
    if (!rawTarget) return checks[0] || null;
    if (typeof rawTarget !== "string") return null;

    const value = rawTarget.trim();
    if (!value) return checks[0] || null;

    return checks.find((check) => value === check.alias) || null;
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
        status: getStatusChecks(config).map((check) => ({
            alias: check.alias,
            label: check.label,
            kind: check.kind || "http",
            expectStatus: check.expectStatus,
        })),
        refresh: {
            commitEnrichment: {
                enabled: config.refresh.commitEnrichment.enabled,
                limit: config.refresh.commitEnrichment.limit,
            },
        },
    };
}
