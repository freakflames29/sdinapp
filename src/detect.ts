import fs from 'node:fs';
import path from 'node:path';
import type { ProjectType } from './types.js';

export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';

export function readPkg(cwd: string): any | null {
  const f = path.join(cwd, 'package.json');
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

export function validateCwd(cwd: string): { ok: boolean; error?: string; pkg?: any } {
  const pkg = readPkg(cwd);
  if (!pkg) return { ok: false, error: 'No package.json found. Run `npx sdinapp` from the root of your React Native project.' };
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!deps['react-native'] && !deps['expo']) {
    return { ok: false, error: 'package.json does not list `react-native` or `expo`. Run from your app project root.' };
  }
  return { ok: true, pkg };
}

export function detectProjectType(pkg: any): ProjectType {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  return deps['expo'] ? 'expo' : 'cli';
}

export function detectPackageManager(cwd: string): PackageManager {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(cwd, 'bun.lockb')) || fs.existsSync(path.join(cwd, 'bun.lock'))) return 'bun';
  return 'npm';
}

export function hasDep(pkg: any, name: string): boolean {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  return Boolean(deps[name]);
}

export function detectExpoRouter(cwd: string, pkg: any): boolean {
  if (hasDep(pkg, 'expo-router')) return true;
  const appDir = path.join(cwd, 'app');
  if (fs.existsSync(appDir) && fs.existsSync(path.join(appDir, '_layout.tsx'))) return true;
  return false;
}

export function hasTsAlias(cwd: string): boolean {
  for (const f of ['tsconfig.json', 'jsconfig.json']) {
    try {
      const raw = fs.readFileSync(path.join(cwd, f), 'utf8');
      if (raw.includes('"@/*"')) return true;
    } catch { /* optional file missing */ }
  }
  return false;
}

export function isTypeScriptProject(cwd: string): boolean {
  if (fs.existsSync(path.join(cwd, 'tsconfig.json'))) return true;
  const appTsx = fs.existsSync(path.join(cwd, 'App.tsx')) || fs.existsSync(path.join(cwd, 'app', '_layout.tsx'));
  return appTsx;
}
