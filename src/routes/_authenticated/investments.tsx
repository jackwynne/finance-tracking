import { createFileRoute } from '@tanstack/react-router';

import { Investments } from '@/features/finance/pages/investments';

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
