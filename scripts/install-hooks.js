#!/usr/bin/env node
/**
 * scripts/install-hooks.js
 * Installs repository git hooks from scripts/ into .git/hooks/
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const gitDir = path.join(repoRoot, '.git');
const hooksDir = path.join(gitDir, 'hooks');

function installHooks() {
  if (!fs.existsSync(gitDir)) {
    console.log('[install-hooks] .git directory not found (skipping hook installation).');
    return;
  }

  // Handle worktrees or submodules where .git is a file
  let targetHooksDir = hooksDir;
  const gitStat = fs.statSync(gitDir);
  if (gitStat.isFile()) {
    const content = fs.readFileSync(gitDir, 'utf8').trim();
    const match = content.match(/^gitdir:\s*(.+)$/i);
    if (match) {
      targetHooksDir = path.join(path.resolve(repoRoot, match[1]), 'hooks');
    }
  }

  if (!fs.existsSync(targetHooksDir)) {
    fs.mkdirSync(targetHooksDir, { recursive: true });
  }

  const sourceHook = path.join(repoRoot, 'scripts', 'pre-commit.sh');
  const targetHook = path.join(targetHooksDir, 'pre-commit');

  if (!fs.existsSync(sourceHook)) {
    console.warn(`[install-hooks] Source hook not found at ${sourceHook}`);
    return;
  }

  try {
    fs.copyFileSync(sourceHook, targetHook);
    // Make executable on POSIX systems
    if (process.platform !== 'win32') {
      fs.chmodSync(targetHook, 0o755);
    }
    console.log(`✅ [install-hooks] Successfully installed pre-commit hook into ${targetHook}`);
  } catch (err) {
    console.error(`[install-hooks] Failed to install hook: ${err.message}`);
    process.exit(1);
  }
}

installHooks();
