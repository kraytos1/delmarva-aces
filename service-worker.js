// Delmarva Aces Service Worker
// Caches core files for offline use

const CACHE_NAME = 'aces-v5'
const CORE_FILES = [
  '/',
  '/index.html',
  '/game.html',
  '/score.html',
  '/lineup.html',
  '/config.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@300;400;500;600&family=Roboto+Mono:wght@400;500&display=swap'
]

// Install — cache core files
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('Aces SW: caching core files')
      // Cache what we can, ignore failures for external resources
      return Promise.allSettled(
        CORE_FILES.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.log('SW cache miss (ok):', url)
          })
        })
      )
    })
  )
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME })
            .map(function(key) { return caches.delete(key) })
      )
    })
  )
  self.clients.claim()
})

// Fetch — network first, fall back to cache
self.addEventListener('fetch', function(e) {
  // Skip Supabase API calls — always need live data
  if (e.request.url.includes('supabase.co') ||
      e.request.url.includes('googleapis.com/youtube') ||
      e.request.method !== 'GET') {
    return
  }

  // Skip media & range requests — <video> playback needs 206 Partial Content
  // straight from the network; range responses can't be cached and shouldn't be
  // mediated by the SW (otherwise highlight clips can fail to play/seek).
  if (e.request.headers.has('range') ||
      e.request.destination === 'video' ||
      e.request.destination === 'audio') {
    return
  }

  e.respondWith(
    fetch(e.request)
      .then(function(response) {
        // Cache successful responses
        if (response.ok) {
          var clone = response.clone()
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone)
          })
        }
        return response
      })
      .catch(function() {
        // Network failed — try cache
        return caches.match(e.request).then(function(cached) {
          if (cached) return cached
          // Return the home page for navigation requests when offline
          if (e.request.mode === 'navigate') {
            return caches.match('/index.html')
          }
        })
      })
  )
})
