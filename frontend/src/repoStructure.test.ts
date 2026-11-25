/**
 * Structural guards for the frontend package.
 *
 * #1259: `src/components/` is the only components directory. The legacy
 *        Next.js `frontend/components/` tree was merged into it and must not
 *        come back, and nothing may import from it.
 * #1258: `vitest` is a test runner, so it must be declared exactly once and
 *        only under devDependencies.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, resolve, sep } from 'path';

const FRONTEND = resolve(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx?|jsx?)$/.test(name) ? [full] : [];
  });
}

describe('single canonical components directory (#1259)', () => {
  it('has no legacy frontend/components directory', () => {
    expect(existsSync(join(FRONTEND, 'components'))).toBe(false);
  });

  it('has no imports that reach the legacy directory', () => {
    const legacyDir = join(FRONTEND, 'components');
    const offenders: string[] = [];
    for (const file of sourceFiles(join(FRONTEND, 'src'))) {
      for (const [, spec] of readFileSync(file, 'utf8').matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
        const target = resolve(dirname(file), spec);
        if (target === legacyDir || target.startsWith(legacyDir + sep)) offenders.push(`${file}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('maps the @/ alias into src/', () => {
    const tsconfig = JSON.parse(readFileSync(join(FRONTEND, 'tsconfig.json'), 'utf8'));
    expect(tsconfig.compilerOptions.paths['@/*']).toEqual(['./src/*']);
  });

  it('has no duplicate component file names across src/components', () => {
    const names = readdirSync(join(FRONTEND, 'src', 'components')).filter((n) => /\.tsx$/.test(n) && !/\.(test|stories)\.tsx$/.test(n));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('vitest dependency declaration (#1258)', () => {
  const pkg = JSON.parse(readFileSync(join(FRONTEND, 'package.json'), 'utf8'));

  it('declares vitest only under devDependencies', () => {
    expect(pkg.dependencies?.vitest).toBeUndefined();
    expect(pkg.devDependencies?.vitest).toBeDefined();
  });

  it('keeps every vitest / @vitest package out of production dependencies', () => {
    const prod = Object.keys(pkg.dependencies ?? {}).filter((n) => n === 'vitest' || n.startsWith('@vitest/'));
    expect(prod).toEqual([]);
  });

  it('declares vitest exactly once in package.json', () => {
    const raw = readFileSync(join(FRONTEND, 'package.json'), 'utf8');
    expect(raw.match(/"vitest"\s*:/g)).toHaveLength(1);
  });

  it('resolves a single vitest version in package-lock.json', () => {
    const lock = JSON.parse(readFileSync(join(FRONTEND, 'package-lock.json'), 'utf8'));
    const copies = Object.keys(lock.packages ?? {}).filter((p) => /(^|\/)node_modules\/vitest$/.test(p));
    expect(copies).toEqual(['node_modules/vitest']);
    expect(lock.packages[''].dependencies?.vitest).toBeUndefined();
  });
});
