import { languageDisplayGroups } from '../language-display.js';
import { escapeXml, FONT_FACE_MONO, FONT_STACK, ICONS } from './params.js';

// Rosé Pine is intentionally local to the profile composition. The existing
// standalone SVG endpoints keep their own defaults and visual contracts.
const ROSE_PINE = {
    base: '#191724',
    surface: '#1f1d2e',
    muted: '#6e6a86',
    subtle: '#908caa',
    text: '#e0def4',
    love: '#eb6f92',
    gold: '#f6c177',
    rose: '#ebbcba',
    pine: '#31748f',
    foam: '#9ccfd8',
    iris: '#c4a7e7',
    highlightLow: '#21202e',
    highlightMed: '#403d52',
};

const LANGUAGE_COLORS = {
    Rust: ROSE_PINE.rose,
    Go: ROSE_PINE.foam,
    TypeScript: ROSE_PINE.iris,
    JavaScript: ROSE_PINE.gold,
    HTML: ROSE_PINE.love,
    CSS: ROSE_PINE.iris,
    Python: ROSE_PINE.pine,
    Shell: ROSE_PINE.foam,
    Dockerfile: ROSE_PINE.pine,
    Makefile: ROSE_PINE.gold,
    C: ROSE_PINE.subtle,
    'C++': ROSE_PINE.rose,
    WGSL: ROSE_PINE.pine,
    Brainfuck: ROSE_PINE.iris,
};

const MUTED_COLORS = [ROSE_PINE.subtle, ROSE_PINE.muted, ROSE_PINE.highlightMed, ROSE_PINE.highlightLow];
const ROSE_PINE_LEVELS = [
    ROSE_PINE.highlightLow,
    ROSE_PINE.pine,
    '#4f8da0',
    '#78b0b9',
    ROSE_PINE.foam,
];

const REGISTRY_COLORS = {
    npm: ROSE_PINE.gold,
    rust: ROSE_PINE.rose,
    docker: ROSE_PINE.foam,
    python: ROSE_PINE.iris,
};

function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
    return numberValue(value).toLocaleString('en-US');
}

function dateKey(value) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value || '').slice(0, 10);
}

function dateAtUtc(value) {
    const key = dateKey(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const date = new Date(`${key}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnlyNow() {
    return new Date().toISOString().slice(0, 10);
}

function addDays(date, amount) {
    return new Date(date.getTime() + amount * 24 * 60 * 60 * 1000);
}

function previousDay(key) {
    const date = dateAtUtc(key);
    return date ? dateKey(addDays(date, -1)) : '';
}

function formatDate(value, includeYear = true) {
    const date = dateAtUtc(value);
    if (!date) return '—';
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(includeYear ? { year: 'numeric' } : {}),
        timeZone: 'UTC',
    });
}

function fitText(value, maxChars) {
    const text = String(value ?? '');
    if (text.length <= maxChars) return text;
    if (maxChars <= 1) return '…';
    return `${text.slice(0, maxChars - 1)}…`;
}

function iconSvg(name, x, y, size, fill) {
    const icon = ICONS[name];
    if (!icon) return '';
    return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 ${icon.vb}" aria-hidden="true"><path fill="${escapeXml(fill)}" d="${icon.d}"/></svg>`;
}

function colorsFor(opts) {
    const bg = opts.bg === 'none' ? 'transparent' : (opts.bg || ROSE_PINE.base);
    const panel = opts.badgeColor === 'none' ? bg : (opts.badgeColor || ROSE_PINE.surface);
    return {
        bg,
        panel,
        border: opts.border || ROSE_PINE.highlightMed,
        borderWidth: opts.borderWidth ?? 1,
        radius: opts.rx ?? 0,
        text: opts.textColor || ROSE_PINE.text,
        muted: opts.pctColor || ROSE_PINE.subtle,
        accent: opts.accentColor || ROSE_PINE.foam,
        line: opts.lineColor || opts.border || ROSE_PINE.highlightMed,
        positive: opts.positiveColor || ROSE_PINE.foam,
        negative: opts.negativeColor || ROSE_PINE.love,
    };
}

function surfaceRect(x, y, width, height, c, opacity = 1) {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${c.radius}" fill="${escapeXml(c.panel)}" fill-opacity="${opacity}" stroke="${escapeXml(c.border)}" stroke-width="${c.borderWidth}"/>`;
}

function sectionRule(label, detail, x, y, width, c) {
    const labelText = escapeXml(label.toUpperCase());
    const detailText = detail ? escapeXml(detail.toUpperCase()) : '';
    return `
  <text x="${x}" y="${y}" class="sectionLabel">${labelText}</text>
  ${detailText ? `<text x="${x + width}" y="${y}" text-anchor="end" class="sectionDetail">${detailText}</text>` : ''}
  <line x1="${x}" y1="${y + 8}" x2="${x + width}" y2="${y + 8}" class="rule"/>`;
}

function renderMetrics(metrics, x, y, width, c) {
    const items = [
        ['contributions', metrics.contributions],
        ['total commits', metrics.commits],
        ['pull requests', metrics.pullRequests],
        ['issues', metrics.issues],
    ];
    const height = 62;
    const cellWidth = width / items.length;
    let markup = `<g>${surfaceRect(x, y, width, height, c, 0.72)}`;

    items.forEach(([label, value], index) => {
        const cellX = x + index * cellWidth;
        if (index > 0) markup += `<line x1="${cellX}" y1="${y + 12}" x2="${cellX}" y2="${y + height - 12}" class="rule"/>`;
        markup += iconSvg('github', cellX + 14, y + 14, 13, c.muted);
        markup += `<text x="${cellX + 34}" y="${y + 24}" class="metricLabel">${escapeXml(label.toUpperCase())}</text>`;
        markup += `<text x="${cellX + 14}" y="${y + 50}" class="metricValue">${escapeXml(formatNumber(value))}</text>`;
    });

    return { markup: `${markup}</g>`, height };
}

function calendarWindow(calendarGrid, months) {
    const sourceWeeks = calendarGrid?.weeks || [];
    const sourceDays = sourceWeeks.flatMap((week) => week.contributionDays || []);
    const sourceDates = sourceDays.map((day) => dateAtUtc(day.date)).filter(Boolean);
    const configuredEnd = dateAtUtc(calendarGrid?.endDate);
    const latestSourceDate = sourceDates.reduce((latest, date) => date > latest ? date : latest, new Date(0));
    const now = dateAtUtc(dateOnlyNow());
    let end = configuredEnd || (latestSourceDate.getTime() > 0 ? latestSourceDate : now);
    if (now && end > now) end = now;

    const monthCount = Math.max(1, numberValue(months) || 6);
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (monthCount - 1), 1));
    const weeks = [];

    for (const week of sourceWeeks) {
        const days = new Map((week.contributionDays || []).map((day) => [dateKey(day.date), {
            date: dateKey(day.date),
            count: numberValue(day.contributionCount),
        }]));
        const firstDay = dateAtUtc(week.firstDay) || dateAtUtc([...days.keys()][0]);
        if (!firstDay) continue;
        const sunday = new Date(firstDay);
        sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
        const hasData = [...days.values()].some((day) => {
            const date = dateAtUtc(day.date);
            return date && date >= start && date <= end;
        });
        if (hasData) weeks.push({ sunday, days });
    }

    weeks.sort((a, b) => a.sunday - b.sunday);
    return { start, end, weeks };
}

function calendarLevel(count, opts) {
    const levels = [
        opts.level0 || ROSE_PINE_LEVELS[0],
        opts.level1 || ROSE_PINE_LEVELS[1],
        opts.level2 || ROSE_PINE_LEVELS[2],
        opts.level3 || ROSE_PINE_LEVELS[3],
        opts.level4 || ROSE_PINE_LEVELS[4],
    ];
    if (count <= 0) return opts.zeroColor || levels[0];
    if (count <= 3) return levels[1];
    if (count <= 7) return levels[2];
    if (count <= 12) return levels[3];
    return levels[4];
}

function renderCalendar(calendarGrid, x, y, width, opts, c) {
    const windowMonths = opts.profileWindow ?? opts.window ?? 8;
    const selected = calendarWindow(calendarGrid, windowMonths);
    const innerX = x + 18;
    const innerWidth = width - 36;
    const gridY = y + 49;
    const baseGap = 3;
    const columns = Math.max(1, selected.weeks.length);
    const naturalCell = (innerWidth - (columns - 1) * baseGap) / columns;
    const cell = Math.max(7, Math.min(12, naturalCell));
    // If a shorter window only needs a few columns, distribute the spare width as
    // gaps. If the window is longer, the cells shrink and the base gap wins.
    // Either way the grid reaches the inner right edge instead of floating in
    // empty space.
    const gap = columns > 1
        ? Math.max(0, (innerWidth - columns * cell) / (columns - 1))
        : 0;
    const cellRadius = opts.cellRx ?? 0;
    const gridHeight = 7 * cell + 6 * gap;
    // Keep a real legend row below the final week. At wider profile sizes the
    // cells reach their cap, so a fixed panel height would put LESS/MORE on
    // top of the seventh row.
    const panelHeight = Math.max(158, 49 + gridHeight + 24);
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    let markup = `<g>${surfaceRect(x, y, width, panelHeight, c, 0.48)}`;
    markup += `<text x="${innerX}" y="${y + 20}" class="panelTitle">CONTRIBUTIONS</text>`;
    markup += `<text x="${x + width - 18}" y="${y + 20}" text-anchor="end" class="panelMeta">${escapeXml(`${windowMonths} MONTHS`)}</text>`;

    if (selected.weeks.length === 0) {
        markup += `<text x="${x + width / 2}" y="${y + 91}" text-anchor="middle" class="emptyText">No calendar data</text></g>`;
        return { markup, height: panelHeight };
    }

    let previousMonth = -1;
    selected.weeks.forEach((week, column) => {
        // A window can begin in the middle of a week. Use the first day that
        // is actually inside the window, otherwise the leading Sunday can
        // add a misleading month label (for example MAR immediately before
        // the real APR start).
        const monthDay = [...week.days.values()]
            .map((day) => ({ day, date: dateAtUtc(day.date) }))
            .find(({ date }) => date && date >= selected.start && date <= selected.end);
        const month = monthDay?.date?.getUTCMonth() ?? week.sunday.getUTCMonth();
        if (month !== previousMonth) {
            markup += `<text x="${innerX + column * (cell + gap)}" y="${y + 40}" class="monthLabel">${monthNames[month]}</text>`;
            previousMonth = month;
        }
    });

    for (let column = 0; column < selected.weeks.length; column++) {
        const week = selected.weeks[column];
        for (let row = 0; row < 7; row++) {
            const date = addDays(week.sunday, row);
            const key = dateKey(date);
            const inRange = date >= selected.start && date <= selected.end;
            const day = week.days.get(key);
            const fill = inRange ? calendarLevel(day?.count || 0, opts) : c.bg;
            const opacity = inRange ? 1 : 0.22;
            const cellX = innerX + column * (cell + gap);
            const cellY = gridY + row * (cell + gap);
            markup += `<rect x="${cellX.toFixed(2)}" y="${cellY.toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" rx="${cellRadius}" fill="${escapeXml(fill)}" fill-opacity="${opacity}"><title>${escapeXml(`${key}: ${day?.count || 0} contributions`)}</title></rect>`;
        }
    }

    const legendX = x + width - 18;
    const legendY = y + panelHeight - 9;
    const legendColors = [
        opts.zeroColor || ROSE_PINE_LEVELS[0],
        opts.level1 || ROSE_PINE_LEVELS[1],
        opts.level2 || ROSE_PINE_LEVELS[2],
        opts.level3 || ROSE_PINE_LEVELS[3],
        opts.level4 || ROSE_PINE_LEVELS[4],
    ];
    const legendStep = 11;
    const legendStartX = legendX - 32 - legendColors.length * legendStep;
    legendColors.forEach((color, index) => {
        const legendCellX = legendStartX + index * legendStep;
        markup += `<rect x="${legendCellX}" y="${legendY - 8}" width="8" height="8" rx="0" fill="${escapeXml(color)}"/>`;
    });
    markup += `<text x="${x + 18}" y="${legendY}" class="panelMeta">LESS</text><text x="${legendX}" y="${legendY}" text-anchor="end" class="panelMeta">MORE</text>`;
    markup += '</g>';
    return { markup, height: panelHeight };
}

function renderCommits(commits, x, y, width, height, opts, c) {
    const entries = (commits || []).slice(0, opts.profileCommitLimit ?? 3);
    const rowHeight = entries.length > 0 ? Math.min(45, (height - 48) / entries.length) : 0;
    const textWidth = Math.max(12, Math.floor((width - 54) / 6.5));
    let markup = `<g>${surfaceRect(x, y, width, height, c, 0.22)}`;
    markup += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + height}" stroke="${escapeXml(c.accent)}" stroke-width="2"/>`;
    markup += `<text x="${x + 18}" y="${y + 20}" class="panelTitle">LATEST COMMITS</text>`;
    markup += `<text x="${x + width - 16}" y="${y + 20}" text-anchor="end" class="panelMeta">${entries.length} SHOWN</text>`;

    if (entries.length === 0) {
        markup += `<text x="${x + 18}" y="${y + 72}" class="emptyText">No public commits in cache</text></g>`;
        return { markup, height };
    }

    entries.forEach((commit, index) => {
        const rowY = y + 36 + index * rowHeight;
        const message = fitText(commit.message || 'Updated code', textWidth);
        const date = formatDate(commit.date, false);
        const sha = commit.sha ? String(commit.sha).slice(0, 7) : '—';
        const additions = numberValue(commit.additions);
        const deletions = numberValue(commit.deletions);
        markup += `<rect x="${x + 18}" y="${rowY + 7}" width="7" height="7" rx="1" fill="${escapeXml(c.accent)}"/>`;
        if (index < entries.length - 1) {
            markup += `<line x1="${x + 21.5}" y1="${rowY + 14}" x2="${x + 21.5}" y2="${rowY + rowHeight + 5}" stroke="${escapeXml(c.line)}" stroke-width="1"/>`;
        }
        markup += `<text x="${x + 36}" y="${rowY + 15}" class="commitMessage">${escapeXml(message)}</text>`;
        markup += `<text x="${x + 36}" y="${rowY + 31}" class="commitMeta">${escapeXml(`${date} · ${sha}`)} · <tspan fill="${escapeXml(c.positive)}">+${additions}</tspan> <tspan fill="${escapeXml(c.negative)}">-${deletions}</tspan></text>`;
    });

    markup += '</g>';
    return { markup, height };
}

function streakStats(calendarGrid) {
    const days = (calendarGrid?.weeks || [])
        .flatMap((week) => week.contributionDays || [])
        .map((day) => ({ date: dateKey(day.date), count: numberValue(day.contributionCount) }))
        .filter((day) => dateAtUtc(day.date))
        .sort((a, b) => a.date.localeCompare(b.date));
    const dayMap = new Map(days.map((day) => [day.date, day.count]));
    const today = dateOnlyNow();
    const lastDate = days.at(-1)?.date || today;
    let cursor = dayMap.has(today) ? today : lastDate;
    if (cursor === today && (dayMap.get(cursor) || 0) === 0) cursor = previousDay(cursor);
    const streakEnd = cursor;
    let current = 0;
    let streakStart = '';
    while (cursor && dayMap.has(cursor) && dayMap.get(cursor) > 0) {
        current++;
        streakStart = cursor;
        cursor = previousDay(cursor);
    }

    let longest = 0;
    let run = 0;
    for (const day of days) {
        if (day.count > 0) {
            run++;
            longest = Math.max(longest, run);
        } else {
            run = 0;
        }
    }

    const total = calendarGrid?.totalContributions ?? days.reduce((sum, day) => sum + day.count, 0);
    return {
        current,
        longest,
        total,
        streakStart,
        streakEnd,
        rangeStart: calendarGrid?.startDate || days[0]?.date,
        rangeEnd: calendarGrid?.endDate || days.at(-1)?.date,
    };
}

function renderStreak(calendarGrid, x, y, width, c, opts) {
    const stats = streakStats(calendarGrid);
    const height = 178;
    const center = x + width / 2;
    const currentColor = stats.current > 0 ? c.accent : c.negative;
    const streakRange = stats.current > 0
        ? `${formatDate(stats.streakStart)} — ${formatDate(stats.streakEnd)}`
        : 'No active streak';
    const totalRange = `${formatDate(stats.rangeStart)} — ${formatDate(stats.rangeEnd)}`;
    let markup = `<g>${surfaceRect(x, y, width, height, c, 0.48)}`;
    markup += `<text x="${x + 18}" y="${y + 21}" class="panelTitle">STREAK</text>`;
    markup += `<text x="${x + width - 18}" y="${y + 21}" text-anchor="end" class="panelMeta">ALL-TIME</text>`;
    markup += `<line x1="${center}" y1="${y + 35}" x2="${center}" y2="${y + 49}" class="rule"/>`;
    markup += iconSvg('fire', center - 9, y + 38, 18, currentColor);
    markup += `<text x="${center}" y="${y + 92}" text-anchor="middle" class="streakValue" fill="${escapeXml(currentColor)}">${escapeXml(formatNumber(stats.current))}</text>`;
    markup += `<text x="${center}" y="${y + 111}" text-anchor="middle" class="metricLabel">CONSECUTIVE DAYS</text>`;
    markup += `<text x="${center}" y="${y + 131}" text-anchor="middle" class="smallText">${escapeXml(streakRange)}</text>`;
    markup += `<line x1="${x + 18}" y1="${y + 145}" x2="${x + width - 18}" y2="${y + 145}" class="rule"/>`;
    markup += `<text x="${center}" y="${y + 162}" text-anchor="middle" class="smallText">${escapeXml(`all-time contributions · ${formatNumber(stats.total)}  /  longest run · ${formatNumber(stats.longest)} days`)}</text>`;
    markup += `<text x="${x + 18}" y="${y + 49}" class="metricLabel">RANGE</text>`;
    markup += `<text x="${x + 18}" y="${y + 68}" class="smallText">${escapeXml(totalRange)}</text>`;
    markup += `<text x="${x + width - 18}" y="${y + 49}" text-anchor="end" class="metricLabel">LONGEST</text>`;
    markup += `<text x="${x + width - 18}" y="${y + 68}" text-anchor="end" class="secondaryValue">${escapeXml(`${formatNumber(stats.longest)} days`)}</text>`;
    markup += '</g>';
    return { markup, height };
}

function languageEntries(languages, profile, limit) {
    const values = new Map(Object.entries(languages || {}).map(([name, bytes]) => [name.toLowerCase(), [name, numberValue(bytes)]]));
    const groups = languageDisplayGroups(languages || {}, profile);
    const output = [];
    for (const [title, names] of Object.entries(groups)) {
        const entries = names
            .map((name) => values.get(String(name).toLowerCase()))
            .filter(Boolean)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        const visible = entries.slice(0, limit).map(([name, bytes]) => ({ name, bytes }));
        const overflow = entries.slice(limit).reduce((sum, [, bytes]) => sum + bytes, 0);
        if (overflow > 0) visible.push({ name: 'Other', bytes: overflow });
        output.push({ title, entries: visible });
    }
    return output;
}

function configuredPalette(opts) {
    return [opts.color1, opts.color2, opts.color3, opts.color4, opts.color5, opts.color6].filter(Boolean);
}

function languageColor(name, index, opts, c) {
    if (name === 'Other') return c.muted;
    const palette = configuredPalette(opts);
    // A profile palette is a visual system, not a six-item language limit.
    // Cycle it so later entries cannot silently fall back to GitHub's default
    // language colours and break the surface's visual hierarchy.
    if (palette.length > 0) return palette[index % palette.length];
    if (opts.monochrome) return MUTED_COLORS[index % MUTED_COLORS.length];
    return LANGUAGE_COLORS[name] || MUTED_COLORS[index % MUTED_COLORS.length];
}

function renderLanguages(languages, x, y, width, opts, profile, c) {
    const limit = Math.max(1, numberValue(opts.limit ?? 13) || 13);
    const sections = languageEntries(languages, profile, limit);
    const total = Object.values(languages || {}).reduce((sum, bytes) => sum + numberValue(bytes), 0);
    const innerX = x + 14;
    const innerWidth = width - 28;
    const barY = y + 30;
    const barHeight = 8;
    const rowHeight = 20;
    // Keep each heading close to its own rows, then give the following
    // section a visibly separate breathing space after the table rule.
    const sectionGap = 20;
    const sectionHeader = 8;
    const rowsPerSection = sections.map((section) => Math.max(1, Math.ceil(section.entries.length / 2)));
    const height = 52 + rowsPerSection.reduce((sum, rows) => sum + sectionHeader + rows * rowHeight + sectionGap, 0) + 4;
    const cellWidth = innerWidth / 2;
    const columnInset = 8;
    let markup = `<g>${surfaceRect(x, y, width, height, c, 0.48)}`;
    markup += `<text x="${innerX}" y="${y + 20}" class="panelTitle">LANGUAGE MIX</text>`;
    markup += `<text x="${x + width - 14}" y="${y + 20}" text-anchor="end" class="panelMeta">${escapeXml(`${Object.keys(languages || {}).length} DETECTED`)}</text>`;

    // The segmented bar is written in its own pass so the x coordinate is
    // cumulative while the rows below remain grouped by presentation class.
    let barX = innerX;
    let colorIndex = 0;
    for (const section of sections) {
        for (const entry of section.entries) {
            const segmentWidth = total > 0 ? (entry.bytes / total) * innerWidth : 0;
            markup += `<rect x="${barX.toFixed(2)}" y="${barY}" width="${segmentWidth.toFixed(2)}" height="${barHeight}" fill="${escapeXml(languageColor(entry.name, colorIndex, opts, c))}"/>`;
            barX += segmentWidth;
            colorIndex++;
        }
    }

    let cursor = y + 53;
    colorIndex = 0;
    for (const section of sections) {
        markup += `<text x="${innerX}" y="${cursor}" class="sectionLabel">${escapeXml(section.title.toUpperCase())}</text>`;
        cursor += sectionHeader;
        const rows = Math.max(1, Math.ceil(section.entries.length / 2));
        const tableBottom = cursor + rows * rowHeight;
        markup += `<line x1="${(innerX + cellWidth).toFixed(2)}" y1="${cursor}" x2="${(innerX + cellWidth).toFixed(2)}" y2="${tableBottom}" class="languageColumnRule"/>`;
        for (let row = 0; row < rows; row++) {
            const rowY = cursor + row * rowHeight;
            markup += `<line x1="${innerX}" y1="${rowY + rowHeight}" x2="${innerX + innerWidth}" y2="${rowY + rowHeight}" class="softRule"/>`;
            if (section.entries.length === 0) {
                markup += `<text x="${innerX + 4}" y="${rowY + 14}" class="emptyText">—</text>`;
                continue;
            }
            for (let column = 0; column < 2; column++) {
                const entry = section.entries[row * 2 + column];
                const cellX = innerX + column * cellWidth;
                if (!entry) continue;
                const contentX = cellX + (column === 1 ? columnInset : 0);
                const contentWidth = cellWidth - columnInset;
                const pctWidth = Math.min(44, contentWidth * 0.33);
                const nameLimit = Math.max(5, Math.floor((contentWidth - pctWidth - 28) / 6));
                const percentage = total > 0 ? `${((entry.bytes / total) * 100).toFixed(1)}%` : '0.0%';
                markup += `<circle cx="${contentX + 4}" cy="${rowY + 10}" r="3" fill="${escapeXml(languageColor(entry.name, colorIndex, opts, c))}"/>`;
                markup += `<text x="${contentX + 12}" y="${rowY + 14}" class="languageName">${escapeXml(fitText(entry.name, nameLimit))}</text>`;
                markup += `<line x1="${contentX + contentWidth - pctWidth}" y1="${rowY + 2}" x2="${contentX + contentWidth - pctWidth}" y2="${rowY + rowHeight - 2}" class="softRule"/>`;
                markup += `<text x="${contentX + contentWidth - pctWidth / 2}" y="${rowY + 14}" text-anchor="middle" class="languagePct">${percentage}</text>`;
                colorIndex++;
            }
        }
        cursor += rows * rowHeight + sectionGap;
    }

    markup += '</g>';
    return { markup, height };
}

function sourceKind(source) {
    return source.kind || source.logo || 'package';
}

function sourceColor(source, opts, c) {
    const kind = sourceKind(source);
    const palette = configuredPalette(opts);
    const paletteIndex = { rust: 0, npm: 2, docker: 4, python: 3 }[kind];
    if (palette.length > 0 && paletteIndex !== undefined) return palette[paletteIndex % palette.length];
    return opts[`source${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}Color`]
        || REGISTRY_COLORS[kind]
        || c.accent;
}

function sourceChip(source, x, y, height, opts, c) {
    const alias = String(source.alias || 'source');
    const version = String(source.version || ':');
    const icon = sourceKind(source);
    const iconSize = 12;
    const aliasWidth = Math.max(44, Math.min(142, fitText(alias, 22).length * 6.1));
    const versionWidth = Math.max(24, Math.min(66, fitText(version, 10).length * 6.1));
    const width = 19 + aliasWidth + 14 + versionWidth;
    const accent = sourceColor(source, opts, c);
    let markup = `<g><title>${escapeXml(`${alias} ${version}`)}</title>`;
    markup += `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${c.radius}" fill="${escapeXml(c.panel)}" stroke="${escapeXml(c.border)}" stroke-width="${c.borderWidth}"/>`;
    markup += `<rect x="${x}" y="${y}" width="3" height="${height}" fill="${escapeXml(accent)}"/>`;
    markup += iconSvg(icon, x + 9, y + (height - iconSize) / 2, iconSize, c.text);
    markup += `<text x="${x + 27}" y="${y + 16}" class="sourceName">${escapeXml(fitText(alias, 22))}</text>`;
    markup += `<line x1="${x + 19 + aliasWidth + 3}" y1="${y + 5}" x2="${x + 19 + aliasWidth + 3}" y2="${y + height - 5}" class="softRule"/>`;
    markup += `<text x="${x + 19 + aliasWidth + 10 + versionWidth / 2}" y="${y + 16}" text-anchor="middle" class="sourceVersion">${escapeXml(fitText(version, 10))}</text>`;
    markup += '</g>';
    return { markup, width };
}

function renderSources(sources, x, y, width, opts, c) {
    const entries = Array.isArray(sources) ? sources : [];
    const chipHeight = 25;
    const gap = 6;
    let cursorX = x;
    let cursorY = y + 22;
    let rowHeight = chipHeight;
    let markup = '';

    for (const source of entries) {
        const chip = sourceChip(source, cursorX, cursorY, chipHeight, opts, c);
        if (cursorX > x && cursorX + chip.width > x + width) {
            cursorX = x;
            cursorY += rowHeight + gap;
            rowHeight = chipHeight;
        }
        const placed = sourceChip(source, cursorX, cursorY, chipHeight, opts, c);
        markup += placed.markup;
        cursorX += placed.width + gap;
    }

    const bottom = entries.length > 0 ? cursorY + chipHeight : y + 22;
    return { markup, bottom };
}

/**
 * Render the profile telemetry surface from data, rather than embedding the
 * individual SVG cards. The profile is intentionally its own composition:
 * each component gets dimensions that suit its information density.
 */
export function generateProfileTelemetry({ calendarGrid, commits, languages, metrics = {}, sources = [] }, opts = {}, languageProfile = {}) {
    const width = opts.profileWidth ?? 860;
    const padding = opts.profilePadding ?? 20;
    const gap = opts.profileGap ?? 18;
    const contentWidth = Math.max(320, width - padding * 2);
    const c = colorsFor(opts);
    const blocks = [];
    let cursor = padding;

    const mastheadWidth = Math.min(contentWidth, 190);
    const mastheadLabel = 'git:ujjwalvivek';
    const mastheadLineWidth = 86;
    const mastheadLabelStart = padding + mastheadLineWidth + 10;
    blocks.push(`<rect x="${padding}" y="${padding}" width="${Math.min(mastheadLineWidth, mastheadWidth)}" height="3" fill="${escapeXml(c.accent)}"/>`);
    blocks.push(`<text x="${mastheadLabelStart}" y="${padding + 4}" class="mastheadLabel">${mastheadLabel}</text>`);
    const metricY = cursor + 14;
    const metricsBlock = renderMetrics(metrics, padding, metricY, contentWidth, c);
    blocks.push(metricsBlock.markup);
    cursor = metricY + metricsBlock.height;

    cursor += 27;
    blocks.push(sectionRule('Streak', 'all-time run', padding, cursor, contentWidth, c));
    const streakY = cursor + 18;
    const streak = renderStreak(calendarGrid, padding, streakY, contentWidth, c, opts);
    blocks.push(streak.markup);
    cursor = streakY + streak.height;

    cursor += 28;
    blocks.push(sectionRule('Activity', `last ${opts.profileWindow ?? opts.window ?? 8} months`, padding, cursor, contentWidth, c));
    const activityY = cursor + 18;
    const activityWidth = contentWidth;
    const calendarWidth = Math.floor((activityWidth - gap) * 0.64);
    const commitsWidth = activityWidth - gap - calendarWidth;
    const calendar = renderCalendar(calendarGrid, padding, activityY, calendarWidth, opts, c);
    const commitsBlock = renderCommits(commits, padding + calendarWidth + gap, activityY, commitsWidth, calendar.height, opts, c);
    blocks.push(calendar.markup, commitsBlock.markup);
    cursor = activityY + calendar.height;

    cursor += 28;
    blocks.push(sectionRule('Language mix', `${Object.keys(languages || {}).length} detected`, padding, cursor, contentWidth, c));
    const languageY = cursor + 18;
    const language = renderLanguages(languages, padding, languageY, contentWidth, opts, languageProfile, c);
    blocks.push(language.markup);
    cursor = languageY + language.height;

    if (opts.profileSources !== false) {
        cursor += 28;
        blocks.push(sectionRule('Sources', 'versioned cache', padding, cursor, contentWidth, c));
        const sourceBlock = renderSources(sources, padding, cursor, contentWidth, opts, c);
        blocks.push(sourceBlock.markup);
        cursor = sourceBlock.bottom;
    }

    const height = cursor + padding + 1;
    const background = c.bg === 'transparent'
        ? `<rect width="${width}" height="${height}" rx="${c.radius}" fill="none" stroke="${escapeXml(c.border)}" stroke-width="${c.borderWidth}"/>`
        : `<rect width="${width}" height="${height}" rx="${c.radius}" fill="${escapeXml(c.bg)}" stroke="${escapeXml(c.border)}" stroke-width="${c.borderWidth}"/>`;
    const size = opts.responsive ? 'width="100%" height="auto"' : `width="${width}" height="${height.toFixed(2)}"`;

    return `
<svg ${size} viewBox="0 0 ${width} ${height.toFixed(2)}" xmlns="http://www.w3.org/2000/svg">
  <title>Profile telemetry</title>
  <style>
    ${FONT_FACE_MONO}
    .sectionLabel { font-family: ${FONT_STACK}; font-size: 10px; font-weight: 700; letter-spacing: 1px; fill: ${escapeXml(c.text)}; }
    .sectionDetail, .panelMeta, .monthLabel, .metricLabel, .smallText, .commitMeta, .sourceVersion, .languagePct { font-family: ${FONT_STACK}; font-size: 9px; fill: ${escapeXml(c.muted)}; }
    .rule { stroke: ${escapeXml(c.line)}; stroke-width: 1; stroke-opacity: 0.72; }
    .softRule { stroke: ${escapeXml(c.line)}; stroke-width: 1; stroke-opacity: 0.38; }
    .metricValue { font-family: ${FONT_STACK}; font-size: 22px; font-weight: 700; fill: ${escapeXml(c.text)}; }
    .panelTitle { font-family: ${FONT_STACK}; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; fill: ${escapeXml(c.text)}; }
    .emptyText { font-family: ${FONT_STACK}; font-size: 10px; fill: ${escapeXml(c.muted)}; }
    .commitMessage { font-family: ${FONT_STACK}; font-size: 11px; font-weight: 500; fill: ${escapeXml(c.text)}; }
    .streakValue { font-family: ${FONT_STACK}; font-size: 42px; font-weight: 700; }
    .secondaryValue { font-family: ${FONT_STACK}; font-size: 20px; font-weight: 700; fill: ${escapeXml(c.text)}; }
    .languageName, .sourceName { font-family: ${FONT_STACK}; font-size: 10px; fill: ${escapeXml(c.text)}; }
    .languageColumnRule { stroke: ${escapeXml(c.line)}; stroke-width: 1; stroke-opacity: 0.38; }
    .mastheadLabel { font-family: ${FONT_STACK}; font-size: 9px; font-weight: 700; letter-spacing: 0.4px; fill: ${escapeXml(c.accent)}; }
  </style>
  ${background}
  ${blocks.join('\n  ')}
</svg>`.trim();
}
