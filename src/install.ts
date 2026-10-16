import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import { IN_APP_UPDATES_PKG, DEVICE_INFO_PKG, EXPO_CONSTANTS_PKG } from './constants.js';
import { detectPackageManager, hasDep, readPkg } from './detect.js';
import type { ProjectType } from './types.js';

export function missingPackages(cwd: string, type: ProjectType): string[] {
  const pkg = readPkg(cwd);
  const out: string[] = [];
  if (!hasDep(pkg, IN_APP_UPDATES_PKG)) out.push(IN_APP_UPDATES_PKG);
  if (type === 'cli' && !hasDep(pkg, DEVICE_INFO_PKG)) out.push(DEVICE_INFO_PKG);
  if (type === 'expo' && !hasDep(pkg, EXPO_CONSTANTS_PKG)) out.push(EXPO_CONSTANTS_PKG);
  return out;
}

// Local Expo CLI only — `npx expo` would download the latest SDK's CLI when
// node_modules isn't installed, breaking the project's SDK version.
export function localExpoBin(cwd: string): string | null {
  const bin = path.join(cwd, 'node_modules', '.bin', process.platform === 'win32' ? 'expo.cmd' : 'expo');
  return fs.existsSync(bin) ? bin : null;
}

export function installCommand(cwd: string, type: ProjectType, pkg: string): { cmd: string[]; aligned: boolean } {
  if (type === 'expo') {
    const local = localExpoBin(cwd);
    if (local) return { cmd: [local, 'install', pkg], aligned: true };
    // No local CLI: plain add, plus a manual note to align versions afterwards.
    return { cmd: addCommand(cwd, pkg), aligned: false };
  }
  return { cmd: addCommand(cwd, pkg), aligned: true };
}

function addCommand(cwd: string, pkg: string): string[] {
  const pm = detectPackageManager(cwd);
  if (pm === 'yarn') return ['yarn', 'add', pkg];
  if (pm === 'pnpm') return ['pnpm', 'add', pkg];
  if (pm === 'bun') return ['bun', 'add', pkg];
  return ['npm', 'install', pkg];
}

export async function installPackages(cwd: string, type: ProjectType, dryRun: boolean, onLine: (s: string) => void): Promise<{ installed: string[]; unaligned: boolean }> {
  const missing = missingPackages(cwd, type);
  if (missing.length === 0) return { installed: [], unaligned: false };
  let unaligned = false;
  for (const m of missing) {
    const { cmd, aligned } = installCommand(cwd, type, m);
    unaligned = unaligned || !aligned;
    onLine(cmd.join(' '));
    if (dryRun) continue;
    await execa(cmd[0], cmd.slice(1), { cwd, stdio: 'inherit' });
  }
  return { installed: missing, unaligned };
}
