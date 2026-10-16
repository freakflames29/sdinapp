import fs from 'node:fs';
import path from 'node:path';
import prompts from 'prompts';
import { ts } from 'ts-morph';
import { HOOK_FILE_BASE } from './constants.js';
import { isTypeScriptProject } from './detect.js';

declare const __dirname: string;

export function templatePath(): string {
  const candidates = [
    path.resolve(__dirname, '../templates/useUpdate.ts'), // src/ layout (dev/vitest)
    path.resolve(__dirname, '../../templates/useUpdate.ts'), // dist/ layout (built)
    path.resolve(process.cwd(), 'templates/useUpdate.ts'),
  ];
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) throw new Error(`Hook template not found. Looked in: ${candidates.join(', ')}`);
  return found;
}

export function hookTargetDir(cwd: string, hasRouter: boolean): string {
  if (fs.existsSync(path.join(cwd, 'src'))) return path.join(cwd, 'src', 'hooks');
  if (hasRouter) return path.join(cwd, 'hooks');
  return path.join(cwd, 'src', 'hooks');
}

export async function copyHook(cwd: string, hasRouter: boolean, dryRun: boolean, yes: boolean): Promise<{ file: string; skipped: boolean }> {
  const dir = hookTargetDir(cwd, hasRouter);
  const ts = isTypeScriptProject(cwd);
  const fileName = ts ? `${HOOK_FILE_BASE}.ts` : `${HOOK_FILE_BASE}.js`;
  const dest = path.join(dir, fileName);
  if (fs.existsSync(dest) && (yes || dryRun)) return { file: dest, skipped: true };
  if (fs.existsSync(dest) && !yes) {
    const ans = await prompts({ type: 'confirm', name: 'over', message: `${path.relative(cwd, dest)} exists. Overwrite?`, initial: false });
    if (!ans.over) return { file: dest, skipped: true };
  }
  let content = fs.readFileSync(templatePath(), 'utf8');
  if (!ts) content = stripTypes(content);
  if (!dryRun) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dest, content);
  }
  return { file: dest, skipped: false };
}

export function stripTypes(source: string): string {
  try {
    // ts-morph bundles TypeScript — no extra dependency.
    const out = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.Preserve },
    });
    return out.outputText;
  } catch {
    return source; // never block setup on stripping; caller can rename manually
  }
}
