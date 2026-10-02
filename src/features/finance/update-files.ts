import type { Value } from 'convex/values';

export function downloadUpdateFile(fileName: string, value: Value) {
  const text = JSON.stringify(
    value,
    (_key, entry: Value) => {
      // JSON download boundary: minor-unit BigInts must remain decimal strings for ChatGPT.
      // eslint-disable-next-line anti-slop/no-runtime-typeof
      return typeof entry === 'bigint' ? entry.toString() : entry;
    },
    2,
  );
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function readUpdateFile(file: File): Promise<string> {
  if (file.size > 150_000)
    throw new Error('Choose a proposals file smaller than 150 KB. Split a larger review into separate jobs.');
  if (!/\.(json)$/i.test(file.name)) throw new Error('Choose the JSON proposals file returned by ChatGPT.');
  const text = await file.text();
  if (!text.trim()) throw new Error('The proposals file is empty.');
  return text;
}

async function hashText(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function collectUpdatePages<Row extends { _id: string }>(
  loadPage: (cursor: string | null) => Promise<{ page: Array<Row>; continueCursor: string; isDone: boolean }>,
  onProgress: (count: number) => void,
  includeRow?: (row: Row) => boolean,
) {
  const chunks: Array<{ name: string; count: number; sha256: string; records: Array<Row> }> = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let includedCount = 0;
  for (let pageNumber = 1; ; pageNumber += 1) {
    const page = await loadPage(cursor);
    for (const row of page.page) {
      if (seenIds.has(row._id))
        throw new Error('A transaction moved during export. Try again when imports and updates have finished.');
      seenIds.add(row._id);
    }
    if (seenIds.size > 100_000)
      throw new Error(
        'This ledger exceeds the browser export limit of 100,000 transactions. No partial bundle was downloaded.',
      );
    const records = includeRow ? page.page.filter(includeRow) : page.page;
    includedCount += records.length;
    const text = JSON.stringify(records);
    chunks.push({
      name: `transactions-${String(pageNumber).padStart(4, '0')}.json`,
      count: records.length,
      sha256: await hashText(text),
      records,
    });
    onProgress(seenIds.size);
    if (page.isDone) return { chunks, count: includedCount, scannedCount: seenIds.size };
    if (!page.continueCursor || seenCursors.has(page.continueCursor))
      throw new Error('The export did not advance. No partial bundle was downloaded.');
    seenCursors.add(page.continueCursor);
    cursor = page.continueCursor;
  }
}

export function updateValue(value: string | boolean | number | null | undefined) {
  if (value === undefined || value === null || value === '') return 'None';
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return String(value);
}

export function formatUpdateAmount(amount: string | undefined, currency: string | undefined) {
  if (amount === undefined || !/^-?\d+$/.test(amount)) return updateValue(amount);
  const minor = BigInt(amount);
  const absolute = minor < 0n ? -minor : minor;
  const major = absolute / 100n;
  const cents = String(absolute % 100n).padStart(2, '0');
  return `${updateValue(currency)} ${minor < 0n ? '-' : ''}${major.toLocaleString()}.${cents}`;
}
