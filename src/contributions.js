const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnly(value) {
    return value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value).slice(0, 10);
}

function dateAtUtc(value) {
    return new Date(`${dateOnly(value)}T00:00:00Z`);
}

function addDays(date, amount) {
    return new Date(date.getTime() + amount * DAY_MS);
}

function numeric(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function dayWithCount(date, count = 0, color = '#161b22') {
    return {
        date,
        contributionCount: count,
        color,
    };
}

const ALL_TIME_METRICS = [
    'totalCommitContributions',
    'totalPullRequestContributions',
    'totalIssueContributions',
    'totalPullRequestReviewContributions',
    'totalRepositoryContributions',
];

/**
 * Merge the year-scoped GitHub contribution calendars into one continuous
 * calendar. GitHub's yearly ranges can contain partial weeks at their edges,
 * so dates are de-duplicated before weeks are rebuilt.
 */
export function mergeContributionCalendars(user, startYear, now = new Date()) {
    if (!user || !Number.isFinite(Number(startYear))) return null;

    const endYear = now.getUTCFullYear();
    const startDate = `${startYear}-01-01`;
    const endDate = dateOnly(now);
    const daysByDate = new Map();
    const metrics = Object.fromEntries(ALL_TIME_METRICS.map((metric) => [metric, 0]));
    let totalContributions = 0;
    let restrictedContributionsCount = 0;
    const availableYears = [];

    for (let year = Number(startYear); year <= endYear; year++) {
        const collection = user[`y${year}`];
        if (!collection) continue;

        availableYears.push(year);
        totalContributions += numeric(collection.contributionCalendar?.totalContributions);
        restrictedContributionsCount += numeric(collection.restrictedContributionsCount);

        for (const metric of ALL_TIME_METRICS) {
            metrics[metric] += numeric(collection[metric]);
        }

        for (const week of collection.contributionCalendar?.weeks || []) {
            for (const day of week.contributionDays || []) {
                const date = dateOnly(day.date);
                if (date < startDate || date > endDate) continue;

                const previous = daysByDate.get(date);
                // Adjacent year queries can expose the same edge date. It is
                // one contribution day, not two; keep the larger value when
                // GitHub returns the boundary twice.
                if (!previous || numeric(day.contributionCount) > numeric(previous.contributionCount)) {
                    daysByDate.set(date, {
                        date,
                        contributionCount: numeric(day.contributionCount),
                        color: day.color || previous?.color || '#161b22',
                    });
                }
            }
        }
    }

    if (availableYears.length === 0) return null;

    // Fill gaps so streak calculation cannot treat two non-adjacent API
    // entries as consecutive days.
    const firstDate = dateAtUtc(startDate);
    const lastDate = dateAtUtc(endDate);
    for (let cursor = firstDate; cursor <= lastDate; cursor = addDays(cursor, 1)) {
        const date = dateOnly(cursor);
        if (!daysByDate.has(date)) daysByDate.set(date, dayWithCount(date));
    }

    const sortedDays = [...daysByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    const weeksByFirstDay = new Map();
    for (const day of sortedDays) {
        const date = dateAtUtc(day.date);
        const firstDay = dateOnly(addDays(date, -date.getUTCDay()));
        if (!weeksByFirstDay.has(firstDay)) weeksByFirstDay.set(firstDay, []);
        weeksByFirstDay.get(firstDay).push(day);
    }

    const weeks = [...weeksByFirstDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([firstDay, contributionDays]) => ({ firstDay, contributionDays }));

    const dayTotal = sortedDays.reduce((sum, day) => sum + numeric(day.contributionCount), 0);
    return {
        totalContributions: totalContributions || dayTotal,
        restrictedContributionsCount,
        startDate,
        endDate,
        years: availableYears,
        weeks,
        ...metrics,
    };
}

export function normalizePrivateLanguageData(payload, allowedRepositories = null) {
    const repositories = payload?.data?.user?.repositories;
    const languages = {};
    const allowed = allowedRepositories
        ? new Set(allowedRepositories.map((repository) => String(repository).toLowerCase()))
        : null;
    const selectedRepositories = (repositories?.nodes || []).filter((repository) => {
        if (!allowed) return true;
        return allowed.has(String(repository.nameWithOwner || '').toLowerCase());
    });

    for (const repository of selectedRepositories) {
        for (const edge of repository.languages?.edges || []) {
            const name = edge.node?.name;
            if (!name) continue;
            languages[name] = (languages[name] || 0) + numeric(edge.size);
        }
    }

    return {
        languages,
        repositories: allowed ? selectedRepositories.length : (numeric(repositories?.totalCount) || (repositories?.nodes || []).length),
        complete: !repositories?.pageInfo?.hasNextPage,
        next_cursor: repositories?.pageInfo?.endCursor || null,
        updated_at: new Date().toISOString(),
    };
}

export function mergePrivateLanguageData(page, previous, append) {
    if (!append || !previous) return page;

    const languages = { ...(previous.languages || {}) };
    for (const [language, bytes] of Object.entries(page.languages || {})) {
        languages[language] = (languages[language] || 0) + numeric(bytes);
    }

    return {
        ...page,
        languages,
        repositories: numeric(previous.repositories) + numeric(page.repositories),
        next_cursor: page.next_cursor || null,
    };
}

/**
 * Add stable all-time fields to the GraphQL response before it is cached.
 * The calendar total already represents GitHub's contribution graph total;
 * restrictedContributionsCount is retained as a diagnostic and is not added a
 * second time, which would double-count private contributions when enabled.
 */
export function normalizeSummaryData(payload, startYear, now = new Date()) {
    const user = payload?.data?.user;
    if (!user) return payload;

    const allTime = mergeContributionCalendars(user, startYear, now);
    if (!allTime) return payload;

    const current = user.contributionsCollection || {};
    user.allTime = allTime;
    user.contributionsCollection = {
        ...current,
        ...Object.fromEntries(ALL_TIME_METRICS.map((metric) => [metric, allTime[metric]])),
        restrictedContributionsCount: allTime.restrictedContributionsCount,
        contributionCalendar: {
            ...current.contributionCalendar,
            ...allTime,
        },
    };

    return payload;
}

export function allTimeCalendar(user) {
    return user?.allTime?.weeks ? user.allTime : user?.contributionsCollection?.contributionCalendar;
}

export function allTimeLanguages(privateLanguageData) {
    return privateLanguageData?.languages || {};
}
