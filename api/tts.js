// api/tts.js · Delmarva Aces — text-to-speech (play-by-play voice).
//
// A Vercel serverless function that turns a line of text into spoken audio.
// Built provider-agnostic: OpenAI today, ElevenLabs can slot in later by
// filling in the elevenlabs() function — the frontend contract never changes.
//
// Request  (POST, JSON): { text, voice?, instructions?, provider?, format? }
// Response (200):        raw audio bytes (Content-Type: audio/mpeg by default)
// Response (501):        { error:'not_configured' } when the needed key is absent
//
// Setup: in Vercel → Settings → Environment Variables, add
//   OPENAI_API_KEY = sk-...            (from platform.openai.com)
//   ELEVENLABS_API_KEY = ...           (optional, only when we A/B ElevenLabs)
// Until OPENAI_API_KEY exists the endpoint returns a friendly 501 and the
// caller can show a "voice not set up yet" note — nothing else breaks.
//
// No npm dependencies: uses the global fetch built into Vercel's Node runtime.

const DEFAULT_PROVIDER = 'openai';

// ── OpenAI ────────────────────────────────────────────────────────────────
const OPENAI_MODEL   = 'gpt-4o-mini-tts'; // steerable via `instructions`, ~$0.015/min
const OPENAI_VOICES  = ['alloy','ash','ballad','coral','echo','fable','nova','onyx','sage','shimmer','verse'];
const OPENAI_DEFAULT_VOICE = 'ash';       // energetic male — good booth voice
const DEFAULT_INSTRUCTIONS =
  'You are a fast-paced, energetic live radio sports announcer calling a youth ' +
  'baseball game. Build excitement on big plays; stay crisp and clear on routine ones.';

async function openai(text, opts) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { notConfigured: true, message: 'Add OPENAI_API_KEY in Vercel settings to enable voice.' };

  const voice = OPENAI_VOICES.indexOf(opts.voice) >= 0 ? opts.voice : OPENAI_DEFAULT_VOICE;
  const resp = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      voice: voice,
      input: text,
      instructions: opts.instructions || DEFAULT_INSTRUCTIONS,
      response_format: opts.format || 'mp3'
    })
  });
  if (!resp.ok) {
    const detail = await resp.text();
    return { upstream: resp.status, detail: detail.slice(0, 500) };
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  return { audio: buf, contentType: contentTypeFor(opts.format) };
}

// ── ElevenLabs (stub — fill in when we A/B it) ──────────────────────────────
async function elevenlabs(text, opts) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { notConfigured: true, message: 'Add ELEVENLABS_API_KEY in Vercel settings to enable ElevenLabs.' };

  // Voice id (not name) — defaults to "Adam". Override per-request with opts.voice.
  const voiceId = opts.voice || 'pNInz6obpgDQGcFmaJgB';
  const resp = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', 'accept': 'audio/mpeg' },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_flash_v2_5',           // low-latency model, right for live
      voice_settings: { stability: 0.4, similarity_boost: 0.8 }
    })
  });
  if (!resp.ok) {
    const detail = await resp.text();
    return { upstream: resp.status, detail: detail.slice(0, 500) };
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  return { audio: buf, contentType: 'audio/mpeg' };
}

const PROVIDERS = { openai: openai, elevenlabs: elevenlabs };

function contentTypeFor(fmt) {
  switch (fmt) {
    case 'opus': return 'audio/opus';
    case 'aac':  return 'audio/aac';
    case 'flac': return 'audio/flac';
    case 'wav':  return 'audio/wav';
    case 'pcm':  return 'audio/pcm';
    default:     return 'audio/mpeg'; // mp3
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const text = (typeof body.text === 'string' ? body.text : '').trim();
  if (!text) return res.status(400).json({ error: 'bad_request', message: 'Missing text.' });
  if (text.length > 2000) return res.status(400).json({ error: 'too_long', message: 'Keep each call under 2000 characters.' });

  const providerName = (body.provider || DEFAULT_PROVIDER).toLowerCase();
  const provider = PROVIDERS[providerName];
  if (!provider) return res.status(400).json({ error: 'bad_provider', message: 'Unknown provider: ' + providerName });

  try {
    const out = await provider(text, {
      voice: body.voice,
      instructions: body.instructions,
      format: body.format
    });

    if (out.notConfigured) return res.status(501).json({ error: 'not_configured', message: out.message });
    if (out.upstream)      return res.status(502).json({ error: 'upstream_error', message: providerName + ' returned ' + out.upstream, detail: out.detail });
    if (!out.audio)        return res.status(502).json({ error: 'empty', message: 'No audio was returned.' });

    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Content-Length', out.audio.length);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(out.audio);
  } catch (e) {
    return res.status(500).json({ error: 'server_error', message: String(e && e.message || e) });
  }
};
