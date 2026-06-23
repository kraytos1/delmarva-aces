// ─────────────────────────────────────────────────────────
// supabase.js  ·  Delmarva Aces data layer
//
// HOW TO USE:
// 1. Create a free project at supabase.com
// 2. Go to Project Settings → API
// 3. Copy your Project URL and anon/public key into .env:
//
//    VITE_SUPABASE_URL=https://xyzxyz.supabase.co
//    VITE_SUPABASE_ANON_KEY=eyJhbGci...
//
// That's it. Every function below just works.
// ─────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)


// ─── PLAYERS ──────────────────────────────────────────────

/** All players with pre-calculated season batting stats */
export async function getPlayerSeasonStats() {
  const { data, error } = await supabase
    .from('player_season_stats')
    .select('*')
    .order('jersey_num')
  if (error) throw error
  return data
}

/** Pitching stats for all players who have pitched */
export async function getPitchingStats() {
  const { data, error } = await supabase
    .from('player_pitching_stats')
    .select('*')
    .order('total_pitches', { ascending: false })
  if (error) throw error
  return data
}

/** Single player with full game log */
export async function getPlayer(jerseyNum) {
  const { data, error } = await supabase
    .from('players')
    .select(`*, at_bats(id, result, rbi, clip_url,
      games(game_date, our_score, opp_score,
        opponents(name)))`)
    .eq('jersey_num', jerseyNum)
    .single()
  if (error) throw error
  return data
}


// ─── GAMES ────────────────────────────────────────────────

/** Recent completed games, newest first */
export async function getRecentGames(limit = 10) {
  const { data, error } = await supabase
    .from('games')
    .select('*, opponents(name, short_name)')
    .eq('status', 'final')
    .order('game_date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

/** Next scheduled game */
export async function getNextGame() {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('games')
    .select('*, opponents(name)')
    .eq('status', 'scheduled')
    .gte('game_date', today)
    .order('game_date')
    .limit(1)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data || null
}

/** Currently live game (uses live_game_summary view) */
export async function getLiveGame() {
  const { data, error } = await supabase
    .from('live_game_summary')
    .select('*')
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data || null
}

/** Full box score: all at-bats + pitches for a game */
export async function getGameBoxScore(gameId) {
  const { data, error } = await supabase
    .from('at_bats')
    .select(`*, players(jersey_num, first_name, last_name),
      pitches(pitch_num, pitch_type, velocity_mph, result,
              balls_before, strikes_before)`)
    .eq('game_id', gameId)
    .order('inning').order('ab_num')
  if (error) throw error
  return data
}


// ─── SCORING TABLET (write operations) ────────────────────
// Only authenticated scorers can call these.
// Row Level Security in Supabase blocks anonymous write.

/** Log a single pitch from the scoring tablet */
export async function logPitch(pitch) {
  // pitch = { at_bat_id, game_id, pitcher_id, pitch_num,
  //           pitch_type, velocity_mph, result,
  //           balls_before, strikes_before, yt_offset_sec }
  const { data, error } = await supabase
    .from('pitches').insert(pitch).select().single()
  if (error) throw error
  return data
}

/** Log an at-bat outcome */
export async function logAtBat(atBat) {
  // atBat = { game_id, batter_id, inning, half, ab_num,
  //           result, rbi, runs_scored, yt_offset_sec }
  const { data, error } = await supabase
    .from('at_bats').insert(atBat).select().single()
  if (error) throw error
  return data
}

/** Update live game state (score, inning, outs) */
export async function updateGameState(gameId, state) {
  const { error } = await supabase
    .from('games').update(state).eq('id', gameId)
  if (error) throw error
}

/** Set a game to live, record YouTube stream start time */
export async function startGame(gameId, youtubeStreamId) {
  const { error } = await supabase
    .from('games')
    .update({
      status: 'live',
      youtube_stream_id: youtubeStreamId,
      stream_start_utc: new Date().toISOString(),
    })
    .eq('id', gameId)
  if (error) throw error
}

/** Mark a game as final */
export async function endGame(gameId, finalScore) {
  const { error } = await supabase
    .from('games')
    .update({ status: 'final',
              our_score: finalScore.us,
              opp_score: finalScore.them })
    .eq('id', gameId)
  if (error) throw error
}


// ─── REAL-TIME SUBSCRIPTIONS ──────────────────────────────
// These push data to ALL viewer browsers the instant
// the scorer taps something on the iPad.

/**
 * Subscribe to live pitches for a game.
 *
 *   const unsub = subscribeToPitches(gameId, (pitch) => {
 *     updatePitchLog(pitch)
 *     updateVeloDisplay(pitch.velocity_mph)
 *   })
 *   // Call unsub() when leaving the page
 */
export function subscribeToPitches(gameId, callback) {
  const ch = supabase
    .channel(`pitches:${gameId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pitches',
        filter: `game_id=eq.${gameId}` },
      (payload) => callback(payload.new))
    .subscribe()
  return () => supabase.removeChannel(ch)
}

/**
 * Subscribe to game state changes (score, inning, outs).
 *
 *   const unsub = subscribeToGameState(gameId, (game) => {
 *     updateScoreboard(game)
 *   })
 */
export function subscribeToGameState(gameId, callback) {
  const ch = supabase
    .channel(`game:${gameId}`)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'games',
        filter: `id=eq.${gameId}` },
      (payload) => callback(payload.new))
    .subscribe()
  return () => supabase.removeChannel(ch)
}

/**
 * Subscribe to at-bat outcomes (for play-by-play feed).
 *
 *   const unsub = subscribeToAtBats(gameId, (ab) => {
 *     addPlayToFeed(ab)
 *   })
 */
export function subscribeToAtBats(gameId, callback) {
  const ch = supabase
    .channel(`at_bats:${gameId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'at_bats',
        filter: `game_id=eq.${gameId}` },
      (payload) => callback(payload.new))
    .subscribe()
  return () => supabase.removeChannel(ch)
}


// ─── HIGHLIGHTS ───────────────────────────────────────────

/** Ready clips for a player's highlight reel */
export async function getPlayerClips(playerId) {
  const { data, error } = await supabase
    .from('at_bats')
    .select(`id, result, rbi, clip_url, clip_status,
      games(game_date, opponents(name))`)
    .eq('batter_id', playerId)
    .eq('clip_status', 'ready')
    .not('clip_url', 'is', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** Clips queued for post-game extraction */
export async function getQueuedClips() {
  const { data, error } = await supabase
    .from('at_bats')
    .select(`id, yt_offset_sec, result, batter_id,
      games(youtube_stream_id, stream_start_utc)`)
    .eq('clip_status', 'queued')
    .not('yt_offset_sec', 'is', null)
  if (error) throw error
  return data
}

/** Mark a clip as ready after extraction */
export async function markClipReady(atBatId, clipUrl) {
  const { error } = await supabase
    .from('at_bats')
    .update({ clip_url: clipUrl, clip_status: 'ready' })
    .eq('id', atBatId)
  if (error) throw error
}
