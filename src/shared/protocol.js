// Protocol state machine and input validation (WP2). Pure functions, no Firebase.
// Sources: PROJECT_BRIEF "Stati della sessione"; DECISIONI D-03, D-06, D-07, D-08.

export const STATES = Object.freeze([
  'created',
  'waiting_room',
  'individual_estimation',
  'group_discussion',
  'individual_revision',
  'results',
  'debriefing',
  'completed',
]);

export const GROUPS = Object.freeze(['A', 'B']);

// Default timers in seconds (editable in the console). null = no timer for that state.
// D-08 was 45-120-45; 30-90-30 set on 27/11 for the pilot (P-01), final choice after the pilot.
export const DEFAULT_TIMERS = Object.freeze({
  individual_estimation: 30,
  group_discussion: 90,
  individual_revision: 30,
  results: 60,
  debriefing: 60,
});

export const ESTIMATE_MIN = 1;
export const ESTIMATE_MAX = 2000;

const idx = (s) => {
  const i = STATES.indexOf(s);
  if (i < 0) throw new RangeError(`unknown state: ${s}`);
  return i;
};

/** Next state, or null at the end. Transitions are always manual (D-03): the timer never calls this. */
export function nextState(s) {
  const i = idx(s);
  return i < STATES.length - 1 ? STATES[i + 1] : null;
}

/**
 * Recovery after an accidental advance: one step back, never out of `completed`
 * (brief: protect completed sessions) and never back to `created`.
 */
export function previousState(s) {
  const i = idx(s);
  if (s === 'completed' || i <= 1) return null;
  return STATES[i - 1];
}

export function canTransition(from, to) {
  if (from === 'completed') return false;
  return nextState(from) === to || previousState(from) === to;
}

/** Stimulus visibility on the Display (brief: visible in estimation + discussion, hidden in revision, shown with count at reveal). */
export function stimulusVisibility(s) {
  if (s === 'individual_estimation' || s === 'group_discussion') return 'visible';
  if (s === 'results' || s === 'debriefing') return 'revealed';
  return 'hidden';
}

/** New participants may join only before group_discussion (PIANO §1). */
export const canJoin = (s) => s === 'waiting_room' || s === 'individual_estimation';

/** D-06: group selectable until group_discussion starts; groups are then locked. */
export const canChooseGroup = (s) => s === 'waiting_room' || s === 'individual_estimation';

/** Which individual field a participant may submit in state s (one estimate per phase). */
export function participantInputField(s) {
  if (s === 'individual_estimation') return 'initial_estimate';
  if (s === 'individual_revision') return 'final_estimate';
  return null;
}

/** D-07: only the spokesperson, only during group_discussion. */
export const canSubmitGroupEstimate = (s) => s === 'group_discussion';

/**
 * D-03: integer 1..2000. Accepts digits with surrounding spaces only.
 * Returns {ok:true, value} or {ok:false, error}. Error messages are shown to participants (English).
 */
export function parseEstimate(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return { ok: false, error: 'Please enter a number.' };
  if (!/^\d+$/.test(text)) return { ok: false, error: 'Whole numbers only (no decimals, signs or spaces).' };
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < ESTIMATE_MIN || value > ESTIMATE_MAX) {
    return { ok: false, error: `Enter a number between ${ESTIMATE_MIN} and ${ESTIMATE_MAX}.` };
  }
  return { ok: true, value };
}

export const isValidEstimate = (v) => Number.isInteger(v) && v >= ESTIMATE_MIN && v <= ESTIMATE_MAX;

/**
 * D-07: draw one spokesperson per group, among members who submitted the initial estimate;
 * if none did, among all members. Returns {A: uid|null, B: uid|null}.
 * @param participants [{uid, group_id, initial_estimate}]
 * @param rng () => [0,1)  (injectable for tests)
 */
export function drawSpokespersons(participants, rng = Math.random) {
  const out = {};
  for (const g of GROUPS) {
    const members = participants.filter((p) => p.group_id === g);
    const responders = members.filter((p) => isValidEstimate(p.initial_estimate));
    const pool = responders.length > 0 ? responders : members;
    out[g] = pool.length === 0 ? null : pool[Math.floor(rng() * pool.length)].uid;
  }
  return out;
}

/** Per-group head count, for the console and the waiting-room Display. */
export function groupCounts(participants) {
  const c = { A: 0, B: 0, none: 0 };
  for (const p of participants) {
    if (p.group_id === 'A' || p.group_id === 'B') c[p.group_id] += 1;
    else c.none += 1;
  }
  return c;
}

/**
 * Timer arithmetic (informative only, D-03). The timer is stored as
 * {duration_s, started_at_ms|null, paused_remaining_s|null}.
 */
export function timerRemaining(timer, nowMs) {
  if (!timer || timer.duration_s == null) return null;
  if (timer.paused_remaining_s != null) return timer.paused_remaining_s;
  if (timer.started_at_ms == null) return timer.duration_s;
  const left = timer.duration_s - (nowMs - timer.started_at_ms) / 1000;
  return Math.max(0, left);
}

export function pauseTimer(timer, nowMs) {
  return { ...timer, paused_remaining_s: timerRemaining(timer, nowMs) };
}

export function resumeTimer(timer, nowMs) {
  if (timer.paused_remaining_s == null) return timer;
  return {
    duration_s: timer.duration_s,
    started_at_ms: nowMs - (timer.duration_s - timer.paused_remaining_s) * 1000,
    paused_remaining_s: null,
  };
}

/** Short session code: unambiguous characters (no 0/O, 1/I/L). */
export function newSessionCode(rng = Math.random, length = 6) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < length; i++) s += alphabet[Math.floor(rng() * alphabet.length)];
  return s;
}
