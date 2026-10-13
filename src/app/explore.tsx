import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { TrainingPlan, TrainingSession } from '@/lib/plans';
import { WORKOUTS_KEY, type WorkoutEntry } from '@/lib/workouts';
import { useAuth } from '@/lib/auth-context';
import { loadUserTrainingData } from '@/lib/local-accounts';
import { progresTheme } from '@/constants/progres-theme';

const colors = {
  background: progresTheme.background, panel: progresTheme.panel, panelRaised: progresTheme.raised, line: progresTheme.line,
  text: progresTheme.text, muted: progresTheme.muted, accent: progresTheme.accent, ink: progresTheme.accentInk,
};

type ExerciseProgress = {
  name: string;
  records: { reps: number; weight: number; date: string }[];
  totalSets: number;
};

function readDate(value: string) {
  return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(new Date(value));
}

function buildProgress(entries: WorkoutEntry[], sessions: TrainingSession[], plans: TrainingPlan[]) {
  // Łączymy ręczne wpisy i sesje planów w rekordy pogrupowane według ćwiczenia i powtórzeń.
  const exercises = new Map<string, ExerciseProgress>();
  const addSet = (name: string, reps: number, weight: number, date: string) => {
    const key = name.trim().toLocaleLowerCase('pl-PL');
    if (!key || reps < 1 || weight < 0) return;
    const item = exercises.get(key) ?? { name: name.trim(), records: [], totalSets: 0 };
    item.totalSets += 1;
    const record = item.records.find((candidate) => candidate.reps === reps);
    if (record) {
      if (weight > record.weight) { record.weight = weight; record.date = date; }
    } else {
      item.records.push({ reps, weight, date });
    }
    exercises.set(key, item);
  };

  for (const entry of entries) {
    for (let index = 0; index < entry.sets; index += 1) addSet(entry.exercise, entry.reps, entry.weight, entry.createdAt);
  }
  for (const session of sessions) {
    const plan = plans.find((candidate) => candidate.id === session.planId);
    const day = plan?.days.find((candidate) => candidate.id === session.dayId);
    for (const completed of session.exercises) {
      const exercise = day?.exercises.find((candidate) => candidate.id === completed.exerciseId);
      for (const set of completed.sets) addSet(completed.name ?? exercise?.name ?? 'Ćwiczenie', set.reps, set.weight, session.completedAt);
    }
  }

  return [...exercises.values()]
    .map((item) => ({ ...item, records: item.records.sort((a, b) => a.reps - b.reps) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl-PL'));
}

export default function ProgressScreen() {
  const { session } = useAuth();
  const [exercises, setExercises] = useState<ExerciseProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      setIsLoading(true);
      Promise.all([
        session?.user.id ? AsyncStorage.getItem(`${WORKOUTS_KEY}.user.${session.user.id}`) : AsyncStorage.getItem(WORKOUTS_KEY),
        session?.user.id ? loadUserTrainingData(session.user.id) : Promise.resolve(null),
      ])
        .then(([rawEntries, trainingData]) => {
          const entries = rawEntries ? JSON.parse(rawEntries) as WorkoutEntry[] : [];
          const sessions: TrainingSession[] = trainingData?.sessions ?? [];
          const plans: TrainingPlan[] = trainingData?.plans ?? [];
          if (isActive) setExercises(buildProgress(entries, sessions, plans));
        })
        .catch(() => Alert.alert('Nie udało się wczytać postępów', 'Spróbuj ponownie otworzyć ten ekran.'))
        .finally(() => { if (isActive) setIsLoading(false); });
      return () => { isActive = false; };
    }, [session]),
  );

  const totalRecords = exercises.reduce((sum, exercise) => sum + exercise.records.length, 0);
  const totalSets = exercises.reduce((sum, exercise) => sum + exercise.totalSets, 0);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topLine}>
          <Pressable accessibilityRole="button" accessibilityLabel="Strona główna" onPress={() => router.replace('/')} style={styles.brandHome}>
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>P</Text></View>
            <Text style={styles.brand}>PROGRES</Text>
          </Pressable>
          <Text style={styles.pagePill}>POSTĘPY</Text>
        </View>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Strona główna</Text></Pressable>
        <Text style={styles.eyebrow}>TWOJE WYNIKI</Text>
        <Text style={styles.title}>Ćwiczenia.{ '\n' }Rekordy. Progres.</Text>
        <Text style={styles.subtitle}>Najlepszy zapisany ciężar przy każdej liczbie powtórzeń.</Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryBlock}><Text style={styles.summaryNumber}>{exercises.length}</Text><Text style={styles.summaryLabel}>ĆWICZEŃ</Text></View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryBlock}><Text style={styles.summaryNumber}>{totalRecords}</Text><Text style={styles.summaryLabel}>REKORDÓW</Text></View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryBlock}><Text style={styles.summaryNumber}>{totalSets}</Text><Text style={styles.summaryLabel}>SERII</Text></View>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Wykonywane ćwiczenia</Text>
          <Text style={styles.sectionMeta}>{exercises.length.toString().padStart(2, '0')}</Text>
        </View>
        {isLoading ? (
          <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Wczytuję Twoje wyniki…</Text></View>
        ) : exercises.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyOrb}><Text style={styles.emptyIcon}>↗</Text></View>
            <Text style={styles.emptyTitle}>Nie ma jeszcze zapisanych ćwiczeń</Text>
            <Text style={styles.emptyText}>Realizuj plan i zapisuj wykonane serie. Ćwiczenia oraz rekordy pojawią się tutaj.</Text>
          </View>
        ) : (
          <View style={styles.exerciseList}>
            {exercises.map((exercise) => (
              <View key={exercise.name.toLocaleLowerCase('pl-PL')} style={styles.exerciseCard}>
                <View style={styles.exerciseHeading}>
                  <View style={styles.exerciseIcon}><Text style={styles.exerciseIconText}>↗</Text></View>
                  <View style={styles.exerciseHeadingText}>
                    <Text style={styles.exerciseName}>{exercise.name}</Text>
                    <Text style={styles.exerciseMeta}>{exercise.totalSets} zapisanych serii</Text>
                  </View>
                  <Text style={styles.recordCount}>{exercise.records.length} PR</Text>
                </View>
                <View style={styles.records}>
                  {exercise.records.map((record) => (
                    <View key={`${exercise.name}-${record.reps}`} style={styles.recordRow}>
                      <View style={styles.repsBadge}><Text style={styles.repsNumber}>{record.reps}</Text><Text style={styles.repsLabel}>POWT.</Text></View>
                      <Text style={styles.recordDate}>{readDate(record.date)}</Text>
                      <Text style={styles.recordWeight}>{record.weight}<Text style={styles.weightUnit}> kg</Text></Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.footer}>REKORDY AKTUALIZUJĄ SIĘ PO ZAPISANIU TRENINGU.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 30, maxWidth: 720, width: '100%', alignSelf: 'center' },
  topLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  brandHome: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  brandMark: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  brandMarkText: { color: colors.ink, fontSize: 19, fontWeight: '900' },
  brand: { color: colors.text, letterSpacing: 2.4, fontSize: 13, fontWeight: '800', flex: 1 },
  pagePill: { color: colors.muted, fontSize: 9, letterSpacing: 1.2, fontWeight: '700', borderWidth: 1, borderColor: colors.line, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7 },
  back: { marginBottom: 19 }, backText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  eyebrow: { color: colors.accent, fontSize: 10, letterSpacing: 1.6, fontWeight: '800', marginBottom: 10 },
  title: { color: colors.text, fontSize: 36, lineHeight: 40, letterSpacing: -1, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 10, marginBottom: 22 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, borderRadius: 17, padding: 16, marginBottom: 27 },
  summaryBlock: { flex: 1 }, summaryNumber: { color: colors.ink, fontSize: 23, fontWeight: '900' }, summaryLabel: { color: '#48533B', fontSize: 8, letterSpacing: 1, fontWeight: '800', marginTop: 3 },
  summaryDivider: { width: 1, height: 32, backgroundColor: '#ADC86F', marginHorizontal: 8 },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700' }, sectionMeta: { color: colors.muted, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  emptyCard: { alignItems: 'center', backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: 17, padding: 22 },
  emptyOrb: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }, emptyIcon: { color: colors.accent, fontSize: 22 },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: '700', textAlign: 'center' }, emptyText: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 6, maxWidth: 280 },
  exerciseList: { gap: 11 }, exerciseCard: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: 17, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 7 },
  exerciseHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12 }, exerciseIcon: { width: 35, height: 35, borderRadius: 11, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' }, exerciseIconText: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  exerciseHeadingText: { flex: 1 }, exerciseName: { color: colors.text, fontSize: 14, fontWeight: '800' }, exerciseMeta: { color: colors.muted, fontSize: 10, marginTop: 3 }, recordCount: { color: colors.accent, fontSize: 9, letterSpacing: 0.7, fontWeight: '800' },
  records: { borderTopWidth: 1, borderTopColor: colors.line }, recordRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.line, gap: 10 },
  repsBadge: { flexDirection: 'row', alignItems: 'baseline', gap: 4, minWidth: 76 }, repsNumber: { color: colors.text, fontSize: 14, fontWeight: '800' }, repsLabel: { color: colors.muted, fontSize: 8, letterSpacing: 0.4, fontWeight: '700' },
  recordDate: { color: colors.muted, fontSize: 10, flex: 1 }, recordWeight: { color: colors.accent, fontSize: 16, fontWeight: '900' }, weightUnit: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  footer: { color: colors.muted, fontSize: 9, letterSpacing: 1, textAlign: 'center', fontWeight: '700', marginTop: 26, marginBottom: 10 },
});

