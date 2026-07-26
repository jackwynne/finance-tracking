import { createFileRoute } from '@tanstack/react-router';

import { Dashboard } from '@/features/finance/pages/dashboard';

export const Route = createFileRoute('/_authenticated/dashboard')({
  validateSearch: (search: Record<string, unknown>) => ({
    from: typeof search.from === 'string' ? search.from : undefined,
    to: typeof search.to === 'string' ? search.to : undefined,
  }),
  component: DashboardRoute,
});

function DashboardRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <Dashboard
      requestedDateFrom={search.from}
      requestedDateTo={search.to}
      onDateRangeChange={(from, to) => {
        void navigate({
          search: { from: from || undefined, to: to || undefined },
          replace: true,
        });
      }}
    />
  );
}
