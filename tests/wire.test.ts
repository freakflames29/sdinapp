import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { wireHook } from '../src/wire.js';

const APP = `import React from 'react';
import { View, Text } from 'react-native';

export default function App() {
  return (
    <View>
      <Text>Hi</Text>
    </View>
  );
}
`;

function sandbox(initial = APP): { dir: string; target: string; hook: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdinapp-wire-'));
  fs.mkdirSync(path.join(dir, 'src', 'hooks'), { recursive: true });
  const hook = path.join(dir, 'src', 'hooks', 'useUpdate.ts');
  fs.writeFileSync(hook, 'export default function useUpdate() { return { checkForUpdate() {} }; }');
  const target = path.join(dir, 'App.tsx');
  fs.writeFileSync(target, initial);
  return { dir, target, hook };
}

describe('idempotent injection', () => {
  it('injects hook + useEffect, second run is a no-op with identical bytes', () => {
    const { dir, target, hook } = sandbox();
    const first = wireHook(target, hook, dir, false);
    expect(first.modified).toBe(true);
    const afterFirst = fs.readFileSync(target, 'utf8');
    expect(afterFirst).toContain('useUpdate');
    expect(afterFirst).toContain('checkForUpdate');
    expect(afterFirst).toMatch(/useEffect/);

    const second = wireHook(target, hook, dir, false);
    expect(second.modified).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toBe(afterFirst);
  });

  it('merges useEffect into existing react import without duplicating', () => {
    const { dir, target, hook } = sandbox(APP.replace("import React from 'react';", "import React, { useState } from 'react';"));
    wireHook(target, hook, dir, false);
    const text = fs.readFileSync(target, 'utf8');
    expect(text.match(/from 'react'/g)?.length).toBe(1);
    expect(text).toContain('useEffect');
    expect(text).toContain('useState');
  });

  it('skips files already using useUpdate', () => {
    const { dir, target, hook } = sandbox(APP.replace('export default function App() {', 'import { useUpdate } from "./src/hooks/useUpdate";\nexport default function App() {'));
    const r = wireHook(target, hook, dir, false);
    expect(r.modified).toBe(false);
  });

  it('computes a default import with a relative path from target to hook', () => {
    const { dir, target, hook } = sandbox();
    wireHook(target, hook, dir, false);
    const text = fs.readFileSync(target, 'utf8');
    expect(text).toContain(`import useUpdate from './src/hooks/useUpdate'`);
  });
});
