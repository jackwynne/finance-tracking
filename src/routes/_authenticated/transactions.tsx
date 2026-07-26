import { createFileRoute } from '@tanstack/react-router';

import { Transactions } from '@/features/finance/pages/transactions';

export const Route = createFileRoute('/_authenticated/transactions')({
  validateSearch: (search: Record<string, unknown>) => ({
    account: typeof search.account === 'string' ? search.account : undefined,
    category: typeof search.category === 'string' ? search.category : undefined,
  }),
  component: TransactionsRoute,
});

function TransactionsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <Transactions
      accountId={search.account ?? ''}
      categoryId={search.category ?? ''}
      onFiltersChange={({ accountId, categoryId }) => {
        void navigate({
          search: {
            account: accountId || undefined,
            category: categoryId || undefined,
          },
          replace: true,
        });
      }}
    />
  );
}
