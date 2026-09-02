import { languageDisplayGroups } from '../language-display.js';
import { escapeXml, FONT_FACE_MONO, FONT_STACK, THEME, errorSvg } from './params.js';

const LANG_COLORS = {
    Rust: '#dea584', Go: '#00ADD8', TypeScript: '#3178c6',
    JavaScript: '#f1e05a', HTML: '#e34c26', CSS: '#563d7c',
    Python: '#3572a5', Shell: '#89e051', Dockerfile: '#384d54',
    Makefile: '#427819', C: '#555555', 'C++': '#f34b7d',
    WGSL: '#4e9a06', Brainfuck: '#c084fc',
};

const OVERFLOW = ['#8b949e', '#6e7681', '#484f58', '#30363d', '#21262d'];

function languageKey(value) {
    return String(value || '').trim().toLowerCase();
}

function numericLimit(value) {
    const limit = Number(value);
    return Number.isInteger(limit) && limit > 0 ? limit : 6;
}

function bytesFor(entries) {
    return entries.reduce((total, [, bytes]) => total + Number(bytes || 0), 0);
}

function limitSection(entries, limit) {
    const visible = entries.slice(0, limit).map(([lang, bytes]) => [lang, Number(bytes || 0)]);
    const overflow = bytesFor(entries.slice(limit));
    if (overflow > 0) visible.push(['Other', overflow]);
    return visible;
}

function renderSection(items, title, y, layout) {
    const {
        innerW, langW, halfW, pctX, rowH, cellPad, dotR, headerH,
        tableBorderColor, tableBorderOpacity, totalBytes,
    } = layout;
    const gridStroke = `stroke="${tableBorderColor}" stroke-width="1" stroke-opacity="${tableBorderOpacity}"`;
    const numRows = Math.max(1, Math.ceil(items.length / 2));
    const tableH = numRows * rowH;
    const tableY = headerH;
    const textY = Math.round(rowH / 2) + 4;
    let svg = `<g transform="translate(0, ${y})">
    <text x="${cellPad}" y="12" class="section">${escapeXml(title)}</text>
    <line x1="0" y1="${tableY - 1}" x2="${innerW}" y2="${tableY - 1}" ${gridStroke}/>
    <rect y="${tableY}" width="${innerW}" height="${tableH}" rx="0" fill="none" ${gridStroke}/>`;

    for (let r = 1; r < numRows; r++) {
        const lineY = tableY + r * rowH;
        svg += `<line x1="0" y1="${lineY}" x2="${innerW}" y2="${lineY}" ${gridStroke}/>`;
    }

    for (const vx of [langW, halfW, halfW + langW]) {
        svg += `<line x1="${vx}" y1="${tableY}" x2="${vx}" y2="${tableY + tableH}" ${gridStroke}/>`;
    }

    if (items.length === 0) {
        svg += `<text x="${cellPad}" y="${tableY + textY}" class="empty">None detected</text>`;
    } else {
        items.forEach((item, idx) => {
            const row = Math.floor(idx / 2);
            const col = idx % 2;
            const ox = col === 0 ? 0 : halfW;
            const oy = tableY + row * rowH;
            const pct = totalBytes > 0 ? ((item.bytes / totalBytes) * 100).toFixed(1) : '0.0';
            const name = escapeXml(item.lang);
            svg += `
    <g transform="translate(${ox}, ${oy})">
      <circle cx="${cellPad + dotR}" cy="${rowH / 2}" r="${dotR}" fill="${item.color}"/>
      <text x="${cellPad + dotR * 2 + 3}" y="${textY}" class="lang">${name}</text>
      <text x="${pctX}" y="${textY}" text-anchor="middle" class="pct">${pct}%</text>
    </g>`;
        });
    }

    svg += '\n  </g>';
    return { svg, height: headerH + tableH };
}

/**
 * Experimental language chart with separate Languages and Frameworks tables.
 * The input bytes are never changed; only grouping and presentation change.
 */
export function generateLangsBarV2(langsObject, opts = {}, profile = {}) {
    if (!langsObject || Object.keys(langsObject).length === 0) return errorSvg('No language data');

    const entries = Object.entries(langsObject);
    const totalBytes = bytesFor(entries);
    const groups = languageDisplayGroups(langsObject, profile);
    const values = new Map(entries.map(([name, bytes]) => [languageKey(name), [name, Number(bytes || 0)]]));
    const groupEntries = (names) => names.map((name) => values.get(languageKey(name))).filter(Boolean);
    const limit = numericLimit(opts.limit ?? profile.limit);
    const colorOverrides = [opts.color1, opts.color2, opts.color3, opts.color4, opts.color5, opts.color6];
    const palette = colorOverrides.filter(Boolean);
    const monochrome = opts.monochrome === true;
    let colorIndex = 0;

    const sections = [
        { title: 'Languages', entries: limitSection(groupEntries(groups.languages), limit) },
        { title: 'Frameworks', entries: limitSection(groupEntries(groups.frameworks), limit) },
        { title: 'Esolangs', entries: limitSection(groupEntries(groups.esolangs), limit) },
    ].map((section) => ({
        ...section,
        items: section.entries.map(([lang, bytes]) => {
            const index = colorIndex++;
            let color;
            if (palette[index]) color = palette[index];
            else if (lang === 'Other') color = OVERFLOW[0];
            else if (monochrome) color = OVERFLOW[index % OVERFLOW.length];
            else color = LANG_COLORS[lang] || OVERFLOW[index % OVERFLOW.length];
            return { lang, bytes, color };
        }),
    }));

    const bgRaw = opts.bg;
    const bg = bgRaw === 'none' ? 'transparent' : (bgRaw || THEME.bg);
    const textFill = opts.textColor || THEME.text;
    const muted = opts.pctColor || THEME.textMuted;
    const borderColor = opts.border || THEME.border;
    const borderW = opts.borderWidth ?? 1;
    const tableBorderColor = THEME.border;
    const tableBorderOpacity = 0.72;
    const rx = opts.rx ?? 0;
    const px = opts.px ?? 0;
    const py = opts.py ?? 0;
    const barH = opts.height || 10;
    const showBar = opts.bar !== false;
    const showTable = opts.table !== false;
    const innerW = opts.width || 300;
    const rowH = 20;
    const headerH = 18;
    const pctW = 36;
    const halfW = innerW / 2;
    const langW = halfW - pctW;
    const pctX = langW + (pctW / 2);
    const gap = showBar && showTable ? 8 : 0;
    const sectionGap = 10;
    const sectionLayout = {
        innerW, langW, halfW, pctX, rowH, headerH,
        cellPad: 7, dotR: 3, tableBorderColor, tableBorderOpacity, totalBytes,
    };

    const barItems = sections.flatMap((section) => section.items);
    let barSvg = '';
    if (showBar) {
        let rects = '';
        let cx = 0;
        barItems.forEach((item) => {
            const w = totalBytes > 0 ? (item.bytes / totalBytes) * innerW : 0;
            rects += `<rect x="${cx.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${barH}" fill="${item.color}"/>`;
            cx += w;
        });
        barSvg = `
    <mask id="bar-mask"><rect width="${innerW}" height="${barH}" rx="0" fill="#fff"/></mask>
    <g mask="url(#bar-mask)">${rects}</g>`;
    }

    let tableSvg = '';
    let sectionsH = 0;
    if (showTable) {
        const renderedSections = [];
        sections.forEach((section, index) => {
            const rendered = renderSection(section.items, section.title, sectionsH, sectionLayout);
            sectionsH += rendered.height;
            if (index < sections.length - 1) sectionsH += sectionGap;
            renderedSections.push(rendered.svg);
        });
        tableSvg = `<g transform="translate(0, ${showBar ? barH + gap : 0})">
    ${renderedSections.join('\n    ')}</g>`;
    }

    const innerH = (showBar ? barH : 0) + gap + (showTable ? sectionsH : 0);
    const width = innerW + px * 2;
    const height = innerH + py * 2;
    const bgRect = bg === 'transparent'
        ? `<rect width="${width}" height="${height}" rx="${rx}" fill="none" stroke="${borderColor}" stroke-width="${borderW}"/>`
        : `<rect width="${width}" height="${height}" rx="${rx}" fill="${bg}" stroke="${borderColor}" stroke-width="${borderW}"/>`;
    const svgSizeAttrs = opts.responsive
        ? 'width="100%" height="auto"'
        : `width="${width}" height="${height}"`;

    return `
<svg ${svgSizeAttrs} viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    ${FONT_FACE_MONO}
    .section { font-family: ${FONT_STACK}; font-size: 10px; fill: ${escapeXml(textFill)}; font-weight: 600; }
    .lang { font-family: ${FONT_STACK}; font-size: 10px; fill: ${escapeXml(textFill)}; font-weight: 500; }
    .pct  { font-family: ${FONT_STACK}; font-size: 10px; fill: ${escapeXml(muted)}; font-weight: 400; }
    .empty { font-family: ${FONT_STACK}; font-size: 10px; fill: ${escapeXml(muted)}; font-weight: 400; }
  </style>
  ${bgRect}
  <g transform="translate(${px}, ${py})">
    ${barSvg}
    ${tableSvg}
  </g>
</svg>`.trim();
}
