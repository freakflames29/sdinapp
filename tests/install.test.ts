import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { installCommand, localExpoBin } from '../src/install.js';

function tmpPkg(extra: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdinapp-install-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { expo: '~52.0.0', ...extra } }));
  return dir;
}

describe('install command selection', () => {
  it('uses the local Expo CLI when node_modules is installed (never fetches latest SDK)', () => {
    const dir = tmpPkg();
    fs.mkdirSync(path.join(dir, 'node_modules', '.bin'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', '.bin', 'expo'), '#!/bin/sh');
    expect(localExpoBin(dir)).toContain(path.join('node_modules', '.bin'));
    const { cmd, aligned } = installCommand(dir, 'expo', 'sp-react-native-in-app-updates');
    expect(cmd).toEqual([localExpoBin(dir)!, 'install', 'sp-react-native-in-app-updates']);
    expect(cmd.join(' ')).not.toContain('npx');
    expect(aligned).toBe(true);
  });

  it('falls back to the lockfile package manager when the Expo CLI is missing', () => {
    const dir = tmpPkg();
    fs.writeFileSync(path.join(dir, 'yarn.lock'), '');
    expect(localExpoBin(dir)).toBeNull();
    const { cmd, aligned } = installCommand(dir, 'expo', 'sp-react-native-in-app-updates');
    expect(cmd).toEqual(['yarn', 'add', 'sp-react-native-in-app-updates']);
    expect(aligned).toBe(false);
  });

  it('bare CLI projects always use the package manager', () => {
    const dir = tmpPkg();
    const { cmd } = installCommand(dir, 'cli', 'sp-react-native-in-app-updates');
    expect(cmd).toEqual(['npm', 'install', 'sp-react-native-in-app-updates']);
  });
});
