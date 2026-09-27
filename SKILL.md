---
name: hub-workspace
description: >
  Build, extend, or review a "hub workspace" — a flat-HTML artifact collection with a grouped
  index hub, a shared collapsible sidebar (nav.js), a single data-layer JS file, custom per-page
  SVG glyphs, print-destiny leaves, an access-gated Cloudflare Pages deployment, and CI — the
  house pattern for AI-collaborative project sites. Trigger when asked to: create a project
  workspace/hub/console site, add a surface/page/leaf to one, set up a collaborative
  agent-editable site with preview deploys behind a login, make a call sheet / dashboard /
  gantt / one-pager / deck family that shares a design system, codify "the sidebar hub
  pattern", or build an "estate" / multi-hub navigator that lets several existing hubs reach
  each other. Working exemplar in this repo: exemplars/3pt-hub (Shell, Model, Viewer, diagram
  reader, two-door Access gate, three lints, Pages-faithful preview, CI).
---

# Hub Workspace

A **hub workspace** is a deployable folder of flat, self-contained HTML artifacts organized by a
single grouped index and a shared sidebar, built so that humans and agents co-author it safely:
no build step, one-file-per-artifact, one shared data layer, one access gate, one CI pipeline.
It optimizes for **agent legibility** (every artifact is one readable/writable file), **operator
legibility** (navigation mirrors the phases of the work), and **collaboration safety** (drafts
local, main is live, everything behind a gate).

## Vocabulary (the strong definitions — use these words)

- **Hub** — `index.html`. A grouped, annotated table of contents. Groups = **phases of the
  operation** (never file types). Cards = glyph + name + one sentence + a "go" verb. The hub
  holds navigation and live tallies only — never content.
- **Leaf** — one self-contained HTML artifact (`kebab-case-noun-phrase.html`). Inline CSS/JS,
  no external deps (vendor a lib only if truly needed, once). Must work from `file://`.
- **Viewer** — `view.html?f=<path>`. One leaf that renders the workspace's *non-HTML*
  artifacts — `.md` packets, `.csv` models, `.json` fixtures, `.jsonl` event streams, `.mjs`
  generators — inside the Shell, with the same tokens and the same print path. Without it,
  every such file is a dead-end download and the nav contract quietly breaks at the first
  `.md` link. One Viewer, never one-viewer-per-type. Card the *documents*, not the viewer, and
  deep-link it from whatever claim cites a file — a measured quantity that opens the takeoff
  record it came from is the difference between an assertion and evidence. It can only reach
  paths **inside the deploy artifact**: files in a sibling directory stay dead ends.
- **Shell** — `nav.js`. The single source of IA: one nested `GROUPS` array
  (`[clusterKey, [[slug,label],…]]` — flat `PAGES` is the degenerate single-cluster case,
  not the default), one custom 24×24 stroke-drawn SVG glyph per leaf, collapsible desktop
  rail (persisted), mobile hamburger, hidden on print, plus a `PATH` route table for nested
  leaves and the `FRESH` marker map. Adding a page to the site = one array entry.
  **Hrefs always carry `.html` and never branch on `location.protocol`** — the Shell is the
  only component that computes its own links, so it is the only one that can break by being
  hosted somewhere new. Extensionless slugs 404 on every plain static server, and the hub
  cards keep working, so the failure hides. See `references/templates.md` -> *Link resolution*.
- **Register** — the identity tuple every module (lane, lab, program) carries in the Model:
  `id · slug · name · verb · cluster · epigram · glyph`. `slug` is the join key, stable
  forever; `id` is the spoken ordinal (`L01`, `D3`), rendered in the sidebar row, not hidden
  in data; `cluster` keys into a cluster registry (`{key:{label,color}}`) — clusters are
  records, never free-text headings. See `references/symbolic-system.md`.
- **Estate** — the tier above one hub, in two topologies. **Federated:** peer hubs joined by
  *role*, each owning its own Shell, tokens and namespace, stitched by an `estate_nav.js`
  strip. **Layer:** layer-major directories, one module cutting all layers, joined by `slug`;
  cross-layer artifacts resolve by string template, never by index. The strip **federates
  tools, not documents** — document layers are reached *through* the estate hub and carry no
  strip. Build it only over hubs that already work. See `references/estate.md`.
- **Model** — one shared data JS file (e.g. `scout-data.js`): domain records, design tokens,
  glyph/art helper APIs. All leaves read the same model; interactive state lives in
  `localStorage` under one key prefix (e.g. `chx_*`) so a later sync Worker is just another
  reader/writer, not a migration.
- **Gate** — **Cloudflare Access first, One-time PIN always, from day zero.** One self-hosted
  Access app over `<project>.pages.dev` *and* `*.<project>.pages.dev`, one reusable policy
  (`<Project> team`: emails-ending-in your domain OR the principals' actual login addresses,
  consumer Gmail included), and the app restricted to the **One-time PIN** provider. Not the
  "Cloudflare" provider — it signs in only members of the Cloudflare account and fails every
  collaborator with *"Failed to fetch user group information"*. The click path, the URL shape,
  how to read the AUD out of the redirect, and the failure table are in
  `references/access-runbook.md`; follow it verbatim, by hand or through browser automation.
  Beside Access, `functions/_middleware.js` **verifies the Access assertion** (signature, issuer,
  audience, expiry; 503 when keys are unreachable) and keeps Basic auth as the second door for
  curl and for the day the app is removed — two doors, one room. Everything, assets included,
  sits behind it. The old Tier 0 (Basic auth alone) is no longer a starting state; it is only
  ever the second door. Tier 2 (self-service request-and-approve over KV) is the graduation the
  first time someone outside the policy needs in without you editing it; it runs beside Access,
  never instead. No `DISABLE_GATE`, ever. See `references/collaborator-access.md`.
- **Rails** — CI (`.github/workflows/deploy.yml`): deploy `site/` (or repo root) to Cloudflare
  Pages on merge to main; **preview URL per PR**. "The hub is the deploy: if it's on main,
  it's live."
- **Contracts** — `CLAUDE.md` / `AGENTS.md` / `CONTRIBUTING.md`: build conventions, hard rules
  (e.g. draft-review gates for anything that sends in a human's name), and the leaf skeleton
  agents copy.
- **Temperatures** — every leaf is *hot* (stateful working surface: console, call sheet, map,
  gantt — revisited daily), *warm* (model/decision canvas: thesis, scenarios, briefs), or
  *cold* (print-destiny: posters, one-pagers, decks, call orders). Hubs list hot first; cold
  leaves get `@page` print CSS and `print-color-adjust: exact`.
- **Re-entry surfaces** — `changelog.html` + `tour.html` + a catch-up band on the hub. What a
  collaborator who has drifted for weeks lands on instead of a grouped index that looks the
  same as it did when they left. See *Re-entry* below; skipping them is why "just send me a
  call invite" replaces reading the workspace.
- **Fresh markers** — transient point-identifiers in the Shell (`FRESH = { key: 1 }`) marking
  surfaces added since the last check-in. Retire at each check-in — **except** when the person
  they mark for has not walked the workspace since an earlier one; retire against the
  *audience's* last visit, not the calendar. The Changelog is the durable record; these dots
  are wayfinding and are allowed to be stale in the audience's favor.

## The three moves (adding an artifact — the only moves)

1. **Write the leaf** — copy the skeleton (references/templates.md), kebab-case noun-phrase
   name in the operator's vocabulary (`storage-decision.html`, not `page2.html`), tokens only,
   self-contained.
2. **Register it** — one entry in the Shell's array, under the phase it belongs to, with a
   custom glyph.
3. **Card the hub** — one card on `index.html`: glyph, name, one honest sentence, a go-verb.

If a change needs a fourth move, the pattern is being violated — stop and reconsider.

## Design-system discipline

- **Tokens once, in one place** (the Model or one CSS file): palette, lines, shadows, radius.
  Dark-base and paper-base systems both work — pick per project, never mix within one.
- **Semantic accents**: assign colors by *meaning* (lane, status, diagram type), not
  decoration. A diagram grammar that declares intent (`%% type: technical|flow|system|data` →
  cyan/gold/green/violet) is the model: intent declared, theme applied.
- **Glyphs are identity**: every leaf gets a unique hand-drawn 24×24 stroke SVG in the Shell.
  No icon fonts, no emoji in chrome.
- **Explicit breakpoints as tokens** (test 900/760/560); nav changes *shape* on mobile
  (rail → header+hamburger), overlays beat inline drawers, wide tables scroll inside their
  own container.
- **Instant tooltips** (`[data-tip]::after`) read as first-class UI; anything tooltip-only
  must also exist somewhere tappable.

## Option algebra (the menu layer)

Hot leaves earn their temperature through controls, and ad-hoc controls are how a console
becomes unreadable. There are four shapes. They are declared as **records**, and the derived
result is what gets rendered — never a hand-maintained answer.

- **Named option vectors.** A preset is a record, not a button: `{name → weight vector}`.
  Render the vector into live dials so the operator can see what the preset *did*, and persist
  their edits under the storage prefix. (e.g. a ranking leaf: four presets over eight 0–5
  factors, `rank = Σ(w·s) / (Σw × 5)`.)
- **Predicate gates.** One boolean, defined **once in the generator** and stored on each record
  — never re-expressed per leaf: `gate = status=='catalog' ∧ grade ∈ {L2,L3} ∧ publish=='clear'`.
- **Monotone funnels.** Successive predicates over one set, each strictly narrower, shown as a
  descending stack. **Assert the monotonicity in the checker** — if it is not monotone the story
  reads wrong, and no badge catches that.
- **State machines with a derived alarm.** `open → taken | parked`, toggle-back on re-click,
  rolled up to the one number that matters (`blocking & open`). State in `localStorage` under
  the one prefix; export as text so a decision can leave the browser.
- **Filter menus.** One `filter` variable, one `draw()`, `data-*` buttons over the *same*
  derived array a sibling leaf renders. Many leaves, one idiom.

**Two rules.**

**Declare the algebra; do not guess the answer.** State atoms, composition rule, and one worked
example beside the surface — that is what makes a computed quantity generative rather than
authored. (House form: `Estimate = Σ (atom.min_or_units × atom.rate) + expenses`;
`Build = Site ⊕ Power ⊕ Floor ⊕ Machine ⊕ Controls ⊕ Docs`.)

**Read the stability, not the score — and say where the model ends.** The finding a weighted
ranking produces is *which orderings hold under every preset and which flip on one dial*. Name
the model's limit in the leaf: a weighted sum cannot express "this one goes to zero permanently
and the others merely slip" — that is a constraint, not a preference, and constraints belong in
the decision register, not the ranking.

See `references/derived-layer.md` for the data layer these controls read from.

## Symbolic identity (IDs, clusters, addresses)

Navigability at scale comes from one identity system, not more navigation chrome. The full
pattern — is `references/symbolic-system.md`; the
load-bearing rules:

- **One Register, one namespace.** Sidebar row grammar: glyph + [`ID` · NAME] +
  [verb · cluster-label]. Two half-systems naming the same set of things (lane letters in
  prose, ad-hoc disc glyphs on the hub) is the canonical failure — reconcile before building.
- **Glyphs follow the minting rule** (24×24, stroke 1.6–1.7, `currentColor`, round caps;
  cluster color applied by the renderer, never baked in) so one mark recolors per cluster
  and reads at every size. Closed vocabulary with a named fallback; mint deliberately.
- **Statuses are glyphs too** — `● ◐ ◒ ○ —` with weights and status hues; weighted statuses
  roll up into coverage matrices for free.
- **Everything citable gets a stable handle**: hash deep-links (`#lab=<slug>&doc=<class>`
  with a per-kind render dispatch), dotted node ids (`<slug>.<phase>.<key>`), or artifact
  URNs (`ns:<id>:<kind>` + collection key) when non-HTML files must be first-class surfaces.
- **Version control is a navigation surface**: tag taxonomy `epoch/<yyyy.mm>-<slug>` ·
  `layer/<name>-v<n>` · `org/<yyyy.mm>-<slug>`; generated files flagged; data separated from
  render so diffs attribute cleanly.

## Provenance discipline (numbers in an agent-co-authored workspace)

The pattern's other disciplines protect *structure*. This one protects *trust in the figures* —
the failure mode that actually bites when agents write the artifacts and a funder, client or
regulator reads them.

**Every figure carries one of three marks, rendered where a reader sees it — never in a comment:**

- **DERIVED** — computed from the Model at render time. *The computation is stated.*
- **AUTHORED** — a planning estimate. Labelled as an estimate, in the artifact.
- **TO CONFIRM** — an explicit placeholder for a fact nobody has yet.

Style them as one badge component in the tokens layer (status hues — never a categorical accent).

**The four rules that make it hold:**

1. **Recompute every badged number before shipping**, with a script, against the Model — **and
   re-derive every falsifiable prose claim.** *A badged number that does not recompute is worse
   than an unmarked estimate* — the badge converts a guess into an assertion. Prose is the
   unguarded flank: a sentence like "X holds first place under every preset" drifts silently the
   moment anyone edits a score, and body text carries no badge. The mature form is two scripts —
   a generator, and a verifier that recomputes from source rather than re-reading the generator's
   output. See `references/derived-layer.md`. In one 11-agent build, every severe defect wore a mark of
   authority: a DERIVED badge on a filter yielding 9 records while claiming 7; a typographic
   quotation attributed to a page that never said it; a material route cited to a field that
   says something else.
2. **Interpolate, never transcribe.** A `{{TOTAL}}` resolved from the Model beats a
   correct-today literal that will drift silently. This is the same rule as "the hub holds
   tallies, never content", applied one level down.
3. **Hold a claimed discipline; do not soften the claim.** When a file asserts something it
   does not do ("nothing is transcribed", "no colour is invented", "verbatim"), the fix is to
   make it true. Following that rule is what promotes a literal recurring across two files into
   an actual token.
4. **A correction pass needs a verifier as much as a build pass does.** Remediation rounds
   introduce their own errors — overstated provenance leads, transposed labels — and only
   re-verification catches them.

Never fabricate an organisation, date, price, or eligibility. Leaving a whole surface unbuilt
is the correct move when its inputs do not exist yet; say so on the hub card.

## Interaction recipes (proven leaves to crib)

- **Polyglot viewer**: `view.html?f=<path>` — markdown, CSV-as-table, JSON, and source with the
  Shell intact. See `references/polyglot-viewer.md`. Note the one honest exception to
  file://-first: `fetch()` is blocked on `file://`, so the Viewer degrades to path +
  copy-button + "serve to read" when unserved. Every other leaf still opens from disk.

- **WYSIWYG Gantt / timeline**: an editable `gantt.html`, with pack-out and sequence variants
  as sibling leaves.
- **Call sheet / triage table**: status codes in localStorage, a compose overlay, drafts in
  each language the counterparties read, export/import JSON.
- **Map surface**: vendored Leaflet on the one page that needs an engine; hand-tiled
  mini-maps elsewhere — "engine on the page that needs interaction, arithmetic everywhere
  else".
- **Print families**: `one-pagers.html` (8.5×11 letter), a deck leaf (16:9 slides,
  `@page size:13.333in 7.5in`), `call-orders.html` (sequenced sheets). PDF export = headless
  Chrome `--print-to-pdf` with `--window-size` large enough to avoid mobile media queries.
- **Working-session questionnaire**: persisted textareas, copy-all, print blank/filled.

- **Composition grid** (the Cooking-for-Engineers table, generalized): itemized components as
  rows, operations as `rowspan` cells merging contiguous spans left-to-right into one product —
  a bill of materials and a process flow in one readable object. Row height ∝ the component's
  share of the batch, so the mass balance is *seen*, not computed. Runs in both directions:
  **converge** (many inputs → one product; spans widen) and **diverge** (one source → many
  fractions; spans narrow, plus full-width "applied to every stream" bands). Author it as data
  — `{inputs|outputs}[] {n,q,v,prov,src}` + `ops[] {op, rows:[i,j], col, prov}` — never as
  hand-built HTML, and lint the grammar (contiguity, no same-column overlap, correct nesting
  direction per mode, the grid closes on its anchor). Shape: `composition.html` +
  `data/compositions.js` + `tools/check-compositions.mjs`.

- **Diagram reader with a declared typesetting system**: when a workspace already *generates* its
  own mermaid (or any diagram grammar), do not vendor the upstream renderer — a megabyte of
  library buys generality you never use and costs the one thing you need, control of the
  typesetting. Write a reader for the subset you emit: parser → layered layout → SVG in the
  workspace's own tokens. Keep the whole visual contract in one `STYLE` object (type ramp, node
  roles per *domain*, edge treatments per flow kind, spacing) so a diagram's look changes by
  editing style, never layout. Two rules that carry over from the plates: **flow kind is line
  style, never colour alone**, and a long linear chain must **wrap serpentine**
  (boustrophedon — even rows L→R, odd R→L, so the row hop is a short vertical drop) or it is
  illegible the moment it hits paper. Lint it by parsing and rendering *every* real diagram and
  asserting no NaN geometry, no unresolved edge endpoints, and no source markup leaking into
  output.
  Exemplar, covering the wider grammar docs need when they hand-author mermaid:
  `exemplars/3pt-hub/site/diagram.js` — flowchart in four directions with nested
  subgraphs, cluster endpoints, six node shapes, five edge styles, fan-out, bidirectional edges,
  self-loops, plus sequenceDiagram, gitGraph, stateDiagram-v2 and classDiagram, all in one
  node-safe file; the Viewer hands every ```mermaid fence to it and a fence it cannot parse
  stays visible as source with the reason, never silently blank. Its `check-diagram.mjs`
  sweeps every fence in the staged artifact.

- **Print-destiny guide sheet**: one record = one US-Letter page, screen view rendered at paper
  proportions (measure in `in`, not `px`) so what you scroll is what prints. Composes the other
  recipes — typeset diagrams, the composition grid, record stats, the pass/fail gate, a signature
  line. Deep-linkable (`?e=<id>`) and batch-printable (all N, or filtered to one track).
  Shape: `guide.html`.

- **Parallelization schedule**: the whole work-set list-scheduled onto N workers, with the
  **critical path** shown beside the makespan — the floor no amount of staffing beats. Sweep the
  worker count and the useful finding falls out (in the exemplar, 8 benches reaches the floor;
  past that, utilisation drops and the season does not shorten). Pair with dependency *waves* —
  the natural parallel batches, independent of capacity — because that answers "what can a first
  session run?" Shape: `program.html`.

## Deploy & verify (never skip)

```sh
# what CI runs; either principal can run it by hand — ALWAYS from a dir containing functions/
npx wrangler pages deploy <site-dir> --project-name=<project> --branch=main
```

- ⚠ `wrangler pages deploy` compiles `functions/` from the **cwd**, not the asset dir —
  deploy from outside the tree and the gate silently disappears while assets ship 200.
- Secrets bind at deploy: `wrangler pages secret put ACCESS_PASS`, then redeploy.
- **Three-way curl verification** after every deploy touching the gate:
  anon → 401 · valid creds → 200 · wrong-domain user → 401.
- Repo stays secret-free by construction: creds live in Pages secrets + Actions secrets
  (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`); gitignore `.dev.vars`, `*.env` day one.

## Collaboration protocol

Edit a leaf → check from `file://` → short-lived branch + PR → CI preview URL in the PR →
merge to main = production. Shared layers (Shell, tokens, Gate, Contracts) require review by
the other principal; leaves are free. Internal strategy documents **never** go inside the
deployable tree if counterparties hold gate credentials.

## Re-entry (the lapsed collaborator)

A grouped index is optimized for the operator who was here yesterday and hostile to the one
who was here five weeks ago: **it looks identical whether two things changed or fifty.** The
returner cannot tell what is new, so they read nothing and ask for a call instead. If a
workspace has a collaborator who has drifted, the re-entry surfaces are the deliverable — not
a nicety on top of one.

Three parts, and all three are load-bearing:

1. **Changelog leaf** (`changelog.html`) — the dated record. One entry per shipped thing:
   lane chip, one honest sentence, a deep link to the artifact, and its commit sha. Group by
   *wave* (a named push of work) rather than by date alone, and give each wave a sentence
   saying why that work happened. Entries tick to a `{ns}_changelog_v1` read-state.
   **It must also state what did NOT move** — the missed due date, the thing still behind a
   gate, the number nobody has calibrated. A changelog with no "what did not move" section
   reads as marketing and gets discounted wholesale, including the true parts.
2. **Tour leaf** (`tour.html`) — the same material re-ordered as a walk rather than a diff.
   Numbered stops in context-building order, grouped by lane. Every stop carries three things:
   *what it is*, *what to do there* (an actual instruction, not "have a look"), and an explicit
   **since-you-were-here delta**. Sticky progress bar; stops tick to `{ns}_tour_v1`.
3. **Catch-up band** — pinned above the fold on the hub, above the stat tiles. Reads both
   leaves' localStorage and says where *this browser* actually is ("changelog 4/20 · tour
   2/14"). Without it the hub still looks identical to a returner and the other two surfaces
   go unfound.

Changelog and Tour are not redundant. The Changelog answers "what happened"; the Tour answers
"where do I stand and what do I touch first". A returner needs both, and which one they open
tells you whether they are catching up or restarting.

**Re-seed the dated records in the same pass.** A stale ledger is worse than no ledger: it is
the first thing a returner reads and it silently teaches them the workspace is abandoned. Any
leaf that carries status defaults — a meeting record, a next-step ledger, an onboarding
checklist — must be re-seeded against what actually shipped whenever the Changelog is written.
The localStorage overlay only shields browsers that already visited; a returner on a fresh
device sees your defaults, so the defaults are the artifact.

**Fold the walkthrough into one place.** If an onboarding leaf already carries a surface
table, do not leave two tour lists to diverge — cut it down to a pointer at the Tour and keep
onboarding for what the Tour does not cover (getting in, how state persists, the red rule,
per-person first moves).

**Mirror audit.** Before writing the Changelog, check that every surface you are about to
announce is actually reachable from the deploy. Content that lives outside the deployable
tree — a sim, a design lab, anything behind a sync script — is exactly the work most likely
to be both the largest deliverable of the period and invisible on the hub. Route shells for
mirrored surfaces must live **outside** the synced directories: a `--delete` rsync eats a
hand-authored `index.html` placed inside one.

## Graduation triggers (when to leave the pattern)

Stay flat until: a third surface needs server state, or the first non-trivial write API —
then add a Worker + DO/D1 *as another reader/writer of the same keys*. Never introduce a
bundler/framework for layout reasons; the pattern's value is that agents edit whole files.

## Anti-patterns

Grouping by file type · abstract page names · content on the hub · a second nav source ·
per-leaf color inventions · unvendored CDN deps · deploying from outside the functions tree ·
gate exceptions "just for now" · skipping the three-way curl · reading an SSO email header
without verifying the signed assertion beside it (a total bypass on any hostname the proxy
does not front) · a login form that says "unknown address", which is a free directory of
everyone with access · leaving a collaborator's only recourse a message to the operator ·
putting close-strategy or
pricing docs in the deployed tree · a `.dev.vars` or any secret file inside a root-as-site
tree (the upload ignores `.gitignore`; it ships) · linking a `.md`/`.csv` from the hub with no Viewer (a
download is not a destination) · an HTML proposal saved under `docs/` (a leaf that escaped the site root: no shell
highlight, no lint sweep, broken relative links — it belongs in `site/`) · a markdown link that
resolves from the site root when the Viewer resolves from the document's directory (lint every
relative link from `dirname(doc)`, and make generators emit them that way) · a leaf that loads
web fonts from a CDN (vendor the latin subsets; `exemplars/3pt-hub/tools/vendor-fonts.sh`) · a one-way hub (leaves that link the tokens file but never
link back) · a DERIVED badge on a number nobody recomputed · shipping a correction pass
unverified · a workspace with no `git init` — with several agents writing, an unattributable
file is a permanent mystery · a changelog with no "what did not move" section · a dated
ledger left un-reseeded while the changelog around it is current · announcing a surface that
is not reachable from the deploy · two tour lists in two leaves, free to diverge · two
symbol namespaces for one set of lanes · cluster identity that lives only in a heading
string · an entry surface that is not the hub (opening the root lands somewhere else) ·
a Shell that branches on `location.protocol` to build hrefs (extensionless slugs 404 on
every plain static server, and the hub cards keep working so nobody notices) · a nav lint
that checks files exist on disk instead of checking that the *emitted href* resolves ·
a preview server whose routing does not match production ·
a *member* hub missing the estate strip — document layers are exempt, the strip federates tools,
not documents · a member hub whose rail hides under the strip (you skipped the collision sweep) ·
deleting a superseded estate surface instead of archiving it with a `since` · two `dir` regexes
matching one path · a prose claim about the model that no script re-derives · a predicate
re-expressed per leaf instead of stored once on the record · a generated file with no
`GENERATED by` header · renaming a slug once anything references it.

## Reviews

Dated build reviews live in `reviews/`. Read the latest before building:
`reviews/2026-09-02-first-build.md` records a day-zero-to-production build from this skill,
and the defects the build found in the skill itself.

## Templates

**Day-zero reading order:** this body → `references/templates.md` → `references/polyglot-viewer.md`
(if any `.md`/`.csv` will be carded). Everything else is pulled by its trigger.

See `references/templates.md` for copy-paste skeletons: leaf, Shell (nav.js), Gate
(_middleware.js), CI (deploy.yml), the provenance badge, and the scaffold checklist (day-zero →
first deploy in ~30 minutes).

See `references/polyglot-viewer.md` for the Viewer leaf — a tested markdown/CSV/JSON/source
renderer that keeps the Shell, plus the regression checks that caught two bugs its first draft
shipped.
