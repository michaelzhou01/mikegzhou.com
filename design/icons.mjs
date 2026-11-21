// Generates the site's icons: a dot-matrix sphere (a miniature of the hero's latent space) with one lit lime cluster.
//   public/icon.svg      detailed mark, rounded tile (manifest "any", social, large sizes)
//   public/favicon.svg   simplified mark tuned for 16–32px browser tabs
//   design/icon-full.svg full-bleed tile (iOS home screen and maskable icons, where the OS rounds the corners)
// Run: node design/icons.mjs   then render PNGs with design/render-icons.sh
import { writeFileSync } from 'node:fs';

const BG0 = '#17171a', BG1 = '#0a0a0b', FG = '#ecebe6', LIME = '#d4ff3a', CYAN = '#6ae3ff';
const f = n => +n.toFixed(2);

// light direction for the lit cluster (front, upper right)
const LIT = norm([0.55, 0.5, 0.67]);
const CY = norm([-0.6, -0.35, 0.72]);
function norm(v) { const l = Math.hypot(...v); return v.map(x => x / l); }
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function sphereDots(n, R, cx, cy, rMin, rMax) {
  // Fibonacci sphere, tilted, orthographic projection; only the front hemisphere is drawn
  const out = [], ga = Math.PI * (3 - Math.sqrt(5)), tilt = 0.42;
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i;
    let p = [Math.cos(th) * r, y, Math.sin(th) * r];
    p = [p[0], p[1] * Math.cos(tilt) - p[2] * Math.sin(tilt), p[1] * Math.sin(tilt) + p[2] * Math.cos(tilt)];
    if (p[2] < -0.05) continue;
    const depth = (p[2] + 0.05) / 1.05;               // 0 at the limb, 1 facing you
    const lit = Math.max(0, dot(p, LIT)), cyan = Math.max(0, dot(p, CY));
    out.push({ x: cx + p[0] * R, y: cy - p[1] * R, r: rMin + (rMax - rMin) * Math.sqrt(depth), depth, lit, cyan });
  }
  return out;
}

function mark({ size, R, n, rMin, rMax, tile, glow }) {
  const c = size / 2;
  const dots = sphereDots(n, R, c, c, rMin, rMax);
  const lime = [], cyan = [], plain = [];
  for (const d of dots) {
    if (d.lit > 0.93) lime.push(d);
    else if (d.cyan > 0.95) cyan.push(d);
    else plain.push(d);
  }
  const circ = (d, fill, op) => `<circle cx="${f(d.x)}" cy="${f(d.y)}" r="${f(d.r)}" fill="${fill}"${op < 1 ? ` fill-opacity="${f(op)}"` : ''}/>`;
  // centre the glow on the lit cluster itself
  const gx = lime.reduce((a, d) => a + d.x, 0) / lime.length, gy = lime.reduce((a, d) => a + d.y, 0) / lime.length;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="38%" cy="30%" r="85%"><stop offset="0" stop-color="${BG0}"/><stop offset="1" stop-color="${BG1}"/></radialGradient>
    <radialGradient id="glow" cx="${f(gx)}" cy="${f(gy)}" r="${f(R * 0.75)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${LIME}" stop-opacity="${glow}"/><stop offset="1" stop-color="${LIME}" stop-opacity="0"/></radialGradient>
  </defs>
  ${tile === 'rounded'
    ? `<rect width="${size}" height="${size}" rx="${f(size * 0.225)}" fill="url(#bg)"/>
  <rect x="${f(size * 0.004)}" y="${f(size * 0.004)}" width="${f(size * 0.992)}" height="${f(size * 0.992)}" rx="${f(size * 0.222)}" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="${f(size * 0.006)}"/>`
    : `<rect width="${size}" height="${size}" fill="url(#bg)"/>`}
  <circle cx="${f(gx)}" cy="${f(gy)}" r="${f(R * 0.75)}" fill="url(#glow)"/>
  <g>${plain.map(d => circ(d, FG, 0.18 + 0.72 * d.depth ** 1.4)).join('')}</g>
  <g>${cyan.map(d => circ(d, CYAN, 0.9)).join('')}</g>
  <g>${lime.map(d => circ(d, LIME, 1)).join('')}</g>
</svg>
`;
}

// tiny version: few, large dots so it survives 16px; one lime dot, no cyan
function favicon() {
  const S = 32, c = 16, R = 10.5;
  const dots = sphereDots(30, R, c, c, 0.95, 2.05);
  let best = dots[0];
  for (const d of dots) if (d.lit > best.lit) best = d;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">
  <rect width="32" height="32" rx="7.5" fill="${BG1}"/>
  ${dots.filter(d => d !== best).map(d => `<circle cx="${f(d.x)}" cy="${f(d.y)}" r="${f(d.r)}" fill="${FG}" fill-opacity="${f(0.3 + 0.7 * d.depth ** 1.3)}"/>`).join('')}
  <circle cx="${f(best.x)}" cy="${f(best.y)}" r="3.4" fill="${LIME}" fill-opacity=".22"/>
  <circle cx="${f(best.x)}" cy="${f(best.y)}" r="2.3" fill="${LIME}"/>
</svg>
`;
}

const root = new URL('..', import.meta.url);
writeFileSync(new URL('public/icon.svg', root), mark({ size: 512, R: 168, n: 520, rMin: 2.2, rMax: 7.2, tile: 'rounded', glow: 0.32 }));
writeFileSync(new URL('design/icon-full.svg', root), mark({ size: 512, R: 150, n: 520, rMin: 2.0, rMax: 6.6, tile: 'square', glow: 0.32 }));
writeFileSync(new URL('public/favicon.svg', root), favicon());
console.log('wrote public/icon.svg, public/favicon.svg, design/icon-full.svg');
