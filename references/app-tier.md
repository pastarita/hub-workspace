# hub-workspace · the App tier (optional: Next on Workers, role-gated)

> **Optional.** The flat-HTML hub is the default and stays the default. Open this file only when
> a hub has a second audience that must see *less* than the first. Everything here is paid for
> with the flat tier's main property: an agent can no longer edit one whole file and ship it.

A flat hub has one audience: whoever passes the Gate sees everything. The **App tier** is what a
hub becomes when that stops being true. It applies when a second audience needs a *narrower* view
of the same workspace, usually with several people writing the same state. The vocabulary stays
the same (Register, Model, Shell, Gate, Contracts, Temperatures, provenance badges). The substrate
changes: Next.js App Router built with **vinext**, deployed as a Cloudflare **Worker** with static
assets, fronted by Cloudflare Access, with an in-app role check on every request. Documents and
files get the role check too.

**The shape this was derived from.** A two-role logistics hub that graduated from a flat hub: an
**owner** who sees everything, a **helper** who sees an allowlist, a DB-backed checklist that
both roles tick, and owner-only PDFs and documents beside a few shared ones. It does not ship in
this repo. Where that build got something wrong, this file says so, so the next build does not
inherit the mistake.

**Four things not to skip.** Each one guards against a failure that is silent in ordinary use,
because the legitimate user still gets in:

1. **`run_worker_first`**, or every static file skips the role check (§2).
2. **Deny by default**: a new surface is owner-only until a role is added to it (§3).
3. **Sanitize text one role writes before another role's browser renders it, and set a CSP**, or
   a helper account is a stored-XSS path to every owner-only page (§4). The build above shipped
   this bug.
4. **`force-dynamic` in the root layout and `no-store` asserted on HTML**, or one role's render
   can be cached and served to another (§2, *vinext caveats*).

---

## 1 · When to graduate, and when not to

`SKILL.md` → *Graduation triggers* still holds: stay flat until you need server state, then add a
Worker *beside* the flat site, and never adopt a framework for layout. The App tier covers the one
case that rule does not: **authorization, not layout**.

Graduate when **a second audience must see less than the first.** This is not "fewer people get
in"; the Access policy handles that. It means "this person gets in and is refused *these*
surfaces". The surfaces they *can* see must also render differently for them: filtered cards,
dates and file lists. An edge rule can refuse a path, but it cannot filter a page. Filtering needs
a server that knows the role at render time.

**Shared, attributed writes** belong here when the roles differ in what they may see or write.
For example, a shared checklist that a helper ticks and the owner audits. `localStorage` cannot be
shared. A write API with an attributed audit log can. With no role split, writes alone do not need
this tier: a Worker and a database beside the flat hub, reading the same verified Access identity,
attribute every write.

Stay flat when:

- **One audience, read-mostly.** Use a flat hub with Tier 1 Access (`access-runbook.md`).
- **One write surface, no role split.** Put a Worker + database beside the flat hub, as the body
  says.
- **The pull is "React would be nicer".** Don't graduate. The flat tier's value is that an agent
  edits one whole file and nothing needs building. The App tier gives that up: every change goes
  through a build, a typecheck and a framework's release cadence. Pay that cost only for the role
  split.

**What carries over unchanged:**

- **the Register**, now `lib/registry.ts`: one entry per surface, plus `roles`
- the cluster registry and the 24×24 glyphs
- **the rail**: a client component rendered from the role-filtered Register
- **the Model**, now `lib/site-data.ts`, whose records also carry `roles`
- the provenance badges, and **TO CONFIRM** for unknowns
- adding a surface is still one Register entry

---

## 2 · The gate: Access at the edge, the role in the app

There are four layers, and each one fails closed. **Access decides who reaches the hostname. The
app decides what they see.** Neither layer trusts the other's convenience output.

| layer | where | refuses with |
|---|---|---|
| Access app (One-time PIN only; the policy lists every principal) | edge | redirect to `<team>.cloudflareaccess.com` |
| JWT verification | `middleware.ts` → `lib/identity.ts` `identify` → `lib/auth.ts` `verifyAccess` | 401 (no token or bad token) · 503 (keys unreachable) |
| email → role | `lib/auth.ts` `roleFor` | 403 "signed in but has no access" |
| role → path | `lib/access-rules.ts` `allowed` | 403 |

### Every request goes through the Worker: `run_worker_first`

By default, a Worker with static assets serves a matching file **before** the Worker runs. On
Pages, `functions/_middleware.js` fronts the assets. On Workers nothing fronts them unless you
configure it. Without this setting, Access lets people through and every PDF and static app in
`public/` is served with no role check. That is the Workers version of "deploying from outside
`functions/`": the gate exists and gets skipped without any error.

```jsonc
// wrangler.jsonc
"assets": {
  "directory": "dist/client", "binding": "ASSETS",
  "not_found_handling": "none", "html_handling": "none",
  "run_worker_first": ["/*", "!/_next/static/*"]
}
```

`vinext init` does not write this for middleware (see *vinext caveats*), so CI must prove it is
still there in the built config (§7).

The only exemption is the content-hashed JS/CSS bundles. They are still behind Access at the edge,
but they get no role check. That gives a hard rule: **never import role-gated data into a `"use
client"` module.** Instead, a server component filters by role and passes the result in as props.
In the build this was derived from, the rail's client chunk carried the slugs of owner-only pages.
That was harmless there, but it proves the rule: whatever a client module imports ships to every
role that passes Access. Check it the way an attacker would: grep the built chunks for a phrase
from an owner-only surface (`grep -rl '<owner-only phrase>' dist/client/_next/static` should print
nothing).

### middleware.ts: the sequence

One function turns a request into an email. The middleware calls it, and so does every reader of
identity downstream, so the two cannot disagree:

```ts
// lib/identity.ts
const LOCAL = new Set(["localhost", "127.0.0.1"]);
export async function identify(hostname: string, h: Headers, env: GateEnv): Promise<string | null> {
  if (LOCAL.has(hostname) && env.DEV_AUTH_EMAIL) return env.DEV_AUTH_EMAIL.toLowerCase();  // .dev.vars only
  const token = h.get("cf-access-jwt-assertion") || cookie(h.get("cookie"), "CF_Authorization");
  return verifyAccess(token, env);              // email or null; THROWS when the keys are unreachable
}
```

```ts
// middleware.ts
import { env } from "cloudflare:workers";
export async function middleware(req: NextRequest) {
  const url = new URL(req.url);
  let email: string | null;
  try { email = await identify(url.hostname, req.headers, env); }
  catch { return deny(503, "Cannot verify identity right now."); }
  if (!email) return deny(401, "Private. Sign in through Cloudflare Access.");
  const role = roleFor(email, env);
  if (!role) return deny(403, `${email} is signed in but has no access to this hub.`);
  if (!allowed(role, url.pathname, LOCAL.has(url.hostname))) return deny(403, "Not available to this account.");
  const headers = new Headers(req.headers);
  headers.set("x-<ns>-email", email);          // ALWAYS overwritten: a client cannot supply its own
  headers.set("x-<ns>-role", role);
  return NextResponse.next({ request: { headers } });   // §4 adds the CSP here
}
export const config = { matcher: "/:path*" };   // deny(): text/plain, Cache-Control: no-store
```

The sequence enforces these rules:

- **Verify the token; never read the email header.** `verifyAccess` is the verifier in
  `exemplars/reference-hub/functions/_middleware.js`, ported to TypeScript. It accepts RS256 only
  and pins `kid` against `https://<team>/cdn-cgi/access/certs`. It requires `iss` =
  `https://<team>`, an `aud` that contains `ACCESS_AUD`, an `exp` in the future, and an `nbf`
  within 60 s. It never reads `Cf-Access-Authenticated-User-Email`.
- **Cache the keys, and refetch on a miss.** The reference-hub verifier caches keys for ten minutes
  and refuses an unknown `kid` without refetching. After a key rotation, that turns away everyone
  for up to ten minutes. When you port it, refetch once on an unknown `kid` before refusing.
- **An unconfigured gate is closed.** If `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` is missing,
  `verifyAccess` returns null and everyone gets 401. A fresh deploy stays dark until both secrets
  exist.
- **Unreachable keys mean 503**, never "not signed in" (`collaborator-access.md` rule 2).
- **The identity headers are always overwritten.** The gate sets `x-<ns>-email` and `x-<ns>-role`
  on every request it passes, so a value the client sent never survives the gate.
- **Re-verify identity where it is used.** Pages and handlers read identity through one helper
  that throws when the headers are absent, and **re-runs `identify` and requires it to agree**:
  ```ts
  export async function viewer(): Promise<Viewer> {      // lib/session.ts
    const h = await headers();
    const email = h.get("x-<ns>-email"), role = h.get("x-<ns>-role");
    if (!email || !isRole(role)) throw new Error("no verified viewer: is middleware.ts running?");
    const host = (h.get("host") ?? "").replace(/:\d+$/, "");
    const again = await identify(host, h, env);           // the keys are cached, so this is cheap
    if (again !== email || roleFor(again, env) !== role) throw new Error("identity headers do not match the token");
    return { email, role };
  }
  ```
  Route handlers use the `Request` form, `viewerFrom(req)`, which does the same and returns null;
  the handler answers 401. The reason is the framework: middleware sees the raw URL while the
  router sees a decoded, normalised one, and vinext's history includes middleware bypasses (see
  *vinext caveats*). If one recurs, a helper could send `x-<ns>-role: owner` straight to an API
  route. Re-verification turns that into a 401 instead of an owner write.
- **The local identity is not a bypass.** `DEV_AUTH_EMAIL` lives in `.dev.vars`, and `identify`
  honours it only when the hostname is literally `localhost` or `127.0.0.1`. It still goes through
  `roleFor` and `allowed`, so a local run walks the real role rules. Set it to a helper's address
  to see the helper's site. **There is no `DISABLE_GATE`**, and no variable can open a deployed
  hostname.
- **There is no second door.** The flat tier keeps Basic auth beside Access (`SKILL.md` →
  *Gate*). The App tier drops it. With roles, a shared password would have to carry a role, and a
  role-carrying shared secret is exactly what the role split exists to avoid. If the Access app is
  removed, the site goes dark with 401, which is the correct failure.
- **Personalised renders are never cached.** Put `export const dynamic = "force-dynamic"` in
  `app/layout.tsx`, so every page under it, including the next one someone adds, renders per
  request. Then assert it from outside: every HTML response carries `Cache-Control` containing
  `no-store` (§8). A role-specific render that lands in a cache is served to the next role that
  asks.

---

## 3 · The permission model

Two roles is the common case. **owner** sees everything. **helper** sees an explicit allowlist.
Every role except owner is deny-by-default: **a new surface stays owner-only until someone adds a
role to its Register entry.** That default is the whole safety property, because forgetting a
step can only under-share.

**The Register carries the roles,** and the type makes them required:

```ts
// lib/registry.ts
export type Role = "owner" | "helper";
export const ROLES: readonly Role[] = ["owner", "helper"];
export const isRole = (r: unknown): r is Role => ROLES.includes(r as Role);
export const OWNER: Role[] = ["owner"];
export const ENTRIES: Entry[] = [            // Entry.roles is required: an entry without it does not compile
  { slug: "index",     href: "/",              label: "Hub",       cluster: "",      roles: ["owner", "helper"] },
  { slug: "checklist", href: "/checklist",     label: "Checklist", cluster: "prep",  roles: ["owner", "helper"] },
  { slug: "contract",  href: "/docs/contract", label: "Contract",  cluster: "admin", roles: OWNER },
];
export const visible = (role: Role) => ENTRIES.filter((e) => e.roles.includes(role));
```

**Who has which role.** Each role's addresses are a comma-separated Worker secret, never in git:

```ts
export function roleFor(email: string, env: GateEnv): Role | null {
  const e = email.toLowerCase();
  if (list(env.OWNER_EMAILS).includes(e)) return "owner";     // most-privileged first
  if (list(env.HELPER_EMAILS).includes(e)) return "helper";
  return null;
}
```

**Never fall back to an owner list in code.** The build this was derived from did: with
`OWNER_EMAILS` unset, it used a list hard-coded in `lib/auth.ts`. That put addresses in git and
turned a missing secret into a working default. Unset must mean no owners, so everyone gets 403.

**What each role may request.** Most of it comes from the Register; a short list covers paths the
Register does not name. **Match on segment boundaries:**

```ts
// lib/access-rules.ts
const HELPER_PATHS = ["/_next/static/", "/favicon.svg",          // build output
  "/api/checklist", "/api/checklist/",                           // the shared leaf's API
  "/files/<shared>.pdf"];                                        // exact files, never a directory
const DEV_PREFIXES = ["/@", "/node_modules/", "/_vinext"];       // the dev server's own paths
const ODD = /\/\/|\\|\.\.|%2f|%5c|%2e/i;                         // forms the router may read differently
const under = (path: string, base: string) =>
  path === base || (base !== "/" && path.startsWith(base + "/"));

export function allowed(role: Role, path: string, local = false): boolean {
  if (role === "owner") return true;
  if (ODD.test(path)) return false;
  if (local && DEV_PREFIXES.some((p) => path.startsWith(p))) return true;   // localhost only
  if (ENTRIES.some((e) => e.roles.includes(role) && under(path, e.href))) return true;
  return HELPER_PATHS.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));
}
```

Three details in that function are each a lesson:

- **Segment boundaries.** A bare `startsWith("/api/checklist")` also admits a future
  `/api/checklist-admin`. The build this was derived from matched that way. End every prefix in
  `/`, or match the path exactly.
- **Odd paths are refused for restricted roles.** The gate reads the raw path; the router reads a
  decoded, normalised one that collapses `//` and resolves dot segments. Refuse `//`, `\`, `..`,
  `%2f`, `%5c` and `%2e` rather than guess how the two will line up. If your paths never need
  percent-encoding, refuse any `%`.
- **Dev-only prefixes are allowed only on localhost.** The dev server needs them for a helper
  identity to work locally. In production they are just more paths a helper should not reach.

**The role shapes the page, not only the door.** Server components call `viewer()` and filter
everything they render:

- The rail and the cards come from `visible(role)`.
- Model records carry `roles` (`DATES`, `FILES`) and are filtered the same way.
- A page that both roles can open can still show each role different content.
- `/docs/[slug]` checks the Register again before rendering, and calls `notFound()` when the role
  is missing. The path rule has already refused by then. This second check still protects the
  page if a path rule has a typo.

**Revocation is immediate.** Two lists have to agree: the Access policy (who reaches the hostname)
and the role secret (what each person sees). Removing an address from the role secret returns 403
on that person's next request, without waiting out a 24-hour Access session. Remove the address
from the role secret first, then from the Access policy. When someone reports "they have access",
name the layer: the Access policy, the role secret, or the `roles` on that surface. A diagnosis
that merges the three sends someone to edit the wrong list.

**Path rules do not cover everything.** Three things fall outside them:

- **`/_next/static/*`**: the client bundles (§2).
- **Server actions.** In Next, an action is addressed by its ID and posted to whatever page is
  open, so a path rule on the page does not protect the action. Check `viewer().role` inside every
  action. (The build this was derived from used none; see *vinext caveats* for why that is wise.)
- **API writes.** The path rule lets a helper reach `/api/checklist`; what they may do there is up
  to the handler. When roles differ in what they may write, check `me.role` in each method.

### Extending it

| to add | edits |
|---|---|
| **a role** (e.g. `advisor`) | the `Role` union and `ROLES` (which `isRole`, and so `viewer()`/`viewerFrom()`, accept; a missed edit throws on every request) · a `<ROLE>_EMAILS` secret and a line in `roleFor` · a path list for the role in `allowed()` · `roles` on the Register entries and Model records it may see · its addresses in the Access policy |
| **a gated document** | `.md` in `content/` · one `?raw` import in `lib/content.ts` · a Register entry with `href: "/docs/<slug>"` and `roles: OWNER`, unless you deliberately widen it |
| **a shareable file** (PDF, static app) | an entry in the publish list (`FILES` in the Model, with `roles`) · the sync script copies it (§5) · its exact path in the role's path list, if it is not owner-only |
| **a private document** | upload it to the private bucket (§5) · a `FILES` record with `from: "r2"` and `roles` · nothing in git but that record |
| **a helper-visible surface** | `"helper"` in its Register `roles`. The rail, the cards and the gate all follow. |
| **a helper-visible path outside the Register** | the exact path, or a prefix ending in `/`, in the helper path list |
| **a public path** | see below |
| **a DB-backed leaf** | §6 |

**A file takes edits that must agree:** the publish list and the path list. Over time they drift.
The drift is in the safe direction: if you forget the path-list entry, the helper sees a link that
returns 403, and nothing is over-shared. Once a second shared file appears, derive the path list
from the publish list's `roles`.

**A public path** takes two edits, both on the exact path:

1. An Access **Bypass** policy (or a Bypass app) on that path.
2. A `PUBLIC` list of exact paths that the middleware checks *before* identity. A match returns
   `next()` **without** setting the identity headers. Then a public page that calls `viewer()` by
   mistake throws, instead of rendering as some user.

The root layout calls `viewer()`, so a public page cannot sit under it. Either give the page its
own root layout through a route group, or ship it as a static file. Then run the anonymous curl
against the path *and its neighbours*.

---

## 4 · Text one role writes, rendered in another role's browser

**This is the bug the build this was derived from shipped, and it erases the role boundary.** A
helper writes a checklist item; the owner's page renders it. The item text went through
`marked.parseInline` into `dangerouslySetInnerHTML`. `marked` ships no sanitizer: checked against
marked 18.1, both `<img src=x onerror=…>` and `[x](javascript:…)` pass through, and the
`javascript:` link survives even when the input is HTML-escaped first.

So anyone holding a helper account, including whoever phishes one, stores a script that runs as
the owner, on the owner's origin. It can fetch every owner-only page and file and send them
anywhere, or write as the owner. Access and the role gate both see a legitimate owner request,
because it is one. Nothing in §2 or §3 stops it.

**Rule: role-authored text never reaches `dangerouslySetInnerHTML` unsanitized.** In order of
preference:

1. **Render it as text.** `{item.text}` in JSX is escaped by React. Most checklist items, notes
   and comments need nothing more.
2. **If inline formatting is genuinely needed, escape everything, then allow a closed grammar.**
   Links get an `https:` allowlist; nothing else can produce a tag or an attribute:
   ```ts
   // lib/inline.ts
   const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
   export function inline(text: string): string {
     return esc(text)
       .replace(/`([^`]+)`/g, "<code>$1</code>")
       .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
       .replace(/\*([^*]+)\*/g, "<em>$1</em>")
       .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
   }
   ```
3. **If it must be full markdown, sanitize the renderer's output** with an allowlist sanitizer
   (tags, attributes and URL schemes), and test it against the payloads above.

**Find every path, not just the obvious one.** Role-authored text reaches HTML in more places than
the leaf that collects it. The DB export in §6 writes helper-authored item text into
`content/<LEAF>.md`, and the document renderer then treats that file as trusted markdown. Escape
item text in the exporter as well. A file in `content/` is only as trusted as the least-trusted
writer whose text can reach it.

### Then set a Content-Security-Policy

Sanitizing is the fix. The CSP limits the next mistake: with a nonce-based `script-src`, injected
inline handlers and `<script>` tags do not run even if a raw-HTML path survives somewhere. The
build this was derived from set none.

Use Next's nonce pattern. The middleware makes a nonce per request and puts the policy on the
**request** headers, where the framework reads the nonce and stamps its own bootstrap scripts. It
also puts the policy on the **response**, where the browser enforces it. vinext 1.0.1 reads the
nonce the same way (`script-src` from the request's `Content-Security-Policy`, in its
`server/csp.js`). Confirm it on your version: view a rendered page's source, and every `<script>`
must carry `nonce=`.

```ts
// middleware.ts, replacing the last line of the sequence in §2
const nonce = btoa(crypto.randomUUID());
const csp = [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
  "style-src 'self' 'unsafe-inline'",           // styles cannot run script; tighten later if you like
  "img-src 'self' data: blob:",                 // add the hosts your pages really load (map tiles, …)
  "connect-src 'self'",
  "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join("; ");
headers.set("content-security-policy", csp);           // request: the framework reads the nonce
const res = NextResponse.next({ request: { headers } });
res.headers.set("Content-Security-Policy", csp);       // response: the browser enforces it
return res;
```

- A per-request nonce makes every HTML response unique, which is one more reason for
  `force-dynamic` and `no-store`.
- `connect-src 'self'` does not stop a same-origin fetch of an owner-only page; only the script
  policy does that. It does close the easiest way to send the result elsewhere.
- Static HTML apps under `public/` have no nonce. Check what policy, if any, they actually receive
  on your version (the matrix in §8 does). If one has inline scripts, give it a hash-based policy;
  don't add `'unsafe-inline'` to the app's policy to make it work.

---

## 5 · Publishing: one `content/` folder, an explicit list, nothing private in git

`content/` is the source of record for everything the site may serve *from git*. It holds the
Markdown documents, the shareable binaries, the static apps and the extracted data. Nobody
authors anything under `public/`.

| kind | how it reaches the site | where it is checked |
|---|---|---|
| Markdown | `import x from "../content/X.md?raw"` in `lib/content.ts`, rendered on the server at `/docs/<slug>` | the Register's `roles` and the page's second check |
| shareable binaries, static apps | `scripts/sync-content.mjs` (`predev`/`prebuild`) copies the **publish list** into `public/files/` and `public/<app>/` | the gate (`run_worker_first`) and the path rules |
| private documents (contracts, identity documents, receipts) | **never in git.** A private R2 bucket, read by a gated route handler, named in the publish list | the handler's own role check, and the path rules |
| structured data | JSON imported at build time (`content/data/*.json`) | a CI step that re-extracts the data from the source document |
| live state | the database, exported back to `content/<LEAF>.md` | §6 |

The rules:

- **Import documents; copy only binaries.** With `?raw`, the site renders the file itself, so the
  page cannot drift from the document. Only binaries are copied, and only by the sync script.
- **Generated output is gitignored and wiped on every run** (`/public/files/`, `/public/<app>/`).
  A deleted source cannot linger as a stale public file.
- **Only listed files ship.** This inverts root-as-site, where the upload takes every file in the
  tree (`templates.md` → scaffold). `content/` can hold things that must never be served. They
  stay unserved because nobody listed them.
- **A missing required source fails the build.** A missing optional source is reported and
  skipped.
- **Links between documents stay inside the app.** `lib/markdown.ts` rewrites relative links:
  - another document → `/docs/<slug>`
  - a listed file → its `/files/…` or `/vault/…` path
  - the file of record for the live leaf → the leaf

  Anything else in the repo becomes plain text with a tooltip saying why, never a 404. This is the
  Viewer's rule, applied at render time instead of in the browser.

### Private documents stay out of git, even in a private repo

"Not served" does not mean "private". A private repository is still copied to every clone, every
CI runner and every collaborator added later, and its history keeps a file after `git rm`. The
build this was derived from kept scans of an identity document under `content/`. They were never
listed, so they were never served, but they were committed, and removing them takes a history
rewrite that existing clones never receive.

So private documents live in a **private R2 bucket** bound to the Worker: no public access, no
`r2.dev` subdomain, no custom domain. A route handler serves them after its own role check. The
**publish list** in the Model names every file the site serves, where it comes from, and who may
see it:

```ts
// lib/site-data.ts: the publish list. Every served file appears here, and nothing else ships.
export const FILES: FileRec[] = [
  { name: "welcome.pdf",  from: "content", roles: ["owner", "helper"] },  // synced to public/files/
  { name: "contract.pdf", from: "r2",      roles: OWNER },                // private: never in git
];
```

```jsonc
// wrangler.jsonc
"r2_buckets": [{ "binding": "PRIVATE_DOCS", "bucket_name": "<project>-private" }]
```

```ts
// app/vault/[name]/route.ts: private documents come from R2, never from public/
import { env } from "cloudflare:workers";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const me = await viewerFrom(req);
  if (!me) return new Response("Unauthorized", { status: 401 });
  const { name } = await params;
  const f = FILES.find((x) => x.from === "r2" && x.name === name);       // exact names only
  if (!f || !f.roles.includes(me.role)) return new Response("Not found", { status: 404 });
  const obj = await env.PRIVATE_DOCS.get(`docs/${f.name}`);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, { headers: {
    "Content-Type": obj.httpMetadata?.contentType ?? "application/pdf",
    "Content-Disposition": `inline; filename="${f.name}"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
```

Upload with `npx wrangler r2 object put <project>-private/docs/<name> --file <path> --remote`.
Always pass `--remote`: local and remote storage are separate, and the flag decides which one you
wrote to. The originals live wherever the owner keeps private records, outside every repo.

This also fixes a deploy mismatch. The alternative, copying private files into the build only
when they are present on the deploying machine, means a laptop deploy and a CI deploy publish
different file sets, and after a CI deploy every link the laptop deploy served returns 404. With
R2 both deploys serve the same set, and the publish list says what it is. If a listed private
document has not been uploaded yet, render it as **TO CONFIRM**, not as a dead link.

---

## 6 · The DB-backed leaf

The usual first one is a shared checklist on a database the Worker can reach over HTTP: Neon
Postgres through `@neondatabase/serverless`, with `DATABASE_URL` as a Worker secret, or D1.

- **Tables.** The content lives in `sections` and `items` (soft delete through `deleted_at`).
  `meta` holds the title and intro. `events` is append-only, with one audit row per write
  (`who, action, item_id, detail`).
- **Routes:**
  - `GET /api/<leaf>`: everything, plus `me`
  - `POST`: add an item
  - `PATCH /api/<leaf>/:id`: change `done` and/or `text`
  - `DELETE /api/<leaf>/:id`: soft delete

  Every handler does the same five things in order:
  1. Runs `const me = await viewerFrom(req)`, answering 401 if it is null.
  2. Validates types and lengths.
  3. Writes `updated_by = me.email`.
  4. Appends an event, **in the same statement or transaction as the write** (a CTE, or
     `sql.transaction([...])`). The build this was derived from issued them as two separate HTTP
     queries, so a failure between them leaves a write with no audit row.
  5. Answers with `Cache-Control: no-store`.
- **Roles.** Both roles read and write the checklist, and the gate admits helpers to
  `/api/checklist` and `/api/checklist/`. If a role may read but not write, check `me.role` in
  each method; the path rule cannot express that.
- **Rendering.** Item text is role-authored. Render it as text, or through `inline()` (§4).
- **The repo keeps the record.** `npm run <leaf>:export` regenerates `content/<LEAF>.md` from the
  database. It is a dry run by default; `-- --write` rewrites the file. Ticks happen in the
  database. The Markdown is the dated, greppable record in git. Seed the database from the
  Markdown once, then only export. The exporter escapes item text (§4).
- **The client is optimistic.** A box ticks immediately and rolls back with a visible error if the
  save fails.

This is different from what the flat tier promises. There, interactive state lives in
`localStorage` under one prefix, "so a later sync Worker is just another reader/writer" (`SKILL.md`
→ *Model*). In practice the checklist's record was the Markdown, not the browser keys: the build
this was derived from seeded the database from the Markdown and exports back to it.

---

## 7 · CI and deploy

`.github/workflows/<project>.yml` has two jobs:

- **check** runs on every push and PR: `npm ci` → content checks → `npm run typecheck` →
  `npm run build` (which runs `prebuild`, the content sync) → the config tripwire → upload `dist/`
  as an artifact.
  ```yaml
  - run: npm run build
  - name: run_worker_first is still in the built config
    run: jq -e '.assets.run_worker_first == ["/*","!/_next/static/*"]' dist/server/wrangler.json
  ```
- **deploy** runs on `main` only, with `environment: production` and `needs: check`. It downloads
  that artifact and runs
  `npx vinext-cloudflare deploy --config dist/server/wrangler.json --skip-build`. **Deploy the
  artifact the check job built**, never a rebuild.

**Why `--skip-build`, and why only from CI.** Without it, `vinext-cloudflare deploy` builds through
the Vite API, so npm `pre*` hooks don't run. The content sync in `prebuild` is skipped, and the
deploy ships stale or missing files with no error. If a local `npm run deploy` script exists, make
it `npm run build && vinext-cloudflare deploy --config dist/server/wrangler.json --skip-build`, or
delete it and deploy only from CI.

Each secret has one home:

| secret | lives in | set with |
|---|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | the GitHub repo | `gh secret set` |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `OWNER_EMAILS`, `HELPER_EMAILS`, `DATABASE_URL` | the Worker | `npx wrangler secret put <NAME> --name <worker>` |
| `DEV_AUTH_EMAIL`, a dev `DATABASE_URL` | `.dev.vars` (gitignored) | by hand |

How this differs from the Pages tier:

- **Worker secrets persist across deploys.** A `wrangler secret put` goes live by itself. There is
  no "then redeploy" step and no per-environment pair to keep in step (`SKILL.md` → *Deploy &
  verify*).
- **Previews are a choice, and a cost.** Building and typechecking every PR while only `main`
  deploys is weaker than the flat tier's Rails, but it also means the Worker has no hostname that
  Access fails to cover.
- **Every hostname needs Access in front of it.** If you turn on Workers preview URLs, Access does
  not cover them. The middleware returns 401 on them, but `/_next/static/*` is served without the
  Worker. Either add them to the Access app or set `preview_urls: false`. The same applies to a
  custom domain added beside `workers.dev`. Use one Access app over every hostname the Worker
  answers, so there is one AUD.
- **The build copies `.dev.vars` into `dist/server/`.** That directory is not the asset directory,
  so the file does not ship to the site. But anything that archives `dist/` takes it, and an
  `upload-artifact` step with `include-hidden-files: true` will too. Never write a `.dev.vars` in
  CI, and never upload or deploy a `dist/` built on a developer machine.
- **Use a database branch for local work.** If the local `DATABASE_URL` points at production, every
  local tick is a production write under the dev identity. Point it at a branch (Neon) or a local
  database (D1).

---

## 8 · Verify each role, not just the door

The flat tier's curls prove the door works. These prove each role sees only its own pages. Run them
after any change to the gate, to the Register's `roles`, to the path lists, to the publish list or
to the CSP. Run the role checks against the **built** Worker, because `run_worker_first` is a
production setting:

```sh
npm run build && npx wrangler dev --config dist/server/wrangler.json \
  --var DEV_AUTH_EMAIL:<helper@example.com> --var HELPER_EMAILS:<helper@example.com>
```

```sh
H=http://localhost:<port>
code() { curl -s -o /dev/null -w '%{http_code}  %{url_effective}\n' "$@"; }

# deployed: the door
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://<host>/        # 302 → <team>.cloudflareaccess.com
code -H 'Cf-Access-Authenticated-User-Email: <owner@example.com>' https://<host>/files/<owner-only>.pdf   # 302: forged header refused

# built Worker, local, as the helper: each role's view
code $H/checklist                                  # 200
code $H/api/checklist                              # 200
code $H/files/<shared>.pdf                         # 200
code $H/docs/<owner-only-slug>                     # 403
code $H/files/<owner-only>.pdf                     # 403: proves run_worker_first
code $H/vault/<owner-only>.pdf                     # 403 or 404
code -H 'x-<ns>-role: owner' -H 'x-<ns>-email: <owner@example.com>' $H/docs/<owner-only-slug>   # 403: proves the overwrite

# odd paths: every one must be 403 or 404 for the helper
for p in '//files/<owner-only>.pdf' '/files/<shared>.pdf%2F..%2F<owner-only>.pdf' \
         '/files/<owner-only>.pdf/' '/%66iles/<owner-only>.pdf' '/checklist/..%2Fdocs/<owner-only-slug>' \
         '/@/../files/<owner-only>.pdf' '/api/checklist-admin'; do code --path-as-is "$H$p"; done

# caching and CSP on HTML (GET with headers dumped, not HEAD)
hdr() { curl -s -o /dev/null -D - "$1"; }
hdr $H/checklist | grep -i '^cache-control'                    # contains no-store
hdr $H/checklist | grep -i '^content-security-policy'          # present, with a nonce
curl -s $H/checklist | grep -o '<script[^>]*>' | grep -vc nonce   # 0: every script carries the nonce
hdr $H/files/<shared>.pdf | grep -i '^content-security-policy' # know what static files get

# the bundle
grep -rl '<phrase from an owner-only surface>' dist/client/_next/static   # prints nothing
```

Confirm which identity you are before trusting the results: `GET /api/checklist` returns `me`.

Then restart without `DEV_AUTH_EMAIL`: **everything** must answer 401, including `/files/*`,
`/vault/*` and any static app. Remove it from `dist/server/.dev.vars` as well, because the build
copied it there.

Then run the two human tests:

1. A helper signs in with a PIN on the real hostname and opens an owner-only link someone sent
   them. It must refuse.
2. As the helper, add a checklist item whose text is `<img src=x onerror=alert(1)>` and another
   that is `[x](javascript:alert(1))`. Open the checklist, and the exported document, as the
   owner. Both must render as inert text.

Then automate the gate. `collaborator-access.md` → *Test it adversarially* applies in full.
`verifyAccess` is easy to test with a stubbed `fetch` and an RSA key generated in the test. Cases:
good token; wrong `aud`; wrong `iss`; expired; future `nbf`; unknown `kid`; `alg: none` or HS256;
keys unreachable (expect 503). `allowed()` is a table test over the Register and the odd paths
above. `inline()` is a table test over the payloads in §4.

---

## 9 · Scaffold an App-tier hub (checklist)

1. Scaffold Next on Workers with vinext (see *vinext caveats*). In `wrangler.jsonc`: `main` is the
   vinext fetch handler, `nodejs_compat` is on, and assets live in `dist/client` with
   `binding: "ASSETS"` and **`run_worker_first: ["/*", "!/_next/static/*"]`**. Pin exact
   versions.
2. In `lib/registry.ts`, port the flat hub's `GROUPS`, `GLYPH` and `CLUSTERS` into `ENTRIES`. Make
   `roles` required, default it to `OWNER`, and add `visible(role)`.
3. Write `lib/auth.ts` (the verifier, ported from `exemplars/reference-hub/functions/_middleware.js`
   with a refetch on an unknown `kid`, and `roleFor` with no default owner list),
   `lib/identity.ts`, `lib/access-rules.ts`, `lib/session.ts`, and `middleware.ts` with
   `matcher: "/:path*"`.
4. `app/layout.tsx` exports `dynamic = "force-dynamic"`, calls `viewer()`, renders the rail from
   `visible(role)`, and sets `robots: noindex`.
5. Add the CSP to the middleware (§4) and `lib/inline.ts` for any role-authored text.
6. Add `content/`, `lib/content.ts` (`?raw` imports), `app/docs/[slug]` with the second role check,
   and `lib/markdown.ts` for link rewriting.
7. Add the publish list (`FILES`) and `scripts/sync-content.mjs` as `predev` and `prebuild`. Gitignore
   its outputs, `.dev.vars`, `*.env` and `dist/`.
8. If any document is private, create the R2 bucket, bind it, add `app/vault/[name]/route.ts`, and
   upload with `--remote`. Keep the originals outside the repo.
9. Deploy once. It answers 401 to everyone, which is correct.
10. Put an Access app over every Worker hostname, following `access-runbook.md` (One-time PIN only;
    the policy lists owners and helpers).
11. Read `ACCESS_TEAM_DOMAIN` and the AUD from the redirect. Run `wrangler secret put` for both,
    and for `OWNER_EMAILS` and `HELPER_EMAILS`.
12. Run the §8 checks for each role. Then have a helper sign in with a PIN.
13. If you need a DB-backed leaf (§6), set up the database with a dev branch, the `DATABASE_URL`
    secret, a seed from the Markdown, and the export script.
14. Set up CI (§7), with the tripwire, and the repo secrets set through `gh secret set`.
15. Write `AGENTS.md`. Record the hard rules:
    - every surface defaults to owner-only
    - role addresses live in secrets, never in git
    - role-authored text is never rendered as raw HTML
    - documents' source of record is `content/`; private documents live in the bucket, never in git
    - what is never served

    Add the "Extending it" recipes from §3.

---

## vinext caveats

**Dated 2026-10-08. Re-check every line here against vinext's current releases and issues before
relying on it.** The versions, dates and issue numbers are public; the judgements are one build's.

At that date vinext was 1.1.0 (1.0 shipped 2026-09-28, 1.0.1 on 2026-10-01; 84 npm versions since
February). Conformance is strong on the core surface: 99.7% on the supported Next.js deploy suite,
96.0% overall. But it is young, it moves weekly, and much of it is maintained by one person.
Cloudflare's 1.0 post calls it "production-ready", while its Workers Next.js guide (dated
2026-08-25) still says beta. Cite the date of whatever you rely on. It is fine behind Access with
the precautions below; it is not set-and-forget.

- **Middleware is not a gate for `public/` by default.** `vinext init` never writes
  `run_worker_first` for middleware, and upstream #3217 ("Middleware does not run for static-asset
  requests covered by its matcher") was still open; #2778 describes every public file bypassing
  middleware on a default Workers deployment. Set it yourself (§2) and make CI prove it: fail the
  build unless `dist/server/wrangler.json` still contains it, and run the §8 matrix against the
  built Worker.
- **Expect no security advisories.** Fixes for middleware bypasses (matcher escaping, URI decoding,
  header deletion, `/api` skipping, the image endpoint) shipped as ordinary changelog lines after a
  February 2026 third-party audit; the repo's advisory page was empty. `npm audit` and Dependabot
  security alerts will never ask you to upgrade. Watch GitHub Releases instead, read each
  release's notes for *middleware, matcher, headers, static, normalize, forwarded, proxy, cache*,
  and upgrade within about two weeks of a release that touches those areas.
- **Pin exact versions.** That covers vinext, `@vinext/cloudflare`, `@vitejs/plugin-rsc`, vite, the
  Cloudflare Vite plugin, wrangler and typescript. Keep react, react-dom and react-server-dom-webpack
  on **one identical version**: RSC breaks when they drift. Never use `latest` (it has already
  pulled TypeScript 7, a major). Keep `allowScripts` in step with workerd. Upgrade in a dedicated
  PR gated by the §8 matrix.
- **Re-verify identity in handlers.** The router sees a decoded, normalised path; middleware sees
  the raw URL. A bypass regression would let a lower role forge the identity headers on an API
  route. Have `viewer()` and `viewerFrom()` re-run `identify` (§2). For restricted roles, refuse
  odd paths (§3). Allow the dev-only prefixes (`/@`, `/node_modules/`, `/_vinext`) only on
  localhost.
- **Personalised apps: `export const dynamic = "force-dynamic"` in `app/layout.tsx`.** vinext
  decides at render time whether a page is dynamic and bundles an in-memory cache. A role-specific
  render must never be cached. Assert `Cache-Control: … no-store` on HTML. On gated content, don't
  use `--warm-cache`, a cache adapter or `imagesOptimizer()`. The optimizer serves `/_next/image`
  from ASSETS before middleware runs.
- **`vinext-cloudflare deploy` builds through the Vite API, so npm `pre*` hooks don't run.** A
  content sync in `prebuild` is skipped. Run `npm run build`, then deploy with `--skip-build`, from
  CI only (§7).
- **The Cloudflare plugin copies `.dev.vars` into `dist/server/`** (§7).
- **Choose the toolchain deliberately.** Upstream now defaults to the `cf` CLI +
  `cloudflare.config.ts` + Vite plugin v2, all still beta at that date. The Wrangler + plugin v1
  path runs on GA tools; stay there until those go GA, and record which one the project is on. A
  migration renames the field the gate depends on (`assets.run_worker_first` →
  `assets.runWorkerFirst`), so re-run §8 afterwards.
- **Stay on the well-trodden subset.** That means server components, route handlers, middleware and
  plain `<a>` links. Server Actions break in tabs opened before a deploy (#3604). Client-router
  issues are open. Route-handler `request` is a Proxy that breaks libraries that re-wrap it, such
  as Hono and oRPC (#2557). `next/image` and `next/font` only partly work. If you hit a bug, expect
  to patch it yourself (`patch-package`). OpenNext is the documented fallback.
- **Dev never exercises the real auth path.** The localhost identity skips `verifyAccess`. Unit-test
  that function (§8), because no local run will.

Sources to re-check: <https://github.com/cloudflare/vinext/releases> ·
<https://github.com/cloudflare/vinext/issues/3217> · <https://github.com/cloudflare/vinext/issues/2778> ·
<https://github.com/cloudflare/vinext/issues/2557> · <https://github.com/cloudflare/vinext/issues/3604> ·
<https://github.com/cloudflare/vinext/security/advisories> · <https://vinext.dev/docs/guides/caching> ·
<https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/>

---

## Anti-patterns

Static assets served before the Worker on a role-gated site (no `run_worker_first`) ·
role-gated data imported into a `"use client"` module · relying on a page's path rule to protect a
server action · a role check only in the client · trusting an identity header the gate did not
just write · a handler that reads identity headers without re-verifying · honouring a dev identity
on any hostname except localhost · an owner list hard-coded as a fallback · a path prefix without a
trailing `/` · a gate that admits `//`, `..` or encoded separators for a restricted role · a new
surface that is visible by default · **one role's free text rendered as HTML in another role's
browser** · `marked` output passed to `dangerouslySetInnerHTML` · a role-split app with no CSP · a
personalised page that can be cached · copying into `public/` a document that could be imported ·
a sync step that ships "everything in `content/`" · a private document committed to git, private
repo or not · "not served" mistaken for "private" · a Worker hostname (preview URL, second domain)
that the Access app does not cover · deploying anything other than the artifact CI checked · a
deploy command that skips `prebuild` · a `dist/` uploaded from a developer machine · "they have
access" without naming the layer · graduating to this tier for layout.

---

## Where to look

No App-tier instance ships in this repo. A complete one needs a build, a lockfile and pinned
versions of a framework that changes weekly, and a partial one would teach the wrong lessons. The
shape above is complete enough to build from; these are the parts of this repo it leans on.

| Path | Study it for |
|---|---|
| `exemplars/reference-hub/functions/_middleware.js` | The Access verifier to port into `lib/auth.ts`: RS256 pinned, `iss`/`aud`/`exp`/`nbf`, 503 on unreachable keys. Add the refetch on an unknown `kid`. |
| `references/access-runbook.md` | The Access click path, One-time PIN only. On Workers the destinations are every hostname the Worker answers, not `*.<project>.pages.dev`. |
| `references/collaborator-access.md` | Rules 1, 2 and 11 apply unchanged, and so does the adversarial test suite. Tier 2 self-service is the next step for in-app invites: replace `roleFor`'s secret lists with an allowlist stored as data, and keep `middleware.ts` as the single gate. |
