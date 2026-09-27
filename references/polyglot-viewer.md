# hub-workspace · the Viewer leaf

One leaf that renders the workspace's non-HTML artifacts — `.md`, `.csv`, `.json`, `.jsonl`,
`.mjs`/`.js`/`.css` — inside the Shell, with the same tokens and the same print path.

**Why it exists.** Real workspaces are not all HTML. A programme carries `.md` packets, a `.csv`
model, generator scripts. Link those from the hub without a Viewer and each one is a dead-end
download: the sidebar vanishes, the tokens vanish, the back button is the only way home. The nav
contract breaks at the first `.md` link, silently, and nobody notices because the file *did* open.

**One Viewer, never one-per-type.** A `md-viewer.html` plus a `csv-viewer.html` is the file-type
grouping anti-pattern wearing a different hat. Dispatch on extension inside one leaf.

**The honest exception to file://-first.** `fetch()` is blocked on `file://` by CORS, so the
Viewer is the one leaf that needs the workspace served. It must degrade rather than fail: show
the path, a copy button, and "serve this workspace to read it inline". Every other leaf still
opens from disk. Vendoring a renderer does not fix this — the *read* is what's blocked.

**Status:** the `md()` and `csv()` below are tested — 17 checks over six real project documents
(13–78 headings, up to 14 tables, fenced code, a 35-column CSV). Two bugs the first draft
shipped are called out inline; both are the kind that look fine in review and corrupt output in
production. Keep the regression checks if you adapt this.

**Third bug, found 2026-09-02 (in a real build):** the `md()` below emits one `<p>` per source line, so
markdown hard-wrapped at 80 columns — which is what agents and editors produce — renders as a
paragraph per line, and an indented list-continuation line becomes a stray paragraph. The
six original documents happened to be soft-wrapped. Fix: buffer consecutive text lines and
flush one `<p>` on a blank line or block start; append an indented non-block line to the
open `<li>`. Add to the regression checks:
`md('line one\nline two')` must contain exactly one `<p>`, and
`md('- a\n  continues')` must contain `<li>a continues</li>`. Worked fix:
`exemplars/3pt-hub/site/view-render.js` (renderers split into their own node-safe file so
`tools/check-view.mjs` tests the shipped code).

**Sentinel note for model-authored files:** writing `'\u0000F'` as an escape is correct in
principle, but a model emitting that sequence can emit the byte itself, and the tool layer
rejects or git binarizes the file (it happened twice in one session). Build the sentinel at
runtime — `var NUL = String.fromCharCode(0)` and `new RegExp('^' + NUL + 'F\\d+' + NUL + '$')` —
so the source never carries the escape at all.

Re-verified 2026-07-28 in a second workspace over 16 real markdown documents,
7 interchange CSVs and 13 JSON/JSONL records — clean. That port added `.jsonl`, the render
caps, and the three notes below, each of which cost real debugging time.

---

## Registering it

The Viewer is one Shell entry like any leaf, but its hub cards point at query strings:

```js
// nav.js — one entry, glyph like any other leaf
{ id:'view', name:'Document viewer', href:'view.html', glyph:GLYPH.doc, group:'Reference' }
```

```html
<!-- index.html — card the documents, not the viewer -->
<a class="card" href="view.html?f=incorporation/packet.md">
  <svg …>…</svg><b>501(c)(3) packet</b>
  <span>Drafting packet — mission, activities, governance, evaluation.</span>
  <em>read →</em>
</a>
```

Card the *document* in the operator's vocabulary. "Document viewer" is plumbing; nobody goes
looking for it.

---

## The leaf

Self-contained, tokens only, no dependency. Drop in `view.html` beside the hub.

```html
<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Viewer</title>
<link rel="stylesheet" href="tokens.css">
<style>
  .doc{max-width:78ch;margin:0 auto;padding:28px 22px 90px}
  .crumb{font-family:var(--mono);font-size:11px;color:var(--ink-dim);
    display:flex;gap:10px;align-items:center;margin-bottom:18px}
  .crumb .p{color:var(--accent);word-break:break-all}
  .crumb button{font:inherit;font-size:10px;cursor:pointer;background:var(--panel);
    color:var(--ink);border:1px solid var(--line);border-radius:5px;padding:3px 9px}
  .doc h1,.doc h2,.doc h3{font-family:var(--disp);line-height:1.2;margin:1.5em 0 .5em}
  .doc h1{font-size:1.9em} .doc h2{font-size:1.4em} .doc h3{font-size:1.1em}
  .doc p,.doc li{line-height:1.62}
  .doc code{font-family:var(--mono);font-size:.9em;background:var(--panel);
    padding:1px 5px;border-radius:4px}
  .doc pre{background:var(--panel);border:1px solid var(--line);border-radius:8px;
    padding:12px 14px;overflow-x:auto}
  .doc pre code{background:none;padding:0}
  .doc pre.banner{font-size:.82em;color:var(--ink-dim);white-space:pre-wrap}
  .doc blockquote{border-left:3px solid var(--accent);margin:1em 0;padding:2px 0 2px 14px;
    color:var(--ink-dim)}
  .doc table{border-collapse:collapse;width:100%;font-size:.92em;display:block;overflow-x:auto}
  .doc th,.doc td{border-bottom:1px solid var(--line);padding:6px 12px 6px 0;text-align:left;
    vertical-align:top}
  .doc th{font-family:var(--mono);font-size:.82em;text-transform:uppercase;
    letter-spacing:.08em;color:var(--ink-dim);font-weight:500}
  .doc hr{border:none;border-top:1px solid var(--line);margin:2em 0}
  .doc .cnt{font-family:var(--mono);font-size:11px;color:var(--ink-dim)}
  .warn{border-left:3px solid var(--warn);background:color-mix(in srgb,var(--warn) 9%,transparent);
    padding:12px 15px;border-radius:0 6px 6px 0;line-height:1.6}
  @media print{.crumb{display:none}}
</style></head><body>
<div id="nav-root"></div>
<div class="doc">
  <div class="crumb">
    <span class="p" id="path"></span>
    <button id="copy">copy path</button>
    <span id="kind"></span>
  </div>
  <div id="out"></div>
</div>
<script src="nav.js"></script>
<script>
const f = new URLSearchParams(location.search).get('f') || '';
const out = document.getElementById('out');
const esc = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
document.getElementById('path').textContent = f || '(no ?f= given)';
document.title = (f.split('/').pop() || 'Viewer') + ' · Viewer';
document.getElementById('copy').onclick = e => {
  navigator.clipboard.writeText(f); e.target.textContent = 'copied ✓';
  setTimeout(() => e.target.textContent = 'copy path', 1200);
};

/* --- markdown: the commonly-used subset, deliberately not a full parser ------
   Handles fenced code, ATX headings, tables, blockquotes, hr, ordered and
   unordered lists, bold/italic/code/links. Does NOT handle nested lists,
   reference links, footnotes or inline HTML — a document needing those probably
   wants to be a leaf. */
function md(src){
  const fences = [];
  /* BUG THE FIRST DRAFT SHIPPED — the sentinel must be a character that cannot
     occur in prose. A ` ${n} ` placeholder looks fine and is wrong twice over:
     the line test `/^ \d+ $/` never matches after .trim(), so fences render as
     stray paragraphs; and the restore regex / (\d+) /g then eats any bare number
     in ordinary text ("we ordered 5 units" -> fences[5] -> undefined). Use NUL. */
  const TOK = i => '\u0000F' + i + '\u0000';
  src = src.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, body) =>
    TOK(fences.push(`<pre><code data-lang="${lang}">${esc(body)}</code></pre>`) - 1));

  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\W)\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, h) =>
      `<a href="${/^https?:|^#/.test(h) ? h : 'view.html?f=' + h}">${t}</a>`);

  const lines = src.split('\n'), html = [];
  let list = null;
  const closeList = () => { if (list) { html.push(`</${list}>`); list = null; } };

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (/^\s*$/.test(L)) { closeList(); continue; }
    if (/^\u0000F\d+\u0000$/.test(L.trim())) { closeList(); html.push(L.trim()); continue; }
    let m;
    if (m = L.match(/^(#{1,6})\s+(.*)/)) {
      closeList(); html.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(L)) { closeList(); html.push('<hr>'); continue; }
    if (m = L.match(/^>\s?(.*)/)) {
      closeList(); html.push(`<blockquote>${inline(m[1])}</blockquote>`); continue;
    }
    /* table: a header row followed by a |---| separator */
    if (L.trim().startsWith('|') && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      closeList();
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(L); i++;
      const rows = [];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) rows.push(cells(lines[++i]));
      html.push('<table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') +
        '</tr></thead><tbody>' + rows.map(r =>
          '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table>');
      continue;
    }
    if (m = L.match(/^\s*[-*+]\s+(.*)/)) {
      if (list !== 'ul') { closeList(); html.push('<ul>'); list = 'ul'; }
      html.push(`<li>${inline(m[1])}</li>`); continue;
    }
    if (m = L.match(/^\s*\d+\.\s+(.*)/)) {
      if (list !== 'ol') { closeList(); html.push('<ol>'); list = 'ol'; }
      html.push(`<li>${inline(m[1])}</li>`); continue;
    }
    closeList(); html.push(`<p>${inline(L)}</p>`);
  }
  closeList();
  return html.join('\n').replace(/\u0000F(\d+)\u0000/g, (_, n) => fences[+n]);
}

/* --- CSV: quote-aware, rendered as the table it is ------------------------ */
function csv(src){
  /* A leading #-comment banner is the provenance convention (see SKILL.md),
     not data. Lift it out — otherwise it is read as the header row and every
     column misaligns. This is the second bug the first draft shipped: a real
     35-column model rendered as one column. */
  const pre = [];
  while (/^\s*#/.test(src)) {
    const nl = src.indexOf('\n');
    if (nl < 0) { pre.push(src.replace(/^\s*#\s?/, '')); src = ''; break; }
    pre.push(src.slice(0, nl).replace(/^\s*#\s?/, ''));
    src = src.slice(nl + 1);
  }
  const banner = pre.join('\n').trim();

  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter(r => r.some(c => c.trim()));
  if (!clean.length) return '<p>Empty file.</p>';
  const num = s => s.trim() !== '' && !isNaN(s.replace(/[$,%]/g, ''));
  return (banner ? `<pre class="banner">${esc(banner)}</pre>` : '') +
    '<table><thead><tr>' + clean[0].map(c => `<th>${esc(c)}</th>`).join('') +
    '</tr></thead><tbody>' + clean.slice(1).map(r => '<tr>' +
      r.map(c => `<td${num(c) ? ' style="font-family:var(--mono);text-align:right"' : ''}>` +
        `${esc(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>' +
    `<p class="cnt">${clean.length - 1} rows · ${clean[0].length} columns</p>`;
}

const KIND = {
  md: 'markdown', markdown: 'markdown', csv: 'csv', json: 'json',
  js: 'source', mjs: 'source', css: 'source', txt: 'source', svg: 'source',
};

(async () => {
  if (!f) { out.innerHTML = '<div class="warn">No document requested. Add <code>?f=path</code>.</div>'; return; }
  if (/^[a-z]+:/i.test(f) || f.includes('..')) {   // same-workspace only
    out.innerHTML = '<div class="warn">The Viewer reads paths inside this workspace only.</div>'; return;
  }
  const ext = (f.split('.').pop() || '').toLowerCase();
  const kind = KIND[ext] || 'source';
  document.getElementById('kind').textContent = '· ' + kind;
  let text;
  try {
    const r = await fetch(f);
    if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
    text = await r.text();
  } catch (err) {
    out.innerHTML = `<div class="warn"><b>Cannot read this file from here.</b><br>
      Opening the workspace from <code>file://</code> blocks <code>fetch()</code>, so the Viewer
      needs it served:<br><br>
      <code>python3 -m http.server 8000</code><br><br>
      The path is above with a copy button. <span style="opacity:.7">(${esc(err.message)})</span></div>`;
    return;
  }
  out.innerHTML =
    kind === 'markdown' ? md(text) :
    kind === 'csv'      ? csv(text) :
    kind === 'json'     ? `<pre><code>${esc(JSON.stringify(JSON.parse(text), null, 2))}</code></pre>` :
                          `<pre><code>${esc(text)}</code></pre>`;
})();
</script></body></html>
```

---

## Regression checks worth keeping

Run these against your own documents before trusting the renderer. They are the checks that
caught both shipped bugs:

```js
md('We ordered 5 units and 12 crates.')      // must contain "5 units and 12 crates"
md('a\n\n```js\nlet x = 1\n```\n\nb')        // must contain <pre><code and "let x = 1"
                                              // and must NOT contain a stray \u0000
md('[p](p.md) [e](https://e.gov) [t](#a)')   // p -> view.html?f=p.md; the other two unchanged
csv('a,b\n"x, y","he said ""hi"""\n')        // must contain 'x, y' and 'he said "hi"'
csv('# banner\ncol1,col2\n1,2\n')            // banner lifted; 2 columns, not 1
```

Then run every real document in the workspace through `md()` and assert the output contains no
`\u0000`, no `undefined`, and no empty `<p></p>`.

---

## Notes

- **Write the sentinel as an escape sequence, never a literal NUL byte.** `'\u0000F'` in
  source is correct; a real NUL character pasted into the file works at runtime and then makes
  git treat the leaf as **binary** — no diffs, no review, and the sticky preview comment
  reviews nothing. Check with
  `python3 -c "print(b'\x00' in open('view.html','rb').read())"` before committing. The same
  trap catches your *notes*: a NUL that lands in `AGENTS.md` while documenting the sentinel is
  the same bug one level up.
- **Expose the renderers for testing.** End the IIFE with
  `window.MYVIEW = { md, csv, json, jsonl, resolve };` so the regression checks run against
  the shipped code rather than a copy that can drift from it. Then the checks are a paste into
  the console of the served page, which is cheap enough that they actually get run.
- **Make the NUL assertion able to fail.** `html.includes('\u0000')` typed into a console or a
  tool call frequently arrives as a plain space — which every HTML output contains, so every
  file "fails" and the sweep is noise. Use `String.fromCharCode(0)`, and assert a known-good
  canary reports **false** before trusting a sweep that reports zero problems.
- **Cap the big ones.** A workspace that carries model records will have a 500 KB JSON and
  600-line JSONL streams; pretty-printing those into one `<pre>` hangs the tab. Render JSON to
  a byte cap and JSONL to a record cap, each with a notice and an `open raw ↗` link to the
  actual file. JSONL reads far better as collapsed `<details>` records labelled from the
  record's own `t`/`event` fields than as a wall of text.
- **Check what is actually inside the deploy artifact.** The Viewer can only reach paths under
  the deployed root. Interchange files kept in a sibling directory (`data/` beside `site/`)
  stay unreachable, so a leaf that cites them still dead-ends — the exact thing the Viewer was
  added to fix. Either bring them inside the artifact or say plainly in the contracts file that
  they are out of reach; do not leave the citation looking live.
- **Relative markdown links resolve back through the Viewer.** `[the packet](packet.md)` becomes
  `view.html?f=packet.md`, so following a link inside a document keeps the Shell. `http(s)://`
  and `#anchor` links pass through untouched.
- **Path guard.** The Viewer refuses `..` and any `scheme:` prefix — it reads inside the
  workspace only. Keep it that way; a viewer that fetches arbitrary URLs is an exfiltration
  surface once the workspace is gated.
- **Print inherits.** The crumb is `display:none` in print, so a `.md` packet prints as a
  document. If a document is print-destiny, treat it as a *cold* leaf and give it its own
  `@page` rules rather than relying on the Viewer.
- **When to graduate a document into a leaf.** If it needs interaction, live tallies from the
  Model, or a specific print geometry, it is a leaf, not a viewed file. The Viewer is for
  artifacts whose canonical form genuinely is a `.md` or a `.csv` — packets, assumption logs,
  models someone will open in a spreadsheet.
