import { ConvexError } from 'convex/values';
import type { Infer } from 'convex/values';

import { portfolioTables } from '../portfolioTables';
import { date, decimal, SCALE } from './portfolioMath';

const position = portfolioTables.portfolioPositions.validator.omit('ownerId');
const allocation = portfolioTables.portfolioAllocations.validator.omit('ownerId');
const rate = portfolioTables.portfolioFxRates.validator.omit('ownerId');
const price = portfolioTables.portfolioPrices.validator.omit('ownerId');
const purchase = portfolioTables.portfolioActivities.validator.omit('ownerId', 'status');
export function validatePosition(value: Infer<typeof position>) {
  date(value.snapshotDate);
  if (decimal(value.units) < 0n || decimal(value.value) < 0n)
    throw new ConvexError('Statement units and asset or debt values must be positive.');
  if (
    value.ownershipShare !== undefined &&
    (decimal(value.ownershipShare) <= 0n || decimal(value.ownershipShare) > SCALE)
  )
    throw new ConvexError('Ownership share must be greater than 0 and at most 1.');
  if (
    !value.key.trim() ||
    !value.instrument.trim() ||
    !value.name.trim() ||
    !value.source.trim() ||
    !value.evidence.trim()
  )
    throw new ConvexError('Identity and source evidence are required.');
  if (value.key.startsWith('bank:') || value.instrument.startsWith('bank:'))
    throw new ConvexError('Bank positions come from dated account balances.');
  if (!['NZD', 'AUD'].includes(value.currency)) throw new ConvexError('Use NZD or AUD.');
}
export function validateAllocation(value: Infer<typeof allocation>) {
  date(value.date);
  if (value.weights.length > 100 || !value.source.trim() || !value.evidence.trim())
    throw new ConvexError('Supply up to 100 sourced allocation rows.');
  if (
    value.weights.some((row) => !row.label.trim()) ||
    new Set(value.weights.map((row) => row.label)).size !== value.weights.length
  )
    throw new ConvexError('Allocation labels must be unique and nonempty.');
  const total = value.weights.reduce((sum, row) => sum + decimal(row.weight), 0n);
  if (value.kind === 'target' && value.complete)
    throw new ConvexError('Target allocations cannot count as resolved actual exposure.');
  if (value.complete && total !== SCALE)
    throw new ConvexError('A complete allocation must sum to exactly 1, including signed offsets.');
}
export function validateRate(value: Infer<typeof rate>) {
  date(value.date);
  if (
    !['NZD', 'AUD'].includes(value.from) ||
    !['NZD', 'AUD'].includes(value.to) ||
    value.from === value.to ||
    decimal(value.rate) <= 0n ||
    !value.source.trim()
  )
    throw new ConvexError('Enter a sourced positive NZD/AUD rate.');
}
export function validatePrice(value: Infer<typeof price>) {
  date(value.date);
  if (
    decimal(value.price) <= 0n ||
    !value.source.trim() ||
    !value.instrument.trim() ||
    !['NZD', 'AUD'].includes(value.currency)
  )
    throw new ConvexError('A positive dated NZD/AUD price and source are required.');
}
export function validatePurchase(value: Infer<typeof purchase>) {
  date(value.date);
  if (decimal(value.units) === 0n || !value.sourceEvent.trim() || !value.source.trim() || !value.evidence.trim())
    throw new ConvexError('Source occurrence and nonzero units are required.');
}

export function validatePositionIdentity(
  previous: Pick<Infer<typeof position>, 'account' | 'instrument' | 'currency'>,
  next: Infer<typeof position>,
) {
  if (
    previous.account !== next.account ||
    previous.instrument !== next.instrument ||
    previous.currency !== next.currency
  )
    throw new ConvexError(
      'Existing position account, instrument and currency are stable. Use a distinct position key for a fund switch.',
    );
}
