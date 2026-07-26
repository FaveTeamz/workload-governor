#!/usr/bin/env node
/**
 * Generate an HTML + text mutation-testing report from mutants.out/outcomes.json.
 *
 * Usage:
 *   node scripts/mutation-report.js [mutants.out/] [report.html]
 *
 * Options:
 *   --text-only   Print the plain-text summary to stdout and exit (no HTML written).
 *   --threshold N Override the pass threshold (default: 90).
 *
 * Exit codes:
 *   0 — score >= threshold
 *   2 — score < threshold (CI enforcement)
 *   1 — error (missing file, etc.)
 */

const fs = require('fs');
const path = require('path');

// Parse args
const args = process.argv.slice(2);
const textOnly = args.includes('--text-only');
const thresholdArg = args.find(a => a.startsWith('--threshold='));
const PASS_THRESHOLD = thresholdArg ? parseInt(thresholdArg.split('=')[1], 10) : 90;

const positional = args.filter(a => !a.startsWith('--'));
const outDir = positional[0] || 'mutants.out';
const outFile = positional[1] || path.join(outDir, 'mutation-report.html');

const outcomesPath = path.join(outDir, 'outcomes.json');
if (!fs.existsSync(outcomesPath)) {
  console.error(`outcomes.json not found at ${outcomesPath}`);
  process.exit(1);
}

const { outcomes } = JSON.parse(fs.readFileSync(outcomesPath, 'utf8'));

// Tally
let caught = 0, missed = 0, timeout = 0, unviable = 0;
const rows = [];
const missedRows = [];

for (const o of outcomes) {
  if (o.scenario === 'Baseline') continue;
  const mutant = o.scenario?.Mutant ?? o.scenario;
  const name = typeof mutant === 'string' ? mutant : (mutant?.name ?? JSON.stringify(mutant));
  const summary = o.summary ?? 'Unknown';

  if (summary === 'MissedMutant') { missed++; missedRows.push({ name, summary }); }
  else if (summary === 'CaughtMutant') caught++;
  else if (summary === 'Timeout') timeout++;
  else if (summary === 'Unviable') unviable++;

  rows.push({ name, summary });
}

const total = caught + missed + timeout;
const score = total > 0 ? Math.round((caught / total) * 100) : 0;
const passFail = score >= PASS_THRESHOLD ? '✅ PASS' : '❌ FAIL';
const scoreColor = score >= PASS_THRESHOLD ? '#22c55e' : '#ef4444';

// Always print text summary
console.log('');
console.log('══════════════════════════════════════════');
console.log(' Mutation Testing Report — WorkloadGovernor');
console.log('══════════════════════════════════════════');
console.log(`  Score:    ${score}%  ${passFail}  (threshold: ${PASS_THRESHOLD}%)`);
console.log(`  Caught:   ${caught}`);
console.log(`  Missed:   ${missed}`);
console.log(`  Timeout:  ${timeout}`);
console.log(`  Unviable: ${unviable}`);
console.log(`  Total:    ${total}`);
if (missedRows.length > 0) {
  console.log('');
  console.log('  Missed mutants:');
  for (const r of missedRows) {
    console.log(`    ✗ ${r.name}`);
  }
}
console.log('══════════════════════════════════════════');
console.log('');

if (textOnly) {
  process.exit(score < PASS_THRESHOLD ? 2 : 0);
}

const tableRows = rows.map(({ name, summary }) => {
  const color = summary === 'CaughtMutant' ? '#16a34a'
    : summary === 'MissedMutant' ? '#dc2626'
    : summary === 'Timeout' ? '#d97706'
    : '#6b7280';
  return `<tr><td>${escHtml(name)}</td><td style="color:${color};font-weight:600">${escHtml(summary)}</td></tr>`;
}).join('\n');

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

const missedSection = missedRows.length > 0
  ? `<h2>Missed Mutants (${missedRows.length})</h2>
<ul>${missedRows.map(r => `<li><code>${escHtml(r.name)}</code></li>`).join('\n')}</ul>`
  : '<h2>Missed Mutants</h2><p style="color:#16a34a">None — all mutants caught! 🎉</p>';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Mutation Testing Report — WorkloadGovernor</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.5rem; }
  .score { font-size: 3rem; font-weight: 700; color: ${scoreColor}; }
  .stats { display: flex; gap: 2rem; margin: 1.5rem 0; }
  .stat { background: #f3f4f6; border-radius: 8px; padding: 1rem 1.5rem; text-align: center; }
  .stat-num { font-size: 2rem; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; font-size: 0.875rem; }
  th { background: #f3f4f6; text-align: left; padding: 0.5rem 0.75rem; }
  td { padding: 0.4rem 0.75rem; border-bottom: 1px solid #e5e7eb; word-break: break-all; }
  tr:hover td { background: #f9fafb; }
  ul { font-size: 0.875rem; }
  code { background: #f3f4f6; padding: 0.1rem 0.3rem; border-radius: 3px; }
</style>
</head>
<body>
<h1>Mutation Testing Report — WorkloadGovernor</h1>
<p>Generated: ${new Date().toISOString()} · Pass threshold: ${PASS_THRESHOLD}%</p>
<div class="score">${score}% ${passFail}</div>
<div class="stats">
  <div class="stat"><div class="stat-num" style="color:#16a34a">${caught}</div><div>Caught</div></div>
  <div class="stat"><div class="stat-num" style="color:#dc2626">${missed}</div><div>Missed</div></div>
  <div class="stat"><div class="stat-num" style="color:#d97706">${timeout}</div><div>Timeout</div></div>
  <div class="stat"><div class="stat-num" style="color:#6b7280">${unviable}</div><div>Unviable</div></div>
</div>
${missedSection}
<h2>All Mutants</h2>
<table>
  <thead><tr><th>Mutant</th><th>Result</th></tr></thead>
  <tbody>${tableRows}</tbody>
</table>
</body>
</html>`;

fs.writeFileSync(outFile, html);
console.log(`Report written to ${outFile} (score: ${score}% — ${passFail})`);

// Exit non-zero if score < threshold so CI can enforce it
if (score < PASS_THRESHOLD) process.exit(2);
