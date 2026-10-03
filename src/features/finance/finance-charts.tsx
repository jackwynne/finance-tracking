import { areaY, barX, barY, defineChart, differenceY, dot } from '@tanstack/charts';
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

export function FinanceContributionChart({
  rows,
  title,
  formatValue,
}: {
  rows: ReadonlyArray<{ date: string; capital: number; value: number | null }>;
  title: string;
  formatValue: (value: number) => string;
}) {
  const points = useMemo(
    () => rows.map((row) => ({ ...row, time: Date.parse(`${row.date}T00:00:00Z`) })).sort((a, b) => a.time - b.time),
    [rows],
  );
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          areaY(points, { id: 'capital', x: 'time', y1: 0, y2: 'capital', fill: '#fb7185', fillOpacity: 0.55 }),
          differenceY(points, {
            id: 'value-and-capital',
            x: 'time',
            y1: 'capital',
            y2: 'value',
            positiveFill: '#f59e0b',
            negativeFill: '#dc2626',
            fillOpacity: 0.5,
            stroke: 'var(--color-primary)',
            comparisonStroke: '#f43f5e',

            points: true,
          }),
        ],
        scales: {
          x: { scale: scaleLinear, axis: { ticks: { format: (value) => new Date(value).toISOString().slice(0, 10) } } },
          y: { scale: scaleLinear, nice: true, grid: true, axis: { ticks: { format: formatValue } } },
        },
        tooltip: {
          use: tooltip,
          format: (point) => {
            const row = point.datum;
            if ('date' in row)
              return `${row.date} · Capital ${formatValue(row.capital)} · Value ${row.value === null ? 'unavailable' : formatValue(row.value)}${row.value === null ? '' : ` · Growth ${formatValue(row.value - row.capital)}`}`;
            return 'Between recorded observations';
          },
        },
      }),
    [points, formatValue],
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground" aria-label="Chart legend">
        <span>
          <span aria-hidden="true" className="mr-2 inline-block h-2 w-4 rounded-sm bg-rose-400/60" />
          Opening value and net contributions
        </span>
        <span>
          <span aria-hidden="true" className="mr-2 inline-block h-2 w-4 rounded-sm bg-amber-500/60" />
          Growth
        </span>
        <span>
          <span aria-hidden="true" className="mr-2 inline-block h-2 w-4 rounded-sm bg-red-600/40" />
          Loss
        </span>
        <span>
          <span aria-hidden="true" className="mr-2 inline-block h-0.5 w-4 bg-primary align-middle" />
          Recorded value
        </span>
      </div>
      <Chart definition={definition} height={380} ariaLabel={title} />
      <p className="text-xs text-muted-foreground">
        Dots mark available valuation dates. Straight segments join these observations; they do not provide daily
        prices. Missing valuations break the value line and growth area.
      </p>
    </div>
  );
}
