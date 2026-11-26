import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATES, nextState, previousState, canTransition, stimulusVisibility, canJoin, canChooseGroup,
  participantInputField, canSubmitGroupEstimate, parseEstimate, isValidEstimate, drawSpokespersons,
  groupCounts, timerRemaining, pauseTimer, resumeTimer, newSessionCode, DEFAULT_TIMERS,
} from '../src/shared/protocol.js';

test('states follow the brief order', () => {
  assert.deepEqual(STATES, ['created', 'waiting_room', 'individual_estimation', 'group_discussion',
    'individual_revision', 'results', 'debriefing', 'completed']);
});

test('forward transitions are one step at a time; completed is terminal', () => {
  for (let i = 0; i < STATES.length - 1; i++) assert.equal(nextState(STATES[i]), STATES[i + 1]);
  assert.equal(nextState('completed'), null);
  assert.ok(!canTransition('waiting_room', 'group_discussion')); // no skipping
  assert.ok(!canTransition('completed', 'debriefing')); // completed is protected
  assert.ok(!canTransition('completed', 'completed'));
  assert.throws(() => nextState('bogus'));
});

test('one step back for recovery, never from completed and never to created', () => {
  assert.equal(previousState('group_discussion'), 'individual_estimation');
  assert.equal(previousState('waiting_room'), null);
  assert.equal(previousState('created'), null);
  assert.equal(previousState('completed'), null);
  assert.ok(canTransition('results', 'individual_revision'));
});

test('D-08 default timers 45-120-45', () => {
  assert.equal(DEFAULT_TIMERS.individual_estimation, 45);
  assert.equal(DEFAULT_TIMERS.group_discussion, 120);
  assert.equal(DEFAULT_TIMERS.individual_revision, 45);
});

test('stimulus rule: visible in estimation and discussion, hidden in revision, revealed at results', () => {
  const v = Object.fromEntries(STATES.map((s) => [s, stimulusVisibility(s)]));
  assert.equal(v.individual_estimation, 'visible');
  assert.equal(v.group_discussion, 'visible');
  assert.equal(v.individual_revision, 'hidden');
  assert.equal(v.results, 'revealed');
  assert.equal(v.debriefing, 'revealed');
  assert.equal(v.waiting_room, 'hidden');
  assert.equal(v.created, 'hidden');
  assert.equal(v.completed, 'hidden');
});

test('joining and group choice close when group_discussion starts (D-06)', () => {
  for (const s of STATES) {
    const open = s === 'waiting_room' || s === 'individual_estimation';
    assert.equal(canJoin(s), open, s);
    assert.equal(canChooseGroup(s), open, s);
  }
});

test('input fields are enabled only in their phase', () => {
  const m = Object.fromEntries(STATES.map((s) => [s, participantInputField(s)]));
  assert.equal(m.individual_estimation, 'initial_estimate');
  assert.equal(m.individual_revision, 'final_estimate');
  assert.equal(Object.values(m).filter(Boolean).length, 2);
  assert.deepEqual(STATES.filter(canSubmitGroupEstimate), ['group_discussion']);
});

test('parseEstimate accepts integers 1..2000 only (D-03)', () => {
  assert.deepEqual(parseEstimate('180'), { ok: true, value: 180 });
  assert.deepEqual(parseEstimate(' 42 '), { ok: true, value: 42 });
  assert.deepEqual(parseEstimate('1'), { ok: true, value: 1 });
  assert.deepEqual(parseEstimate('2000'), { ok: true, value: 2000 });
  for (const bad of ['', '   ', null, undefined, '0', '2001', '-5', '12.5', '1e3', '1 000', 'abc', '+7', '0x10', '99999999999999999999']) {
    assert.equal(parseEstimate(bad).ok, false, String(bad));
  }
  assert.ok(isValidEstimate(150));
  assert.ok(!isValidEstimate(150.5));
  assert.ok(!isValidEstimate('150'));
});

test('spokesperson draw (D-07): among responders of the group, else among all members', () => {
  const ps = [
    { uid: 'a1', group_id: 'A', initial_estimate: 150 },
    { uid: 'a2', group_id: 'A', initial_estimate: null },
    { uid: 'a3', group_id: 'A', initial_estimate: 220 },
    { uid: 'b1', group_id: 'B', initial_estimate: null },
    { uid: 'b2', group_id: 'B' },
  ];
  // rng 0 -> first of pool, rng 0.99 -> last of pool
  assert.deepEqual(drawSpokespersons(ps, () => 0), { A: 'a1', B: 'b1' });
  assert.deepEqual(drawSpokespersons(ps, () => 0.99), { A: 'a3', B: 'b2' });
  // a2 never drawn: did not respond while others did
  for (let i = 0; i < 200; i++) assert.notEqual(drawSpokespersons(ps).A, 'a2');
  // empty group -> null
  assert.deepEqual(drawSpokespersons(ps.filter((p) => p.group_id === 'A'), () => 0), { A: 'a1', B: null });
  assert.deepEqual(drawSpokespersons([]), { A: null, B: null });
});

test('spokesperson draw is roughly uniform', () => {
  const ps = ['x', 'y', 'z'].map((uid) => ({ uid, group_id: 'A', initial_estimate: 100 }));
  const n = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 6000; i++) n[drawSpokespersons(ps).A] += 1;
  for (const k of Object.keys(n)) assert.ok(n[k] > 1700 && n[k] < 2300, JSON.stringify(n));
});

test('group counts', () => {
  assert.deepEqual(groupCounts([{ group_id: 'A' }, { group_id: 'A' }, { group_id: 'B' }, {}]), { A: 2, B: 1, none: 1 });
});

test('timer is informative arithmetic: countdown, floor at 0, pause and resume', () => {
  const t0 = 1_000_000;
  const t = { duration_s: 45, started_at_ms: t0, paused_remaining_s: null };
  assert.equal(timerRemaining(t, t0), 45);
  assert.equal(timerRemaining(t, t0 + 10_000), 35);
  assert.equal(timerRemaining(t, t0 + 60_000), 0);
  const p = pauseTimer(t, t0 + 20_000);
  assert.equal(timerRemaining(p, t0 + 90_000), 25); // frozen while paused
  const r = resumeTimer(p, t0 + 100_000);
  assert.equal(timerRemaining(r, t0 + 100_000), 25);
  assert.equal(timerRemaining(r, t0 + 105_000), 20);
  assert.equal(timerRemaining({ duration_s: 45, started_at_ms: null, paused_remaining_s: null }, t0), 45);
  assert.equal(timerRemaining(null, t0), null);
});

test('session codes avoid ambiguous characters', () => {
  for (let i = 0; i < 500; i++) assert.match(newSessionCode(), /^[A-HJKMNP-Z2-9]{6}$/);
});
