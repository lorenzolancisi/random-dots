// CSV exports (WP6). Pure functions. Brief: participants.csv, group_estimates.csv, session_summary.csv;
// group estimates never duplicated into participant rows; spokesperson identity never exported (D-07).
import { analyzeSession } from './analysis.js';

const esc = (v) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';

const iso = (ms) => (typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : '');

/**
 * Anonymous, per-session pseudonyms P01, P02… ordered by join time (ties: by uid).
 * Firebase uids are NOT exported.
 */
export function pseudonyms(participants) {
  const sorted = [...participants].sort((a, b) => (a.joined_at_ms ?? 0) - (b.joined_at_ms ?? 0) || String(a.uid).localeCompare(String(b.uid)));
  const width = Math.max(2, String(sorted.length).length);
  return new Map(sorted.map((p, i) => [p.uid, `P${String(i + 1).padStart(width, '0')}`]));
}

/**
 * @param session  {session_id, created_at_ms, state, stimulus_params, timers}
 * @param secret   {target, seed}
 * @param participants [{uid, group_id, joined_at_ms, initial_estimate, initial_at_ms, final_estimate, final_at_ms}]
 * @param groups   {A: {group_estimate, entry_mode, submitted_at_ms}|undefined, B: …}
 * @returns {participantsCsv, groupsCsv, summaryCsv, analysis}
 */
export function buildExports({ session, secret, participants, groups }) {
  const ids = pseudonyms(participants);
  const target = secret.target;
  const analysis = analyzeSession({
    target,
    participants: participants.map((p) => ({
      participant_id: ids.get(p.uid),
      group_id: p.group_id ?? null,
      initial_estimate: p.initial_estimate ?? null,
      final_estimate: p.final_estimate ?? null,
    })),
    groupEstimates: { A: groups?.A?.group_estimate ?? null, B: groups?.B?.group_estimate ?? null },
  });
  const byId = new Map(analysis.participants.map((r) => [r.participant_id, r]));
  const sid = session.session_id;

  const pRows = [...participants]
    .sort((a, b) => ids.get(a.uid).localeCompare(ids.get(b.uid)))
    .map((p) => {
      const m = byId.get(ids.get(p.uid));
      return [sid, ids.get(p.uid), p.group_id ?? '', p.initial_estimate ?? '', iso(p.initial_at_ms), p.final_estimate ?? '', iso(p.final_at_ms), m.initial_error, m.final_error, m.improvement];
    });
  const participantsCsv = toCsv(
    ['session_id', 'participant_id', 'group_id', 'initial_estimate', 'initial_timestamp', 'final_estimate', 'final_timestamp', 'initial_abs_error', 'final_abs_error', 'improvement'],
    pRows
  );

  const gRows = ['A', 'B'].map((g) => {
    const d = groups?.[g] || {};
    return [sid, g, d.group_estimate ?? '', iso(d.submitted_at_ms), d.entry_mode ?? '', analysis.groups[g].abs_error];
  });
  const groupsCsv = toCsv(['session_id', 'group_id', 'group_estimate', 'timestamp', 'entry_mode', 'abs_error'], gRows);

  const s = [];
  const add = (k, v) => s.push([k, typeof v === 'object' && v !== null ? JSON.stringify(v) : v]);
  add('session_id', sid);
  add('created_at', iso(session.created_at_ms));
  add('exported_at', new Date().toISOString());
  add('state', session.state);
  add('n_participants', analysis.n_participants);
  add('target', target);
  add('seed', secret.seed);
  add('stimulus_params', session.stimulus_params);
  add('timers_s', session.timers);
  for (const phase of ['initial', 'final']) {
    for (const k of ['n_valid', 'n_missing', 'mean', 'median', 'sd', 'q1', 'q3', 'iqr', 'min', 'max', 'abs_error_of_mean', 'abs_error_of_median']) {
      add(`${phase}_${k}`, analysis[phase][k]);
    }
  }
  add('group_A_estimate', analysis.groups.A.estimate);
  add('group_A_abs_error', analysis.groups.A.abs_error);
  add('group_B_estimate', analysis.groups.B.estimate);
  add('group_B_abs_error', analysis.groups.B.abs_error);
  add('n_valid_groups', analysis.groups.n_valid_groups);
  add('mean_of_groups', analysis.groups.mean_of_groups);
  add('abs_error_of_mean_of_groups', analysis.groups.abs_error_of_mean_of_groups);
  for (const k of ['n_pairs', 'n_improved', 'n_worse', 'n_unchanged', 'mean_improvement', 'median_improvement']) add(`paired_${k}`, analysis.paired[k]);
  add('note', 'Demo, not research data. Group estimates are not independent observations; no inference computed. SD n-1; quartiles type 7.');
  const summaryCsv = toCsv(['metric', 'value'], s);

  return { participantsCsv, groupsCsv, summaryCsv, analysis };
}

const fmt = (v, d = 1) => (v === null || v === undefined ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(d));

/**
 * D-05 / PIANO §1 debriefing: 2–3 neutral, factual messages that hold for any outcome.
 * No causal claims, no inference.
 */
export function debriefMessages(analysis) {
  const out = [];
  const i = analysis.initial, f = analysis.final, g = analysis.groups, p = analysis.paired;
  if (i.n_valid > 0) {
    out.push(`Crowd (initial, n=${i.n_valid}): the mean was off by ${fmt(i.abs_error_of_mean)}, the median by ${fmt(i.abs_error_of_median)}.`);
  }
  if (g.n_valid_groups > 0) {
    const parts = ['A', 'B'].filter((k) => g[k].estimate !== null).map((k) => `Group ${k} off by ${fmt(g[k].abs_error)}`);
    out.push(`${parts.join(', ')}.`);
  }
  if (p.n_pairs > 0) {
    out.push(`After the discussion, ${p.n_improved} of ${p.n_pairs} people moved closer to the true count, ${p.n_worse} moved further away, ${p.n_unchanged} kept the same error.`);
  } else if (f.n_valid > 0) {
    out.push(`Final estimates: n=${f.n_valid}.`);
  }
  out.push('One room, one trial: an illustration, not evidence.');
  return out;
}
