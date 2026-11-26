// Random Dots stimulus generator (WP1).
// Deterministic: same (seed, count, params) -> identical dots. No generative AI involved.
//
// Algorithm id: "dart-throwing-min-distance/mulberry32/v1"
//   - PRNG: mulberry32 (32-bit seed)
//   - Candidate points are drawn uniformly in the margin-inset rectangle, rounded to 2 decimals,
//     and accepted only if their centre is >= minDist from every accepted centre
//     (random sequential addition = spatially uniform, no overlap, no extreme clusters).
//   - Sampling continues until EXACTLY `count` dots are accepted.
//
// Design choice (not from the brief's source article): minimum-distance sampling instead of pure
// complete spatial randomness. See DECISIONI.md D-12 (default, not yet confirmed by the facilitator).

export const ALGORITHM = 'dart-throwing-min-distance/mulberry32/v1';

export const DEFAULTS = Object.freeze({
  width: 1600,   // 16:9 logical canvas
  height: 900,
  margin: 40,    // dots stay at least this far from the border (centre-to-edge, radius excluded)
  radius: 8,     // identical for every dot
  minDist: 36,   // min centre-to-centre distance (>= 2*radius, so no overlap; gap = 20 px)
  maxAttemptsPerDot: 1000,
  maxAttemptsTotal: 2000000,  // hard cap so impossible requests fail fast
});

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (v) => Math.round(v * 100) / 100;

export function generateStimulus(seed, count, params = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('seed must be an integer in [0, 2^32-1]');
  }
  if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be a positive integer');
  const p = { ...DEFAULTS, ...params };
  if (p.minDist < 2 * p.radius) throw new RangeError('minDist must be >= 2*radius (no overlap)');

  const rand = mulberry32(seed);
  const x0 = p.margin, y0 = p.margin;
  const w = p.width - 2 * p.margin, h = p.height - 2 * p.margin;
  const cell = p.minDist / Math.SQRT2;
  const cols = Math.ceil(p.width / cell), rows = Math.ceil(p.height / cell);
  const grid = new Map();
  const dots = [];
  const min2 = p.minDist * p.minDist;
  let attempts = 0;
  const maxAttempts = Math.min(p.maxAttemptsPerDot * count, p.maxAttemptsTotal);

  const key = (cx, cy) => cy * cols + cx;
  const farEnough = (x, y) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    for (let j = Math.max(0, cy - 2); j <= Math.min(rows - 1, cy + 2); j++) {
      for (let i = Math.max(0, cx - 2); i <= Math.min(cols - 1, cx + 2); i++) {
        const idx = grid.get(key(i, j));
        if (idx === undefined) continue;
        for (const k of idx) {
          const dx = dots[k].x - x, dy = dots[k].y - y;
          if (dx * dx + dy * dy < min2) return false;
        }
      }
    }
    return true;
  };

  while (dots.length < count) {
    if (++attempts > maxAttempts) {
      throw new Error(`could not place ${count} dots with minDist=${p.minDist} (placed ${dots.length})`);
    }
    const x = round2(x0 + rand() * w);
    const y = round2(y0 + rand() * h);
    if (!farEnough(x, y)) continue;
    const k = key(Math.floor(x / cell), Math.floor(y / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(dots.length);
    dots.push({ x, y });
  }

  return {
    algorithm: ALGORITHM,
    seed,
    count,
    width: p.width,
    height: p.height,
    margin: p.margin,
    radius: p.radius,
    minDist: p.minDist,
    dots,
  };
}

// Independent O(n^2) check, deliberately NOT sharing code with the generator's spatial grid.
export function verifyStimulus(stim, expectedCount = stim.count) {
  const errors = [];
  const { dots, radius, width, height, margin, minDist } = stim;
  if (!Array.isArray(dots)) return { ok: false, errors: ['dots missing'] };
  if (dots.length !== expectedCount) errors.push(`count ${dots.length} != expected ${expectedCount}`);
  if (dots.length !== stim.count) errors.push(`count field ${stim.count} != dots.length ${dots.length}`);

  let minNN = Infinity, sumNN = 0;
  for (let i = 0; i < dots.length; i++) {
    const d = dots[i];
    if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) errors.push(`dot ${i} not finite`);
    if (d.x < margin || d.x > width - margin || d.y < margin || d.y > height - margin) {
      errors.push(`dot ${i} outside margin`);
    }
    let nn = Infinity;
    for (let j = 0; j < dots.length; j++) {
      if (i === j) continue;
      const dist = Math.hypot(dots[j].x - d.x, dots[j].y - d.y);
      if (dist < nn) nn = dist;
      if (j > i && dist < 2 * radius) errors.push(`dots ${i},${j} overlap (dist ${dist.toFixed(2)})`);
      if (j > i && dist < minDist - 1e-9) errors.push(`dots ${i},${j} closer than minDist`);
    }
    if (nn < minNN) minNN = nn;
    sumNN += nn;
  }
  const n = dots.length;
  const area = width * height;
  const meanNN = n > 1 ? sumNN / n : NaN;
  // Clark-Evans ratio R = observed mean NN distance / expected under complete spatial randomness.
  // R ~ 1 random, >1 more regular than random. Edge effects ignored: descriptive only.
  const clarkEvans = n > 1 ? meanNN / (0.5 * Math.sqrt(area / n)) : NaN;
  return {
    ok: errors.length === 0,
    errors,
    count: n,
    minNearestNeighbour: minNN,
    meanNearestNeighbour: meanNN,
    clarkEvansR: clarkEvans,
    inkCoverage: (n * Math.PI * radius * radius) / area,
  };
}

export function renderSvg(stim, { background = '#ffffff', fill = '#000000' } = {}) {
  const circles = stim.dots
    .map((d) => `<circle cx="${d.x}" cy="${d.y}" r="${stim.radius}"/>`)
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${stim.width} ${stim.height}" ` +
    `width="${stim.width}" height="${stim.height}">` +
    `<rect width="100%" height="100%" fill="${background}"/>` +
    `<g fill="${fill}">${circles}</g></svg>`
  );
}

// The candidate list (seeds + exact counts) is NOT in this file: it lives in local/candidates.json,
// which is git-ignored, because this module is published with the website (DECISIONI.md D-14).
// The facilitator enters the approved seed and count when creating a session.
