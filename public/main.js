(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ACCENT = '#d4ff3a', ACCENT2 = '#6ae3ff';
  let tokens = 0;
  const tokEl = document.getElementById('tok');
  const bump = (n = 1) => { tokens += n; tokEl.textContent = tokens.toLocaleString(); };
  document.getElementById('y').textContent = new Date().getFullYear();

  /* ---------- name: scramble then resolve, letter by letter ---------- */
  const nameEl = document.getElementById('name');
  const target = nameEl.textContent;
  const GLYPHS = '01<>/{}[]#%&*+=-~?abcdefxyz';
  nameEl.innerHTML = '';
  const spans = [...target].map(c => {
    const s = document.createElement('span');
    s.className = 'ch';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = c === ' ' ? ' ' : c;
    nameEl.appendChild(s);
    return s;
  });
  if (!reduce) {
    const t0 = performance.now();
    const tick = now => {
      let done = true;
      spans.forEach((s, i) => {
        const c = target[i];
        if (c === ' ') return;
        const settle = 250 + i * 90;
        if (now - t0 < settle) {
          done = false;
          s.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0];
          s.classList.add('hot');
        } else if (s.classList.contains('hot')) {
          s.textContent = c; s.classList.remove('hot'); bump();
        }
      });
      if (!done) requestAnimationFrame(tick);
      else streamTagline();
    };
    requestAnimationFrame(tick);
  } else { setTimeout(streamTagline, 0); }

  /* ---------- tagline: streamed token by token, with real timings ---------- */
  function streamTagline() {
    const el = document.getElementById('stream');
    const metrics = document.getElementById('metrics');
    const text = el.getAttribute('aria-label');
    const toks = text.match(/\s*\S+/g);
    el.innerHTML = '<span class="out" aria-hidden="true"></span><span class="caret"></span>';
    const out = el.firstChild;
    if (reduce) { out.textContent = text; return; }
    const start = performance.now();
    const ttft = 120 + Math.random() * 180;
    let i = 0, first = 0;
    const next = () => {
      out.textContent += toks[i++]; bump();
      const now = performance.now();
      if (i === 1) first = now;
      const tps = i > 1 ? (i - 1) / ((now - first) / 1000) : 0;
      metrics.innerHTML = `ttft <b>${(first - start).toFixed(0)}ms</b> · ${tps ? tps.toFixed(0) : '—'} tok/s · ${i}/${toks.length}`;
      if (i < toks.length) setTimeout(next, 45 + Math.random() * 110);
    };
    setTimeout(next, ttft);
  }

  /* ---------- hero: glyph field with attention ---------- */
  const cv = document.getElementById('field');
  const ctx = cv.getContext('2d');
  const coords = document.getElementById('coords');
  const RAMP = ' .·:-=+*#%@';
  let W, H, cols, rows, CELL, dpr, keys;
  const ripples = [];
  const mouse = { x: 0, y: 0, active: false, last: 0 };

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CELL = W < 600 ? 16 : 20;
    cols = Math.ceil(W / CELL); rows = Math.ceil(H / CELL);
    keys = new Float32Array(cols * rows).map(() => Math.random());
    ctx.font = `${CELL * 0.62}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (reduce) frame(0);
  }

  const setMouse = (x, y) => { mouse.x = x; mouse.y = y; mouse.active = true; mouse.last = performance.now(); };
  cv.addEventListener('pointermove', e => setMouse(e.offsetX, e.offsetY));
  cv.addEventListener('pointerleave', () => { mouse.active = false; });
  cv.addEventListener('pointerdown', e => {
    setMouse(e.offsetX, e.offsetY);
    ripples.push({ x: e.offsetX, y: e.offsetY, t: performance.now() });
    if (ripples.length > 6) ripples.shift();
    bump(Math.round(40 + Math.random() * 200));
  });

  function frame(now) {
    const t = now / 1000;
    // query position: the pointer, or a slow Lissajous drift when idle
    let qx, qy;
    if (mouse.active && now - mouse.last < 4000) { qx = mouse.x; qy = mouse.y; }
    else { qx = W * (0.62 + 0.25 * Math.sin(t * 0.23)); qy = H * (0.4 + 0.22 * Math.sin(t * 0.31 + 1.3)); }
    coords.textContent = `q = (${(qx / CELL) | 0}, ${(qy / CELL) | 0})`;

    ctx.fillStyle = '#0a0a0b';
    ctx.fillRect(0, 0, W, H);

    const sigma2 = (Math.min(W, H) * 0.22) ** 2;
    const top = []; // [score, x, y]
    for (let r = 0; r < rows; r++) {
      const y = r * CELL + CELL / 2;
      for (let c = 0; c < cols; c++) {
        const x = c * CELL + CELL / 2;
        const k = keys[r * cols + c];
        // ambient: interfering waves
        let v = 0.18 + 0.14 * (Math.sin(c * 0.21 + t * 0.9) + Math.sin(r * 0.27 - t * 0.7) + Math.sin((c + r) * 0.13 + t * 0.5)) / 3;
        const dx = x - qx, dy = y - qy, d2 = dx * dx + dy * dy;
        const att = Math.exp(-d2 / sigma2);
        v += att * 0.65 * (0.4 + k);
        for (const rp of ripples) {
          const age = (now - rp.t) / 1000;
          const d = Math.hypot(x - rp.x, y - rp.y);
          const front = age * 520;
          const band = Math.exp(-((d - front) ** 2) / 1800);
          v += band * Math.exp(-age * 1.1) * 1.1;
        }
        v = Math.min(1, Math.max(0, v));
        // keys are scored over a much wider window so arcs reach out across the field
        const score = Math.exp(-d2 / (sigma2 * 5)) * k ** 8 * (d2 > 3600 ? 1 : 0);
        if (score > 0.3) top.push([score, x, y]);
        const ch = RAMP[Math.min(RAMP.length - 1, (v * RAMP.length) | 0)];
        if (ch === ' ') continue;
        ctx.fillStyle = v > 0.78 ? ACCENT : `rgba(236,235,230,${(0.08 + v * 0.62).toFixed(3)})`;
        ctx.fillText(ch, x, y);
      }
    }

    // attention arcs to top-k keys
    top.sort((a, b) => b[0] - a[0]);
    const k = top.slice(0, 7);
    const sum = k.reduce((s, a) => s + Math.exp(a[0] * 6), 0);
    ctx.save();
    ctx.font = `10px "JetBrains Mono", monospace`;
    k.forEach(([s, x, y], i) => {
      const w = Math.exp(s * 6) / sum;
      const mx = (qx + x) / 2, my = Math.min(qy, y) - 40 - 60 * w;
      ctx.strokeStyle = i === 0 ? ACCENT : `rgba(106,227,255,${(0.25 + w).toFixed(2)})`;
      ctx.lineWidth = 0.6 + w * 2.2;
      ctx.beginPath(); ctx.moveTo(qx, qy); ctx.quadraticCurveTo(mx, my, x, y); ctx.stroke();
      ctx.fillStyle = i === 0 ? ACCENT : ACCENT2;
      ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.fillText(w.toFixed(2), x + 16, y - 10);
    });
    // the query itself
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(qx, qy, 9 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(qx - 16, qy); ctx.lineTo(qx + 16, qy); ctx.moveTo(qx, qy - 16); ctx.lineTo(qx, qy + 16); ctx.stroke();
    ctx.restore();

    while (ripples.length && now - ripples[0].t > 4000) ripples.shift();
    if (!reduce) requestAnimationFrame(frame);
  }

  addEventListener('resize', resize);
  resize();
  if (!reduce) requestAnimationFrame(frame);

  /* ---------- continuous batching strip ---------- */
  const bc = document.getElementById('batch');
  const bx = bc.getContext('2d');
  const utilEl = document.getElementById('util');
  const SLOTS = 8, CW = 6;
  const HUES = [72, 190, 330, 28, 260, 150, 50, 210, 0, 290];
  let BW, BH, history = [], slots = new Array(SLOTS).fill(null), queue = [], rid = 0, busy = 0, steps = 0, live = false;

  function bresize() {
    const d = Math.min(devicePixelRatio || 1, 2);
    BW = bc.clientWidth; BH = bc.clientHeight;
    bc.width = BW * d; bc.height = BH * d;
    bx.setTransform(d, 0, 0, d, 0, 0);
  }
  function step() {
    // arrivals: bursty
    if (Math.random() < 0.18) {
      const n = Math.random() < 0.15 ? 3 : 1;
      for (let i = 0; i < n; i++) queue.push({ id: rid++, left: 6 + ((Math.random() ** 2) * 70) | 0, fresh: true });
    }
    const col = [];
    let used = 0;
    for (let s = 0; s < SLOTS; s++) {
      if (!slots[s] && queue.length) slots[s] = queue.shift();
      const r = slots[s];
      if (r) {
        used++;
        col.push({ hue: HUES[r.id % HUES.length], pre: r.fresh });
        r.fresh = false;
        if (--r.left <= 0) slots[s] = null;
      } else col.push(null);
    }
    busy += used; steps++;
    if (steps % 10 === 0) { utilEl.textContent = `util ${((busy / (steps * SLOTS)) * 100).toFixed(0)}% · queue ${queue.length}`; }
    if (live) bump(used);
    history.push(col);
    const maxCols = Math.ceil(BW / CW) + 1;
    if (history.length > maxCols) history.splice(0, history.length - maxCols);
  }
  function bdraw() {
    bx.fillStyle = '#0d0d0f'; bx.fillRect(0, 0, BW, BH);
    const pad = 14, rowH = (BH - pad * 2) / SLOTS;
    bx.font = '10px "JetBrains Mono", monospace'; bx.textBaseline = 'middle';
    for (let s = 0; s < SLOTS; s++) {
      bx.fillStyle = '#55545a';
      bx.fillText(`gpu.slot${s}`, 8, pad + s * rowH + rowH / 2);
    }
    const x0 = 78, avail = BW - x0 - 8, n = Math.floor(avail / CW);
    const view = history.slice(-n);
    view.forEach((col, i) => {
      const x = x0 + (n - view.length + i) * CW;
      col.forEach((c, s) => {
        if (!c) return;
        bx.fillStyle = c.pre ? '#ffffff' : `hsla(${c.hue}, 90%, 62%, .85)`;
        bx.fillRect(x, pad + s * rowH + 2, CW - 1, rowH - 4);
      });
    });
  }
  bresize();
  addEventListener('resize', () => { bresize(); bdraw(); });
  for (let i = 0; i < 200; i++) step();
  live = true; busy = 0; steps = 0;
  bdraw();
  if (!reduce) {
    let lastStep = 0;
    const loop = now => {
      if (now - lastStep > 70) { step(); bdraw(); lastStep = now; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
})();
