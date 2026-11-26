// Shared Firebase layer for participant, console, display and selftest pages.
import { initializeApp } from 'firebase/app';
import {
  getAuth, signInAnonymously, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
} from 'firebase/auth';
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot,
  serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { firebaseConfig } from '../shared/firebase-config.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, writeBatch };

export const BASE_URL = new URL('./', location.href).href; // …/random-dots/
export const participantUrl = (sid) => `${BASE_URL}?s=${encodeURIComponent(sid)}`;

export const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : typeof t === 'number' ? t : null);

export const refs = {
  current: () => doc(db, 'meta', 'current'),
  session: (sid) => doc(db, 'sessions', sid),
  secret: (sid) => doc(db, 'sessions', sid, 'private', 'secret'),
  participants: (sid) => collection(db, 'sessions', sid, 'participants'),
  participant: (sid, uid) => doc(db, 'sessions', sid, 'participants', uid),
  groups: (sid) => collection(db, 'sessions', sid, 'groups'),
  group: (sid, g) => doc(db, 'sessions', sid, 'groups', g),
};

export function waitForUser() {
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (u) => { off(); resolve(u); });
  });
}

export async function ensureAnonymous() {
  const u = await waitForUser();
  if (u) return u;
  return (await signInAnonymously(auth)).user;
}

export async function facilitatorSignIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return (await signInWithPopup(auth, provider)).user;
}

export const facilitatorSignOut = () => signOut(auth);

export const participantFromDoc = (d) => {
  const x = d.data();
  return {
    uid: d.id,
    group_id: x.group_id ?? null,
    joined_at_ms: ms(x.joined_at),
    initial_estimate: x.initial_estimate ?? null,
    initial_at_ms: ms(x.initial_at),
    final_estimate: x.final_estimate ?? null,
    final_at_ms: ms(x.final_at),
  };
};

export const groupFromDoc = (x) =>
  x
    ? {
        spokesperson_uid: x.spokesperson_uid ?? null,
        group_estimate: x.group_estimate ?? null,
        entry_mode: x.entry_mode ?? null,
        submitted_at_ms: ms(x.submitted_at),
      }
    : null;

/**
 * Facilitator-side live view of a whole session. Calls onChange({session, secret, participants, groups})
 * whenever anything changes. Returns an unsubscribe function.
 */
export function watchSession(sid, onChange, onError = console.error) {
  const st = { session: null, secret: null, participants: [], groups: {} };
  const emit = () => onChange({ ...st });
  const offs = [
    onSnapshot(refs.session(sid), (s) => { st.session = s.exists() ? { session_id: sid, ...s.data(), created_at_ms: ms(s.data().created_at) } : null; emit(); }, onError),
    onSnapshot(refs.secret(sid), (s) => { st.secret = s.exists() ? s.data() : null; emit(); }, onError),
    onSnapshot(refs.participants(sid), (q) => { st.participants = q.docs.map(participantFromDoc); emit(); }, onError),
    onSnapshot(refs.groups(sid), (q) => { st.groups = Object.fromEntries(q.docs.map((d) => [d.id, groupFromDoc(d.data())])); emit(); }, onError),
  ];
  return () => offs.forEach((f) => f());
}

export const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'onclick' || k === 'oninput' || k === 'onsubmit') e[k] = v;
    else if (k === 'class') e.className = v;
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
};

export const friendlyError = (e) => {
  const code = e?.code || '';
  if (code === 'permission-denied' || code === 'firestore/permission-denied') return 'Not allowed right now (the phase may have changed). Please wait for the facilitator.';
  if (code === 'unavailable') return 'Connection problem. Check your network and try again.';
  return e?.message || String(e);
};
