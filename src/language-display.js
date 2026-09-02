function languageKey(value) {
    return String(value || '').trim().toLowerCase();
}

function configuredNames(values) {
    const names = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
        const name = String(value || '').trim();
        const key = languageKey(name);
        if (!name || seen.has(key)) continue;
        seen.add(key);
        names.push(name);
    }
    return names;
}

function byBytesThenName([nameA, bytesA], [nameB, bytesB]) {
    return Number(bytesB || 0) - Number(bytesA || 0) || nameA.localeCompare(nameB);
}

/**
 * Return a presentation order without changing language byte totals.
 * Primary languages are kept in the Languages group, ordinary languages
 * retain byte ranking, and framework/template and esoteric languages are
 * kept in their own groups.
 */
export function languageDisplayOrder(languages, profile = {}) {
    const entries = Object.entries(languages || {});
    const available = new Map(entries.map(([name, bytes]) => [languageKey(name), [name, bytes]]));
    const primary = configuredNames(profile.primary);
    const demoted = configuredNames(profile.frameworks ?? profile.demoted);
    const esolangs = configuredNames(profile.esolangs);
    const primaryKeys = new Set(primary.map(languageKey));
    const primaryRank = new Map(primary.map((name, index) => [languageKey(name), index]));
    const frameworkKeys = new Set(demoted.filter((name) => !primaryKeys.has(languageKey(name))).map(languageKey));
    const esolangKeys = new Set(esolangs
        .filter((name) => !primaryKeys.has(languageKey(name)) && !frameworkKeys.has(languageKey(name)))
        .map(languageKey));
    const primaryEntries = primary
        .map((name) => available.get(languageKey(name)))
        .filter(Boolean)
        .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0)
            || primaryRank.get(languageKey(a[0])) - primaryRank.get(languageKey(b[0]))
            || a[0].localeCompare(b[0]));
    const primaryKeySet = new Set(primaryEntries.map(([name]) => languageKey(name)));

    const ordinaryEntries = entries
        .filter(([name]) => {
            const key = languageKey(name);
            return !primaryKeySet.has(key) && !frameworkKeys.has(key) && !esolangKeys.has(key);
        })
        .sort(byBytesThenName);
    const demotedEntries = entries
        .filter(([name]) => frameworkKeys.has(languageKey(name)))
        .sort(byBytesThenName);
    const esolangEntries = entries
        .filter(([name]) => esolangKeys.has(languageKey(name)))
        .sort(byBytesThenName);

    return [...primaryEntries, ...ordinaryEntries, ...demotedEntries, ...esolangEntries].map(([name]) => name);
}

/**
 * Split the ordered language names into the two V2 display sections.
 * HTML and CSS remain in Languages unless explicitly configured as frameworks.
 */
export function languageDisplayGroups(languages, profile = {}) {
    const ordered = languageDisplayOrder(languages, profile);
    const primaryKeys = new Set(configuredNames(profile.primary).map(languageKey));
    const frameworkKeys = new Set(configuredNames(profile.frameworks ?? profile.demoted)
        .filter((name) => !primaryKeys.has(languageKey(name)))
        .map(languageKey));
    const esolangKeys = new Set(configuredNames(profile.esolangs)
        .filter((name) => !primaryKeys.has(languageKey(name)) && !frameworkKeys.has(languageKey(name)))
        .map(languageKey));

    return {
        languages: ordered.filter((name) => !frameworkKeys.has(languageKey(name)) && !esolangKeys.has(languageKey(name))),
        frameworks: ordered.filter((name) => frameworkKeys.has(languageKey(name)) && !primaryKeys.has(languageKey(name))),
        esolangs: ordered.filter((name) => esolangKeys.has(languageKey(name)) && !primaryKeys.has(languageKey(name))),
    };
}
