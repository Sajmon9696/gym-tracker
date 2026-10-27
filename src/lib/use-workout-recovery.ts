import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  adoptRemoteWorkout, archivedWorkouts, checkpointWorkout, claimLocalWorkout, findRemoteWorkout,
  finishSavedWorkout, getSavedWorkout, getWorkoutSyncStatus, pendingWorkoutSessions, shouldOfferRemoteWorkout, subscribeWorkoutSync,
  type RemoteWorkout, type WorkoutDraft, type WorkoutScope,
} from '@/lib/workout-journal';
import type { TrainingSession } from '@/lib/plans';

export function useWorkoutRecovery(scope: WorkoutScope | null, live: WorkoutDraft | null) {
  const [saved, setSaved] = useState<WorkoutDraft | null>(null);
  const [remote, setRemote] = useState<RemoteWorkout | null>(null);
  const [loadedScope, setLoadedScope] = useState<WorkoutScope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signature = useRef('');
  const currentScope = useRef(scope);
  const syncStatus = useSyncExternalStore(subscribeWorkoutSync,
    useCallback(() => scope ? getWorkoutSyncStatus(scope) : undefined, [scope]), () => undefined);

  const reload = useCallback(async () => {
    if (!scope) return;
    const cloud = await findRemoteWorkout(scope);
    const local = await getSavedWorkout(scope);
    const offerRemote = cloud ? await shouldOfferRemoteWorkout(scope, cloud) : false;
    if (currentScope.current !== scope) return;
    setSaved(local); setRemote(offerRemote ? cloud : null); setLoadedScope(scope);
  }, [scope]);

  useEffect(() => {
    currentScope.current = scope;
    signature.current = '';
    if (!scope) return;
    let active = true;
    void reload().catch((cause: unknown) => { if (active) { setError(cause instanceof Error ? cause.message : 'Nie można odczytać kopii treningu.'); setLoadedScope(scope); } });
    return () => { active = false; if (currentScope.current === scope) currentScope.current = null; };
  }, [scope, reload]);

  const save = useCallback(async (draft: WorkoutDraft) => {
    if (!scope) throw new Error('Zaloguj się przed rozpoczęciem treningu.');
    const serialized = JSON.stringify(draft);
    if (signature.current === serialized) return;
    await checkpointWorkout(scope, draft);
    signature.current = serialized;
    if (currentScope.current === scope) { setSaved(draft); setError(null); setLoadedScope(scope); }
  }, [scope]);

  // Persist input changes as well as confirmed sets. Confirm buttons await save explicitly.
  useEffect(() => {
    if (!live) return;
    void save(live).catch((cause: unknown) => { if (currentScope.current === scope) setError(cause instanceof Error ? cause.message : 'Nie zapisano zmian. Sprawdź wolne miejsce.'); });
  }, [live, save, scope]);

  const resume = useCallback(async () => {
    if (!scope) return null;
    const draft = await claimLocalWorkout(scope);
    if (draft) signature.current = JSON.stringify(draft);
    return draft;
  }, [scope]);

  const adopt = useCallback(async (record: RemoteWorkout) => {
    if (!scope) return null;
    const draft = await adoptRemoteWorkout(scope, record);
    signature.current = draft ? JSON.stringify(draft) : '';
    setSaved(draft); setRemote(null);
    return draft;
  }, [scope]);

  const finish = useCallback(async (draft: WorkoutDraft, completed: TrainingSession) => {
    if (!scope) throw new Error('Brak aktywnego konta.');
    await finishSavedWorkout(scope, draft, completed);
    signature.current = ''; setSaved(null); setRemote(null);
  }, [scope]);

  const exportCopies = useCallback(async () => {
    if (!scope) return '{}';
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), active: await getSavedWorkout(scope),
      pending: await pendingWorkoutSessions(scope), conflicts: await archivedWorkouts(scope) }, null, 2);
  }, [scope]);

  const loaded = scope === loadedScope;
  return { saved: loaded ? saved : null, remote: loaded ? remote : null, ready: !scope || loaded,
    error: loaded ? error : null, status: syncStatus, save, resume, adopt, finish, reload, exportCopies };
}
