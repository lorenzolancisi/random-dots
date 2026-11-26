// Self-test of Firestore rules + realtime with N simulated anonymous participants (WP2/WP7).
// Runs in the facilitator's browser: the main app is the facilitator, each participant is a separate
// Firebase app instance with in-memory anonymous auth. Uses a throw-away session "ZZxxxx"; never touches
// meta/current; deletes everything at the end.
import { initializeApp, deleteApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, signInAnonymously } from 'firebase/auth';
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, onSnapshot, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { firebaseConfig } from '../shared/firebase-config.js';
import { db, refs, facilitatorSignIn, waitForUser, participantFromDoc, groupFromDoc, el } from './fb.js';
import { drawSpokespersons, newSessionCode, DEFAULT_TIMERS } from '../shared/protocol.js';
import { buildExports } from '../shared/csv.js';

const N = Number(new URLSearchParams(location.search).get('n') || 20);
const log = document.getElementById('log');
const results = { pass: 0, fail: 0 };
const line = (cls, text) => { const li = el('li', { class: cls }, text); log.append(li); li.scrollIntoView({ block: 'nearest' }); };
const ok = (t) => { results.pass++; line('ok', `PASS ${t}`); };
const bad = (t) => { results.fail++; line('fail', `FAIL ${t}`); };
const info = (t) => line('info', t);

async function expectOk(name, p) { try { await p; ok(name); } catch (e) { bad(`${name} → ${e.code || e.message}`); } }
async function expectDenied(name, p) {
  try { await p; bad(`${name} → was ALLOWED`); } catch (e) { if (e.code === 'permission-denied') ok(name); else bad(`${name} → ${e.code || e.message}`); }
}

async function makeClients(n, tag) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = initializeApp(firebaseConfig, `${tag}-${i}-${Date.now()}`);
    const au = initializeAuth(a, { persistence: inMemoryPersistence });
    const u = (await signInAnonymously(au)).user;
    out.push({ app: a, db: getFirestore(a), uid: u.uid });
  }
  return out;
}

const P = (c, sid) => doc(c.db, 'sessions', sid, 'participants', c.uid);
const setState = (sid, state, extra = {}) => updateDoc(refs.session(sid), { state, updated_at: serverTimestamp(), ...extra });

async function run() {
  const t0 = performance.now();
  const sid = 'ZZ' + newSessionCode().slice(0, 4);
  info(`Session ${sid}, ${N} simulated participants`);
  let clients = [], late = [];
  try {
    // --- setup by facilitator
    const b = writeBatch(db);
    b.set(refs.session(sid), { state: 'created', created_at: serverTimestamp(), updated_at: serverTimestamp(), timers: DEFAULT_TIMERS, timer: null, groups_locked: false, stimulus_params: {} });
    b.set(refs.secret(sid), { seed: 1, target: 100 });
    await expectOk('facilitator creates session + secret', b.commit());

    const tc = performance.now();
    clients = await makeClients(N, 'p');
    info(`${N} anonymous sign-ins in ${((performance.now() - tc) / 1000).toFixed(1)} s`);
    const [p1, p2] = clients;

    await expectOk('participant reads public session', getDoc(doc(p1.db, 'sessions', sid)));
    await expectDenied('participant reads secret (count/seed)', getDoc(doc(p1.db, 'sessions', sid, 'private', 'secret')));
    await expectDenied('participant writes session state', updateDoc(doc(p1.db, 'sessions', sid), { state: 'results' }));
    await expectDenied('participant writes meta/current', setDoc(doc(p1.db, 'meta', 'current'), { session_id: 'X' }));
    const blank = { group_id: null, joined_at: serverTimestamp(), initial_estimate: null, initial_at: null, final_estimate: null, final_at: null, updated_at: null };
    await expectDenied('join while state=created', setDoc(P(p1, sid), blank));

    await setState(sid, 'waiting_room');
    // realtime: all join + choose group
    await expectOk(`${N} participants join in parallel`, Promise.all(clients.map((c) => setDoc(P(c, sid), blank))));
    await expectDenied('participant creates another participant\'s doc', setDoc(doc(p1.db, 'sessions', sid, 'participants', 'someone-else'), blank));
    await expectDenied('join with a pre-filled estimate', setDoc(doc(p1.db, 'sessions', sid, 'participants', p1.uid), { ...blank, initial_estimate: 5 }));
    await expectOk(`${N} choose groups A/B`, Promise.all(clients.map((c, i) => updateDoc(P(c, sid), { group_id: i % 2 ? 'B' : 'A', updated_at: serverTimestamp() }))));
    await expectDenied('group "C"', updateDoc(P(p1, sid), { group_id: 'C', updated_at: serverTimestamp() }));
    await expectDenied('initial estimate during waiting_room', updateDoc(P(p1, sid), { initial_estimate: 100, initial_at: serverTimestamp(), updated_at: serverTimestamp() }));

    // --- realtime latency: every client listens to the session, facilitator advances
    const seen = await new Promise((resolve) => {
      const times = []; const offs = [];
      let start;
      clients.forEach((c) => {
        offs.push(onSnapshot(doc(c.db, 'sessions', sid), (d) => {
          if (d.data()?.state === 'individual_estimation' && start) { times.push(performance.now() - start); if (times.length === clients.length) { offs.forEach((f) => f()); resolve(times); } }
        }));
      });
      setTimeout(() => { start = performance.now(); setState(sid, 'individual_estimation'); }, 1500);
      setTimeout(() => { offs.forEach((f) => f()); resolve(times); }, 15000);
    });
    if (seen.length === N) ok(`realtime: all ${N} clients saw the phase change (max ${Math.max(...seen).toFixed(0)} ms, median ${seen.sort((a, b) => a - b)[Math.floor(N / 2)].toFixed(0)} ms)`);
    else bad(`realtime: only ${seen.length}/${N} clients saw the phase change within 15 s`);

    const est = (c, v) => updateDoc(P(c, sid), { initial_estimate: v, initial_at: serverTimestamp(), updated_at: serverTimestamp() });
    for (const [label, v] of [['0', 0], ['2001', 2001], ['12.5', 12.5], ['"150" (string)', '150'], ['-3', -3]]) await expectDenied(`initial estimate ${label}`, est(p2, v));
    await expectOk(`${N - 1} initial estimates in parallel (one left missing)`, Promise.all(clients.slice(0, -1).map((c, i) => est(c, 80 + i * 3))));
    await expectDenied('second initial estimate (duplicate)', est(p1, 99));
    await expectDenied('participant reads another participant', getDoc(P({ db: p1.db, uid: p2.uid }, sid)));
    await expectDenied('participant lists all participants', getDocs(collection(p1.db, 'sessions', sid, 'participants')));
    await expectDenied('participant changes another participant\'s group', updateDoc(P({ db: p1.db, uid: p2.uid }, sid), { group_id: 'A', updated_at: serverTimestamp() }));
    await expectOk('group change still allowed in individual_estimation', updateDoc(P(p1, sid), { group_id: 'A', updated_at: serverTimestamp() }));

    // --- group discussion: lock + draw (same batch as the console)
    const parts = (await getDocs(refs.participants(sid))).docs.map(participantFromDoc);
    const draw = drawSpokespersons(parts);
    const bg = writeBatch(db);
    bg.update(refs.session(sid), { state: 'group_discussion', groups_locked: true, updated_at: serverTimestamp() });
    for (const g of ['A', 'B']) bg.set(refs.group(sid, g), { spokesperson_uid: draw[g], group_estimate: null, entry_mode: null, submitted_at: null });
    await expectOk('facilitator: advance to group_discussion + draw spokespersons', bg.commit());
    const byUid = new Map(clients.map((c) => [c.uid, c]));
    const spA = byUid.get(draw.A), spB = byUid.get(draw.B);
    const memberA = clients.find((c) => c.uid !== draw.A && parts.find((p) => p.uid === c.uid)?.group_id === 'A');
    const memberB = clients.find((c) => parts.find((p) => p.uid === c.uid)?.group_id === 'B');
    if (!spA || !spB || !memberA) bad('spokesperson draw produced no candidates');
    else {
      const spResponded = parts.find((p) => p.uid === draw.A)?.initial_estimate != null;
      spResponded ? ok('spokesperson A was drawn among responders') : bad('spokesperson A did not respond');
      const G = (c, g) => doc(c.db, 'sessions', sid, 'groups', g);
      const gEst = (c, g, v, mode = 'spokesperson') => updateDoc(G(c, g), { group_estimate: v, entry_mode: mode, submitted_at: serverTimestamp() });
      await expectDenied('group change after lock', updateDoc(P(memberA, sid), { group_id: 'B', updated_at: serverTimestamp() }));
      await expectOk('member reads own group doc', getDoc(G(memberA, 'A')));
      await expectDenied('member reads the other group doc', getDoc(G(memberA, 'B')));
      await expectDenied('non-spokesperson enters group estimate', gEst(memberA, 'A', 150));
      await expectDenied('spokesperson A writes group B', gEst(spA, 'B', 150));
      await expectDenied('spokesperson with entry_mode=facilitator', gEst(spA, 'A', 150, 'facilitator'));
      await expectDenied('spokesperson out-of-range 3000', gEst(spA, 'A', 3000));
      await expectOk('spokesperson A enters group estimate', gEst(spA, 'A', 140));
      await expectDenied('spokesperson A enters it twice', gEst(spA, 'A', 141));
      await expectOk('spokesperson B enters group estimate', gEst(spB, 'B', 120));
      await expectDenied('spokesperson tries to change own spokesperson field', updateDoc(G(spA, 'A'), { spokesperson_uid: memberA.uid }));
      await expectOk('facilitator corrects group B', updateDoc(refs.group(sid, 'B'), { group_estimate: 121, entry_mode: 'facilitator', submitted_at: serverTimestamp() }));
      await expectDenied('participant final estimate during group_discussion', updateDoc(P(memberB, sid), { final_estimate: 100, final_at: serverTimestamp(), updated_at: serverTimestamp() }));
    }
    late = await makeClients(1, 'late');
    await expectDenied('late join after group_discussion started', setDoc(P(late[0], sid), blank));

    await setState(sid, 'individual_revision');
    const fin = (c, v) => updateDoc(P(c, sid), { final_estimate: v, final_at: serverTimestamp(), updated_at: serverTimestamp() });
    await expectOk(`${N} final estimates in parallel`, Promise.all(clients.map((c, i) => fin(c, 90 + i * 2))));
    await expectDenied('second final estimate', fin(p1, 1));
    await expectDenied('initial estimate during revision (missing one)', updateDoc(P(clients.at(-1), sid), { initial_estimate: 100, initial_at: serverTimestamp(), updated_at: serverTimestamp() }));

    // --- analysis on what is actually stored
    const finalParts = (await getDocs(refs.participants(sid))).docs.map(participantFromDoc);
    const groups = Object.fromEntries((await getDocs(refs.groups(sid))).docs.map((d) => [d.id, groupFromDoc(d.data())]));
    const x = buildExports({ session: { session_id: sid, state: 'results', created_at_ms: Date.now() }, secret: { target: 100, seed: 1 }, participants: finalParts, groups });
    const a = x.analysis;
    (a.n_participants === N && a.initial.n_valid === N - 1 && a.initial.n_missing === 1 && a.final.n_valid === N && a.groups.A.estimate === 140 && a.groups.B.estimate === 121)
      ? ok(`analysis on stored data: n=${a.n_participants}, initial ${a.initial.n_valid}+1 missing, final ${a.final.n_valid}, groups 140/121`)
      : bad(`analysis mismatch: ${JSON.stringify({ n: a.n_participants, i: a.initial.n_valid, f: a.final.n_valid, A: a.groups.A.estimate, B: a.groups.B.estimate })}`);
    (!x.participantsCsv.includes('group_estimate') && !clients.some((c) => x.participantsCsv.includes(c.uid)))
      ? ok('participants.csv: no group estimate, no uids') : bad('participants.csv leaks group estimate or uids');

    for (const s of ['results', 'debriefing', 'completed']) await setState(sid, s);
    await expectDenied('facilitator edits a participant of a completed session', updateDoc(refs.participant(sid, p1.uid), { group_id: 'B' }));
    await expectDenied('facilitator edits a completed session', setState(sid, 'results'));
    await expectDenied('participant edits group doc of completed session', updateDoc(doc(p1.db, 'sessions', sid, 'groups', 'A'), { group_estimate: 1 }));
  } catch (e) {
    bad(`unexpected error: ${e.code || ''} ${e.message}`);
  } finally {
    // --- cleanup
    try {
      const refsToDelete = [
        ...(await getDocs(refs.participants(sid))).docs.map((d) => d.ref),
        ...(await getDocs(refs.groups(sid))).docs.map((d) => d.ref),
        refs.secret(sid), refs.session(sid),
      ];
      const bd = writeBatch(db); refsToDelete.forEach((r) => bd.delete(r)); await bd.commit();
      const left = await getDoc(refs.session(sid));
      left.exists() ? bad('cleanup: session still exists') : ok(`cleanup: ${refsToDelete.length} documents deleted`);
    } catch (e) { bad(`cleanup failed: ${e.code || e.message}`); }
    await Promise.all([...clients, ...late].map((c) => deleteApp(c.app).catch(() => {})));
  }
  info(`Done in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  const summary = el('h2', { class: results.fail ? 'fail' : 'ok', id: 'summary' }, `${results.pass} passed, ${results.fail} failed`);
  document.getElementById('app').replaceChildren(summary);
  document.body.dataset.done = results.fail ? 'fail' : 'pass';
}

(async () => {
  const app = document.getElementById('app');
  const u = await waitForUser();
  const go = el('button', { onclick: async () => { go.disabled = true; try { if (!u || u.isAnonymous) await facilitatorSignIn(); await run(); } catch (e) { bad(e.code || e.message); go.disabled = false; } } }, u && !u.isAnonymous ? `Run self-test as ${u.email}` : 'Sign in with Google and run');
  app.replaceChildren(go);
})();
