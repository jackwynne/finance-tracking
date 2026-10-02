import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const dimension = v.union(v.literal('country'), v.literal('industry'), v.literal('assetClass'));
export const portfolioTables = {
  portfolioPositions: defineTable({
    ownerId: v.id('profiles'),
    key: v.string(),
    name: v.string(),
    account: v.string(),
    instrument: v.string(),
    currency: v.string(),
    retirement: v.boolean(),
    debt: v.boolean(),
    snapshotDate: v.string(),
    basis: v.union(v.literal('trade'), v.literal('settlement')),
    sameDayCovered: v.boolean(),
    units: v.string(),
    value: v.string(),
    source: v.string(),
    evidence: v.string(),
  }).index('by_ownerId_and_key', ['ownerId', 'key']),
  portfolioSnapshots: defineTable({
    ownerId: v.id('profiles'),
    positionId: v.id('portfolioPositions'),
    snapshotDate: v.string(),
    basis: v.union(v.literal('trade'), v.literal('settlement')),
    sameDayCovered: v.boolean(),
    units: v.string(),
    value: v.string(),
    source: v.string(),
    evidence: v.string(),
  }).index('by_positionId_and_snapshotDate', ['positionId', 'snapshotDate']),
  portfolioActivities: defineTable({
    ownerId: v.id('profiles'),
    positionId: v.id('portfolioPositions'),
    sourceEvent: v.string(),
    reference: v.optional(v.string()),
    date: v.string(),
    units: v.string(),
    source: v.string(),
    evidence: v.string(),
    status: v.union(v.literal('accepted'), v.literal('ambiguous'), v.literal('linked'), v.literal('rejected')),
  })
    .index('by_ownerId_and_sourceEvent', ['ownerId', 'sourceEvent'])
    .index('by_positionId', ['positionId']),
  portfolioPrices: defineTable({
    ownerId: v.id('profiles'),
    instrument: v.string(),
    currency: v.string(),
    date: v.string(),
    price: v.string(),
    source: v.string(),
  }).index('by_ownerId_and_instrument_and_date', ['ownerId', 'instrument', 'date']),
  portfolioAllocations: defineTable({
    ownerId: v.id('profiles'),
    instrument: v.string(),
    dimension,
    kind: v.optional(v.union(v.literal('holdings'), v.literal('target'))),
    date: v.string(),
    source: v.string(),
    evidence: v.string(),
    complete: v.boolean(),
    weights: v.array(v.object({ label: v.string(), weight: v.string() })),
  }).index('by_ownerId_and_instrument_and_date', ['ownerId', 'instrument', 'date']),
  portfolioFxRates: defineTable({
    ownerId: v.id('profiles'),
    from: v.string(),
    to: v.string(),
    date: v.string(),
    rate: v.string(),
    source: v.string(),
  }).index('by_ownerId_and_from_and_to_and_date', ['ownerId', 'from', 'to', 'date']),
};
