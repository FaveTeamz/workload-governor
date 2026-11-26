#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const { constants, copyFileSync, chmodSync, mkdirSync, readFileSync } = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const git = (...args) => execFileSync('git', args, {
  cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

try {
  git('rev-parse', '--show-toplevel');
  let hooksPath;
  try {
    hooksPath = git('config', '--get', 'core.hooksPath');
  } catch (err) {
    if (err.status !== 1) throw err;
  }
  if (hooksPath !== undefined) {
    throw new Error('core.hooksPath is configured. Use the configured hook directory to install scripts/pre-commit.sh.');
  }

  const destination = path.resolve(repoRoot, git('rev-parse', '--git-path', 'hooks/pre-commit'));
  const source = path.join(repoRoot, 'scripts', 'pre-commit.sh');
  mkdirSync(path.dirname(destination), { recursive: true });
  try {
    copyFileSync(source, destination, constants.COPYFILE_EXCL);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    if (readFileSync(source).equals(readFileSync(destination))) {
      console.log('WorkloadGovernor pre-commit hook is already installed.');
      process.exit(0);
    }
    throw new Error(`A pre-commit hook is already installed at ${destination}.`);
  }
  if (process.platform !== 'win32') chmodSync(destination, 0o755);
  console.log(`Installed WorkloadGovernor pre-commit hook at ${destination}.`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
