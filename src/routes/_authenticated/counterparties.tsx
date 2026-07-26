import { createFileRoute } from '@tanstack/react-router';

import { Counterparties } from '@/features/finance/pages/counterparties';
import type { CounterpartySort } from '@/features/finance/pages/counterparties';

const counterpartySorts = new Set<CounterpartySort>([
  'name',
  'aliases',
  'defaultCategory',
  'transactionCount',
  'moneyOutMinor',
]);

type CounterpartySearch = {
  q?: string;
  sort?: CounterpartySort;
  direction?: 'asc' | 'desc';
};

export const Route = createFileRoute('/_authenticated/counterparties')({
  validateSearch: (search: Record<string, unknown>): CounterpartySearch => {
    const direction = search.direction === 'asc' ? 'asc' : search.direction === 'desc' ? 'desc' : undefined;
    return {
      q: typeof search.q === 'string' ? search.q : undefined,
      sort:
        typeof search.sort === 'string' && counterpartySorts.has(search.sort as CounterpartySort)
          ? (search.sort as CounterpartySort)
          : undefined,
      direction,
    };
  },
  component: CounterpartiesRoute,
});

function CounterpartiesRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <Counterparties
      query={search.q ?? ''}
      sort={search.sort ?? 'moneyOutMinor'}
      direction={search.direction ?? 'desc'}
      onTableStateChange={({ query, sort, direction }) => {
        void navigate({
          search: {
            q: query || undefined,
            sort: sort === 'moneyOutMinor' ? undefined : sort,
            direction: direction === 'desc' ? undefined : direction,
          },
          replace: true,
        });
      }}
    />
  );
}
