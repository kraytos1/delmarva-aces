// api/recap.js · Delmarva Aces — AI game-recap generator.
//
// A Vercel serverless function that turns a game's box-score facts into a short,
// in-the-team's-voice write-up via the Anthropic (Claude) API.
//
// Setup: in the Vercel project → Settings → Environment Variables, add
//   ANTHROPIC_API_KEY = sk-ant-...   (from console.anthropic.com)
// Until that key exists the endpoint returns a friendly 501 and the site's
// "AI Recap" button shows a "not configured yet" note — nothing else breaks.
//
// No npm dependencies: uses the global fetch built into Vercel's Node runtime.

const MODEL = 'claude-opus-4-8'; // swap to 'claude-haiku-4-5' for a cheaper/faster (still-good) writeup

const SYSTEM_PROMPT = [
  'You are the beat writer for the Delmarva Aces, a competitive 13U travel baseball team.',
  'Write a short post-game recap for the team website that parents will read and share.',
  'Voice: upbeat and vivid, proud on wins, encouraging and forward-looking on losses — never harsh on the kids.',
  'Length: 2 short paragraphs, about 80–130 words total. Refer to the team as "the Aces".',
  'Ground every claim in the facts you are given. Do NOT invent statistics, player names, innings, or plays that are not provided.',
  'No hashtags, no emojis, no markdown headings — just clean prose.'
].join(' ');

function buildUserPrompt(g) {
  const won = !!g.W || (g.us != null && g.them != null && Number(g.us) > Number(g.them));
  const lines = [
    'Write the recap from these facts:',
    '- Result: ' + (won ? 'Aces WIN' : 'Aces loss'),
    '- Final score: Aces ' + (g.us != null ? g.us : '?') + ', ' + (g.opp || 'Opponent') + ' ' + (g.them != null ? g.them : '?'),
    g.event ? '- Event/Tournament: ' + g.event : null,
    g.date ? '- Date: ' + g.date : null,
    g.location ? '- Location: ' + g.location : null
  ];
  // Optional richer inputs (available once Fall games are scored):
  if (Array.isArray(g.performers) && g.performers.length) {
    lines.push('- Standout performers (use only these, verbatim): ' + g.performers.join('; '));
  }
  if (typeof g.notes === 'string' && g.notes.trim()) {
    lines.push('- Additional notes: ' + g.notes.trim());
  }
  return lines.filter(Boolean).join('\n');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Not configured yet — the frontend treats this as a soft, expected state.
    return res.status(501).json({
      error: 'not_configured',
      message: 'AI recap is not set up yet. Add ANTHROPIC_API_KEY in the Vercel project settings to enable it.'
    });
  }

  // Vercel parses JSON bodies automatically; be defensive anyway.
  var body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  var game = (body && body.game) || {};
  if (game.us == null && game.them == null) {
    return res.status(400).json({ error: 'bad_request', message: 'Missing game score.' });
  }

  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(game) }]
      })
    });

    if (!resp.ok) {
      var errText = await resp.text();
      return res.status(502).json({
        error: 'upstream_error',
        message: 'Claude API returned ' + resp.status,
        detail: errText.slice(0, 500)
      });
    }

    var data = await resp.json();
    if (data.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'refusal', message: 'The model declined to write this recap.' });
    }
    var recap = (data.content || [])
      .filter(function (b) { return b.type === 'text'; })
      .map(function (b) { return b.text; })
      .join('\n').trim();

    if (!recap) {
      return res.status(502).json({ error: 'empty', message: 'No recap text was returned.' });
    }
    return res.status(200).json({ recap: recap, model: data.model || MODEL });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', message: String(e && e.message || e) });
  }
};
