/* hub-workspace reference · Gate — Tier 1 (Cloudflare Access) with the Tier 0 door kept beside it.
   Two doors, one room. A request is served if it carries EITHER proof:
     1. a Cloudflare Access assertion (Cf-Access-Jwt-Assertion header or CF_Authorization cookie)
        that VERIFIES — RS256 signature against the team's published keys, issuer, audience, expiry.
        The header is never trusted on its own: on a hostname Access does not front, an unverified
        header is a total bypass (skill → collaborator-access, rule 1). Keys unreachable → 503,
        never "not signed in" (rule 2: fail closed).
     2. HTTP Basic auth: an allowlisted user + the ACCESS_PASS secret. This is the door curl uses,
        and the door that still works if the Access app is ever removed.
   Everything, assets included, sits behind this. No password or token in this file, ever.

   Pages env (set in BOTH Production and Preview):
     ACCESS_TEAM_DOMAIN  e.g. "example.cloudflareaccess.com"   (from tools/access-setup.sh)
     ACCESS_AUD          the Access application's AUD tag       (from tools/access-setup.sh)
     ACCESS_PASS         the Basic-auth secret
     ACCESS_DOMAIN       the principals' email domain for Basic auth, e.g. "example.com"
     ACCESS_USERS        optional comma-separated extra Basic-auth users outside that domain
   No DISABLE_GATE: once a hostname can sit outside Access, an open-by-default switch is a hole. */


/* ---- Access assertion verification ------------------------------------------------------- */
let certCache = { at: 0, keys: null };
async function accessKeys(team) {
  if (certCache.keys && Date.now() - certCache.at < 10 * 60 * 1000) return certCache.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`, { cf: { cacheTtl: 600 } });
  if (!r.ok) throw new Error('certs ' + r.status);
  const j = await r.json();
  const keys = {};
  for (const k of j.keys || []) {
    if (k.kty !== 'RSA' || (k.alg && k.alg !== 'RS256')) continue;   // pin the algorithm
    keys[k.kid] = await crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }
  certCache = { at: Date.now(), keys };
  return keys;
}
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
async function verifyAccess(token, env) {
  const team = env.ACCESS_TEAM_DOMAIN, aud = env.ACCESS_AUD;
  if (!team || !aud || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header, payload;
  try { header = JSON.parse(new TextDecoder().decode(b64u(parts[0]))); payload = JSON.parse(new TextDecoder().decode(b64u(parts[1]))); } catch { return null; }
  if (header.alg !== 'RS256' || !header.kid) return null;              // refuses alg:none and HMAC-with-public-key
  const keys = await accessKeys(team);                                  // throws → 503 upstream
  const key = keys[header.kid];
  if (!key) return null;
  const ok = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, b64u(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) return null;
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== `https://${team}`) return null;
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null;
  return payload.email || payload.sub || 'access-user';
}
function cookie(request, name) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

/* ---- Basic-auth door ------------------------------------------------------------------------ */
function basicOk(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Basic ')) return false;
  let user = '', pass = '';
  try { const dec = atob(auth.slice(6)); const i = dec.indexOf(':'); user = dec.slice(0, i).trim().toLowerCase(); pass = dec.slice(i + 1); } catch { return false; }
  const extra = String(env.ACCESS_USERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const dom = String(env.ACCESS_DOMAIN || '').trim().toLowerCase();
  const userOk = (dom && user.endsWith('@' + dom)) || extra.includes(user);
  return userOk && !!env.ACCESS_PASS && pass === env.ACCESS_PASS;
}

export async function onRequest(ctx) {
  const { request, env, next } = ctx;
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || cookie(request, 'CF_Authorization');
  if (token) {
    try {
      if (await verifyAccess(token, env)) return next();
    } catch (e) {
      return new Response('Gate cannot verify identity right now (' + e.message + ').', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } });
    }
  }
  if (basicOk(request, env)) return next();
  return new Response('Workspace · sign in through Cloudflare Access, or with an allowlisted address and the team password.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="workspace", charset="UTF-8"', 'Cache-Control': 'no-store' }
  });
}
