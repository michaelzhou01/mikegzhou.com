(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const root = document.documentElement;

  /* ---------- shared: token counter ---------- */
  let tokens = 0;
  const tokEl = document.getElementById('tok');
  const bump = (n = 1) => { tokens += n; tokEl.textContent = tokens.toLocaleString(); };
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

  /* ---------- about: words light up as you read ---------- */
  const lede = document.getElementById('lede');
  const words = (() => {
    const walk = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(part); return; }
          const s = document.createElement('span'); s.className = 'w'; s.textContent = part; frag.append(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
    walk(lede);
    return [...lede.querySelectorAll('.w')];
  })();
  let lit = -1;
  const onScroll = () => {
    const r = lede.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (innerHeight * 0.88 - r.top) / (r.height + innerHeight * 0.3)));
    const n = reduce ? words.length : Math.round(p * words.length);
    if (n !== lit) { words.forEach((w, i) => w.classList.toggle('on', i < n)); if (n > lit && lit >= 0) bump(n - lit); lit = n; }
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---------- hero: a rotating latent space ---------- */
  const hero = document.querySelector('.hero');
  const cv = document.getElementById('gl');
  const gl = cv.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: true });
  streamTagline(reduce ? 0 : 900);
  if (!gl) return;

  const VS = `
    attribute vec3 aP; attribute vec3 aS; attribute vec4 aM; // aM: delay, size, phase, kind + 4*cluster
    uniform float uTime; uniform vec2 uMouse; uniform float uForce; uniform vec3 uPulse;
    uniform float uDpr; uniform vec2 uRot; uniform vec3 uView; uniform vec2 uRes; uniform float uHot;
    varying float vA; varying vec3 vCol;
    float ease(float x) { return x >= 1.0 ? 1.0 : 1.0 - pow(2.0, -9.0 * x); }
    void main() {
      float kind = mod(aM.w, 4.0), cid = floor(aM.w / 4.0), ph = aM.z;
      float k = clamp((uTime - aM.x) / 2.2, 0.0, 1.0);
      vec3 p = mix(aS, aP, ease(k));
      p += vec3(sin(uTime * 0.7 + ph * 6.28), cos(uTime * 0.5 + ph * 9.0), sin(uTime * 0.6 + ph * 4.0)) * 0.007;
      float a = uRot.x, b = uRot.y;
      p = vec3(p.x * cos(a) + p.z * sin(a), p.y, -p.x * sin(a) + p.z * cos(a));
      p = vec3(p.x, p.y * cos(b) - p.z * sin(b), p.y * sin(b) + p.z * cos(b));
      float persp = 2.8 / (2.8 + p.z);
      vec2 s = uView.xy + vec2(p.x, -p.y) * uView.z * persp;
      vec2 d = s - uMouse; float r = length(d) + 0.001; vec2 n = d / r;
      float f = exp(-r * r / 12000.0) * uForce;
      s += n * f * 42.0 + vec2(-n.y, n.x) * f * 26.0;
      float age = uTime - uPulse.z;
      vec2 dp = s - uPulse.xy; float rp = length(dp) + 0.001;
      float band = exp(-pow(rp - age * 700.0, 2.0) / 1800.0) * exp(-age * 1.4) * step(0.0, age);
      s += dp / rp * band * 26.0;
      float hot = (kind < 0.5 && abs(cid - uHot) < 0.5) ? 1.0 : 0.0;
      float near = clamp(1.0 - (p.z + 1.1) / 2.2, 0.0, 1.0);
      vec3 base = kind > 2.5 ? vec3(0.42, 0.89, 1.0) : kind > 1.5 ? vec3(0.83, 1.0, 0.23) : vec3(0.925, 0.92, 0.9);
      float glow = clamp(hot + band * 1.5 + f * 0.8, 0.0, 1.0);
      vCol = mix(base, vec3(0.83, 1.0, 0.23), glow);
      float alpha = kind > 0.5 && kind < 1.5 ? 0.22 : 0.9;
      vA = alpha * mix(0.28, 1.0, near) * smoothstep(0.0, 0.2, k) * (1.0 + glow * 0.6);
      vec2 c = s / uRes * 2.0 - 1.0;
      gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
      gl_PointSize = aM.y * uDpr * persp * (1.0 + glow * 0.7);
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
  ['uTime', 'uMouse', 'uForce', 'uPulse', 'uDpr', 'uRot', 'uView', 'uRes', 'uHot'].forEach(n => U[n] = gl.getUniformLocation(prog, n));
  const A = { aP: gl.getAttribLocation(prog, 'aP'), aS: gl.getAttribLocation(prog, 'aS'), aM: gl.getAttribLocation(prog, 'aM') };
  const buf = gl.createBuffer();
  gl.clearColor(0.039, 0.039, 0.043, 1);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  // build the cloud once, in unit space
  const NCL = 16;
  let count = 0;
  (function buildCloud() {
    const small = innerWidth < 720;
    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283 * v); };
    const onSphere = () => { const z = Math.random() * 2 - 1, t = Math.random() * 6.283, r = Math.sqrt(1 - z * z); return [r * Math.cos(t), r * Math.sin(t), z]; };
    const centers = Array.from({ length: NCL }, () => { const c = onSphere(), rad = 0.45 + Math.random() * 0.5; return c.map(v => v * rad); });
    const kinds = centers.map((_, i) => (i === 3 || i === 9 ? 2 : i === 5 || i === 12 || i === 14 ? 3 : 0));
    const per = small ? 700 : 1500, shell = small ? 2500 : 5000, links = 12, perLink = small ? 140 : 260;
    count = NCL * per + shell + links * perLink;
    const a = new Float32Array(count * 10);
    let k = 0;
    const push = (x, y, z, size, kind, cid) => {
      const spread = 2.5 + Math.random() * 3;
      a[k++] = x; a[k++] = y; a[k++] = z;
      a[k++] = x * spread + gauss() * 0.4; a[k++] = y * spread + gauss() * 0.4; a[k++] = z * spread;
      a[k++] = Math.random() * 1.1; a[k++] = size; a[k++] = Math.random(); a[k++] = kind + 4 * cid;
    };
    centers.forEach((c, i) => {
      const sig = 0.05 + Math.random() * 0.07;
      for (let j = 0; j < per; j++) push(c[0] + gauss() * sig, c[1] + gauss() * sig, c[2] + gauss() * sig, 1.4 + Math.random() * 1.6, kinds[i], i);
    });
    for (let j = 0; j < shell; j++) { const s = onSphere(), r = 1.08 + gauss() * 0.01; push(s[0] * r, s[1] * r, s[2] * r, 1 + Math.random(), 1, 99); }
    for (let l = 0; l < links; l++) {
      const A0 = centers[(Math.random() * NCL) | 0], B0 = centers[(Math.random() * NCL) | 0];
      for (let j = 0; j < perLink; j++) {
        const t = Math.random(), lift = 1 + Math.sin(t * Math.PI) * 0.35;
        push((A0[0] + (B0[0] - A0[0]) * t) * lift + gauss() * 0.006, (A0[1] + (B0[1] - A0[1]) * t) * lift + gauss() * 0.006, (A0[2] + (B0[2] - A0[2]) * t) * lift + gauss() * 0.006, 1.1, 0, 98);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(A.aP); gl.vertexAttribPointer(A.aP, 3, gl.FLOAT, false, 40, 0);
    gl.enableVertexAttribArray(A.aS); gl.vertexAttribPointer(A.aS, 3, gl.FLOAT, false, 40, 12);
    gl.enableVertexAttribArray(A.aM); gl.vertexAttribPointer(A.aM, 4, gl.FLOAT, false, 40, 24);
    bump(count >> 8);
  })();

  let W = 0, H = 0;
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = hero.clientWidth; H = hero.clientHeight;
    if (!W || !H) return;
    cv.width = W * dpr; cv.height = H * dpr;
    gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(U.uRes, W, H); gl.uniform1f(U.uDpr, dpr);
    const small = W < 860;
    if (small) gl.uniform3f(U.uView, W / 2, H * 0.38, Math.min(W * 0.4, H * 0.28));
    else gl.uniform3f(U.uView, W * 0.6, H * 0.48, Math.min(W * 0.26, H * 0.36));
  }

  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;
  const mouse = { x: -9999, y: -9999 };
  let force = 0, speed = 0, pulse = [-9999, -9999, -99];
  let rotX = 0.6, rotY = 0.32, vx = 0, vy = 0, drag = null, moved = 0;
  const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', e => { drag = local(e); moved = 0; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    const [x, y] = local(e);
    if (mouse.x > -9000) speed = Math.min(80, Math.hypot(x - mouse.x, y - mouse.y));
    if (drag) {
      const dx = x - drag[0], dy = y - drag[1];
      vx = dx * 0.006; vy = dy * 0.006; moved += Math.abs(dx) + Math.abs(dy);
      drag = [x, y];
    }
    mouse.x = x; mouse.y = y;
  });
  cv.addEventListener('pointerup', e => {
    if (drag && moved < 6) { const [x, y] = local(e); pulse = [x, y, now()]; bump(64 + ((Math.random() * 400) | 0)); }
    drag = null;
  });
  cv.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });

  let visible = true, raf = 0, last = now(), hot = 0, hotAt = 0;
  function frame() {
    const t = reduce ? 30 : now(), dt = Math.min(0.05, t - last); last = t;
    if (!drag) { vx *= 0.95; vy *= 0.95; }
    rotX += vx + (reduce ? 0 : dt * 0.1);
    rotY = Math.max(-1.2, Math.min(1.2, rotY + vy));
    if (drag) { vx *= 0.5; vy *= 0.5; }
    if (t - hotAt > 2.2) { hot = (Math.random() * NCL) | 0; hotAt = t; bump(3); }
    const target = mouse.x > -9000 && !drag ? 0.45 + Math.min(0.55, speed * 0.02) : 0;
    force += (target - force) * 0.08; speed *= 0.9;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(U.uTime, t);
    gl.uniform2f(U.uMouse, mouse.x, mouse.y);
    gl.uniform1f(U.uForce, force);
    gl.uniform3f(U.uPulse, pulse[0], pulse[1], reduce ? -99 : pulse[2]);
    gl.uniform2f(U.uRot, rotX, rotY);
    gl.uniform1f(U.uHot, reduce ? -1 : hot);
    gl.drawArrays(gl.POINTS, 0, count);
    raf = visible && !reduce ? requestAnimationFrame(frame) : 0;
  }
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) { size(); raf = requestAnimationFrame(frame); }
  }).observe(hero);
  addEventListener('resize', () => { size(); if (!raf) frame(); });
  size(); frame();
})();
