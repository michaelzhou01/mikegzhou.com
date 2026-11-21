// Serves the static site, plus /api/tokens: one global counter of "tokens generated on this page",
// shared by every visitor and stored in a single Durable Object.
import { DurableObject } from 'cloudflare:workers';

export class TokenCounter extends DurableObject {
  async get() {
    return (await this.ctx.storage.get('total')) ?? 0;
  }
  async add(n) {
    const total = (await this.get()) + n;
    await this.ctx.storage.put('total', total);
    return total;
  }
}

const MAX_PER_REQUEST = 5000; // the client batches every few seconds; anything larger is someone poking the API
const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/tokens') return env.ASSETS.fetch(request);

    const counter = env.COUNTER.get(env.COUNTER.idFromName('global'));
    if (request.method === 'GET') return json({ total: await counter.get() });
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

    let n = 0;
    try { n = Math.floor(Number((await request.json()).n)); } catch {}
    if (!Number.isFinite(n) || n <= 0) return json({ error: 'n must be a positive number' }, 400);
    return json({ total: await counter.add(Math.min(n, MAX_PER_REQUEST)) });
  },
};
