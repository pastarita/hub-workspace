# hub-workspace · copy-paste skeletons

## Scaffold checklist (day zero → first gated deploy)

```
repo/
├── site/                    # or repo root IS the site (small hubs)
│   ├── index.html           # hub: groups = phases, cards only
│   ├── nav.js               # Shell (below)
│   ├── <project>-data.js    # Model: records + tokens + helpers
│   ├── favicon.svg
│   └── *.html               # leaves
├── functions/_middleware.js # Gate (below) — MUST sit beside/above the deploy cwd
│                            # ⚠ root-as-site: `wrangler pages deploy .` uploads EVERY file in
│                            #   the tree — .gitignore does not govern the upload. No secret file
│                            #   (.dev.vars, *.env) may exist in the tree at all; keep the local
│                            #   copy in ~/.config/<project>/ instead. (A real build shipped one, 2026-09-02.)
├── .github/workflows/deploy.yml
├── wrangler.jsonc           # { "name": "<project>", "pages_build_output_dir": "site" }
├── CLAUDE.md / AGENTS.md    # conventions + hard rules + leaf skeleton
└── .gitignore               # .dev.vars, *.env, .wrangler/, node_modules/
```

1. `wrangler pages project create <project>` (needs a staged dir to exist first) · 2. **Cloudflare
Access app + `<Project> team` policy + One-time PIN provider, restricted to PIN** — the click
path is `references/access-runbook.md`, do it before writing a leaf · 3. read
`ACCESS_TEAM_DOMAIN` + `ACCESS_AUD` from the app's redirect (`kid=`), `wrangler pages secret put`
both in production *and* `--env preview`, plus `ACCESS_PASS` for the second door · 4. Gate that
verifies the assertion (crib the `exemplars/reference-hub/functions/_middleware.js`) · 5. hub + Shell + one
leaf · 6. deploy from the dir containing `functions/` · 7. verify: anon 302 → team domain,
forged header 302, preview 302 · 8. **the non-owner collaborator signs in with a PIN** · 9.
Actions secrets → CI green · 10. AGENTS.md records all of it, including the team domain and
policy name.

## Leaf skeleton

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" type="image/svg+xml" href="./favicon.svg" />
<title>PROJECT · Leaf Name</title>
<script src="./PROJECT-data.js"></script>
<style>
  :root{/* tokens come from the project; never invent per-leaf */}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--body);
    font:14.5px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  .wrap{max-width:1240px;margin:0 auto;padding:14px 20px 44px}
  h1.compact{margin:2px 0 6px;font-size:19px;font-weight:800;color:var(--pine);
    display:flex;align-items:baseline;gap:9px}
  h1.compact small{font-size:11.5px;font-weight:600;color:var(--muted)}
  @media print{#hubnav{display:none!important}} /* shell hides itself; keep leaves print-clean */
</style>
</head>
<body>
<script src="./nav.js"></script>
<div class="wrap">
  <h1 class="compact">Leaf Name <small>one-line purpose</small></h1>
  <!-- content -->
</div>
<script>(function(){ /* leaf logic; state via localStorage 'PFX_*' keys only */ })();</script>
</body>
</html>
```

## Shell — nav.js (minimal working core)

```js
/* PROJECT · shared nav shell — single source of IA. */
(function(){
  if(window.__hubnav)return; window.__hubnav=1;
  var cur=(location.pathname.split('/').pop()||'index').replace(/\.html$/,'')||'index';
  /* ALWAYS emit .html. Do NOT branch on location.protocol — see the
     "Link resolution" note below; extensionless slugs 404 on every plain
     static server, which is what local preview and most CI containers are. */
  function href(s){var d=PATH[s]||'';
    return /\/$/.test(d)?'./'+d+'index.html':'./'+d+s+'.html';}
  function g(d){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+d+'</svg>';}
  var GLYPH={ 'index':g('<path d="M3 8h18v10H3Z"/><path d="M3 8l2-3h14l2 3"/>')
    /* one unique hand-drawn glyph per leaf — this IS the project's iconography */ };
  var CLUSTERS={ /* key:{label:'…',color:'#…'} — cluster registry; ONE namespace: the hub
    cards, group headings, accents, and prose all key into this same object */ };
  var GROUPS=[['',[['index','Hub']]]
    /* ,[clusterKey,[[slug,label],…]] — REGISTERING A LEAF = ONE ENTRY HERE */];
  var PATH={};  /* slug → 'nested/dir/' route table for leaves below the site root */
  var FRESH={}; /* slug → 1 · transient new-markers; retire per SKILL.md → Fresh markers */
  var css="#hubnav{position:fixed;left:0;top:0;bottom:0;width:186px;background:var(--pine,#1d2c26);z-index:100000;display:flex;flex-direction:column;font:600 12.5px/1 -apple-system,sans-serif}"
   +"body{margin-left:186px!important}"
   +"html.navmin #hubnav{width:52px}html.navmin body{margin-left:52px!important}"
   +"html.navmin #hubnav a span{display:none}"
   +"#hubnav a{color:#c9d6cd;text-decoration:none;padding:10px 16px;display:flex;gap:10px;align-items:center}"
   +"#hubnav a.on{color:#fff;box-shadow:inset 3px 0 0 var(--flag,#e8703b)}"
   +"#hubnav a svg{width:17px;height:17px}"
   +"#hubnav .nv-grp{padding:12px 16px 4px;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;opacity:.62}html.navmin #hubnav .nv-grp{display:none}"
   +"#hubnav .nv-dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--flag,#e8703b);vertical-align:middle;margin-left:5px}"
   +"@media(max-width:900px){#hubnav{position:sticky;height:48px;width:auto;flex-direction:row;bottom:auto;align-items:center;overflow-x:auto}body{margin-left:0!important}"
   +"#hubnav a span,#hubnav .nv-grp,#hubnav .nv-min{display:none}#hubnav a.on{box-shadow:inset 0 -3px 0 currentColor}"
   +"/* narrow = GLYPHS ONLY — full labels overflow the strip; the glyph set IS the compact nav. + hamburger: see exemplars/reference-hub/site/nav.js */}"
   +"@media print{#hubnav{display:none!important}body{margin-left:0!important}}";
  function run(){
    var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
    var nav=document.createElement('nav');nav.id='hubnav';
    nav.innerHTML=GROUPS.map(function(gr){
      var c=CLUSTERS[gr[0]]||{};
      var head=gr[0]?'<div class="nv-grp"'+(c.color?' style="color:'+c.color+'"':'')+'>'+(c.label||gr[0])+'</div>':'';
      return head+gr[1].map(function(p){return '<a class="'+(p[0]===cur?'on':'')+'" href="'+href(p[0])+'">'+(GLYPH[p[0]]||'')+'<span>'+p[1]+(FRESH[p[0]]?'<i class="nv-dot"></i>':'')+'</span></a>';}).join('');
    }).join('')
      +'<button class="nv-min" style="margin-top:auto;border:0;background:none;color:#9db5a8;cursor:pointer;padding:10px">⇤⇥</button>';
    document.body.insertBefore(nav,document.body.firstChild);
    if(localStorage.getItem('hub_nav')==='min')document.documentElement.classList.add('navmin');
    nav.querySelector('.nv-min').onclick=function(){var m=document.documentElement.classList.toggle('navmin');m?localStorage.setItem('hub_nav','min'):localStorage.removeItem('hub_nav');};
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',run):run();
})();
```

Full-featured reference (mobile hamburger, GROUPS, FRESH, PATH, viewer-routed sidebar
entries via a `ROUTE` map, always-`.html` hrefs, node-safe export for lints):
`exemplars/reference-hub/site/nav.js`. **Do not crib a Shell that branches on
`location.protocol`** — such a Shell 404s its own rail on every plain static server, and
the hub cards keep working, so nobody notices (see *Link resolution* below).

Cross-hub estate strip (regex active-detection, root resolved from the script's own `src` —
works at any depth over `file://`): the reference implementation is inline in
`references/estate.md` §2–3.
Identity registries (`id/slug/verb/cluster/glyph` tuple, cluster records, status glyphs,
URNs): see `references/symbolic-system.md`.

### Link resolution — always emit `.html`, never sniff the environment

The Shell is the one component that *computes* its own hrefs, so it is the one
component that can break by being hosted somewhere new. An earlier version of this
template branched on `location.protocol === 'file:'` and emitted bare extensionless
slugs over http, on the assumption that http implies Cloudflare Pages. It does not.
There are **three** environments, not two:

| Environment | `./leaf` | `./leaf.html` |
|---|---|---|
| `file://` | broken | ✅ |
| plain static server (`python3 -m http.server`, `npx serve`, bare nginx, most CI preview containers) | **404** | ✅ |
| Cloudflare Pages | ✅ | ✅ (308 → `/leaf`) |

`.html` is the only string correct in all three. The Pages redirect is one hop and is
the deliberate price of a rail that cannot break by being hosted somewhere new.

**This failure is nastier than it looks, for two reasons.** First, the hub cards write
`./leaf.html` *literally*, so every path clicked from the hub keeps working — only the
rail breaks, and only when served. Second, the obvious lint ("does `leaf.html` exist on
disk?") checks the **wrong end of the link**. It passes while every rail link 404s.

Lint the *emitted string*, by extracting the real `href()` from `nav.js` rather than
reimplementing it (a copy drifts):

```js
const body = readFileSync('site/nav.js','utf8').match(/function href\(s\)\s*\{([\s\S]*?)\n  \}/)[1];
const href = new Function('s','PATH', body);
for (const s of slugs) {
  const emitted = href(s, PATH);
  assert(existsSync(join(SITE, emitted.replace(/^\.\//,''))));   // resolves literally
  assert(/\.html$/.test(emitted));                                // static-server safe
}
assert(!/location\.(protocol|host|hostname)/.test(body));         // the bug CLASS
```

Strip comments from `nav.js` before that last assertion — a Shell that *documents* the
rule in a comment ("never branch on location.protocol") fails its own lint otherwise. And
accept `./nav.js` as well as `nav.js` when checking that a leaf includes the shell.

That last assertion is the one that matters — it bans the *category*, not the instance.

**Serve previews the way production routes.** Ship a preview server that does
Pages-style extensionless resolution (`/foo` → `foo.html`, `/foo/` → `foo/index.html`)
so a local preview is a faithful one and both link styles resolve while you migrate.
Give its 404 the list of paths it tried — a bare "File not found" is what makes this
bug cost an afternoon. Worked exemplar: `exemplars/reference-hub/tools/serve.py`.

Two more hard-won Shell rules:

- **Be defensive against leaf CSS.** Leaves style bare `a{}` (borders, underline colors) and
  those rules bleed into the injected shell. Reset every bleedable property explicitly on
  `#nav a`: `border:0;border-bottom:0;background:transparent` plus an explicit `font:`.
- **Ship a Register lint.** A one-file checker (`tools/check-nav.mjs`) that imports the
  node-safe nav.js (guard: define the registry on `globalThis`, `return` before DOM work when
  `document` is undefined) and validates: ids unique + cluster-prefix-consistent, slugs unique,
  clusters exist, every href target exists on disk (viewer targets through `?f=`), every
  sidebar entry has a glyph, every HTML leaf includes the shell or is declared shell-less,
  every leaf reachable (carded / lane-reached / declared), no raw `.md`/`.csv` hrefs. Run it
  after every Register change — it is the type-check for the IA. Worked exemplar:
  `exemplars/reference-hub/tools/check-nav.mjs`.

## Gate — functions/_middleware.js

**Access fronts the hostnames; this file verifies the assertion Access attaches and keeps the
Basic door beside it.** The full two-door verifier (RS256 against the team certs, pinned `kid`,
`iss`/`aud`/`exp`, 503 on unreachable keys, no `DISABLE_GATE`) is
`exemplars/reference-hub/functions/_middleware.js` — copy it whole. The Basic-only
skeleton below is the *second door* on its own, kept for reference; it is not a day-zero gate
any more.

```js
export async function onRequest(ctx){
  const { request, env, next } = ctx;
  // no DISABLE_GATE — see SKILL.md → Gate
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Basic ')) {
    const [user, pass] = atob(auth.slice(6)).split(':');
    const domainOk = /@yourdomain\.tld$/.test(user);    // domain-constrained users
    if (domainOk && pass === env.ACCESS_PASS) return next();
  }
  return new Response('Authentication required', { status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="workspace"' } });
}
```

Secret: `npx wrangler pages secret put ACCESS_PASS --project-name=<project>` then redeploy.

## CI — .github/workflows/deploy.yml

```yaml
name: Deploy to Cloudflare Pages
on:
  push: { branches: [main] }
  pull_request: {}
  workflow_dispatch: {}
concurrency: { group: pages-deploy, cancel-in-progress: true }
permissions: { contents: read, deployments: write }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          # PRs auto-deploy to a preview URL; main deploys production.
          command: pages deploy site --project-name=<project> --branch=${{ github.head_ref || 'main' }}
```

## Verification (after any gate-touching deploy)

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://<project>.pages.dev/            # 401
curl -su 'a@yourdomain.tld:PASS' -o /dev/null -w '%{http_code}\n' https://<project>.pages.dev/   # 200
curl -su 'x@elsewhere.com:PASS' -o /dev/null -w '%{http_code}\n' https://<project>.pages.dev/    # 401
```

## PDF export of cold leaves

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --window-size=1600,1000 --no-pdf-header-footer --virtual-time-budget=9000 \
  --print-to-pdf=out.pdf "file:///abs/path/leaf.html"
# window-size large → desktop media queries; @page in the leaf sets the paper size;
# .slide:last-of-type{page-break-after:auto} prevents a blank trailing page.
```

## The exemplar (read before building)

Everything cited in this file as `exemplars/reference-hub/…` ships in this repo and runs:
`make -C exemplars/reference-hub check preview`.

| File | Study it for |
|---|---|
| `site/nav.js` | The Shell: GROUPS + cluster registry, one glyph per leaf, FRESH, PATH, `ROUTE` to the Viewer, `.html` hrefs, node-safe export |
| `site/index.html` + `site/hub-data.js` | Hub and Model: grouped cards keyed to the same cluster namespace, tallies interpolated from the Model |
| `site/view.html` + `site/view-render.js` | The polyglot Viewer (`references/polyglot-viewer.md`) |
| `site/diagram.js` | The diagram reader with a declared typesetting system |
| `functions/_middleware.js` | The two-door Gate: verified Access assertion, Basic beside it, 503 on unreachable keys |
| `tools/check-nav.mjs` · `check-view.mjs` · `check-diagram.mjs` | The three lints, run against the staged artifact |
| `tools/serve.py` · `tools/stage.sh` · `Makefile` | A Pages-faithful preview, staging, and the deploy targets |
| `tools/access-setup.sh` | Idempotent Access app + policy creation over the API |

The other recipes in SKILL.md (composition grid, guide sheet, parallelization schedule, call
sheet, WYSIWYG gantt, print families) are described in enough detail to build from.

---

## Re-entry set (see SKILL.md → Re-entry)

Three files, built together. Namespace `{ns}` is the workspace's storage prefix.

**Changelog** — waves of entries, each `[key, lane, title, sentence, [label, href]|null, sha]`:

```js
var WAVES = [
  ['Jul 16–17', 'The rails go in', 'Why this wave happened, one sentence.', [
    ['ci', 'orient', 'CI rails — previews and production deploy',
     'What it is and why it exists, one honest sentence.',
     ['See the estate', './deployments.html'], 'd966b1e'],
  ]],
];
// read-state: {ns}_changelog_v1  ·  { entryKey: true }
```

Below the feed, two sections that are not optional: **"What did not move"** (a `.rulebox`
listing the missed dates, the uncalibrated numbers, the things still gated) and **"Where you
come in"** naming the returner's open issues with deep links.

**Tour** — groups by lane; stops carry what-it-is, what-to-do, and the delta:

```js
// Groups: [laneKey, laneHeading, laneColor, stops[]]
// Stops:  [key, glyphPath, name, temp, whatItIs, whatToDoThere, sinceLastVisit|null, href]
// read-state: {ns}_tour_v1  ·  { stopKey: true }
```

Index the stop fields off the *stop* array, not the group — an assumed lane field on each stop
shifts every index by one and renders the description inside the temperature chip. Cheap to
miss in review, obvious in a browser: open it before you commit.

**Catch-up band** — first element after the hub `<header>`, above the stat tiles:

```js
var CHG_TOTAL = 20, TOUR_TOTAL = 14;   // keep in step with the two leaves
function meter() {
  function n(key) {
    var s = {}; try { s = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) {}
    return Object.keys(s).filter(function (k) { return s[k]; }).length;
  }
  var c = n('{ns}_changelog_v1'), t = n('{ns}_tour_v1');
  document.getElementById('meter').textContent = c || t
    ? 'changelog ' + c + '/' + CHG_TOTAL + '  ·  tour ' + t + '/' + TOUR_TOTAL
    : 'nothing marked read in this browser yet';
}
```

Style it on the dark band token, two buttons (primary → Changelog, secondary → Tour). Record
the two totals in `AGENTS.md` beside the storage keys — they are the one place those leaves
are not self-describing.

**Route shell for a mirrored surface** — when the thing you are announcing lives outside the
deployable tree behind a sync script. The shell is hand-authored and must sit **outside** the
synced directories (`--delete` eats anything inside them that the source lacks); it iframes
the mirrored file and sets the two nav globals:

```html
<a class="back" href="../../../index.html">&larr; Hub</a>
<iframe src="../mirror/lab.html"></iframe>
<script>window.__hubroot = '../../../'; window.__hubcur = 'mirrored-lab';</script>
```

Register it in the Shell with a `PATH` entry (`key → dir/`) so `href()` resolves it to
`dir/index.html`.

---

## Provenance badge (see SKILL.md → Provenance discipline)

One component, three states, status hues only — never a categorical accent. Every figure in an
agent-co-authored artifact wears one, rendered where a reader sees it.

```css
.pv{display:inline-block;font-family:var(--mono);font-size:8.5px;letter-spacing:.1em;
  padding:1px 6px;border-radius:3px;border:1px solid;white-space:nowrap;vertical-align:middle}
.pv.d{color:var(--good); border-color:color-mix(in srgb,var(--good) 45%,transparent);
      background:color-mix(in srgb,var(--good) 10%,transparent)}   /* DERIVED    */
.pv.a{color:var(--warn); border-color:color-mix(in srgb,var(--warn) 45%,transparent);
      background:color-mix(in srgb,var(--warn) 10%,transparent)}   /* AUTHORED   */
.pv.c{color:var(--alert);border-color:color-mix(in srgb,var(--alert) 45%,transparent);
      background:color-mix(in srgb,var(--alert) 10%,transparent)}  /* TO CONFIRM */
```

```html
<span class="pv d">DERIVED</span> — summed over <code>records[].cost</code> at page load
<span class="pv a">AUTHORED</span> — planning estimate, not a quote
<span class="pv c">TO CONFIRM</span> — awaiting the counterparty
```

**Section-level lead.** A badge on a number is not enough when a whole section is voiced
prose — state the provenance rule for the section once, at its head, and gloss each figure
with the field it came from. Do NOT enumerate ("the only figures spoken are X, Y, Z"): the
enumeration goes stale the moment anyone edits a sentence, and an inaccurate provenance claim
is worse than none. State the *rule*, not the inventory.

**Derived means derived.** If it wears `pv d`, a script must reproduce it from the Model. Ship
that script next to the artifact so the claim is auditable, and re-run it before every publish.
Once any figure has an upstream source outside the workspace, this grows into the full
two-file / two-script form — an authored Model, a generated derived file, a generator, and a
verifier that recomputes from source (including the prose claims) rather than re-reading the
generator's output. See `references/derived-layer.md`.
