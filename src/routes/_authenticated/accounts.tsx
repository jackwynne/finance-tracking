import { createFileRoute } from '@tanstack/react-router';

import { Accounts } from '@/features/finance/pages/accounts';

export const Route = createFileRoute('/_authenticated/accounts')({
  component: Accounts,
});
