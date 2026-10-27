import AsyncStorage from '@react-native-async-storage/async-storage';

type Identity = { user: { id: string; email: string } };
const key = `progres.offline-identity.v1.${process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'local'}`;
let writes: Promise<unknown> = Promise.resolve();

/** Identity only, never an access token. It unlocks local data, not server permissions. */
export function rememberOfflineIdentity(identity: Identity | null) {
  const operation = writes.catch(() => {}).then(() => identity
    ? AsyncStorage.setItem(key, JSON.stringify(identity)) : AsyncStorage.removeItem(key));
  writes = operation;
  return operation;
}

export async function readOfflineIdentity() {
  await writes.catch(() => {});
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  const identity = JSON.parse(raw) as Identity;
  return typeof identity.user?.id === 'string' && typeof identity.user.email === 'string' ? identity : null;
}
