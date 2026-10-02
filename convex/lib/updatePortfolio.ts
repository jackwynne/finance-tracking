import { ConvexError, v } from 'convex/values';
import type { Infer } from 'convex/values';

import type { Id, Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { portfolioTables } from '../portfolioTables';
import { assertOwner } from './auth';
import { decimal } from './portfolioMath';
import {
  validatePosition,
  validateAllocation,
  validateRate,
  validatePrice,
  validatePurchase,
} from './portfolioValidation';
import { revision, canonical } from './updateContract';

const positionValue = portfolioTables.portfolioPositions.validator.omit('ownerId');
const allocationValue = portfolioTables.portfolioAllocations.validator.omit('ownerId');
const rateValue = portfolioTables.portfolioFxRates.validator.omit('ownerId');
const priceValue = portfolioTables.portfolioPrices.validator.omit('ownerId');
const purchaseValue = portfolioTables.portfolioActivities.validator.omit('ownerId', 'status');
export const portfolioGroup = v.union(
  v.object({
    kind: v.literal('portfolioPosition'),
    expectedRevision: v.string(),
    reason: v.string(),
    value: positionValue,
  }),
  v.object({
    kind: v.literal('portfolioAllocation'),
    expectedRevision: v.string(),
    reason: v.string(),
    value: allocationValue,
  }),
  v.object({ kind: v.literal('portfolioRate'), expectedRevision: v.string(), reason: v.string(), value: rateValue }),
  v.object({ kind: v.literal('portfolioPrice'), expectedRevision: v.string(), reason: v.string(), value: priceValue }),
  v.object({
    kind: v.literal('portfolioPurchase'),
    distinctPurchase: v.optional(v.boolean()),
    expectedRevision: v.string(),
    reason: v.string(),
    value: purchaseValue,
  }),
);
export const portfolioRestore = v.object({
  table: v.union(
    v.literal('portfolioSnapshots'),
    v.literal('portfolioAllocations'),
    v.literal('portfolioFxRates'),
    v.literal('portfolioPrices'),
    v.literal('portfolioActivities'),
  ),
  id: v.string(),
  revision: v.string(),
  createdPositionId: v.optional(v.id('portfolioPositions')),
  beforePosition: v.optional(positionValue.extend({ id: v.id('portfolioPositions') })),
  beforeRate: v.optional(rateValue.extend({ id: v.id('portfolioFxRates') })),
});
type Group = Infer<typeof portfolioGroup>;
type Restore = Infer<typeof portfolioRestore>;
type Ctx = QueryCtx | MutationCtx;
export async function portfolioContext(ctx: Ctx, owner: Id<'profiles'>) {
  const positions = await ctx.db
    .query('portfolioPositions')
    .withIndex('by_ownerId_and_key', (q) => q.eq('ownerId', owner))
    .take(201);
  const allocations = await ctx.db
    .query('portfolioAllocations')
    .withIndex('by_ownerId_and_instrument_and_date', (q) => q.eq('ownerId', owner))
    .take(1001);
  const prices = await ctx.db
    .query('portfolioPrices')
    .withIndex('by_ownerId_and_instrument_and_date', (q) => q.eq('ownerId', owner))
    .take(1001);
  const rates = await ctx.db
    .query('portfolioFxRates')
    .withIndex('by_ownerId_and_from_and_to_and_date', (q) => q.eq('ownerId', owner))
    .take(1001);
  if (positions.length > 200 || allocations.length > 1000 || prices.length > 1000 || rates.length > 1000)
    throw new ConvexError('Portfolio context exceeds the supported review limit.');
  const snapshots: Array<Doc<'portfolioSnapshots'>> = [];
  const activities: Array<Doc<'portfolioActivities'>> = [];
  for (const position of positions) {
    const s = await ctx.db
      .query('portfolioSnapshots')
      .withIndex('by_positionId_and_snapshotDate', (q) => q.eq('positionId', position._id))
      .take(101);
    const a = await ctx.db
      .query('portfolioActivities')
      .withIndex('by_positionId', (q) => q.eq('positionId', position._id))
      .take(101);
    if (s.length > 100 || a.length > 100) throw new ConvexError('Position review history exceeds 100 records.');
    snapshots.push(...s);
    activities.push(...a);
  }
  const positionRevisions = await Promise.all(
    positions.map(async (position) => ({
      key: position.key,
      revision: await revision({
        position,
        snapshots: snapshots.filter((s) => s.positionId === position._id),
        activities: activities.filter((a) => a.positionId === position._id),
      }),
    })),
  );
  const instruments = [
    ...new Set([
      ...positions.map((p) => p.instrument),
      ...allocations.map((a) => a.instrument),
      ...prices.map((p) => p.instrument),
    ]),
  ];
  const instrumentRevisions = await Promise.all(
    instruments.map(async (instrument) => ({
      instrument,
      revision: await revision({
        allocations: allocations.filter((a) => a.instrument === instrument),
        prices: prices.filter((p) => p.instrument === instrument),
      }),
    })),
  );
  const pairs = [...new Set(rates.map((r) => `${r.from}:${r.to}`))];
  const rateRevisions = await Promise.all(
    pairs.map(async (pair) => {
      const [from, to] = pair.split(':');
      return { from, to, revision: await revision(rates.filter((r) => r.from === from && r.to === to)) };
    }),
  );
  return {
    positions,
    snapshots,
    activities,
    allocations,
    prices,
    rates,
    positionRevisions,
    instrumentRevisions,
    rateRevisions,
  };
}
export async function capturePortfolio(ctx: Ctx, owner: Id<'profiles'>, groups: Array<Group>, checkRevision: boolean) {
  if (groups.length === 0) return [];
  const targets = new Set<string>();
  for (const group of groups) {
    const key =
      group.kind === 'portfolioRate'
        ? `rate:${group.value.from}:${group.value.to}:${group.value.date}`
        : group.kind === 'portfolioPosition'
          ? `position:${group.value.key}`
          : group.kind === 'portfolioPurchase'
            ? `purchase:${group.value.sourceEvent}`
            : group.kind === 'portfolioPrice'
              ? `price:${group.value.instrument}:${group.value.currency}:${group.value.date}`
              : `allocation:${group.value.instrument}:${group.value.dimension}:${group.value.kind ?? 'holdings'}:${group.value.date}`;
    if (targets.has(key))
      throw new ConvexError(
        'A proposal cannot update the same portfolio target twice. Combine its changes into one group.',
      );
    targets.add(key);
  }
  const context = await portfolioContext(ctx, owner);
  return Promise.all(
    groups.map(async (group) => {
      let key: string;
      let before;
      if (group.kind === 'portfolioPosition') {
        key = group.value.key;
        const position = context.positions.find((p) => p.key === key);
        before = {
          position: position ?? null,
          snapshots: context.snapshots.filter((s) => s.positionId === position?._id),
          activities: context.activities.filter((a) => a.positionId === position?._id),
        };
      } else if (group.kind === 'portfolioPurchase') {
        const position = assertOwner(await ctx.db.get(group.value.positionId), owner);
        key = position.key;
        before = {
          position,
          snapshots: context.snapshots.filter((s) => s.positionId === position._id),
          activities: context.activities.filter((a) => a.positionId === position._id),
        };
      } else if (group.kind === 'portfolioRate') {
        key = `${group.value.from}:${group.value.to}`;
        before = context.rates.filter((r) => r.from === group.value.from && r.to === group.value.to);
      } else {
        key = group.value.instrument;
        before = {
          allocations: context.allocations.filter((a) => a.instrument === key),
          prices: context.prices.filter((p) => p.instrument === key),
        };
      }
      const hash = await revision(before);
      if (checkRevision && group.expectedRevision !== hash)
        throw new ConvexError('Portfolio evidence changed after export. Download fresh context and review again.');
      return { kind: group.kind, key, revision: hash, beforeJson: canonical(before) };
    }),
  );
}
export async function applyPortfolio(
  ctx: MutationCtx,
  owner: Id<'profiles'>,
  groups: Array<Group>,
): Promise<Array<Restore>> {
  if (groups.length === 0) return [];
  await capturePortfolio(ctx, owner, groups, true);
  const receipts: Array<Restore> = [];
  for (const group of groups) {
    if (group.kind === 'portfolioPosition') {
      const value = group.value;
      validatePosition(value);
      const existing = await ctx.db
        .query('portfolioPositions')
        .withIndex('by_ownerId_and_key', (q) => q.eq('ownerId', owner).eq('key', value.key))
        .unique();
      if (existing && (existing.instrument !== value.instrument || existing.currency !== value.currency))
        throw new ConvexError('Position instrument and currency are stable.');
      const positionId = existing
        ? existing._id
        : await ctx.db.insert('portfolioPositions', { ...value, ownerId: owner });
      if (existing)
        await ctx.db.patch(positionId, {
          name: value.name,
          account: value.account,
          retirement: value.retirement,
          debt: value.debt,
          ownershipShare: value.ownershipShare,
        });
      const id = await ctx.db.insert('portfolioSnapshots', {
        ownerId: owner,
        positionId,
        ownershipShare: value.ownershipShare,
        snapshotDate: value.snapshotDate,
        basis: value.basis,
        sameDayCovered: value.sameDayCovered,
        units: value.units,
        value: value.value,
        source: value.source,
        evidence: value.evidence,
      });
      const inserted = await ctx.db.get(id);
      if (!inserted) throw new Error('Inserted snapshot is missing.');
      const beforePosition = existing
        ? {
            id: existing._id,
            key: existing.key,
            name: existing.name,
            account: existing.account,
            instrument: existing.instrument,
            currency: existing.currency,
            retirement: existing.retirement,
            debt: existing.debt,
            ownershipShare: existing.ownershipShare,
            snapshotDate: existing.snapshotDate,
            basis: existing.basis,
            sameDayCovered: existing.sameDayCovered,
            units: existing.units,
            value: existing.value,
            source: existing.source,
            evidence: existing.evidence,
          }
        : undefined;
      receipts.push({
        table: 'portfolioSnapshots',
        id,
        revision: await revision(inserted),
        createdPositionId: existing ? undefined : positionId,
        beforePosition,
      });
    } else if (group.kind === 'portfolioPurchase') {
      const value = group.value;
      assertOwner(await ctx.db.get(value.positionId), owner);
      validatePurchase(value);
      const same = await ctx.db
        .query('portfolioActivities')
        .withIndex('by_ownerId_and_sourceEvent', (q) => q.eq('ownerId', owner).eq('sourceEvent', value.sourceEvent))
        .unique();
      if (same) throw new ConvexError('This source occurrence is already recorded.');
      const activities = await ctx.db
        .query('portfolioActivities')
        .withIndex('by_positionId', (q) => q.eq('positionId', value.positionId))
        .take(101);
      if (activities.length > 100)
        throw new ConvexError('Position purchase matching exceeds the supported review limit.');
      const matchingReference = value.reference
        ? activities.find((a) => a.reference === value.reference && a.status === 'accepted')
        : undefined;
      const matching = activities.some(
        (a) => a.date === value.date && decimal(a.units) === decimal(value.units) && a.status === 'accepted',
      );
      if (
        matchingReference &&
        (matchingReference.date !== value.date || decimal(matchingReference.units) !== decimal(value.units))
      )
        throw new ConvexError('Trade reference has conflicting purchase details.');
      if (!matchingReference && matching && !group.distinctPurchase)
        throw new ConvexError('Identical purchase needs an explicit distinctPurchase decision.');
      const id = await ctx.db.insert('portfolioActivities', {
        ...value,
        ownerId: owner,
        status: matchingReference ? 'linked' : 'accepted',
      });
      const inserted = await ctx.db.get(id);
      if (!inserted) throw new Error('Inserted purchase is missing.');
      receipts.push({ table: 'portfolioActivities', id, revision: await revision(inserted) });
    } else if (group.kind === 'portfolioAllocation') {
      const value = group.value;
      validateAllocation(value);
      const id = await ctx.db.insert('portfolioAllocations', { ...value, ownerId: owner });
      const inserted = await ctx.db.get(id);
      if (!inserted) throw new Error('Inserted allocation is missing.');
      receipts.push({ table: 'portfolioAllocations', id, revision: await revision(inserted) });
    } else if (group.kind === 'portfolioPrice') {
      const value = group.value;
      validatePrice(value);
      const id = await ctx.db.insert('portfolioPrices', { ...value, ownerId: owner });
      const inserted = await ctx.db.get(id);
      if (!inserted) throw new Error('Inserted price is missing.');
      receipts.push({ table: 'portfolioPrices', id, revision: await revision(inserted) });
    } else {
      const value = group.value;
      validateRate(value);
      const existing = await ctx.db
        .query('portfolioFxRates')
        .withIndex('by_ownerId_and_from_and_to_and_date', (q) =>
          q.eq('ownerId', owner).eq('from', value.from).eq('to', value.to).eq('date', value.date),
        )
        .unique();
      const id = existing ? existing._id : await ctx.db.insert('portfolioFxRates', { ...value, ownerId: owner });
      if (existing) await ctx.db.patch(id, value);
      const inserted = await ctx.db.get(id);
      if (!inserted) throw new Error('Rate is missing.');
      receipts.push({
        table: 'portfolioFxRates',
        id,
        revision: await revision(inserted),
        beforeRate: existing
          ? {
              id: existing._id,
              from: existing.from,
              to: existing.to,
              date: existing.date,
              rate: existing.rate,
              source: existing.source,
            }
          : undefined,
      });
    }
  }
  return receipts;
}
export async function undoPortfolio(ctx: MutationCtx, owner: Id<'profiles'>, receipts: Array<Restore>) {
  for (const receipt of receipts) {
    const id = ctx.db.normalizeId(receipt.table, receipt.id);
    if (!id) throw new ConvexError('Invalid portfolio receipt.');
    const document = assertOwner(await ctx.db.get(id), owner);
    if ((await revision(document)) !== receipt.revision)
      throw new ConvexError('Portfolio evidence has changed since apply. Undo cannot replace newer decisions.');
  }
  for (const receipt of [...receipts].reverse()) {
    const id = ctx.db.normalizeId(receipt.table, receipt.id);
    if (!id) throw new ConvexError('Invalid portfolio receipt.');
    if (receipt.beforeRate) {
      const { id: rateId, ...fields } = receipt.beforeRate;
      await ctx.db.patch(rateId, fields);
    } else await ctx.db.delete(id);
    if (receipt.beforePosition) {
      const { id: positionId, ...fields } = receipt.beforePosition;
      assertOwner(await ctx.db.get(positionId), owner);
      await ctx.db.patch(positionId, fields);
    }
    if (receipt.createdPositionId) {
      const position = assertOwner(await ctx.db.get(receipt.createdPositionId), owner);
      const snapshots = await ctx.db
        .query('portfolioSnapshots')
        .withIndex('by_positionId_and_snapshotDate', (q) => q.eq('positionId', position._id))
        .take(1);
      const activities = await ctx.db
        .query('portfolioActivities')
        .withIndex('by_positionId', (q) => q.eq('positionId', position._id))
        .take(1);
      if (snapshots.length || activities.length)
        throw new ConvexError('New position has later dependent evidence. Undo would remove that context.');
      await ctx.db.delete(position._id);
    }
  }
}
