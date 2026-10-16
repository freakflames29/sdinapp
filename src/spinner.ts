import readline from 'node:readline';
import pc from 'picocolors';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface Step {
  succeed: (msg?: string) => void;
  fail: (msg?: string) => void;
  /** Clear the spinner line without printing (e.g. before streaming child output). */
  stop: () => void;
}

// Minimal TTY spinner — plain log lines when piped/CI so output stays readable.
export function startStep(label: string): Step {
  if (!process.stdout.isTTY) {
    console.log(`${label}...`);
    return {
      succeed: (msg) => console.log(pc.green(`✓ ${msg ?? label}`)),
      fail: (msg) => console.log(pc.red(`✕ ${msg ?? label}`)),
      stop: () => {},
    };
  }
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r${pc.cyan(FRAMES[i++ % FRAMES.length])} ${label}...`);
  }, 80);
  const clear = () => {
    clearInterval(timer);
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
  };
  return {
    succeed: (msg) => {
      clear();
      console.log(`${pc.green('✓')} ${msg ?? label}`);
    },
    fail: (msg) => {
      clear();
      console.log(`${pc.red('✕')} ${msg ?? label}`);
    },
    stop: clear,
  };
}
