import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';
import { clearLegacyLocalData, connectLocalTraineeToTrainer, getConnectedProfiles, getLocalProfile, type AccountRole, type LocalProfile } from '@/lib/local-accounts';
import { isSupabaseConfigured } from '@/lib/supabase';
import { progresTheme } from '@/constants/progres-theme';
import { getPasswordProblem, isValidEmail, normalizeEmail } from '@/lib/auth-validation';

const c = { bg: progresTheme.background, panel: progresTheme.panel, raised: progresTheme.raised, line: progresTheme.line, text: progresTheme.text, muted: progresTheme.muted, accent: progresTheme.accent, ink: progresTheme.accentInk };
type ConnectedProfile = { id: string; full_name: string; email: string; role: AccountRole };

export default function AccountScreen() {
  const { loading, session, signUp, signIn, signInWithGoogle, signOut, deleteAccount } = useAuth();
  const [formMode, setFormMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [role, setRole] = useState<AccountRole>('trainee');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [trainerCode, setTrainerCode] = useState('');
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [connectedProfiles, setConnectedProfiles] = useState<ConnectedProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    if (!session) return () => { active = false; };
    getLocalProfile(session.user.id)
      .then(async (current) => {
        if (!current) throw new Error('Nie znaleziono lokalnego profilu.');
        const connections = await getConnectedProfiles(current);
        if (active) { setProfile(current); setConnectedProfiles(connections); }
      })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : 'Nie udało się wczytać profilu.'); });
    return () => { active = false; };
  }, [session, refresh]);

  async function submitAuth() {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail || !password) { setMessage('Wpisz adres e-mail i hasło.'); return; }
    if (!isValidEmail(cleanEmail)) { setMessage('Wpisz poprawny adres e-mail, np. imie@domena.pl.'); return; }
    if (formMode === 'sign-up' && !fullName.trim()) { setMessage('Wpisz swoje imię i nazwisko.'); return; }
    if (formMode === 'sign-up') {
      const passwordProblem = getPasswordProblem(password, cleanEmail);
      if (passwordProblem) { setMessage(passwordProblem); return; }
      if (password !== confirmPassword) { setMessage('Wpisane hasła różnią się. Sprawdź oba pola.'); return; }
    }
    setBusy(true); setMessage('');
    try {
      if (formMode === 'sign-up') await signUp({ fullName, email: cleanEmail, password, role });
      else await signIn(cleanEmail, password);
      setPassword('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Nie udało się zalogować.'); }
    finally { setBusy(false); }
  }

  async function handleGoogleSignIn() {
    setBusy(true); setMessage('');
    try { await signInWithGoogle(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Nie udało się zalogować przez Google.'); }
    finally { setBusy(false); }
  }

  async function connectToTrainer() {
    if (!session || !trainerCode.trim()) { setMessage('Wpisz kod od swojego trenera.'); return; }
    setBusy(true); setMessage('');
    try {
      await connectLocalTraineeToTrainer(session.user.id, trainerCode);
      setTrainerCode(''); setMessage('Połączono konto z trenerem.'); setRefresh((value) => value + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Nie udało się połączyć z trenerem.'); }
    finally { setBusy(false); }
  }

  async function handleSignOut() {
    setBusy(true);
    try { await signOut(); setMessage('Wylogowano.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Nie udało się wylogować.'); }
    finally { setBusy(false); }
  }

  async function handleDeleteAccount() {
    if (!session) return;
    setBusy(true); setMessage('');
    try {
      await deleteAccount(session.user.id);
      router.replace('/account');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się usunąć konta.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDeleteAccount() {
    const title = 'Usunąć konto na stałe?';
    const description = isSupabaseConfigured
      ? 'Konto, plany oraz historia treningów zostaną usunięte. Tej operacji nie można cofnąć.'
      : 'Konto, plany oraz historia treningów zapisane na tym urządzeniu zostaną usunięte. Tej operacji nie można cofnąć.';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${description}`)) void handleDeleteAccount();
      return;
    }
    Alert.alert(title, description, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń konto', style: 'destructive', onPress: () => { void handleDeleteAccount(); } },
    ]);
  }

  async function removeOldLocalData() {
    try {
      await clearLegacyLocalData();
      setMessage('Usunięto stare lokalne konta, plany i historię z tego urządzenia. Konto Supabase pozostało aktywne.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się usunąć starych danych lokalnych.');
    }
  }

  function confirmRemoveOldLocalData() {
    const title = 'Usunąć stare dane lokalne?';
    const description = 'Z tego urządzenia zostaną usunięte stare lokalne konta, plany i historia treningów. Konto i dane w Supabase pozostaną bez zmian.';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${description}`)) void removeOldLocalData();
      return;
    }
    Alert.alert(title, description, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń lokalne dane', style: 'destructive', onPress: () => { void removeOldLocalData(); } },
    ]);
  }

  return <SafeAreaView edges={['top']} style={s.safe}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.flex}>
      <ScrollView automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} contentContainerStyle={s.content} keyboardDismissMode="none" keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
        <View style={s.brandRow}><Pressable accessibilityRole="button" accessibilityLabel="Strona główna" onPress={() => router.replace('/')} style={s.brandHome}><View style={s.brandMark}><Text style={s.brandMarkText}>P</Text></View><Text style={s.brand}>PROGRES</Text></Pressable><Text style={s.pill}>KONTO</Text></View>
        {loading ? <Text style={s.subtitle}>Wczytuję konto…</Text> : session ? <>
          <Text style={s.eyebrow}>{isSupabaseConfigured ? 'PROFIL' : 'LOKALNY PROFIL'}</Text><Text style={s.title}>{profile?.full_name || 'Konto użytkownika'}</Text>
          <Text style={s.subtitle}>{session.user.email} · {profile?.role === 'trainer' ? 'Trener' : 'Osoba trenująca'}</Text>
          {profile?.role === 'trainer' && <View style={s.card}><Text style={s.cardLabel}>KOD DLA PODOPIECZNYCH</Text><Text selectable style={s.trainerCode}>{profile.trainer_code}</Text><Text style={s.body}>{isSupabaseConfigured ? 'Podopieczny może utworzyć konto na swoim urządzeniu i wpisać ten kod.' : 'Podopieczny musi utworzyć konto na tym samym urządzeniu i wpisać ten kod.'}</Text></View>}
          {profile?.role === 'trainee' && <View style={s.card}><Text style={s.cardTitle}>Połącz z trenerem</Text>{connectedProfiles.length ? <Text style={s.body}>Twój trener: {connectedProfiles[0].full_name}</Text> : <><Text style={s.body}>{isSupabaseConfigured ? 'Wpisz kod otrzymany od trenera.' : 'Wpisz kod trenera utworzonego na tym urządzeniu.'}</Text><TextInput autoCapitalize="characters" onChangeText={setTrainerCode} placeholder="KOD TRENERA" placeholderTextColor={c.muted} style={s.input} value={trainerCode}/><Pressable disabled={busy} onPress={connectToTrainer} style={[s.primary, busy && s.disabled]}><Text style={s.primaryText}>{busy ? 'ŁĄCZĘ…' : 'POŁĄCZ Z TRENEREM'}</Text></Pressable></>}</View>}
          {profile?.role === 'trainer' && <View style={s.card}>
            <Text style={s.cardTitle}>Profile podopiecznych</Text>
            <Text style={s.body}>{connectedProfiles.length ? `${connectedProfiles.length} połączonych ${connectedProfiles.length === 1 ? 'podopieczny' : 'podopiecznych'}. Otwórz profil, aby przejść do planów i raportów.` : 'Połączone konta i ich profile znajdziesz w tej sekcji.'}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/trainees')} style={s.profileLink}><Text style={s.profileLinkText}>PRZEJDŹ DO PROFILI PODOPIECZNYCH  ↗</Text></Pressable>
          </View>}
          <View style={s.card}><Text style={s.cardTitle}>{isSupabaseConfigured ? 'Wspólne dane' : 'Działanie lokalne'}</Text><Text style={s.body}>{isSupabaseConfigured ? 'Konto, plany i wyniki są synchronizowane przez Supabase i będą dostępne po zalogowaniu na innym urządzeniu.' : 'Konta, plany i wyniki są przechowywane tylko na tym urządzeniu.'}</Text></View>
          {isSupabaseConfigured && <View style={s.card}><Text style={s.cardTitle}>Stare konto lokalne</Text><Text style={s.body}>Usuń stare konta, plany i historię zapisane wyłącznie na tym urządzeniu. Konto Supabase i dane w chmurze pozostaną bez zmian.</Text><Pressable accessibilityRole="button" disabled={busy} onPress={confirmRemoveOldLocalData} style={s.dangerButton}><Text style={s.dangerButtonText}>USUŃ STARE DANE LOKALNE</Text></Pressable></View>}
          <Pressable disabled={busy} onPress={handleSignOut} style={s.secondary}><Text style={s.secondaryText}>{busy ? '...' : 'WYLOGUJ SIĘ'}</Text></Pressable>
          <View style={s.deleteAccountCard}><Text style={s.cardTitle}>Usuwanie konta</Text><Text style={s.body}>{isSupabaseConfigured ? 'Usunie konto oraz wszystkie powiązane plany i wyniki z Supabase.' : 'Usunie konto i jego plany oraz wyniki z tego urządzenia.'} Tej operacji nie można cofnąć.</Text><Pressable accessibilityRole="button" disabled={busy} onPress={confirmDeleteAccount} style={[s.deleteAccountButton, busy && s.disabled]}><Text style={s.deleteAccountButtonText}>{busy ? 'USUWANIE…' : 'USUŃ KONTO NA STAŁE'}</Text></Pressable></View>
        </> : <>
          <Text style={s.eyebrow}>{formMode === 'sign-up' ? 'UTWÓRZ KONTO' : 'LOGOWANIE'}</Text><Text style={s.title}>{formMode === 'sign-up' ? 'Twój profil.' : 'Witaj ponownie.'}</Text>
          {formMode === 'sign-up' && <>
            <Field label="IMIĘ I NAZWISKO" onChangeText={setFullName} placeholder="np. Jan Kowalski" value={fullName}/>
            <Text style={s.label}>TYP KONTA</Text><View style={s.roleChoices}>{([{ value: 'trainee', label: 'OSOBA TRENUJĄCA' }, { value: 'trainer', label: 'TRENER' }] as const).map((option) => <Pressable key={option.value} onPress={() => setRole(option.value)} style={[s.roleChoice, role === option.value && s.roleChoiceSelected]}><Text style={[s.roleChoiceText, role === option.value && s.roleChoiceTextSelected]}>{option.label}</Text></Pressable>)}</View>
          </>}
          <Field autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" label="E-MAIL" onChangeText={setEmail} placeholder="ty@przyklad.pl" value={email}/>
          <Field autoCapitalize="none" autoComplete={formMode === 'sign-up' ? 'new-password' : 'current-password'} autoCorrect={false} label={formMode === 'sign-up' ? 'HASŁO · MIN. 15 ZNAKÓW' : 'HASŁO'} onChangeText={setPassword} placeholder="•••••••••••••••" secureTextEntry value={password}/>
          {formMode === 'sign-up' && <>
            <Text style={s.passwordHint}>Użyj długiej frazy, np. kilku niepowiązanych słów. Nie musisz dodawać specjalnych znaków ani cyfr.</Text>
            <Field autoCapitalize="none" autoComplete="new-password" autoCorrect={false} label="POWTÓRZ HASŁO" onChangeText={setConfirmPassword} placeholder="Wpisz hasło ponownie" secureTextEntry value={confirmPassword}/>
          </>}
          <Text style={s.localHint}>{isSupabaseConfigured ? (formMode === 'sign-up' ? 'Wyślemy link potwierdzający na ten adres e-mail.' : 'Zaloguj się adresem e-mail przypisanym do konta Progres.') : 'To konto działa tylko w tej instalacji aplikacji.'}</Text>
          {isSupabaseConfigured && <>
            <View style={s.separator}><View style={s.separatorLine}/><Text style={s.separatorText}>LUB</Text><View style={s.separatorLine}/></View>
            <Pressable accessibilityRole="button" disabled={busy} onPress={handleGoogleSignIn} style={[s.googleButton, busy && s.disabled]}><Text style={s.googleButtonText}>{busy ? 'ŁĄCZĘ Z GOOGLE…' : 'KONTYNUUJ Z GOOGLE'}</Text></Pressable>
            <Text style={s.googleHint}>Nowe konto Google otrzyma profil osoby trenującej. Zweryfikowany adres zgodny z istniejącym kontem Progres zostanie połączony z tym profilem. Nowe konto trenera utwórz przez e-mail.</Text>
          </>}
          {isSupabaseConfigured && <Pressable accessibilityRole="button" onPress={confirmRemoveOldLocalData} style={s.clearLocalLink}><Text style={s.clearLocalLinkText}>USUŃ STARE LOKALNE KONTO I DANE Z TEGO URZĄDZENIA</Text></Pressable>}
          <Pressable disabled={busy} onPress={submitAuth} style={[s.primary, busy && s.disabled]}><Text style={s.primaryText}>{busy ? 'CHWILA…' : formMode === 'sign-up' ? 'UTWÓRZ KONTO' : 'ZALOGUJ SIĘ'}</Text></Pressable>
          <Pressable onPress={() => { setFormMode(formMode === 'sign-up' ? 'sign-in' : 'sign-up'); setMessage(''); }} style={s.switchMode}><Text style={s.switchModeText}>{formMode === 'sign-up' ? 'Masz konto? Zaloguj się.' : 'Nie masz konta? Zarejestruj się.'}</Text></Pressable>
        </>}
        {message ? <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function Field({ label, ...inputProps }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'; autoComplete?: 'email' | 'new-password' | 'current-password'; autoCorrect?: boolean; keyboardType?: 'default' | 'email-address'; secureTextEntry?: boolean }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput {...inputProps} placeholderTextColor={c.muted} selectionColor={c.accent} style={s.input}/></View>;
}

const s = StyleSheet.create({
  flex: { flex: 1 }, safe: { flex: 1, backgroundColor: c.bg }, content: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 48, maxWidth: 600, width: '100%', alignSelf: 'center', flexGrow: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 40 }, brandHome: { flex: 1, flexDirection: 'row', alignItems: 'center' }, brandMark: { width: 30, height: 30, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', marginRight: 10 }, brandMarkText: { color: c.ink, fontSize: 19, fontWeight: '900' }, brand: { flex: 1, color: c.text, letterSpacing: 2.4, fontSize: 13, fontWeight: '800' }, pill: { color: c.muted, borderColor: c.line, borderWidth: 1, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7, fontSize: 9, letterSpacing: 1.4, fontWeight: '700' },
  eyebrow: { color: c.accent, fontSize: 10, letterSpacing: 1.7, fontWeight: '800', marginBottom: 10 }, title: { color: c.text, fontSize: 34, lineHeight: 39, letterSpacing: -1, fontWeight: '800' }, subtitle: { color: c.muted, fontSize: 13, lineHeight: 20, marginTop: 10, marginBottom: 24 },
  card: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 16, padding: 16, marginVertical: 8 }, cardTitle: { color: c.text, fontSize: 16, fontWeight: '800', marginBottom: 8 }, cardLabel: { color: c.muted, fontSize: 9, letterSpacing: 1, fontWeight: '800' }, body: { color: c.muted, fontSize: 12, lineHeight: 19, marginTop: 7 }, trainerCode: { color: c.accent, fontSize: 28, letterSpacing: 3, fontWeight: '900', marginTop: 8 }, profileLink: { minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 11, marginTop: 12, borderRadius: 9, backgroundColor: c.raised }, profileLinkText: { color: c.accent, fontSize: 9, letterSpacing: 0.6, fontWeight: '900' },
  field: { marginTop: 12 }, label: { color: c.muted, fontSize: 9, letterSpacing: 1, fontWeight: '800', marginBottom: 6 }, input: { color: c.text, height: 47, borderRadius: 10, backgroundColor: c.raised, paddingHorizontal: 12, fontSize: 13, borderWidth: 1, borderColor: c.line }, roleChoices: { flexDirection: 'row', gap: 8, marginBottom: 3 }, roleChoice: { flex: 1, minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: c.line, backgroundColor: c.panel, alignItems: 'center', justifyContent: 'center' }, roleChoiceSelected: { backgroundColor: c.accent, borderColor: c.accent }, roleChoiceText: { color: c.muted, fontSize: 9, letterSpacing: 0.6, fontWeight: '900' }, roleChoiceTextSelected: { color: c.ink },
  primary: { minHeight: 49, borderRadius: 11, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingHorizontal: 12 }, primaryText: { color: c.ink, fontSize: 10, letterSpacing: 0.9, fontWeight: '900', textAlign: 'center' }, secondary: { minHeight: 44, borderWidth: 1, borderColor: c.line, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 13 }, secondaryText: { color: c.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 }, switchMode: { paddingVertical: 16, alignItems: 'center' }, switchModeText: { color: c.accent, fontSize: 12, fontWeight: '700' }, localHint: { color: c.muted, fontSize: 11, lineHeight: 16, marginTop: 12 }, passwordHint: { color: c.muted, fontSize: 11, lineHeight: 16, marginTop: 7 }, googleHint: { color: c.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 8 }, separator: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 17 }, separatorLine: { flex: 1, height: 1, backgroundColor: c.line }, separatorText: { color: c.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 }, googleButton: { minHeight: 47, borderRadius: 11, backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 13, paddingHorizontal: 12 }, googleButtonText: { color: c.text, fontSize: 10, letterSpacing: 0.8, fontWeight: '900', textAlign: 'center' }, message: { color: c.text, fontSize: 12, lineHeight: 18, marginTop: 9 }, disabled: { opacity: 0.55 },
  dangerButton: { minHeight: 43, borderWidth: 1, borderColor: '#7C4941', borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 13, paddingHorizontal: 10 }, dangerButtonText: { color: '#FF9A87', fontSize: 9, letterSpacing: 0.8, fontWeight: '900', textAlign: 'center' },
  deleteAccountCard: { backgroundColor: '#211715', borderColor: '#7C4941', borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 24 }, deleteAccountButton: { minHeight: 45, borderRadius: 10, backgroundColor: '#7C3029', alignItems: 'center', justifyContent: 'center', marginTop: 13, paddingHorizontal: 10 }, deleteAccountButtonText: { color: '#FFF0ED', fontSize: 10, letterSpacing: 0.8, fontWeight: '900', textAlign: 'center' },
  clearLocalLink: { minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, marginTop: 4 }, clearLocalLinkText: { color: '#FF9A87', fontSize: 8, letterSpacing: 0.4, fontWeight: '800', textAlign: 'center' },
});
