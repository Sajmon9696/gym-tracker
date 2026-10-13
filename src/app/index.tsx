import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
import { getLocalProfile, type LocalProfile } from '@/lib/local-accounts';
import { progresTheme as colors } from '@/constants/progres-theme';
import { isSupabaseConfigured } from '@/lib/supabase';

export default function HomeScreen() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<LocalProfile | null>(null);

  useEffect(() => {
    let active = true;
    if (session?.user.id) getLocalProfile(session.user.id).then((current) => { if (active) setProfile(current); }).catch(() => { if (active) setProfile(null); });
    return () => { active = false; };
  }, [session?.user.id]);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topLine}>
          <Pressable accessibilityRole="button" accessibilityLabel="Strona główna" onPress={() => router.replace('/')} style={styles.brandHome}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>P</Text></View>
          <Text style={styles.brand}>PROGRES</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/account')} style={styles.statusButton}><Text style={styles.status}>KONTO</Text></Pressable>
        </View>

        <Text style={styles.eyebrow}>ZACZNIJ TUTAJ</Text>
        <Text style={styles.title}>Trenuj po swojemu.</Text>
        <Text style={styles.subtitle}>Wybierz, co chcesz dziś zrobić.</Text>

        {profile?.role === 'trainer' && <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/trainees')}
          style={({ pressed }) => [styles.option, styles.traineesOption, pressed && styles.pressed]}>
          <View style={styles.optionTop}>
            <View style={[styles.optionIcon, styles.secondaryIcon]}><Text style={[styles.optionIconText, styles.traineesIcon]}>◎</Text></View>
            <Text style={[styles.arrow, styles.traineesIcon]}>↗</Text>
          </View>
          <Text style={styles.optionTitle}>Podopieczni</Text>
          <Text style={styles.optionHint}>Otwórz profile podopiecznych, ich plany i raporty z mikrocykli.</Text>
          <Text style={[styles.optionAction, styles.traineesIcon]}>ZOBACZ PODOPIECZNYCH</Text>
        </Pressable>}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/plans', params: { action: 'create' } })}
          style={({ pressed }) => [styles.option, styles.createOption, pressed && styles.pressed]}>
          <View style={styles.optionTop}>
            <View style={styles.optionIcon}><Text style={styles.optionIconText}>＋</Text></View>
            <Text style={styles.arrow}>↗</Text>
          </View>
          <Text style={[styles.optionTitle, styles.createTitle]}>Utwórz nowy plan</Text>
          <Text style={[styles.optionHint, styles.createHint]}>Ułóż dni treningowe, wybierz ćwiczenia i ustaw swój cel.</Text>
          <Text style={[styles.optionAction, styles.createAction]}>STWÓRZ PLAN</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/plans')}
          style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
          <View style={styles.optionTop}>
          <View style={[styles.optionIcon, styles.secondaryIcon]}><Text style={[styles.optionIconText, styles.secondaryIconText]}>▶</Text></View>
            <Text style={styles.arrow}>↗</Text>
          </View>
          <Text style={styles.optionTitle}>Realizuj plan</Text>
          <Text style={styles.optionHint}>Kontynuuj od następnego dnia i zapisuj wykonane serie.</Text>
          <Text style={styles.optionAction}>OTWÓRZ PLANY</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/explore')}
          style={({ pressed }) => [styles.option, styles.progressOption, pressed && styles.pressed]}>
          <View style={styles.optionTop}>
            <View style={[styles.optionIcon, styles.secondaryIcon]}><Text style={[styles.optionIconText, styles.progressIconText]}>↗</Text></View>
            <Text style={[styles.arrow, styles.progressIconText]}>↗</Text>
          </View>
          <Text style={[styles.optionTitle, styles.progressTitle]}>Postępy i rekordy</Text>
          <Text style={[styles.optionHint, styles.progressHint]}>Zobacz ćwiczenia oraz najlepsze ciężary przy różnych powtórzeniach.</Text>
          <Text style={[styles.optionAction, styles.progressAction]}>ZOBACZ POSTĘPY</Text>
        </Pressable>

        <Text style={styles.footer}>{isSupabaseConfigured ? session ? 'Twoje dane synchronizują się przez Supabase.' : 'Zaloguj się, aby korzystać ze swojego konta.' : 'Dane są zapisywane tylko na tym urządzeniu.'}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 28, maxWidth: 720, width: '100%', alignSelf: 'center', flexGrow: 1 },
  topLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
  brandHome: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  brandMark: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  brandMarkText: { color: colors.accentInk, fontSize: 19, fontWeight: '900' },
  brand: { color: colors.text, letterSpacing: 2.4, fontSize: 13, fontWeight: '800', flex: 1 },
  status: { color: colors.muted, fontSize: 9, letterSpacing: 1.3, fontWeight: '700', borderWidth: 1, borderColor: colors.line, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7 },
  statusButton: { borderRadius: 20 },
  eyebrow: { color: colors.accent, fontSize: 10, letterSpacing: 1.7, fontWeight: '800', marginBottom: 10 },
  title: { color: colors.text, fontSize: 36, lineHeight: 40, letterSpacing: -1, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 8, marginBottom: 18 },
  option: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: 19, padding: 16, marginBottom: 11 },
  createOption: { backgroundColor: colors.accent, borderColor: colors.accent },
  createTitle: { color: colors.accentInk },
  createHint: { color: '#48533B' },
  createAction: { color: colors.accentInk },
  progressOption: { backgroundColor: colors.panel, borderColor: colors.line },
  traineesOption: { backgroundColor: colors.panel, borderColor: colors.line },
  progressTitle: { color: colors.text },
  progressHint: { color: colors.muted },
  progressAction: { color: colors.accent },
  progressIconText: { color: colors.accent },
  traineesIcon: { color: colors.accent },
  optionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  optionIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#ADD957', alignItems: 'center', justifyContent: 'center' },
  secondaryIcon: { backgroundColor: '#202720' },
  secondaryIconText: { color: colors.accent },
  optionIconText: { color: colors.accentInk, fontSize: 20, fontWeight: '800' },
  arrow: { color: colors.accentInk, fontSize: 20, fontWeight: '800' },
  optionTitle: { color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  optionHint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  optionAction: { color: colors.accent, fontSize: 9, letterSpacing: 1.3, fontWeight: '900', marginTop: 12 },
  footer: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingTop: 14 },
  pressed: { opacity: 0.82 },
});


