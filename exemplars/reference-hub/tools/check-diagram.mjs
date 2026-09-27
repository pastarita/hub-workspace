// check-diagram.mjs — parser + layout + render checks for site/diagram.js against EVERY real
// ```mermaid fence in the staged artifact. Run from hub/: tools/stage.sh && node tools/check-diagram.mjs
// The failures this catches still "look like a diagram" in review: dropped nodes, unlinked edges,
// NaN geometry, mermaid markup leaking into the SVG, a fence the reader cannot parse at all.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(REPO, '_site');
if (!existsSync(ROOT)) { console.error('FAIL: _site/ missing — run tools/stage.sh first'); process.exit(1); }
await import(join(ROOT, 'diagram.js'));
const D = globalThis.HUBDIAGRAM;
const errs = [];
const t = (name, cond, extra) => { if (!cond) errs.push(name + (extra ? ' — ' + extra : '')); };

/* --- grammar units --------------------------------------------------------- */
let g = D.parse('flowchart LR\n  A["one\\ntwo"]:::plan --> B[(db)]:::atlas -.->|"data"| C{{hex}}\n  A & B ==> D[/para/]\n  classDef plan fill:#000');
t('4 nodes', g.nodes.length === 4, String(g.nodes.length));
t('label splits on \\n', g.index.A.label.length === 2 && g.index.A.label[1] === 'two', JSON.stringify(g.index.A.label));
t('class by name', g.index.A.cls === 'plan' && g.index.B.cls === 'atlas');
t('shapes', g.index.B.shape === 'cyl' && g.index.C.shape === 'hex' && g.index.D.shape === 'para');
t('chain + fan-out = 4 edges', g.edges.length === 4, String(g.edges.length));
t('dotted kind + label', g.edges[1].kind === 'dotted' && g.edges[1].label === 'data', JSON.stringify(g.edges[1]));
t('thick kind', g.edges[2].kind === 'thick' && g.edges[3].kind === 'thick');
t('no-arrow ---', D.parse('flowchart LR\n A --- B').edges[0].arrow === false);
g = D.parse('flowchart TB\n subgraph S["title"]\n  direction LR\n  X --> Y\n end\n Z --> S\n S ==> X');
t('subgraph parsed', g.clusters.length === 1 && g.clusters[0].title === 'title' && g.index.X.cluster === 'S');
t('subgraph as endpoint is not a node', !g.index.S && g.edges.length === 3);
t('cycle lays out', !isNaN(D.layout(D.parse('flowchart LR\n A --> B --> A')).w));
t('self loop renders', /<svg/.test(D.render('flowchart LR\n A -.-|x| A')));
let chain = 'flowchart LR\n  ' + Array.from({ length: 12 }, (_, i) => 'N' + i + '[node number ' + i + ']').join(' --- ');
let L = D.layout(D.parse(chain));
t('long chain wraps serpentine', L.serpentine === true && L.w <= D.STYLE.maxW + 1, `w=${L.w}`);
t('sequence parses', D.parse('sequenceDiagram\n autonumber\n participant A as Alpha\n A->>B: hi\n loop x\n  B-->>A: yo\n end\n Note over A,B: n').items.length === 3);
t('gitGraph parses', D.parse('gitGraph\n commit id: "a"\n branch b\n checkout b\n commit id: "c" type: REVERSE\n checkout main\n merge b id: "m" tag: "t"').commits.length === 3);
t('ignores %%{init}%%', /<svg/.test(D.render('%%{init: {"theme":"base"}}%%\nflowchart LR\n A --> B')));
t('bidirectional edge', D.parse('flowchart LR\n A <--> B').edges[0].bidir === true);
g = D.parse('stateDiagram-v2\n [*] --> Running\n Running --> Done : ok\n state "group" as GR {\n  a\n  b\n }\n Running --> GR\n GR --> [*]');
t('state: start/end/composite', g.index.__start && g.index.__end && g.index.GR.shape === 'composite' && g.index.GR.label.length === 3, JSON.stringify(g.index.GR && g.index.GR.label));
t('state renders', /<svg/.test(D.render(g)));
g = D.parse('classDiagram\n class S {\n  <<interface>>\n  +read()\n }\n class F\n S <|.. F : impl\n F ..> S');
t('class: realization points at the interface', g.edges[0].to === 'S' && g.edges[0].head === 'tri' && g.edges[0].kind === 'dotted' && g.edges[0].label === 'impl', JSON.stringify(g.edges[0]));
t('class renders', /<svg/.test(D.render(g)));
t('unsupported type throws', (() => { try { D.parse('pie\n a: 1'); return false; } catch (e) { return true; } })());

/* --- every real fence ------------------------------------------------------ */
const docs = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.') || ['node_modules', 'tools', 'functions', 'fonts'].includes(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.md')) docs.push(relative(ROOT, p));
  }
})(ROOT);
let n = 0, nodes = 0, byType = {};
for (const d of docs) {
  const text = readFileSync(join(ROOT, d), 'utf8');
  for (const m of text.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
    n++;
    const src = m[1], where = `${d} #${n}`;
    let g;
    try { g = D.parse(src); } catch (e) { t(`${where}: parse failed`, false, e.message); continue; }
    byType[g.type] = (byType[g.type] || 0) + 1;
    if (g.type === 'flow') {
      for (const e of g.edges) {
        t(`${where}: edge source unknown ${e.from}`, !!(g.index[e.from] || g.cindex[e.from]));
        t(`${where}: edge target unknown ${e.to}`, !!(g.index[e.to] || g.cindex[e.to]));
      }
      const L = D.layout(g);
      t(`${where}: NaN canvas`, !isNaN(L.w) && !isNaN(L.h) && L.w > 0 && L.h > 0, `${L.w}x${L.h}`);
      for (const x of L.nodes) t(`${where}: NaN node ${x.id}`, !isNaN(x.x) && !isNaN(x.y) && x.w > 0 && x.h > 0);
      for (const c of L.clusters) t(`${where}: NaN cluster ${c.id}`, !isNaN(c.x0) && !isNaN(c.x1) && c.x1 > c.x0 && c.y1 > c.y0);
      nodes += L.nodes.length;
    }
    let svg = '';
    try { svg = D.render(g); } catch (e) { t(`${where}: render threw`, false, e.message); continue; }
    t(`${where}: no svg`, svg.startsWith('<svg'));
    t(`${where}: NaN in svg`, !/NaN/.test(svg));
    t(`${where}: undefined in svg`, !/undefined/.test(svg));
    t(`${where}: mermaid markup leaked`, !/\\n|<br|:::|-->|classDef/.test(svg.replace(/<text[\s\S]*?<\/text>/g, m2 => m2.replace(/-->/g, ''))));
  }
}
if (errs.length) { for (const e of errs) console.error('FAIL:', e); process.exit(1); }
console.log(`OK — 22 grammar checks, ${n} real diagrams rendered (${Object.entries(byType).map(([k, v]) => v + ' ' + k).join(', ')}), ${nodes} flow nodes, 0 NaN, 0 unresolved endpoints`);
