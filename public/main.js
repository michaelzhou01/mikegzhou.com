(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const root = document.documentElement;

  /* ---------- shared: token counter ---------- */
  // local count for this visit, plus a global count shared by every visitor (a Durable Object behind /api/tokens).
  // If the API isn't there (plain static hosting), the footer just shows the local count.
  let tokens = 0, global = null, unsent = 0;
  const tokEl = document.getElementById('tok'), capEl = document.getElementById('tok-cap');
  const render = () => {
    tokEl.textContent = (global === null ? tokens : global + unsent).toLocaleString();
    if (global !== null) capEl.innerHTML = `tokens generated on this page, by everyone, ever.<br>you: ${tokens.toLocaleString()}`;
  };
  const bump = (n = 1) => { tokens += n; unsent += n; render(); window.MZ.onBump?.(n); };
  const flush = async () => {
    if (!unsent) return;
    const n = unsent; unsent = 0;
    try {
      const r = await fetch('/api/tokens', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ n }) });
      if (!r.ok) throw 0;
      global = (await r.json()).total; render();
    } catch { unsent += n; }
  };
  fetch('/api/tokens').then(r => (r.ok ? r.json() : null)).then(d => { if (d) { global = d.total; render(); setInterval(flush, 4000); } }).catch(() => {});
  addEventListener('pagehide', () => { if (global !== null && unsent) navigator.sendBeacon('/api/tokens', new Blob([JSON.stringify({ n: unsent })], { type: 'application/json' })); });
  window.MZ = { bump, reduce };
  document.getElementById('y').textContent = new Date().getFullYear();

  /* ---------- nyc clock ---------- */
  const clock = document.getElementById('clock');
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const tickClock = () => { clock.textContent = 'nyc ' + fmt.format(new Date()); };
  tickClock(); setInterval(tickClock, 1000);

  /* ---------- custom cursor ---------- */
  if (fine && !reduce) {
    root.classList.add('has-cursor');
    const dot = document.querySelector('.cursor-dot'), ring = document.querySelector('.cursor-ring');
    let mx = -100, my = -100, rx = -100, ry = -100;
    addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; dot.style.transform = `translate(${mx}px,${my}px)`; });
    document.addEventListener('pointerover', e => ring.classList.toggle('big', !!e.target.closest('a, button')));
    (function follow() {
      rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
      ring.style.transform = `translate(${rx}px,${ry}px)`;
      requestAnimationFrame(follow);
    })();
  }

  /* ---------- tagline streamed token by token ---------- */
  function streamTagline(delay) {
    const el = document.getElementById('stream');
    const metrics = document.getElementById('metrics');
    const text = el.dataset.text;
    el.setAttribute('aria-label', text);
    el.innerHTML = '<span class="out" aria-hidden="true"></span><span class="caret"></span>';
    const out = el.firstChild;
    if (reduce) { out.textContent = text; return; }
    const toks = text.match(/\s*\S+/g);
    let i = 0, start = 0, first = 0;
    const next = () => {
      out.textContent += toks[i++]; bump();
      const now = performance.now();
      if (i === 1) first = now;
      const tps = i > 1 ? (i - 1) / ((now - first) / 1000) : 0;
      metrics.innerHTML = `ttft <b>${(first - start).toFixed(0)}ms</b> · ${tps ? tps.toFixed(0) : '—'} tok/s · ${i}/${toks.length}`;
      if (i < toks.length) setTimeout(next, 40 + Math.random() * 100);
    };
    setTimeout(() => { start = performance.now(); setTimeout(next, 140 + Math.random() * 160); }, delay);
  }


  /* ---------- hero: a latent space of real word embeddings ---------- */
  const hero = document.querySelector('.hero');
  const cv = document.getElementById('gl');
  const lc = document.getElementById('gl-labels'), lx = lc.getContext('2d');
  const hotEl = document.getElementById('hot-cat');
  const gl = cv.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: true });
  streamTagline(reduce ? 0 : 900);

  // scroll transition: the cloud recedes and fades as you leave the hero
  const heroCopy = hero.querySelector('.hero-copy');
  const onHeroScroll = () => {
    const k = Math.min(1, Math.max(0, scrollY / hero.clientHeight));
    cv.style.opacity = lc.style.opacity = String(1 - k * 0.85);
    cv.style.transform = lc.style.transform = `translateY(${k * 18}vh) scale(${1 - k * 0.18})`;
    heroCopy.style.transform = `translateY(${-k * 8}vh)`;
    heroCopy.style.opacity = String(1 - k * 1.4);
  };
  if (!reduce) { addEventListener('scroll', onHeroScroll, { passive: true }); onHeroScroll(); }
  if (!gl) return;

  const VS = `
    attribute vec3 aP; attribute vec3 aS; attribute vec4 aM; attribute float aW; // aM: delay, size, phase, kind + 4*cat
    uniform float uTime; uniform vec2 uMouse; uniform float uForce; uniform vec3 uPulse;
    uniform float uDpr; uniform vec2 uRot; uniform vec3 uView; uniform vec2 uRes; uniform float uHot;
    uniform float uWord; uniform vec3 uNb; uniform float uZoom;
    varying float vA; varying vec3 vCol;
    float ease(float x) { return x >= 1.0 ? 1.0 : 1.0 - pow(2.0, -9.0 * x); }
    void main() {
      float kind = mod(aM.w, 4.0), cid = floor(aM.w / 4.0), ph = aM.z;
      float k = clamp((uTime - aM.x) / 2.2, 0.0, 1.0);
      vec3 p = mix(aS, aP, ease(k));
      p += vec3(sin(uTime * 0.7 + ph * 6.28), cos(uTime * 0.5 + ph * 9.0), sin(uTime * 0.6 + ph * 4.0)) * 0.005;
      float a = uRot.x, b = uRot.y;
      p = vec3(p.x * cos(a) + p.z * sin(a), p.y, -p.x * sin(a) + p.z * cos(a));
      p = vec3(p.x, p.y * cos(b) - p.z * sin(b), p.y * sin(b) + p.z * cos(b));
      float persp = 2.8 / (2.8 + p.z);
      vec2 s = uView.xy + vec2(p.x, -p.y) * uView.z * persp;
      vec2 d = s - uMouse; float r = length(d) + 0.001; vec2 n = d / r;
      float f = exp(-r * r / 9000.0) * uForce;
      s += n * f * 26.0;
      float age = uTime - uPulse.z;
      vec2 dp = s - uPulse.xy; float rp = length(dp) + 0.001;
      float band = exp(-pow(rp - age * 700.0, 2.0) / 1800.0) * exp(-age * 1.4) * step(0.0, age);
      s += dp / rp * band * 26.0;
      bool word = kind < 0.5 || kind > 1.5;
      float hot = (word && abs(cid - uHot) < 0.5) ? 0.55 : 0.0;
      float sel = abs(aW - uWord) < 0.5 ? 1.0 : 0.0;
      float nb = (abs(aW - uNb.x) < 0.5 || abs(aW - uNb.y) < 0.5 || abs(aW - uNb.z) < 0.5) ? 0.8 : 0.0;
      float near = clamp(1.0 - (p.z + 1.1) / 2.2, 0.0, 1.0);
      vec3 base = kind > 2.5 ? vec3(0.42, 0.89, 1.0) : kind > 1.5 ? vec3(0.83, 1.0, 0.23) : vec3(0.925, 0.92, 0.9);
      float glow = clamp(max(max(hot, sel), nb) + band * 1.5, 0.0, 1.0);
      vCol = mix(base, vec3(0.83, 1.0, 0.23), glow);
      float alpha = word ? 0.85 : 0.2;
      vA = alpha * mix(0.25, 1.0, near) * smoothstep(0.0, 0.2, k) * (1.0 + glow * 0.7);
      vec2 c = s / uRes * 2.0 - 1.0;
      gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
      gl_PointSize = aM.y * uDpr * persp * sqrt(uZoom) * (1.0 + glow * 0.8 + sel * 0.6);
    }`;
  const FS = `
    precision mediump float;
    varying float vA; varying vec3 vCol;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.05, d) * min(vA, 1.0);
      gl_FragColor = vec4(vCol * a, a);
    }`;
  const compile = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  try {
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) { console.warn(err); return; }
  root.classList.add('gl');
  gl.useProgram(prog);
  const U = {};
  ['uTime', 'uMouse', 'uForce', 'uPulse', 'uDpr', 'uRot', 'uView', 'uRes', 'uHot', 'uWord', 'uNb', 'uZoom'].forEach(n => U[n] = gl.getUniformLocation(prog, n));
  const A = ['aP', 'aS', 'aM', 'aW'].reduce((o, n) => (o[n] = gl.getAttribLocation(prog, n), o), {});
  const buf = gl.createBuffer();
  gl.clearColor(0.039, 0.039, 0.043, 1);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let DATA = null, count = 0;
  const KIND = { inference: 2, code: 3 };
  function buildCloud(data) {
    const small = innerWidth < 720;
    const gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283 * Math.random()); };
    const onSphere = () => { const z = Math.random() * 2 - 1, t = Math.random() * 6.283, r = Math.sqrt(1 - z * z); return [r * Math.cos(t), r * Math.sin(t), z]; };
    const W = data.words, per = small ? 36 : 72, shell = small ? 2500 : 4500, perLink = small ? 12 : 22;
    count = W.length * per + shell + W.length * perLink;
    const a = new Float32Array(count * 11);
    let k = 0;
    const push = (x, y, z, size, kind, cid, wi) => {
      const spread = 2.5 + Math.random() * 3;
      a[k++] = x; a[k++] = y; a[k++] = z;
      a[k++] = x * spread + gauss() * 0.4; a[k++] = y * spread + gauss() * 0.4; a[k++] = z * spread;
      a[k++] = Math.random() * 1.1; a[k++] = size; a[k++] = Math.random(); a[k++] = kind + 4 * cid; a[k++] = wi;
    };
    W.forEach(([, ci, x, y, z], wi) => {
      const kind = KIND[data.cats[ci]] || 0;
      for (let j = 0; j < per; j++) push(x + gauss() * 0.02, y + gauss() * 0.02, z + gauss() * 0.02, 1.3 + Math.random() * 1.5, kind, ci, wi);
    });
    for (let j = 0; j < shell; j++) { const s = onSphere(), r = 1.08 + gauss() * 0.01; push(s[0] * r, s[1] * r, s[2] * r, 1 + Math.random(), 1, 99, -1); }
    // faint threads from each word to its nearest neighbour in the original embedding space
    W.forEach(([, , x, y, z, nn]) => {
      const [, , x2, y2, z2] = W[nn[0]];
      for (let j = 0; j < perLink; j++) { const t = Math.random(); push(x + (x2 - x) * t, y + (y2 - y) * t, z + (z2 - z) * t, 0.9, 1, 99, -1); }
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
    const S = 44;
    gl.enableVertexAttribArray(A.aP); gl.vertexAttribPointer(A.aP, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(A.aS); gl.vertexAttribPointer(A.aS, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(A.aM); gl.vertexAttribPointer(A.aM, 4, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(A.aW); gl.vertexAttribPointer(A.aW, 1, gl.FLOAT, false, S, 40);
    bump(count >> 8);
  }

  let W = 0, H = 0, base = [0, 0, 1], view = [0, 0, 1];
  // zoom state: z scales the cloud, (ox, oy) shifts its centre; eased toward the *T targets every frame
  let z = 1, ox = 0, oy = 0, zT = 1, oxT = 0, oyT = 0;
  const ZMIN = 0.6, ZMAX = 7;
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = hero.clientWidth; H = hero.clientHeight;
    if (!W || !H) return;
    cv.width = lc.width = W * dpr; cv.height = lc.height = H * dpr;
    lx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(U.uRes, W, H); gl.uniform1f(U.uDpr, dpr);
    base = W < 860 ? [W / 2, H * 0.38, Math.min(W * 0.4, H * 0.28)] : [W * 0.6, H * 0.48, Math.min(W * 0.26, H * 0.36)];
  }

  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;
  const mouse = { x: -9999, y: -9999 };
  let force = 0, speed = 0, pulse = [-9999, -9999, -99];
  let rotX = 0.6, rotY = 0.32, vx = 0, vy = 0, drag = null, moved = 0;
  const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  // zoom by factor k while keeping the screen point (px, py) fixed under the fingers/cursor
  const zoomAt = (k, px, py) => {
    const nz = Math.max(ZMIN, Math.min(ZMAX, zT * k)); k = nz / zT;
    const cx = base[0] + oxT, cy = base[1] + oyT;
    oxT = px - (px - cx) * k - base[0]; oyT = py - (py - cy) * k - base[1];
    zT = nz;
    if (zT <= 1.001) { oxT *= 0.5; oyT *= 0.5; } // drift back to centre when zoomed out
    oxT = Math.max(-W, Math.min(W, oxT)); oyT = Math.max(-H, Math.min(H, oyT));
  };
  const resetZoom = () => { zT = 1; oxT = oyT = 0; };
  window.MZ.resetZoom = resetZoom;

  // Mac trackpad pinch arrives as wheel events with ctrlKey set (Chrome, Firefox, Edge)
  cv.addEventListener('wheel', e => {
    if (!e.ctrlKey) return; // plain two-finger scroll still scrolls the page
    e.preventDefault();
    const [x, y] = local(e);
    zoomAt(Math.exp(-e.deltaY * 0.012), x, y);
  }, { passive: false });
  // Safari reports trackpad pinch as gesture events instead
  let gScale = 1;
  cv.addEventListener('gesturestart', e => { e.preventDefault(); gScale = 1; });
  cv.addEventListener('gesturechange', e => { e.preventDefault(); const [x, y] = local(e); zoomAt(e.scale / gScale, x, y); gScale = e.scale; });
  cv.addEventListener('gestureend', e => e.preventDefault());
  cv.addEventListener('dblclick', resetZoom);

  // touch: two fingers pinch (and pan), one finger rotates
  const touches = new Map();
  let pinch = null, lastTap = 0;
  const pinchState = () => {
    const [a, b] = [...touches.values()];
    return { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
  };
  cv.addEventListener('pointerdown', e => {
    const p = local(e);
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, p);
      if (touches.size === 2) { pinch = pinchState(); drag = null; return; }
      const t = performance.now();
      if (t - lastTap < 300) resetZoom();
      lastTap = t;
    }
    drag = p; moved = 0; cv.setPointerCapture(e.pointerId);
  });
  const endTouch = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; };
  cv.addEventListener('pointercancel', endTouch);
  cv.addEventListener('pointermove', e => {
    const [x, y] = local(e);
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, [x, y]);
      if (pinch && touches.size === 2) {
        const nowP = pinchState();
        zoomAt(nowP.d / pinch.d, nowP.mx, nowP.my);
        oxT += nowP.mx - pinch.mx; oyT += nowP.my - pinch.my; // two-finger pan
        pinch = nowP; moved = 99;
        return;
      }
    }
    if (mouse.x > -9000) speed = Math.min(80, Math.hypot(x - mouse.x, y - mouse.y));
    if (drag) {
      const dx = x - drag[0], dy = y - drag[1];
      vx = dx * 0.006; vy = dy * 0.006; moved += Math.abs(dx) + Math.abs(dy);
      drag = [x, y];
    }
    mouse.x = x; mouse.y = y;
  });
  const firePulse = (x, y) => { pulse = [x, y, now()]; bump(64 + ((Math.random() * 400) | 0)); window.MZ.onPulse?.(); };
  cv.addEventListener('pointerup', e => {
    if (drag && moved < 6 && !pinch) { const [x, y] = local(e); firePulse(x, y); }
    endTouch(e);
    drag = null;
  });
  cv.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });
  window.MZ.pulse = () => firePulse(view[0], view[1]);

  // project a unit-space point exactly as the vertex shader does
  const project = (x, y, z) => {
    const a = rotX, b = rotY;
    const x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a);
    const y2 = y * Math.cos(b) - z1 * Math.sin(b), z2 = y * Math.sin(b) + z1 * Math.cos(b);
    const s = 2.8 / (2.8 + z2);
    return [view[0] + x1 * view[2] * s, view[1] - y2 * view[2] * s, z2];
  };
  const label = (text, x, y, color, size = 12, bg = true) => {
    lx.font = `${size}px "JetBrains Mono", monospace`;
    const w = lx.measureText(text).width;
    if (bg) { lx.fillStyle = 'rgba(10,10,11,.75)'; lx.fillRect(x + 8, y - size, w + 10, size + 8); }
    lx.fillStyle = color; lx.fillText(text, x + 13, y);
  };

  let visible = true, raf = 0, last = now(), hot = 0, hotAt = -9, hoverIdx = -1;
  function frame() {
    const t = reduce ? 30 : now(), dt = Math.min(0.05, t - last); last = t;
    if (!drag) { vx *= 0.95; vy *= 0.95; }
    rotX += -vx + (reduce || hoverIdx >= 0 ? 0 : dt * 0.1);
    rotY = Math.max(-1.2, Math.min(1.2, rotY - vy));
    if (drag) { vx *= 0.5; vy *= 0.5; }
    if (DATA && t - hotAt > 3) { hot = (hot + 1 + ((Math.random() * 3) | 0)) % DATA.cats.length; hotAt = t; hotEl.textContent = `cluster: ${DATA.cats[hot]}`; bump(3); }
    z += (zT - z) * 0.2; ox += (oxT - ox) * 0.2; oy += (oyT - oy) * 0.2;
    view = [base[0] + ox, base[1] + oy, base[2] * z];
    const target = mouse.x > -9000 && !drag ? 0.35 + Math.min(0.4, speed * 0.015) : 0;
    force += (target - force) * 0.08; speed *= 0.9;

    // labels: the hovered word and its nearest neighbours, plus a few words from the highlighted cluster
    lx.clearRect(0, 0, W, H);
    hoverIdx = -1;
    let nb = [-5, -5, -5]; // -5 = none (shell/link points use -1)
    if (DATA && t > 2) {
      const P = DATA.words.map(([, , x, y, z]) => project(x, y, z));
      if (mouse.x > -9000 && !drag) {
        let best = 22 * 22;
        P.forEach(([px, py], i) => { const d = (px - mouse.x) ** 2 + (py - mouse.y) ** 2; if (d < best) { best = d; hoverIdx = i; } });
      }
      lx.textBaseline = 'alphabetic';
      if (hoverIdx >= 0) {
        const w = DATA.words[hoverIdx];
        nb = w[5].slice(0, 3);
        const [hx, hy] = P[hoverIdx];
        lx.strokeStyle = 'rgba(212,255,58,.55)'; lx.lineWidth = 1;
        nb.forEach(j => { const [nx, ny] = P[j]; lx.beginPath(); lx.moveTo(hx, hy); lx.lineTo(nx, ny); lx.stroke(); label(DATA.words[j][0], nx, ny, '#c9c8c2', 13); });
        label(w[0], hx, hy, '#d4ff3a', 17);
        label(DATA.cats[w[1]], hx, hy + 19, '#8b8a84', 11, false);
      } else if (z > 1.6) {
        // zoomed in: label the words facing you, skipping any that would overlap
        const placed = [], fade = Math.min(1, (z - 1.6) / 0.8);
        DATA.words.map((w, i) => [i, w]).filter(([i]) => { const [px, py, pz] = P[i]; return pz < 0.4 && px > 0 && px < W && py > 0 && py < H; })
          .sort((a, b) => P[a[0]][2] - P[b[0]][2]).slice(0, 80)
          .forEach(([i, w]) => {
            const [px, py] = P[i];
            if (placed.some(([qx, qy]) => Math.abs(qx - px) < 70 && Math.abs(qy - py) < 16)) return;
            placed.push([px, py]);
            label(w[0], px, py, w[1] === hot ? `rgba(212,255,58,${fade})` : `rgba(201,200,194,${0.85 * fade})`, 12, false);
          });
      } else {
        DATA.words.map((w, i) => [i, w]).filter(([, w]) => w[1] === hot).sort((a, b) => P[a[0]][2] - P[b[0]][2]).slice(0, 5)
          .forEach(([i, w]) => label(w[0], P[i][0], P[i][1], 'rgba(212,255,58,.9)', 12, false));
      }
    }
    cv.style.cursor = hoverIdx >= 0 ? 'pointer' : '';

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(U.uTime, t);
    gl.uniform2f(U.uMouse, mouse.x, mouse.y);
    gl.uniform1f(U.uForce, hoverIdx >= 0 ? 0 : force);
    gl.uniform3f(U.uPulse, pulse[0], pulse[1], reduce ? -99 : pulse[2]);
    gl.uniform2f(U.uRot, rotX, rotY);
    gl.uniform3f(U.uView, ...view);
    gl.uniform1f(U.uZoom, z);
    gl.uniform1f(U.uHot, reduce ? -1 : hot);
    gl.uniform1f(U.uWord, hoverIdx >= 0 ? hoverIdx : -5);
    gl.uniform3f(U.uNb, ...nb);
    if (count) gl.drawArrays(gl.POINTS, 0, count);
    raf = visible && !reduce ? requestAnimationFrame(frame) : 0;
  }
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) { size(); raf = requestAnimationFrame(frame); }
  }).observe(hero);
  addEventListener('resize', () => { size(); if (!raf) frame(); });
  size(); frame();
  // UMAP leaves a dense core and a few far outliers; remap radius so the cloud fills the ball evenly
  const spread = d => {
    const r = d.words.map(([, , x, y, z]) => Math.hypot(x, y, z) || 1e-6);
    const med = [...r].sort((a, b) => a - b)[r.length >> 1];
    d.words.forEach((w, i) => { const k = (0.95 * Math.tanh(r[i] / (med * 1.25))) / r[i]; w[2] *= k; w[3] *= k; w[4] *= k; });
    return d;
  };
  fetch('/latent.json').then(r => r.json()).then(d => { DATA = spread(d); buildCloud(d); if (!raf) frame(); }).catch(err => console.warn('latent.json', err));
})();
