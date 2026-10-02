import type { FunctionArgs } from 'convex/server';

import type { api } from '../../../convex/_generated/api';

type AllocationWeight = FunctionArgs<typeof api.portfolio.saveAllocation>['weights'][number];

/* eslint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters -- These functions parse uploaded JSON at the external input boundary. */
// eslint-disable-next-line anti-slop/no-unknown-returns -- Private raw field lookup is consumed only by the typed input parsers below.
function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected a JSON object.');
  const entry = Object.entries(value).find(([name]) => name === key);
  if (!entry) throw new Error(`Missing ${key}.`);
  return entry[1];
}
export function stringField(value: unknown, key: string): string {
  const result = field(value, key);
  if (typeof result !== 'string') throw new Error(`${key} must be text.`);
  return result;
}
export function boolField(value: unknown, key: string): boolean {
  const result = field(value, key);
  if (typeof result !== 'boolean') throw new Error(`${key} must be true or false.`);
  return result;
}
export function weightsField(value: unknown): Array<AllocationWeight> {
  const result = field(value, 'weights');
  if (!Array.isArray(result)) throw new Error('Weights must be an array.');
  return result.map((row) => {
    const parsed: AllocationWeight = {
      label: stringField(row, 'label'),
      weight: stringField(row, 'weight'),
    };
    const issuerId = optionalStringField(row, 'issuerId', '');
    if (issuerId) parsed.issuerId = issuerId;
    return parsed;
  });
}

export function optionalStringField(value: unknown, key: string, fallback: string): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected a JSON object.');
  const entry = Object.entries(value).find(([name]) => name === key);
  if (!entry) return fallback;
  if (typeof entry[1] !== 'string') throw new Error(`${key} must be text.`);
  return entry[1];
}
