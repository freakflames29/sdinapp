import fs from 'node:fs';
import path from 'node:path';
import type { SetupResult } from './expo.js';

const PLIST_SNIPPET = `\t<key>LSApplicationQueriesSchemes</key>\n\t<array>\n\t\t<string>itms-apps</string>\n\t</array>\n`;

// Bare React Native: native module needs no Gradle changes (Play Core is bundled,
// New Architecture supported). iOS needs the itms-apps query scheme for store links.
export function setupCli(cwd: string, dryRun: boolean): SetupResult {
  const created: string[] = [];
  const modified: string[] = [];
  const manual: string[] = [
    'iOS: run `cd ios && pod install` after installing the package.',
    'Android: in-app updates need a release build on a real device (minSdkVersion 21+); debug builds cannot be tested via Play.',
  ];

  for (const plist of findInfoPlists(cwd)) {
    try {
      const raw = fs.readFileSync(plist, 'utf8');
      if (raw.includes('itms-apps')) continue;
      const next = raw.includes('</dict>')
        ? raw.replace('</dict>', `${PLIST_SNIPPET}</dict>`)
        : raw + PLIST_SNIPPET;
      if (next !== raw) {
        if (!dryRun) fs.writeFileSync(plist, next);
        modified.push(plist);
      }
    } catch { /* never fail on optional native files */ }
  }
  if (findInfoPlists(cwd).length === 0) {
    manual.unshift('iOS: no Info.plist found under ios/ — add LSApplicationQueriesSchemes=itms-apps manually if iOS is used.');
  }

  return { created, modified, manual };
}

export function findInfoPlists(cwd: string): string[] {
  const iosDir = path.join(cwd, 'ios');
  const out: string[] = [];
  if (!fs.existsSync(iosDir)) return out;
  const walk = (dir: string, depth: number) => {
    if (depth > 4) return;
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const f = path.join(dir, e);
      try {
        if (fs.statSync(f).isDirectory()) walk(f, depth + 1);
        else if (e === 'Info.plist') out.push(f);
      } catch { /* ignore */ }
    }
  };
  walk(iosDir, 0);
  return out;
}
