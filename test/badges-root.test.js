import test from 'node:test';
import assert from 'node:assert/strict';
import Worker from '../src/index.js';

class MemoryKV {
    async get() { return null; }
    async put() { }
    async list() { return { keys: [] }; }
}

const env = () => ({ echopoint_kv: new MemoryKV(), GITHUB_TOKEN: 'github-token' });
const get = (path) => Worker.fetch(new Request(`https://example.test${path}`), env(), {});
const query = 'leftText=hello&rightText=world&logo=github&bg=111111&badgeColor=2b2b2b';

test('root badges embed only JetBrains Mono Regular', async () => {
    const res = await get(`/svg/root/custom?${query}`);
    const svg = await res.text();
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /image\/svg\+xml/);
    assert.match(svg, />hello<\/text>/);
    assert.match(svg, />world<\/text>/);
    assert.equal((svg.match(/@font-face/g) || []).length, 1);
    assert.match(svg, /font-family: 'JetBrains Mono'/);
    assert.doesNotMatch(svg, /font-family: .Monaspace/);
    assert.ok(svg.length < 100_000, `root badge is ${svg.length} bytes`);
});

test('public badges keep all four embedded fonts', async () => {
    const svg = await (await get(`/svg/badges/custom?${query}`)).text();
    assert.equal((svg.match(/@font-face/g) || []).length, 4);
    assert.match(svg, /Monaspace Neon/);
    assert.match(svg, /Monaspace Krypton/);
    assert.ok(svg.length > 700_000);
});

test('root badges render the same drawing as the public ones, minus the fonts', async () => {
    const strip = (svg) => svg.replace(/<style>[\s\S]*?<\/style>/, '');
    const root = await (await get(`/svg/root/custom?${query}`)).text();
    const full = await (await get(`/svg/badges/custom?${query}`)).text();
    assert.equal(strip(root), strip(full));
});

test('root route only serves badge kinds', async () => {
    for (const kind of ['calendar', 'streak', 'profile', 'langs', 'nope']) {
        const res = await get(`/svg/root/${kind}`);
        assert.equal(res.status, 404, kind);
    }
});
