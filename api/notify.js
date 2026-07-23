// api/notify.js · Delmarva Aces — Web Push sender ("game is live" / "final score").
//
// POST { type: 'live' | 'final', gameId: '<uuid>' }
//  -> verifies the game is actually in that state in Supabase (so a stray call
//     can't spam families), takes a once-only dedupe flag on the game row,
//     then pushes to every subscription in push_subs, pruning dead ones.
//
// Zero npm dependencies (repo pattern — see tts.js): VAPID (RFC 8292) and
// aes128gcm payload encryption (RFC 8291) are implemented on node:crypto.
//
// Setup: in Vercel → Settings → Environment Variables, add
//   VAPID_PRIVATE_KEY = <base64url 32-byte scalar>   (generated once, keep secret)
//   VAPID_SUBJECT     = mailto:you@example.com       (contact for push services)
// The matching PUBLIC key is not secret — it lives in push.js on the client
// and in VAPID_PUBLIC below (they must stay the same pair).
// Until the env vars exist this endpoint returns 501 and nothing else breaks.

const crypto = require('crypto');

const VAPID_PUBLIC = 'BF1CW7OahWW815bjr8550Cv-bdBXG0Oy2PsBEk7_OG7gwm2AaWnGFZhqbAUyPHUKSMdAO5wLI3NUD8q7gAHupek';
const SUPABASE_URL = 'https://urwwzdlkgfljfvqgfhyb.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyd3d6ZGxrZ2ZsamZ2cWdmaHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzY0MzYsImV4cCI6MjA5NzcxMjQzNn0.s5eOVqI0EaCnP5jDfuVtHeqBonsaIwwqQBrf1heMK1k';

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// ── VAPID: ES256 JWT over the endpoint's origin ────────────────────────────
function vapidHeaders(endpoint, privB64u) {
  const priv = fromB64u(privB64u);
  const pub = fromB64u(VAPID_PUBLIC); // 65B uncompressed point: 0x04 || x || y
  const jwk = {
    kty: 'EC', crv: 'P-256',
    d: b64u(priv),
    x: b64u(pub.subarray(1, 33)),
    y: b64u(pub.subarray(33, 65)),
  };
  const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  const aud = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const seg = (o) => b64u(Buffer.from(JSON.stringify(o)));
  const unsigned = seg({ typ: 'JWT', alg: 'ES256' }) + '.' + seg({ aud, exp: now + 12 * 3600, sub: process.env.VAPID_SUBJECT || 'mailto:coach@delmarva-aces.vercel.app' });
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return { Authorization: `vapid t=${unsigned + '.' + b64u(sig)}, k=${VAPID_PUBLIC}` };
}

// ── RFC 8291 aes128gcm payload encryption ───────────────────────────────────
function encrypt(payload, p256dhB64u, authB64u) {
  const uaPub = fromB64u(p256dhB64u);         // client public key (65B)
  const authSecret = fromB64u(authB64u);      // 16B shared auth secret
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();          // our ephemeral public key (65B)
  const shared = ecdh.computeSecret(uaPub);

  const hkdf = (ikm, salt, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]);
  const ikm = hkdf(shared, authSecret, keyInfo, 32);
  const salt = crypto.randomBytes(16);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const padded = Buffer.concat([Buffer.from(payload), Buffer.from([2])]); // 0x02 = last-record delimiter
  const body = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  // aes128gcm binary header: salt(16) | record-size(4) | keyid-len(1) | keyid(=as_public, 65)
  const header = Buffer.concat([
    salt,
    Buffer.from([0, 0, 16, 0]),  // rs = 4096
    Buffer.from([asPub.length]),
    asPub,
  ]);
  return Buffer.concat([header, body]);
}

async function pushTo(sub, payload, privKey) {
  const body = encrypt(payload, sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      ...vapidHeaders(sub.endpoint, privKey),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '600',            // stop trying after 10 min — a stale "game live" ping is noise
      Urgency: 'high',
    },
    body,
  });
  return res.status;
}

// ── Supabase REST helpers (anon key — same public posture as the site) ─────
async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  return res;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv) return res.status(501).json({ error: 'not_configured', hint: 'set VAPID_PRIVATE_KEY in Vercel env vars' });

  const { type, gameId } = req.body || {};
  if (!['live', 'final'].includes(type) || !gameId) return res.status(400).json({ error: 'need type live|final and gameId' });

  // Verify the game really is in the claimed state — the endpoint is public,
  // so the DB is the authority on whether there is anything to announce.
  const gRes = await sb(`games?id=eq.${encodeURIComponent(gameId)}&select=id,status,our_score,opp_score,push_sent_live,push_sent_final,opponents(name)`);
  const games = await gRes.json();
  const g = Array.isArray(games) && games[0];
  if (!g) return res.status(404).json({ error: 'game not found' });
  if (type === 'live' && g.status !== 'live') return res.status(409).json({ error: 'game is not live' });
  if (type === 'final' && g.status !== 'final') return res.status(409).json({ error: 'game is not final' });

  // Once-only per game per type: flip the flag first; a concurrent duplicate
  // call sees 0 updated rows and stops.
  const flag = type === 'live' ? 'push_sent_live' : 'push_sent_final';
  if (g[flag]) return res.status(200).json({ skipped: 'already sent' });
  const claim = await sb(`games?id=eq.${encodeURIComponent(gameId)}&${flag}=is.false`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ [flag]: true }),
  });
  const claimed = await claim.json();
  if (!Array.isArray(claimed) || !claimed.length) return res.status(200).json({ skipped: 'already sent (raced)' });

  const opp = (g.opponents && g.opponents.name) || 'the opponent';
  const msg = type === 'live'
    ? { title: '⚾ Aces are LIVE!', body: `Delmarva Aces vs ${opp} — first pitch. Tap to watch.`, url: '/game.html' }
    : { title: `Final: Aces ${g.our_score ?? 0}–${g.opp_score ?? 0}`, body: `vs ${opp} — tap for the box score.`, url: '/game.html' };
  const payload = JSON.stringify(msg);

  const sRes = await sb('push_subs?select=endpoint,p256dh,auth');
  const subs = await sRes.json();
  if (!Array.isArray(subs) || !subs.length) return res.status(200).json({ sent: 0, note: 'no subscribers' });

  let sent = 0, failed = 0, removed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      const code = await pushTo(s, payload, priv);
      if (code === 201 || code === 200) sent++;
      else if (code === 404 || code === 410) {
        removed++; // subscription is gone (uninstalled / revoked) — prune it
        await sb(`push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' });
      } else failed++;
    } catch (e) { failed++; }
  }));

  return res.status(200).json({ type, sent, failed, removed });
};

// exposed for the offline crypto round-trip test (no runtime effect)
module.exports._internals = { encrypt, vapidHeaders, pushTo };
