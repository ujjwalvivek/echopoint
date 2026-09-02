import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCalendar } from '../src/svg/calendar.js';
import { generateLangsBar } from '../src/svg/langs.js';
import { generateProfileTelemetry } from '../src/svg/profile.js';

const weeksForYears = (count) => Array.from({ length: count * 52 }, (_, index) => ({
    contributionDays: [{
        date: new Date(Date.UTC(2020, 0, 5 + index * 7)).toISOString().slice(0, 10),
        contributionCount: index % 4,
    }],
}));

test('wraps all-time calendar weeks into readable year rows', () => {
    const svg = generateCalendar({ weeks: weeksForYears(2) }, { all: true });
    const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/);

    assert.ok(viewBox);
    assert.equal(Number(viewBox[1]), 773);
    assert.ok(Number(viewBox[2]) > 200);
    assert.match(svg, />2020<\/text>/);
    assert.match(svg, />2021<\/text>/);
});

test('sizes a selected calendar period to its actual weeks', () => {
    const svg = generateCalendar({ weeks: weeksForYears(1) }, { year: 2020 });
    const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/);

    assert.ok(viewBox);
    assert.equal(Number(viewBox[1]), 745);
    assert.equal(Number(viewBox[2]), 115);
    assert.doesNotMatch(svg, />2020<\/text>/);
});

test('centers language percentages in their cells', () => {
    const svg = generateLangsBar({ Rust: 100, Go: 50 });

    assert.match(svg, /x="132"[^>]*text-anchor="middle"[^>]*class="pct"/);
    assert.doesNotMatch(svg, /text-anchor="end"[^>]*class="pct"/);
});

test('composes profile telemetry into one aligned SVG surface', () => {
    const today = new Date().toISOString().slice(0, 10);
    const streakDays = Array.from({ length: 3 }, (_, index) => {
        const date = new Date(`${today}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() - (2 - index));
        return { date: date.toISOString().slice(0, 10), contributionCount: 4 };
    });
    const svg = generateProfileTelemetry({
        calendarGrid: {
            weeks: [{ contributionDays: streakDays }],
            totalContributions: 12,
            startDate: streakDays[0].date,
            endDate: today,
        },
        commits: [{ date: today, message: 'wire telemetry', sha: '123456789', additions: 4, deletions: 1 }],
        languages: { Rust: 100, JavaScript: 40 },
        sources: [{ alias: 'journey-engine', kind: 'npm', logo: 'npm', version: 'v8.8.8' }],
    }, {
        profileWidth: 860,
        profileGap: 16,
        profilePadding: 0,
        profileCommitLimit: 2,
        profileWindow: 6,
        limit: 13,
        px: 12,
        py: 12,
        bg: '#191a1f',
        border: '#5a616e',
        borderWidth: 2,
    });

    const viewBox = svg.match(/viewBox="0 0 (\d+) ([\d.]+)"/);
    assert.ok(viewBox);
    assert.equal(Number(viewBox[1]), 860);
    assert.ok(Number(viewBox[2]) < 1100);
    assert.match(svg, />CONTRIBUTIONS<\/text>/);
    assert.match(svg, /<rect x="0" y="0" width="86" height="3"[^>]*\/>\s*<text x="96" y="4" class="mastheadLabel">git:ujjwalvivek<\/text>/);
    assert.match(svg, />LATEST COMMITS<\/text>/);
    assert.match(svg, />LANGUAGE MIX<\/text>/);
    assert.match(svg, />journey-engine<\/text>/);
    assert.match(svg, /class="streakValue"[^>]*>3<\/text>/);
    assert.match(svg, /width="12\.00" height="12\.00" rx="0"/);
    assert.match(svg, /class="languageColumnRule"/);
    assert.match(svg, /<title>Profile telemetry<\/title>/);

    const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(ids.length, new Set(ids).size);
    assert.equal(ids.length, 0);
});

test('keeps profile language and source accents inside the supplied palette', () => {
    const svg = generateProfileTelemetry({
        calendarGrid: { weeks: [], totalContributions: 0 },
        languages: {
            Rust: 100,
            TypeScript: 90,
            JavaScript: 80,
            Go: 70,
            CSS: 60,
            Shell: 50,
            Python: 40,
            HTML: 30,
        },
        sources: [{ alias: 'pysitegen', kind: 'python', logo: 'python', version: 'v1.2.1' }],
    }, {
        profileWidth: 860,
        color1: '#102030',
        color2: '#203040',
        color3: '#304050',
        color4: '#405060',
        color5: '#506070',
        color6: '#607080',
        monochrome: true,
    });

    assert.match(svg, /fill="#102030"/);
    assert.match(svg, /fill="#405060"/);
    assert.doesNotMatch(svg, /fill="#f1e05a"/);
    assert.doesNotMatch(svg, /fill="#3775a9"/);
});

test('uses the Rosé Pine palette for an unconfigured profile', () => {
    const svg = generateProfileTelemetry({
        calendarGrid: { weeks: [], totalContributions: 0 },
        languages: { Rust: 100, JavaScript: 50 },
    });

    assert.match(svg, /fill="#191724"/);
    assert.match(svg, /fill="#9ccfd8"/);
    assert.doesNotMatch(svg, /#39d353/i);
});
