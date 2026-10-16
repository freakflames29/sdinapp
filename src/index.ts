#!/usr/bin/env node
import path from 'node:path';
import pc from 'picocolors';
import prompts from 'prompts';
import { validateCwd, detectProjectType, detectExpoRouter, detectPackageManager } from './detect.js';
import { installPackages } from './install.js';
import { setupExpo } from './setup/expo.js';
import { setupCli } from './setup/cli.js';
import { copyHook } from './copyHook.js';
import { collectCandidates, selectTargetFile, wireHook } from './wire.js';
import { startStep } from './spinner.js';
import type { Flags, ChangeLog } from './types.js';

function parseArgs(argv: string[]): Flags {
  const flags: Flags = { dryRun: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') flags.dryRun = true;
    else if (argv[i] === '--yes' || argv[i] === '-y') flags.yes = true;
    else if (argv[i] === '--screen' && argv[i + 1]) flags.screen = argv[++i];
    else if (argv[i].startsWith('--screen=')) flags.screen = argv[i].slice('--screen='.length);
  }
  return flags;
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const flags = parseArgs(process.argv.slice(2));

  const v = validateCwd(cwd);
  if (!v.ok) {
    console.error(pc.red(`error: ${v.error}`));
    process.exit(1);
  }
  const type = detectProjectType(v.pkg);
  const hasRouter = type === 'expo' ? detectExpoRouter(cwd, v.pkg) : false;
  const pm = detectPackageManager(cwd);
  console.log(pc.cyan(`sdinapp: ${type === 'expo' ? 'Expo' : 'bare React Native'} project${hasRouter ? ' + Router' : ''} (package manager: ${pm})`));
  if (flags.dryRun) console.log(pc.yellow('dry-run: printing planned changes, writing nothing.'));

  const log: ChangeLog = { installed: [], created: [], modified: [], manual: [] };
  const onLine = (s: string) => console.log(pc.dim(`$ ${s}`));

  // 1. Install
  const installing = startStep('Installing packages');
  try {
    installing.stop(); // child installers stream their own output
    const { installed, unaligned } = await installPackages(cwd, type, flags.dryRun, onLine);
    log.installed = installed;
    if (unaligned) {
      log.manual.push(`Versions were not SDK-aligned (Expo CLI not installed in node_modules) — run \`${pm} install\`, then \`npx expo install --check\` to align.`);
    }
    installing.succeed(log.installed.length > 0 ? `Installed ${log.installed.join(', ')}` : 'Packages already present');
  } catch (e: any) {
    installing.fail('Install failed');
    console.error(pc.red(`Install failed: ${e?.message ?? e}`));
    console.error(pc.yellow('Fix: check network access, then rerun. Already-installed packages are skipped automatically.'));
    process.exit(1);
  }

  // 2. Platform setup
  const settingUp = startStep(type === 'expo' ? 'Applying Expo setup' : 'Applying bare CLI setup');
  const setup = type === 'expo' ? setupExpo(cwd, flags.dryRun) : setupCli(cwd, flags.dryRun);
  settingUp.succeed(type === 'expo' ? 'Expo setup applied' : 'Bare CLI setup applied');
  log.created.push(...setup.created.map((f) => rel(cwd, f)));
  log.modified.push(...setup.modified.map((f) => rel(cwd, f)));
  log.manual.push(...setup.manual);

  // 3. Copy hook
  const copying = startStep('Copying useUpdate hook');
  const { file: hookFile, skipped } = await copyHook(cwd, hasRouter, flags.dryRun, flags.yes);
  copying.succeed(skipped ? 'Hook already exists — left untouched' : `Hook copied to ${rel(cwd, hookFile)}`);
  if (skipped) log.manual.push(`Hook already existed at ${rel(cwd, hookFile)} — left untouched.`);
  else log.created.push(rel(cwd, hookFile));

  // 4. Wire hook
  let target = selectTargetFile(cwd, hasRouter, flags.screen);
  if (flags.screen && !target) {
    console.error(pc.red(`error: --screen target not found: ${flags.screen}`));
    process.exit(1);
  }
  if (!target) {
    const candidates = collectCandidates(cwd, hasRouter);
    if (candidates.length === 0) {
      log.manual.push('No screen/App component found — call checkForUpdate() from useUpdate() manually where you want the update check.');
    } else if (flags.yes) {
      target = candidates[0];
    } else {
      const ans = await prompts({
        type: 'select', name: 'file', message: 'Which screen should call checkForUpdate()?',
        choices: candidates.map((c) => ({ title: rel(cwd, c), value: c })),
      });
      if (ans.file) target = ans.file as string;
      else log.manual.push('No target picked — wire useUpdate() manually (see README).');
    }
  }
  if (target) {
    if (flags.dryRun) {
      log.modified.push(`${rel(cwd, target)} (planned: inject useUpdate + useEffect)`);
    } else {
      const wiring = startStep(`Wiring hook into ${rel(cwd, target)}`);
      const r = wireHook(target, hookFile, cwd, flags.dryRun);
      if (r.modified) {
        wiring.succeed(`Hook wired into ${rel(cwd, target)}`);
        log.modified.push(rel(cwd, target));
      } else {
        wiring.succeed(`Skipped: ${r.reason}`);
        log.manual.push(`${rel(cwd, target)}: ${r.reason}.`);
      }
    }
  }

  // 5. Summary
  printSummary(log);
}

function rel(cwd: string, f: string): string {
  return path.isAbsolute(f) ? path.relative(cwd, f) : f;
}

function printSummary(log: ChangeLog): void {
  const show = (label: string, items: string[], color: (s: string) => string) => {
    if (items.length === 0) return;
    console.log(pc.bold(label));
    for (const i of items) console.log(`  ${color('•')} ${i}`);
  };
  console.log('');
  show('Installed:', log.installed, pc.green);
  show('Created:', log.created, pc.green);
  show('Modified:', log.modified, pc.green);
  show('Manual steps remaining:', log.manual, pc.yellow);
  if (log.manual.length === 0) console.log(pc.green('Done — no manual steps.'));
}

main().catch((e) => {
  console.error(pc.red(`error: ${e?.message ?? e}`));
  process.exit(1);
});
