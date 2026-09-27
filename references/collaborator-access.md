# Collaborator access — the three tiers, and when to graduate

A hub workspace is gated from day zero. What changes over a project's life is
not *whether* there is a gate but *who can open it and how they ask*. This is
the tier ladder for that, and the failure that makes it necessary.

> **Standing rule (2026-09-26): start at Tier 1, not Tier 0.** Cloudflare Access
> goes on first, with the One-time PIN provider added explicitly and the app
> restricted to it, and the wildcard preview hostname included. The click path is
> `access-runbook.md`. Basic auth is only ever the second door beside Access.
> The reason is the ladder below: Tier 0 exists to be climbed out of, and the
> climb costs a collaborator's afternoon every time. Skip it.

## The failure this exists to prevent

Every hub workspace begins with the Gate as one file and the allowlist as a
literal array inside it. That is correct at day zero and stops being correct the
first time a collaborator cannot get in — because the Gate at Tier 0 and Tier 1
has **no answer for the person standing outside it.**

The shape is always the same, and it is worth recognizing early:

> A collaborator cannot sign in. The operator cannot see why — the identity
> provider's mail is a black box, and the workspace's own logs never see a
> request that Access rejected. The collaborator's only recourse is to message
> the operator out of band and wait. The operator's only remedy is to edit code,
> commit, and redeploy.

Nothing in that loop is a bug. It is the pattern working exactly as designed,
and being the wrong design. **The tell is a second person waiting on you to
edit an array.**

Note also what the operator *cannot* do at that point: read the policy. A
Cloudflare OAuth token from `wrangler login` carries no Zero Trust scope, so
the identity configuration is dashboard-only even for the account owner. Plan
for the diagnosis to be manual.

## The ladder

| tier | gate | allowlist lives in | a stranger can | cost to add someone |
| --- | --- | --- | --- | --- |
| **0 · Shared secret** | Basic auth, one project secret | the middleware, as an array | nothing | edit, commit, redeploy |
| **1 · Managed identity** | Cloudflare Access / SSO | the identity provider's policy | nothing | dashboard edit |
| **2 · Self-service** | magic link over a KV allowlist | KV, as data | **request access** | one approved click |

Tier 2 is not "better auth" than Tier 1 — Access has audit logging, device
posture and session management that a hand-rolled gate does not. It is a
different *provisioning* model. The mature configuration runs **both**: the
managed identity provider as the working door, and the self-service door beside
it. Two doors, one room.

### Graduate to Tier 1 when
Two or more people hold the shared secret, or the workspace holds anything you
would not paste into a group chat. A shared password has no revocation story
short of changing it for everyone.

### Graduate to Tier 2 when any of these is true
- **A collaborator has been locked out once.** The single strongest signal. One
  occurrence predicts more.
- **The workspace has hostnames the identity provider does not cover.** Preview
  and deployment URLs are different hostnames; an Access app matching an exact
  hostname does not match them, and they fall through to whatever is behind it.
- **Anyone outside the founding pair will ever need in** — a contractor, an
  advisor, a counterparty. Tier 1 has no *request* verb.
- **The identity provider's mail is the single point of failure**, which it is
  whenever the login method is a one-time PIN.

## The correction that saves a week

When a managed identity provider's email login fails, the instinct is to send
the collaborator "a magic link that sets up SSO." **No such mechanism exists**,
in Cloudflare Access or its equivalents. A one-time PIN *is* the magic link.
Layering another link on top of the same provider changes nothing, because the
mail is the failure and the provider is the sender.

The only two real fixes:

1. **Change the identity, not the delivery** — add a second identity provider
   (Google, GitHub, SAML) so the collaborator authenticates with something they
   already control and no mail is involved. Cheapest durable fix at Tier 1.
2. **Change the delivery path** — Tier 2, sending from a domain whose
   reputation, DNS and logs you control. Consumer mail hosts filter
   infrastructure senders silently and aggressively; `@icloud.com` in
   particular. Relay aliases (Hide My Email and its equivalents) break
   allowlists outright: the alias receives, but the address the user types must
   match the policy exactly.

Diagnose in this order, and *before* building anything: policy string is exact →
login method actually enabled → mail found in junk under the provider's real
sender address → not a relay alias → the hostname they used is one the app
matches. The last is the most commonly missed, because the collaborator was
usually sent a preview URL.

## Tier 2 — the shape

Six routes, one middleware, one KV namespace.

```
functions/
├── _middleware.js     accepts EITHER proof; else challenges
└── auth/
    ├── login.js       address → single-use link, if permitted
    ├── verify.js      spend the link, set the session
    ├── request.js     a stranger asks; the owner is emailed an approve link
    ├── approve.js     owner-only; writes the allowlist, mails a link
    └── logout.js
lib/                   OUTSIDE functions/ — everything under it becomes a route
```

```
allow:<email>   → { addedAt, addedBy, note }   no TTL
magic:<sha256>  → { email }                    15 min
req:<sha256>    → { email, name, note, at }    7 days
rl:<bucket>     → count                        15 min
```

### The eleven rules that make it safe

These are not stylistic. Each corresponds to a way the naive version is broken.

1. **Verify the managed provider's assertion; never trust its header.** An
   SSO proxy injects a convenience header with the authenticated email. Reading
   it without verifying the signed assertion beside it is a *total bypass* on
   any hostname the proxy does not front — which, at Tier 2, is by definition
   where the second door lives. Full signature + issuer + audience + expiry, and
   pin the algorithm so `alg: none` and HMAC-with-the-public-key are refused.
2. **Fail closed when you cannot verify.** If the provider's keys are
   unreachable you cannot distinguish a real assertion from a forged one.
   Returning "not signed in" degrades silently into the second door; throwing
   and serving 503 is correct.
3. **The login response must not depend on whether the address is known.** Same
   page, same status, either way. Otherwise the form is a directory of everyone
   with access, offered to anyone who can type. This also means a delivery
   failure cannot be surfaced to the caller — log it instead.
4. **Tokens are single-use and read-then-deleted before anything acts on them.**
   Links get forwarded, synced to phones, and quoted into threads.
5. **Store tokens hashed.** A dump of the namespace must not be a set of working
   links.
6. **Approval requires two independent facts** — holding the token *and* being
   the owner. An approval link sits in an inbox for days; a capability URL that
   grants access on one click is too much authority to leave lying in mail.
   Check identity *before* consuming the token, or anyone who opens the link can
   burn a pending approval as a denial of service.
7. **The owner is permitted by construction, not by a seeded record.** Otherwise
   the system cannot bootstrap — the first approval needs a signed-in owner —
   and an accidental key deletion locks everyone out permanently.
8. **Sessions are signed and stateless, with an epoch in the signing key.** The
   gate runs on every asset; a storage read per request is paid hundreds of
   times per page load. The cost is revocation, and one env var mixed into the
   key buys it back: bump it and every outstanding session dies, no redeploy.
   Document removal as *two* moves — delete the record, bump the epoch.
9. **Sanitize the `next` parameter.** Same-origin absolute paths only; reject
   `//` and `/\`. A sign-in flow that redirects anywhere is a phishing primitive
   wearing your domain.
10. **Challenge navigations with a redirect and subresources with 401.**
    Redirecting assets produces a page that appears to load while every
    stylesheet is silently an HTML login form.
11. **No `DISABLE_GATE`.** At Tier 0 an open-by-default escape hatch is
    defensible. Once a hostname deliberately sits outside the managed provider,
    "serve everything to everyone" behind one variable is a hole. Delete the
    variable when you graduate, and refuse to start unconfigured rather than
    signing cookies with `undefined`.

### Platform constraint worth knowing before you design

**Cloudflare Pages Functions cannot send email.** `send_email` is not in the
subset of bindings Pages supports (KV, D1, R2, DO, Queues, Vectorize, AI,
Hyperdrive, Analytics Engine, service bindings, vars, secrets). The supported
route is a **service binding to a real Worker** that holds the binding. If the
project already has an inbound mail Worker, give it a `fetch` handler rather
than inventing a sibling — one mail surface per domain, both directions —
guarded by a shared key compared in constant time.

## Verification — the three-way curl, extended

Tier 0's discipline was anon → 401 · valid → 200 · wrong-domain → 401. Tier 2
adds the cases that distinguish a gate from a decoration:

```sh
curl -sI https://<self-serve-host>/ | grep -i '^location'          # /auth/login, NOT the SSO host
curl -s -o /dev/null -w '%{http_code}\n' https://<host>/auth/login  # 200 while signed out
curl -sI -H '<SSO-email-header>: owner@example.com' https://<host>/ # 302 — forged header refused
curl -sI -H 'Sec-Fetch-Dest: image' https://<host>/nav.js           # 401, not a redirect
curl -sI https://<sso-host>/ | grep -i '^location'                  # SSO still fronts the first door
```

Then walk the whole flow once with a real outside address: request → approve →
sign in → reload.

## Test it adversarially, and put it in CI

The gate is the one part of a hub workspace whose bugs are **invisible in
ordinary use** — a too-permissive verifier still lets the legitimate user in.
Provenance discipline says recompute every badged number; the equivalent here is
that every refusal must be asserted, from the attacker's side. The suite that
earns its place covers: forged header alone, wrong audience, wrong issuer,
expired, `alg: none`, algorithm downgrade, unknown key id, replaced signature,
attacker-signed, malformed; then swapped session payload, epoch bump, secret
rotation, expired-but-signed, token replay, and every open-redirect form.

A fake KV is thirty lines and a stubbed `fetch` is five. There is no excuse for
this being untested, and a `check-gate` workflow beside `check-model` is the
house idiom.

### Check the consequence, never the setting

The same discipline extends past code to the infrastructure the door depends on,
and the rule is: **assert what the outside world observes, not what the console
reports.** A dashboard shows you its own intent; only a probe shows you the
truth.

The canonical instance is DNS behind a proxying CDN. Cloudflare proxies CNAMEs
by default, so a mail-provider DKIM record can sit in the dashboard looking
perfect while the public internet sees the CDN's A records and no CNAME at all.
The provider never verifies, nothing errors, nothing logs, and the only symptom
is that mail stops — which resembles a dozen unrelated faults. Reading the proxy
toggle back would confirm what the dashboard believes. Resolving the name the
way the provider will resolve it confirms what is true, and the states are
cleanly distinguishable: a correct record answers with the CNAME, a proxied one
answers `ENODATA` plus CDN addresses, a missing one answers `ENOTFOUND`.

Three properties make such a checker worth having:

- **Query public resolvers, not the system one** — a stale local cache is
  precisely what makes a broken record look fixed.
- **Guard what already worked**, not just what you are adding. The likeliest
  future breakage is someone "fixing" SPF for the new sender and taking inbound
  mail down with it.
- **Put it on a schedule, not in PR CI.** External state drifts without anyone
  pushing; failing pull requests for it is noise, while a daily run puts a fixed
  upper bound on how long the failure can hide.

Run it *before* the work is done and confirm it fails. A checker that passes
against an unconfigured system is measuring nothing.

## Anti-patterns

Reading an SSO email header without verifying the assertion beside it · a login
form that says "unknown address" · an approval link that grants access without
proving who clicked it · consuming a token before checking authority · a session
with no revocation lever · an allowlist that lives in code once a second person
depends on it · `DISABLE_GATE` surviving graduation to Tier 2 · putting the
self-service door behind the very SSO app it exists to route around · a `next`
parameter that accepts absolute URLs · shipping any of this with no adversarial
test · telling a locked-out collaborator you will "send a magic link that sets
up SSO", which is not a thing that exists.

## Worked exemplar

A complete build runs Tier 1 and Tier 2 side by side over one Cloudflare Pages project, with the mail hop through a separate email
Worker, 68 adversarial assertions, and a setup runbook. Its layout is the shape
shown in *Tier 2 — the shape*. The Tier 1 verifier alone ships in
`exemplars/3pt-hub/functions/_middleware.js`.
