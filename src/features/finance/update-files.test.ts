import { describe, expect, it } from 'vitest';

import { collectUpdatePages, formatUpdateAmount, readUpdateFile } from './update-files';

describe('ChatGPT review bundle pagination', () => {
  it('reads every page and records counts and reproducible chunk hashes', async () => {
    const cursors: Array<string | null> = [];
    const progress: Array<number> = [];
    const result = await collectUpdatePages(
      (cursor) => {
        cursors.push(cursor);
        return Promise.resolve(
          cursor === null
            ? { page: [{ _id: 'first', amountMinor: '-100' }], continueCursor: 'next', isDone: false }
            : { page: [{ _id: 'last', amountMinor: '200' }], continueCursor: '', isDone: true },
        );
      },
      (count) => progress.push(count),
    );
    expect(cursors).toEqual([null, 'next']);
    expect(progress).toEqual([1, 2]);
    expect(result.count).toBe(2);
    expect(result.chunks.map((chunk) => chunk.name)).toEqual(['transactions-0001.json', 'transactions-0002.json']);
    expect(result.chunks[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.chunks[0]?.sha256).not.toBe(result.chunks[1]?.sha256);
  });

  it('rejects duplicate rows caused by a changing ledger instead of marking a partial export complete', async () => {
    await expect(
      collectUpdatePages(
        (cursor) => Promise.resolve({ page: [{ _id: 'same' }], continueCursor: 'next', isDone: cursor !== null }),
        () => {},
      ),
    ).rejects.toThrow('transaction moved');
  });

  it('rejects a repeated cursor even when the intervening page is empty', async () => {
    await expect(
      collectUpdatePages(
        () => Promise.resolve({ page: [], continueCursor: 'stuck', isDone: false }),
        () => {},
      ),
    ).rejects.toThrow('did not advance');
  });

  it('scans the whole ledger before marking a filtered task complete', async () => {
    const result = await collectUpdatePages(
      (cursor) =>
        Promise.resolve(
          cursor === null
            ? { page: [{ _id: 'classified', unresolved: false }], continueCursor: 'next', isDone: false }
            : { page: [{ _id: 'unresolved', unresolved: true }], continueCursor: '', isDone: true },
        ),
      () => {},
      (row) => row.unresolved,
    );
    expect(result.count).toBe(1);
    expect(result.scannedCount).toBe(2);
    expect(result.chunks[0]?.records).toEqual([]);
    expect(result.chunks[1]?.records[0]?._id).toBe('unresolved');
  });

  it('exports a completed empty ledger', async () => {
    const result = await collectUpdatePages(
      () => Promise.resolve({ page: [], continueCursor: '', isDone: true }),
      () => {},
    );
    expect(result.count).toBe(0);
    expect(result.chunks).toHaveLength(1);
  });
});

describe('ChatGPT file boundary', () => {
  it('reads an uploaded JSON proposals file without changing its contents', async () => {
    const file = new File(['{"version":1}'], 'proposals.json', { type: 'application/json' });
    await expect(readUpdateFile(file)).resolves.toBe('{"version":1}');
  });

  it('rejects an empty or unsupported upload before staging', async () => {
    await expect(readUpdateFile(new File(['  '], 'proposals.json'))).rejects.toThrow('empty');
    await expect(readUpdateFile(new File(['hello'], 'statement.pdf'))).rejects.toThrow('JSON');
  });

  it('formats minor units without losing precision', () => {
    expect(formatUpdateAmount('-12345', 'AUD')).toBe('AUD -123.45');
    expect(formatUpdateAmount('900719925474099301', 'NZD')).toBe('NZD 9,007,199,254,740,993.01');
  });
});
