import test from 'node:test';
import assert from 'node:assert/strict';
import { languageDisplayGroups, languageDisplayOrder } from '../src/language-display.js';
import { generateLangsBar } from '../src/svg/langs.js';
import { generateLangsBarV2 } from '../src/svg/langs-v2.js';

const profile = {
    primary: ['Rust', 'TypeScript', 'JavaScript', 'Go'],
    frameworks: ['Astro', 'Svelte', 'Vue'],
    esolangs: ['Brainfuck'],
    limit: 6,
};

test('language V2 keeps HTML/CSS in Languages and groups frameworks separately', () => {
    const languages = {
        CSS: 413,
        Rust: 100,
        TypeScript: 100,
        JavaScript: 100,
        Go: 100,
        Python: 50,
        HTML: 50,
        Astro: 75,
        Brainfuck: 12,
    };

    assert.deepEqual(languageDisplayOrder(languages, profile), [
        'Rust', 'TypeScript', 'JavaScript', 'Go', 'CSS', 'HTML', 'Python', 'Astro', 'Brainfuck',
    ]);
    assert.deepEqual(languageDisplayGroups(languages, profile), {
        languages: ['Rust', 'TypeScript', 'JavaScript', 'Go', 'CSS', 'HTML', 'Python'],
        frameworks: ['Astro'],
        esolangs: ['Brainfuck'],
    });

    const svg = generateLangsBarV2(languages, {}, profile);
    assert.ok(svg.includes('>Languages<'));
    assert.ok(svg.includes('>Frameworks<'));
    assert.ok(svg.includes('>Esolangs<'));
    assert.ok(svg.indexOf('>Rust<') < svg.indexOf('>CSS<'));
    assert.ok(svg.indexOf('>CSS<') < svg.indexOf('>Astro<'));
    assert.ok(svg.indexOf('>Astro<') < svg.indexOf('>Brainfuck<'));
    assert.match(svg, />Rust<.*>10\.0%<\/text>/s);
});

test('the original language renderer remains byte-ranked', () => {
    const svg = generateLangsBar({ CSS: 1000, Rust: 100 });
    assert.ok(svg.indexOf('>CSS<') < svg.indexOf('>Rust<'));
});
