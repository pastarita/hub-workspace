# hub-workspace · the Estate tier

One hub is a workspace. Several hubs that must be walked between are an **estate**.

The estate tier is one file, one array, and one include — added to hubs that *already work*.
Never build it first: an estate over one hub is chrome. The trigger is the second hub someone
actually needs to reach from the first.

---

## 1 · Two topologies — decide which you have before writing anything

**Federated estate** — peer hubs joined by *role*. Each member owns its own Shell, tokens and
namespace; nothing is shared but the strip. This is the common case, and the one the strip
serves.

> A lab estate: `tools-a/` · `tools-b/` · `operators/` · `factory/` · `docs/`, plus root-level
> single leaves (`resume.html`, `funding.html`).
> A business estate: `_hub` · `Competencies/<x>` · `Competencies/<y>` · `Customers/*/hub`.

**Layer estate** — layer-major, module-horizontal: one top-level directory per *artifact layer*,
one module cutting all layers, joined by a stable `slug`. Cross-layer artifacts resolve by
**string template, never by index**:

```js
const abstractSrc = s => `abstracts/${s}/${s}_two_pager.html`;
const charterSrc  = s => `charters/${s}/${s}_directive.html`;
```

### The strip federates tools, not documents

One estate's four artifact layers (`abstracts/ docket/ charters/ publications/`) carry **zero**
strip includes, and that is correct — they are reached *through* the estate hub, which renders
them per module. This is a boundary, not partial adoption.

> **Put the strip on anything a person navigates *to*. Leave it off anything a hub renders
> *for* them.**

The two topologies compose: a federated strip across tool hubs, plus one estate hub whose
sidebar is the Register and whose body dispatches per artifact layer.

---

## 2 · The strip — `data/estate_nav.js`

An IIFE, zero dependencies, `file://`-safe. The registry is three keys.

`dir` is a **regex over `location.pathname`**, so a whole sub-tree lights its parent entry;
single-file surfaces anchor on the filename. No page ever declares "I am X" — active state is
inferred.

```js
var H = 28;                         // strip height; leaks by contract — see §3

/* Depth-independent: derive the estate root from our OWN src attribute, so the same
   file works from "data/estate_nav.js" and "../data/estate_nav.js" alike. */
var root = "";
var scripts = document.querySelectorAll('script[src]');
for (var i = 0; i < scripts.length; i++) {
  var m = (scripts[i].getAttribute('src') || '').match(/^(.*?)data\/estate_nav\.js/);
  if (m) { root = m[1]; break; }    // "../data/estate_nav.js" -> "../"
}

var SURFACES = [
  { label: "Hub",       href: "hub.html",             dir: /(^|\/)hub\.html$/ },
  { label: "Bench",     href: "bench/index.html",     dir: /\/bench\// },
  { label: "Resume",    href: "resume.html",          dir: /resume\.html$/ }
];

/* Superseded but not deleted: leaves the strip, joins the Archive dropdown at the far
   end — still reachable, no longer competing for attention. To archive a surface, cut
   its line from SURFACES and paste it here with a `since`. */
var ARCHIVED = [
  { label: "Site Planner", href: "site/index.html", dir: /\/site\//, since: "2026-07" }
];

// hrefs are ALWAYS estate-root-relative; the page supplies the prefix.
a.href = root + sf.href;
if (sf.dir.test(location.pathname)) a.className = "on";
```

**CSS essentials.** `position:fixed;top:0;left:0;right:0;height:28px;z-index:3000`; an
`overflow-x:auto` `<nav>` with hidden scrollbar; `body{padding-top:28px!important}`; and
`@media print{#estateStrip{display:none}body{padding-top:0!important}}`.

Put the Archive dropdown **outside** the `<nav>` (`margin-left:auto`) — the nav scrolls and
would clip it. Standing on an archived surface lights the Archive control itself.

---

## 3 · The collision sweep — copy this exactly

The strip must compose with hub chrome written in **ignorance of it**. After inserting, reflow
anything anchored to the viewport top:

```js
var els = document.body.getElementsByTagName("*");
for (var i = 0; i < els.length; i++) {
  var el = els[i];
  if (el.id === "estateStrip" || strip.contains(el)) continue;
  var cs = getComputedStyle(el);
  if (cs.position === "fixed" && cs.top === "0px") {
    el.style.top = H + "px";
    if (cs.bottom === "auto" &&
        (cs.height === "100%" || parseInt(cs.height, 10) >= window.innerHeight)) {
      el.style.height = "calc(100% - " + H + "px)";
    }
  }
}
```

**This is the single most reusable mechanism in the tier.** Without it, every member hub's rail
hides under the strip and the estate reads as broken on the first click.

Cooperating rails may *also* hard-code the offset — and must say so in their header comment:

```js
/* Coexists with the estate strip, which offsets body 28px; this rail sits below it. */
#membernav{position:fixed;left:0;top:28px;...}
```

Both mechanisms belong in a mature estate: **the sweep for pages that don't know, the constant
for rails that do.**

---

## 4 · The two-tier nav contract

- **Tier 1 (strip) — inclusion IS registration.** One `<script src="{prefix}data/estate_nav.js">`
  on the page, one `{label, href, dir}` line in the registry. Two edits, one file each.
- **Tier 2 (rail) — unchanged from the single-hub pattern.** Each member keeps its own `nav.js`,
  its own cluster registry, its own storage prefix. **The estate shares navigation, not tokens.**
  A member hub must still work correctly with the strip absent.
- **The seam — an explicit "Out" group.** A member hub carries, at the foot of its rail, the
  estate hub plus the two or three sibling surfaces it actually hands off to. Cross-hub deep
  links use the target's own hash scheme (`loops/index.html#<slug>`).

**Staging-target convention.** During a fan-out, a `SURFACES` entry may point at an iteration hub,
with an inline comment saying when to repoint: *"repoint to the elevated winner when the epoch
closes."*

---

## 5 · Scaffold an estate (~20 minutes over hubs that already work)

1. **Pick the estate root** — the directory containing every member. Create `data/`.
2. **Write `data/estate_nav.js`**; seed `SURFACES` with the members you have today.
3. **Add the include** as the last element before `</body>` in **every** member's leaves, with
   the correct depth prefix. Nothing else changes in the members.
4. **Build or nominate the estate hub** — the entry surface at the root. Opening the estate root
   must land on it; anything else is the "entry surface is not the hub" anti-pattern one tier up.
5. **Add an "Out" group** to each member's rail.
6. **Lint it** — every `href` resolves on disk from the root; every member leaf includes the
   strip; every `dir` regex matches at least one real path; no two `dir` regexes match the same
   path.
7. **Tag it** — `layer/estate-nav-v1`.

---

## 6 · Estate anti-patterns

- Building the strip before the second hub exists.
- Sharing tokens across members "since we're already sharing nav."
- Deleting a superseded surface instead of archiving it with a `since`.
- A member whose rail hides under the strip — you skipped the sweep (§3).
- Two `dir` regexes matching one path.
- Putting the strip on document layers the estate hub already renders.
- Estate hrefs that are absolute or `<base>`-dependent — breaks `file://`.
- An estate root that opens on something other than the estate hub.

---

## Shapes this fits

A lab estate: federated tool hubs over a layer estate the strip deliberately skips, with
cooperating member rails and an "Out" group. A business estate: five sibling hubs, each built
to the pattern and, before the strip, none able to reach another. A multi-origin estate whose
strip links public, gated and local surfaces. The strip and sweep above are complete enough
to copy.
