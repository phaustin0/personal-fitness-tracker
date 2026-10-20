export type StorageStatus = 'persistent' | 'best-effort' | 'unsupported';

export async function requestPersistentStorage(): Promise<StorageStatus> {
  if (!navigator.storage?.persist) return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'persistent';
    return (await navigator.storage.persist()) ? 'persistent' : 'best-effort';
  } catch {
    return 'best-effort';
  }
}

export async function storageStatus(): Promise<StorageStatus> {
  if (!navigator.storage?.persisted) return 'unsupported';
  try {
    return (await navigator.storage.persisted()) ? 'persistent' : 'best-effort';
  } catch {
    return 'best-effort';
  }
}
