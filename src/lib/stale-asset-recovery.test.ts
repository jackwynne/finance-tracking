import { describe, expect, it } from 'vitest';

import { installStaleAssetRecovery } from './stale-asset-recovery';

describe('stale deployment asset recovery', () => {
  it('reloads a failed Vite import once for each client version across page reloads', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    let reloads = 0;
    function page(version: string) {
      const events = new EventTarget();
      installStaleAssetRecovery({
        events,
        storage,
        version,
        reload: () => {
          reloads++;
        },
      });
      const failure = new Event('vite:preloadError', { cancelable: true });
      events.dispatchEvent(failure);
      return failure;
    }
    expect(page('old-client.js').defaultPrevented).toBe(true);
    expect(reloads).toBe(1);
    expect(page('old-client.js').defaultPrevented).toBe(false);
    expect(reloads).toBe(1);
    expect(page('new-client.js').defaultPrevented).toBe(true);
    expect(reloads).toBe(2);
  });
  it('leaves unrelated errors and failures without persistent storage visible', () => {
    const events = new EventTarget();
    let reloads = 0;
    const cleanup = installStaleAssetRecovery({
      events,
      version: 'client.js',
      storage: {
        getItem: () => {
          throw new Error('Storage unavailable');
        },
        setItem: () => {},
      },
      reload: () => {
        reloads++;
      },
    });
    const unrelated = new Event('error', { cancelable: true });
    events.dispatchEvent(unrelated);
    const failure = new Event('vite:preloadError', { cancelable: true });
    events.dispatchEvent(failure);
    expect(unrelated.defaultPrevented).toBe(false);
    expect(failure.defaultPrevented).toBe(false);
    expect(reloads).toBe(0);
    cleanup();
  });
});
