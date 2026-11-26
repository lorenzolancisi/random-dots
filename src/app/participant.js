// WP3 — participant phone. Mobile-first, English, no account (anonymous auth), no other people's answers.
import {
  auth, ensureAnonymous, refs, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp, el, friendlyError,
} from './fb.js';
import { canJoin, canChooseGroup, participantInputField, parseEstimate, GROUPS } from '../shared/protocol.js';

const root = document.getElementById('app');
const state = { sid: null, uid: null, session: null, me: undefined, group: null, pending: null, error: null, busy: false };
let offGroup = null;

const show = (...nodes) => root.replaceChildren(...nodes.flat().filter((x) => x != null && x !== false));
const msg = (title, sub) => [el('h2', {}, title), sub ? el('p', { class: 'muted' }, sub) : null];

async function resolveSession() {
  const fromUrl = new URLSearchParams(location.search).get('s');
  if (fromUrl) return fromUrl.trim().toUpperCase();
  const cur = await getDoc(refs.current());
  return cur.exists() ? cur.data().session_id : null;
}

let joining = false;
async function join() {
  if (joining) return;
  joining = true;
  try {
    await setDoc(refs.participant(state.sid, state.uid), {
      group_id: null, joined_at: serverTimestamp(),
      initial_estimate: null, initial_at: null, final_estimate: null, final_at: null, updated_at: null,
    });
  } catch (e) { joining = false; state.error = friendlyError(e); render(); }
}

async function act(fn) {
  if (state.busy) return;
  state.busy = true; state.error = null; render();
  try { await fn(); state.pending = null; } catch (e) { state.error = friendlyError(e); }
  state.busy = false; render();
}

const chooseGroup = (g) => act(() => updateDoc(refs.participant(state.sid, state.uid), { group_id: g, updated_at: serverTimestamp() }));

const submitIndividual = (field, value) => act(() => updateDoc(refs.participant(state.sid, state.uid), {
  [field]: value,
  [field === 'initial_estimate' ? 'initial_at' : 'final_at']: serverTimestamp(),
  updated_at: serverTimestamp(),
}));

const submitGroup = (value) => act(() => updateDoc(refs.group(state.sid, state.me.group_id), {
  group_estimate: value, entry_mode: 'spokesperson', submitted_at: serverTimestamp(),
}));

// Number entry with explicit confirmation (D-03).
function estimateForm(key, label, onConfirm) {
  if (state.pending && state.pending.key === key) {
    const v = state.pending.value;
    return el('div', { class: 'card' },
      el('p', { class: 'big' }, `You entered ${v}.`),
      el('p', {}, 'Send it? You cannot change it afterwards.'),
      el('button', { class: 'primary', disabled: state.busy, onclick: () => onConfirm(v) }, 'Confirm'),
      el('button', { disabled: state.busy, onclick: () => { state.pending = null; render(); } }, 'Edit'));
  }
  const input = el('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '1–2000', 'aria-label': label });
  const err = el('p', { class: 'error' });
  const form = el('form', {
    class: 'card',
    novalidate: true,
    onsubmit: (ev) => {
      ev.preventDefault();
      const r = parseEstimate(input.value);
      if (!r.ok) { err.textContent = r.error; return; }
      state.pending = { key, value: r.value }; render();
    },
  }, el('label', {}, label), input, el('button', { class: 'primary', type: 'submit' }, 'Next'), err);
  setTimeout(() => input.focus(), 0);
  return form;
}

function groupPicker(locked) {
  const g = state.me?.group_id;
  if (locked) return el('p', { class: 'pill' }, g ? `Group ${g}` : 'No group');
  return el('div', { class: 'card' },
    el('p', {}, g ? `You are in Group ${g}. You can still change it.` : 'Choose your group (the facilitator will tell you which):'),
    el('div', { class: 'row' }, ...GROUPS.map((x) => el('button', { class: x === g ? 'primary' : '', disabled: state.busy, onclick: () => chooseGroup(x) }, `Group ${x}`))));
}

function render() {
  const s = state.session;
  const out = [];
  if (!state.sid) { show(...msg('No session open', 'Please wait for the facilitator, then reload this page.')); return; }
  if (!s) { show(...msg('Connecting…')); return; }
  const st = s.state;
  const me = state.me;

  if (st === 'created') out.push(...msg('Session not open yet', 'Please wait and keep this page open.'));
  else if (st === 'completed') out.push(...msg('Thank you!', 'The activity is over.'));
  else if (me === undefined) out.push(...msg('Connecting…'));
  else if (me === null) {
    if (canJoin(st)) { out.push(...msg('Joining…')); join(); }
    else out.push(...msg('Joining is closed', 'The activity has already started. Thank you!'));
  } else {
    const field = participantInputField(st);
    out.push(groupPicker(!canChooseGroup(st)));
    if (st === 'waiting_room') {
      out.push(...msg('You are in!', me.group_id ? 'Wait for the facilitator to start.' : null));
    } else if (st === 'individual_estimation' || st === 'individual_revision') {
      const done = me[field];
      const title = st === 'individual_estimation' ? 'Look at the main screen' : 'Your final estimate';
      const sub = st === 'individual_estimation' ? 'How many dots are there? Give your own estimate, without talking.' : 'Your own estimate again, now that you have discussed it.';
      out.push(...msg(title, sub));
      if (!me.group_id) out.push(el('p', { class: 'error' }, 'Choose your group first.'));
      else if (done != null) out.push(el('p', { class: 'big ok' }, `Received: ${done}`));
      else out.push(estimateForm(field, 'Your estimate (number of dots):', (v) => submitIndividual(field, v)));
    } else if (st === 'group_discussion') {
      const g = state.group;
      if (!me.group_id) out.push(...msg('Group discussion', 'You are not in a group: listen to the room.'));
      else if (g?.group_estimate != null) out.push(el('p', { class: 'big ok' }, `Group estimate sent: ${g.group_estimate}`));
      else if (g?.spokesperson_uid === state.uid) {
        out.push(el('h2', { class: 'alert' }, `You are the spokesperson for Group ${me.group_id} — tell your group`),
          el('p', {}, 'Agree on ONE number together, then enter it here.'),
          estimateForm('group', 'Group estimate:', submitGroup));
      } else out.push(...msg('Discuss with your group', 'Your spokesperson will enter the group estimate.'));
    } else {
      out.push(...msg('Look at the main screen'));
    }
  }
  if (state.error) out.push(el('p', { class: 'error' }, state.error));
  out.push(el('p', { class: 'foot' }, 'Anonymous demo: no names or personal data are collected. Your answers are not shown to other participants.'));
  show(...out);
}

async function main() {
  render();
  try {
    const u = await ensureAnonymous();
    if (!u.isAnonymous) {
      show(...msg('This browser is signed in as the facilitator', 'Open the participant link on another phone or in a private/incognito window.'));
      return;
    }
    state.uid = u.uid;
    state.sid = await resolveSession();
  } catch (e) { state.error = friendlyError(e); render(); return; }
  if (!state.sid) { render(); return; }
  onSnapshot(refs.session(state.sid), (d) => { state.session = d.exists() ? d.data() : null; if (!d.exists()) state.sid = null; render(); },
    (e) => { state.error = friendlyError(e); render(); });
  onSnapshot(refs.participant(state.sid, state.uid), (d) => {
    state.me = d.exists() ? d.data() : null;
    if (offGroup) { offGroup(); offGroup = null; state.group = null; }
    if (state.me?.group_id) {
      offGroup = onSnapshot(refs.group(state.sid, state.me.group_id),
        (gd) => { state.group = gd.exists() ? gd.data() : null; render(); },
        () => { state.group = null; render(); });
    }
    render();
  }, (e) => { state.error = friendlyError(e); render(); });
}
main();
window.__rd = { state, auth }; // debugging aid for tests (no secrets: a participant can only see their own data)
