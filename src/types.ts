export type ProjectType = 'expo' | 'cli';

export interface Flags {
  dryRun: boolean;
  yes: boolean;
  screen?: string;
}

export interface ChangeLog {
  installed: string[];
  created: string[];
  modified: string[];
  manual: string[];
}
