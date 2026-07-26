import type { Id } from '../../../convex/_generated/dataModel';

export const counterpartyClassificationFormat = 'finance-tracking-counterparty-classifications';

type ImportedCounterpartyClassification = {
  counterpartyId: Id<'counterparties'>;
  categoryId: Id<'categories'> | null;
};

export function parseCounterpartyClassifications(value: unknown): Array<ImportedCounterpartyClassification> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a JSON object exported from the Counterparties screen.');
  const document = value as Record<string, unknown>;
  if (document.format !== counterpartyClassificationFormat || document.version !== 1)
    throw new Error('This is not a supported counterparty classification export.');
  if (!Array.isArray(document.classifications) || document.classifications.length === 0)
    throw new Error('The file does not contain any classifications.');

  return document.classifications.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error(`Classification ${index + 1} is not an object.`);
    const classification = entry as Record<string, unknown>;
    if (typeof classification.counterpartyId !== 'string' || !classification.counterpartyId)
      throw new Error(`Classification ${index + 1} has no counterpartyId.`);
    if (classification.categoryId !== null && typeof classification.categoryId !== 'string')
      throw new Error(`Classification ${index + 1} must have a categoryId or null.`);
    return {
      counterpartyId: classification.counterpartyId as Id<'counterparties'>,
      categoryId: classification.categoryId as Id<'categories'> | null,
    };
  });
}

export function downloadJson(fileName: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
