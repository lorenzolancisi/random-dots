// Builds preview/ : one SVG per candidate, a JSON report, and a contact-sheet HTML for the facilitator's approval.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { generateStimulus, verifyStimulus, renderSvg, DEFAULTS, ALGORITHM } from '../src/shared/stimulus.js';
import { loadCandidates } from './candidates.js';

const CANDIDATES = loadCandidates();
if (!CANDIDATES) throw new Error('local/candidates.json not found: previews need the private candidate list');

const out = new URL('../preview/', import.meta.url);
mkdirSync(out, { recursive: true });

const report = [];
for (const c of CANDIDATES) {
  const s = generateStimulus(c.seed, c.count);
  const v = verifyStimulus(s, c.count);
  if (!v.ok) throw new Error(`candidate ${c.id} failed verification: ${v.errors.join('; ')}`);
  writeFileSync(new URL(`candidate_${c.id}.svg`, out), renderSvg(s));
  report.push({
    id: c.id,
    seed: c.seed,
    count: c.count,
    sha256_of_dots: createHash('sha256').update(JSON.stringify(s.dots)).digest('hex').slice(0, 16),
    minNearestNeighbour: +v.minNearestNeighbour.toFixed(2),
    meanNearestNeighbour: +v.meanNearestNeighbour.toFixed(2),
    clarkEvansR: +v.clarkEvansR.toFixed(3),
    inkCoveragePct: +(v.inkCoverage * 100).toFixed(2),
  });
}
writeFileSync(new URL('report.json', out), JSON.stringify({ algorithm: ALGORITHM, params: DEFAULTS, candidates: report }, null, 2));

const rows = report
  .map(
    (r) => `<section>
  <h2>Candidate ${r.id}</h2>
  <p><b>Exact count: <span class="count">${r.count}</span></b> &middot; seed ${r.seed} &middot; Clark-Evans R ${r.clarkEvansR} &middot; ink coverage ${r.inkCoveragePct}% &middot; min nearest-neighbour ${r.minNearestNeighbour}px</p>
  <img src="candidate_${r.id}.svg" alt="candidate ${r.id}" style="width:100%;max-width:1200px;border:1px solid #888">
</section>`
  )
  .join('\n');

writeFileSync(
  new URL('index.html', out),
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Random Dots - candidate stimuli</title>
<style>body{font-family:sans-serif;margin:20px}section{margin-bottom:40px}.count{background:#ffe9a8;padding:2px 6px}</style></head>
<body><h1>Random Dots - 3 candidate stimuli (FACILITATOR EYES ONLY: exact counts shown)</h1>
<p>Same dot radius, same area, same minimum distance. Only count and seed differ. Algorithm: ${ALGORITHM}.</p>
${rows}</body></html>`
);
console.log(JSON.stringify(report, null, 2));
