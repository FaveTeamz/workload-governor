/**
 * #1257: @types/react and @types/react-dom must match the installed React
 * major version, in package.json and in the resolved lockfile.
 */
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const FRONTEND = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(FRONTEND, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(FRONTEND, 'package-lock.json'), 'utf8'));

const major = (version: string) => Number(version.replace(/^[^\d]*/, '').split('.')[0]);
const declared = (name: string) => pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
const locked = (name: string) => lock.packages[`node_modules/${name}`]?.version as string;

describe('React type definitions match React (#1257)', () => {
  const reactMajor = major(declared('react'));

  it('uses the same major for React and React DOM', () => {
    expect(major(locked('react'))).toBe(reactMajor);
    expect(major(locked('react-dom'))).toBe(reactMajor);
  });

  it.each(['@types/react', '@types/react-dom'])('%s is declared and locked at the React major', (name) => {
    expect(major(declared(name))).toBe(reactMajor);
    expect(major(locked(name))).toBe(reactMajor);
  });
});
