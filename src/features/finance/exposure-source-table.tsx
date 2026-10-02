import type { FunctionReturnType } from 'convex/server';

import type { api } from '../../../convex/_generated/api';
import { decimal } from '../../../convex/lib/portfolioMath';
import { exposureMoney, exposurePercent } from './exposure-format';

type Breakdown = FunctionReturnType<typeof api.portfolio.getExposure>['breakdowns'][number];

export function ExposureSourceTable({ group, currency }: { group: Breakdown; currency: string }) {
  const dimension = group.dimension === 'assetClass' ? 'asset class' : group.dimension;
  const sources = [...group.sources].sort((left, right) => {
    const gap = decimal(right.remainingUnmappedValue) - decimal(left.remainingUnmappedValue);
    return gap < 0n ? -1 : gap > 0n ? 1 : left.name.localeCompare(right.name);
  });
  return (
    <div className="mt-6 border-t pt-5">
      <h3 className="font-heading font-semibold">Unmapped exposure by holding</h3>
      <p className="mt-1 mb-3 text-xs text-muted-foreground">
        {exposureMoney(group.remainingUnmappedValue, currency)} remains unattributed to a named {dimension} allocation.
        A zero arithmetic gap does not establish a complete disclosure. Gross weights and offsets can exceed 100%.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-180 text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">Fund or account</th>
              <th className="py-2 pr-3 text-right font-medium">Disclosed amount</th>
              <th className="py-2 pr-3 text-right font-medium">Assumed amount</th>
              <th className="py-2 pr-3 text-right font-medium">Still unmapped</th>
              <th className="py-2 pr-3 text-right font-medium">Disclosed weight</th>
              <th className="py-2 pr-3 font-medium">Source and date</th>
              <th className="py-2 font-medium">Status and what is needed</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.positionId} className="border-t align-top">
                <td className="py-3 pr-3 font-medium">{source.name}</td>
                <td className="py-3 pr-3 text-right tabular-nums whitespace-nowrap">
                  {exposureMoney(source.reportedValue, currency)}
                </td>
                <td className="py-3 pr-3 text-right tabular-nums whitespace-nowrap">
                  {exposureMoney(source.assumedValue, currency)}
                </td>
                <td className="py-3 pr-3 text-right tabular-nums whitespace-nowrap">
                  {exposureMoney(source.remainingUnmappedValue, currency)}
                </td>
                <td className="py-3 pr-3 text-right tabular-nums">
                  {exposurePercent(String(Number(source.reportedWeight) * 100))}
                </td>
                <td className="max-w-56 py-3 pr-3">
                  <p>{source.allocationDate ?? 'No dated disclosure'}</p>
                  {source.source && (
                    <details className="mt-1 text-muted-foreground">
                      <summary className="cursor-pointer">Source evidence</summary>
                      <p className="mt-2 break-words">{source.source}</p>
                      <p className="mt-2 whitespace-pre-wrap break-words">{source.evidence}</p>
                    </details>
                  )}
                  {source.assumptionSource && (
                    <details className="mt-2 text-amber-700">
                      <summary className="cursor-pointer">Country assumption {source.assumptionDate}</summary>
                      <p className="mt-2 break-words">{source.assumptionSource}</p>
                      <p className="mt-2 whitespace-pre-wrap break-words">{source.assumptionEvidence}</p>
                    </details>
                  )}
                </td>
                <td className="max-w-64 py-3">
                  <p className="font-medium">
                    {source.status === 'complete'
                      ? 'Complete disclosure'
                      : source.status === 'partial'
                        ? 'Partial disclosure'
                        : 'Missing disclosure'}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {source.status === 'complete'
                      ? 'No further allocation data required for this source date.'
                      : source.status === 'missing'
                        ? `Add a dated actual ${dimension} allocation.`
                        : source.grossExposure || source.hasSignedOffsets
                          ? `Add the remaining ${dimension} holdings and net offsets.`
                          : `Add the remaining ${dimension} holdings, cash and offsets.`}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Still unmapped amounts are positive gaps after disclosed allocations and enabled assumptions. Assumptions do not
        establish complete verified coverage. Positions with unresolved valuations are excluded from these amounts.
      </p>
    </div>
  );
}
