import { describe, expect, it } from 'vitest';

import { uploadSequentially } from './import-upload';
import type { UploadEntry } from './import-upload';

describe('import upload queue', () => {
  it('waits for each upload, keeps successful IDs and continues after a failed file', async () => {
    const changes: Array<UploadEntry> = [];
    let active = 0;
    let maxActive = 0;
    const files = ['first.ofx', 'failed.ofx', 'last.ofx'].map((name, key) => ({
      key,
      file: new File([name], name),
    }));
    await uploadSequentially(
      files,
      async (file) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        if (file.name === 'failed.ofx') throw new Error('Connection interrupted');
        return `import-${file.name}`;
      },
      (entry) => changes.push(entry),
    );
    expect(maxActive).toBe(1);
    expect(changes.map((entry) => [entry.file.name, entry.status])).toEqual([
      ['first.ofx', 'uploading'],
      ['first.ofx', 'uploaded'],
      ['failed.ofx', 'uploading'],
      ['failed.ofx', 'failed'],
      ['last.ofx', 'uploading'],
      ['last.ofx', 'uploaded'],
    ]);
    expect(changes[1]).toMatchObject({ importId: 'import-first.ofx' });
    expect(changes[3]).toMatchObject({ error: 'Connection interrupted' });
  });
});
