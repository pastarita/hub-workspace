# hub-workspace · review from a first build (2026-09-02)

Reviewer: Claude Fable 5.1, in session with the skill's author. Occasion: scaffolding a small
community organization's workspace from this skill, day zero to a gated production deploy on
Cloudflare Pages. Two questions were asked of the skill: is it usable and invocable, and
does its progressive disclosure work.

## Verdict

**Worth keeping, and reliable as infrastructure, with corrections applied in this pass.**
The pattern held end to end: Shell, Model, Viewer, three hot leaves, a changelog, gate, CI,
two lints, and a Pages-faithful preview server were built and verified in one session. The
lints caught real mistakes during the build, and the build found five defects in the skill
itself (§3).

## 1 · Usability and invocation

- **Invocable.** `Skill(hub-workspace)` loads a 27 KB body. The trigger phrases in the
  frontmatter matched the request ("get a hub-workspace system going") without ambiguity.
- **Vocabulary is the asset.** Hub / Leaf / Viewer / Shell / Register / Model / Gate / Rails
  / Contracts / Temperatures gave the build a shared language immediately; every file in
  the build is named by one of these words. The "three moves" rule was tested by adding six
  leaves and held: no change needed a fourth move.
- **Cost of the body.** 27 KB in one load is heavy for a session that only wants to add a
  leaf. The re-entry, option-algebra, symbolic-identity and provenance sections are each a
  page and could live in `references/` with a two-line pointer, the way estate and
  collaborator-access already do. Not changed in this pass; flagged.

## 2 · Progressive disclosure

| Reference | Loaded? | Needed? | Note |
|---|---|---|---|
| `templates.md` (20 KB) | yes | yes | Built from it directly. The "Link resolution" section is the single most valuable page in the skill. |
| `polyglot-viewer.md` (16 KB) | yes | yes | Ported; found a rendering bug (below). |
| `symbolic-system.md` | yes | partly | Register tuple and cluster registry used; addressing schemes not yet needed. |
| `derived-layer.md` | yes | not yet | Correct to defer; the build has no upstream sources. |
| `collaborator-access.md` | yes | not yet | Tier 0 only. The ladder is clear about when to return. |
| `estate.md` | skimmed | no | Correctly gated behind "build only over hubs that already work". |

Disclosure works: the body says which reference to open and when, and the references are
self-contained. The one gap was that the body did not say **which reference to read first
on day zero**. Added: `templates.md`, then `polyglot-viewer.md` if any `.md` will be carded.

## 3 · Defects found by building, and what was done

| # | Defect | Where | Fix |
|---|---|---|---|
| A | Viewer `md()` emits one `<p>` per source line, shredding any markdown hard-wrapped at 80 columns; list continuation lines become paragraphs. The "17 checks over six real documents" did not include hard-wrapped prose. | `polyglot-viewer.md` | The build's `view-render.js` joins consecutive text lines and appends indented lines to the open list item. Reference updated with the rule and the regression check. |
| B | The NUL-based fence sentinel, written as a unicode escape in source, is a hazard for model-authored files: a model can emit the byte itself, which the tool layer rejects or git treats as binary. Happened three times in this session. | `polyglot-viewer.md` | Build the sentinel at runtime with `String.fromCharCode(0)`. Reference updated. |
| C | **Root-as-site ships everything**, including `.dev.vars`. `wrangler pages deploy .` uploaded the local secret file. `.gitignore` does not govern the upload. The checklist offered "or repo root IS the site" without this caveat. | `templates.md`, SKILL.md anti-patterns | Secret rotated and moved to `~/.config/<project>/`; rule added: with root-as-site, no secret file may exist in the tree at all. `functions/`, `tools/`, CI YAML also ship; harmless but stated. |
| D | The lint's `location.protocol` ban matched its own prohibition comment in `nav.js`; and the shell-detection regex did not accept `./nav.js`. | `templates.md` lint snippet | Strip comments before the test; accept `./`. |
| E | Pages redirects `/leaf.html` to `/leaf` with **308**, not 301. | `templates.md` table | Corrected. |

## 4 · What the lints caught during the build

- Six leaves flagged "missing the shell" on the first run (regex too narrow, see D).
- `check-view.mjs` ran 8 unit checks plus every workspace document and passed before and after the paragraph fix, which is how the fix was proven not to regress tables, fences, or task lists.
- The hub-tally rule ("no literal count in a stat tile") is mechanized in `check-nav.mjs` and would have caught a transcribed number.

## 5 · Recommendations not applied

- Split SKILL.md: keep vocabulary, three moves, design discipline, deploy-and-verify, and anti-patterns in the body (about 10 KB); move re-entry, option algebra, symbolic identity, provenance, and recipes to references with pointers.
- Add a `tools/check-deploy.mjs`: enumerate the files wrangler will upload and fail on any `.dev.vars`, `*.env`, `*.pem`, or deny-listed path. Root-as-site workspaces need this more than a gitignore.

## 6 · The build as a reference shape

Root-as-site with markdown sources of record reachable through the Viewer; Register,
stakeholder state machine and question ledger in one Model; node-safe Shell, Model and
Viewer renderers; two `.mjs` lints wired into CI; Pages-style preview server; Tier 0 gate
verified four ways; secret kept outside the tree. The smallest complete instance, and the
worked case for the root-as-site caveat. Its reusable parts were folded into
`exemplars/reference-hub/`.
