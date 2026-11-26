#!/usr/bin/env node
/**
 * scripts/lint-changelog.js
 *
 * Validates that CHANGELOG.md conforms to the Keep a Changelog format used by
 * this project and requires an Unreleased entry for source changes.
 *
 * Checks:
 *   1. An [Unreleased] section exists (## [Unreleased]).
 *   2. All versioned entries use the format ## [x.y.z] - YYYY-MM-DD.
 *   3. Dates in version entries are valid ISO 8601 (YYYY-MM-DD).
 *   4. All section type headings (### ...) use only the allowed types:
 *      Added, Changed, Deprecated, Removed, Fixed, Security.
 *   5. Changes to core source paths include a new categorized Unreleased entry.
 *
 * Usage:
 *   node scripts/lint-changelog.js [--file <path>] [--base <ref>] [--help]
 *
 * Exit codes:
 *   0 — no errors found
 *   1 — one or more format errors found
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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
const SOURCE_PATH_RE = /^(?:src|contracts|frontend\/src|backend\/src)\//;

// ── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { file: 'CHANGELOG.md', base: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) {
      args.file = argv[++i];
    } else if (argv[i] === '--base' && argv[i + 1]) {
      args.base = argv[++i];
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log([
        'Usage: node scripts/lint-changelog.js [--file <path>] [--base <ref>]',
        '',
        'Options:',
        '  --file <path>   Path to the changelog file (default: CHANGELOG.md)',
        '  --base <ref>    Target branch ref (default: origin/<GITHUB_BASE_REF> or origin/main)',
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

function getPullRequestEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  } catch (err) {
    console.error(`ERROR: Cannot read GitHub event ${eventPath}: ${err.message}`);
    process.exit(1);
  }
}

function getChangedFiles(baseRef) {
  try {
    return execFileSync('git', ['diff', '--name-only', `${baseRef}...HEAD`], {
      encoding: 'utf8',
    }).trim().split('\n').filter(Boolean);
  } catch (err) {
    console.error(
      `ERROR: Cannot compare ${baseRef} with HEAD: ${err.message}. ` +
      'Fetch the target branch or pass --base <ref>.'
    );
    process.exit(1);
  }
}

function getAddedLineNumbers(baseRef) {
  let diff;
  try {
    diff = execFileSync(
      'git',
      ['diff', '--unified=0', `${baseRef}...HEAD`, '--', 'CHANGELOG.md'],
      { encoding: 'utf8' }
    );
  } catch (err) {
    console.error(`ERROR: Cannot inspect changelog changes: ${err.message}`);
    process.exit(1);
  }

  const addedLineNumbers = new Set();
  let newLineNumber = 0;
  for (const line of diff.split('\n')) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLineNumber = Number(hunk[1]);
    } else if (line.startsWith('+++') || line.startsWith('---') || line === '') {
      continue;
    } else if (line.startsWith('+')) {
      addedLineNumbers.add(newLineNumber++);
    } else if (line.startsWith('-')) {
      continue;
    } else {
      newLineNumber++;
    }
  }
  return addedLineNumbers;
}

function validateChangelogForSourceChanges(changelogPath, baseRef, changedFiles) {
  const sourceFiles = changedFiles.filter((file) => SOURCE_PATH_RE.test(file));
  if (sourceFiles.length === 0) {
    return [];
  }

  if (!changedFiles.includes('CHANGELOG.md')) {
    return [
      `Source files changed (${sourceFiles.join(', ')}), but CHANGELOG.md was not updated. ` +
      'Add an entry under [Unreleased].',
    ];
  }

  let lines;
  try {
    lines = fs.readFileSync(changelogPath, 'utf8').split('\n');
  } catch (err) {
    return [`ERROR: Cannot read ${changelogPath}: ${err.message}`];
  }

  const addedLineNumbers = getAddedLineNumbers(baseRef);
  const errors = [];
  let inUnreleased = false;
  let category = null;
  let addedEntryCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isAddedEntry = addedLineNumbers.has(i + 1) && /^- /.test(line);

    if (line === '## [Unreleased]') {
      inUnreleased = true;
      category = null;
      continue;
    }
    if (/^## \[/.test(line)) {
      inUnreleased = false;
      category = null;
      continue;
    }
    if (!inUnreleased) {
      if (isAddedEntry) {
        errors.push(`Line ${i + 1}: New changelog entries must be in the [Unreleased] section.`);
      }
      continue;
    }

    const heading = line.match(TYPE_HEADING_RE);
    if (heading) {
      category = heading[1].trim();
      continue;
    }

    if (isAddedEntry) {
      if (!ALLOWED_TYPES.has(category)) {
        errors.push(
          `Line ${i + 1}: New changelog entry must be under an allowed category ` +
          'in the [Unreleased] section.'
        );
      } else {
        addedEntryCount++;
      }
    }
  }

  if (addedEntryCount === 0 && errors.length === 0) {
    errors.push(
      'CHANGELOG.md changed, but no new entry was added under an allowed category in [Unreleased].'
    );
  }
  return errors;
}

function changelogPolicyErrors(changelogPath, baseRef) {
  const event = getPullRequestEvent();
  const pullRequest = event && event.pull_request;
  const actor = (pullRequest && pullRequest.user && pullRequest.user.login) ||
    process.env.GITHUB_ACTOR ||
    '';
  const labels = (pullRequest && Array.isArray(pullRequest.labels))
    ? pullRequest.labels.map((label) => label.name)
    : [];

  if (actor.endsWith('[bot]') || labels.includes('skip-changelog')) {
    console.log(`Skipping source changelog requirement for ${actor || 'skip-changelog label'}.`);
    return [];
  }

  const changedFiles = getChangedFiles(baseRef);
  return validateChangelogForSourceChanges(changelogPath, baseRef, changedFiles);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv);
const filePath = path.resolve(process.cwd(), args.file);
const baseRef = args.base || (process.env.GITHUB_BASE_REF
  ? `origin/${process.env.GITHUB_BASE_REF}`
  : 'origin/main');

console.log(`Linting ${filePath} ...`);
const errors = lint(filePath).concat(changelogPolicyErrors(filePath, baseRef));

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
