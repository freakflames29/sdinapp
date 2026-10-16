import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { validateCwd, detectProjectType, detectPackageManager, detectExpoRouter, readPkg } from '../src/detect.js';

const fix = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('project-type detection', () => {
  it('detects expo vs bare cli from fixtures', () => {
    expect(detectProjectType(readPkg(fix('expo-router')))).toBe('expo');
    expect(detectProjectType(readPkg(fix('expo-no-eas')))).toBe('expo');
    expect(detectProjectType(readPkg(fix('cli-src')))).toBe('cli');
    expect(detectProjectType(readPkg(fix('cli-app-only')))).toBe('cli');
  });

  it('rejects dirs without package.json or without react-native/expo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdinapp-'));
    expect(validateCwd(dir).ok).toBe(false);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { lodash: '1.0.0' } }));
    const bad = validateCwd(dir);
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/react-native|expo/);
  });

  it('detects expo router via dep or app/_layout.tsx', () => {
    expect(detectExpoRouter(fix('expo-router'), readPkg(fix('expo-router')))).toBe(true);
    expect(detectExpoRouter(fix('expo-no-eas'), readPkg(fix('expo-no-eas')))).toBe(false);
  });
});

describe('package-manager detection', () => {
  it('reads lockfiles in priority order, defaults to npm', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdinapp-pm-'));
    expect(detectPackageManager(dir)).toBe('npm');
    fs.writeFileSync(path.join(dir, 'yarn.lock'), '');
    expect(detectPackageManager(dir)).toBe('yarn');
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
    expect(detectPackageManager(dir)).toBe('pnpm');
    fs.rmSync(path.join(dir, 'pnpm-lock.yaml'));
    fs.rmSync(path.join(dir, 'yarn.lock'));
    fs.writeFileSync(path.join(dir, 'bun.lockb'), '');
    expect(detectPackageManager(dir)).toBe('bun');
  });
});
