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
  const text = String(value).trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) throw new Error(`Invalid monetary amount: ${text}`);
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace(/^[+-]/, '').split('.');
  if (/[1-9]/.test(fraction.slice(2))) throw new Error('Bank amounts must have no fractional cents.');
  const minor = (BigInt(whole) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, '0'))) * (negative ? -1n : 1n);
  if (minor < -(2n ** 63n) || minor > 2n ** 63n - 1n) throw new Error('Monetary amount exceeds the ledger limit.');
  return minor;
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
