// Guard for DECISIONI D-14 / D-17: the public site (docs/) and versioned sources must never contain
// the exact counts, the candidate seeds, the facilitator email or Firestore rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCandidates } from '../tools/candidates.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const publicFiles = () => {
  const dirs = ['docs', 'src', 'tests', 'tools', 'project-docs'].map((d) => join(root, d)).filter(existsSync);
  const top = ['README.md', 'CHANGELOG.md', 'package.json'].map((f) => join(root, f)).filter(existsSync);
  return [...dirs.flatMap(walk), ...top].filter((p) => !p.includes(`${join('tests', 'fixtures')}`));
};

const candidates = loadCandidates();
const local = (f) => join(root, 'local', f);

test('docs/ exists and contains no reserved folders', { skip: !existsSync(join(root, 'docs')) && 'site not built' }, () => {
  const files = walk(join(root, 'docs')).map((p) => p.slice(root.length));
  assert.ok(!files.some((f) => /local|preview|candidates/.test(f)), files.join(', '));
});

test('no candidate seed or exact count in public files', { skip: !candidates && 'local/candidates.json absent' }, () => {
  for (const file of publicFiles()) {
    if (file.endsWith('publish-safety.test.js')) continue;
    const text = readFileSync(file, 'utf8');
    for (const c of candidates) {
      assert.ok(!new RegExp(`\\b${c.seed}\\b`).test(text), `seed of candidate ${c.id} found in ${file}`);
      assert.ok(!new RegExp(`(?<![\\w.:-])${c.count}(?![\\w.:-])`).test(text), `count of candidate ${c.id} found in ${file}`);
    }
  }
});

test('no facilitator email and no Firestore rules in public files', () => {
  const f = local('facilitator.txt');
  const email = existsSync(f) ? (readFileSync(f, 'utf8').match(/facilitator_email=(\S+)/) || [])[1] : null;
  for (const file of publicFiles()) {
    if (file.endsWith('publish-safety.test.js')) continue;
    const text = readFileSync(file, 'utf8');
    if (email) assert.ok(!text.includes(email), `facilitator email found in ${file}`);
    assert.ok(!/rules_version\s*=/.test(text), `Firestore rules found in ${file}`);
    assert.ok(!/@gmail\.com/i.test(text), `a gmail address found in ${file}`);
  }
});
