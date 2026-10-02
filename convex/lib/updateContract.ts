import type { GenericValidator, Value } from 'convex/values';
import { ConvexError } from 'convex/values';

type CanonicalInput =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | Array<CanonicalInput>
  | { [key: string]: CanonicalInput };

export function canonical(value: CanonicalInput): string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The serializer handles Convex primitive representations.
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The serializer handles Convex primitive representations.
  if (value === null || typeof value !== 'object') return JSON.stringify(value) || 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(',')}}`;
}
export async function revision(value: CanonicalInput): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function assertLimit(groups: number, edits: number, bytes: number) {
  if (groups < 1 || groups > 50 || edits > 100 || bytes > 150_000)
    throw new ConvexError('Use 1–50 groups with at most 100 edits and a 150 KB proposal.');
}

export function describeValidator(validator: GenericValidator): Value {
  const base = { type: validator.kind, optional: validator.isOptional === 'optional' };
  switch (validator.kind) {
    case 'object':
      return {
        ...base,
        fields: Object.fromEntries(
          Object.entries(validator.fields).map(([key, field]) => [key, describeValidator(field)]),
        ),
      };
    case 'union':
      return { ...base, variants: validator.members.map(describeValidator) };
    case 'array':
      return { ...base, items: describeValidator(validator.element) };
    case 'id':
      return { ...base, table: validator.tableName };
    case 'literal':
      return { ...base, value: validator.value };
    case 'record':
      return { ...base, keys: describeValidator(validator.key), values: describeValidator(validator.value) };
    default:
      return base;
  }
}
