const recoveryKey = 'koru:recovered-client-module';

type RecoveryEnvironment = {
  events: EventTarget;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  version: string;
  reload: () => void;
};

export function installStaleAssetRecovery({ events, storage, version, reload }: RecoveryEnvironment) {
  function recover(event: Event) {
    try {
      if (storage.getItem(recoveryKey) === version) return;
      storage.setItem(recoveryKey, version);
    } catch {
      return;
    }
    event.preventDefault();
    reload();
  }
  events.addEventListener('vite:preloadError', recover);
  return () => events.removeEventListener('vite:preloadError', recover);
}
