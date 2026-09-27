// check-view.mjs — Viewer regression checks (prov:ignore — the @s tokens below are fixtures, not cites) against the SHIPPED renderers (site/view-render.js),
// then every real document in the staged artifact. Run from hub/: tools/stage.sh && node tools/check-view.mjs
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(REPO, '_site');
if (!existsSync(ROOT)) { console.error('FAIL: _site/ missing — run tools/stage.sh first'); process.exit(1); }
await import(join(ROOT, 'diagram.js'));      // the Viewer hands ```mermaid fences to TPTDIAGRAM when present
await import(join(ROOT, 'view-render.js'));
const V = globalThis.TPTVIEW;
const NUL = String.fromCharCode(0);
const errs = [];
const ok = (cond, msg) => { if (!cond) errs.push(msg); };

// the checks that caught the shipped bugs upstream
ok(V.md('We ordered 5 units and 12 crates.').includes('5 units and 12 crates'), 'bare numbers eaten by fence restore');
const f = V.md('a\n\n```js\nlet x = 1\n```\n\nb');
ok(f.includes('<pre><code') && f.includes('let x = 1') && !f.includes(NUL), 'fenced code not restored / NUL leaked');
const l = V.md('[p](p.md) [e](https://e.gov) [t](#a) [h](lanes.html)');
ok(l.includes('href="view.html?f=p.md"') && l.includes('href="https://e.gov"') && l.includes('href="#a"') && l.includes('href="lanes.html"'), 'link resolution');
const c = V.csv('a,b\n"x, y","he said ""hi"""\n');
ok(c.includes('x, y') && c.includes('he said "hi"'), 'quoted CSV');
const b = V.csv('# banner\ncol1,col2\n1,2\n');
ok(b.includes('banner') && b.includes('2 columns'), 'CSV banner lifted');
ok(V.md('- [ ] open\n- [x] done').includes('class="todo"') && V.md('- [x] d').includes('class="done"'), 'task list');
ok((V.md('line one\nline two').match(/<p>/g) || []).length === 1, 'hard-wrapped prose must join into one paragraph');
ok(V.md('- a\n  continues').includes('<li>a continues</li>'), 'indented list continuation');
ok(V.md('```\n<!-- s9.99 P -->\n```').includes('&lt;!-- s9.99 P --&gt;') && !V.md('```\n<!-- s9.99 P -->\n```').includes(NUL), 'a marker inside a code fence is shown, not rendered');
ok(!V.md('a\n<!-- @s1.01 -->\nb').includes('s1.01') && !V.md('<!-- x\ny -->\nz').includes('&lt;!--'), 'HTML comments must render as nothing');
const sg = V.md('<!-- s1.12 PY\nidea a\ngrow b\n-->\nwords');
ok(sg.includes('id="s1.12"') && sg.includes('2 ideas') && sg.includes('<p>words</p>') && V.md('<!-- s1.05 ? -->\nq').includes('id="s1.05"'), 'segment marker renders as an anchored chip');
ok(V.md('[b](../brainstorming.md) [v](00-vision.md)', 'docs/').includes('f=brainstorming.md') && V.md('[v](00-vision.md)', 'docs/').includes('f=docs/00-vision.md'), 'relative links resolve against the document directory');
ok(('a' + NUL + 'b').includes(NUL) === true, 'NUL canary cannot detect NUL');
ok(!readFileSync(join(REPO, 'site', 'view-render.js')).includes(0), 'view-render.js contains a literal NUL byte (git will treat it as binary)');

// every real document in the artifact
const docs = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.') || ['node_modules','tools','functions'].includes(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(md|csv|json|geojson)$/.test(e)) docs.push(relative(ROOT, p));
  }
})(ROOT);
let n = 0;
for (const d of docs) {
  const text = readFileSync(join(ROOT, d), 'utf8');
  const kind = V.resolve(d);
  let html = '';
  try { html = kind === 'markdown' ? V.md(text) : kind === 'csv' ? V.csv(text) : V.json(text); }
  catch (e) { errs.push(`${d}: renderer threw ${e.message}`); continue; }
  ok(!html.includes(NUL), `${d}: NUL in output`);
  // a template failure renders `undefined` as a whole value (>undefined<, "undefined", =undefined);
  // the word in ordinary prose ("when document is undefined") is not a defect
  ok(!/(>|"|=)undefined(<|"|$)/m.test(html.replace(/<code[\s\S]*?<\/code>/g, '')), `${d}: "undefined" rendered as a value`);
  ok(!/<p><\/p>/.test(html), `${d}: empty paragraph`);
  n++;
}
// every relative markdown link must resolve inside the artifact. The Viewer resolves a link
// against the DOCUMENT'S OWN DIRECTORY (see the unit check above), so a link is checked from
// dirname(doc): `../brainstorming.md` from docs/ is right, `brainstorming.md` from docs/ is not,
// and a repo path like hub/site/x.html is never right because hub/site/ is the artifact root.
let links = 0;
for (const d of docs) {
  if (!/\.md$/.test(d)) continue;
  // fenced code is not prose: example links inside ``` blocks are not links
  const text = readFileSync(join(ROOT, d), 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const h = m[1];
    if (/^(https?:|mailto:|#)/.test(h)) continue;
    links++;
    const bare = h.split('#')[0].split('?')[0];
    const target = bare.startsWith('/') ? join(ROOT, bare) : join(ROOT, dirname(d), bare);   // '/x' is root-anchored in the Viewer
    if (!existsSync(target)) errs.push(`${d}: link target not in artifact (resolved from the document's directory): ${h}`);
  }
}

if (errs.length) { errs.forEach(e => console.error('FAIL:', e)); process.exit(1); }
console.log(`OK — 14 unit checks, ${n} workspace documents rendered clean, ${links} markdown links resolve`);
