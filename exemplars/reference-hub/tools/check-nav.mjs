// check-nav.mjs — the Register's consistency checker. Run from hub/: tools/stage.sh && node tools/check-nav.mjs
// The type-check for the IA. Runs against the STAGED artifact (hub/_site/) — what actually ships.
// Validates nav.js (single source of IA) + hub-data.js against disk:
//   1. slugs unique; every sidebar entry has a minted glyph; ids unique and match W.DOCS
//   2. every cluster key in GROUPS exists in nav CLUSTERS AND in W.CLUSTERS (one namespace)
//   3. the EMITTED href (from the real href() in nav.js) resolves literally on disk,
//      ends in .html (or routes through view.html?f=<existing file>)
//   4. nav.js never derives hrefs from the page's own URL (bans the bug CLASS)
//   5. every HTML leaf includes the shell and the tokens, has no external deps, and is reachable
//   6. no href points at a raw .md/.csv (documents route via the Viewer); W.DOCS docs exist
//   7. the hub cards every sidebar slug except the Viewer; no literal counts in stat tiles
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(REPO, '_site');
if (!existsSync(ROOT)) { console.error('FAIL: _site/ missing — run tools/stage.sh first'); process.exit(1); }
await import(join(ROOT, 'hub-data.js'));
await import(join(ROOT, 'nav.js'));
const W = globalThis.W, N = globalThis.HUBNAV;
const errs = [], warns = [];
const bad = m => errs.push(m);
if (!W) bad('hub-data.js did not define globalThis.W');
if (!N) bad('nav.js did not define globalThis.HUBNAV');
if (errs.length) { errs.forEach(e => console.error('FAIL:', e)); process.exit(1); }

const SHELL_EXEMPT = [];           // declared shell-less leaves (none yet)
const DECLARED = ['view.html'];    // plumbing: has a glyph, no card

// 4 — ban the class, not the instance (comments stripped so documenting the rule does not trip it)
const navSrc = readFileSync(join(ROOT, 'nav.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
if (/location\.(protocol|host|hostname)/.test(navSrc)) bad('nav.js derives hrefs from the page URL — hrefs must always carry .html');

// 1–3, 6
const slugs = new Set(), ids = new Set();
const docIds = new Set(W.DOCS.map(d => d.id));
for (const [cluster, entries] of N.GROUPS) {
  if (cluster && !N.CLUSTERS[cluster]) bad(`GROUPS cluster "${cluster}" missing from nav CLUSTERS`);
  if (cluster && !W.CLUSTERS[cluster]) bad(`GROUPS cluster "${cluster}" missing from W.CLUSTERS — two namespaces`);
  for (const [slug, label, id] of entries) {
    if (slugs.has(slug)) bad(`duplicate slug ${slug}`); slugs.add(slug);
    if (!N.GLYPH[slug]) bad(`${slug}: sidebar entry with no glyph`);
    if (!label) bad(`${slug}: no label`);
    if (id) { if (ids.has(id)) bad(`duplicate id ${id}`); ids.add(id); if (!docIds.has(id)) bad(`${slug}: id ${id} not in W.DOCS`); }
    const emitted = N.href(slug);
    if (!emitted.startsWith('./')) bad(`${slug}: href not relative: ${emitted}`);
    const [pathPart, query] = emitted.replace(/^\.\//, '').split('?');
    if (!/\.html$/.test(pathPart)) bad(`${slug}: emitted href does not end in .html (404 on any static server): ${emitted}`);
    if (!existsSync(join(ROOT, pathPart))) bad(`${slug}: emitted href target missing in _site: ${pathPart}`);
    if (/\.(md|csv)$/.test(pathPart)) bad(`${slug}: raw document href — route via view.html?f=`);
    if (query) {
      const f = decodeURIComponent(new URLSearchParams(query).get('f') || '');
      if (!f) bad(`${slug}: viewer href without f=`);
      else if (!existsSync(join(ROOT, f))) bad(`${slug}: viewer target missing in _site: ${f}`);
    }
  }
}
for (const k of Object.keys(N.CLUSTERS)) if (!W.CLUSTERS[k]) bad(`nav CLUSTERS has "${k}" but W.CLUSTERS does not`);
for (const k of Object.keys(W.CLUSTERS)) if (!N.CLUSTERS[k]) bad(`W.CLUSTERS has "${k}" but nav CLUSTERS does not`);
for (const d of W.DOCS) {
  if (!existsSync(join(ROOT, d.doc))) bad(`${d.id}: doc missing in _site: ${d.doc}`);
  if (!W.CLUSTERS[d.cluster]) bad(`${d.id}: unknown cluster ${d.cluster}`);
  if (!slugs.has(d.slug)) warns.push(`${d.id} (${d.slug}) is in the Register but not in the sidebar`);
}
for (const k of Object.keys(N.FRESH)) if (!slugs.has(k)) bad(`FRESH marks unknown slug ${k}`);
if (!existsSync(join(ROOT, 'view.html'))) bad('view.html missing — every document card dead-ends');

// 8 — documents are markdown; HTML under docs/ is a leaf that escaped the site root (no shell
//     highlight, no lint sweep, relative links break). Leaves live in site/.
(function walkDocs(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walkDocs(p);
    else if (e.endsWith('.html')) bad(`${relative(ROOT, p)}: HTML under docs/ — move it to site/ as a leaf and register it`);
  }
})(join(ROOT, 'docs'));

// 5, 7 — sweep the staged tree
const leaves = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.') || ['node_modules','tools','functions','docs'].includes(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.html')) leaves.push(relative(ROOT, p));
  }
})(ROOT);
const hub = readFileSync(join(ROOT, 'index.html'), 'utf8');
const hubHrefs = new Set([...hub.matchAll(/href="\.\/([^"#?]+)/g)].map(m => m[1]));
const emittedPaths = new Set([...slugs].map(s => N.href(s).replace(/^\.\//, '').split('?')[0]));
for (const leaf of leaves) {
  const src = readFileSync(join(ROOT, leaf), 'utf8');
  const hasShell = /<script src="(\.\/|(\.\.\/)+)?nav\.js"><\/script>/.test(src);
  const exempt = SHELL_EXEMPT.includes(leaf);
  if (!hasShell && !exempt) bad(`${leaf}: leaf missing the shell (<script src="./nav.js">)`);
  if (!/hub\.css/.test(src) && !exempt) bad(`${leaf}: leaf does not link hub.css (tokens)`);
  if (/<(script|link)[^>]+(src|href)="https?:\/\//.test(src)) bad(`${leaf}: external dependency — leaves are self-contained`);
  const reachable = leaf === 'index.html' || emittedPaths.has(leaf) || hubHrefs.has(leaf) || DECLARED.includes(leaf);
  if (!reachable) bad(`${leaf}: unreachable — not in the Register, not carded, not declared`);
}
for (const s of slugs) {
  if (s === 'index') continue;
  const h = N.href(s).replace(/^\.\//, '');
  const carded = [...hub.matchAll(/href="\.\/([^"]+)"/g)].some(m => m[1] === h);
  if (!carded) bad(`${s}: in the sidebar but not carded on the hub (${h})`);
}
for (const m of hub.matchAll(/class="n"[^>]*>\s*(\d+)\s*</g)) bad(`index.html: literal count "${m[1]}" in a stat tile — tallies are DERIVED from the Model at load`);

for (const w of warns) console.log('warn:', w);
if (errs.length) { for (const e of errs) console.error('FAIL:', e); process.exit(1); }
console.log(`OK — ${slugs.size} sidebar entries, ${W.DOCS.length} documents in the Register, ${leaves.length} HTML leaves, ${Object.keys(N.CLUSTERS).length} clusters, 0 errors`);
