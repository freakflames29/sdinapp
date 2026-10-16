import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { selectTargetFile, collectCandidates } from '../src/wire.js';
import { readPkg, detectExpoRouter } from '../src/detect.js';

const fix = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('target-file selection', () => {
  it('expo router prefers app/(tabs)/index.tsx', () => {
    const cwd = fix('expo-router');
    const router = detectExpoRouter(cwd, readPkg(cwd));
    expect(router).toBe(true);
    expect(selectTargetFile(cwd, router)).toBe(path.join(cwd, 'app', '(tabs)', 'index.tsx'));
  });

  it('expo without eas.json falls back to App.tsx, never crashes', () => {
    const cwd = fix('expo-no-eas');
    expect(selectTargetFile(cwd, false)).toBe(path.join(cwd, 'App.tsx'));
    expect(collectCandidates(cwd, false)).toContain(path.join(cwd, 'App.tsx'));
  });

  it('bare cli with src/ prefers Home screen over App.tsx', () => {
    const cwd = fix('cli-src');
    const target = selectTargetFile(cwd, false);
    expect(target).toBe(path.join(cwd, 'src', 'screens', 'HomeScreen.tsx'));
  });

  it('bare cli with only App.tsx falls back to it', () => {
    const cwd = fix('cli-app-only');
    expect(selectTargetFile(cwd, false)).toBe(path.join(cwd, 'App.tsx'));
  });

  it('honors --screen override and rejects missing paths', () => {
    const cwd = fix('cli-src');
    expect(selectTargetFile(cwd, false, 'App.tsx')).toBe(path.join(cwd, 'App.tsx'));
    expect(selectTargetFile(cwd, false, 'Nope.tsx')).toBeNull();
  });
});
