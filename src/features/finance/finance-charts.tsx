import { barX, barY, defineChart, dot } from '@tanstack/charts';
import { Chart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { tooltip } from '@tanstack/charts/tooltip';
import { useMemo } from 'react';

export type FinanceChartRow = { label: string; value: number; detail?: string };

export function FinanceBarChart({
  rows,
  title,
  formatValue,
}: {
  rows: ReadonlyArray<FinanceChartRow>;
  title: string;
  formatValue: (value: number) => string;
}) {
  const definition = useMemo(
    () =>
      defineChart({
        marks: [barX(rows, { x: 'value', y: 'label', fill: 'var(--color-primary)' })],
        scales: {
          y: { scale: () => scaleBand().padding(0.25) },
          x: { scale: scaleLinear, nice: true, grid: true, axis: { ticks: { format: formatValue } } },
        },
        tooltip: {
          use: tooltip,
          format: (point) =>
            `${point.datum.label}: ${formatValue(point.datum.value)}${point.datum.detail ? ` · ${point.datum.detail}` : ''}`,
        },
      }),
    [rows, formatValue],
  );
  return <Chart definition={definition} height={Math.max(220, rows.length * 36)} ariaLabel={title} />;
}

export function FinanceMonthlyChart({
  rows,
  title,
  formatValue,
}: {
  rows: ReadonlyArray<FinanceChartRow>;
  title: string;
  formatValue: (value: number) => string;
}) {
  const definition = useMemo(
    () =>
      defineChart({
        marks: [barY(rows, { x: 'label', y: 'value', fill: 'var(--color-primary)' })],
        scales: {
          x: { scale: () => scaleBand().padding(0.35) },
          y: { scale: scaleLinear, nice: true, grid: true, axis: { ticks: { format: formatValue } } },
        },
        tooltip: {
          use: tooltip,
          format: (point) =>
            `${point.datum.label}: ${formatValue(point.datum.value)}${point.datum.detail ? ` · ${point.datum.detail}` : ''}`,
        },
      }),
    [rows, formatValue],
  );
  return <Chart definition={definition} height={280} ariaLabel={title} />;
}

export function FinanceObservationChart({
  rows,
  title,
  formatValue,
}: {
  rows: ReadonlyArray<{ date: string; value: number }>;
  title: string;
  formatValue: (value: number) => string;
}) {
  const points = useMemo(() => rows.map((row) => ({ ...row, time: Date.parse(`${row.date}T00:00:00Z`) })), [rows]);
  const definition = useMemo(
    () =>
      defineChart({
        marks: [dot(points, { x: 'time', y: 'value', r: 5, fill: 'var(--color-primary)' })],
        scales: {
          x: { scale: scaleLinear, axis: { ticks: { format: (value) => new Date(value).toISOString().slice(0, 10) } } },
          y: { scale: scaleLinear, nice: true, grid: true, axis: { ticks: { format: formatValue } } },
        },
        tooltip: { use: tooltip, format: (point) => `${point.datum.date}: ${formatValue(point.datum.value)}` },
      }),
    [points, formatValue],
  );
  return <Chart definition={definition} height={280} ariaLabel={title} />;
}
