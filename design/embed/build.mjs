// Embeds a curated vocabulary with a real sentence-embedding model, projects it to 3D with UMAP,
// and writes public/latent.json for the hero. Run: node build.mjs
import { pipeline } from '@huggingface/transformers';
import { UMAP } from 'umap-js';
import { writeFileSync } from 'node:fs';

const CATS = {
  colors: 'red orange yellow green blue purple violet indigo crimson scarlet teal turquoise magenta beige maroon navy lavender amber ivory charcoal',
  animals: 'dog cat horse lion tiger wolf fox bear rabbit deer elephant giraffe zebra monkey eagle owl dolphin whale shark penguin',
  food: 'bread cheese pasta pizza rice noodles dumpling sushi taco burrito salad soup steak bagel croissant pancake waffle curry ramen butter',
  fruit: 'apple banana orange mango peach pear plum cherry grape lemon lime melon kiwi papaya apricot fig coconut pineapple strawberry blueberry',
  cities: 'tokyo paris london berlin rome madrid lisbon seoul beijing shanghai mumbai cairo sydney toronto chicago boston seattle austin brooklyn manhattan',
  weather: 'rain snow storm thunder lightning fog mist hail drizzle breeze wind hurricane tornado blizzard sunshine cloudy humid frost heatwave monsoon',
  emotions: 'joy sadness anger fear surprise disgust love grief hope anxiety calm pride shame envy gratitude loneliness nostalgia awe boredom delight',
  music: 'guitar piano violin drums bass trumpet saxophone cello flute harp melody rhythm chord tempo symphony jazz blues opera techno hiphop',
  sports: 'soccer basketball baseball tennis golf hockey cricket rugby boxing wrestling swimming cycling marathon skiing surfing climbing volleyball fencing rowing sprint',
  body: 'heart lung brain liver kidney stomach spine skull bone muscle shoulder elbow wrist knee ankle finger thumb tongue eyebrow skin',
  space: 'planet star galaxy nebula comet asteroid meteor orbit moon sun mars jupiter saturn venus mercury neptune pluto cosmos telescope astronaut',
  vehicles: 'car truck bus train tram subway bicycle motorcycle scooter airplane helicopter rocket boat ship ferry yacht canoe submarine taxi tractor',
  code: 'function variable compiler debugger python javascript rust golang typescript kernel thread mutex pointer recursion algorithm database query server deploy git',
  inference: 'gpu tensor matrix attention transformer token embedding latency throughput batching quantization cache kernel cuda inference decoding prefill softmax logits sampling',
  numbers: 'one two three four five six seven eight nine ten eleven twelve twenty thirty hundred thousand million billion zero dozen',
  jobs: 'doctor nurse teacher lawyer engineer architect chef baker farmer pilot firefighter plumber electrician carpenter journalist painter scientist accountant dentist librarian',
};
const cats = Object.keys(CATS);
const seen = new Set();
const items = [];
cats.forEach((c, ci) => CATS[c].split(' ').forEach(w => { if (!seen.has(w)) { seen.add(w); items.push([w, ci]); } }));
console.log(`${items.length} words in ${cats.length} categories`);

const embed = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' });
const out = await embed(items.map(([w]) => w), { pooling: 'mean', normalize: true });
const vecs = out.tolist();

// seeded random so the layout is stable between runs
let s = 1234567;
const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
const umap = new UMAP({ nComponents: 3, nNeighbors: 14, minDist: 0.35, spread: 1.2, random });
const xyz = umap.fit(vecs);

// center and scale into the unit ball
const mean = [0, 1, 2].map(k => xyz.reduce((a, p) => a + p[k], 0) / xyz.length);
const centered = xyz.map(p => p.map((v, k) => v - mean[k]));
const maxR = Math.max(...centered.map(p => Math.hypot(...p)));
const pts = centered.map(p => p.map(v => +(v / maxR * 0.95).toFixed(3)));

// nearest neighbours in the original embedding space (cosine; vectors are normalised)
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const nn = vecs.map((v, i) => vecs.map((u, j) => [j, i === j ? -9 : dot(v, u)]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([j]) => j));

const words = items.map(([w, ci], i) => [w, ci, ...pts[i], nn[i]]);
writeFileSync(new URL('../../public/latent.json', import.meta.url), JSON.stringify({ model: 'all-MiniLM-L6-v2 → UMAP 3D', cats, words }));
console.log('wrote public/latent.json');
