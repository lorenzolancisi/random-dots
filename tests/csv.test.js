import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv, pseudonyms, buildExports, debriefMessages } from '../src/shared/csv.js';

const parse = (csv) => csv.trim().split('\r\n').map((l) => l.split(','));

const fixture = () => ({
  session: { session_id: 'TESTAB', created_at_ms: Date.UTC(2026, 10, 30, 10), state: 'completed', stimulus_params: { radius: 8 }, timers: { individual_estimation: 45 } },
  secret: { target: 197, seed: 42 },
  participants: [
    { uid: 'zzz', group_id: 'B', joined_at_ms: 3, initial_estimate: 205, initial_at_ms: 10, final_estimate: 230, final_at_ms: 20 },
    { uid: 'aaa', group_id: 'A', joined_at_ms: 1, initial_estimate: 150, initial_at_ms: 11, final_estimate: 190, final_at_ms: 21 },
    { uid: 'mmm', group_id: 'A', joined_at_ms: 2, initial_estimate: null, final_estimate: 200, final_at_ms: 22 },
  ],
  groups: { A: { group_estimate: 195, entry_mode: 'spokesperson', submitted_at_ms: 15, spokesperson_uid: 'aaa' }, B: {} },
});

test('toCsv escapes commas, quotes and newlines; empty for null/NaN', () => {
  assert.equal(toCsv(['a', 'b'], [['x,y', 'he said "hi"'], [null, NaN]]), 'a,b\r\n"x,y","he said ""hi"""\r\n,\r\n');
});

test('pseudonyms follow join order and never expose uids', () => {
  const m = pseudonyms(fixture().participants);
  assert.equal(m.get('aaa'), 'P01');
  assert.equal(m.get('mmm'), 'P02');
  assert.equal(m.get('zzz'), 'P03');
});

test('participants.csv: one row per participant, no group estimate, no uid, correct errors', () => {
  const { participantsCsv } = buildExports(fixture());
  const rows = parse(participantsCsv);
  assert.deepEqual(rows[0], ['session_id', 'participant_id', 'group_id', 'initial_estimate', 'initial_timestamp', 'final_estimate', 'final_timestamp', 'initial_abs_error', 'final_abs_error', 'improvement']);
  assert.equal(rows.length, 4);
  assert.ok(!participantsCsv.includes('group_estimate'));
  for (const uid of ['aaa', 'mmm', 'zzz']) assert.ok(!participantsCsv.includes(uid));
  const p01 = rows.find((r) => r[1] === 'P01');
  assert.deepEqual([p01[2], p01[3], p01[5], p01[7], p01[8], p01[9]], ['A', '150', '190', '47', '7', '40']);
  const p02 = rows.find((r) => r[1] === 'P02');
  assert.deepEqual([p02[3], p02[7], p02[9]], ['', '', '']); // missing initial: no error, no improvement
});

test('group_estimates.csv: two rows, missing group blank, spokesperson not exported', () => {
  const { groupsCsv } = buildExports(fixture());
  const rows = parse(groupsCsv);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1].slice(1, 3).concat(rows[1][4], rows[1][5]), ['A', '195', 'spokesperson', '2']);
  assert.deepEqual(rows[2].slice(1, 3), ['B', '']);
  assert.ok(!groupsCsv.includes('aaa'));
});

test('session_summary.csv has target, seed, n valid/missing and the note', () => {
  const { summaryCsv, analysis } = buildExports(fixture());
  const kv = Object.fromEntries(summaryCsv.trim().split('\r\n').slice(1).map((l) => [l.slice(0, l.indexOf(',')), l.slice(l.indexOf(',') + 1)]));
  assert.equal(kv.target, '197');
  assert.equal(kv.seed, '42');
  assert.equal(kv.n_participants, '3');
  assert.equal(kv.initial_n_valid, '2');
  assert.equal(kv.initial_n_missing, '1');
  assert.equal(kv.final_n_valid, '3');
  assert.equal(kv.group_A_estimate, '195');
  assert.equal(kv.group_B_estimate, '');
  assert.equal(kv.paired_n_pairs, '2');
  assert.ok(kv.note.includes('not research data'));
  assert.equal(analysis.paired.n_improved, 1);
});

test('debrief messages are neutral and reflect the numbers', () => {
  const { analysis } = buildExports(fixture());
  const msgs = debriefMessages(analysis);
  assert.ok(msgs.some((m) => m.includes('1 of 2 people moved closer')));
  assert.ok(msgs.some((m) => m.includes('Group A off by 2')));
  assert.ok(msgs.at(-1).includes('not evidence'));
  for (const m of msgs) assert.ok(!/(prove|proves|better than|smarter|always)/i.test(m), m);
  const empty = debriefMessages(buildExports({ ...fixture(), participants: [], groups: {} }).analysis);
  assert.deepEqual(empty, ['One room, one trial: an illustration, not evidence.']);
});
