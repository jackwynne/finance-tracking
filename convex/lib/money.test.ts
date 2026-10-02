import { expect, test } from 'vitest';

import { toMinorUnits } from './finance';

test('bank monetary parsing preserves cents and rejects partial or unsupported amounts', () => {
  expect(toMinorUnits('1.01')).toBe(101n);
  expect(toMinorUnits('-19.99')).toBe(-1999n);
  expect(toMinorUnits('90071992547409.93')).toBe(9007199254740993n);
  expect(toMinorUnits('1.2300')).toBe(123n);
  expect(toMinorUnits(0.29)).toBe(29n);
  for (const text of ['12oops', '1.001', 'NaN', 'Infinity', '', '92233720368547758.08'])
    expect(() => toMinorUnits(text)).toThrow();
});
