/**
 * #1260: the frontend has a single build pipeline, the Vite SPA (index.html →
 * src/main.tsx). The Next.js config, App Router directory and `next`
 * dependency are gone, and client env vars use the VITE_ prefix.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

const FRONTEND = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(FRONTEND, 'package.json'), 'utf8'));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

describe('single Vite build pipeline (#1260)', () => {
  it('has no Next.js config or App Router directory', () => {
    expect(existsSync(join(FRONTEND, 'next.config.js'))).toBe(false);
    expect(existsSync(join(FRONTEND, 'next.config.mjs'))).toBe(false);
    expect(existsSync(join(FRONTEND, 'app'))).toBe(false);
    expect(existsSync(join(FRONTEND, 'vite.config.ts'))).toBe(true);
    expect(existsSync(join(FRONTEND, 'index.html'))).toBe(true);
  });

  it('runs every lifecycle script through Vite, not next', () => {
    expect(pkg.scripts.dev).toBe('vite');
    expect(pkg.scripts.build).toBe('vite build');
    expect(pkg.scripts.preview).toBe('vite preview');
    for (const [name, cmd] of Object.entries<string>(pkg.scripts)) {
      expect(`${name}: ${cmd}`).not.toMatch(/\bnext\b/);
    }
  });

  it('does not depend on next', () => {
    expect(pkg.dependencies?.next).toBeUndefined();
    expect(pkg.devDependencies?.next).toBeUndefined();
  });

  it('uses VITE_ env vars only (no NEXT_PUBLIC_ or process.env in client code)', () => {
    const offenders = sourceFiles(join(FRONTEND, 'src')).filter((file) =>
      /NEXT_PUBLIC_|process\.env\./.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('documents every VITE_ variable the source reads in .env.example', () => {
    const example = readFileSync(join(FRONTEND, '.env.example'), 'utf8');
    const used = new Set<string>();
    for (const file of sourceFiles(join(FRONTEND, 'src'))) {
      for (const [, name] of readFileSync(file, 'utf8').matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g)) used.add(name);
    }
    const missing = [...used].filter((name) => !example.includes(name));
    expect(missing).toEqual([]);
  });
});
