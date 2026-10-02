import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const cases = [
  {
    rule: 'no-chained-type-assertions',
    invalid: 'export const result = external as unknown as string;',
    valid: "export const result = 'ready' as const;",
  },
  {
    rule: 'no-conditional-empty-object-spread',
    invalid: 'export const result = { ...(enabled ? { count: 1 } : {}) };',
    valid: 'export const result = { count: enabled ? 1 : 0 };',
  },
  {
    rule: 'no-known-value-widening',
    invalid: "export const result: unknown = { id: 'account' };",
    valid: "type Account = { id: string }; export const result = { id: 'account' } satisfies Account;",
  },
  {
    rule: 'no-module-mocking',
    invalid: "import { vi } from 'vitest'; vi.mock('./service');",
    valid: 'export function read(service: { read(): string }) { return service.read(); }',
  },
  {
    rule: 'no-object-parameters',
    invalid: 'export function read(value: object) { return value; }',
    valid: 'type Account = { id: string }; export function read(value: Account) { return value.id; }',
  },
  {
    rule: 'no-reflect-apply',
    invalid: 'export const result = Reflect.apply(action, null, []);',
    valid: 'export const result = action();',
  },
  {
    rule: 'no-reflect-get',
    invalid: "export const result = Reflect.get(account, 'id');",
    valid: 'export const result = account.id;',
  },
  {
    rule: 'no-runtime-typeof',
    invalid: "export const result = typeof external === 'string';",
    valid: "export const result = typeof window !== 'undefined';",
  },
  {
    rule: 'no-shape-in-symbol-names',
    invalid: 'export const accountShape = { id: 1 };',
    valid: 'export const result = accountSchema.shape;',
  },
  {
    rule: 'no-unknown-parameters',
    invalid: 'export function read(value: unknown) { return value; }',
    valid: 'export function read(cause: unknown) { return cause; }',
  },
  {
    rule: 'no-unknown-returns',
    invalid: 'export function read(): Promise<unknown> { return external; }',
    valid: 'export function read(): Promise<string> { return external; }',
  },
  {
    rule: 'no-unknown-type-aliases',
    invalid: 'type Input = unknown; export type Result = Input;',
    valid: 'export type Account = { id: string };',
  },
  {
    rule: 'no-unsafe-dictionary-type',
    invalid: 'export type Accounts = Record<string, unknown>;',
    valid: 'type Account = { id: string }; export type Accounts = Record<string, Account>;',
  },
  {
    rule: 'no-widen-then-assert',
    invalid:
      "const account: unknown = { id: 'account' };\n// SAFETY: fixture deliberately checks the lost evidence flow.\nexport const result = account as { id: string };",
    valid: "const account = { id: 'account' }; export const result = account.id;",
  },
  {
    rule: 'require-safety-comment-for-type-assertion',
    invalid: 'export const result = external as string;',
    valid:
      '// SAFETY: the upstream parser establishes this string contract.\nexport const result = external as string;',
  },
];

test('the configured anti-slop rules reject violations and accept supported alternatives', async (suite) => {
  const directory = mkdtempSync(join(tmpdir(), 'finance-anti-slop-'));
  try {
    const config = JSON.parse(readFileSync(join(projectRoot, '.oxlintrc.json'), 'utf8'));
    assert.deepEqual(Object.keys(config.rules).sort(), cases.map(({ rule }) => `anti-slop/${rule}`).sort());
    const fixtureConfig = {
      ...config,
      options: { ...config.options, typeAware: false },
      jsPlugins: config.jsPlugins.map((plugin) => ({
        ...plugin,
        specifier: join(projectRoot, plugin.specifier),
      })),
      ignorePatterns: [],
      overrides: [],
    };
    const configPath = join(directory, '.oxlintrc.json');
    writeFileSync(configPath, JSON.stringify(fixtureConfig));
    for (const { rule, invalid, valid } of cases) {
      writeFileSync(join(directory, `${rule}.invalid.ts`), invalid);
      writeFileSync(join(directory, `${rule}.valid.ts`), valid);
    }

    const result = spawnSync(
      process.execPath,
      [join(projectRoot, 'node_modules/oxlint/bin/oxlint'), '--config', configPath, '--format', 'json', directory],
      { encoding: 'utf8', timeout: 30_000 },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stderr, '');
    const { diagnostics } = JSON.parse(result.stdout);

    for (const { rule } of cases) {
      await suite.test(rule, () => {
        const invalid = diagnostics.filter(({ filename }) => basename(filename) === `${rule}.invalid.ts`);
        assert.ok(
          invalid.some(({ code }) => code === `anti-slop(${rule})`),
          JSON.stringify(invalid),
        );
        const valid = diagnostics.filter(({ filename }) => basename(filename) === `${rule}.valid.ts`);
        assert.deepEqual(valid, []);
      });
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
