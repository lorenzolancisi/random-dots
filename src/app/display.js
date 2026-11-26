// WP4 — Display for the projector (PC). No controls (D-02): it follows the session state in real time.
// It needs the facilitator login only to read the exact count and seed (D-14); it shows the count only at reveal.
import {
  auth, db, refs, doc, getDoc, onSnapshot, facilitatorSignIn, probeFacilitator, waitForUser, watchSession, participantUrl, BASE_URL, el, friendlyError,
} from './fb.js';
import { stimulusVisibility, timerRemaining, groupCounts } from '../shared/protocol.js';
import { generateStimulus, renderSvg } from '../shared/stimulus.js';
import { buildExports, debriefMessages } from '../shared/csv.js';
import qrcode from 'qrcode-generator';

const root = document.getElementById('app');
const ui = { user: null, isFac: false, sid: null, live: null, off: null, error: null, stimKey: null, stimSvg: null };

const TITLES = {
  created: 'Random Dots', waiting_room: 'Join now', individual_estimation: '1 · How many dots? Your own estimate',
  group_discussion: '2 · Discuss in your group — the spokesperson enters ONE group estimate',
  individual_revision: '3 · Your final estimate (on your own)', results: 'Results', debriefing: 'What happened?', completed: 'Thank you!',
};

const qrSvg = (text, cell = 8) => { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true }); };

function stimulusSvg(secret) {
  const key = `${secret.seed}/${secret.target}`;
  if (ui.stimKey !== key) { ui.stimKey = key; ui.stimSvg = renderSvg(generateStimulus(secret.seed, secret.target)); }
  return ui.stimSvg;
}

const fmt = (v) => (v == null ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(1));

// Strip plot: one row per phase, dots for individual estimates, target line, group markers.
function resultsChart(analysis, target) {
  const W = 1500, H = 330, L = 170, R = 40;
  const vals = [...analysis.participants.flatMap((p) => [p.initial_estimate, p.final_estimate]), analysis.groups.A.estimate, analysis.groups.B.estimate, target].filter((v) => v != null);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max(5, (hi - lo) * 0.08); lo = Math.max(0, lo - pad); hi += pad;
  const x = (v) => L + ((v - lo) / (hi - lo)) * (W - L - R);
  const rows = [['Initial', 90, analysis.participants.map((p) => p.initial_estimate)], ['Groups', 170, null], ['Final', 250, analysis.participants.map((p) => p.final_estimate)]];
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif" font-size="26">`;
  for (const [label, y, data] of rows) {
    s += `<text x="10" y="${y + 9}" fill="#333">${label}</text><line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#ccc"/>`;
    if (data) for (const v of data) if (v != null) s += `<circle cx="${x(v).toFixed(1)}" cy="${y}" r="11" fill="#1f5fbf" fill-opacity="0.55"/>`;
  }
  for (const g of ['A', 'B']) {
    const v = analysis.groups[g].estimate;
    if (v != null) s += `<rect x="${(x(v) - 16).toFixed(1)}" y="152" width="32" height="36" fill="#e07b00"/><text x="${x(v).toFixed(1)}" y="180" text-anchor="middle" fill="#fff" font-weight="bold">${g}</text>`;
  }
  s += `<line x1="${x(target)}" x2="${x(target)}" y1="40" y2="290" stroke="#c00" stroke-width="4"/><text x="${x(target)}" y="30" text-anchor="middle" fill="#c00" font-weight="bold">true ${target}</text>`;
  for (const t of [lo, (lo + hi) / 2, hi]) s += `<text x="${x(t)}" y="322" text-anchor="middle" fill="#777" font-size="22">${Math.round(t)}</text>`;
  return s + '</svg>';
}

function statsTable(a) {
  const row = (name, d) => el('tr', {}, el('td', {}, name), el('td', {}, `${d.n_valid}${d.n_missing ? ` (+${d.n_missing} missing)` : ''}`),
    el('td', {}, fmt(d.mean)), el('td', {}, fmt(d.median)), el('td', {}, fmt(d.sd)), el('td', {}, fmt(d.iqr)),
    el('td', {}, fmt(d.abs_error_of_mean)), el('td', {}, fmt(d.abs_error_of_median)));
  const g = a.groups;
  return el('div', {},
    el('table', {}, el('tr', {}, ...['', 'n', 'mean', 'median', 'SD', 'IQR', 'error of mean', 'error of median'].map((h) => el('th', {}, h))),
      row('Initial', a.initial), row('Final', a.final)),
    el('p', { class: 'gl' }, `Group A: ${fmt(g.A.estimate)} (error ${fmt(g.A.abs_error)}) · Group B: ${fmt(g.B.estimate)} (error ${fmt(g.B.abs_error)})` +
      (g.mean_of_groups != null ? ` · mean of the two groups: ${fmt(g.mean_of_groups)} (error ${fmt(g.abs_error_of_mean_of_groups)})` : '')));
}

function view() {
  const { session, secret, participants, groups } = ui.live;
  const st = session.state;
  const vis = stimulusVisibility(st);
  const url = participantUrl(ui.sid);
  const out = [el('header', {}, el('h1', {}, TITLES[st]), el('div', { id: 'timer', class: 'timer' }))];
  const counts = groupCounts(participants);

  if (st === 'created' || st === 'waiting_room') {
    const q = el('div', { class: 'qr' }); q.innerHTML = qrSvg(url, 10);
    out.push(el('div', { class: 'join' }, q, el('div', {},
      el('p', { class: 'url' }, BASE_URL.replace(/^https:\/\//, '')),
      el('p', {}, `Session code: ${ui.sid}`),
      st === 'waiting_room' ? el('p', { class: 'counts' }, `Joined: ${participants.length} · Group A: ${counts.A} · Group B: ${counts.B}`) : el('p', {}, 'Not open yet'),
      el('p', {}, 'Scan, then choose the group the facilitator tells you.'))));
  } else if (vis === 'visible' && secret) {
    const s = el('div', { class: 'stim' }); s.innerHTML = stimulusSvg(secret);
    out.push(s);
    if (st === 'individual_estimation') { const q = el('div', { class: 'qr-corner' }); q.innerHTML = qrSvg(url, 4); out.push(q); }
    if (st === 'group_discussion') out.push(el('p', { class: 'status' }, ...['A', 'B'].map((g) => `Group ${g}: ${groups[g]?.group_estimate != null ? 'sent ✓' : 'waiting…'}   `)));
  } else if (st === 'individual_revision') {
    out.push(el('div', { class: 'hidden-stim' }, 'The image is hidden. Enter your final estimate on your phone.'));
  } else if ((st === 'results' || st === 'debriefing') && secret) {
    const a = buildExports({ session, secret, participants, groups }).analysis;
    const top = el('div', { class: 'res' });
    const s = el('div', { class: 'stim small' }); s.innerHTML = stimulusSvg(secret);
    top.append(s, el('div', { class: 'truth' }, el('div', {}, 'True count'), el('div', { class: 'n' }, String(secret.target))));
    const ch = el('div', { class: 'chart' }); ch.innerHTML = resultsChart(a, secret.target);
    out.push(top, ch, statsTable(a));
    if (st === 'debriefing') out.push(el('ul', { class: 'debrief' }, ...debriefMessages(a).map((m) => el('li', {}, m))));
  } else if (st === 'completed') {
    out.push(el('p', { class: 'big' }, 'Thank you for taking part.'));
  }
  return out;
}

function render() {
  const out = [];
  if (!ui.isFac) {
    out.push(el('h1', {}, 'Display'), el('p', {}, 'Sign in with the facilitator account.'),
      el('button', { onclick: async () => { try { ui.user = await facilitatorSignIn(); await start(); } catch (e) { ui.error = friendlyError(e); render(); } } }, 'Sign in with Google'));
  } else if (!ui.sid) out.push(el('h1', {}, 'Random Dots'), el('p', {}, 'No session open. Create one in the console.'));
  else if (!ui.live?.session) out.push(el('p', {}, 'Loading…'));
  else out.push(...view());
  if (ui.error) out.push(el('p', { class: 'error' }, ui.error));
  out.push(el('button', { class: 'fs', onclick: () => document.documentElement.requestFullscreen?.().catch(() => {}) }, '⛶'));
  root.replaceChildren(...out.flat().filter((x) => x != null && x !== false));
  tick();
}

function tick() {
  const t = document.getElementById('timer');
  const s = ui.live?.session;
  if (!t || !s) return;
  const r = timerRemaining(s.timer, Date.now());
  if (r == null) { t.textContent = ''; return; }
  const m = Math.floor(Math.ceil(r) / 60), sec = Math.ceil(r) % 60;
  t.textContent = `${m}:${String(sec).padStart(2, '0')}${s.timer?.paused_remaining_s != null ? ' ⏸' : ''}`;
  t.classList.toggle('zero', r <= 0);
}
setInterval(tick, 250);

async function start() {
  ui.isFac = await probeFacilitator();
  if (!ui.isFac) { ui.error = `Signed in as ${auth.currentUser?.email}: not the facilitator account (or no connection).`; render(); return; }
  ui.error = null;
  const fromUrl = new URLSearchParams(location.search).get('s');
  if (fromUrl) { follow(fromUrl.toUpperCase()); return; }
  onSnapshot(refs.current(), (d) => follow(d.exists() ? d.data().session_id : null), (e) => { ui.error = friendlyError(e); render(); });
}

function follow(sid) {
  if (sid === ui.sid && ui.off) return;
  if (ui.off) { ui.off(); ui.off = null; }
  ui.sid = sid; ui.live = null;
  if (sid) ui.off = watchSession(sid, (live) => { ui.live = live; render(); }, (e) => { ui.error = friendlyError(e); render(); });
  render();
}

(async () => {
  render();
  ui.user = await waitForUser();
  if (ui.user && !ui.user.isAnonymous) await start();
  render();
})();
