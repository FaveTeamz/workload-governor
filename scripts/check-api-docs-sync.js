#!/usr/bin/env node
/**
 * scripts/check-api-docs-sync.js
 *
 * Verifies that every operation defined in openapi.yaml has a matching
 * endpoint heading in docs/api-reference.md. Exits with code 1 when an
 * operation from the spec is missing from the markdown.
 *
 * An endpoint heading is any markdown heading whose text is an HTTP method
 * followed by a path, optionally wrapped in backticks:
 *
 *   #### `GET /orgs/{orgId}/issues`
 *   ### POST /verify-xdr
 *
 * Paths are normalised before comparison so that `:param` and `{param}`
 * placeholders (with any parameter name) and an optional `/api` prefix are
 * treated as equivalent.
 *
 * Usage:
 *   node scripts/check-api-docs-sync.js
 *   node scripts/check-api-docs-sync.js --strict   # also fail on extra endpoints
 *
 * Options (env vars):
 *   OPENAPI_SPEC     Path to the OpenAPI spec (default: openapi.yaml)
 *   API_REFERENCE    Path to the markdown reference (default: docs/api-reference.md)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SPEC_PATH = path.resolve(ROOT, process.env.OPENAPI_SPEC || 'openapi.yaml');
const DOC_PATH = path.resolve(ROOT, process.env.API_REFERENCE || 'docs/api-reference.md');
const STRICT = process.argv.includes('--strict');

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

function loadYamlParser() {
  try {
    return require('yaml').parse;
  } catch {
    return require('js-yaml').load;
  }
}

/** Canonical form used to compare spec paths with markdown paths. */
function normalise(method, rawPath) {
  const p = rawPath
    .trim()
    .replace(/^\/api(?=\/)/, '')
    .replace(/\{[^}]+\}/g, '{}')
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '{}')
    .replace(/\?.*$/, '')
    .replace(/(.)\/+$/, '$1');
  return `${method.toUpperCase()} ${p}`;
}

function specEndpoints(specText) {
  const spec = loadYamlParser()(specText);
  const endpoints = new Map();
  for (const [p, item] of Object.entries(spec.paths || {})) {
    for (const method of Object.keys(item || {})) {
      if (!HTTP_METHODS.includes(method)) continue;
      endpoints.set(normalise(method, p), `${method.toUpperCase()} ${p}`);
    }
  }
  return endpoints;
}

function docEndpoints(markdown) {
  const heading = new RegExp(
    `^#{1,6}\\s+\`?(${HTTP_METHODS.join('|')})\\s+(/[^\\s\`]*)\`?\\s*$`,
    'i',
  );
  const endpoints = new Map();
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = line.match(heading);
    if (m) endpoints.set(normalise(m[1], m[2]), `${m[1].toUpperCase()} ${m[2]}`);
  }
  return endpoints;
}

function main() {
  const spec = specEndpoints(fs.readFileSync(SPEC_PATH, 'utf8'));
  const docs = docEndpoints(fs.readFileSync(DOC_PATH, 'utf8'));

  const missing = [...spec.keys()].filter((k) => !docs.has(k)).map((k) => spec.get(k));
  const extra = [...docs.keys()].filter((k) => !spec.has(k)).map((k) => docs.get(k));

  const specRel = path.relative(ROOT, SPEC_PATH);
  const docRel = path.relative(ROOT, DOC_PATH);

  console.log(`Checked ${spec.size} operations in ${specRel} against ${docs.size} endpoint headings in ${docRel}.`);

  if (missing.length) {
    console.error(`\n✖ ${missing.length} operation(s) in ${specRel} are not documented in ${docRel}:`);
    for (const e of missing) console.error(`    - ${e}`);
    console.error(`\n  Add a heading such as "#### \`${missing[0]}\`" to ${docRel}.`);
  }

  if (extra.length) {
    const log = STRICT ? console.error : console.warn;
    log(`\n${STRICT ? '✖' : '⚠'} ${extra.length} endpoint(s) in ${docRel} are not defined in ${specRel}:`);
    for (const e of extra) log(`    - ${e}`);
  }

  if (missing.length || (STRICT && extra.length)) {
    console.error('\nSee docs/contributing.md → "Changing a REST endpoint" for the update workflow.');
    process.exit(1);
  }

  console.log('\n✔ openapi.yaml and docs/api-reference.md are in sync.');
}

if (require.main === module) {
  main();
}

module.exports = { normalise, specEndpoints, docEndpoints };
