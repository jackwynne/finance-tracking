import {
  IconArrowsSort,
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconLoader2,
  IconSearch,
  IconUpload,
} from '@tabler/icons-react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { useMutation, useQuery } from 'convex/react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import {
  counterpartyClassificationFormat,
  downloadJson,
  parseCounterpartyClassifications,
} from '../counterparty-classifications';
import { aucklandToday, EmptyState, formatMoney, NativeSelect, PageHeading, showError } from '../finance-ui';

export type CounterpartySort = 'name' | 'aliases' | 'defaultCategory' | 'transactionCount' | 'moneyOutMinor';

export function Counterparties({
  query,
  sort,
  direction,
  onTableStateChange,
}: {
  query: string;
  sort: CounterpartySort;
  direction: 'asc' | 'desc';
  onTableStateChange: (state: { query: string; sort: CounterpartySort; direction: 'asc' | 'desc' }) => void;
}) {
  const counterparties = useQuery(api.finance.listCounterparties);
  type Counterparty = NonNullable<typeof counterparties>[number];
  const categories = useQuery(api.finance.listCategories);
  const update = useMutation(api.finance.updateCounterparty);
  const importClassifications = useMutation(api.finance.importCounterpartyClassifications);
  const classificationInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const sorting: SortingState = [{ id: sort, desc: direction === 'desc' }];
  const flatCategories = useMemo(
    () =>
      categories?.flatMap((group) => group.categories.map((category) => ({ ...category, groupName: group.name }))) ??
      [],
    [categories],
  );
  const categoryLabels = useMemo(
    () => new Map(flatCategories.map((category) => [category._id, `${category.groupName} · ${category.name}`])),
    [flatCategories],
  );
  const columns = useMemo<Array<ColumnDef<Counterparty>>>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        size: 260,
        minSize: 180,
        cell: ({ row }) => (
          <div className="truncate font-medium" title={row.original.name}>
            {row.original.name}
          </div>
        ),
      },
      {
        id: 'aliases',
        accessorFn: (counterparty) => counterparty.aliases.length,
        header: 'Aliases',
        size: 90,
        minSize: 80,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.aliases.length}</span>,
      },
      {
        id: 'defaultCategory',
        accessorFn: (counterparty) =>
          counterparty.defaultCategoryId
            ? (categoryLabels.get(counterparty.defaultCategoryId) ?? 'Unknown category')
            : 'No default',
        header: 'Default category',
        size: 300,
        minSize: 240,
        cell: ({ row }) => (
          <NativeSelect
            className="w-full"
            aria-label={`Default category for ${row.original.name}`}
            value={row.original.defaultCategoryId ?? ''}
            onChange={(event) =>
              void update({
                counterpartyId: row.original._id,
                defaultCategoryId: event.target.value ? (event.target.value as Id<'categories'>) : null,
              }).catch(showError)
            }
          >
            <option value="">No default</option>
            {flatCategories.map((category) => (
              <option key={category._id} value={category._id}>
                {category.groupName} · {category.name}
              </option>
            ))}
          </NativeSelect>
        ),
      },
      {
        accessorKey: 'transactionCount',
        header: 'Transactions',
        size: 130,
        minSize: 110,
        cell: ({ row }) => row.original.transactionCount,
      },
      {
        accessorKey: 'moneyOutMinor',
        header: 'Money out',
        size: 150,
        minSize: 130,
        sortingFn: (rowA, rowB, columnId) => {
          const first = rowA.getValue<bigint>(columnId);
          const second = rowB.getValue<bigint>(columnId);
          return first === second ? 0 : first > second ? 1 : -1;
        },
        cell: ({ row }) => <span className="font-heading font-medium">{formatMoney(row.original.moneyOutMinor)}</span>,
      },
    ],
    [categoryLabels, flatCategories, update],
  );
  const table = useReactTable({
    data: counterparties ?? [],
    columns,
    state: { globalFilter: query, sorting },
    onGlobalFilterChange: (updater) => {
      const nextQuery = typeof updater === 'function' ? updater(query) : updater;
      onTableStateChange({ query: nextQuery, sort, direction });
    },
    onSortingChange: (updater) => {
      const nextSorting = typeof updater === 'function' ? updater(sorting) : updater;
      const first = nextSorting.at(0);
      onTableStateChange({
        query,
        sort: (first?.id as CounterpartySort | undefined) ?? 'moneyOutMinor',
        direction: first?.desc === false ? 'asc' : 'desc',
      });
    },
    globalFilterFn: (row, _columnId, filterValue) => {
      const counterparty = row.original;
      const category = counterparty.defaultCategoryId
        ? categoryLabels.get(counterparty.defaultCategoryId)
        : 'No default';
      const searchable = [
        counterparty.name,
        ...counterparty.aliases.map((alias) => alias.alias),
        category,
        counterparty.transactionCount.toString(),
        formatMoney(counterparty.moneyOutMinor),
      ]
        .join(' ')
        .toLocaleLowerCase();
      return searchable.includes(String(filterValue).trim().toLocaleLowerCase());
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const exportClassifications = () => {
    if (!counterparties || !categories) return;
    downloadJson(`counterparty-classifications-${aucklandToday()}.json`, {
      format: counterpartyClassificationFormat,
      version: 1,
      instructions: [
        'Classify every counterparty using the category catalogue in this file.',
        'Only change categoryId inside classifications. Use an exact category id from categories, or null when no category fits.',
        'Do not add, remove, or reorder classifications, and do not change counterpartyId.',
        'Return the complete document as valid JSON with no Markdown fences or commentary.',
      ],
      categories: categories.flatMap((group) =>
        group.categories.map((category) => ({
          id: category._id,
          name: category.name,
          group: group.name,
          kind: group.kind,
        })),
      ),
      classifications: counterparties.map((counterparty) => ({
        counterpartyId: counterparty._id,
        name: counterparty.name,
        aliases: counterparty.aliases.map((alias) => alias.alias),
        transactionCount: counterparty.transactionCount,
        moneyOutMinor: counterparty.moneyOutMinor.toString(),
        lastSeen: counterparty.lastSeen,
        categoryId: counterparty.defaultCategoryId ?? null,
      })),
    });
    toast.success(`Exported ${counterparties.length} counterparties.`);
  };

  const onClassificationFile = async (file: File) => {
    setIsImporting(true);
    try {
      const classifications = parseCounterpartyClassifications(JSON.parse(await file.text()) as unknown);
      const knownCounterparties = new Set(counterparties?.map((counterparty) => counterparty._id) ?? []);
      const knownCategories = new Set(flatCategories.map((category) => category._id));
      const seenCounterparties = new Set<string>();
      for (const classification of classifications) {
        if (seenCounterparties.has(classification.counterpartyId))
          throw new Error(`Counterparty ${classification.counterpartyId} appears more than once.`);
        seenCounterparties.add(classification.counterpartyId);
        if (!knownCounterparties.has(classification.counterpartyId))
          throw new Error(`Counterparty ${classification.counterpartyId} is not in this workspace.`);
        if (classification.categoryId && !knownCategories.has(classification.categoryId))
          throw new Error(`Category ${classification.categoryId} is not in this workspace.`);
      }

      let updated = 0;
      let unchanged = 0;
      for (let start = 0; start < classifications.length; start += 250) {
        const result = await importClassifications({ classifications: classifications.slice(start, start + 250) });
        updated += result.updated;
        unchanged += result.unchanged;
      }
      toast.success(`Imported ${classifications.length} classifications: ${updated} updated, ${unchanged} unchanged.`);
    } catch (error) {
      showError(error instanceof SyntaxError ? new Error('The selected file is not valid JSON.') : error);
    } finally {
      setIsImporting(false);
      if (classificationInputRef.current) classificationInputRef.current.value = '';
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="Classification"
        title="Counterparties"
        description="Classify a merchant or payer once. Confirmed defaults are reused automatically on future imports."
        action={
          <div className="flex flex-wrap gap-2">
            <input
              ref={classificationInputRef}
              className="sr-only"
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onClassificationFile(file);
              }}
            />
            <Button
              variant="outline"
              disabled={!counterparties?.length || !categories?.length}
              onClick={exportClassifications}
            >
              <IconDownload />
              Export for AI
            </Button>
            <Button
              disabled={isImporting || !counterparties?.length || !categories?.length}
              onClick={() => classificationInputRef.current?.click()}
            >
              {isImporting ? <IconLoader2 className="animate-spin" /> : <IconUpload />}
              {isImporting ? 'Importing…' : 'Import classifications'}
            </Button>
          </div>
        }
      />
      <Card>
        <CardContent className="px-0 pt-0">
          {counterparties?.length ? (
            <>
              <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-sm">
                  <IconSearch
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    className="pl-8"
                    type="search"
                    value={query}
                    onChange={(event) => onTableStateChange({ query: event.target.value, sort, direction })}
                    placeholder="Search names, aliases or categories…"
                    aria-label="Search counterparties"
                  />
                </div>
                <div className="text-sm text-muted-foreground" aria-live="polite">
                  {table.getFilteredRowModel().rows.length === counterparties.length
                    ? `${counterparties.length} counterparties`
                    : `${table.getFilteredRowModel().rows.length} of ${counterparties.length} counterparties`}
                </div>
              </div>
              <Table className="table-fixed" style={{ minWidth: table.getTotalSize() }}>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        const sorted = header.column.getIsSorted();
                        const numeric = header.column.id === 'transactionCount' || header.column.id === 'moneyOutMinor';
                        return (
                          <TableHead
                            key={header.id}
                            className={`${header.column.id === 'name' ? 'pl-4' : ''} ${
                              header.column.id === 'moneyOutMinor' ? 'pr-4' : ''
                            } ${numeric ? 'text-right' : ''}`}
                            style={{ width: header.getSize() }}
                            aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                          >
                            {header.isPlaceholder ? null : (
                              <button
                                type="button"
                                className={`group flex w-full items-center gap-1.5 rounded-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50 ${
                                  numeric ? 'justify-end' : ''
                                }`}
                                onClick={header.column.getToggleSortingHandler()}
                              >
                                {flexRender(header.column.columnDef.header, header.getContext())}
                                {sorted === 'asc' ? (
                                  <IconChevronUp aria-hidden="true" className="size-4" />
                                ) : sorted === 'desc' ? (
                                  <IconChevronDown aria-hidden="true" className="size-4" />
                                ) : (
                                  <IconArrowsSort
                                    aria-hidden="true"
                                    className="size-3.5 text-muted-foreground/60 group-hover:text-primary"
                                  />
                                )}
                              </button>
                            )}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => {
                          const numeric = cell.column.id === 'transactionCount' || cell.column.id === 'moneyOutMinor';
                          return (
                            <TableCell
                              key={cell.id}
                              className={`${cell.column.id === 'name' ? 'pl-4' : ''} ${
                                cell.column.id === 'moneyOutMinor' ? 'pr-4' : ''
                              } ${numeric ? 'text-right' : ''}`}
                              style={{ width: cell.column.getSize() }}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                        No counterparties match “{query}”.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </>
          ) : (
            <EmptyState
              title="No counterparties yet"
              detail="Distinct merchants and payers are created during import."
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
