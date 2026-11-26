// WP0 connectivity check. Verifies, from the visitor's own browser:
//   1. Firebase app initialises with the project config
//   2. Anonymous sign-in works on the Spark plan
//   3. Firestore is reachable (before the rules are published, a read is expected to be DENIED:
//      "permission-denied" proves the request reached Firestore and the default lock is in place)
// No data is written.
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { firebaseConfig } from '../shared/firebase-config.js';

const log = document.getElementById('log');
const line = (ok, text) => {
  const li = document.createElement('li');
  li.textContent = `${ok === true ? 'OK' : ok === false ? 'FAIL' : 'INFO'} — ${text}`;
  li.className = ok === true ? 'ok' : ok === false ? 'fail' : 'info';
  log.appendChild(li);
};

async function run() {
  line(null, `Project: ${firebaseConfig.projectId}`);
  let app;
  try {
    app = initializeApp(firebaseConfig);
    line(true, 'Firebase app initialised');
  } catch (e) {
    line(false, `init: ${e.message}`);
    return;
  }
  try {
    const cred = await signInAnonymously(getAuth(app));
    line(true, `Anonymous sign-in (uid ${cred.user.uid.slice(0, 6)}…)`);
  } catch (e) {
    line(false, `Anonymous sign-in: ${e.code || e.message}`);
    return;
  }
  try {
    await getDoc(doc(getFirestore(app), 'healthcheck/ping'));
    line(true, 'Firestore read allowed (rules published)');
  } catch (e) {
    if (e.code === 'permission-denied') line(true, 'Firestore reachable (read denied by rules, as expected)');
    else line(false, `Firestore: ${e.code || e.message}`);
  }
  line(null, 'Done.');
  document.body.dataset.done = '1';
}
run();
