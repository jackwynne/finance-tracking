import { z } from 'zod';

import { maskAccountIdentifier, normalizeText } from './lib/finance';

type JsonValue = z.infer<ReturnType<typeof z.json>>;
const accountSchema = z.object({
  _id: z.string().startsWith('acc_'),
  name: z.string().min(1),
  status: z.string(),
  formatted_account: z.string().optional(),
  connection: z.object({ connection_type: z.literal('official'), name: z.string().regex(/\banz\b/i) }),
  payment_consents: z.array(z.json()).max(0).optional(),
  balance: z.object({
    current: z.number(),
    available: z.number().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
  refreshed: z.object({ balance: z.iso.datetime().optional(), transactions: z.iso.datetime().optional() }).optional(),
});
const transactionSchema = z.object({
  _id: z.string().startsWith('trans_'),
  _account: z.string().startsWith('acc_'),
  date: z.iso.datetime(),
  description: z.string().min(1),
  amount: z.number(),
});
const pageSchema = z.object({
  success: z.literal(true),
  items: z.array(z.json()),
  cursor: z.object({ next: z.string().nullable() }).optional(),
});
export function akahuMinor(value: number): bigint {
  if (!Number.isFinite(value) || !Number.isSafeInteger(Math.round(value * 100))) {
    throw new Error('Invalid Akahu monetary amount.');
  }
  return BigInt(Math.round(value * 100));
}
export function parseAkahuAccount(input: JsonValue) {
  const row = accountSchema.parse(input);
  const balance = row.balance;
  const refreshed = row.refreshed;
  return {
    providerAccountId: row._id,
    name: row.name,
    mask: maskAccountIdentifier(row.formatted_account ?? ''),
    currency: balance.currency,
    status: row.status,
    ledgerMinor: akahuMinor(balance.current),
    availableMinor: balance.available === undefined ? undefined : akahuMinor(balance.available),
    refreshedAt: refreshed?.balance,
    transactionsRefreshedAt: refreshed?.transactions,
  };
}
export function parseAkahuTransaction(input: JsonValue, currency: string) {
  const row = transactionSchema.parse(input);
  const date = row.date;
  if (!Number.isFinite(Date.parse(date))) throw new Error('Invalid Akahu transaction date.');
  const postedDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
  const description = row.description;
  return {
    providerTransactionId: row._id,
    providerAccountId: row._account,
    postedDate,
    amountMinor: akahuMinor(row.amount),
    currency,
    description,
    normalizedDescription: normalizeText(description),
    sourceJson: JSON.stringify(input),
  };
}
export function parseAkahuPage(input: JsonValue) {
  const page = pageSchema.parse(input);
  return { items: page.items, next: page.cursor?.next ?? null };
}
export async function requestAkahu(
  path: string,
  options: { appToken: string; userToken: string; method?: 'GET' | 'POST' },
) {
  const response = await fetch(`https://api.akahu.io/v1${path}`, {
    method: options.method ?? 'GET',
    headers: { 'Authorization': `Bearer ${options.userToken}`, 'X-Akahu-Id': options.appToken },
  });
  if (!response.ok) throw new Error(`Akahu request failed with status ${response.status}.`);
  const body: unknown = await response.json();
  return z.json().parse(body);
}

export async function fetchAkahuPages(
  path: string,
  request: (path: string) => Promise<JsonValue>,
  consume: (items: Array<JsonValue>) => Promise<void>,
) {
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const separator = path.includes('?') ? '&' : '?';
    const page = parseAkahuPage(
      await request(cursor ? `${path}${separator}cursor=${encodeURIComponent(cursor)}` : path),
    );
    await consume(page.items);
    cursor = page.next;
    if (cursor && seen.has(cursor)) throw new Error('Akahu returned a repeated pagination cursor.');
    if (cursor) seen.add(cursor);
  } while (cursor !== null);
}
