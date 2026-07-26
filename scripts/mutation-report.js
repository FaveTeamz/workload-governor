#!/usr/bin/env node
/**
 * Generate an HTML mutation-testing report from mutants.out/outcomes.json.
 * Usage: node scripts/mutation-report.js [mutants.out/] [report.html]
 */

const fs = require('fs');
const path = require('path');

const outDir = process.argv[2] || 'mutants.out';
const outFile = process.argv[3] || path.join(outDir, 'mutation-report.html');

const outcomesPath = path.join(outDir, 'outcomes.json');
if (!fs.existsSync(outcomesPath)) {
  console.error(`outcomes.json not found at ${outcomesPath}`);
  process.exit(1);
}

const { outcomes } = JSON.parse(fs.readFileSync(outcomesPath, 'utf8'));

// Tally
let caught = 0, missed = 0, timeout = 0, unviable = 0;
const rows = [];

for (const o of outcomes) {
  if (o.scenario === 'Baseline') continue;
  const mutant = o.scenario?.Mutant ?? o.scenario;
  const name = typeof mutant === 'string' ? mutant : (mutant?.name ?? JSON.stringify(mutant));
  const summary = o.summary ?? 'Unknown';

  if (summary === 'MissedMutant') missed++;
  else if (summary === 'CaughtMutant') caught++;
  else if (summary === 'Timeout') timeout++;
  else if (summary === 'Unviable') unviable++;

  rows.push({ name, summary });
}

const total = caught + missed + timeout;
const score = total > 0 ? Math.round((caught / total) * 100) : 0;
const passFail = score >= 80 ? '✅ PASS' : '❌ FAIL';
const scoreColor = score >= 80 ? '#22c55e' : '#ef4444';

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
</style>
</head>
<body>
<h1>Mutation Testing Report — WorkloadGovernor</h1>
<p>Generated: ${new Date().toISOString()}</p>
<div class="score">${score}% ${passFail}</div>
<div class="stats">
  <div class="stat"><div class="stat-num" style="color:#16a34a">${caught}</div><div>Caught</div></div>
  <div class="stat"><div class="stat-num" style="color:#dc2626">${missed}</div><div>Missed</div></div>
  <div class="stat"><div class="stat-num" style="color:#d97706">${timeout}</div><div>Timeout</div></div>
  <div class="stat"><div class="stat-num" style="color:#6b7280">${unviable}</div><div>Unviable</div></div>
</div>
<h2>Mutant Details</h2>
<table>
  <thead><tr><th>Mutant</th><th>Result</th></tr></thead>
  <tbody>${tableRows}</tbody>
</table>
</body>
</html>`;

fs.writeFileSync(outFile, html);
console.log(`Report written to ${outFile} (score: ${score}% — ${passFail})`);

// Exit non-zero if score < 80 so CI can enforce the threshold
if (score < 80) process.exit(2);
