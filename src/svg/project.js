import {
    escapeXml,
    FONT_FACE_MONO,
    FONT_STACK,
    THEME,
    errorSvg,
} from "./params.js";

const LANG_COLORS = {
    Rust: "#d8d8d8",
    JavaScript: "#cfcfcf",
    CSS: "#b8b8b8",
    Go: "#a6a6a6",
    HTML: "#969696",
    Svelte: "#858585",
    TypeScript: "#747474",
    Assembly: "#c0c0c0",
    WGSL: "#666666",
    Makefile: "#5a5a5a",
    Dockerfile: "#4d4d4d",
};

const FALLBACK_COLORS = ["#d8d8d8", "#b8b8b8", "#969696", "#747474", "#5a5a5a"];

function fmtAgo(rawDate) {
    if (!rawDate) return ":";
    const days = Math.floor(
        (Date.now() - new Date(rawDate).getTime()) / 86400000,
    );
    if (!Number.isFinite(days) || days < 0) return ":";
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    return `${days}d ago`;
}

function fmtDate(rawDate) {
    if (!rawDate) return ":";
    const d = new Date(rawDate);
    if (Number.isNaN(d.getTime())) return ":";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return ":";
    return n.toLocaleString("en-US");
}

function trimText(value, max) {
    const text = String(value || "");
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function chip(label, value, x, y, opts) {
    const left = escapeXml(label);
    const right = escapeXml(value);
    const charW = 5.2;
    const h = 18;
    const leftW = Math.ceil(left.length * charW) + 12;
    const rightW = Math.ceil(right.length * charW) + 12;
    const w = leftW + rightW;

    return {
        w,
        svg: `
      <g transform="translate(${x}, ${y})">
        <rect width="${w}" height="${h}" fill="${opts.bg}" stroke="${opts.border}" stroke-width="1"/>
        <rect x="${leftW}" width="${rightW}" height="${h}" fill="${opts.fill}"/>
        <text x="6" y="12" class="chip">${left}</text>
        <text x="${leftW + rightW / 2}" y="12" text-anchor="middle" class="chip">${right}</text>
      </g>`,
    };
}

function languageItems(langs, max = 4) {
    if (!langs || Object.keys(langs).length === 0) return [];
    const total = Object.values(langs).reduce((sum, bytes) => sum + bytes, 0);
    if (!total) return [];

    const sorted = Object.entries(langs).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, max);
    const other = sorted.slice(max).reduce((sum, [, bytes]) => sum + bytes, 0);
    if (other > 0) top.push(["Other", other]);

    return top.map(([name, bytes], idx) => ({
        name,
        bytes,
        pct: ((bytes / total) * 100).toFixed(1),
        color:
            LANG_COLORS[name] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
    }));
}

function renderLangs(langs, x, y, width) {
    const items = languageItems(langs);
    if (items.length === 0) {
        return `<text x="${x}" y="${y + 18}" class="muted">No language data</text>`;
    }

    let bar = "";
    let cx = x;
    const total = items.reduce((sum, item) => sum + item.bytes, 0);
    for (const item of items) {
        const w = (item.bytes / total) * width;
        bar += `<rect x="${cx.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="8" fill="${item.color}"/>`;
        cx += w;
    }

    const rows = [];
    const rowH = 17;
    const colW = width / 2;
    items.slice(0, 6).forEach((item, idx) => {
        const row = Math.floor(idx / 2);
        const col = idx % 2;
        const ox = x + col * colW;
        const oy = y + 25 + row * rowH;
        rows.push(`
      <g transform="translate(${ox}, ${oy})">
        <circle cx="4" cy="0" r="2.4" fill="${item.color}"/>
        <text x="10" y="3" class="small">${escapeXml(trimText(item.name, 12))}</text>
        <text x="${colW - 4}" y="3" text-anchor="end" class="muted">${item.pct}%</text>
      </g>`);
    });

    return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="8" fill="#111111" stroke="#333333" stroke-width="1"/>
      ${bar}
      ${rows.join("")}
    </g>`;
}

function renderCommits(commits, x, y, width, opts) {
    if (!Array.isArray(commits) || commits.length === 0) {
        return `<text x="${x}" y="${y + 18}" class="muted">No commits data</text>`;
    }

    const clipId = "project-commit-clip";

    const items = commits
        .slice(0, 2)
        .map((commit, idx) => {
            const oy = y + idx * 39;
            const msg = escapeXml(
                trimText(commit.message || "Updated code", 28),
            );
            const sha = escapeXml((commit.sha || "").slice(0, 7) || "-");
            const date = escapeXml(fmtDate(commit.date));
            const additions = Number(commit.additions || 0);
            const deletions = Number(commit.deletions || 0);
            const line =
                idx === 0
                    ? `<line x1="${x + 5}" y1="${oy + 12}" x2="${x + 5}" y2="${oy + 45}" stroke="${opts.border}" stroke-width="1.4"/>`
                    : "";

            return `
      <g>
        <rect x="${x + 1}" y="${oy + 3}" width="8" height="8" fill="${opts.accent}"/>
        ${line}
        <text x="${x + 18}" y="${oy + 10}" class="commit">${msg}</text>
        <text x="${x + 18}" y="${oy + 27}" class="muted">${date} · ${sha} · <tspan fill="${opts.text}">+${additions}</tspan> <tspan fill="${opts.dim}">-${deletions}</tspan></text>
      </g>`;
        })
        .join("");

    return `
    <clipPath id="${clipId}">
      <rect x="${x}" y="${y - 4}" width="${width}" height="77"/>
    </clipPath>
    <g clip-path="url(#${clipId})">${items}</g>`;
}

export function generateProjectCard(repo, data = {}, opts = {}) {
    if (!repo) return errorSvg("No repo selected");

    const width = opts.width || 260;
    const height = 304;
    const bgRaw = opts.bg;
    const bg = bgRaw === "none" ? "transparent" : bgRaw || "#0b0b0b";
    const text = opts.textColor || THEME.text;
    const dim = opts.pctColor || THEME.textMuted;
    const border = opts.border || THEME.border;
    const fill = opts.badgeColor || "#2b2b2b";
    const accent = opts.accentColor || "#d8d8d8";
    const pad = 10;
    const innerW = width - pad * 2;

    const repoData = data.repo || {};
    const release = data.release || {};
    const pushedAt = repoData.pushed_at;
    const repoUrl =
        repoData.html_url || `https://github.com/${repo.owner}/${repo.name}`;
    const displayUrl = repoUrl.replace(/^https?:\/\//, "");
    const commitTotal = data.commitCount?.total;
    const chips = [
        ["stars", String(repoData.stargazers_count ?? 0)],
        ["commits", fmtNumber(commitTotal)],
        ["release", release.tag_name || ":"],
        ["updated", fmtAgo(pushedAt)],
    ];

    let chipSvg = "";
    let x = pad;
    let y = 45;
    for (const [label, value] of chips) {
        const item = chip(label, value, x, y, { bg: "#111111", fill, border });
        if (x > pad && x + item.w > width - pad) {
            x = pad;
            y += 24;
        }
        const placed = chip(label, value, x, y, {
            bg: "#111111",
            fill,
            border,
        });
        chipSvg += placed.svg;
        x += placed.w + 6;
    }

    const chipBottomY = y + 18;
    const langLabelY = chipBottomY + 16;
    const langY = langLabelY + 11;
    const commitBoxY = langY + 88;
    const commitY = commitBoxY + 10;

    const bgRect =
        bg === "transparent"
            ? `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="${border}" stroke-width="2"/>`
            : `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="${bg}" stroke="${border}" stroke-width="2"/>`;

    return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    ${FONT_FACE_MONO}
    .title { font-family: ${FONT_STACK}; font-size: 13px; font-weight: 700; fill: ${escapeXml(text)}; }
    .url { font-family: ${FONT_STACK}; font-size: 8px; fill: ${escapeXml(dim)}; }
    .section { font-family: ${FONT_STACK}; font-size: 8px; font-weight: 700; fill: ${escapeXml(dim)}; text-transform: uppercase; }
    .chip { font-family: ${FONT_STACK}; font-size: 9px; font-weight: 600; fill: ${escapeXml(text)}; }
    .small { font-family: ${FONT_STACK}; font-size: 8.5px; font-weight: 500; fill: ${escapeXml(text)}; }
    .muted { font-family: ${FONT_STACK}; font-size: 8px; fill: ${escapeXml(dim)}; }
    .commit { font-family: ${FONT_STACK}; font-size: 9px; font-weight: 600; fill: ${escapeXml(text)}; }
  </style>
  ${bgRect}
  <text x="${pad}" y="19" class="title">${escapeXml(repo.alias)}</text>
  <text x="${pad}" y="33" class="url">${escapeXml(trimText(displayUrl, 38))}</text>
  ${chipSvg}
  <text x="${pad}" y="${langLabelY}" class="section">Languages</text>
  ${renderLangs(data.langs, pad, langY, innerW)}
  <text x="${pad}" y="${commitBoxY - 9}" class="section">Recent Commits</text>
  <rect x="${pad}" y="${commitBoxY}" width="${innerW}" height="84" fill="#0f0f0f" stroke="${border}" stroke-width="1"/>
  ${renderCommits(data.commits, pad + 8, commitY, innerW - 16, { border, accent, text, dim })}
</svg>`.trim();
}
