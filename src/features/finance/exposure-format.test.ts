import { describe, expect, it } from 'vitest';

import { exposureMoney, exposurePercent, rankedExposure, attributedExposurePercent } from './exposure-format';

describe('exposure display precision', () => {
  it('rounds decimal money at the cent boundary without converting large asset values to floating point', () => {
    expect(exposureMoney('9007199254740993.995', 'NZD')).toBe('NZD 9,007,199,254,740,994.00');
    expect(exposureMoney('-1234.995', 'AUD')).toBe('AUD -1,235.00');
    expect(exposureMoney('0.0049', 'NZD')).toBe('NZD 0.00');
  });
  it('keeps an unresolved value visibly distinct from zero', () => {
    expect(exposureMoney(null, 'NZD')).toBe('Unresolved');
    expect(exposureMoney('0', 'NZD')).toBe('NZD 0.00');
  });
  it('preserves leverage and signed weights in displayed percentages', () => {
    expect(exposurePercent('106.222')).toBe('106.22%');
    expect(exposurePercent('-0.333')).toBe('-0.33%');
  });
});

it('ranks a large late-inserted allocation before minor countries without mutating source order', () => {
  const source = Array.from({ length: 8 }, (_, index) => ({ label: `Minor ${index}`, value: '1' }));
  source.push({ label: 'New Zealand', value: '9007199254740993.01' });
  source.push({ label: 'United States', value: '9007199254740993.02' });
  source.push({ label: 'Hedge offset', value: '-500' });
  expect(
    rankedExposure(source)
      .slice(0, 2)
      .map((row) => row.label),
  ).toEqual(['United States', 'New Zealand']);
  expect(source[0]?.label).toBe('Minor 0');
  expect(rankedExposure(source).at(-1)?.label).toBe('Hedge offset');
});

it('uses only known signed disclosed exposure in the requested percentage basis', () => {
  expect(Number(attributedExposurePercent('253748', [{ value: '253748' }, { value: '32000' }]))).toBeCloseTo(88.801, 2);
  expect(attributedExposurePercent('100', [{ value: '120' }, { value: '-20' }])).toBe('100');
  expect(attributedExposurePercent('1', [{ value: '0' }])).toBeNull();
  expect(attributedExposurePercent('1', [{ value: '-10' }])).toBeNull();
});
