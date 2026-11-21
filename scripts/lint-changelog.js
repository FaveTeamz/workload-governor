#!/usr/bin/env node
/**
 * scripts/lint-changelog.js
 *
 * Validates that CHANGELOG.md conforms to the Keep a Changelog format used by
 * this project. Run locally before pushing any PR that modifies the changelog,
 * or let CI run it automatically.
 *
 * Checks:
 *   1. An [Unreleased] section exists (## [Unreleased]).
 *   2. All versioned entries use the format ## [x.y.z] - YYYY-MM-DD.
 *   3. Dates in version entries are valid ISO 8601 (YYYY-MM-DD).
 *   4. All section type headings (### ...) use only the allowed types:
 *      Added, Changed, Deprecated, Removed, Fixed, Security.
 *
 * Usage:
 *   node scripts/lint-changelog.js [--file <path>] [--help]
 *
 * Exit codes:
 *   0 — no errors found
 *   1 — one or more format errors found
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── Configuration ─────────────────────────────────────────────────────────────

const ALLOWED_TYPES = new Set([
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security',
]);

// Matches: ## [Unreleased]  OR  ## [1.2.3] - 2026-09-26
const VERSION_HEADING_RE = /^## \[([^\]]+)\](?:\s+-\s+(\d{4}-\d{2}-\d{2}))?$/;

// Matches valid ISO 8601 date YYYY-MM-DD with basic range checks
const ISO_DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// Matches ### SectionType
const TYPE_HEADING_RE = /^### (.+)$/;

// ── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { file: 'CHANGELOG.md' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) {
      args.file = argv[++i];
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log([
        'Usage: node scripts/lint-changelog.js [--file <path>]',
        '',
        'Options:',
        '  --file <path>   Path to the changelog file (default: CHANGELOG.md)',
        '  --help, -h      Show this help message',
        '',
        'Exit codes:',
        '  0   No errors found',
        '  1   One or more format errors found',
      ].join('\n'));
      process.exit(0);
    }
  }
  return args;
}

// ── Linter ────────────────────────────────────────────────────────────────────

function lint(filePath) {
  const errors = [];
  let content;

  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`ERROR: Cannot read ${filePath}: ${err.message}`);
    process.exit(1);
  }

  const lines = content.split('\n');
  let foundUnreleased = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // ── Version heading check ────────────────────────────────────────────────
    const versionMatch = line.match(VERSION_HEADING_RE);
    if (versionMatch) {
      const version = versionMatch[1];
      const date = versionMatch[2];

      if (version === 'Unreleased') {
        foundUnreleased = true;
      } else {
        // Versioned entries MUST have a date
        if (!date) {
          errors.push(
            `Line ${lineNo}: Version entry "[${version}]" is missing a date. ` +
            `Expected format: ## [${version}] - YYYY-MM-DD`
          );
        } else if (!ISO_DATE_RE.test(date)) {
          errors.push(
            `Line ${lineNo}: Date "${date}" in version entry "[${version}]" is not ` +
            `valid ISO 8601. Expected YYYY-MM-DD (e.g. 2026-09-26).`
          );
        }
      }
      continue;
    }

    // ── Section type heading check ────────────────────────────────────────────
    const typeMatch = line.match(TYPE_HEADING_RE);
    if (typeMatch) {
      const typeName = typeMatch[1].trim();
      if (!ALLOWED_TYPES.has(typeName)) {
        errors.push(
          `Line ${lineNo}: Unknown section type "### ${typeName}". ` +
          `Allowed types: ${[...ALLOWED_TYPES].join(', ')}.`
        );
      }
    }
  }

  // ── Global checks ─────────────────────────────────────────────────────────
  if (!foundUnreleased) {
    errors.push(
      'CHANGELOG.md is missing an [Unreleased] section. ' +
      'Add "## [Unreleased]" at the top of the changelog entries.'
    );
  }

  return errors;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv);
const filePath = path.resolve(process.cwd(), args.file);

console.log(`Linting ${filePath} ...`);
const errors = lint(filePath);

if (errors.length === 0) {
  console.log('✅ CHANGELOG.md passes all format checks.');
  process.exit(0);
} else {
  console.error(`\n❌ Found ${errors.length} error(s):\n`);
  errors.forEach((e, idx) => console.error(`  ${idx + 1}. ${e}`));
  console.error('');
  console.error(
    'See docs/changelog-guide.md for the expected format and examples.'
  );
  process.exit(1);
}
