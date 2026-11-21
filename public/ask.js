// "Ask your own question": tokenizes a visitor's prompt with a real tokenizer and, if they opt in,
// generates an answer with a small model running on their own GPU (WebGPU via transformers.js).
(() => {
  const TF = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';
  const MODEL = 'HuggingFaceTB/SmolLM2-135M-Instruct';
  const form = document.getElementById('ask');
  if (!form) return;
  const input = document.getElementById('ask-input');
  const realBox = document.getElementById('ask-real');
  const status = document.getElementById('ask-status');
  const section = document.getElementById('anatomy');
  const say = html => { status.innerHTML = html; };

  let lib, tokenizer, generator, busy = false;
  const loadLib = async () => (lib ||= await import(TF));
  async function getTokenizer() {
    if (tokenizer) return tokenizer;
    say('loading tokenizer…');
    const { AutoTokenizer } = await loadLib();
    return (tokenizer = await AutoTokenizer.from_pretrained(MODEL));
  }
  async function getGenerator() {
    if (generator) return generator;
    if (!navigator.gpu) throw new Error('your browser has no WebGPU, so the real model can’t run here');
    const { pipeline } = await loadLib();
    const files = {};
    generator = await pipeline('text-generation', MODEL, {
      device: 'webgpu', dtype: 'q4f16',
      progress_callback: p => {
        if (p.status !== 'progress' || !p.total) return;
        files[p.file] = [p.loaded, p.total];
        const [L, T] = Object.values(files).reduce(([a, b], [l, t]) => [a + l, b + t], [0, 0]);
        say(`downloading model · ${Math.round((L / T) * 100)}% · ${(L / 1e6).toFixed(0)} / ${(T / 1e6).toFixed(0)} MB`);
      },
    });
    return generator;
  }

  // scroll through the anatomy section so the request visibly flows stage by stage
  let playing = 0;
  function play() {
    const start = section.offsetTop, end = start + section.offsetHeight - innerHeight;
    const from = scrollY < start - innerHeight * 0.5 || scrollY > end ? start : scrollY;
    const dur = 11000 * ((end - from) / Math.max(1, end - start));
    const t0 = performance.now(), id = ++playing;
    const stop = () => { playing++; removeEventListener('wheel', stop); removeEventListener('touchstart', stop); removeEventListener('keydown', stop); };
    addEventListener('wheel', stop, { passive: true }); addEventListener('touchstart', stop, { passive: true }); addEventListener('keydown', stop);
    document.documentElement.style.scrollBehavior = 'auto';
    (function step(now) {
      if (id !== playing) return;
      const k = Math.min(1, (now - t0) / dur);
      scrollTo(0, from + (end - from) * k);
      if (k < 1) requestAnimationFrame(step); else { stop(); document.documentElement.style.scrollBehavior = ''; }
    })(t0);
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q || busy) return;
    busy = true; form.classList.add('busy');
    try {
      const tk = await getTokenizer();
      const ids = tk.encode(q, { add_special_tokens: false });
      const toks = ids.map(id => [tk.decode([id]), id]);
      const real = realBox.checked;
      window.MZ.setRequest({ prompt: q, toks, out: [], real: null, pending: !real });
      window.MZ.bump(ids.length);
      say(`${ids.length} tokens · smollm2 tokenizer${real ? '' : ' · tick the box to also generate'}`);
      if (!real) { play(); return; }

      const gen = await getGenerator();
      const { TextStreamer } = lib;
      const out = [];
      let t0 = 0, first = 0, n = 0;
      const update = done => {
        const tps = n > 1 && first ? ((n - 1) / ((performance.now() - first) / 1000)).toFixed(0) : '—';
        window.MZ.setRequest({ out: [...out], real: { ttft: Math.round(first - t0), tps, tokens: n, device: 'webgpu', done } });
      };
      const streamer = new TextStreamer(gen.tokenizer, {
        skip_prompt: true, skip_special_tokens: true,
        token_callback_function: () => { if (!first) first = performance.now(); n++; window.MZ.bump(1); },
        callback_function: text => { if (text) { out.push(text); update(false); say(`generating · ${n} tokens`); } },
      });
      say('warming up the GPU…');
      play();
      t0 = performance.now();
      await gen([{ role: 'user', content: q }], { max_new_tokens: 64, do_sample: false, streamer });
      update(true);
      const r = (window.MZ.lastReal = { ttft: Math.round(first - t0), tps: ((n - 1) / ((performance.now() - first) / 1000)).toFixed(0) });
      say(`done · ttft ${r.ttft}ms · ${r.tps} tok/s · ${n} tokens · on your gpu`);
    } catch (err) {
      console.warn(err);
      say(`<span class="err">${err.message || err}</span>`);
    } finally {
      busy = false; form.classList.remove('busy');
    }
  });

  // let the command palette focus this box
  window.MZ.focusAsk = () => { section.scrollIntoView({ behavior: 'smooth' }); setTimeout(() => input.focus(), 600); };
})();
