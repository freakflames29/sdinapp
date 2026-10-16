import fs from 'node:fs';
import path from 'node:path';
import { Project, QuoteKind, IndentationText, SyntaxKind, type SourceFile } from 'ts-morph';
import { hasTsAlias } from './detect.js';

const SCREEN_DIRS = ['src/screens', 'screens', 'src/app', 'app'];
const SCREEN_RE = /(home|splash|landing|welcome|index)/i;
const EXTS = ['.tsx', '.ts', '.jsx', '.js'];

export function collectCandidates(cwd: string, hasRouter: boolean): string[] {
  const found: string[] = [];
  const push = (f: string) => {
    if (fs.existsSync(f) && !found.includes(f)) found.push(f);
  };

  // a. Router entry points first
  if (hasRouter) {
    for (const e of EXTS) {
      push(path.join(cwd, 'app', '(tabs)', `index${e}`));
      push(path.join(cwd, 'app', `index${e}`));
    }
  }
  // a. Screen files named like Home / Splash / Landing
  for (const dir of SCREEN_DIRS) {
    const abs = path.join(cwd, dir);
    if (!fs.existsSync(abs)) continue;
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(abs);
    } catch {
      continue;
    }
    for (const e of entries) {
      const f = path.join(abs, e);
      try {
        if (fs.statSync(f).isFile() && EXTS.includes(path.extname(f)) && SCREEN_RE.test(e)) push(f);
      } catch { /* ignore */ }
    }
  }
  // b. Fallbacks
  for (const e of EXTS) push(path.join(cwd, `App${e}`));
  if (hasRouter) {
    for (const e of EXTS) push(path.join(cwd, 'app', `_layout${e}`));
  }
  return found;
}

export function selectTargetFile(cwd: string, hasRouter: boolean, override?: string): string | null {
  if (override) {
    const abs = path.isAbsolute(override) ? override : path.join(cwd, override);
    return fs.existsSync(abs) ? abs : null;
  }
  const c = collectCandidates(cwd, hasRouter);
  return c[0] ?? null;
}

export interface WireResult {
  modified: boolean;
  reason: string;
}

export function wireHook(targetFile: string, hookFile: string, cwd: string, dryRun: boolean): WireResult {
  const raw = fs.readFileSync(targetFile, 'utf8');
  if (raw.includes('useUpdate')) return { modified: false, reason: 'useUpdate already used — skipped' };

  const project = new Project({ useInMemoryFileSystem: false, skipAddingFilesFromTsConfig: true });
  const single = (raw.match(/from\s+'/g) ?? []).length >= (raw.match(/from\s+"/g) ?? []).length;
  project.manipulationSettings.set({ quoteKind: single ? QuoteKind.Single : QuoteKind.Double });
  project.manipulationSettings.set({ indentationText: /^\s{4,}/m.test(raw) ? IndentationText.FourSpaces : IndentationText.TwoSpaces });
  const sf = project.addSourceFileAtPath(targetFile);

  const importPath = toImportPath(cwd, targetFile, hookFile);
  ensureUseEffectImport(sf);
  sf.addImportDeclaration({ defaultImport: 'useUpdate', moduleSpecifier: importPath });

  const body = findComponentBody(sf);
  if (!body) {
    return { modified: false, reason: 'No component body found — pass --screen <path> or wire manually' };
  }
  body.insertStatements(0, [
    'const { checkForUpdate } = useUpdate()',
    'useEffect(() => {\n  checkForUpdate()\n}, [])',
  ]);

  const next = sf.getFullText();
  if (next === raw) return { modified: false, reason: 'No changes needed' };
  if (!dryRun) fs.writeFileSync(targetFile, next);
  return { modified: true, reason: 'Hook wired' };
}

export function toImportPath(cwd: string, fromFile: string, hookFile: string): string {
  const noExt = hookFile.replace(/\.(tsx?|jsx?)$/, '');
  if (hasTsAlias(cwd)) {
    const relToCwd = path.relative(cwd, noExt).split(path.sep).join('/');
    if (relToCwd.startsWith('src/')) return '@/' + relToCwd.slice(4);
  }
  let rel = path.relative(path.dirname(fromFile), noExt).split(path.sep).join('/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

function ensureUseEffectImport(sf: SourceFile): void {
  const existing = sf.getImportDeclarations().find((d) => d.getModuleSpecifierValue() === 'react');
  if (!existing) {
    sf.insertImportDeclaration(0, { namedImports: ['useEffect'], moduleSpecifier: 'react' });
    return;
  }
  const named = existing.getNamedImports().map((n) => n.getName());
  if (!named.includes('useEffect')) existing.addNamedImport('useEffect');
}

function findComponentBody(sf: SourceFile): { insertStatements: (i: number, s: string[]) => void } | null {
  // Prefer the default-exported component, else the first function containing JSX.
  const fns = sf.getFunctions();
  const exportedDefault = fns.find((f) => f.isDefaultExport());
  if (exportedDefault?.getBody()) return exportedDefault.getBody() as any;

  const vars = sf.getVariableDeclarations();
  const defaultExport = sf.getExportAssignments()[0]?.getExpression()?.getText();
  if (defaultExport) {
    const match = vars.find((v) => v.getName() === defaultExport);
    const arrow = match?.getInitializerIfKind(SyntaxKind.ArrowFunction);
    const b = arrow?.getBody();
    if (b && b.getKind() === SyntaxKind.Block) return b as any;
  }
  for (const v of vars) {
    const arrow = v.getInitializerIfKind(SyntaxKind.ArrowFunction);
    const b = arrow?.getBody();
    if (b && b.getKind() === SyntaxKind.Block && b.getText().includes('return')) return b as any;
  }
  const withJsx = fns.find((f) => (f.getBodyText() ?? '').includes('return'));
  if (withJsx?.getBody()) return withJsx.getBody() as any;
  const first = fns[0] ?? vars[0]?.getInitializerIfKind(SyntaxKind.ArrowFunction);
  const b = (first as any)?.getBody?.();
  return b && b.getKind?.() === SyntaxKind.Block ? b : null;
}
