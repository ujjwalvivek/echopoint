import styles from './playground.module.css';

let currentEndpoint = null;
let currentParams = {};
let debounceTimer = null;
let apiBaseUrl = '';
let CONFIG = null;
const endpointParamCache = {};

const sharedLayoutBase = {
    bg: 'color', border: 'color', borderWidth: 'number',
    rx: 'number', px: 'number', py: 'number'
};
const sharedColorBase = {
    accentColor: 'color', lineColor: 'color', positiveColor: 'color', negativeColor: 'color'
};
const allLogos = { logo: 'select' };

const sharedBadgeLayout = {
    badgeColor: 'color', textColor: 'color', bg: 'color', border: 'color', borderWidth: 'number',
    rx: 'number', px: 'number', py: 'number'
}

const monoBadgeDefaults = {
    bg: '#111111',
    badgeColor: '#2b2b2b',
    textColor: '#e8e8e8',
    border: '#555555',
    borderWidth: '2',
    rx: '0',
    px: '6',
    py: '4',
};

const monoCardDefaults = {
    bg: '#0b0b0b',
    border: '#555555',
    borderWidth: '2',
    rx: '0',
    px: '12',
    py: '10',
    textColor: '#e8e8e8',
    accentColor: '#cfcfcf',
    lineColor: '#555555',
    positiveColor: '#cfcfcf',
    negativeColor: '#8a8a8a',
};

const monoLangDefaults = {
    ...monoCardDefaults,
    responsive: 'true',
    pctColor: '#a6a6a6',
    color1: '#e8e8e8',
    color2: '#c0c0c0',
    color3: '#969696',
    color4: '#6d6d6d',
    color5: '#464646',
};

const monoCalendarDefaults = {
    ...monoCardDefaults,
    cellRx: '0',
    level0: '#151515',
    level1: '#3a3a3a',
    level2: '#686868',
    level3: '#9a9a9a',
    level4: '#e8e8e8',
    zeroColor: '#151515',
};

const monoCommitDefaults = {
    ...monoCardDefaults,
    responsive: 'true',
    limit: '3',
};

const monoProjectDefaults = {
    bg: '#0b0b0b',
    border: '#555555',
    badgeColor: '#2b2b2b',
    textColor: '#e8e8e8',
    pctColor: '#a6a6a6',
    accentColor: '#cfcfcf',
    width: '260',
};

const endpointSchemas = {
    '/svg/badges/contributions': { ...sharedBadgeLayout, ...allLogos },
    '/svg/badges/commits': { ...sharedBadgeLayout, ...allLogos },
    '/svg/badges/prs': { ...sharedBadgeLayout, ...allLogos },
    '/svg/badges/issues': { ...sharedBadgeLayout, ...allLogos },
    '/svg/badges/stars': { repo: 'repo', ...sharedBadgeLayout, ...allLogos },
    '/svg/badges/release': { repo: 'repo', ...sharedBadgeLayout, ...allLogos },
    '/svg/badges/npm': { package: 'npmPackage', ...sharedBadgeLayout, ...allLogos },
    '/svg/badges/cargo': { crate: 'crate', ...sharedBadgeLayout, ...allLogos },
    '/svg/badges/docker': { image: 'dockerImage', ...sharedBadgeLayout, ...allLogos },
    '/svg/badges/ghcr': { repo: 'repo', ...sharedBadgeLayout, ...allLogos },
    '/svg/badges/updated': { repo: 'repo', ...sharedBadgeLayout, ...allLogos },
    '/svg/badges/docs': { ...sharedBadgeLayout, ...allLogos },
    '/svg/badges/custom': { leftText: 'text', rightText: 'text', ...sharedBadgeLayout, ...allLogos },
    '/svg/badges/health': { repo: 'repo', ...sharedBadgeLayout, ...allLogos },

    '/svg/streak': { textColor: 'color', ...sharedLayoutBase },
    '/svg/calendar': {
        level0: 'color', level1: 'color', level2: 'color', level3: 'color', level4: 'color',
        zeroColor: 'color', ytd: 'boolean', responsive: 'boolean', tight: 'boolean', window: 'number',
        textColor: 'color', ...sharedLayoutBase
    },
    '/svg/langs': {
        repo: 'repo', limit: 'number', width: 'number', height: 'number',
        bar: 'boolean', table: 'boolean', responsive: 'boolean',
        color1: 'color', color2: 'color', color3: 'color', color4: 'color', color5: 'color',
        textColor: 'color', pctColor: 'color', ...sharedLayoutBase
    },
    '/svg/commits': { repo: 'repo', limit: 'number', width: 'number', responsive: 'boolean', textColor: 'color', ...sharedLayoutBase, ...sharedColorBase },
    '/svg/status': { target: 'statusTarget', logo: 'select', ...sharedBadgeLayout },
    '/svg/project': {
        repo: 'repo', width: 'number', bg: 'color', border: 'color', badgeColor: 'color',
        textColor: 'color', pctColor: 'color', accentColor: 'color'
    }
};

const endpointDefaults = {
    '/svg/badges/contributions': { logo: 'github' },
    '/svg/badges/commits': { logo: 'github' },
    '/svg/badges/prs': { logo: 'github' },
    '/svg/badges/issues': { logo: 'github' },
    '/svg/badges/stars': { repo: 'echopoint', logo: 'github' },
    '/svg/badges/release': { repo: 'echopoint', logo: 'github' },
    '/svg/badges/npm': { logo: 'npm' },
    '/svg/badges/cargo': { logo: 'rust' },
    '/svg/badges/docker': { logo: 'docker' },
    '/svg/badges/ghcr': { repo: 'echopoint', logo: 'github' },
    '/svg/badges/updated': { repo: 'echopoint', logo: 'github' },
    '/svg/badges/docs': { logo: 'docs' },
    '/svg/badges/health': { repo: 'echopoint', logo: 'github' },
    '/svg/status': { logo: 'globe' },
    '/svg/project': { repo: 'echopoint', width: '260' },
};

let LOGOS = [];

export function setPlaygroundLogos(iconKeys) {
    LOGOS = iconKeys;
}

export function setPlaygroundConfig(config) {
    CONFIG = config;
}

function dynamicOptions(type) {
    if (type === 'repo') {
        return (CONFIG?.github?.repos || [])
            .filter(repo => repo.tracked !== false)
            .map(repo => ({
                value: repo.alias || repo.name,
                label: repo.alias || `${repo.owner}/${repo.name}`,
            }));
    }
    if (type === 'npmPackage') {
        return (CONFIG?.npm || []).map(pkg => ({
            value: pkg.alias || pkg.package,
            label: pkg.alias || pkg.package,
        }));
    }
    if (type === 'crate') {
        return (CONFIG?.crates || []).map(crate => ({
            value: crate.alias || crate.crate,
            label: crate.alias || crate.crate,
        }));
    }
    if (type === 'dockerImage') {
        return (CONFIG?.docker || []).map(image => ({
            value: image.alias || image.repository,
            label: image.alias || `${image.namespace}/${image.repository}`,
        }));
    }
    if (type === 'statusTarget') {
        return (CONFIG?.status || []).map(check => ({
            value: check.alias,
            label: check.label || check.alias,
        }));
    }
    return [];
}

function defaultParamsForEndpoint(endpoint) {
    const schema = endpointSchemas[endpoint] || {};
    const defaults = {
        ...(endpoint.startsWith('/svg/badges/') || endpoint === '/svg/status' ? monoBadgeDefaults : {}),
        ...(endpoint === '/svg/streak' ? monoCardDefaults : {}),
        ...(endpoint === '/svg/commits' ? monoCommitDefaults : {}),
        ...(endpoint === '/svg/langs' ? monoLangDefaults : {}),
        ...(endpoint === '/svg/calendar' ? monoCalendarDefaults : {}),
        ...(endpoint === '/svg/project' ? monoProjectDefaults : {}),
        ...(endpointDefaults[endpoint] || {}),
    };

    for (const [key, type] of Object.entries(schema)) {
        if (defaults[key]) continue;

        const first = dynamicOptions(type)[0]?.value;
        if (first) defaults[key] = first;
    }

    return defaults;
}

function renderControls(schema, container) {
    if (!schema) {
        container.innerHTML = `<div style="padding: 1rem; color: var(--text-muted); font-size: 0.8rem; text-align: center;">No configurable parameters for this endpoint.</div>`;
        return;
    }

    let html = '';
    for (const [key, type] of Object.entries(schema)) {
        html += `<div class="${styles.controlGroup}"><label>${key}</label>`;
        if (type === 'color') {
            const val = currentParams[key] || '#000000';
            html += `
                <div class="${styles.colorInput}">
                    <input type="color" data-key="${key}" value="${val}" />
                    <input type="text" data-key="${key}" value="${val}" />
                </div>
            `;
        } else if (type === 'text' || type === 'number') {
            html += `<input type="${type}" class="${styles.input}" data-key="${key}" value="${currentParams[key] || ''}" placeholder="e.g. value" />`;
        } else if (type === 'repo' || type === 'npmPackage' || type === 'crate' || type === 'dockerImage' || type === 'statusTarget') {
            const options = dynamicOptions(type);
            if (options.length > 0) {
                html += `<select class="${styles.input}" data-key="${key}">
                    <option value="">Default</option>
                    ${options.map(opt => `<option value="${opt.value}" ${currentParams[key] === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
                </select>`;
            } else {
                html += `<input type="text" class="${styles.input}" data-key="${key}" value="${currentParams[key] || ''}" placeholder="e.g. value" />`;
            }
        } else if (type === 'boolean') {
            html += `<select class="${styles.input}" data-key="${key}">
                <option value="">Default</option>
                <option value="true" ${currentParams[key] === 'true' ? 'selected' : ''}>True</option>
                <option value="false" ${currentParams[key] === 'false' ? 'selected' : ''}>False</option>
            </select>`;
        } else if (type === 'select') {
            html += `<select class="${styles.input}" data-key="${key}">
                <option value="" ${!currentParams[key] ? 'selected' : ''}>Default</option>
                <option value="none" ${currentParams[key] === 'none' ? 'selected' : ''}>None</option>
                ${LOGOS.map(l => `<option value="${l}" ${currentParams[key] === l ? 'selected' : ''}>${l}</option>`).join('')}
            </select>`;
        }
        html += `</div>`;
    }
    container.innerHTML = html;

    container.querySelectorAll('input, select').forEach(el => {
        const updateParam = (e) => {
            const key = e.target.dataset.key;
            let val = e.target.value;

            if (e.target.type === 'color') {
                container.querySelector(`input[type="text"][data-key="${key}"]`).value = val;
            } else if (e.target.type === 'text' && e.target.parentElement.classList.contains(styles.colorInput)) {
                if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                    container.querySelector(`input[type="color"][data-key="${key}"]`).value = val;
                }
            }

            currentParams[key] = val;
            triggerUpdate();
        };

        el.addEventListener(el.tagName.toLowerCase() === 'select' ? 'change' : 'input', updateParam);
    });
}

function getQueryUrl() {
    if (!currentEndpoint) return '';
    const url = new URL(apiBaseUrl + currentEndpoint);
    for (const k in currentParams) {
        if (currentParams[k]) {
            url.searchParams.set(k, currentParams[k].replace('#', ''));
        }
    }
    return url.toString();
}

function triggerUpdate() {
    const overlay = document.getElementById('pgLoading');
    if (overlay) overlay.classList.add(styles.active);

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const img = document.getElementById('pgPreviewImg');
        const url = getQueryUrl();
        if (img && url) {
            img.onload = () => overlay?.classList.remove(styles.active);
            img.onerror = () => overlay?.classList.remove(styles.active);
            img.src = url;
        } else {
            overlay?.classList.remove(styles.active);
        }
    }, 400);
}

async function copyText(text) {
    if (!text) return false;

    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_) {
            // Fall back for browsers that expose Clipboard API but deny the write.
        }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.width = '1px';
    textarea.style.height = '1px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();

    try {
        return document.execCommand('copy');
    } catch (_) {
        return false;
    } finally {
        textarea.remove();
        window.getSelection()?.removeAllRanges();
    }
}

function bindCopyButton(button, getText) {
    button.addEventListener('click', async () => {
        const orig = button.innerText;
        const copied = await copyText(getText());
        button.innerText = copied ? 'Copied!' : 'Copy failed';
        setTimeout(() => button.innerText = orig, 1500);
    });
}

export function updatePlaygroundContext(endpoint, params = null) {
    const pg = document.getElementById('playgroundRoot');
    if (!pg) return;

    if (!endpoint) {
        pg.style.display = 'none';
        return;
    }

    pg.style.display = 'flex';
    if (currentEndpoint !== endpoint) {
        if (currentEndpoint) {
            endpointParamCache[currentEndpoint] = { ...currentParams };
        }

        currentEndpoint = endpoint;
        currentParams = {
            ...defaultParamsForEndpoint(endpoint),
            ...(endpointParamCache[endpoint] || {}),
            ...(params || {}),
        };
    } else if (params) {
        currentParams = { ...currentParams, ...params };
    }

    const sel = document.getElementById('pgEndpointSelector');
    if (sel) sel.value = endpoint;

    const schema = endpointSchemas[endpoint] || null;
    renderControls(schema, document.getElementById('pgControlsBox'));
    triggerUpdate();
}

export function renderPlayground(mountPoint, baseUrl) {
    apiBaseUrl = baseUrl;
    mountPoint.innerHTML = `
        <aside class="${styles.playground}" id="playgroundRoot" style="display: none;">
            <div class="${styles.header}" id="pgHeader">
                <div class="${styles.peekHandle}"></div>
                <div class="${styles.pgTitle}">SVG Playground <small>(Tap to open)</small></div>
                <select class="${styles.input}" id="pgEndpointSelector" style="font-size: 0.8rem;">
                    <option value="/svg/badges/contributions">Contributions Badge</option>
                    <option value="/svg/badges/commits">Commits Badge</option>
                    <option value="/svg/badges/prs">PRs Badge</option>
                    <option value="/svg/badges/issues">Issues Badge</option>
                    <option value="/svg/badges/stars">Stars Badge</option>
                    <option value="/svg/badges/release">Release Badge</option>
                    <option value="/svg/badges/npm">npm Badge</option>
                    <option value="/svg/badges/cargo">Crate Badge</option>
                    <option value="/svg/badges/docker">Docker Badge</option>
                    <option value="/svg/badges/ghcr">GHCR Badge</option>
                    <option value="/svg/badges/updated">Updated Badge</option>
                    <option value="/svg/badges/docs">Docs Badge</option>
                    <option value="/svg/badges/custom">Custom Text Badge</option>
                    <option value="/svg/status">Uptime Badge</option>
                    <option value="/svg/badges/health">Health Badge</option>
                    <option value="/svg/streak">Streak Card</option>
                    <option value="/svg/calendar">Calendar Heatmap</option>
                    <option value="/svg/langs">Top Languages Bar</option>
                    <option value="/svg/commits">Recent Commits</option>
                    <option value="/svg/project">Project Card</option>
                </select>
            </div>
            
            <div class="${styles.previewArea}">
                <img id="pgPreviewImg" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="Live Preview" />
                <div class="${styles.loadingOverlay}" id="pgLoading">
                    <div class="${styles.spinner}"></div>
                </div>
            </div>
            
            <div class="${styles.controls}" id="pgControlsBox">
                <!-- Controls injected here -->
            </div>
            
            <div class="${styles.actions}">
                <button class="${styles.btn} copy-md">Copy MD</button>
                <button class="${styles.btn} ${styles.primary} copy-url">Copy URL</button>
            </div>
        </aside>
    `;

    document.getElementById('pgEndpointSelector').addEventListener('change', (e) => {
        updatePlaygroundContext(e.target.value);
    });

    const btnUrl = mountPoint.querySelector('.copy-url');
    bindCopyButton(btnUrl, getQueryUrl);

    const btnMd = mountPoint.querySelector('.copy-md');
    bindCopyButton(btnMd, () => `![Echopoint SVG](${getQueryUrl()})`);

    const pgHeader = mountPoint.querySelector('#pgHeader');
    pgHeader.addEventListener('click', (e) => {
        if (e.target.tagName.toLowerCase() === 'select') return;
        document.getElementById('playgroundRoot').classList.toggle(styles.open);
    });
}
