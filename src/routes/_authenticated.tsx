import { createFileRoute, redirect } from '@tanstack/react-router';
import { getAuth } from '@workos/authkit-tanstack-react-start';

import { FinanceShell } from '@/features/finance/finance-shell';

export const Route = createFileRoute('/_authenticated')({
  loader: async ({ location }) => {
    const { user } = await getAuth();
    if (!user) {
      throw redirect({
        href: `/sign-in?returnPathname=${encodeURIComponent(location.href)}`,
      });
    }
    return { user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useLoaderData();
  return <FinanceShell userName={user.email} />;
}
