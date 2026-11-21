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
     speculative decoding
     ===================================================================== */
  const SCTX = 'Sunlight scatters off air molecules, and';
  const DRAFT = [' blue', ' light', ' scatters', ' less', ' slowly'];
  const ACC = 3, FIX = ' the';

  function chipRow(items, y, fs, gap = 10) {
    font(fs);
    const pad = fs * 0.55;
    const ws = items.map(s => ctx.measureText(s.trim()).width + pad * 2);
    const total = ws.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
    let x = (cw - total) / 2;
    return items.map((s, i) => { const r = { x, y, w: ws[i], h: fs * 2, s: s.trim(), pad }; x += ws[i] + gap; return r; });
  }
  function chip(c, { stroke, fill, text = C.fg, dash } = {}) {
    box(c.x, c.y - c.h / 2, c.w, c.h, 7);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { if (dash) ctx.setLineDash(dash); ctx.strokeStyle = stroke; ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = text; ctx.textBaseline = 'middle'; ctx.fillText(c.s, c.x + c.pad, c.y);
  }
  function specHeader(fs) {
    let f = fs; font(f); while (ctx.measureText(SCTX + ' …').width > cw * 0.9 && f > 9) font(--f);
    ctx.fillStyle = C.mute; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(SCTX + ' …', cw / 2, ch * 0.2);
    font(10); ctx.fillStyle = C.dim; ctx.fillText('context so far', cw / 2, ch * 0.2 - 24);
    ctx.textAlign = 'left';
  }
  const specFs = () => clamp(cw * 0.034, 12, 24);

  function sDraft(lp, t) {
    const fs = specFs(); specHeader(fs);
    const row = chipRow(DRAFT, ch * 0.46, fs);
    const shown = Math.min(DRAFT.length, Math.floor(clamp(lp * 1.4) * (DRAFT.length + 1)));
    row.forEach((c, i) => {
      if (i >= shown) { box(c.x, c.y - c.h / 2, c.w, c.h, 7); ctx.strokeStyle = C.faint; ctx.stroke(); return; }
      const a = i === shown - 1 ? clamp((lp * 1.4 * (DRAFT.length + 1) - i)) : 1;
      ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - a) * -12);
      chip(c, { stroke: cyan(.85), fill: cyan(.06), dash: [4, 3] });
      ctx.restore();
    });
    // draft model ticks
    font(11); ctx.fillStyle = C.cyan; ctx.textAlign = 'center';
    ctx.fillText(`draft model · ${shown}/${DRAFT.length} guesses`, cw / 2, ch * 0.46 + fs * 2.4);
    ctx.textAlign = 'left';
    const bx = (cw - 5 * 34) / 2, by = ch * 0.72;
    for (let i = 0; i < 5; i++) { ctx.fillStyle = i < shown ? cyan(.8) : C.faint; ctx.fillRect(bx + i * 34, by, 28, 8); }
    font(10); ctx.fillStyle = C.mute; ctx.textAlign = 'center';
    ctx.fillText('~3 ms per draft step', cw / 2, by + 26); ctx.textAlign = 'left';
  }

  function sVerify(lp, t) {
    const fs = specFs(); specHeader(fs);
    const row = chipRow(DRAFT, ch * 0.46, fs);
    const s = clamp(lp * 1.5);
    const x0 = row[0].x, x1 = row[row.length - 1].x + row[row.length - 1].w;
    // the single target pass sweeping across
    const sx = x0 + (x1 - x0) * s;
    const g = ctx.createLinearGradient(sx - 80, 0, sx, 0);
    g.addColorStop(0, lime(0)); g.addColorStop(1, lime(.22));
    ctx.fillStyle = g; ctx.fillRect(sx - 80, row[0].y - fs * 1.6, 80, fs * 3.2);
    ctx.fillStyle = C.lime; ctx.fillRect(sx, row[0].y - fs * 1.6, 2, fs * 3.2);
    row.forEach((c, i) => {
      const done = s > (i + 0.6) / row.length;
      if (!done) { chip(c, { stroke: cyan(.6), dash: [4, 3] }); return; }
      if (i < ACC) chip(c, { stroke: lime(.9), fill: lime(.12) });
      else if (i === ACC) {
        chip(c, { stroke: coral(.9), fill: coral(.08), text: C.mute });
        ctx.strokeStyle = coral(.9); ctx.beginPath(); ctx.moveTo(c.x + 6, c.y); ctx.lineTo(c.x + c.w - 6, c.y); ctx.stroke();
        const fx = chipRow([FIX], 0, fs)[0];
        chip({ ...fx, x: c.x + (c.w - fx.w) / 2, y: c.y + fs * 2.7 }, { fill: C.lime, text: '#0a0a0b' });
      } else { ctx.save(); ctx.globalAlpha *= 0.3; chip(c, { stroke: C.dim, text: C.mute }); ctx.restore(); }
      font(fs); ctx.textAlign = 'center';
      ctx.fillStyle = i < ACC ? C.lime : i === ACC ? coral(1) : C.dim;
      ctx.fillText(i < ACC ? '✓' : i === ACC ? '✗' : '–', c.x + c.w / 2, c.y - fs * 1.9);
      ctx.textAlign = 'left';
    });
    // bracket: one pass over all five
    const by = ch * 0.46 + fs * 4.6;
    ctx.strokeStyle = lime(.6);
    ctx.beginPath(); ctx.moveTo(x0, by - 6); ctx.lineTo(x0, by); ctx.lineTo(x1, by); ctx.lineTo(x1, by - 6); ctx.stroke();
    font(11); ctx.fillStyle = C.lime; ctx.textAlign = 'center';
    ctx.fillText('target model · one forward pass over all five', (x0 + x1) / 2, by + 20);
    ctx.textAlign = 'left';
  }

  function sCommit(lp, t) {
    const fs = specFs(); specHeader(fs);
    const e = ease(lp * 2.2);
    const keep = [...DRAFT.slice(0, ACC), FIX];
    const row = chipRow(keep, ch * 0.4, fs);
    row.forEach((c, i) => chip(c, i === ACC ? { fill: C.lime, text: '#0a0a0b' } : { stroke: lime(.9), fill: lime(.14) }));
    // rejected drafts fall away
    const rej = chipRow(DRAFT.slice(ACC), ch * 0.4 + fs * 2.6 + e * 40, fs);
    ctx.save(); ctx.globalAlpha *= 1 - e; rej.forEach(c => chip(c, { stroke: coral(.7), text: C.mute })); ctx.restore();
    font(11); ctx.fillStyle = C.lime; ctx.textAlign = 'center';
    ctx.fillText('+4 tokens from 1 target pass', cw / 2, ch * 0.4 - fs * 2);
    ctx.textAlign = 'left';
    // timeline comparison
    const m = 28, full = cw - m * 2, scale = full / 130, grow = clamp((lp - 0.15) * 2);
    const rowY = [ch * 0.66, ch * 0.66 + 54];
    font(11);
    ctx.fillStyle = C.mute; ctx.fillText('standard decode', m, rowY[0] - 12);
    for (let i = 0; i < 4; i++) { const w = 30 * scale * grow; ctx.fillStyle = i % 2 ? '#3a3a42' : '#4a4a52'; ctx.fillRect(m + i * 30 * scale * grow, rowY[0], w - 2, 14); }
    ctx.fillStyle = C.mute; ctx.fillText('speculative', m, rowY[1] - 12);
    let x = m;
    for (let i = 0; i < 5; i++) { const w = 3 * scale * grow; ctx.fillStyle = cyan(.85); ctx.fillRect(x, rowY[1], Math.max(0, w - 2), 14); x += w; }
    ctx.fillStyle = C.lime; ctx.fillRect(x, rowY[1], Math.max(0, 30 * scale * grow - 2), 14);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.mute; ctx.fillText(`4 tokens · ${Math.round(120 * grow)} ms`, cw - m, rowY[0] - 12);
    ctx.fillStyle = C.lime; ctx.fillText(`4 tokens · ${Math.round(45 * grow)} ms${grow >= 1 ? '  →  ~2.7× here' : ''}`, cw - m, rowY[1] - 12);
    ctx.textAlign = 'left';
  }

  /* =====================================================================
     quantization
     ===================================================================== */
  const normal = r => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283 * r()); };
  const QR = 12, QC = 24;
  const QW = (() => { const r = rng(11); return Array.from({ length: QR * QC }, () => normal(r) * 0.95); })();
  const HIST = (() => { const r = rng(23), b = new Array(72).fill(0); for (let i = 0; i < 6000; i++) { const v = normal(r) * 0.95, k = Math.floor((v + 3) / 6 * 72); if (k >= 0 && k < 72) b[k]++; } return b; })();
  const QS = [
    { bits: 16, name: 'bf16', levels: 0, gb: 140 },
    { bits: 8, name: 'fp8', levels: 40, gb: 70 },
    { bits: 4, name: 'int4', levels: 16, gb: 35 },
  ];
  const qz = (w, L) => { if (!L) return w; const step = 6 / (L - 1); return Math.round((clamp(w, -3, 3) + 3) / step) * step - 3; };

  const quantStage = si => (lp, t) => {
    const cur = QS[si], prev = QS[Math.max(0, si - 1)];
    const m = si === 0 ? 1 : ease(lp * 2.4);
    const pad = cw < 500 ? 16 : 28;
    // header: big bit count + memory bar
    const big = clamp(cw * 0.09, 40, 84);
    font(big, SERIF, 'italic'); ctx.textBaseline = 'alphabetic'; ctx.fillStyle = C.fg;
    const label = `${cur.bits} bits`;
    ctx.fillText(label, pad, pad + big * 0.8);
    const lw = ctx.measureText(label).width;
    font(11); ctx.fillStyle = C.lime; ctx.fillText(cur.name, pad + lw + 12, pad + big * 0.8);
    const gb = prev.gb + (cur.gb - prev.gb) * m;
    const barY = pad + big + 18, barW = cw - pad * 2, scaleGB = barW / 160;
    ctx.fillStyle = C.faint; ctx.fillRect(pad, barY, barW, 12);
    ctx.fillStyle = gb <= 80 ? C.lime : coral(.9); ctx.fillRect(pad, barY, gb * scaleGB, 12);
    const gx = pad + 80 * scaleGB;
    ctx.strokeStyle = C.fg; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(gx, barY - 6); ctx.lineTo(gx, barY + 18); ctx.stroke(); ctx.setLineDash([]);
    font(10); ctx.textBaseline = 'middle';
    ctx.fillStyle = C.mute; ctx.fillText('80 GB · one GPU', gx + 6, barY + 26);
    ctx.fillStyle = gb <= 80 ? C.lime : coral(1); ctx.fillText(`${Math.round(gb)} GB · 70B params`, pad, barY + 26);
    // weight matrix
    const histH = Math.max(60, ch * 0.18);
    const top = barY + 70, bottom = ch - histH - 44;
    const cell = Math.min((cw - pad * 2) / QC, (bottom - top) / QR);
    const mx = (cw - cell * QC) / 2;
    for (let r = 0; r < QR; r++) for (let c = 0; c < QC; c++) {
      const w = QW[r * QC + c];
      const v = qz(w, prev.levels) + (qz(w, cur.levels) - qz(w, prev.levels)) * m;
      const a = Math.min(1, Math.abs(v) / 2.2) * 0.92 + 0.04;
      ctx.fillStyle = v >= 0 ? lime(a) : cyan(a);
      ctx.fillRect(mx + c * cell + 1, top + r * cell + 1, cell - 2, cell - 2);
    }
    font(10); ctx.fillStyle = C.dim; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`W[${QR}×${QC}] · lime > 0 > cyan`, mx, top - 8);
    // histogram + quantization levels
    const hy = ch - 30, hx = pad, hw = cw - pad * 2, bw = hw / HIST.length, maxH = Math.max(...HIST);
    HIST.forEach((n, i) => { ctx.fillStyle = '#34343a'; const h = (n / maxH) * histH; ctx.fillRect(hx + i * bw + 0.5, hy - h, bw - 1, h); });
    const lines = (L, alpha) => {
      if (!L || alpha <= 0) return;
      ctx.strokeStyle = lime(alpha * (L > 20 ? 0.35 : 0.85));
      for (let i = 0; i < L; i++) { const x = hx + (i / (L - 1)) * hw; ctx.beginPath(); ctx.moveTo(x, hy - histH - 6); ctx.lineTo(x, hy + 4); ctx.stroke(); }
    };
    lines(prev.levels, si === 0 ? 0 : 1 - m); lines(cur.levels, m);
    font(10); ctx.fillStyle = C.mute;
    ctx.fillText(cur.levels ? `weight distribution · ${cur.name === 'fp8' ? 'coarser grid' : '16 levels'}` : 'weight distribution · ~continuous', hx, hy + 18);
  };

  /* =====================================================================
     mounting: each section pins, tracks scroll progress, and draws
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
    spec: [sDraft, sVerify, sCommit],
    quant: [quantStage(0), quantStage(1), quantStage(2)],
  };
  document.querySelectorAll('[data-story]').forEach(sec => mount(sec, SETS[sec.dataset.story]));
})();
