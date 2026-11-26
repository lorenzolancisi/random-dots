// Node-only loader for the facilitator's private candidate list (local/candidates.json).
// The file is git-ignored: exact counts must never reach the public repository or the website
// (DECISIONI.md D-14). Returns null when the file is absent (e.g. on a fresh clone).
import { readFileSync, existsSync } from 'node:fs';

const FILE = new URL('../local/candidates.json', import.meta.url);

export function loadCandidates() {
  if (!existsSync(FILE)) return null;
  const { candidates } = JSON.parse(readFileSync(FILE, 'utf8'));
  return Object.freeze(candidates.map((c) => Object.freeze({ ...c })));
}
