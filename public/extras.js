// Small extras: synthesized sound (off by default) and a "/" command palette.
(() => {
  const MZ = window.MZ;

  /* ---------- sound ---------- */
  const btn = document.getElementById('sound');
  let ac = null, on = false, lastTick = 0;
  const store = { get: () => { try { return localStorage.getItem('mz-sound') === '1'; } catch { return false; } }, set: v => { try { localStorage.setItem('mz-sound', v ? '1' : '0'); } catch {} } };
  const blip = (freq, dur, gain, type = 'sine') => {
    if (!on || !ac) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  };
  const setSound = v => {
    on = v; store.set(v);
    btn.textContent = v ? 'sound on' : 'sound off';
    btn.setAttribute('aria-pressed', String(v));
    if (v) { ac ||= new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); blip(880, 0.08, 0.05); }
  };
  btn.addEventListener('click', () => setSound(!on));
  // browsers need a click before audio can start, so a saved "on" waits for the first interaction
  if (store.get()) addEventListener('pointerdown', () => setSound(true), { once: true });
  MZ.onBump = n => {
    const now = performance.now();
    if (now - lastTick < 45) return; // at most ~22 ticks a second
    lastTick = now;
    blip(1800 + Math.random() * 1600, 0.03, Math.min(0.035, 0.012 + n * 0.0004), 'triangle');
  };
  MZ.onPulse = () => { blip(110, 0.5, 0.12); blip(220, 0.25, 0.05, 'triangle'); };

  /* ---------- command palette ---------- */
  const pal = document.getElementById('palette'), pin = document.getElementById('palette-input'), list = document.getElementById('palette-list');
  const go = id => () => document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
  const COMMANDS = [
    ['go to top', go('top')],
    ['go to about', go('about')],
    ['go to anatomy of a request', go('anatomy')],
    ['go to speculative decoding', go('spec')],
    ['go to quantization', go('quant')],
    ['pulse the latent space', () => { document.getElementById('top').scrollIntoView({ behavior: 'smooth' }); setTimeout(() => MZ.pulse?.(), 500); }],
    [() => (on ? 'turn sound off' : 'turn sound on'), () => setSound(!on)],
    ['open github ↗', () => window.open('https://github.com/michaelzhou01', '_blank', 'noopener')],
  ];
  let items = [], sel = 0;
  const label = c => (typeof c[0] === 'function' ? c[0]() : c[0]);
  const draw = () => {
    const q = pin.value.toLowerCase().trim();
    items = COMMANDS.filter(c => !q || q.split(/\s+/).every(w => label(c).includes(w)));
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.innerHTML = items.length
      ? items.map((c, i) => `<li role="option" aria-selected="${i === sel}" data-i="${i}">${label(c)}</li>`).join('')
      : '<li class="empty">no matches</li>';
  };
  const open = () => { pal.hidden = false; pin.value = ''; sel = 0; draw(); pin.focus(); };
  const close = () => { pal.hidden = true; };
  const run = i => { const c = items[i]; if (!c) return; close(); c[1](); };
  document.getElementById('palette-btn').addEventListener('click', open);
  addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName) && document.activeElement !== pin;
    if (!typing && pal.hidden && (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k'))) { e.preventDefault(); open(); return; }
    if (pal.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, items.length); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % Math.max(1, items.length); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
  });
  pin.addEventListener('input', () => { sel = 0; draw(); });
  list.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) run(+li.dataset.i); });
  pal.addEventListener('click', e => { if (e.target === pal) close(); });
})();
