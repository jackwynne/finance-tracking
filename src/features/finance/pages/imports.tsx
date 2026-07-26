import { IconChevronRight, IconDownload, IconFileUpload, IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQuery } from 'convex/react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import {
  EmptyState,
  formatMoney,
  ImportStat,
  NativeSelect,
  nzDate,
  PageHeading,
  showError,
  StatusBadge,
} from '../finance-ui';

export function Imports({
  selectedImportId,
  accountId,
  onSelectionChange,
}: {
  selectedImportId?: string;
  accountId: string;
  onSelectionChange: (selection: { importId?: string; accountId: string }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const imports = useQuery(api.imports.list);
  const accounts = useQuery(api.finance.listAccounts, {});
  const generateUrl = useMutation(api.imports.generateUploadUrl);
  const createImport = useMutation(api.imports.create);
  const confirmAccount = useMutation(api.imports.confirmAccount);
  const commit = useMutation(api.imports.commit);
  const rollback = useMutation(api.imports.rollback);
  const resolveDuplicate = useMutation(api.imports.resolvePossibleDuplicate);
  const [uploading, setUploading] = useState(false);
  const selectedId = selectedImportId ? (selectedImportId as Id<'imports'>) : null;
  const preview = useQuery(api.imports.preview, selectedId ? { importId: selectedId } : 'skip');
  const downloadUrl = useQuery(api.imports.sourceDownloadUrl, selectedId ? { importId: selectedId } : 'skip');
  const selected = preview?.importJob;

  async function upload(file: File) {
    if (!/\.(ofx|xlsx)$/i.test(file.name)) return toast.error('Choose an OFX or XLSX file.');
    setUploading(true);
    try {
      const url = await generateUrl();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!response.ok) throw new Error('The file upload failed.');
      const { storageId } = (await response.json()) as { storageId: Id<'_storage'> };
      const importId = await createImport({ storageId, fileName: file.name });
      onSelectionChange({ importId, accountId: '' });
      toast.success('File uploaded. Parsing has started.');
    } catch (error) {
      showError(error);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Source data"
        title="Imports"
        description="Upload, review, and commit settled transactions. Original files stay private in Convex Storage for audit and rollback."
        action={
          <>
            <input
              ref={fileRef}
              className="hidden"
              type="file"
              accept=".ofx,.xlsx"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = '';
              }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <IconLoader2 className="animate-spin" /> : <IconFileUpload />}Upload file
            </Button>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Import history</CardTitle>
            <CardDescription>Newest first</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {imports?.length ? (
              imports.map((item) => (
                <button
                  type="button"
                  key={item._id}
                  onClick={() => {
                    onSelectionChange({ importId: item._id, accountId: '' });
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${selectedId === item._id ? 'border-primary bg-primary/5' : 'hover:bg-muted/60'}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{item.fileName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(item.startedAt).toLocaleString('en-NZ')}
                    </div>
                  </div>
                  <StatusBadge status={item.status} />
                  <IconChevronRight className="size-4 text-muted-foreground" />
                </button>
              ))
            ) : (
              <EmptyState
                title="No imports yet"
                detail="OFX is recommended; the supplied Excel layouts are also supported."
              />
            )}
          </CardContent>
        </Card>
        <Card>
          {!selected ? (
            <EmptyState
              title="Choose an import"
              detail="Select an earlier file or upload a new one to review its status."
            />
          ) : (
            <>
              <CardHeader className="border-b">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <CardTitle>{selected.fileName}</CardTitle>
                    <CardDescription>
                      {selected.dateFrom && selected.dateTo
                        ? `${nzDate(selected.dateFrom)} – ${nzDate(selected.dateTo)}`
                        : 'Waiting for transaction dates'}{' '}
                      · {selected.format.toUpperCase()}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={selected.status} />
                    {downloadUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<a href={downloadUrl} download={selected.fileName} />}
                      >
                        <IconDownload />
                        Source
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {(selected.status === 'uploaded' ||
                  selected.status === 'parsing' ||
                  selected.status === 'committing') && (
                  <div className="space-y-3 py-6 text-center">
                    <IconLoader2 className="mx-auto size-7 animate-spin text-primary" />
                    <div className="font-heading font-medium">
                      {selected.status === 'committing' ? 'Applying your import…' : 'Reading your bank export…'}
                    </div>
                    <Progress value={selected.totalRows ? (selected.committedRows / selected.totalRows) * 100 : 35} />
                  </div>
                )}
                {selected.error && (
                  <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
                    {selected.error}
                  </div>
                )}
                {selected.totalRows > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <ImportStat label="Ready" value={selected.readyRows} />
                    <ImportStat label="Pending skipped" value={selected.pendingRows} />
                    <ImportStat label="Exact duplicates" value={selected.duplicateRows} />
                    <ImportStat label="Review" value={selected.possibleDuplicateRows} />
                    <ImportStat label="Invalid" value={selected.invalidRows} />
                  </div>
                )}
                {selected.status === 'ready' && !selected.accountId && (
                  <div className="rounded-xl border bg-muted/35 p-4">
                    <div className="mb-1 font-heading font-medium">Confirm the account</div>
                    <p className="mb-4 text-sm text-muted-foreground">
                      Detected {selected.detectedAccountName} ({selected.detectedMask}) in {selected.currency}.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <NativeSelect
                        aria-label="Existing account"
                        value={accountId}
                        onChange={(event) =>
                          onSelectionChange({ importId: selected._id, accountId: event.target.value })
                        }
                      >
                        <option value="">Create “{selected.detectedAccountName}”</option>
                        {accounts?.map((account) => (
                          <option key={account._id} value={account._id}>
                            {account.name} · {account.mask}
                          </option>
                        ))}
                      </NativeSelect>
                      <Button
                        onClick={() =>
                          void confirmAccount(
                            accountId
                              ? { importId: selected._id, accountId: accountId as Id<'accounts'> }
                              : {
                                  importId: selected._id,
                                  createAccount: {
                                    name: selected.detectedAccountName ?? 'Imported account',
                                    type: selected.detectedAccountType ?? 'other',
                                    institution: 'ANZ',
                                  },
                                },
                          )
                            .then(() => toast.success('Account confirmed. Checking for duplicates…'))
                            .catch(showError)
                        }
                      >
                        Confirm account
                      </Button>
                    </div>
                  </div>
                )}
                {selected.possibleDuplicateRows > 0 && (
                  <div>
                    <div className="mb-3 font-heading font-medium">Possible duplicates</div>
                    <div className="space-y-2">
                      {preview.rows
                        .filter((row) => row.status === 'possibleDuplicate')
                        .map((row) => (
                          <div
                            key={row._id}
                            className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{row.rawDescription}</div>
                              <div className="text-xs text-muted-foreground">
                                {nzDate(row.postedDate)} · {formatMoney(row.amountMinor)}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void resolveDuplicate({ importRowId: row._id, resolution: 'merge' }).catch(showError)
                                }
                              >
                                Merge
                              </Button>
                              <Button
                                size="sm"
                                onClick={() =>
                                  void resolveDuplicate({ importRowId: row._id, resolution: 'keep' }).catch(showError)
                                }
                              >
                                Keep both
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                {selected.status === 'ready' && selected.accountId && selected.possibleDuplicateRows === 0 && (
                  <div className="flex flex-col justify-between gap-4 rounded-xl border bg-[#eef5e9] p-4 sm:flex-row sm:items-center">
                    <div>
                      <div className="font-heading font-medium">Ready to commit</div>
                      <div className="text-sm text-muted-foreground">
                        {selected.readyRows} new and {selected.duplicateRows} previously seen rows will be linked to the
                        audit record.
                      </div>
                    </div>
                    <Button
                      onClick={() =>
                        void commit({ importId: selected._id })
                          .then(() => toast.success('Import is being committed.'))
                          .catch(showError)
                      }
                    >
                      Commit import
                    </Button>
                  </div>
                )}
                {selected.status === 'committed' && (
                  <div className="flex flex-col justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center">
                    <div>
                      <div className="font-heading font-medium">Import complete</div>
                      <div className="text-sm text-muted-foreground">
                        {selected.committedRows} source rows are stored with full provenance.
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (window.confirm('Roll back this import? The source file and audit trail will remain.'))
                          void rollback({ importId: selected._id })
                            .then(() => toast.success('Rollback started.'))
                            .catch(showError);
                      }}
                    >
                      Roll back
                    </Button>
                  </div>
                )}
                {preview.rows.length > 0 && (
                  <div>
                    <div className="mb-3 font-heading font-medium">Preview</div>
                    <div className="max-h-80 overflow-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.rows.slice(0, 50).map((row) => (
                            <TableRow key={row._id}>
                              <TableCell>{nzDate(row.postedDate)}</TableCell>
                              <TableCell>
                                <div className="max-w-md truncate">{row.rawDescription}</div>
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={row.status} />
                              </TableCell>
                              <TableCell className="text-right font-heading font-medium">
                                {formatMoney(row.amountMinor)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
