import {
  IconChartDonut,
  IconFileUpload,
  IconLayoutDashboard,
  IconLoader2,
  IconLogout,
  IconPigMoney,
  IconReceipt2,
  IconUsers,
  IconWallet,
} from '@tabler/icons-react';
import { Link, Outlet } from '@tanstack/react-router';
import { useAuth } from '@workos/authkit-tanstack-react-start/client';
import { useMutation, useQuery } from 'convex/react';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { Button, buttonVariants } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';

import { api } from '../../../convex/_generated/api';

const navigation = [
  { to: '/dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: IconReceipt2 },
  { to: '/investments', label: 'Investments', icon: IconPigMoney },
  { to: '/counterparties', label: 'Counterparties', icon: IconUsers },
  { to: '/accounts', label: 'Accounts', icon: IconWallet },
  { to: '/imports', label: 'Imports', icon: IconFileUpload },
] as const;

export function FinanceShell({ userName }: { userName: string }) {
  const { signOut } = useAuth();
  const profile = useQuery(api.profiles.current);
  const ensureProfile = useMutation(api.profiles.ensureCurrent);

  useEffect(() => {
    if (profile !== undefined)
      void ensureProfile().catch((error) =>
        toast.error(error instanceof Error ? error.message : 'Could not initialize your profile.'),
      );
  }, [profile, ensureProfile]);

  if (profile === undefined || profile === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f6f8f4]">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <IconLoader2 className="size-5 animate-spin text-primary" />
          Preparing your finance workspace…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7f2] text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto border-r border-black/8 bg-[#10241d] p-5 text-white lg:flex lg:flex-col">
          <div className="mb-9 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#c8f46a] text-[#10241d]">
              <IconChartDonut className="size-5" />
            </div>
            <div>
              <div className="font-heading text-lg font-semibold">Koru</div>
              <div className="text-xs text-white/55">Personal finance</div>
            </div>
          </div>
          <nav className="space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: true }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-white/65 transition hover:bg-white/7 hover:text-white"
                activeProps={{ className: 'bg-white/12 text-white' }}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto border-t border-white/10 pt-5">
            <div className="mb-3 truncate text-xs text-white/55">{userName}</div>
            <Button
              variant="ghost"
              className="w-full justify-start text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => signOut()}
            >
              <IconLogout />
              Sign out
            </Button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-black/7 bg-[#f5f7f2]/90 px-4 py-3 backdrop-blur md:px-8 lg:hidden">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-heading font-semibold">Koru</div>
              <Button variant="ghost" size="icon-sm" onClick={() => signOut()}>
                <IconLogout />
              </Button>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {navigation.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: true }}
                  className={buttonVariants({ size: 'sm', variant: 'ghost' })}
                  activeProps={{ className: buttonVariants({ size: 'sm', variant: 'default' }) }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </header>
          <div className="p-4 md:p-8 lg:p-10">
            <Outlet />
          </div>
        </main>
      </div>
      <Toaster richColors position="top-right" />
    </div>
  );
}
