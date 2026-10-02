import type { Doc } from '../_generated/dataModel';

// Match payment descriptors with changing dates, card numbers and references.
export function counterpartyFamily(normalizedName: string): string | null {
  if (/^myki tap transport\b/.test(normalizedName)) return 'myki tap transport';
  if (/^uber trip\b/.test(normalizedName)) return 'uber trip';
  if (/^uber eats\b/.test(normalizedName)) return 'uber eats';
  if (/^uber one\b/.test(normalizedName)) return 'uber one';
  if (/^(didimobility\b|didi nz\b)/.test(normalizedName)) return 'didi';
  if (/^les mills direct debit les mills billing\b/.test(normalizedName))
    return 'les mills direct debit les mills billing';
  return null;
}

export function agreedFamilyDefault(counterparties: ReadonlyArray<Doc<'counterparties'>>, family: string) {
  const categories = new Set(
    counterparties
      .filter((counterparty) => !counterparty.archived && counterpartyFamily(counterparty.normalizedName) === family)
      .flatMap((counterparty) => (counterparty.defaultCategoryId ? [counterparty.defaultCategoryId] : [])),
  );
  return categories.size === 1 ? categories.values().next().value : undefined;
}
