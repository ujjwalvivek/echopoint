import { escapeXml, FONT_FACE_MONO, FONT_STACK, THEME, errorSvg } from './params.js';

export function generateCalendar(calendarGrid, opts = {}) {
    if (!calendarGrid || !calendarGrid.weeks) return errorSvg('No calendar data');

    const bgRaw = opts.bg;
    const bg = bgRaw === 'none' ? 'transparent' : (bgRaw || THEME.bg);
    const labelFill = opts.textColor || THEME.textMuted;
    const borderColor = opts.border || THEME.border;
    const borderW = opts.borderWidth ?? 1;
    const rx = opts.rx ?? 0;
    const px = opts.px ?? 0;
    const py = opts.py ?? 0;

    //? overridable via level0–level4 params
    const levels = [
        opts.level0 || '#161b22',
        opts.level1 || '#0e4429',
        opts.level2 || '#006d32',
        opts.level3 || '#26a641',
        opts.level4 || '#39d353',
    ];

    const zeroColor = opts.zeroColor || levels[0];

    function levelColor(count) {
        if (count === 0) return zeroColor;
        if (count <= 3) return levels[1];
        if (count <= 7) return levels[2];
        if (count <= 12) return levels[3];
        return levels[4];
    }

    const cellSize = 11;
    const cellPad = 3;
    let weeks = calendarGrid.weeks;

    //? Date-window mode: show N months centred on today (default N=3 → prev, current, next)
    //? ytd mode: show Jan 1 → today of the current year
    //? year mode: show one historical calendar year
    //? all mode: show the full history, wrapped into one row per year
    let winStart = null;
    let winEnd = null;
    let totalColumns = weeks.length;

    const filterToRange = () => {
        weeks = weeks.filter(week =>
            week.contributionDays?.some(day => {
                const d = new Date(day.date);
                return d >= winStart && d <= winEnd;
            })
        );
        // Only reserve columns for weeks that are actually present. The old
        // fixed window width left a large blank area for the future part of a
        // current-year/window view.
        totalColumns = weeks.length;
    };

    if (opts.all) {
        // Keep the complete source calendar untouched for the wrapped layout.
    } else if (opts.year) {
        const year = Number(opts.year);
        const now = new Date();
        winStart = new Date(year, 0, 1);
        const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
        winEnd = year === now.getFullYear() ? now : yearEnd;
        filterToRange();
    } else if (opts.window) {
        const now = new Date();
        const half = Math.floor(opts.window / 2);
        winStart = new Date(now.getFullYear(), now.getMonth() - half, 1);
        const endMonth = now.getMonth() + (opts.window - half - 1);
        const requestedEnd = new Date(now.getFullYear(), endMonth + 1, 0, 23, 59, 59, 999);
        winEnd = requestedEnd > now ? now : requestedEnd;
        filterToRange();
    } else if (opts.ytd) {
        const now = new Date();
        winStart = new Date(now.getFullYear(), 0, 1);
        winEnd = now;
        filterToRange();
    } else {
        // A bare calendar URL should be useful as a badge. Full history is
        // still available with all=1, while streaks and summary remain
        // all-time by design.
        const now = new Date();
        winStart = new Date(now.getFullYear(), 0, 1);
        winEnd = now;
        filterToRange();
    }

    // A full-history calendar can contain hundreds of week columns. Keeping
    // those columns in one row makes a responsive SVG collapse into a thin
    // line, especially in the dashboard's narrow preview. Keep all history,
    // but wrap it into one heatmap row per year only when all=1 is explicit.
    // Normal period views remain compact single-row variants.
    const wrapByYear = opts.all === true;
    const yearRows = wrapByYear
        ? [...weeks.reduce((rows, week) => {
            const year = String(week.contributionDays?.[0]?.date || '').slice(0, 4);
            if (!year) return rows;
            if (!rows.has(year)) rows.set(year, []);
            rows.get(year).push(week);
            return rows;
        }, new Map())].map(([year, rowWeeks]) => ({ year, weeks: rowWeeks }))
        : [{ year: null, weeks }];

    const rowCount = Math.max(1, yearRows.length);
    const rowColumns = wrapByYear
        ? Math.max(1, ...yearRows.map(row => row.weeks.length))
        : Math.max(1, totalColumns);

    const gridWidth = rowColumns * (cellSize + cellPad) - cellPad;
    const gridHeight = 7 * cellSize + 6 * cellPad;

    const showYearLabels = wrapByYear && !opts.tight;
    const marginLeft = opts.tight ? 0 : 5 + (showYearLabels ? 28 : 0);
    const marginTop = opts.tight ? 14 : 20;
    const marginBottom = 0;
    const rowGap = wrapByYear ? (opts.tight ? 6 : 12) : 0;

    const innerW = gridWidth + marginLeft + (opts.tight ? 0 : 15);
    const innerH = (rowCount * gridHeight) + ((rowCount - 1) * rowGap) + marginTop + marginBottom;
    const totalWidth = innerW + px * 2;
    const totalHeight = innerH + py * 2;

    let rects = '';
    let monthLabels = '';
    let yearLabels = '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    yearRows.forEach((row, rowIndex) => {
        const rowTop = marginTop + rowIndex * (gridHeight + rowGap);
        let currX = marginLeft;
        let lastMonth = -1;

        if (showYearLabels && row.year) {
            yearLabels += `<text x="0" y="${rowTop - 8}">${escapeXml(row.year)}</text>`;
        }

        row.weeks.forEach(week => {
            const firstDay = week.contributionDays?.[0];
            if (!firstDay) return;

            const firstDayDate = new Date(firstDay.date);
            const currentMonth = firstDayDate.getMonth();
            if (currentMonth !== lastMonth && firstDayDate.getDate() <= 14) {
                monthLabels += `<text x="${currX}" y="${rowTop - 8}">${months[currentMonth]}</text>`;
                lastMonth = currentMonth;
            }

            week.contributionDays.forEach(day => {
                const date = new Date(day.date);
                const dayOfWeek = date.getDay();
                const currY = rowTop + (dayOfWeek * (cellSize + cellPad));

                const rangeStart = winStart;
                const rangeEnd = winEnd;
                const inWindow = !rangeStart || (date >= rangeStart && date <= rangeEnd);
                if (!inWindow) return;

                const isPast = date <= new Date();
                const fill = isPast ? levelColor(day.contributionCount || 0) : 'none';
                const stroke = !isPast ? `stroke="${zeroColor}" stroke-width="0.5" stroke-opacity="0.15"` : '';
                rects += `<rect x="${currX}" y="${currY}" width="${cellSize}" height="${cellSize}" rx="${opts.cellRx ?? 2}" fill="${fill}" ${stroke}><title>${escapeXml(day.date)}: ${day.contributionCount || 0} contributions</title></rect>`;
            });

            currX += cellSize + cellPad;
        });
    });


    const bgRect = bg === 'transparent'
        ? `<rect width="${totalWidth}" height="${totalHeight}" rx="${rx}" fill="none" stroke="${borderColor}" stroke-width="${borderW}"/>`
        : `<rect width="${totalWidth}" height="${totalHeight}" rx="${rx}" fill="${escapeXml(bg)}" stroke="${borderColor}" stroke-width="${borderW}"/>`;

    const svgSizeAttrs = opts.responsive
        ? 'width="100%" height="auto"'
        : `width="${totalWidth}" height="${totalHeight}"`;

    return `
<svg ${svgSizeAttrs} viewBox="0 0 ${totalWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">
    <style>
        ${FONT_FACE_MONO}
        .t { font-family: ${FONT_STACK}; font-size: 10px; fill: ${escapeXml(labelFill)}; }
        .total { font-family: ${FONT_STACK}; font-size: 10px; fill: ${escapeXml(opts.textColor || THEME.text)}; font-weight: 700; }
    </style>
    ${bgRect}
    <g transform="translate(${px}, ${py})">
        <g class="t">
            ${yearLabels}
            ${monthLabels}
        </g>
        <g>${rects}</g>
    </g>
</svg>`.trim();
}
