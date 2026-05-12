import { FONT_FACE_MONO, FONT_STACK, THEME, ICONS, errorSvg } from './params.js';

export function generateStreakBadge(calendarGrid, opts = {}) {
    if (!calendarGrid || !calendarGrid.weeks) return errorSvg('No streak data');

    const bgRaw = opts.bg;
    const bg = bgRaw === 'none' ? 'transparent' : (bgRaw || THEME.bg);
    const text = opts.textColor || THEME.text;
    const muted = THEME.textMuted;
    const borderColor = opts.border || THEME.border;
    const borderW = opts.borderWidth ?? 1;
    const rx = opts.rx ?? 0;
    const px = opts.px ?? 0;
    const py = opts.py ?? 0;
    const accent = opts.accentColor || THEME.accent;

    const days = [];
    calendarGrid.weeks.forEach(w => w.contributionDays.forEach(d => days.push(d)));
    days.reverse();

    const today = new Date().toISOString().split('T')[0];
    let todayIndex = days.findIndex(d => d.date === today);
    if (todayIndex === -1) todayIndex = 0;

    let currentStreak = 0;
    let streakStart = '';
    for (let i = todayIndex; i < days.length; i++) {
        if (days[i].contributionCount > 0) {
            currentStreak++;
            streakStart = days[i].date;
        } else if (i === todayIndex) {
            continue; //* today might not be over
        } else {
            break;
        }
    }

    const chronoDays = [...days].reverse();
    let longest = 0;
    let run = 0;
    for (const d of chronoDays) {
        if (d.contributionCount > 0) {
            run++;
            if (run > longest) longest = run;
        } else {
            run = 0;
        }
    }

    const totalContributions = calendarGrid.totalContributions || chronoDays.reduce((s, d) => s + d.contributionCount, 0);

    const streakColor = currentStreak === 0 ? THEME.error : accent;

    const formatDate = (dateStr) => {
        if (!dateStr) return ':';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const innerW = 430;
    const innerH = 136;
    const width = innerW + px * 2;
    const height = innerH + py * 2;
    const sideW = 118;
    const centerW = innerW - sideW * 2;
    const leftX = px + sideW / 2;
    const centerX = px + sideW + centerW / 2;
    const rightX = px + sideW + centerW + sideW / 2;
    const sep1X = px + sideW;
    const sep2X = px + sideW + centerW;
    const fireIcon = currentStreak >= 7
        ? `<g transform="translate(${centerX - 8}, ${py + 12})"><svg width="16" height="16" viewBox="0 0 ${ICONS.fire.vb}" fill="${accent}"><path d="${ICONS.fire.d}"/></svg></g>`
        : '';

    const bgRect = bg === 'transparent'
        ? `<rect width="${width}" height="${height}" rx="${rx}" fill="none" stroke="${borderColor}" stroke-width="${borderW}"/>`
        : `<rect width="${width}" height="${height}" rx="${rx}" fill="${bg}" stroke="${borderColor}" stroke-width="${borderW}"/>`;

    return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    ${FONT_FACE_MONO}
    .num  { font-family: ${FONT_STACK}; font-weight: 700; font-size: 28px; }
    .lbl  { font-family: ${FONT_STACK}; font-weight: 500; font-size: 9px; letter-spacing: 1px; text-transform: uppercase; fill: ${muted}; }
    .sub  { font-family: ${FONT_STACK}; font-weight: 400; font-size: 9px; fill: ${muted}; }
    .snum { font-family: ${FONT_STACK}; font-weight: 700; font-size: 17px; }
    .sep  { stroke: ${borderColor}; stroke-width: 1; }
  </style>
  ${bgRect}

  <!-- Center: Current Streak -->
  ${fireIcon}
  <text x="${centerX}" y="${py + 53}" text-anchor="middle" class="num" fill="${streakColor}">${currentStreak}</text>
  <text x="${centerX}" y="${py + 72}" text-anchor="middle" class="lbl">Current Streak</text>
  <text x="${centerX}" y="${py + 90}" text-anchor="middle" class="sub">${currentStreak > 0 ? formatDate(streakStart) + ' - today' : 'No active streak'}</text>

  <!-- Vertical separators -->
  <line x1="${sep1X}" y1="${py + 14}" x2="${sep1X}" y2="${py + innerH - 14}" class="sep"/>
  <line x1="${sep2X}" y1="${py + 14}" x2="${sep2X}" y2="${py + innerH - 14}" class="sep"/>

  <!-- Left: Total Contributions -->
  <text x="${leftX}" y="${py + 57}" text-anchor="middle" class="snum" fill="${text}">${totalContributions.toLocaleString()}</text>
  <text x="${leftX}" y="${py + 76}" text-anchor="middle" class="lbl">Total</text>
  <text x="${leftX}" y="${py + 92}" text-anchor="middle" class="sub">(365 days)</text>

  <!-- Right: Longest Streak -->
  <text x="${rightX}" y="${py + 57}" text-anchor="middle" class="snum" fill="${text}">${longest}</text>
  <text x="${rightX}" y="${py + 76}" text-anchor="middle" class="lbl">Longest</text>
  <text x="${rightX}" y="${py + 92}" text-anchor="middle" class="sub">${longest} day${longest !== 1 ? 's' : ''}</text>
</svg>`.trim();
}
