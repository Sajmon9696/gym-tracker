import { rememberOfflineIdentity } from '@/lib/offline-auth-identity';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { deleteAccountData, getStoredSession, registerLocalAccount, signInLocalAccount, signOutLocalAccount, type AccountRole, type LocalSession } from '@/lib/local-accounts';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  loading: boolean;
  session: LocalSession | null;
  signUp: (input: { fullName: string; email: string; password: string; role: AccountRole }) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: (userId: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  loading: true,
  session: null,
  signUp: async () => { throw new Error('Konto jest niedostępne.'); },
  signIn: async () => { throw new Error('Konto jest niedostępne.'); },
  signInWithGoogle: async () => { throw new Error('Logowanie Google jest niedostępne.'); },
  signOut: async () => {},
  deleteAccount: async () => { throw new Error('Usuwanie konta jest niedostępne.'); },
});

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<LocalSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const subscription = supabase?.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (nextSession) void rememberOfflineIdentity({ user: { id: nextSession.user.id, email: nextSession.user.email ?? '' } }).catch(() => {});
      else if (event === 'SIGNED_OUT') void rememberOfflineIdentity(null).catch(() => {});
      setSession(nextSession ? { user: { id: nextSession.user.id, email: nextSession.user.email ?? '' } } : null);
    }).data.subscription;
    getStoredSession()
      .then((stored) => { if (active) setSession(stored); })
      .catch(() => { if (active) setSession(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);

  // Po powrocie z tła odświeżamy sesję, zamiast czekać na nieudany zapis treningu.
  useEffect(() => {
    if (Platform.OS === 'web' || !supabase) return;
    const client = supabase;
    const updateRefresh = (state: string) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    };
    updateRefresh(AppState.currentState);
    const subscription = AppState.addEventListener('change', updateRefresh);
    return () => { subscription.remove(); client.auth.stopAutoRefresh(); };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) throw new Error('Logowanie Google wymaga połączenia z Supabase.');

    // On web, return to the origin the user is actually using. A fixed
    // localhost URL works on the development computer but is unreachable
    // when OAuth is started from a phone or a public tunnel URL.
    const redirectTo = Platform.OS === 'web'
      ? new URL('/account', window.location.origin).toString()
      : AuthSession.makeRedirectUri({ scheme: 'gymtracker', path: 'account' });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data.url) throw new Error('Google nie zwrócił adresu logowania. Spróbuj ponownie.');

    if (Platform.OS === 'web') {
      window.location.assign(data.url);
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return;

    const callbackUrl = new URL(result.url);
    const callbackError = callbackUrl.searchParams.get('error_description') ?? callbackUrl.searchParams.get('error');
    if (callbackError) throw new Error(callbackError);
    const code = callbackUrl.searchParams.get('code');
    if (!code) throw new Error('Google nie zakończył logowania. Spróbuj ponownie.');

    const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    if (!sessionData.session) throw new Error('Logowanie Google nie zwróciło aktywnej sesji.');
    setSession({ user: { id: sessionData.session.user.id, email: sessionData.session.user.email ?? '' } });
  }, [setSession]);

  const value = useMemo<AuthContextValue>(() => ({
    loading,
    session,
    signUp: async (input) => setSession(await registerLocalAccount(input)),
    signIn: async (email, password) => setSession(await signInLocalAccount(email, password)),
    signInWithGoogle,
    signOut: async () => { await signOutLocalAccount(); setSession(null); },
    deleteAccount: async (userId) => { await deleteAccountData(userId); setSession(null); },
  }), [loading, session, signInWithGoogle]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
