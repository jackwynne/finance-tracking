import { z } from 'zod';

import { date, decimal, decimalText, SCALE } from './portfolioMath';

const sourceRow = z.object({
  date: z.string(),
  base: z.literal('AUD'),
  quote: z.literal('NZD'),
  rate: z.number().positive().finite(),
});
const response = z.array(sourceRow).min(1).max(130);
export const FX_SOURCE = 'European Central Bank via Frankfurter v2';
export const FX_SOURCE_URL = 'https://api.frankfurter.dev/v2/providers/ecb/rates';

export function parsePublishedRates(payloadText: string, from: string, to: string) {
  const payload: unknown = JSON.parse(payloadText);
  const rows = response.parse(payload);
  const seen = new Set<string>();
  const earliest = new Date(Date.parse(`${from}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  return rows.flatMap((row) => {
    date(row.date);
    if (row.date < earliest || row.date > to || seen.has(row.date))
      throw new Error('The rate source returned duplicate or out-of-range dates.');
    seen.add(row.date);
    const rate = String(row.rate);
    const exact = decimal(rate);
    if (exact <= 0n) throw new Error('The rate source returned an unsupported rate.');
    const inverse = (SCALE * SCALE + exact / 2n) / exact;
    return [
      { from: 'AUD', to: 'NZD', date: row.date, rate, source: FX_SOURCE },
      {
        from: 'NZD',
        to: 'AUD',
        date: row.date,
        rate: decimalText(inverse),
        source: `${FX_SOURCE}, reciprocal rounded to 12 decimal places`,
      },
    ];
  });
}

export function refreshWindow(from: string, to: string, today: string) {
  date(from);
  date(to);
  date(today);
  if (!from.endsWith('-01') || from.slice(0, 7) !== to.slice(0, 7) || from > to || to > today || from < '1999-01-01')
    throw new Error('Choose a recorded month from January 1999 through today.');
  const first = new Date(`${from}T00:00:00Z`);
  const trendStart = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 3, 1);
  return {
    from: new Date(Math.max(Date.parse('1999-01-01T00:00:00Z'), trendStart - 7 * 86_400_000))
      .toISOString()
      .slice(0, 10),
    to,
  };
}
