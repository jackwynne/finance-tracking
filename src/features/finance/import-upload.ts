export type UploadEntry =
  | { key: number; file: File; status: 'waiting' | 'uploading' }
  | { key: number; file: File; status: 'failed'; error: string }
  | { key: number; file: File; status: 'uploaded'; importId: string };

export async function uploadSequentially(
  entries: Array<{ key: number; file: File }>,
  upload: (file: File) => Promise<string>,
  update: (entry: UploadEntry) => void,
) {
  for (const entry of entries) {
    update({ ...entry, status: 'uploading' });
    try {
      const importId = await upload(entry.file);
      update({ ...entry, status: 'uploaded', importId });
    } catch (error) {
      update({ ...entry, status: 'failed', error: error instanceof Error ? error.message : 'The upload failed.' });
    }
  }
}
