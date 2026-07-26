import { IconChevronRight, IconDownload, IconFileUpload, IconLoader2 } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  EmptyState,
  formatMoney,
  ImportStat,
  nzDate,
  PageHeading,
  showError,
  StatusBadge,
} from '@/features/finance/finance-ui';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

export const Route = createFileRoute('/_authenticated/investments')({
  validateSearch: (search: Record<string, unknown>) => ({
    importId: typeof search.importId === 'string' ? search.importId : undefined,
  }),
  component: InvestmentsRoute,
});

function InvestmentsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <Investments
      selectedImportId={search.importId}
      onSelectedImportChange={(importId) => {
        void navigate({ search: { importId }, replace: true });
      }}
    />
  );
}

function Investments({
  selectedImportId,
  onSelectedImportChange,
}: {
  selectedImportId?: string;
  onSelectedImportChange: (importId: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const transactions = useQuery(api.investmentImports.listTransactions);
  const imports = useQuery(api.investmentImports.list);
  const generateUrl = useMutation(api.investmentImports.generateUploadUrl);
  const createImport = useMutation(api.investmentImports.create);
  const commit = useMutation(api.investmentImports.commit);
  const rollback = useMutation(api.investmentImports.rollback);
  const [uploading, setUploading] = useState(false);
  const selectedId = selectedImportId ? (selectedImportId as Id<'investmentImports'>) : null;
  const preview = useQuery(api.investmentImports.preview, selectedId ? { importId: selectedId } : 'skip');
  const downloadUrl = useQuery(api.investmentImports.sourceDownloadUrl, selectedId ? { importId: selectedId } : 'skip');
  const selected = preview?.importJob;

  useEffect(() => {
    if (!selectedId && imports?.[0]) onSelectedImportChange(imports[0]._id);
  }, [imports, selectedId, onSelectedImportChange]);

  async function upload(file: File) {
    if (!/\.csv$/i.test(file.name)) return toast.error('Choose a CSV investment export.');
    setUploading(true);
    try {
      const url = await generateUrl();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'text/csv' },
        body: file,
      });
      if (!response.ok) throw new Error('The file upload failed.');
      const { storageId } = (await response.json()) as { storageId: Id<'_storage'> };
      const importId = await createImport({ storageId, fileName: file.name });
      onSelectedImportChange(importId);
      toast.success('Investment export uploaded. Parsing has started.');
    } catch (error) {
      showError(error);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Portfolio activity"
        title="Investments"
        description="Track units, prices, contributions, dividends, and other investment activity separately from cash transactions."
        action={
          <>
            <input
              ref={fileRef}
              className="hidden"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = '';
              }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <IconLoader2 className="animate-spin" /> : <IconFileUpload />}
              Import investment CSV
            </Button>
          </>
        }
      />

      <Card className="mb-6">
        <CardHeader className="border-b sm:flex sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Investment transactions</CardTitle>
            <CardDescription>
              {transactions?.length ?? 0} tracked transactions across{' '}
              {new Set(transactions?.map((transaction) => transaction.accountId) ?? []).size} accounts
            </CardDescription>
          </div>
          <Badge variant="outline">Separate investment ledger</Badge>
        </CardHeader>
        <CardContent className="px-0">
          {transactions?.length ? (
            <div className="max-h-[32rem] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Investment</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="pr-4 text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction._id}>
                      <TableCell className="pl-4 text-muted-foreground">{nzDate(transaction.effectiveDate)}</TableCell>
                      <TableCell>{transaction.account?.name ?? 'Investment account'}</TableCell>
                      <TableCell className="font-medium">{transaction.instrumentCode ?? 'Fund'}</TableCell>
                      <TableCell>
                        <div>{transaction.transactionType}</div>
                        {transaction.description !== transaction.transactionType && (
                          <div className="max-w-72 truncate text-xs text-muted-foreground">
                            {transaction.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-heading">{transaction.units}</TableCell>
                      <TableCell className="text-right font-heading">
                        {transaction.unitPrice ? `$${transaction.unitPrice}` : '—'}
                      </TableCell>
                      <TableCell className="pr-4 text-right font-heading font-semibold">
                        {formatMoney(transaction.amountMinor)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState
              title="No investment transactions yet"
              detail="Import either of the supplied CSV export formats to create your investment ledger."
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Investment imports</CardTitle>
            <CardDescription>Newest first</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {imports?.length ? (
              imports.map((item) => (
                <button
                  type="button"
                  key={item._id}
                  onClick={() => onSelectedImportChange(item._id)}
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
              <EmptyState title="No investment imports" detail="Upload a supported CSV export to begin." />
            )}
          </CardContent>
        </Card>

        <Card>
          {!selected ? (
            <EmptyState
              title="Choose an investment import"
              detail="Select an earlier import or upload a CSV to review it."
            />
          ) : (
            <>
              <CardHeader className="border-b">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <CardTitle>{selected.fileName}</CardTitle>
                    <CardDescription>
                      {selected.detectedAccountName ?? 'Detecting investment account'}
                      {selected.dateFrom && selected.dateTo
                        ? ` · ${nzDate(selected.dateFrom)} – ${nzDate(selected.dateTo)}`
                        : ''}
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
                      {selected.status === 'committing'
                        ? 'Applying your investment import…'
                        : 'Reading your investment export…'}
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
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <ImportStat label="New" value={selected.readyRows} />
                    <ImportStat label="Duplicates" value={selected.duplicateRows} />
                    <ImportStat label="Invalid" value={selected.invalidRows} />
                    <ImportStat label="Committed" value={selected.committedRows} />
                  </div>
                )}
                {selected.status === 'ready' && (
                  <div className="flex flex-col justify-between gap-4 rounded-xl border bg-[#eef5e9] p-4 sm:flex-row sm:items-center">
                    <div>
                      <div className="font-heading font-medium">Ready to commit</div>
                      <div className="text-sm text-muted-foreground">
                        {selected.readyRows} new transactions will be stored. {selected.duplicateRows} previously
                        imported transactions will only be linked to this audit record.
                      </div>
                    </div>
                    <Button
                      onClick={() =>
                        void commit({ importId: selected._id })
                          .then(() => toast.success('Investment import is being committed.'))
                          .catch(showError)
                      }
                    >
                      Commit investment import
                    </Button>
                  </div>
                )}
                {selected.status === 'committed' && (
                  <div className="flex flex-col justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center">
                    <div>
                      <div className="font-heading font-medium">Investment import complete</div>
                      <div className="text-sm text-muted-foreground">
                        {selected.committedRows} source rows are stored with deduplication and provenance.
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (window.confirm('Roll back this investment import? The audit trail will remain.'))
                          void rollback({ importId: selected._id })
                            .then(() => toast.success('Investment rollback started.'))
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
                            <TableHead>Investment</TableHead>
                            <TableHead>Activity</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Units</TableHead>
                            <TableHead className="text-right">Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.rows.slice(0, 100).map((row) => (
                            <TableRow key={row._id}>
                              <TableCell>{nzDate(row.effectiveDate)}</TableCell>
                              <TableCell>{row.instrumentCode ?? 'Fund'}</TableCell>
                              <TableCell>
                                <div className="max-w-64 truncate">{row.transactionType}</div>
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={row.status} />
                              </TableCell>
                              <TableCell className="text-right font-heading">{row.units}</TableCell>
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
