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
    document.addEventListener('pointerleave', () => { mx = my = -100; });
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

  /* ---------- hero: the name, as particles ---------- */
  const hero = document.querySelector('.hero');
  const cv = document.getElementById('gl');
  const gl = cv.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: true });
  if (!gl) { streamTagline(300); return; }

  const VS = `
    attribute vec2 aT; attribute vec2 aS; attribute vec4 aM; // aM: delay, size, phase, kind
    uniform float uTime; uniform vec2 uRes; uniform vec2 uMouse; uniform float uForce;
    uniform float uScan; uniform vec3 uPulse; uniform float uDpr;
    varying float vA; varying float vHot;
    float ease(float x) { return x >= 1.0 ? 1.0 : 1.0 - pow(2.0, -10.0 * x); }
    void main() {
      float kind = aM.w, ph = aM.z;
      float k = clamp((uTime - aM.x) / 1.5, 0.0, 1.0);
      vec2 p = mix(aS, aT, ease(k));
      if (kind > 0.5) {
        // ambient dust drifts right, like a stream of requests
        p.x = mod(aT.x + uTime * (8.0 + ph * 22.0), uRes.x + 40.0) - 20.0;
        p.y += sin(uTime * 0.4 + ph * 30.0) * 10.0;
      } else {
        p += vec2(sin(uTime * 0.9 + ph * 6.283), cos(uTime * 0.7 + ph * 9.0)) * 0.9;
      }
      vec2 d = p - uMouse; float r = length(d) + 0.001; vec2 n = d / r;
      float f = exp(-r * r / 19600.0) * uForce;
      p += n * f * 64.0 + vec2(-n.y, n.x) * f * 46.0;
      float age = uTime - uPulse.z;
      vec2 dp = p - uPulse.xy; float rp = length(dp) + 0.001;
      float band = exp(-pow(rp - age * 950.0, 2.0) / 2200.0) * exp(-age * 1.3) * step(0.0, age);
      p += dp / rp * band * 38.0;
      float scan = exp(-pow((p.x - uScan) / 46.0, 2.0)) * (1.0 - kind);
      vHot = clamp(scan + band * 1.4 + f * 0.7, 0.0, 1.0);
      vA = mix(0.92, 0.28, kind) * smoothstep(0.0, 0.12, k + kind);
      vec2 c = p / uRes * 2.0 - 1.0;
      gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
      gl_PointSize = aM.y * uDpr * (1.0 + vHot * 0.8);
    }`;
  const FS = `
    precision mediump float;
    varying float vA; varying float vHot;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.05, d) * vA;
      vec3 col = mix(vec3(0.925, 0.92, 0.9), vec3(0.83, 1.0, 0.23), vHot);
      gl_FragColor = vec4(col * a, a);
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
  } catch (err) { console.warn(err); streamTagline(300); return; }
  root.classList.add('gl');
  gl.useProgram(prog);
  const U = {};
  ['uTime', 'uRes', 'uMouse', 'uForce', 'uScan', 'uPulse', 'uDpr'].forEach(n => U[n] = gl.getUniformLocation(prog, n));
  const A = { aT: gl.getAttribLocation(prog, 'aT'), aS: gl.getAttribLocation(prog, 'aS'), aM: gl.getAttribLocation(prog, 'aM') };
  const buf = gl.createBuffer();
  gl.clearColor(0.039, 0.039, 0.043, 1);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let W = 0, H = 0, dpr = 1, count = 0, built = false, nameY = 0;
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;

  async function build() {
    try { await document.fonts.load('italic 400 200px "Instrument Serif"'); } catch (e) {}
    // the page can briefly report a zero-size layout (background tab, hidden pane): wait it out
    while (hero.clientWidth < 10 || hero.clientHeight < 10) await new Promise(r => setTimeout(r, 200));
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = hero.clientWidth; H = hero.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    gl.viewport(0, 0, cv.width, cv.height);

    const oc = document.createElement('canvas'); oc.width = W; oc.height = H;
    const o = oc.getContext('2d', { willReadFrequently: true });
    const mobile = W < 720;
    const lines = mobile ? ['Mike', 'Zhou'] : ['Mike Zhou'];
    let fs = mobile ? W * 0.44 : Math.min(W * 0.205, H * 0.46);
    const setFont = () => { o.font = `italic 400 ${fs}px "Instrument Serif", Georgia, serif`; };
    setFont();
    const mw = Math.max(...lines.map(l => o.measureText(l).width));
    if (mw > W * 0.92) { fs *= (W * 0.92) / mw; setFont(); }
    o.fillStyle = '#fff'; o.textAlign = 'center'; o.textBaseline = 'middle';
    const lh = fs * 0.82;
    nameY = H * (mobile ? 0.42 : 0.44);
    lines.forEach((l, i) => o.fillText(l, W / 2, nameY + (i - (lines.length - 1) / 2) * lh));
    const img = o.getImageData(0, 0, W, H).data;

    let gap = Math.max(2, Math.round(fs / 120)), pts;
    for (;;) {
      pts = [];
      for (let y = 0; y < H; y += gap) for (let x = 0; x < W; x += gap) if (img[(y * W + x) * 4 + 3] > 140) pts.push(x, y);
      if (pts.length / 2 <= 40000) break;
      gap++;
    }
    const nName = pts.length / 2, nAmb = Math.round((W * H) / 520);
    count = nName + nAmb;
    const a = new Float32Array(count * 8);
    let k = 0;
    for (let i = 0; i < nName; i++) {
      const tx = pts[i * 2] + (Math.random() - 0.5) * gap * 0.7, ty = pts[i * 2 + 1] + (Math.random() - 0.5) * gap * 0.7;
      a[k++] = tx; a[k++] = ty;
      a[k++] = -80 - Math.random() * W * 0.7; a[k++] = ty + (Math.random() - 0.5) * H * 0.6;
      a[k++] = built ? -99 : 0.2 + (tx / W) * 1.1 + Math.random() * 0.3;
      a[k++] = gap * 0.95 + Math.random() * 0.9; a[k++] = Math.random(); a[k++] = 0;
    }
    for (let i = 0; i < nAmb; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      a[k++] = x; a[k++] = y; a[k++] = x; a[k++] = y; a[k++] = 0;
      a[k++] = 0.8 + Math.random() * 1.4; a[k++] = Math.random(); a[k++] = 1;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(A.aT); gl.vertexAttribPointer(A.aT, 2, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(A.aS); gl.vertexAttribPointer(A.aS, 2, gl.FLOAT, false, 32, 8);
    gl.enableVertexAttribArray(A.aM); gl.vertexAttribPointer(A.aM, 4, gl.FLOAT, false, 32, 16);
    gl.uniform2f(U.uRes, W, H); gl.uniform1f(U.uDpr, dpr);
    if (!built) { pulse = [W / 2, nameY, 1.9]; bump(nName >> 6); }
    built = true;
  }

  const mouse = { x: -9999, y: -9999 };
  let force = 0, speed = 0, pulse = [-9999, -9999, -99];
  const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  hero.addEventListener('pointermove', e => {
    const [x, y] = local(e);
    if (mouse.x > -9000) speed = Math.min(80, Math.hypot(x - mouse.x, y - mouse.y));
    mouse.x = x; mouse.y = y;
  });
  hero.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });
  hero.addEventListener('pointerdown', e => {
    if (e.target.closest('a')) return;
    const [x, y] = local(e);
    pulse = [x, y, now()];
    bump(64 + ((Math.random() * 400) | 0));
  });

  let visible = true, raf = 0;
  function frame() {
    const t = reduce ? 40 : now();
    const target = mouse.x > -9000 ? 0.5 + Math.min(0.5, speed * 0.02) : 0;
    force += (target - force) * 0.08; speed *= 0.9;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(U.uTime, t);
    gl.uniform2f(U.uMouse, mouse.x, mouse.y);
    gl.uniform1f(U.uForce, force);
    gl.uniform1f(U.uScan, reduce || t < 2.4 ? -9999 : (((t - 2.4) % 7) / 7) * (W + 700) - 350);
    gl.uniform3f(U.uPulse, pulse[0], pulse[1], reduce ? -99 : pulse[2]);
    gl.drawArrays(gl.POINTS, 0, count);
    raf = visible && !reduce ? requestAnimationFrame(frame) : 0;
  }

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf && built) raf = requestAnimationFrame(frame);
  }).observe(hero);

  let rt;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (hero.clientWidth !== W || Math.abs(hero.clientHeight - H) > 120) build().then(() => { if (!raf) frame(); }); }, 150);
  });

  build().then(() => { frame(); streamTagline(reduce ? 0 : 1700); });
})();
