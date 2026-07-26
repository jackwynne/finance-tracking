import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { EmptyState, formatMoney, NativeSelect, nzDate, PageHeading, showError } from '../finance-ui';

export function Transactions({
  accountId,
  categoryId,
  onFiltersChange,
}: {
  accountId: string;
  categoryId: string;
  onFiltersChange: (filters: { accountId: string; categoryId: string }) => void;
}) {
  const categories = useQuery(api.finance.listCategories);
  const accounts = useQuery(api.finance.listAccounts, {});
  const update = useMutation(api.finance.updateTransaction);
  const { results, status, loadMore } = usePaginatedQuery(
    api.finance.listTransactions,
    {
      accountId: accountId ? (accountId as Id<'accounts'>) : undefined,
      categoryId: categoryId ? (categoryId as Id<'categories'>) : undefined,
    },
    { initialNumItems: 50 },
  );
  const flatCategories =
    categories?.flatMap((group) => group.categories.map((category) => ({ ...category, groupName: group.name }))) ?? [];
  return (
    <>
      <PageHeading
        eyebrow="Ledger"
        title="Transactions"
        description="Review every settled transaction, classify it, and preserve the original bank record underneath."
      />
      <Card>
        <CardHeader className="border-b sm:flex sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>All activity</CardTitle>
            <CardDescription>{results.length} loaded transactions</CardDescription>
          </div>
          <div className="mt-3 flex gap-2 sm:mt-0">
            <NativeSelect
              aria-label="Filter by account"
              value={accountId}
              onChange={(event) => onFiltersChange({ accountId: event.target.value, categoryId })}
            >
              <option value="">All accounts</option>
              {accounts?.map((account) => (
                <option key={account._id} value={account._id}>
                  {account.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Filter by category"
              value={categoryId}
              onChange={(event) => onFiltersChange({ accountId, categoryId: event.target.value })}
            >
              <option value="">All categories</option>
              {flatCategories.map((category) => (
                <option key={category._id} value={category._id}>
                  {category.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {results.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Date</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="pr-4 text-right">Report</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((transaction) => (
                  <TableRow key={transaction._id} className={transaction.excluded ? 'opacity-50' : ''}>
                    <TableCell className="pl-4 text-muted-foreground">{nzDate(transaction.postedDate)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{transaction.counterparty?.name ?? transaction.rawDescription}</div>
                      <div className="max-w-72 truncate text-xs text-muted-foreground">
                        {transaction.rawDescription}
                      </div>
                    </TableCell>
                    <TableCell>{transaction.account?.name}</TableCell>
                    <TableCell>
                      <NativeSelect
                        aria-label={`Category for ${transaction.rawDescription}`}
                        value={transaction.categoryId ?? ''}
                        onChange={(event) =>
                          void update({
                            transactionId: transaction._id,
                            categoryId: event.target.value ? (event.target.value as Id<'categories'>) : null,
                            scope: 'transaction',
                          }).catch(showError)
                        }
                      >
                        <option value="">Uncategorized</option>
                        {flatCategories.map((category) => (
                          <option key={category._id} value={category._id}>
                            {category.groupName} · {category.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </TableCell>
                    <TableCell
                      className={`text-right font-heading font-semibold ${transaction.amountMinor >= 0n ? 'text-primary' : ''}`}
                    >
                      {formatMoney(transaction.amountMinor)}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() =>
                          void update({
                            transactionId: transaction._id,
                            excluded: !transaction.excluded,
                            scope: 'transaction',
                          }).catch(showError)
                        }
                      >
                        {transaction.excluded ? 'Include' : 'Exclude'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="No transactions yet" detail="Upload an OFX or Excel export from the Imports screen." />
          )}
          {status === 'CanLoadMore' && (
            <div className="border-t p-4 text-center">
              <Button variant="outline" onClick={() => loadMore(50)}>
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
