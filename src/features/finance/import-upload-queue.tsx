import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

import { uploadSequentially } from './import-upload';
import type { UploadEntry } from './import-upload';

export function useImportUploadQueue(upload: (file: File) => Promise<string>) {
  const [entries, setEntries] = useState<Array<UploadEntry>>([]);
  const [uploading, setUploading] = useState(false);
  const nextKey = useRef(0);
  const running = useRef(false);

  async function run(items: Array<{ key: number; file: File }>) {
    if (running.current) return;
    running.current = true;
    setUploading(true);
    try {
      await uploadSequentially(items, upload, (updated) => {
        setEntries((current) => current.map((entry) => (entry.key === updated.key ? updated : entry)));
      });
    } finally {
      running.current = false;
      setUploading(false);
    }
  }

  function add(files: Array<File>) {
    if (running.current || files.length === 0) return;
    const items = files.map((file) => ({ key: nextKey.current++, file, status: 'waiting' as const }));
    setEntries((current) => [...current, ...items]);
    void run(items);
  }

  function retry(entry: UploadEntry) {
    if (entry.status === 'failed') void run([entry]);
  }

  return { entries, uploading, add, retry };
}

export function ImportUploadQueue({
  entries,
  uploading,
  onReview,
  onRetry,
}: {
  entries: Array<UploadEntry>;
  uploading: boolean;
  onReview: (importId: string) => void;
  onRetry: (entry: UploadEntry) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="mb-6 rounded-xl border bg-card p-4" aria-label="Upload queue" aria-live="polite">
      <div className="mb-1 font-heading font-medium">Files selected this session</div>
      <p className="mb-3 text-sm text-muted-foreground">
        Files upload one at a time. Uploaded files stay in import history after you leave this page. Review and commit
        each file separately.
      </p>
      <div className="space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.key}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{entry.file.name}</div>
              <div className={entry.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
                {entry.status === 'failed'
                  ? entry.error
                  : entry.status === 'uploaded'
                    ? 'Uploaded. Check parsing and review in import history.'
                    : entry.status === 'uploading'
                      ? 'Uploading…'
                      : 'Waiting to upload'}
              </div>
            </div>
            {entry.status === 'uploaded' && (
              <Button size="sm" variant="outline" onClick={() => onReview(entry.importId)}>
                Review file
              </Button>
            )}
            {entry.status === 'failed' && (
              <Button size="sm" variant="outline" disabled={uploading} onClick={() => onRetry(entry)}>
                Retry upload
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
