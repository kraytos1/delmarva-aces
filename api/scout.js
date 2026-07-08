// api/scout.js · Delmarva Aces — AI opponent scouting brief.
//
// Turns the structured opponent data the Scouting Report page already computes
// (threat/record, top hitters, top pitchers) into a concise, coach-voice
// pre-game game plan via the Anthropic (Claude) API.
//
// Setup: same ANTHROPIC_API_KEY env var as api/recap.js (Vercel → Settings →
// Environment Variables). Until it's set, returns a friendly 501 and the
// "AI Game Plan" button shows a "not configured yet" note.
//
// No npm dependencies: uses the global fetch built into Vercel's Node runtime.

const MODEL = 'claude-opus-4-8'; // swap to 'claude-haiku-4-5' for cheaper/faster briefs

const SYSTEM_PROMPT = [
  'You are an experienced youth travel-baseball coach writing a concise pre-game scouting brief',
  'for the Delmarva Aces (13U) coaching staff about an upcoming opponent.',
  'Use ONLY the data provided — never invent player names, jersey numbers, or statistics.',
  'Be specific and actionable, the way a coach briefs players before first pitch.',
  'Structure it in three short labeled parts, each 1–3 sentences:',
  '"Read:" one line on how dangerous they are and why;',
  '"At the plate:" how the Aces should attack their pitching (name their arms and tendencies);',
  '"In the field:" which of their hitters to contain and how to pitch them, plus baserunning warnings.',
  'End with a one-line "Bottom line:".',
  'About 150–220 words total. Plain prose — no markdown headers, no bullet symbols, no hashtags, no emojis.'
].join(' ');

function line(label, arr, fmt) {
  if (!arr || !arr.length) return '- ' + label + ': none on record';
  return '- ' + label + ':\n' + arr.map(function (x) { return '    ' + fmt(x); }).join('\n');
}

function buildScoutPrompt(d) {
  var o = d.opponent || {};
  var parts = ['Write the scouting brief from these facts.', '', 'OPPONENT: ' + (o.name || 'Unknown') + (o.level ? ' (' + o.level + ')' : '')];
  if (o.tier || o.threat != null) parts.push('- Threat rating: ' + (o.tier || '') + (o.threat != null ? ' (' + o.threat + '/100)' : ''));
  if (o.record) parts.push('- Record: ' + o.record + (o.runDiff != null ? ', run differential ' + (o.runDiff >= 0 ? '+' : '') + o.runDiff : ''));
  parts.push('');
  parts.push(line('Top hitters (their most dangerous bats)', d.hitters, function (h) {
    return (h.num ? '#' + h.num + ' ' : '') + h.name + ' — AVG ' + h.avg + ', ' + h.hr + ' HR, ' + h.sb + ' SB, OPS ' + h.ops +
      (h.flags && h.flags.length ? ' [' + h.flags.join(', ') + ']' : '');
  }));
  parts.push(line('Their pitching (min innings applied)', d.pitchers, function (p) {
    return (p.num ? '#' + p.num + ' ' : '') + p.name + ' — ' + p.ip + ' IP, ERA ' + p.era + ', K/9 ' + p.k9 + ', BB/9 ' + p.bb9 + ', WHIP ' + p.whip +
      (p.flags && p.flags.length ? ' [' + p.flags.join(', ') + ']' : '');
  }));
  return parts.join('\n');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(501).json({
      error: 'not_configured',
      message: 'AI game plan is not set up yet. Add ANTHROPIC_API_KEY in the Vercel project settings to enable it.'
    });
  }

  var body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  if (!body || !body.opponent || (!body.hitters && !body.pitchers)) {
    return res.status(400).json({ error: 'bad_request', message: 'Missing opponent scouting data.' });
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
        max_tokens: 900,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildScoutPrompt(body) }]
      })
    });

    if (!resp.ok) {
      var errText = await resp.text();
      return res.status(502).json({ error: 'upstream_error', message: 'Claude API returned ' + resp.status, detail: errText.slice(0, 500) });
    }

    var data = await resp.json();
    if (data.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'refusal', message: 'The model declined to write this brief.' });
    }
    var brief = (data.content || [])
      .filter(function (b) { return b.type === 'text'; })
      .map(function (b) { return b.text; })
      .join('\n').trim();

    if (!brief) return res.status(502).json({ error: 'empty', message: 'No brief text was returned.' });
    return res.status(200).json({ brief: brief, model: data.model || MODEL });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', message: String(e && e.message || e) });
  }
};
