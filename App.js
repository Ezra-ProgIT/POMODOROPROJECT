/* =============================================
   POMO CHRONO — app.js
   Retro pixel pomodoro timer
============================================= */

/* ── CONFIG (defaults, overridden by settings) ── */
const cfg = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  interval: 4, 
  sound: true,
  notif: true,
};

/* ── STATE ── */
const state = {
  mode: 'task', 
  remaining: 25 * 60,
  total: 25 * 60,
  running: false,
  timer: null,
  breakTimer: null,
  pomoDone: 0,
  focusMin: 0,
  breaksMin: 0,
  streak: 0,
  lastDate: '',
  task: '',
};

const CIRC = 691; // 2 * π * 110

/* ── PERSISTENCE ── */
const SK = 'pomochrono2';
function save() {
  localStorage.setItem(SK, JSON.stringify({
    pomoDone: state.pomoDone,
    focusMin: state.focusMin,
    breaksMin: state.breaksMin,
    streak: state.streak,
    lastDate: state.lastDate,
    cfg,
  }));
}

function load() {
  const raw = localStorage.getItem(SK);
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    const td = today();
    if (d.lastDate === td) {
      state.pomoDone = d.pomoDone || 0;
      state.focusMin = d.focusMin || 0;
      state.breaksMin = d.breaksMin || 0;
      state.streak = d.streak || 0;
      state.lastDate = d.lastDate || '';
    } else {
      const yest = new Date(); yest.setDate(yest.getDate()-1);
      state.streak = (d.lastDate === yest.toLocaleDateString('en-CA')) ? (d.streak||0) : 0;
      state.lastDate = '';
    }
    if (d.cfg) Object.assign(cfg, d.cfg);
    syncSettingsUI();
  } catch(e) {}
}
const today = () => new Date().toLocaleDateString('en-CA');

/* ── AUDIO (Web Audio API) ── */
let actx = null;
const getACtx = () => { if (!actx) actx = new (window.AudioContext||window.webkitAudioContext)(); return actx; };
function beep(freq=880, dur=0.15, type='sine', vol=0.3) {
  if (!cfg.sound) return;
  try {
    const c = getACtx(), o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime+dur);
    o.start(); o.stop(c.currentTime+dur);
  } catch(e) {}
}
const sfxStart = () => { beep(440,0.1,'sine',0.2); setTimeout(()=>beep(660,0.15,'sine',0.2),120); };
const sfxTick = () => beep(1400,0.04,'square',0.07);
const sfxDone = () => [523,659,784].forEach((f,i)=>setTimeout(()=>beep(f,0.3,'triangle',0.4),i*180));
const sfxPause = () => beep(330,0.12,'sine',0.15);

/* ── UI HELPERS ── */
const $ = id => document.getElementById(id);
const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

function showPanel(name) {
  ['start','task','timer','break','settings'].forEach(p => {
    const el = $(`panel-${p}`);
    if(el) el.classList.toggle('hidden', p !== name);
  });
}

function setRing(id, rem, total) {
  const offset = CIRC * (rem / total);
  $(id).style.strokeDashoffset = CIRC - offset;
}

function updateStats() {
  $('stat-today').textContent = state.pomoDone;
  $('stat-focus').textContent = state.focusMin;
  $('stat-breaks').textContent = state.breaksMin;
  $('stat-streak').textContent = state.streak;
}

function toast(msg, dur=2500) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(()=>el.classList.remove('show'), dur);
}

function syncSettingsUI() {
  $('set-focus').value = cfg.focusMin;
  $('set-short').value = cfg.shortMin;
  $('set-long').value = cfg.longMin;
  $('set-interval').value = cfg.interval;
  $('set-sound').checked = cfg.sound;
  $('set-notif').checked = cfg.notif;
}

/* ── TIMER CORE ── */
function startCountdown() {
  if (state.running) return;
  state.running = true;
  sfxStart();
  $('btn-pause').textContent = 'PAUSE';
  state.timer = setInterval(() => {
    state.remaining--;
    updateTimerDisplay();
    if (state.remaining <= 5 && state.remaining > 0 && state.mode==='focus') sfxTick();
    if (state.remaining <= 0) { clearInterval(state.timer); state.running=false; onTimerEnd(); }
  }, 1000);
}

function pauseTimer() {
  clearInterval(state.timer);
  state.running = false;
  sfxPause();
  $('btn-pause').textContent = 'RESUME';
}

function togglePause() {
  if (state.running) pauseTimer();
  else startCountdown();
}

function resetTimer() {
  clearInterval(state.timer);
  state.running = false;
  state.remaining = state.total;
  $('btn-pause').textContent = 'PAUSE';
  updateTimerDisplay();
}

function updateTimerDisplay() {
  $('digits').textContent = fmt(state.remaining);
  setRing('ring-fill', state.remaining, state.total);
  document.title = `${state.mode==='focus'?'🍅':'☕'} ${fmt(state.remaining)} — Pomo Chrono`;
}

function onTimerEnd() {
  sfxDone();
  if (state.mode === 'focus') {
    state.pomoDone++;
    state.focusMin += cfg.focusMin;
    state.lastDate = today();
    save(); updateStats();
    beginBreak(false);
  } else {
    endBreak();
  }
}

function beginBreak(skipped) {
  const isLong = (state.pomoDone % cfg.interval === 0) && state.pomoDone > 0;
  const min = isLong ? cfg.longMin : cfg.shortMin;
  if (!skipped) { state.breaksMin += min; save(); updateStats(); }
  state.mode = isLong ? 'long' : 'short';
  state.total = min * 60;
  state.remaining = state.total;
  $('break-mode-label').textContent = isLong ? 'LONG BREAK' : 'SHORT BREAK';
  $('break-digits').textContent = fmt(state.remaining);
  showPanel('break');
  clearInterval(state.breakTimer);
  state.breakTimer = setInterval(() => {
    state.remaining--;
    $('break-digits').textContent = fmt(state.remaining);
    setRing('break-ring-fill', state.remaining, state.total);
    if (state.remaining <= 0) { clearInterval(state.breakTimer); endBreak(); }
  }, 1000);
}

function endBreak() {
  clearInterval(state.breakTimer);
  state.mode = 'focus';
  state.total = cfg.focusMin * 60;
  state.remaining = state.total;
  updateTimerDisplay();
  showPanel('timer');
}

function beginSession() {
  const taskVal = $('task-input').value.trim();
  state.task = taskVal || 'Focus session';
  $('task-name-display').textContent = state.task;
  state.mode = 'focus';
  state.total = cfg.focusMin * 60;
  state.remaining = state.total;
  updateTimerDisplay();
  showPanel('timer');
  startCountdown();
}

/* ── INITIALIZE & EVENTS ── */
document.addEventListener('DOMContentLoaded', () => {
  load();
  updateStats();
  
  // 1. Tombol START Layar Awal
  $('btn-main-start').addEventListener('click', () => {
    showPanel('task');
    sfxTick();
  });

  // 2. Task Screen
  $('btn-set-timer').addEventListener('click', beginSession);
  $('task-input').addEventListener('keydown', e => { if (e.key==='Enter') beginSession(); });

  // 3. Timer Controls
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-reset').addEventListener('click', resetTimer);
  $('btn-skip').addEventListener('click', () => {
      clearInterval(state.timer);
      if(state.mode === 'focus') beginBreak(true); else endBreak();
  });

  // 4. Dark Mode
  const themeBtn = $('btn-nav-theme');
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    if(themeBtn) themeBtn.textContent = '☼';
  }
  themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'red');
    themeBtn.textContent = isDark ? '☼' : '☾';
    toast(isDark ? 'Deep Dark Mode ON ☾' : 'Classic Red Mode ON 🍅');
    sfxTick();
  });

  // 5. Music
  const musicBtn = $('btn-nav-music');
  const bgMusic = new Audio('classical.mp3');
  bgMusic.loop = true;
  let isPlaying = false;

  musicBtn.addEventListener('click', () => {
    if (!isPlaying) {
      bgMusic.play().then(() => {
        musicBtn.classList.add('active');
        musicBtn.innerHTML = '⏸';
        toast('Classical Music ON ♫');
        isPlaying = true;
      }).catch(() => toast('Music file not found!'));
    } else {
      bgMusic.pause();
      musicBtn.classList.remove('active');
      musicBtn.innerHTML = '♪';
      toast('Music Paused');
      isPlaying = false;
    }
  });

  // 6. Settings
  $('btn-nav-settings').addEventListener('click', () => showPanel('settings'));
  $('btn-close-settings').addEventListener('click', () => showPanel('task'));
  $('btn-save-settings').addEventListener('click', () => {
      cfg.focusMin = parseInt($('set-focus').value);
      save(); toast('Saved!'); showPanel('task');
  });

  // Init display
  $('digits').textContent = fmt(cfg.focusMin * 60);
  setRing('ring-fill', 1, 1);
});