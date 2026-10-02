import { ConvexError } from 'convex/values';
import { expect, test } from 'vitest';

import { financeErrorMessage } from './finance-error';

test('nested backend validation gives the user its reason without a server stack', () => {
  expect(
    financeErrorMessage(new ConvexError('Uncaught ConvexError: Each group needs edits.\n    at capture (file.ts:1)')),
  ).toBe('Each group needs edits.');
});

test('unexpected server failures hide transport details while local file errors remain useful', () => {
  expect(financeErrorMessage(new Error('[CONVEX M(updates:stage)] Request ID: example Server Error'))).not.toContain(
    'CONVEX',
  );
  expect(financeErrorMessage(new Error('Choose a JSON proposals file.'))).toBe('Choose a JSON proposals file.');
  expect(financeErrorMessage(new ConvexError({ internal: 'details' }))).not.toContain('details');
});
