import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateStimulus, verifyStimulus, renderSvg, mulberry32, DEFAULTS } from '../src/shared/stimulus.js';
import { loadCandidates } from '../tools/candidates.js';

// Private candidate list (git-ignored). On a clone without it, candidate-specific tests are skipped.
const CANDIDATES = loadCandidates() ?? [];
const NO_CANDIDATES = CANDIDATES.length === 0 && 'local/candidates.json not present (private file)';

const hash = (s) => createHash('sha256').update(JSON.stringify(s.dots)).digest('hex');

test('PRNG is deterministic and in [0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test('same seed + count => identical dots; different seed => different dots', () => {
  const s1 = generateStimulus(123, 200);
  const s2 = generateStimulus(123, 200);
  const s3 = generateStimulus(124, 200);
  assert.equal(hash(s1), hash(s2));
  assert.notEqual(hash(s1), hash(s3));
});

for (const c of CANDIDATES) {
  test(`candidate ${c.id}: exactly ${c.count} dots, no overlap, inside bounds`, { skip: NO_CANDIDATES }, () => {
    const s = generateStimulus(c.seed, c.count);
    assert.equal(s.dots.length, c.count);
    const r = verifyStimulus(s, c.count);
    assert.deepEqual(r.errors, []);
    assert.ok(r.ok);
    assert.ok(r.minNearestNeighbour >= DEFAULTS.minDist);
    // SVG contains exactly count circles
    const svg = renderSvg(s);
    assert.equal((svg.match(/<circle /g) || []).length, c.count);
    // all radii identical
    assert.equal(new Set(s.dots.map(() => s.radius)).size, 1);
  });

  test(`candidate ${c.id}: is a count between 180 and 220 and not a round number`, { skip: NO_CANDIDATES }, () => {
    assert.ok(c.count >= 180 && c.count <= 220);
    assert.notEqual(c.count % 10, 0);
    assert.notEqual(c.count % 5, 0);
  });
}

test('candidates are reproducible: dots match pinned SHA-256 prefixes (regression guard)', { skip: NO_CANDIDATES }, () => {
  // Fails if the algorithm, PRNG or parameters ever change: a stimulus shown to participants
  // must always be regenerable from its seed. Pinned values live in local/candidates.json.
  assert.equal(CANDIDATES.length, 3);
  for (const c of CANDIDATES) {
    assert.equal(hash(generateStimulus(c.seed, c.count)).slice(0, 16), c.sha256_prefix, `candidate ${c.id}`);
  }
});

test('verifyStimulus catches a wrong count, an overlap and an out-of-bounds dot', () => {
  const s = generateStimulus(7, 50);
  assert.equal(verifyStimulus(s, 51).ok, false);

  const overlap = structuredClone(s);
  overlap.dots[1] = { x: overlap.dots[0].x + 5, y: overlap.dots[0].y };
  assert.equal(verifyStimulus(overlap).ok, false);

  const oob = structuredClone(s);
  oob.dots[0] = { x: 5, y: 5 };
  assert.equal(verifyStimulus(oob).ok, false);

  const dropped = structuredClone(s);
  dropped.dots.pop();
  assert.equal(verifyStimulus(dropped).ok, false);
});

test('generator rejects impossible parameters', () => {
  assert.throws(() => generateStimulus(1, 0));
  assert.throws(() => generateStimulus(-1, 10));
  assert.throws(() => generateStimulus(1, 10, { minDist: 10, radius: 8 }));
  assert.throws(() => generateStimulus(1, 100000));
});

test('spatial uniformity: Clark-Evans R is above random (>1) for all candidates and similar across them', { skip: NO_CANDIDATES }, () => {
  const rs = CANDIDATES.map((c) => verifyStimulus(generateStimulus(c.seed, c.count)).clarkEvansR);
  for (const r of rs) assert.ok(r > 1.0 && r < 1.6, `R=${r}`);
});
