import { z } from 'zod';

export const counterpartyClassificationFormat = 'finance-tracking-counterparty-classifications';

const classificationDocumentSchema = z.object({
  format: z.literal(counterpartyClassificationFormat),
  version: z.literal(1),
  classifications: z
    .array(
      z.object({
        counterpartyId: z.string().min(1),
        categoryId: z.string().min(1).nullable(),
      }),
    )
    .min(1),
});

export function parseCounterpartyClassifications(text: string) {
  return classificationDocumentSchema.parse(JSON.parse(text)).classifications;
}

type JsonValue = string | number | boolean | null | undefined | Array<JsonValue> | { [key: string]: JsonValue };

export function downloadJson(fileName: string, value: JsonValue) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
