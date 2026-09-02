import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCalendar } from '../src/svg/calendar.js';
import { generateLangsBar } from '../src/svg/langs.js';

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
