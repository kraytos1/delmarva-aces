// ─────────────────────────────────────────────────────────
// pin.js · Delmarva Aces
// PIN protection for coach-only pages
// Include AFTER config.js on any protected page
// ─────────────────────────────────────────────────────────

(function() {
  var PIN_KEY     = 'aces_pin_auth'
  var PIN_DAYS    = 7
  var PIN_MS      = PIN_DAYS * 24 * 60 * 60 * 1000

  function isUnlocked() {
    try {
      var stored = JSON.parse(localStorage.getItem(PIN_KEY) || '{}')
      return stored.ts && (Date.now() - stored.ts) < PIN_MS
    } catch(e) { return false }
  }

  function unlock() {
    localStorage.setItem(PIN_KEY, JSON.stringify({ ts: Date.now() }))
  }

  function buildPinScreen() {
    var el = document.createElement('div')
    el.id = 'pin-screen'
    el.innerHTML = [
      '<style>',
      '#pin-screen{position:fixed;inset:0;background:#0A0C0E;z-index:9999;',
      'display:flex;align-items:center;justify-content:center;flex-direction:column;',
      'font-family:"Inter",sans-serif;}',
      '#pin-screen img{width:72px;height:72px;object-fit:contain;',
      'filter:drop-shadow(0 0 20px rgba(232,83,10,.5));margin-bottom:16px;}',
      '#pin-screen h2{font-family:"Oswald",sans-serif;font-size:22px;font-weight:600;',
      'color:#F0EDE8;margin-bottom:4px;letter-spacing:.5px;}',
      '#pin-screen p{font-family:"Roboto Mono",monospace;font-size:11px;',
      'color:#7A8290;letter-spacing:1px;margin-bottom:32px;}',
      '#pin-dots{display:flex;gap:14px;margin-bottom:24px;}',
      '.pin-dot{width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.2);',
      'background:transparent;transition:background .15s,border-color .15s;}',
      '.pin-dot.filled{background:#E8530A;border-color:#E8530A;}',
      '.pin-dot.error{background:#e74c3c;border-color:#e74c3c;}',
      '#pin-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:220px;}',
      '.pin-btn{background:#181C22;border:1px solid rgba(255,255,255,.08);border-radius:12px;',
      'color:#F0EDE8;font-size:22px;font-weight:500;height:64px;cursor:pointer;',
      'transition:background .1s,transform .08s;-webkit-tap-highlight-color:transparent;}',
      '.pin-btn:active{background:#1F242C;transform:scale(.96);}',
      '.pin-btn.del{font-size:16px;color:#7A8290;}',
      '.pin-btn.del:active{color:#F0EDE8;}',
      '#pin-error{font-family:"Roboto Mono",monospace;font-size:11px;color:#e74c3c;',
      'height:16px;margin-top:12px;letter-spacing:1px;}',
      '</style>',
      '<img src="/logo.png" alt="Aces"/>',
      '<h2>Delmarva Aces</h2>',
      '<p>COACHES ONLY · ENTER PIN</p>',
      '<div id="pin-dots">',
      '<div class="pin-dot" id="pd0"></div>',
      '<div class="pin-dot" id="pd1"></div>',
      '<div class="pin-dot" id="pd2"></div>',
      '<div class="pin-dot" id="pd3"></div>',
      '</div>',
      '<div id="pin-grid">',
      '[1][2][3][4][5][6][7][8][9][.][0][X]'.split('[').filter(Boolean).map(function(s){
        var v = s.replace(']','')
        if(v==='.') return '<div></div>'
        if(v==='X') return '<button class="pin-btn del" onclick="pinDel()">⌫</button>'
        return '<button class="pin-btn" onclick="pinTap(\''+v+'\')">'+v+'</button>'
      }).join(''),
      '</div>',
      '<div id="pin-error"></div>'
    ].join('')
    document.body.appendChild(el)

    // Hide page content until unlocked
    document.body.style.overflow = 'hidden'
  }

  var pinEntry = ''

  window.pinTap = function(d) {
    if (pinEntry.length >= 4) return
    pinEntry += d
    updateDots()
    if (pinEntry.length === 4) {
      setTimeout(checkPin, 120)
    }
  }

  window.pinDel = function() {
    pinEntry = pinEntry.slice(0, -1)
    updateDots()
    setError('')
  }

  function updateDots() {
    for (var i = 0; i < 4; i++) {
      var dot = document.getElementById('pd'+i)
      if (dot) {
        dot.classList.toggle('filled', i < pinEntry.length)
        dot.classList.remove('error')
      }
    }
  }

  function checkPin() {
    var correct = (ACES_CONFIG && ACES_CONFIG.pin) ? String(ACES_CONFIG.pin) : '1234'
    if (pinEntry === correct) {
      unlock()
      var screen = document.getElementById('pin-screen')
      if (screen) {
        screen.style.transition = 'opacity .3s'
        screen.style.opacity = '0'
        setTimeout(function(){ screen.remove() }, 300)
      }
      document.body.style.overflow = ''
    } else {
      // Wrong PIN — shake dots red, clear
      for (var i = 0; i < 4; i++) {
        var dot = document.getElementById('pd'+i)
        if (dot) { dot.classList.remove('filled'); dot.classList.add('error') }
      }
      setError('Incorrect PIN')
      setTimeout(function(){
        pinEntry = ''
        updateDots()
      }, 800)
    }
  }

  function setError(msg) {
    var el = document.getElementById('pin-error')
    if (el) el.textContent = msg
  }

  // Check on load
  if (!isUnlocked()) {
    // Wait for DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', buildPinScreen)
    } else {
      buildPinScreen()
    }
  }
})()
