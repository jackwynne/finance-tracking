import { createFileRoute } from '@tanstack/react-router';
import { getAuth } from '@workos/authkit-tanstack-react-start';
import { useAuth } from '@workos/authkit-tanstack-react-start/client';
import { Authenticated, Unauthenticated } from 'convex/react';

import { Button } from '@/components/ui/button';
import { FinanceApp } from '@/features/finance/finance-app';

export const Route = createFileRoute('/')({
  component: Home,
  loader: async () => {
    const { user } = await getAuth();
    return { user };
  },
});

function Home() {
  const { user } = Route.useLoaderData();
  const { signOut } = useAuth();
  return (
    <>
      <Authenticated>
        <FinanceApp userName={user?.email ?? user?.firstName ?? 'Signed-in user'} onSignOut={() => signOut()} />
      </Authenticated>
      <Unauthenticated>
        <Welcome />
      </Unauthenticated>
    </>
  );
}

function Welcome() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#10241d] p-6 text-white">
      <div className="max-w-xl text-center">
        <div className="mx-auto mb-6 grid size-14 place-items-center rounded-2xl bg-[#c8f46a] font-heading text-2xl font-semibold text-[#10241d]">
          K
        </div>
        <div className="mb-3 font-heading text-xs font-semibold uppercase tracking-[0.22em] text-[#c8f46a]">
          Personal finance, without the fog
        </div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-6xl">Know where your money goes.</h1>
        <p className="mx-auto mt-5 max-w-lg text-white/65">
          Import your bank exports, classify merchants once, and see cash flow and net worth in one private workspace.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button nativeButton={false} size="lg" render={<a href="/sign-in" />}>
            Sign in
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-white/20 bg-white/5 text-white hover:bg-white/10"
            nativeButton={false}
            render={<a href="/sign-up" />}
          >
            Create account
          </Button>
        </div>
      </div>
    </main>
  );
}
