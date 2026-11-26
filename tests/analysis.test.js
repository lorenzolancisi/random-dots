import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, participantMetrics, groupAnalysis, analyzeSession, quantile7, isMissing } from '../src/shared/analysis.js';

const close = (a, b, tol = 1e-9) => {
  if (a === null || b === null) return assert.equal(a, b);
  assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
};

test('hand-computed: odd n=5 [150,180,200,220,250], target 197', () => {
  const d = describe([150, 180, 200, 220, 250], { target: 197 });
  assert.equal(d.n_valid, 5);
  assert.equal(d.n_missing, 0);
  close(d.mean, 200);
  close(d.median, 200);
  close(d.sd, Math.sqrt(1450)); // (2500+400+0+400+2500)/4
  close(d.q1, 180);
  close(d.q3, 220);
  close(d.iqr, 40);
  close(d.abs_error_of_mean, 3);
  close(d.abs_error_of_median, 3);
  assert.equal(d.min, 150);
  assert.equal(d.max, 250);
});

test('hand-computed: even n=4 [10,20,30,40] (type-7 quartiles interpolate)', () => {
  const d = describe([10, 20, 30, 40]);
  close(d.mean, 25);
  close(d.median, 25);
  close(d.q1, 17.5); // h = 3*0.25 = 0.75 -> 10 + 0.75*10
  close(d.q3, 32.5); // h = 3*0.75 = 2.25 -> 30 + 0.25*10
  close(d.iqr, 15);
  close(d.sd, Math.sqrt(500 / 3));
  assert.equal(d.abs_error_of_mean, null); // no target given
});

test('missing values are counted, never imputed', () => {
  const d = describe([100, null, 300, NaN, '', undefined], { target: 250 });
  assert.equal(d.n_expected, 6);
  assert.equal(d.n_valid, 2);
  assert.equal(d.n_missing, 4);
  close(d.mean, 200);
  close(d.abs_error_of_mean, 50);
});

test('empty and single-value sets', () => {
  const e = describe([null, null], { target: 200 });
  assert.equal(e.n_valid, 0);
  assert.equal(e.n_missing, 2);
  for (const k of ['mean', 'median', 'sd', 'q1', 'q3', 'iqr', 'min', 'max', 'abs_error_of_mean']) assert.equal(e[k], null, k);
  const one = describe([210], { target: 197 });
  assert.equal(one.n_valid, 1);
  assert.equal(one.sd, null); // undefined with n=1
  close(one.mean, 210);
  close(one.abs_error_of_mean, 13);
});

test('expected > values.length counts non-responders as missing', () => {
  const d = describe([100, 200], { expected: 10 });
  assert.equal(d.n_missing, 8);
});

test('does not mutate its input', () => {
  const xs = [5, 3, 9, 1];
  describe(xs);
  assert.deepEqual(xs, [5, 3, 9, 1]);
});

test('participant metrics: improvement positive = closer to target', () => {
  const better = participantMetrics({ participant_id: 'p1', group_id: 'A', initial_estimate: 150, final_estimate: 190 }, 200);
  assert.equal(better.initial_error, 50);
  assert.equal(better.final_error, 10);
  assert.equal(better.improvement, 40);
  const worse = participantMetrics({ participant_id: 'p2', initial_estimate: 205, final_estimate: 230 }, 200);
  assert.equal(worse.improvement, -25);
  const noFinal = participantMetrics({ participant_id: 'p3', initial_estimate: 205, final_estimate: null }, 200);
  assert.equal(noFinal.final_error, null);
  assert.equal(noFinal.improvement, null);
  const same = participantMetrics({ participant_id: 'p4', initial_estimate: 190, final_estimate: 210 }, 200);
  assert.equal(same.improvement, 0);
});

test('group analysis: errors of A, B and of their mean', () => {
  const g = groupAnalysis({ A: 190, B: 210 }, 197);
  assert.equal(g.A.abs_error, 7);
  assert.equal(g.B.abs_error, 13);
  assert.equal(g.mean_of_groups, 200);
  assert.equal(g.abs_error_of_mean_of_groups, 3);
  assert.equal(g.n_valid_groups, 2);
  const missing = groupAnalysis({ A: 190, B: null }, 197);
  assert.equal(missing.mean_of_groups, null);
  assert.equal(missing.abs_error_of_mean_of_groups, null);
  assert.equal(missing.n_valid_groups, 1);
  assert.equal(groupAnalysis({}, 197).n_valid_groups, 0);
});

test('full session with a missing final and a missing initial', () => {
  const participants = [
    { participant_id: 'p1', group_id: 'A', initial_estimate: 150, final_estimate: 190 }, // 47-7 = +40
    { participant_id: 'p2', group_id: 'A', initial_estimate: 250, final_estimate: 210 }, // 53-13 = +40
    { participant_id: 'p3', group_id: 'B', initial_estimate: 205, final_estimate: 230 }, // 8-33 = -25
    { participant_id: 'p4', group_id: 'B', initial_estimate: 180, final_estimate: null }, // no pair
    { participant_id: 'p5', group_id: 'B', initial_estimate: null, final_estimate: 200 }, // no pair
  ];
  const r = analyzeSession({ participants, groupEstimates: { A: 195, B: 215 }, target: 197 });
  assert.equal(r.n_participants, 5);
  assert.equal(r.initial.n_valid, 4);
  assert.equal(r.initial.n_missing, 1);
  assert.equal(r.final.n_valid, 4);
  assert.equal(r.final.n_missing, 1);
  close(r.initial.mean, (150 + 250 + 205 + 180) / 4);
  assert.equal(r.paired.n_pairs, 3);
  assert.equal(r.paired.n_improved, 2);
  assert.equal(r.paired.n_worse, 1);
  close(r.paired.mean_improvement, (40 + 40 - 25) / 3);
  assert.equal(r.paired.median_improvement, 40);
  assert.equal(r.groups.mean_of_groups, 205);
  assert.equal(r.groups.abs_error_of_mean_of_groups, 8);
  assert.equal(r.participants.length, 5);
  // group estimates must never be duplicated into individual records
  for (const row of r.participants) assert.ok(!('group_estimate' in row));
  assert.throws(() => analyzeSession({ participants, groupEstimates: {}, target: NaN }));
});

test('isMissing', () => {
  for (const v of [null, undefined, '', NaN, Infinity]) assert.ok(isMissing(v));
  for (const v of [0, 1, 197]) assert.ok(!isMissing(v));
});

test('quantile7 edge cases', () => {
  assert.equal(quantile7([], 0.5), null);
  assert.equal(quantile7([7], 0.25), 7);
  assert.equal(quantile7([1, 2], 0), 1);
  assert.equal(quantile7([1, 2], 1), 2);
});

test('cross-check against numpy on 159 independent datasets (n=1..100)', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/numpy_crosscheck.json', import.meta.url), 'utf8'));
  assert.equal(fx.cases.length, 159);
  for (const c of fx.cases) {
    const d = describe(c.values, { target: c.target });
    close(d.mean, c.mean, 1e-9);
    close(d.median, c.median, 1e-9);
    close(d.sd, c.sd, 1e-9);
    close(d.q1, c.q1, 1e-9);
    close(d.q3, c.q3, 1e-9);
    close(d.abs_error_of_mean, c.abs_error_of_mean, 1e-9);
    close(d.abs_error_of_median, c.abs_error_of_median, 1e-9);
  }
});
