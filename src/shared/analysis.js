// Analysis formulas (WP5). Pure functions, no dependencies, no I/O.
//
// Conventions (DECISIONI.md D-13, defaults pending the facilitator's veto):
//   - SD is the SAMPLE standard deviation (n-1). Undefined (null) when n_valid < 2.
//   - Quartiles use linear interpolation between order statistics (Hyndman-Fan type 7:
//     numpy.percentile default, Excel QUARTILE.INC). IQR = Q3 - Q1.
//   - Errors are absolute and linear: |estimate - target|. No relative/log error (not requested).
//   - Missing values are never imputed. Every summary reports n_valid and n_missing.
//   - Improvement = initial_error - final_error (positive = closer to the target after discussion).
//   - The two group estimates are NOT independent observations: no inference is computed.

export const isMissing = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v));

export function validValues(values) {
  return values.filter((v) => typeof v === 'number' && Number.isFinite(v));
}

export function quantile7(sortedAsc, p) {
  const n = sortedAsc.length;
  if (n === 0) return null;
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sortedAsc[lo] + (h - lo) * (sortedAsc[hi] - sortedAsc[lo]);
}

export function mean(xs) {
  if (xs.length === 0) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function median(xs) {
  if (xs.length === 0) return null;
  return quantile7([...xs].sort((a, b) => a - b), 0.5);
}

export function sampleSd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  let ss = 0;
  for (const x of xs) ss += (x - m) * (x - m);
  return Math.sqrt(ss / (xs.length - 1));
}

/**
 * Descriptive summary of one set of estimates.
 * @param values   array of raw values (numbers or missing markers)
 * @param opts.target     true count (enables absolute errors of mean and median)
 * @param opts.expected   how many answers were expected (default: values.length)
 */
export function describe(values, { target = null, expected = values.length } = {}) {
  const xs = validValues(values);
  const sorted = [...xs].sort((a, b) => a - b);
  const n = xs.length;
  const q1 = quantile7(sorted, 0.25);
  const q3 = quantile7(sorted, 0.75);
  const m = mean(xs);
  const med = median(xs);
  const hasTarget = typeof target === 'number' && Number.isFinite(target);
  return {
    n_expected: expected,
    n_valid: n,
    n_missing: expected - n,
    mean: m,
    median: med,
    sd: sampleSd(xs),
    q1,
    q3,
    iqr: n === 0 ? null : q3 - q1,
    min: n === 0 ? null : sorted[0],
    max: n === 0 ? null : sorted[n - 1],
    abs_error_of_mean: hasTarget && m !== null ? Math.abs(m - target) : null,
    abs_error_of_median: hasTarget && med !== null ? Math.abs(med - target) : null,
  };
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function participantMetrics(p, target) {
  const initial = num(p.initial_estimate);
  const final = num(p.final_estimate);
  const initial_error = initial === null ? null : Math.abs(initial - target);
  const final_error = final === null ? null : Math.abs(final - target);
  const improvement = initial_error === null || final_error === null ? null : initial_error - final_error;
  return {
    participant_id: p.participant_id,
    group_id: p.group_id ?? null,
    initial_estimate: initial,
    final_estimate: final,
    initial_error,
    final_error,
    improvement,
  };
}

export function groupAnalysis(groupEstimates, target) {
  const one = (g) => {
    const e = num(groupEstimates?.[g]);
    return { estimate: e, abs_error: e === null ? null : Math.abs(e - target) };
  };
  const A = one('A');
  const B = one('B');
  const both = A.estimate !== null && B.estimate !== null;
  const meanOfGroups = both ? (A.estimate + B.estimate) / 2 : null;
  return {
    A,
    B,
    n_valid_groups: (A.estimate !== null ? 1 : 0) + (B.estimate !== null ? 1 : 0),
    mean_of_groups: meanOfGroups,
    abs_error_of_mean_of_groups: meanOfGroups === null ? null : Math.abs(meanOfGroups - target),
    note: 'The two group estimates are not independent observations; no inference is computed.',
  };
}

/**
 * Full session analysis.
 * @param participants  [{participant_id, group_id, initial_estimate, final_estimate}] one row per joined participant
 * @param groupEstimates {A: number|null, B: number|null}
 */
export function analyzeSession({ participants, groupEstimates, target }) {
  if (typeof target !== 'number' || !Number.isFinite(target)) throw new TypeError('target must be a finite number');
  const rows = participants.map((p) => participantMetrics(p, target));
  const expected = participants.length;
  const improvements = rows.map((r) => r.improvement).filter((v) => v !== null);
  return {
    target,
    n_participants: expected,
    initial: describe(participants.map((p) => p.initial_estimate), { target, expected }),
    final: describe(participants.map((p) => p.final_estimate), { target, expected }),
    paired: {
      n_pairs: improvements.length,
      n_improved: improvements.filter((v) => v > 0).length,
      n_worse: improvements.filter((v) => v < 0).length,
      n_unchanged: improvements.filter((v) => v === 0).length,
      mean_improvement: mean(improvements),
      median_improvement: median(improvements),
    },
    groups: groupAnalysis(groupEstimates, target),
    participants: rows,
  };
}
