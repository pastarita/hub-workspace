# Cloudflare Access on a hub — the drivable runbook

**Access is the day-zero gate. One-time PIN is the login method. Both, every time.** The Basic-auth
middleware stays beside it as the second door (curl, and the day the Access app is removed), but
it is never the *first* thing a collaborator meets. This file is the exact click path, written so
an agent driving the dashboard through browser automation can follow it without discovery, and so
a human can do it by hand in under ten minutes. Verified 2026-09-26 on a live hub.

## Why this order

- The `wrangler login` OAuth token has **no Zero Trust scope**. `wrangler pages deploy` works; the
  Access API returns empty lists rather than errors. Creating the app is dashboard or a purpose-made
  API token. The dashboard is faster on day zero.
- A team with **no** identity provider gets One-time PIN by default. A team with **any** provider
  loses that default and offers only what is listed. Every account here already has the
  "Cloudflare" provider (it signs people in with a Cloudflare dashboard account and then fetches
  their account membership). A collaborator who is not a member of the Cloudflare account picks it,
  and gets *"Failed to fetch user group information from the identity provider."* The owner never
  sees this because the owner is a member. **So: add One-time PIN explicitly, and restrict each app
  to it.**
- One wildcard destination (`*.<project>.pages.dev`) makes every PR preview share the app and the
  AUD. Do it at creation; there is no "known gap" for previews once it is there.

## URL shape and what to expect from the dashboard

- Entry: `https://one.dash.cloudflare.com/<ACCOUNT_ID>/` → redirects to
  `https://dash.cloudflare.com/<ACCOUNT_ID>/one/...`. Deep links guessed from older docs 404 with
  "We could not find that page"; when that happens, expand the collapsed sidebar and click through.
  Known-good paths under `/one/`:
  - `integrations/identity-providers`
  - `access-controls/apps`, `access-controls/apps/self-hosted/add`
  - `access-controls/policies`, `access-controls/policies/<id>/edit`
- Every page shows a Cloudflare spinner for 4–8 s. Wait, then locate elements by their label
  (`find`), not by coordinates; the layout shifts as panels load.
- Policy creation from inside the app form is a **modal**. Clicking a policy's *name* anywhere opens
  a **read-only overview**; the edit form is the **Configure** link on that overview, or
  `policies/<id>/edit`.
- The application **Name** field is at the bottom of the form under *Details* and is pre-filled
  with the first hostname. Set it; "<project>.pages.dev" is not a name.

## The click path (self-hosted app + policy + PIN)

1. **Identity providers** → `Add an identity provider` → click **One-time PIN**. It is added on
   click; there is no form. Confirm it appears in the list beside "Cloudflare".
2. **Applications** → `Create new application` → **Continue with Self-hosted and private**.
3. **Destinations**: under the first public hostname click `Switch to custom input`, type
   `<project>.pages.dev`. Click `+ Add public hostname`, `Switch to custom input` on the new row, type
   `*.<project>.pages.dev`. (The "requires existing DNS configuration" note is about zones you own;
   `pages.dev` hostnames work.)
4. **Access policies** → `Create new policy` (modal):
   - Policy Name: `<Project> team`. Action: Allow.
   - Include rule 1: selector **Emails ending in**, value `@<your-domain>`.
   - `+ Add include (OR)` → rule 2: selector **Emails**, then type each address and press Return
     (they become chips). Put every principal's *actual login address* here, including consumer
     Gmail; the domain rule alone does not cover them.
   - Save policy. It appears as a reusable policy attached to the app.
5. **Authentication**: switch **Accept all available identity providers** off and select
   **One-time PIN** only. This removes the failing "Cloudflare" button from the login page.
   **Apply instant authentication** turns itself on once a single method is left; keep it, so the
   collaborator lands straight on the email prompt instead of a chooser.
6. **Details**: Name `<Project> hub`, Session duration 24h. **Create**.
7. Editing the allowlist later: **Policies** → the policy → **Configure** → add a chip → Save
   policy. No redeploy.

## Wiring the verifier (the middleware must verify the assertion, never trust the header)

The redirect the app now issues carries both values the middleware needs:

```sh
curl -s -o /dev/null -w '%{redirect_url}\n' https://<project>.pages.dev/
# https://<team>.cloudflareaccess.com/cdn-cgi/access/login/<host>?kid=<AUD>&meta=...
```

`<team>.cloudflareaccess.com` is `ACCESS_TEAM_DOMAIN`; the `kid` query parameter is the app's
`ACCESS_AUD` (it equals the `aud` claim inside `meta`). Then, from the hub directory:

```sh
for ENV in "" "--env preview"; do
  printf '%s' "$TEAM" | npx wrangler pages secret put ACCESS_TEAM_DOMAIN --project-name=<project> $ENV
  printf '%s' "$AUD"  | npx wrangler pages secret put ACCESS_AUD         --project-name=<project> $ENV
done
make deploy      # secrets bind at deploy
```

Middleware shape (the `exemplars/reference-hub/functions/_middleware.js` is the exemplar): accept a verified
`Cf-Access-Jwt-Assertion` header or `CF_Authorization` cookie — RS256 against
`https://<team>/cdn-cgi/access/certs`, `kid` pinned, `iss` = `https://<team>`, `aud` contains
`ACCESS_AUD`, `exp` in the future — else fall through to Basic auth, else 401. Keys unreachable →
**503**, never "not signed in". No `DISABLE_GATE`.

## Verify (all four, every time the gate changes)

```sh
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://<project>.pages.dev/          # 302 → <team>.cloudflareaccess.com
curl -s -o /dev/null -w '%{http_code}\n' -H 'Cf-Access-Authenticated-User-Email: owner@x' https://<project>.pages.dev/   # 302, forged header refused
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://main.<project>.pages.dev/     # 302, preview covered
curl -s -o /dev/null -w '%{http_code}\n' -u 'owner@x:WRONG' https://<project>.pages.dev/         # 302 — Basic door is behind Access here, by design
```

Then the human test that matters: **the collaborator who is not a Cloudflare account member signs
in with a PIN before you call it done.** The owner's success proves nothing about the second door.

## Failure signatures

| Symptom | Cause | Fix |
|---|---|---|
| "Failed to fetch user group information from the identity provider" | Collaborator chose the "Cloudflare" provider; not an account member | Add One-time PIN; restrict the app to it (step 5) |
| Login page shows only "Cloudflare" | Team has a provider, so PIN is no longer the default | Step 1 |
| PIN never arrives | Consumer mail filtering `noreply@notify.cloudflare.com`; or a relay alias that does not match the policy | Check spam; use the exact address that is in the policy |
| Preview URL not gated | App has only the apex hostname | Add `*.<project>.pages.dev` destination |
| Middleware 503 | Certs endpoint unreachable, or wrong team domain | Recheck `ACCESS_TEAM_DOMAIN` from the redirect URL |
| Everything 401 even with a PIN session | `ACCESS_AUD` wrong, or secrets set in one environment only | Re-read `kid`; set both environments; redeploy |

## API alternative (when a token exists)

A token with *Access: Apps and Policies · Edit* and *Access: Organizations, Identity Providers, and
Groups · Read* lets `exemplars/reference-hub/tools/access-setup.sh` create or update the same app idempotently,
including the wildcard destination and the inline policy, and write the two Pages secrets. Use it
for the second hub onward; the dashboard path above is still the one to know, because it is what
you debug with.
