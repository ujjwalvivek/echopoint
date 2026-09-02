import test from 'node:test';
import assert from 'node:assert/strict';
import {
    mergeContributionCalendars,
    mergePrivateLanguageData,
    normalizePrivateLanguageData,
    normalizeSummaryData,
} from '../src/contributions.js';

const calendar = (totalContributions, days) => ({
    totalContributions,
    weeks: [{ contributionDays: days }],
});

test('merges year calendars without double-counting boundary dates', () => {
    const user = {
        y2022: {
            totalCommitContributions: 4,
            totalPullRequestContributions: 2,
            contributionCalendar: calendar(6, [
                { date: '2022-12-31', contributionCount: 2, color: '#1' },
                { date: '2023-01-01', contributionCount: 1, color: '#1' },
            ]),
            restrictedContributionsCount: 1,
        },
        y2023: {
            totalCommitContributions: 3,
            totalPullRequestContributions: 1,
            contributionCalendar: calendar(4, [
                { date: '2023-01-01', contributionCount: 1, color: '#1' },
                { date: '2023-01-02', contributionCount: 3, color: '#2' },
            ]),
            restrictedContributionsCount: 2,
        },
    };

    const merged = mergeContributionCalendars(user, 2022, new Date('2023-01-03T12:00:00Z'));
    const days = merged.weeks.flatMap((week) => week.contributionDays);

    assert.equal(merged.totalContributions, 10);
    assert.equal(merged.restrictedContributionsCount, 3);
    assert.equal(merged.totalCommitContributions, 7);
    assert.equal(days.find((day) => day.date === '2023-01-01').contributionCount, 1);
    assert.equal(days.length, 368);
    assert.equal(days.find((day) => day.date === '2023-01-03').contributionCount, 0);
});

test('normalizes all-time metrics onto the cached summary', () => {
    const payload = {
        data: {
            user: {
                contributionsCollection: {
                    totalCommitContributions: 99,
                    contributionCalendar: { totalContributions: 99, weeks: [] },
                },
                y2020: {
                    totalCommitContributions: 7,
                    contributionCalendar: calendar(7, [{ date: '2020-01-01', contributionCount: 7 }]),
                    restrictedContributionsCount: 2,
                },
            },
        },
    };

    normalizeSummaryData(payload, 2020, new Date('2020-01-02T12:00:00Z'));
    assert.equal(payload.data.user.allTime.totalCommitContributions, 7);
    assert.equal(payload.data.user.contributionsCollection.totalCommitContributions, 7);
    assert.equal(payload.data.user.contributionsCollection.contributionCalendar.totalContributions, 7);
    assert.equal(payload.data.user.contributionsCollection.restrictedContributionsCount, 2);
});

test('normalizes and paginates private language totals', () => {
    const first = normalizePrivateLanguageData({
        data: {
            user: {
                repositories: {
                    totalCount: 2,
                    pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
                    nodes: [{ languages: { edges: [{ size: 10, node: { name: 'Rust' } }] } }],
                },
            },
        },
    });
    const second = normalizePrivateLanguageData({
        data: {
            user: {
                repositories: {
                    totalCount: 2,
                    pageInfo: { hasNextPage: false, endCursor: null },
                    nodes: [{ languages: { edges: [{ size: 5, node: { name: 'Rust' } }, { size: 3, node: { name: 'Go' } }] } }],
                },
            },
        },
    });

    assert.deepEqual(mergePrivateLanguageData(first, null, false).languages, { Rust: 10 });
    assert.deepEqual(mergePrivateLanguageData(second, first, true).languages, { Rust: 15, Go: 3 });
    assert.equal(second.complete, true);
});

test('filters private languages to configured repositories', () => {
    const filtered = normalizePrivateLanguageData({
        data: {
            user: {
                repositories: {
                    totalCount: 2,
                    pageInfo: { hasNextPage: false, endCursor: null },
                    nodes: [
                        {
                            nameWithOwner: 'ujjwalvivek/allowed',
                            languages: { edges: [{ size: 10, node: { name: 'Rust' } }] },
                        },
                        {
                            nameWithOwner: 'someone-else/unconfigured',
                            languages: { edges: [{ size: 999, node: { name: 'C++' } }] },
                        },
                    ],
                },
            },
        },
    }, ['ujjwalvivek/allowed']);

    assert.deepEqual(filtered.languages, { Rust: 10 });
    assert.equal(filtered.repositories, 1);
});
