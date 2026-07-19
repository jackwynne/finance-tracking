export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(pending|new zealand|nz)\b/g, ' ')
    .replace(/\*+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function maskAccountIdentifier(value: string): string {
  const compact = value.replace(/\s+/g, '');
  const visible = compact.slice(-4);
  return visible ? `•••• ${visible}` : 'Account';
}

export function toMinorUnits(value: string | number): bigint {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid monetary amount: ${String(value)}`);
  }
  return BigInt(Math.round(numeric * 100));
}

export function formatMinorUnits(value: bigint): number {
  return Number(value) / 100;
}

export function normalizeDate(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 8) {
    throw new Error(`Invalid date: ${value}`);
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function daysBetween(a: string, b: string): number {
  const left = Date.parse(`${a}T00:00:00Z`);
  const right = Date.parse(`${b}T00:00:00Z`);
  return Math.abs(left - right) / 86_400_000;
}
