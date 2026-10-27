import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';

import type { CompletedSet, TrainingDay, TrainingPlan, TrainingSession } from '@/lib/plans';
import { supabase } from '@/lib/supabase';
import { isConnectionError } from '@/lib/offline-training-cache';

export type SetEditContext = { resumeIndex: number; wasExerciseComplete: boolean; wasExerciseSkipped: boolean };
export type WorkoutDraft = {
  id: string;
  startedAt: string;
  plan: TrainingPlan;
  day: TrainingDay;
  /** Targets are frozen when the workout starts, including computed progression. */
  targetDay: TrainingDay;
  values: Record<string, CompletedSet[]>;
  counts: Record<string, number>;
  completed: string[];
  skipped: string[];
  edits: Record<string, SetEditContext>;
};
type Entry = {
  draft: WorkoutDraft;
  controller: string;
  writer: string;
  sequence: number;
  remoteRevision: number;
  syncedSequence: number;
  finished?: TrainingSession;
  archived?: boolean;
};
type Journal = { version: 1; entries: Entry[] };
export type RemoteWorkout = { id: string; trainee_id: string; writer_id: string; revision: number; state: 'active' | 'completed'; payload: WorkoutDraft; session_data: TrainingSession | null };
export type SyncStatus = { kind: 'saved' | 'saving' | 'syncing' | 'synced' | 'offline' | 'conflict' | 'blocked' | 'storage-error'; message: string; remote?: RemoteWorkout };
export type WorkoutScope = { actorId: string; ownerId: string };

const prefix = 'progres.workout-journal.v1.';
const indexKey = (actor: string) => `${prefix}index.${actor}`;
const scopeKey = (scope: WorkoutScope) => `${prefix}${scope.actorId}.${scope.ownerId}`;
const historyKey = (scope: WorkoutScope) => `${prefix}history.${scope.actorId}.${scope.ownerId}`;
const empty = (): Journal => ({ version: 1, entries: [] });
const chains = new Map<string, Promise<unknown>>();
const syncing = new Map<string, Promise<void>>();
const statuses = new Map<string, SyncStatus>();
const listeners = new Set<() => void>();
const scheduled = new Map<string, ReturnType<typeof setTimeout>>();
let devicePromise: Promise<string> | undefined;

export const newWorkoutId = () => Crypto.randomUUID();
export const subscribeWorkoutSync = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getWorkoutSyncStatus = (scope: WorkoutScope) => statuses.get(scopeKey(scope));
function status(scope: WorkoutScope, value: SyncStatus) { statuses.set(scopeKey(scope), value); listeners.forEach((listener) => listener()); }

async function writerId() {
  if (!devicePromise) devicePromise = (async () => {
    // Each browser tab has its own writer, retained across reloads. Android retains its installation ID.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const key = 'progres.workout-writer.v1';
      const existing = window.sessionStorage.getItem(key);
      if (existing) return existing;
      const created = newWorkoutId(); window.sessionStorage.setItem(key, created); return created;
    }
    const key = 'progres.workout-device.v1';
    const existing = await AsyncStorage.getItem(key);
    if (existing) return existing;
    const created = newWorkoutId(); await AsyncStorage.setItem(key, created); return created;
  })();
  return devicePromise;
}

/** Serializes read-modify-write, including separate tabs in supported HTTPS browsers. */
function transaction<T>(scope: WorkoutScope, action: (journal: Journal) => Promise<T>): Promise<T> {
  const key = scopeKey(scope);
  const run = async () => {
    const execute = async () => {
      const raw = await AsyncStorage.getItem(key);
      const journal = raw ? JSON.parse(raw) as Journal : empty();
      if (journal.version !== 1 || !Array.isArray(journal.entries)) throw new Error('Nie można odczytać kopii treningu. Zachowaj dane aplikacji i skontaktuj się z pomocą.');
      const result = await action(journal);
      const serialized = JSON.stringify(journal);
      if (serialized !== raw) await AsyncStorage.setItem(key, serialized);
      return result;
    };
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(key, execute);
    return execute();
  };
  const promise = (chains.get(key) ?? Promise.resolve()).catch(() => {}).then(run);
  chains.set(key, promise);
  return promise;
}

async function registerScope(scope: WorkoutScope) {
  // Usually one scope; trainer scopes are also retried after leaving the trainee screen.
  const key = indexKey(scope.actorId);
  const update = async () => {
    const raw = await AsyncStorage.getItem(key);
    const owners = raw ? JSON.parse(raw) as string[] : [];
    if (!owners.includes(scope.ownerId)) await AsyncStorage.setItem(key, JSON.stringify([...owners, scope.ownerId]));
  };
  const promise = (chains.get(key) ?? Promise.resolve()).catch(() => {}).then(() =>
    Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request(key, update) : update());
  chains.set(key, promise);
  await promise;
}

export async function getSavedWorkout(scope: WorkoutScope) {
  return transaction(scope, async (journal) => journal.entries.find((entry) => !entry.finished && !entry.archived)?.draft ?? null);
}

export async function checkpointWorkout(scope: WorkoutScope, draft: WorkoutDraft) {
  const writer = await writerId();
  status(scope, { kind: 'saving', message: 'Zapisuję na urządzeniu…' });
  try {
    await registerScope(scope);
    await transaction(scope, async (journal) => {
      const active = journal.entries.find((entry) => !entry.finished && !entry.archived);
      if (active && active.draft.id !== draft.id) throw new Error('Najpierw wznów i zakończ rozpoczęty trening.');
      const entry = journal.entries.find((entry) => entry.draft.id === draft.id && !entry.archived);
      if (entry && entry.controller !== writer) throw new Error('Ten trening jest otwarty w innej karcie. Wznów go tutaj, aby przejąć zapis.');
      if (entry?.finished) throw new Error('Ten trening został już zakończony.');
      if (entry) { entry.draft = draft; entry.sequence += 1; }
      else journal.entries.push({ draft, controller: writer, writer: newWorkoutId(), sequence: 1, remoteRevision: 0, syncedSequence: 0 });
    });
    status(scope, { kind: 'saved', message: 'Zapisano na urządzeniu · oczekuje na synchronizację' });
    const key = scopeKey(scope);
    clearTimeout(scheduled.get(key));
    scheduled.set(key, setTimeout(() => { scheduled.delete(key); void syncWorkoutScope(scope); }, 600));
  } catch (error) {
    status(scope, { kind: 'storage-error', message: error instanceof Error ? error.message : 'Nie zapisano na urządzeniu. Sprawdź wolne miejsce.' });
    throw error;
  }
}

export async function finishSavedWorkout(scope: WorkoutScope, draft: WorkoutDraft, completed: TrainingSession) {
  const writer = await writerId();
  await transaction(scope, async (journal) => {
    const entry = journal.entries.find((entry) => entry.draft.id === draft.id && !entry.archived);
    if (!entry || entry.controller !== writer) throw new Error('Wznów trening na tym urządzeniu przed zakończeniem.');
    if (entry.finished) return;
    // Finished result and removal from the active list are one local write. Retries use the same ID.
    entry.draft = draft; entry.finished = completed; entry.sequence += 1;
  });
  status(scope, { kind: 'saved', message: 'Trening zapisany na urządzeniu · oczekuje na wysłanie' });
  void syncWorkoutScope(scope);
}

export async function pendingWorkoutSessions(scope: WorkoutScope) {
  return transaction(scope, async (journal) => journal.entries.filter((entry) => !entry.archived && entry.finished).map((entry) => entry.finished!));
}

/** Recently synced sessions remain available offline even if the server cache was fetched earlier. */
export async function cachedWorkoutSessions(scope: WorkoutScope) {
  return transaction(scope, async (journal) => {
    const raw = await AsyncStorage.getItem(historyKey(scope));
    const history = raw ? JSON.parse(raw) as TrainingSession[] : [];
    const merged = new Map(history.map((entry) => [entry.id, entry]));
    journal.entries.forEach((entry) => { if (!entry.archived && entry.finished) merged.set(entry.finished.id, entry.finished); });
    return [...merged.values()];
  });
}

export async function archivedWorkouts(scope: WorkoutScope) {
  return transaction(scope, async (journal) => journal.entries.filter((entry) => entry.archived).map((entry) => ({ draft: entry.draft, session: entry.finished })));
}

export async function syncWorkoutScope(scope: WorkoutScope): Promise<void> {
  const key = scopeKey(scope);
  const running = syncing.get(key);
  if (running) return running;
  const run = async () => {
    if (!supabase) return;
    if ((await supabase.auth.getSession()).data.session?.user.id !== scope.actorId) return;
    for (;;) {
      const entry = await transaction(scope, async (journal) => journal.entries.find((item) => !item.archived && item.sequence > item.syncedSequence));
      if (!entry) { status(scope, { kind: 'synced', message: 'Zsynchronizowano z chmurą' }); return; }
      // A tab may read another tab's journal, but it must never publish that tab's work.
      if (entry.controller !== await writerId()) { status(scope, { kind: 'blocked', message: 'Trening jest otwarty w innej karcie. Wznów go tutaj, aby przejąć zapis.' }); return; }
      status(scope, { kind: 'syncing', message: 'Zapisano na urządzeniu · wysyłanie do chmury…' });
      const { data, error } = await supabase.rpc('save_workout_checkpoint', {
        p_owner: scope.ownerId, p_writer: entry.writer, p_expected_revision: entry.remoteRevision,
        p_operation: `${entry.draft.id}:${entry.sequence}`, p_payload: entry.draft, p_session: entry.finished ?? null,
      });
      if (error) {
        const missing = error.code === 'PGRST202' || error.code === 'PGRST205';
        status(scope, { kind: isConnectionError(error) ? 'offline' : 'blocked', message: missing
          ? 'Zapisano na urządzeniu. Synchronizacja wymaga aktualizacji bazy (migracja 006).'
          : isConnectionError(error) ? 'Brak połączenia · wyniki zapisane na urządzeniu. Wyślę je po odzyskaniu sieci.'
            : 'Zapisano na urządzeniu. Chmura odrzuciła zapis. Ponów po sprawdzeniu dostępu do planu.' });
        return;
      }
      const response = data as { ok: boolean; record: RemoteWorkout };
      if (!response.ok) {
        status(scope, { kind: 'conflict', message: 'Na innym urządzeniu jest inna wersja treningu. Lokalna kopia jest zachowana.', remote: response.record });
        return;
      }
      await transaction(scope, async (journal) => {
        const current = journal.entries.find((item) => item.draft.id === entry.draft.id && !item.archived);
        if (!current || current.writer !== entry.writer) return;
        current.remoteRevision = response.record.revision;
        current.syncedSequence = entry.sequence;
        // Remove only acknowledged finished entries. Unsent changes stay in the queue.
        if (current.finished && current.sequence === entry.sequence) {
          const raw = await AsyncStorage.getItem(historyKey(scope));
          const history = raw ? JSON.parse(raw) as TrainingSession[] : [];
          const recent = [current.finished, ...history.filter((item) => item.id !== current.finished!.id)]
            .sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 40);
          await AsyncStorage.setItem(historyKey(scope), JSON.stringify(recent));
          journal.entries = journal.entries.filter((item) => item !== current);
        }
      });
    }
  };
  const promise = run().catch((error: unknown) => {
    status(scope, { kind: 'blocked', message: error instanceof Error ? error.message : 'Nie udało się zsynchronizować. Lokalna kopia pozostaje zachowana.' });
  }).finally(() => { syncing.delete(key); });
  syncing.set(key, promise);
  return promise;
}

export async function syncActorWorkouts(actorId: string) {
  const raw = await AsyncStorage.getItem(indexKey(actorId));
  const owners = raw ? JSON.parse(raw) as string[] : [];
  for (const ownerId of owners) await syncWorkoutScope({ actorId, ownerId });
}

export async function findRemoteWorkout(scope: WorkoutScope) {
  if (!supabase || (await supabase.auth.getSession()).data.session?.user.id !== scope.actorId) return null;
  const { data, error } = await supabase.from('workout_checkpoints').select('*').eq('trainee_id', scope.ownerId).eq('state', 'active').maybeSingle();
  if (error) return null;
  return data as RemoteWorkout | null;
}

export async function shouldOfferRemoteWorkout(scope: WorkoutScope, remote: RemoteWorkout) {
  const controller = await writerId();
  return transaction(scope, async (journal) => {
    const local = journal.entries.find((entry) => !entry.archived && entry.draft.id === remote.id);
    return !local || local.writer !== remote.writer_id || local.controller !== controller;
  });
}

/** Takeover always adopts the server state. Conflicting local results are kept for export. */
export async function adoptRemoteWorkout(scope: WorkoutScope, remote: RemoteWorkout) {
  if (!supabase) throw new Error('Brak połączenia z bazą.');
  const controller = await writerId();
  const writer = newWorkoutId();
  const { data, error } = await supabase.rpc('claim_workout_checkpoint', { p_id: remote.id, p_expected_revision: remote.revision, p_writer: writer });
  if (error) throw error;
  const response = data as { ok: boolean; record: RemoteWorkout };
  if (!response.ok) throw new Error('Trening zmienił się w międzyczasie. Odśwież i spróbuj ponownie.');
  await registerScope(scope);
  await transaction(scope, async (journal) => {
    const conflicting = journal.entries.find((entry) => !entry.archived && entry.sequence > entry.syncedSequence);
    journal.entries.forEach((entry) => { if (!entry.archived && (!entry.finished || entry === conflicting || entry.draft.id === remote.id)) entry.archived = true; });
    if (response.record.state === 'active') journal.entries.push({ draft: response.record.payload, controller, writer, sequence: 1, syncedSequence: 1, remoteRevision: response.record.revision });
  });
  status(scope, { kind: 'synced', message: 'Przejęto trening. Poprzednia lokalna kopia jest dostępna do eksportu.' });
  return response.record.state === 'active' ? response.record.payload : null;
}

export async function claimLocalWorkout(scope: WorkoutScope) {
  const writer = await writerId();
  return transaction(scope, async (journal) => {
    const entry = journal.entries.find((entry) => !entry.archived && !entry.finished);
    if (!entry) return null;
    // A different local tab must first claim the authoritative cloud version.
    if (entry.controller !== writer) throw new Error('Trening należy do innej karty. Użyj przycisku „Wznów z chmury” przy aktywnym połączeniu.');
    return entry.draft;
  });
}

export async function clearWorkoutJournal(actorId: string) {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((key) => key.startsWith(prefix) && (key.includes(`.${actorId}.`) || key.endsWith(`.${actorId}`))));
}
