// WP4 — facilitator console (designed for the facilitator's smartphone, D-15).
// Manual phase control only (D-03): nothing here advances on a timer.
import {
  auth, db, refs, doc, getDoc, getDocs, setDoc, updateDoc, onSnapshot, serverTimestamp, writeBatch,
  facilitatorSignIn, facilitatorSignOut, probeFacilitator, waitForUser, watchSession, participantUrl, el, friendlyError,
} from './fb.js';
import {
  STATES, DEFAULT_TIMERS, nextState, previousState, drawSpokespersons, groupCounts, timerRemaining,
  pauseTimer, resumeTimer, newSessionCode, parseEstimate, GROUPS,
} from '../shared/protocol.js';
import { generateStimulus, verifyStimulus, renderSvg, ALGORITHM, DEFAULTS } from '../shared/stimulus.js';
import { buildExports, pseudonyms } from '../shared/csv.js';

const root = document.getElementById('app');
const ui = { user: null, isFac: false, sid: null, live: null, off: null, error: null, info: null, busy: false, preview: null };

const LABEL = {
  created: 'Created (not open)', waiting_room: 'Waiting room (QR open)', individual_estimation: '1 · Individual estimate',
  group_discussion: '2 · Group discussion', individual_revision: '3 · Final individual estimate', results: '4 · Results',
  debriefing: '5 · Debriefing', completed: 'Completed',
};

const show = (...n) => root.replaceChildren(...n.flat().filter((x) => x != null && x !== false));

async function run(fn, okMsg) {
  if (ui.busy) return;
  ui.busy = true; ui.error = null; ui.info = null; render();
  try { await fn(); if (okMsg) ui.info = okMsg; } catch (e) { ui.error = friendlyError(e); console.error(e); }
  ui.busy = false; render();
}


function follow(sid) {
  if (ui.off) ui.off();
  ui.sid = sid; ui.live = null;
  if (!sid) { render(); return; }
  ui.off = watchSession(sid, (live) => { ui.live = live; render(); }, (e) => { ui.error = friendlyError(e); render(); });
}

// ---------- actions ----------
async function createSession(seed, count, timers) {
  const stim = generateStimulus(seed, count);
  const v = verifyStimulus(stim, count);
  if (!v.ok) throw new Error(`Stimulus check failed: ${v.errors[0]}`);
  const sid = newSessionCode();
  const b = writeBatch(db);
  b.set(refs.session(sid), {
    state: 'created', created_at: serverTimestamp(), updated_at: serverTimestamp(), timers, timer: null, groups_locked: false,
    stimulus_params: { algorithm: ALGORITHM, width: DEFAULTS.width, height: DEFAULTS.height, margin: DEFAULTS.margin, radius: DEFAULTS.radius, minDist: DEFAULTS.minDist },
  });
  b.set(refs.secret(sid), { seed, target: count });
  b.set(refs.current(), { session_id: sid });
  await b.commit();
  follow(sid);
}

function timerFor(sess, st) {
  const d = sess.timers?.[st];
  return d ? { duration_s: d, started_at_ms: Date.now(), paused_remaining_s: null } : null;
}

async function goTo(target) {
  const { session, participants, groups } = ui.live;
  const from = session.state;
  const b = writeBatch(db);
  const patch = { state: target, timer: timerFor(session, target), updated_at: serverTimestamp() };
  if (target === 'group_discussion') {
    patch.groups_locked = true;
    const draw = drawSpokespersons(participants);
    for (const g of GROUPS) {
      if (!groups[g]) b.set(refs.group(ui.sid, g), { spokesperson_uid: draw[g], group_estimate: null, entry_mode: null, submitted_at: null });
      else if (groups[g].group_estimate == null && !groups[g].spokesperson_uid) b.update(refs.group(ui.sid, g), { spokesperson_uid: draw[g] });
    }
  }
  if (from === 'group_discussion' && target === 'individual_estimation') patch.groups_locked = false;
  b.update(refs.session(ui.sid), patch);
  await b.commit();
}

async function redraw(g) {
  const members = ui.live.participants.filter((p) => p.group_id === g);
  const current = ui.live.groups[g]?.spokesperson_uid;
  const pool = members.length > 1 ? members.filter((p) => p.uid !== current) : members;
  const pick = drawSpokespersons(pool)[g];
  await setDoc(refs.group(ui.sid, g), { spokesperson_uid: pick ?? null }, { merge: true });
}

const facilitatorGroupEstimate = (g, value) =>
  setDoc(refs.group(ui.sid, g), { group_estimate: value, entry_mode: 'facilitator', submitted_at: serverTimestamp() }, { merge: true });

const setParticipantGroup = (uid, g) => updateDoc(refs.participant(ui.sid, uid), { group_id: g, updated_at: serverTimestamp() });

async function togglePause() {
  const t = ui.live.session.timer;
  if (!t) return;
  const now = Date.now();
  await updateDoc(refs.session(ui.sid), { timer: t.paused_remaining_s != null ? resumeTimer(t, now) : pauseTimer(t, now) });
}

const restartTimer = () => updateDoc(refs.session(ui.sid), { timer: timerFor(ui.live.session, ui.live.session.state) });

function download(name, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function exportCsv() {
  const { session, secret, participants, groups } = ui.live;
  const x = buildExports({ session, secret, participants, groups });
  const tag = `${session.session_id}`;
  download(`participants_${tag}.csv`, x.participantsCsv);
  setTimeout(() => download(`group_estimates_${tag}.csv`, x.groupsCsv), 400);
  setTimeout(() => download(`session_summary_${tag}.csv`, x.summaryCsv), 800);
}

async function deleteSessionData() {
  const sid = ui.sid;
  const docs = [
    ...(await getDocs(refs.participants(sid))).docs.map((d) => d.ref),
    ...(await getDocs(refs.groups(sid))).docs.map((d) => d.ref),
    refs.secret(sid), refs.session(sid),
  ];
  for (let i = 0; i < docs.length; i += 400) {
    const b = writeBatch(db);
    docs.slice(i, i + 400).forEach((r) => b.delete(r));
    await b.commit();
  }
  const cur = await getDoc(refs.current());
  if (cur.exists() && cur.data().session_id === sid) await setDoc(refs.current(), { session_id: null });
  follow(null);
}

// ---------- views ----------
const btn = (label, onclick, cls = '') => el('button', { class: cls, disabled: ui.busy, onclick }, label);
const confirmThen = (q, fn, ok) => () => { if (window.confirm(q)) run(fn, ok); };

function loginView() {
  return [
    el('h1', {}, 'Facilitator console'),
    ui.user && !ui.isFac ? el('p', { class: 'error' }, `Signed in as ${ui.user.email || 'anonymous'}: this account is not the facilitator.`) : null,
    btn('Sign in with Google', () => run(async () => {
      if (ui.user) await facilitatorSignOut();
      ui.user = await facilitatorSignIn();
      ui.isFac = await probeFacilitator();
      if (ui.isFac) await loadCurrent();
    })),
  ];
}

function createView() {
  const seed = el('input', { type: 'text', inputmode: 'numeric', placeholder: 'seed' });
  const count = el('input', { type: 'text', inputmode: 'numeric', placeholder: 'exact count' });
  const tIn = Object.fromEntries(Object.entries(DEFAULT_TIMERS).map(([k, v]) => [k, el('input', { type: 'text', inputmode: 'numeric', value: String(v), size: 4 })]));
  const prevBox = el('div', { class: 'preview' });
  const read = () => {
    const s = Number(seed.value.trim()), c = Number(count.value.trim());
    if (!Number.isInteger(s) || s < 0 || !Number.isInteger(c) || c < 1 || c > 1000) throw new Error('Seed and count must be whole numbers (count 1–1000).');
    const timers = {};
    for (const [k, i] of Object.entries(tIn)) {
      const v = Number(i.value.trim());
      if (!Number.isInteger(v) || v < 5 || v > 900) throw new Error(`Timer "${k}" must be 5–900 seconds.`);
      timers[k] = v;
    }
    return { s, c, timers };
  };
  return el('div', { class: 'card' },
    el('h2', {}, 'New session'),
    el('p', { class: 'muted' }, 'Enter the seed and the exact count of the approved stimulus (from your private file).'),
    el('div', { class: 'row' }, seed, count),
    el('details', {}, el('summary', {}, 'Timers (seconds, informative only)'),
      ...Object.entries(tIn).map(([k, i]) => el('div', { class: 'row' }, el('span', { class: 'lbl' }, k), i))),
    btn('Preview stimulus', () => { try { const { s, c } = read(); prevBox.innerHTML = renderSvg(generateStimulus(s, c)); } catch (e) { prevBox.textContent = e.message; } }),
    prevBox,
    btn('Create session', () => run(async () => { const { s, c, timers } = read(); await createSession(s, c, timers); }, 'Session created. Open the Display, then "Open waiting room".'), 'primary'));
}

function sessionView() {
  const { session, secret, participants, groups } = ui.live;
  if (!session) return [el('p', {}, 'Loading session…')];
  const st = session.state;
  const counts = groupCounts(participants);
  const nInit = participants.filter((p) => p.initial_estimate != null).length;
  const nFinal = participants.filter((p) => p.final_estimate != null).length;
  const next = nextState(st), prev = previousState(st);
  const rem = timerRemaining(session.timer, Date.now());
  const ids = pseudonyms(participants);
  const out = [];

  out.push(el('div', { class: 'card' },
    el('div', { class: 'row' }, el('b', {}, `Session ${ui.sid}`), el('span', { class: 'pill' }, LABEL[st])),
    el('p', { class: 'timer', id: 'timer' }, rem == null ? '—' : `${Math.ceil(rem)} s${session.timer?.paused_remaining_s != null ? ' (paused)' : ''}`),
    el('p', {}, `Joined: ${participants.length} · A: ${counts.A} · B: ${counts.B} · no group: ${counts.none}`),
    el('p', {}, `Initial estimates: ${nInit} · Final estimates: ${nFinal}`),
    el('p', { class: 'muted small' }, `Participant link: ${participantUrl(ui.sid)}`),
  ));

  const ctl = el('div', { class: 'card' });
  if (next) ctl.append(btn(`Advance → ${LABEL[next]}`, confirmThen(`Advance to "${LABEL[next]}"?`, () => goTo(next)), 'primary big'));
  if (session.timer) ctl.append(btn(session.timer.paused_remaining_s != null ? 'Resume timer' : 'Pause timer', () => run(togglePause)), btn('Restart timer', () => run(restartTimer)));
  if (prev) ctl.append(btn(`Back ← ${LABEL[prev]}`, confirmThen(`Go back to "${LABEL[prev]}"? Use only after an accidental advance.`, () => goTo(prev))));
  out.push(ctl);

  if (['group_discussion', 'individual_revision', 'results', 'debriefing'].includes(st)) {
    const gc = el('div', { class: 'card' }, el('h3', {}, 'Groups'));
    for (const g of GROUPS) {
      const d = groups[g];
      const sp = d?.spokesperson_uid ? ids.get(d.spokesperson_uid) || '?' : 'none';
      const inp = el('input', { type: 'text', inputmode: 'numeric', placeholder: '1–2000', size: 6 });
      gc.append(el('div', { class: 'grp' },
        el('p', {}, `Group ${g}: estimate ${d?.group_estimate ?? '—'}${d?.entry_mode ? ` (${d.entry_mode})` : ''} · spokesperson ${sp}`),
        st !== 'completed' ? el('div', { class: 'row' },
          btn('Re-draw spokesperson', confirmThen(`Draw a new spokesperson for Group ${g}?`, () => redraw(g))),
          inp,
          btn('Enter/correct', () => { const r = parseEstimate(inp.value); if (!r.ok) { ui.error = r.error; render(); return; } if (window.confirm(`Set Group ${g} estimate to ${r.value}?`)) run(() => facilitatorGroupEstimate(g, r.value)); })) : null));
    }
    out.push(gc);
  }

  if (['results', 'debriefing', 'completed'].includes(st) && secret) {
    const x = buildExports({ session, secret, participants, groups }).analysis;
    const f = (v) => (v == null ? '—' : Number.isInteger(v) ? v : v.toFixed(1));
    out.push(el('div', { class: 'card' }, el('h3', {}, `Results (true count ${secret.target})`),
      el('p', {}, `Initial: n=${x.initial.n_valid}, mean ${f(x.initial.mean)}, median ${f(x.initial.median)}`),
      el('p', {}, `Final: n=${x.final.n_valid}, mean ${f(x.final.mean)}, median ${f(x.final.median)}`),
      el('p', {}, `Groups: A ${f(x.groups.A.estimate)}, B ${f(x.groups.B.estimate)}`)));
  }

  const pl = el('details', { class: 'card' }, el('summary', {}, `Participants (${participants.length}) — fix groups`));
  for (const p of [...participants].sort((a, b) => ids.get(a.uid).localeCompare(ids.get(b.uid)))) {
    pl.append(el('div', { class: 'row' }, el('span', { class: 'lbl' }, `${ids.get(p.uid)} · ${p.group_id ?? '–'} · ${p.initial_estimate != null ? 'I✓' : 'I·'} ${p.final_estimate != null ? 'F✓' : 'F·'}`),
      ...(st !== 'completed' ? GROUPS.map((g) => btn(g, confirmThen(`Move ${ids.get(p.uid)} to Group ${g}?`, () => setParticipantGroup(p.uid, g)))) : [])));
  }
  out.push(pl);

  out.push(el('div', { class: 'card' },
    el('a', { href: 'display.html', target: '_blank' }, 'Open Display'), ' · ',
    btn('Export 3 CSV', () => { try { exportCsv(); } catch (e) { ui.error = e.message; render(); } }),
    btn('New session', confirmThen('Create a new session? The current one stays saved (export it first).', async () => follow(null))),
    btn('Delete this session\'s data', () => {
      if (!window.confirm('Delete ALL data of this session? This cannot be undone. Export the CSV first.')) return;
      if (window.prompt(`Type ${ui.sid} to confirm`) !== ui.sid) return;
      run(deleteSessionData, 'Session data deleted.');
    }, 'danger'),
    btn('Sign out', () => run(async () => { await facilitatorSignOut(); location.reload(); }))));
  return out;
}

function render() {
  const out = [];
  if (!ui.isFac) out.push(...loginView());
  else if (!ui.sid) out.push(el('h1', {}, 'Facilitator console'), createView());
  else if (!ui.live || !ui.live.session) out.push(el('p', {}, ui.live && !ui.live.session ? 'Session not found.' : 'Loading…'), btn('New session', () => follow(null)));
  else out.push(...sessionView());
  if (ui.info) out.push(el('p', { class: 'ok' }, ui.info));
  if (ui.error) out.push(el('p', { class: 'error' }, ui.error));
  const focused = document.activeElement;
  if (focused && root.contains(focused) && focused.tagName === 'INPUT') return; // don't wipe what the facilitator is typing
  show(...out);
}

async function loadCurrent() {
  const fromUrl = new URLSearchParams(location.search).get('s');
  if (fromUrl) return follow(fromUrl.toUpperCase());
  const cur = await getDoc(refs.current());
  follow(cur.exists() ? cur.data().session_id : null);
}

setInterval(() => {
  const t = document.getElementById('timer');
  const s = ui.live?.session;
  if (t && s) { const r = timerRemaining(s.timer, Date.now()); t.textContent = r == null ? '—' : `${Math.ceil(r)} s${s.timer?.paused_remaining_s != null ? ' (paused)' : ''}`; }
}, 500);

(async () => {
  render();
  ui.user = await waitForUser();
  if (ui.user && !ui.user.isAnonymous) {
    ui.isFac = await probeFacilitator();
    if (ui.isFac) await loadCurrent();
  }
  render();
})();
window.__rd = { ui, auth, STATES };
