import fs from 'node:fs';
import path from 'node:path';
import { Project, SyntaxKind } from 'ts-morph';

export interface SetupResult {
  created: string[];
  modified: string[];
  manual: string[];
}

const SHIM = `import Constants from "expo-constants";

export const getBundleId = () => {
  return Constants.expoConfig?.ios?.bundleIdentifier ?? '';
};
export const getVersion = () => {
  return Constants.expoConfig?.version;
};
export default {
  getBundleId,
  getVersion,
};
`;

const BABEL_PLUGIN_SNIPPET = `['module-resolver', { root: ['.'], alias: { 'react-native-device-info': './react-native-device-info.js' } }]`;

export function setupExpo(cwd: string, dryRun: boolean): SetupResult {
  const created: string[] = [];
  const modified: string[] = [];
  const manual: string[] = [
    'In-app updates do NOT work in Expo Go — use a dev build (npx expo prebuild / EAS build).',
    'Rebuild natives after installing: npx expo prebuild --clean, then an EAS/dev build.',
    'Ensure ios.bundleIdentifier is set in your Expo config (needed for iOS version lookup).',
  ];

  // 1. device-info shim (README requires replacing react-native-device-info on Expo)
  const shimPath = path.join(cwd, 'react-native-device-info.js');
  if (!fs.existsSync(shimPath)) {
    if (!dryRun) fs.writeFileSync(shimPath, SHIM);
    created.push(shimPath);
  } else if (!fs.readFileSync(shimPath, 'utf8').includes('expo-constants')) {
    if (!dryRun) fs.writeFileSync(shimPath, SHIM);
    modified.push(shimPath);
  }

  // 2. babel module-resolver alias
  const babelPath = ['babel.config.js', 'babel.config.cjs'].map((f) => path.join(cwd, f)).find((f) => fs.existsSync(f));
  if (babelPath) {
    const raw = fs.readFileSync(babelPath, 'utf8');
    if (!raw.includes('react-native-device-info')) {
      const next = addBabelPlugin(raw, babelPath);
      if (next && next !== raw) {
        if (!dryRun) fs.writeFileSync(babelPath, next);
        modified.push(babelPath);
      } else {
        manual.push(`Add module-resolver alias in ${path.basename(babelPath)}: ${BABEL_PLUGIN_SNIPPET}`);
      }
    }
  } else {
    manual.push(`No babel config found — if imports fail, add module-resolver alias: ${BABEL_PLUGIN_SNIPPET}`);
  }

  // 3. app.json ios.infoPlist (optional file, never fail)
  for (const name of ['app.json']) {
    const f = path.join(cwd, name);
    if (!fs.existsSync(f)) continue;
    try {
      const json = JSON.parse(fs.readFileSync(f, 'utf8'));
      const schemes = json?.expo?.ios?.infoPlist?.LSApplicationQueriesSchemes;
      if (!Array.isArray(schemes) || !schemes.includes('itms-apps')) {
        json.expo ??= {};
        json.expo.ios ??= {};
        json.expo.ios.infoPlist ??= {};
        const arr = json.expo.ios.infoPlist.LSApplicationQueriesSchemes ?? [];
        json.expo.ios.infoPlist.LSApplicationQueriesSchemes = [...arr, 'itms-apps'].filter((v, i, a) => a.indexOf(v) === i);
        if (!dryRun) fs.writeFileSync(f, JSON.stringify(json, null, 2) + '\n');
        modified.push(f);
      }
    } catch { /* optional file — leave alone, mention below */ }
  }
  // app.config.js/ts: only touch when safely detectable, else manual note
  for (const name of ['app.config.js', 'app.config.ts']) {
    const f = path.join(cwd, name);
    if (!fs.existsSync(f)) continue;
    try {
      const raw = fs.readFileSync(f, 'utf8');
      if (!raw.includes('itms-apps')) {
        manual.push(`${name} exists — ensure ios.infoPlist.LSApplicationQueriesSchemes includes "itms-apps".`);
      }
    } catch { /* ignore */ }
  }

  return { created, modified, manual };
}

function addBabelPlugin(raw: string, filePath: string): string | null {
  try {
    const project = new Project({ useInMemoryFileSystem: true });
    const sf = project.createSourceFile('babel.config.js', raw);
    const plugins = sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment).find((p) => p.getName() === 'plugins');
    const init = plugins?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
    if (!plugins || !init) return null;
    init.addElement(BABEL_PLUGIN_SNIPPET);
    return sf.getFullText();
  } catch {
    return null;
  }
}
