import { IconChartDonut } from '@tabler/icons-react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';

export const money = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' });

export function formatMoney(value: bigint | number | undefined) {
  if (value === undefined) return '—';
  return money.format(Number(value) / 100);
}

export function nzDate(value: string | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-NZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Pacific/Auckland',
  }).format(new Date(`${value}T12:00:00+12:00`));
}

export function aucklandToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Pacific/Auckland',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function oneYearEarlier(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const previousYear = year - 1;
  const lastDayOfMonth = new Date(Date.UTC(previousYear, month, 0)).getUTCDate();
  return [previousYear, month, Math.min(day, lastDayOfMonth)]
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0')))
    .join('-');
}

export function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
  const tone =
    status === 'committed'
      ? 'default'
      : status === 'failed'
        ? 'destructive'
        : status === 'rolledBack'
          ? 'secondary'
          : 'outline';
  return <Badge variant={tone}>{label}</Badge>;
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 font-heading text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function ImportStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="font-heading text-xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function NativeSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-8 max-w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40 ${props.className ?? ''}`}
    />
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="grid min-h-40 place-items-center p-6 text-center">
      <div>
        <IconChartDonut className="mx-auto mb-3 size-7 text-muted-foreground/50" />
        <div className="font-heading font-medium">{title}</div>
        <div className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

export function showError(error: unknown) {
  toast.error(error instanceof Error ? error.message : 'Something went wrong.');
}
