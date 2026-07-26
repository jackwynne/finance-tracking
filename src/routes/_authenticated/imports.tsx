import { createFileRoute } from '@tanstack/react-router';

import { Imports } from '@/features/finance/pages/imports';

export const Route = createFileRoute('/_authenticated/imports')({
  validateSearch: (search: Record<string, unknown>) => ({
    importId: typeof search.importId === 'string' ? search.importId : undefined,
    account: typeof search.account === 'string' ? search.account : undefined,
  }),
  component: ImportsRoute,
});

function ImportsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <Imports
      selectedImportId={search.importId}
      accountId={search.account ?? ''}
      onSelectionChange={({ importId, accountId }) => {
        void navigate({
          search: {
            importId,
            account: accountId || undefined,
          },
          replace: true,
        });
      }}
    />
  );
}
