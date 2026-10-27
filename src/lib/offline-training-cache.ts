import AsyncStorage from '@react-native-async-storage/async-storage';

const prefix = 'progres.cloud-cache.v1.';

export function isConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  return /network|fetch|offline|timeout|timed out|failed to connect|internet|load failed/i.test(message);
}

/** Cache is account-scoped. Authorization failures must never fall back to cached data. */
export async function cachedTrainingRead<T>(key: string, read: () => Promise<T>): Promise<T> {
  try {
    const data = await read();
    // A full disk must not turn a successful server read into an application error.
    await AsyncStorage.setItem(prefix + key, JSON.stringify(data)).catch(() => {});
    return data;
  } catch (error) {
    if (!isConnectionError(error)) throw error;
    const raw = await AsyncStorage.getItem(prefix + key);
    if (!raw) throw new Error('Brak pobranej kopii. Połącz się z internetem i otwórz ten ekran przynajmniej raz.');
    return JSON.parse(raw) as T;
  }
}

export async function clearTrainingCache(userId: string) {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((key) => key.startsWith(prefix) && key.slice(prefix.length).split(':').includes(userId)));
}
