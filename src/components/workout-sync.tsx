import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { syncActorWorkouts } from '@/lib/workout-journal';

/** Retry queued results throughout the signed-in app, including after screen changes. */
export default function WorkoutSync() {
  const { session } = useAuth();
  useEffect(() => {
    const actorId = session?.user.id;
    if (!actorId) return;
    const sync = () => { void syncActorWorkouts(actorId).catch(() => {}); };
    sync();
    const timer = setInterval(sync, 30000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') sync(); });
    if (Platform.OS === 'web') { window.addEventListener('online', sync); window.addEventListener('focus', sync); }
    return () => {
      clearInterval(timer); subscription.remove();
      if (Platform.OS === 'web') { window.removeEventListener('online', sync); window.removeEventListener('focus', sync); }
    };
  }, [session?.user.id]);
  return null;
}
