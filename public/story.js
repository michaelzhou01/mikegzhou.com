(() => {
  const { reduce, bump } = window.MZ;
  // the active section's canvas context and size; set by each mounted section before drawing
  let ctx, cw = 0, ch = 0;

  const C = { fg: '#ecebe6', mute: '#8b8a84', dim: '#3a3a40', faint: '#232327', lime: '#d4ff3a', cyan: '#6ae3ff', bg: '#0d0d0f' };
  const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
  const SERIF = '"Instrument Serif", Georgia, serif';
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = x => 1 - Math.pow(1 - clamp(x), 3);
  const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lime = a => `rgba(212,255,58,${a})`;
  const cyan = a => `rgba(106,227,255,${a})`;

  const coral = a => `rgba(255,122,92,${a})`;
  const font = (px, f = MONO, style = '') => { ctx.font = `${style} ${px}px ${f}`; };
  const box = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

  /* ---------- data ---------- */
  const PROMPT = 'why is the sky blue?';
  const TOK = [['why', 17418], [' is', 374], [' the', 279], [' sky', 13180], [' blue', 6437], ['?', 30]];
  const OUT = [' Sunlight', ' scatters', ' off', ' air', ' molecules', ',', ' and', ' blue', ' light', ' scatters', ' the', ' most', '.'];
  const SYS = 12;

  // continuous batching: a deterministic simulation, our request joins at column ~130
  const SL = 8, hist = [];
  (() => {
    const r = rng(42), slots = Array(SL).fill(null), q = [];
    let id = 0;
    for (let c = 0; c < 260; c++) {
      if (r() < 0.2) { const n = r() < 0.15 ? 3 : 1; for (let i = 0; i < n; i++) q.push({ id: id++, left: 6 + ((r() ** 2 * 60) | 0), fresh: true }); }
      if (c === 128) q.unshift({ id: -1, left: 64, fresh: true });
      const col = [];
      for (let s = 0; s < SL; s++) {
        if (!slots[s] && q.length) slots[s] = q.shift();
        const x = slots[s];
        if (x) { col.push({ id: x.id, pre: x.fresh }); x.fresh = false; if (--x.left <= 0) slots[s] = null; }
        else col.push(null);
      }
      hist.push(col);
    }
  })();

  // attention weights for prefill
  const NP = SYS + TOK.length;
  const ATT = (() => { const r = rng(7); return Array.from({ length: NP }, (_, i) => Array.from({ length: NP }, (_, j) => clamp(r() ** 2.4 * 0.75 + (i === j ? 0.45 : 0) + (j === 0 ? 0.35 : 0)))); })();

  /* ---------- stage 0: request ---------- */
  function sRequest(lp, t) {
    const fs = clamp(cw * 0.045, 15, 30);
    font(fs);
    const full = ctx.measureText(PROMPT).width;
    const bw = full + fs * 2.2, bh = fs * 2.8, x = (cw - bw) / 2, y = ch / 2 - bh / 2;
    // incoming packet
    const e = ease(lp * 2.2);
    const px = -40 + (x - 20 + 40) * e;
    ctx.strokeStyle = C.faint; ctx.setLineDash([3, 6]);
    ctx.beginPath(); ctx.moveTo(0, ch / 2); ctx.lineTo(x, ch / 2); ctx.stroke(); ctx.setLineDash([]);
    if (e < 1) { ctx.fillStyle = C.lime; ctx.beginPath(); ctx.arc(px, ch / 2, 5, 0, 7); ctx.fill(); }
    // the request box
    ctx.globalAlpha *= clamp(lp * 4);
    box(x, y, bw, bh, 12); ctx.fillStyle = '#111114'; ctx.fill(); ctx.strokeStyle = e >= 1 ? lime(.7) : C.dim; ctx.stroke();
    font(11); ctx.fillStyle = C.mute; ctx.textBaseline = 'alphabetic';
    ctx.fillText('POST /v1/chat/completions', x, y - 14);
    ctx.fillText('{ "role": "user" }', x, y + bh + 24);
    const n = Math.round(clamp((lp - 0.25) * 1.9) * PROMPT.length);
    font(fs); ctx.textBaseline = 'middle'; ctx.fillStyle = C.fg;
    const typed = PROMPT.slice(0, n);
    ctx.fillText(typed, x + fs * 1.1, ch / 2);
    if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = C.lime; ctx.fillRect(x + fs * 1.1 + ctx.measureText(typed).width + 2, ch / 2 - fs * 0.55, fs * 0.55, fs * 1.1); }
  }

  /* ---------- stage 1: tokenize ---------- */
  function sTokenize(lp) {
    let fs = clamp(cw * 0.045, 14, 30), pad, gap, widths, spreadW;
    const measure = () => {
      font(fs); pad = fs * 0.6; gap = fs * 0.5;
      widths = TOK.map(([s]) => ctx.measureText(s.trim()).width);
      spreadW = widths.reduce((s, w) => s + w + pad * 2, 0) + gap * (TOK.length - 1);
    };
    measure();
    if (spreadW > cw * 0.9) { fs *= (cw * 0.9) / spreadW; measure(); }
    const contig = TOK.map(([s]) => ctx.measureText(s).width);
    const contigW = contig.reduce((a, b) => a + b, 0);
    const e = ease(lp * 2);
    let cx = (cw - contigW) / 2, sx = (cw - spreadW) / 2;
    const y = ch / 2 - fs * 0.6;
    ctx.textBaseline = 'middle';
    TOK.forEach(([s, id], i) => {
      const lead = s.startsWith(' ') ? ctx.measureText(' ').width : 0;
      const xc = cx + lead, xs = sx + pad;
      const x = xc + (xs - xc) * e;
      const col = i % 2 ? cyan : lime;
      box(x - pad * e, y - fs * 1.05, widths[i] + pad * 2 * e, fs * 2.1, 8);
      ctx.fillStyle = col(0.07 * e); ctx.fill();
      ctx.strokeStyle = col(0.75 * e); ctx.stroke();
      font(fs); ctx.fillStyle = C.fg; ctx.textAlign = 'left';
      ctx.fillText(s.trim(), x, y);
      // ids drop in under each chip
      const ia = clamp((lp - 0.42 - i * 0.04) * 5);
      if (ia > 0) {
        font(Math.max(10, fs * 0.5)); ctx.textAlign = 'center';
        ctx.fillStyle = (i % 2 ? cyan : lime)(ia);
        ctx.fillText(String(id), x + widths[i] / 2, y + fs * 1.9 + (1 - ia) * 10);
        ctx.textAlign = 'left';
      }
      cx += contig[i]; sx += widths[i] + pad * 2 + gap;
    });
    font(11); ctx.fillStyle = C.mute; ctx.textAlign = 'center';
    ctx.fillText(`${TOK.length} tokens`, cw / 2, y + fs * 3.6);
    ctx.textAlign = 'left';
  }

  /* ---------- stage 2: continuous batching ---------- */
  function sBatch(lp) {
    const lab = cw < 500 ? 46 : 78, top = 44, bottom = ch - 56, rowH = (bottom - top) / SL;
    const VIS = cw < 500 ? 56 : 84, end = 112 + Math.floor(lp * 130);
    const cellW = (cw - lab - 28) / VIS;
    let ours = null, used = 0;
    font(10); ctx.textBaseline = 'middle';
    for (let s = 0; s < SL; s++) { ctx.fillStyle = C.dim; ctx.fillText(cw < 500 ? `s${s}` : `slot ${s}`, 14, top + s * rowH + rowH / 2); }
    for (let c = 0; c < VIS; c++) {
      const col = hist[end - VIS + c]; if (!col) continue;
      const x = lab + c * cellW;
      col.forEach((cell, s) => {
        if (!cell) return;
        used++;
        const mine = cell.id === -1;
        if (mine && !ours) ours = [x, top + s * rowH];
        ctx.fillStyle = mine ? (cell.pre ? '#fff' : C.lime)
          : cell.pre ? '#bdbdb8' : `hsl(${(cell.id * 47) % 360}, 14%, ${26 + ((cell.id * 13) % 16)}%)`;
        ctx.fillRect(x, top + s * rowH + 2, Math.max(1, cellW - 1.2), rowH - 4);
      });
    }
    const nowX = lab + VIS * cellW + 4;
    ctx.strokeStyle = lime(.5); ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(nowX, top - 10); ctx.lineTo(nowX, bottom + 4); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.lime; ctx.textAlign = 'right'; ctx.fillText('now', nowX + 2, top - 22); ctx.textAlign = 'left';
    if (ours) {
      font(11); ctx.fillStyle = C.lime;
      const lx = Math.min(ours[0], cw - 130);
      ctx.fillText('↓ your request', lx, ours[1] - 10 < top ? top - 22 : ours[1] - 10);
    }
    font(11); ctx.fillStyle = C.mute;
    ctx.fillText(`gpu util ${Math.round((used / (VIS * SL)) * 100)}%  ·  white = prefill`, lab, ch - 26);
  }

  /* ---------- stage 3: prefill ---------- */
  function sPrefill(lp, t) {
    const m = Math.min(cw * 0.74, ch * 0.74), cell = m / NP;
    const ox = (cw - m) / 2 + (cw < 500 ? 16 : 30), oy = (ch - m) / 2 + 6;
    const prog = clamp(lp * 1.4);
    for (let i = 0; i < NP; i++) for (let j = 0; j < NP; j++) {
      const x = ox + j * cell, y = oy + i * cell;
      if (j > i) { ctx.fillStyle = C.faint; ctx.fillRect(x + cell / 2 - 1, y + cell / 2 - 1, 2, 2); continue; }
      const v = clamp((prog * 1.15 - (i + j) / (2 * NP)) * 7);
      if (v <= 0) { ctx.strokeStyle = C.faint; ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3); continue; }
      const w = ATT[i][j];
      ctx.fillStyle = i >= SYS && j >= SYS ? lime((0.12 + 0.88 * w) * v) : cyan((0.08 + 0.7 * w) * v);
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    }
    font(clamp(cell * 0.55, 8, 12)); ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    for (let i = 0; i < NP; i++) {
      ctx.fillStyle = i >= SYS ? C.fg : C.dim;
      ctx.fillText(i >= SYS ? TOK[i - SYS][0].trim() : '·', ox - 8, oy + i * cell + cell / 2);
    }
    ctx.textAlign = 'left';
    font(11); ctx.fillStyle = C.mute;
    ctx.fillText('softmax(QKᵀ) · causal mask', ox, oy - 16);
    ctx.fillStyle = prog >= 1 ? C.lime : C.mute;
    ctx.fillText(prog >= 1 ? `✓ ${NP} tokens in 1 pass → kv cache` : `${Math.round(prog * 100)}% prefilled`, ox, oy + m + 22);
  }

  /* ---------- stage 4: decode ---------- */
  function sDecode(lp, t) {
    const g = Math.min(OUT.length, Math.floor(lp * (OUT.length + 2)));
    const fs = clamp(cw * 0.026, 11, 16), padX = fs * 0.5, lineH = fs * 2.4, margin = 24;
    font(fs); ctx.textBaseline = 'middle';
    const list = [...TOK.map(([s]) => ({ s: s.trim(), p: true })), ...OUT.slice(0, g).map(s => ({ s: s.trim(), p: false }))];
    let x = margin, y = Math.max(96, ch * 0.2);
    const pos = list.map(it => {
      const w = ctx.measureText(it.s).width + padX * 2;
      if (x + w > cw - margin) { x = margin; y += lineH; }
      const r = [x, y, w]; x += w + 6; return r;
    });
    // attention arcs from the newest token
    if (g > 0) {
      const r = rng(100 + g), last = pos.length - 1, [nx, ny, nw] = pos[last];
      const picks = new Set(); while (picks.size < Math.min(4, last)) picks.add((r() * last) | 0);
      [...picks].forEach((k, i) => {
        const [px, py, pw] = pos[k], wgt = 0.25 + r() * 0.75;
        const ax = nx + nw / 2, ay = ny - fs, bx = px + pw / 2, by = py - fs;
        ctx.strokeStyle = cyan(0.25 + wgt * 0.5); ctx.lineWidth = 0.8 + wgt * 1.8;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 26 - Math.abs(ax - bx) * 0.08, bx, by); ctx.stroke();
      });
      ctx.lineWidth = 1;
    }
    list.forEach((it, i) => {
      const [bx, by, w] = pos[i], newest = !it.p && i === list.length - 1;
      box(bx, by - fs * 0.95, w, fs * 1.9, 6);
      if (newest) { ctx.fillStyle = C.lime; ctx.fill(); }
      else { ctx.strokeStyle = it.p ? C.dim : lime(.45); ctx.stroke(); }
      ctx.fillStyle = newest ? '#0a0a0b' : it.p ? C.mute : C.fg;
      ctx.fillText(it.s, bx + padX, by);
    });
    // paged kv cache
    const PAGE = 8, PAGES = 8, per = cw < 500 ? 2 : 4;
    const rowsP = PAGES / per, gx = 14, pw = (cw - margin * 2 - gx * (per - 1)) / per, sw = pw / PAGE, sh = Math.min(22, sw * 0.9);
    const total = SYS + TOK.length + g;
    const baseY = ch - 40 - rowsP * (sh + 30);
    font(10);
    for (let p = 0; p < PAGES; p++) {
      const px = margin + (p % per) * (pw + gx), py = baseY + Math.floor(p / per) * (sh + 30);
      const usedP = p * PAGE < total;
      ctx.fillStyle = usedP ? C.mute : C.dim; ctx.fillText(`page ${p}${usedP ? '' : ' · free'}`, px, py - 9);
      for (let s = 0; s < PAGE; s++) {
        const idx = p * PAGE + s, sx = px + s * sw;
        if (idx < SYS) ctx.fillStyle = '#2a2a30';
        else if (idx < SYS + TOK.length) ctx.fillStyle = cyan(.55);
        else if (idx < total) ctx.fillStyle = idx === total - 1 && g > 0 ? '#fff' : lime(.8);
        else { ctx.strokeStyle = C.faint; ctx.strokeRect(sx + 1.5, py + 1.5, sw - 3, sh - 3); continue; }
        ctx.fillRect(sx + 1, py + 1, sw - 2, sh - 2);
      }
    }
    font(11); ctx.fillStyle = C.mute;
    ctx.fillText(`kv cache · ${total}/${PAGE * PAGES} slots · ${Math.ceil(total / PAGE)} pages`, margin, ch - 22);
  }

  /* ---------- stage 5: stream ---------- */
  const ANSWER = OUT.join('').trim();
  function sStream(lp, t) {
    const n = Math.floor(clamp(lp * 1.35) * ANSWER.length);
    const fs = clamp(cw * 0.072, 30, 68), lh = fs * 1.08, maxW = cw * 0.82;
    font(fs, SERIF, 'italic');
    const lines = []; let cur = '';
    ANSWER.split(' ').forEach(wd => { const tr = cur ? cur + ' ' + wd : wd; if (ctx.measureText(tr).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = tr; });
    lines.push(cur);
    const x0 = (cw - maxW) / 2; let y = ch / 2 - (lines.length * lh) / 2 + lh / 2 - 14;
    ctx.textBaseline = 'middle';
    let left = n, cx = x0, cy = y;
    lines.forEach((ln, i) => {
      const part = ln.slice(0, Math.max(0, left));
      ctx.fillStyle = C.fg; ctx.fillText(part, x0, y);
      if (left > 0 && left <= ln.length) { cx = x0 + ctx.measureText(part).width; cy = y; }
      left -= ln.length + 1; y += lh;
    });
    if (n === 0) { cx = x0; cy = ch / 2 - (lines.length * lh) / 2 + lh / 2 - 14; }
    if (Math.floor(t * 2) % 2 === 0 || n < ANSWER.length) { ctx.fillStyle = C.lime; ctx.fillRect(cx + 4, cy - fs * 0.38, fs * 0.32, fs * 0.76); }
    let acc = 0, shown = 0; for (const s of OUT) { acc += s.length; if (acc - 1 <= n) shown++; }
    font(12); ctx.fillStyle = C.mute;
    const tps = shown > 1 ? 94 : 0;
    ctx.fillText(`ttft 184ms  ·  ${tps || '—'} tok/s  ·  ${Math.min(shown, OUT.length)}/${OUT.length} tokens${n >= ANSWER.length ? '  ·  [done]' : ''}`, x0, y + 18);
  }

  /* =====================================================================
     mixture of experts
     ===================================================================== */
  const MOE_T = ['the', 'GPU', 'is', 'fast', 'because', 'tensor', 'cores', 'scale'];
  const ROUTE = [[0, 6], [0, 3], [0, 6], [0, 3], [0, 1], [0, 6], [0, 3], [4, 6]]; // top-2 experts per token
  const RW = (() => { const r = rng(5); return ROUTE.map(() => { const a = 0.55 + r() * 0.3; return [a, 1 - a]; }); })();
  const SKEW = [7, 1, 0, 3, 1, 0, 4, 0], BAL = [2, 2, 2, 2, 2, 2, 2, 2], CAP = 3;
  function moeLayout() {
    const pad = 28, top = ch * 0.13, area = ch * 0.72, fs = clamp(cw * 0.024, 11, 16);
    const ex = cw * 0.56, bw = Math.min(120, cw * 0.15), rowE = area / 8;
    const tok = MOE_T.map((s, k) => { font(fs); const w = ctx.measureText(s).width + fs; return { x: pad, y: top + (k + 0.5) * (area / 8), w, h: fs * 1.8, s }; });
    const exp = BAL.map((_, e) => ({ x: ex, y: top + (e + 0.5) * rowE, w: bw, h: Math.min(rowE * 0.72, 34) }));
    return { pad, top, area, fs, tok, exp, barX: ex + bw + 16, barW: cw - pad - (ex + bw + 16) };
  }
  function moeBase(L, { loads = null, activeAlpha = null } = {}) {
    L.exp.forEach((b, e) => {
      box(b.x, b.y - b.h / 2, b.w, b.h, 6);
      const on = activeAlpha ? activeAlpha[e] : 0;
      ctx.fillStyle = on ? lime(0.08 + 0.5 * on) : '#121215'; ctx.fill();
      ctx.strokeStyle = on ? lime(0.75) : C.dim; ctx.stroke();
      font(clamp(L.fs * 0.8, 10, 13)); ctx.textBaseline = 'middle'; ctx.fillStyle = on ? C.fg : C.mute;
      ctx.fillText(`expert ${e}`, b.x + 10, b.y);
    });
  }
  function moeTokens(L, n) {
    L.tok.forEach((t, k) => {
      if (k >= n) return;
      box(t.x, t.y - t.h / 2, t.w, t.h, 6); ctx.strokeStyle = C.dim; ctx.stroke();
      font(L.fs); ctx.textBaseline = 'middle'; ctx.fillStyle = C.fg; ctx.fillText(t.s, t.x + L.fs / 2, t.y);
    });
  }
  function moeRoutes(L, n, alpha = 1) {
    ROUTE.slice(0, n).forEach(([a, b], k) => {
      const t = L.tok[k];
      [[a, RW[k][0], lime], [b, RW[k][1], cyan]].forEach(([e, w, col]) => {
        const x0 = t.x + t.w, y0 = t.y, x1 = L.exp[e].x, y1 = L.exp[e].y, mx = (x0 + x1) / 2;
        ctx.strokeStyle = col((0.18 + 0.7 * w) * alpha); ctx.lineWidth = 0.8 + w * 2.4;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1); ctx.stroke();
      });
    });
    ctx.lineWidth = 1;
  }
  function moeBars(L, loads, { cap = false } = {}) {
    const unit = L.barW / 8;
    L.exp.forEach((b, e) => {
      const v = loads[e], y = b.y - 6;
      ctx.fillStyle = C.faint; ctx.fillRect(L.barX, y, L.barW, 12);
      const ok = cap ? Math.min(v, CAP) : v;
      ctx.fillStyle = lime(0.85); ctx.fillRect(L.barX, y, ok * unit, 12);
      if (cap && v > CAP) { ctx.fillStyle = coral(0.9); ctx.fillRect(L.barX + CAP * unit, y, (v - CAP) * unit, 12); }
      font(10); ctx.textBaseline = 'middle'; ctx.fillStyle = v < 0.5 ? C.dim : C.mute;
      ctx.fillText(v < 0.5 ? 'idle' : `${Math.round(v)}`, L.barX + Math.max(v, 0) * unit + 6, b.y);
    });
    if (cap) {
      const x = L.barX + CAP * unit;
      ctx.strokeStyle = 'rgba(236,235,230,.55)'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, L.top - 6); ctx.lineTo(x, L.top + L.area + 4); ctx.stroke(); ctx.setLineDash([]);
      font(10); ctx.fillStyle = C.fg; ctx.fillText('capacity', x + 4, L.top - 12);
    }
  }
  function sMoeRoute(lp) {
    const L = moeLayout(), n = Math.min(8, Math.ceil(clamp(lp * 1.4) * 8));
    const act = BAL.map(() => 0); ROUTE.slice(0, n).forEach(([a, b]) => { act[a] = 1; act[b] = 1; });
    moeRoutes(L, n);
    moeBase(L, { activeAlpha: act.map(v => v * 0.3) });
    moeTokens(L, n);
    const rx = (L.pad + 90 + L.exp[0].x) / 2;
    ctx.strokeStyle = C.dim; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(rx, L.top - 10); ctx.lineTo(rx, L.top + L.area + 6); ctx.stroke(); ctx.setLineDash([]);
    font(11); ctx.fillStyle = C.mute; ctx.textAlign = 'center'; ctx.fillText('router · top-2', rx, L.top - 18); ctx.textAlign = 'left';
    font(11); ctx.fillStyle = C.mute; ctx.fillText('lime = first choice · cyan = second · width = router weight', L.pad, ch - 22);
  }
  function sMoeCompute(lp) {
    const L = moeLayout(), e = ease(lp * 1.8);
    moeRoutes(L, 8, 0.25);
    moeBase(L, { activeAlpha: SKEW.map(v => (v / 7) * e) });
    moeTokens(L, 8);
    moeBars(L, SKEW.map(v => v * e));
    font(11); ctx.fillStyle = C.lime;
    ctx.fillText('16 expert calls for 8 tokens · each token uses 2 of 8 experts (~25% of their weights)', L.pad, ch - 22);
  }
  function sMoeBalance(lp) {
    const L = moeLayout(), k = ease(lp * 1.7 - 0.45);
    const loads = SKEW.map((v, i) => v + (BAL[i] - v) * k);
    moeBase(L, { activeAlpha: loads.map(v => Math.min(1, v / 4)) });
    moeTokens(L, 8);
    moeBars(L, loads, { cap: true });
    font(11);
    ctx.fillStyle = k < 0.5 ? coral(1) : C.lime;
    ctx.fillText(k < 0.5 ? 'unbalanced: expert 0 overflows its capacity while three experts sit idle'
      : 'with a load-balancing loss in training: every expert gets ~2 tokens', L.pad, ch - 22);
  }

  /* =====================================================================
     latency vs. throughput (interactive, idealized)
     ===================================================================== */
  const RF = { P: 8e9, W: 16e9, KV: 131072, BW: 3.35e12, F: 700e12, HBM: 80e9 };
  const EXP = { logb: 5, ctx: 4096, auto: false };
  const model = (b, ctx) => {
    const bytes = RF.W + b * ctx * RF.KV, mem = bytes / RF.BW, comp = (2 * RF.P * b) / RF.F, step = Math.max(mem, comp);
    return { step, mem, comp, thr: b / step, fits: bytes <= RF.HBM, gb: bytes / 1e9 };
  };
  function sRoofline(lp, t) {
    const logb = EXP.auto ? 4.5 + 4.5 * Math.sin(t * 0.45) : EXP.logb;
    const b = Math.max(1, Math.round(2 ** logb)), cx = EXP.ctx;
    const narrow = cw < 600, L = 56, R = 48, T = narrow ? 118 : 100, B = 62, pw = cw - L - R, ph = ch - T - B;
    const X = lb => L + (lb / 9) * pw;
    const pts = []; for (let lb = 0; lb <= 9.0001; lb += 0.05) pts.push([lb, model(2 ** lb, cx)]);
    const tMax = Math.max(...pts.filter(([, m]) => m.fits).map(([, m]) => m.thr), 1) * 1.1;
    const lMax = Math.max(...pts.map(([, m]) => m.step)) * 1e3 * 1.05;
    const Y = v => T + ph - (v / tMax) * ph, Y2 = v => T + ph - (v / lMax) * ph;
    // regions: compute-bound shading and out-of-memory hatching
    pts.forEach(([lb, m], i) => {
      if (i === 0) return;
      const x0 = X(pts[i - 1][0]), x1 = X(lb);
      if (!m.fits) { ctx.fillStyle = coral(0.07); ctx.fillRect(x0, T, x1 - x0 + 0.5, ph); }
      else if (m.comp > m.mem) { ctx.fillStyle = cyan(0.06); ctx.fillRect(x0, T, x1 - x0 + 0.5, ph); }
    });
    // axes
    ctx.strokeStyle = C.dim; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, T + ph); ctx.lineTo(L + pw, T + ph); ctx.lineTo(L + pw, T); ctx.stroke();
    font(10); ctx.textBaseline = 'middle'; ctx.fillStyle = C.mute; ctx.textAlign = 'center';
    for (let lb = 0; lb <= 9; lb++) ctx.fillText(String(2 ** lb), X(lb), T + ph + 14);
    ctx.fillText('batch size (concurrent requests)', L + pw / 2, T + ph + 34);
    ctx.textAlign = 'left'; ctx.fillStyle = C.lime; ctx.fillText('↑ total tok/s', L, T - 12); ctx.textAlign = 'right';
    for (let k = 0; k <= 4; k++) ctx.fillText(Math.round((tMax * k) / 4 / 1000) + 'k', L - 8, Y((tMax * k) / 4));
    ctx.textAlign = 'right'; ctx.fillStyle = C.cyan; ctx.fillText('ms per token ↑', L + pw, T - 12); ctx.textAlign = 'left';
    for (let k = 0; k <= 4; k++) ctx.fillText(Math.round((lMax * k) / 4), L + pw + 8, Y2((lMax * k) / 4));
    // curves
    const curve = (val, ys, col, oom = true) => {
      ctx.lineWidth = 2;
      for (let i = 1; i < pts.length; i++) {
        const [la, ma] = pts[i - 1], [lb2, mb] = pts[i];
        if (!oom && !mb.fits) continue;
        ctx.strokeStyle = mb.fits ? col : coral(0.6); ctx.setLineDash(mb.fits ? [] : [4, 4]);
        ctx.beginPath(); ctx.moveTo(X(la), ys(val(ma))); ctx.lineTo(X(lb2), ys(val(mb))); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.lineWidth = 1;
    };
    curve(m => Math.min(m.thr, tMax), Y, C.lime, false);
    curve(m => m.step * 1e3, Y2, C.cyan);
    // marker
    const m = model(b, cx), mx = X(Math.log2(b));
    ctx.strokeStyle = 'rgba(236,235,230,.4)'; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(mx, T); ctx.lineTo(mx, T + ph); ctx.stroke(); ctx.setLineDash([]);
    [...(m.fits ? [[Y(Math.min(m.thr, tMax)), C.lime]] : []), [Y2(m.step * 1e3), C.cyan]].forEach(([y, c]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(mx, y, 5, 0, 7); ctx.fill(); });
    // readout
    const bound = !m.fits ? 'out of memory' : m.comp > m.mem ? 'compute-bound' : 'memory-bound';
    font(clamp(cw * 0.022, 12, 16)); ctx.textBaseline = 'alphabetic'; ctx.fillStyle = C.fg;
    ctx.fillText(`batch ${b} · context ${cx.toLocaleString()}`, L, 34);
    font(clamp(cw * 0.017, 10, 13));
    ctx.fillStyle = !m.fits ? coral(1) : C.mute;
    const a = `${(m.step * 1e3).toFixed(1)} ms/step · ${Math.round(1 / m.step)} tok/s per user`, z2 = `${Math.round(m.thr).toLocaleString()} tok/s total · ${m.gb.toFixed(0)} GB · ${bound}`;
    if (narrow) { ctx.fillText(a, L, 56); ctx.fillText(z2, L, 76); } else ctx.fillText(`${a} · ${z2}`, L, 58);
    font(10); ctx.fillStyle = C.dim;
    ctx.fillText(cw > 620 ? 'idealized · 8B model, fp16, one 80 GB GPU · cyan band = compute-bound · red = out of memory' : 'idealized · 8B, fp16, one 80 GB GPU', L, ch - 8);
  }

  /* =====================================================================
     the anatomy section: pinned, scroll-driven
     ===================================================================== */
  function mount(sec, DRAW) {
    const cv = sec.querySelector('canvas'), my = cv.getContext('2d');
    const stages = [...sec.querySelectorAll('.stage')], rail = [...sec.querySelectorAll('.rail li')];
    const corner = sec.querySelector('.vis-corner');
    const N = DRAW.length;
    let w = 0, h = 0, visible = false, raf = 0, last = -1;
    const size = () => {
      const d = Math.min(devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
      w = r.width; h = r.height; cv.width = w * d; cv.height = h * d; my.setTransform(d, 0, 0, d, 0, 0);
    };
    const progress = () => { const r = sec.getBoundingClientRect(); return clamp(-r.top / (r.height - innerHeight)); };
    function frame(ms) {
      const t = ms / 1000, p = progress(), f = p * N;
      const i = Math.min(N - 1, Math.floor(f)), lp = i === N - 1 ? clamp(f - i) : f - i;
      if (i !== last) {
        stages.forEach((s, k) => s.classList.toggle('on', k === i));
        rail.forEach((s, k) => { s.classList.toggle('on', k === i); s.classList.toggle('done', k < i); });
        if (i > last) bump(7 * (i + 1));
        last = i;
      }
      rail.forEach((s, k) => s.style.setProperty('--lp', k === i ? lp.toFixed(3) : 0));
      if (corner) corner.textContent = `p = ${p.toFixed(2)}`;
      ctx = my; cw = w; ch = h;
      ctx.clearRect(0, 0, cw, ch);
      const fade = Math.min(i > 0 ? lp / 0.05 : 1, i < N - 1 ? (1 - lp) / 0.05 : 1);
      ctx.save(); ctx.globalAlpha = clamp(fade);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineWidth = 1;
      DRAW[i](reduce ? Math.max(lp, 0.999) : lp, t);
      ctx.restore();
      raf = visible ? requestAnimationFrame(frame) : 0;
    }
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) { size(); if (!raf) raf = requestAnimationFrame(frame); }
    }).observe(sec);
    addEventListener('resize', size);
    document.fonts.ready.then(size);
  }
  const SETS = {
    anatomy: [sRequest, sTokenize, sBatch, sPrefill, sDecode, sStream],
    moe: [sMoeRoute, sMoeCompute, sMoeBalance],
  };
  document.querySelectorAll('[data-story]').forEach(sec => mount(sec, SETS[sec.dataset.story]));

  /* =====================================================================
     the explorer section: sliders drive the chart directly
     ===================================================================== */
  (() => {
    const sec = document.getElementById('explore');
    if (!sec) return;
    const cv = sec.querySelector('canvas'), my = cv.getContext('2d');
    const bIn = document.getElementById('ex-logb'), cIn = document.getElementById('ex-ctx');
    let w = 0, h = 0, visible = false, raf = 0, touched = false;
    const size = () => {
      const d = Math.min(devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
      w = r.width; h = r.height; cv.width = w * d; cv.height = h * d; my.setTransform(d, 0, 0, d, 0, 0);
    };
    const sync = () => {
      EXP.logb = +bIn.value; EXP.ctx = 2 ** +cIn.value;
      document.getElementById('ex-b').textContent = Math.max(1, Math.round(2 ** EXP.logb));
      document.getElementById('ex-c').textContent = EXP.ctx.toLocaleString() + ' tokens';
    };
    sec.addEventListener('input', () => { if (!touched) { touched = true; bump(9); } sync(); });
    sync();
    function frame(ms) {
      ctx = my; cw = w; ch = h;
      ctx.clearRect(0, 0, cw, ch);
      ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineWidth = 1;
      sRoofline(1, ms / 1000);
      ctx.restore();
      raf = visible ? requestAnimationFrame(frame) : 0;
    }
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { size(); if (!raf) raf = requestAnimationFrame(frame); } }).observe(sec);
    addEventListener('resize', size);
    document.fonts.ready.then(size);
  })();
})();

