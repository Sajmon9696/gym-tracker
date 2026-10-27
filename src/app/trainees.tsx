import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';
import { getLocalProfile, getLocalTrainerResults, type LocalProfile } from '@/lib/local-accounts';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { TrainingPlan, TrainingReport, TrainingSession } from '@/lib/plans';
import { formatSetResult } from '@/lib/training-progression';
import { progresTheme } from '@/constants/progres-theme';

const c = { bg: progresTheme.background, panel: progresTheme.panel, raised: progresTheme.raised, line: progresTheme.line, text: progresTheme.text, muted: progresTheme.muted, accent: progresTheme.accent, ink: progresTheme.accentInk };
type TraineeData = { trainee: LocalProfile; plans: TrainingPlan[]; sessions: TrainingSession[]; reports: TrainingReport[] };

export default function TraineesScreen() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [trainees, setTrainees] = useState<TraineeData[]>([]);
  const [selectedTraineeId, setSelectedTraineeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        if (!session?.user.id) return;
        const current = await getLocalProfile(session.user.id);
        if (active) setProfile(current);
        if (current?.role === 'trainer') {
          const results = await getLocalTrainerResults(current.id);
          if (active) setTrainees(results);
        }
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : 'Nie udało się wczytać podopiecznych.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [session?.user.id, refresh]);

  const selectedTrainee = trainees.find((item) => item.trainee.id === selectedTraineeId) ?? null;

  return <SafeAreaView edges={['top']} style={s.safe}>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Strona główna" onPress={() => router.replace('/')} style={s.brandHome}>
          <View style={s.mark}><Text style={s.markText}>P</Text></View><Text style={s.brand}>PROGRES</Text>
        </Pressable>
        <Text style={s.pill}>PODOPIECZNI</Text>
      </View>
      <Pressable onPress={() => selectedTrainee ? setSelectedTraineeId(null) : router.replace('/')} style={s.back}><Text style={s.backText}>{selectedTrainee ? '‹  Lista podopiecznych' : '‹  Strona główna'}</Text></Pressable>
      <Text style={s.eyebrow}>{selectedTrainee ? 'KARTA PODOPIECZNEGO' : 'PRACA Z PODOPIECZNYMI'}</Text>
      <Text style={s.title}>{selectedTrainee ? selectedTrainee.trainee.full_name : 'Twoi podopieczni.'}</Text>
      <Text style={s.subtitle}>{selectedTrainee ? selectedTrainee.trainee.email : 'Wybierz osobę, aby zobaczyć jej plany i raporty z mikrocykli.'}</Text>
      <Pressable onPress={() => setRefresh((value) => value + 1)} style={s.refresh}><Text style={s.refreshText}>ODŚWIEŻ LISTĘ  ↻</Text></Pressable>

      {loading ? <View style={s.empty}><Text style={s.emptyText}>Wczytuję podopiecznych…</Text></View>
        : loadError ? <View style={s.empty}><Text style={s.emptyTitle}>Nie udało się wczytać listy.</Text><Text style={s.emptyText}>{loadError}</Text><Pressable accessibilityRole="button" onPress={() => setRefresh((value) => value + 1)} style={s.retry}><Text style={s.retryText}>SPRÓBUJ PONOWNIE</Text></Pressable></View>
        : profile?.role !== 'trainer' ? <View style={s.empty}><Text style={s.emptyTitle}>Ta sekcja jest dostępna dla trenera.</Text></View>
          : trainees.length === 0 ? <View style={s.empty}><Text style={s.emptyTitle}>Nie masz jeszcze podopiecznych.</Text><Text style={s.emptyText}>{isSupabaseConfigured ? 'Przejdź do zakładki Konto i przekaż swój kod osobie trenującej.' : 'Przejdź do zakładki Konto i przekaż swój kod osobie trenującej. Konta lokalne muszą być utworzone na tym samym urządzeniu.'}</Text></View>
            : selectedTrainee ? <TraineeDetail data={selectedTrainee} trainerId={profile?.id ?? ''}/> : trainees.map(({ trainee, plans, sessions }) => <Pressable key={trainee.id} accessibilityRole="button" onPress={() => setSelectedTraineeId(trainee.id)} style={({ pressed }) => [s.traineeCard, pressed && s.pressed]}>
              <View style={s.traineeHeader}><View style={s.traineeMark}><Text style={s.traineeMarkText}>{trainee.full_name.slice(0, 1).toLocaleUpperCase('pl-PL')}</Text></View><View style={s.traineeInfo}><Text style={s.traineeName}>{trainee.full_name}</Text><Text style={s.traineeEmail}>{trainee.email}</Text></View><Text style={s.arrow}>↗</Text></View>
              <View style={s.metrics}><Text style={s.metric}>{plans.length} {plans.length === 1 ? 'PLAN' : 'PLANÓW'}</Text><Text style={s.metric}>{sessions.length} TRENINGÓW</Text></View>
              <Text style={s.openTrainee}>ZOBACZ PLANY I RAPORTY  ↗</Text>
            </Pressable>)}
    </ScrollView>
  </SafeAreaView>;
}

function TraineeDetail({ data, trainerId }: { data: TraineeData; trainerId: string }) {
  const { trainee, plans, sessions } = data;
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  return <View style={s.detailWrap}>
    <View style={s.metrics}><Text style={s.metric}>{plans.length} {plans.length === 1 ? 'PLAN' : 'PLANÓW'}</Text><Text style={s.metric}>{sessions.length} TRENINGÓW</Text></View>
    {selectedPlan ? <PlanDetail plan={selectedPlan} traineeId={trainee.id} trainerId={trainerId} reports={data.reports} onBack={() => setSelectedPlanId(null)}/> : <>
      <Text style={s.sectionTitle}>Realizacja planów</Text>
      {plans.length === 0 ? <Text style={s.muted}>Ten podopieczny nie ma jeszcze planów.</Text> : plans.map((plan) => <PlanCard key={plan.id} plan={plan} sessions={sessions} onPress={() => setSelectedPlanId(plan.id)}/>) }
    </>}
  </View>;
}

function PlanCard({ plan, sessions, onPress }: { plan: TrainingPlan; sessions: TrainingSession[]; onPress: () => void }) {
  const trainingCount = sessions.filter((entry) => entry.planId === plan.id).length;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.planCard, pressed && s.pressed]}>
    <View style={s.planHeading}><Text style={s.planName}>{plan.name}</Text><Text style={s.arrow}>↗</Text></View>
    <Text style={s.planSummary}>{plan.days.length} dni treningowe · {trainingCount} {trainingCount === 1 ? 'zapisany trening' : 'zapisanych treningów'}</Text>
    <Text style={s.openPlan}>OTWÓRZ PLAN I RAPORTY  ↗</Text>
  </Pressable>;
}

function PlanDetail({ plan, traineeId, trainerId, reports, onBack }: { plan: TrainingPlan; traineeId: string; trainerId: string; reports: TrainingReport[]; onBack: () => void }) {
  const planReports = reports.filter((report) => report.planId === plan.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <View>
    <Pressable accessibilityRole="button" onPress={onBack} style={s.backToPlans}><Text style={s.backText}>‹  Lista planów</Text></Pressable>
    <View style={s.planDetailHead}><Text style={s.sectionTitle}>{plan.name}</Text></View>
    {plan.assignedTo === traineeId && <Text style={s.assignedLabel}>PLAN PRZYPISANY PRZEZ CIEBIE</Text>}
    {plan.days.map((day) => <View key={day.id} style={s.dayBlock}><Text style={s.dayName}>{day.name}</Text>{day.exercises.map((exercise) => {
      const metric = exercise.metric ?? 'load';
      const describeTarget = (set: { targetWeight: number; repsMin: number; repsMax: number; bandColor?: string; assistanceLevel?: string }) => metric === 'time'
        ? `${set.repsMin}–${set.repsMax} s`
        : metric === 'distance'
          ? `${set.repsMin}–${set.repsMax} m · ${set.targetWeight} kg`
          : metric === 'band'
          ? `${set.bandColor ?? exercise.bandColor ?? 'guma'} · ${set.targetWeight} kg · pomoc ${set.assistanceLevel ?? exercise.assistanceLevel ?? 'brak'} · ${set.repsMin}–${set.repsMax} powt.`
          : `${set.targetWeight} kg · ${set.repsMin}–${set.repsMax} powt.`;
      const summary = exercise.setTargets?.length
        ? exercise.setTargets.map((set, index) => `${index + 1}: ${describeTarget(set)}`).join('  ·  ')
        : `${exercise.sets} serie · ${describeTarget({ targetWeight: exercise.targetWeight, repsMin: exercise.repsMin, repsMax: exercise.repsMax })}`;
      return <Text key={exercise.id} style={s.exercise}>{exercise.name} · {summary}</Text>;
    })}</View>)}
    {!plan.completedAt && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/plans', params: { action: 'edit', traineeId, planId: plan.id } })} style={s.editButton}><Text style={s.editButtonText}>EDYTUJ PLAN  ↗</Text></Pressable>}
    {!plan.completedAt && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/plans', params: { action: 'realize', traineeId, planId: plan.id } })} style={s.realizeButton}><Text style={s.realizeButtonText}>UZUPEŁNIJ TRENING ZA PODOPIECZNEGO  ↗</Text></Pressable>}
    {!plan.completedAt && plan.ownerId === trainerId && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/plans', params: { action: 'complete', traineeId, planId: plan.id } })} style={s.editButton}><Text style={s.editButtonText}>ZAKOŃCZ PLAN</Text></Pressable>}
    <Text style={s.sectionTitle}>Raporty z mikrocykli · {planReports.length}</Text>
    {planReports.length === 0 ? <Text style={s.muted}>Raporty podopiecznego pojawią się tutaj po wysłaniu mikrocyklu.</Text> : planReports.map((report) => <ReportCard key={report.id} report={report} plan={plan}/>)}
  </View>;
}

function ReportCard({ report, plan }: { report: TrainingReport; plan: TrainingPlan }) {
  const date = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(report.createdAt));
  return <View style={s.reportCard}>
    <Text style={s.reportTitle}>Mikrocykl · {date}</Text>
    {report.sessions.map((session) => {
      const day = session.targetDay ?? session.planSnapshot?.days.find((item) => item.id === session.dayId) ?? plan.days.find((item) => item.id === session.dayId);
      return <View key={session.id} style={s.reportWorkout}>
        <Text style={s.reportDay}>{day?.name ?? 'Dzień treningowy'}</Text>
        {session.skipped
          ? <View style={s.skippedReport}><Text style={s.skippedReportTitle}>NIEWYKONANY · DZIEŃ POMINIĘTY</Text><Text style={s.muted}>Podopieczny pominął ten dzień treningowy.</Text></View>
          : session.exercises.map((exercise) => {
          const comment = report.exerciseComments[`${session.id}:${exercise.exerciseId}`]?.trim();
          return <View key={exercise.exerciseId} style={s.reportExercise}>
            <Text style={s.reportExerciseName}>{exercise.name ?? 'Ćwiczenie'}</Text>
            {exercise.skipped && <Text style={s.reportExerciseSets}>Pominięte · zapisano {exercise.sets.length} {exercise.sets.length === 1 ? 'serię' : 'serii'}</Text>}
            <Text style={s.reportExerciseSets}>{exercise.sets.map((set) => formatSetResult(set, exercise.metric ?? day?.exercises.find((item) => item.id === exercise.exerciseId)?.metric ?? 'load', day?.exercises.find((item) => item.id === exercise.exerciseId))).join('  ·  ')}</Text>
            {comment ? <Text style={s.reportCommentText}>„{comment}”</Text> : null}
          </View>;
        })}
      </View>;
    })}
  </View>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg }, content: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 36, maxWidth: 720, width: '100%', alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 }, brandHome: { flex: 1, flexDirection: 'row', alignItems: 'center' }, mark: { width: 30, height: 30, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', marginRight: 10 }, markText: { color: c.ink, fontSize: 19, fontWeight: '900' }, brand: { color: c.text, letterSpacing: 2.4, fontSize: 13, fontWeight: '800' }, pill: { color: c.muted, borderColor: c.line, borderWidth: 1, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7, fontSize: 9, letterSpacing: 1.2, fontWeight: '700' },
  back: { marginBottom: 22 }, backText: { color: c.accent, fontWeight: '700', fontSize: 14 }, eyebrow: { color: c.accent, fontSize: 10, letterSpacing: 1.7, fontWeight: '800', marginBottom: 10 }, title: { color: c.text, fontSize: 34, lineHeight: 39, letterSpacing: -1, fontWeight: '800' }, subtitle: { color: c.muted, fontSize: 13, lineHeight: 20, marginTop: 10, marginBottom: 15 }, refresh: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 8 }, refreshText: { color: c.accent, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  empty: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderStyle: 'dashed', borderRadius: 17, padding: 20, alignItems: 'center', marginVertical: 12 }, emptyTitle: { color: c.text, fontSize: 14, fontWeight: '700', textAlign: 'center' }, emptyText: { color: c.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 }, retry: { paddingHorizontal: 14, paddingVertical: 11, backgroundColor: c.raised, borderRadius: 9, marginTop: 12 }, retryText: { color: c.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  traineeCard: { backgroundColor: c.panel, borderWidth: 1, borderColor: c.line, borderRadius: 17, padding: 15, marginTop: 12 }, traineeHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 }, traineeMark: { width: 40, height: 40, borderRadius: 13, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }, traineeMarkText: { color: c.accent, fontSize: 16, fontWeight: '900' }, traineeInfo: { flex: 1 }, traineeName: { color: c.text, fontSize: 16, fontWeight: '800' }, traineeEmail: { color: c.muted, fontSize: 11, marginTop: 3 }, metrics: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 8 }, metric: { backgroundColor: c.raised, color: c.accent, overflow: 'hidden', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }, openTrainee: { color: c.accent, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginTop: 9 }, detailWrap: { marginBottom: 14 },
  sectionTitle: { color: c.text, fontSize: 14, fontWeight: '800', marginTop: 16, marginBottom: 6 }, muted: { color: c.muted, fontSize: 11, lineHeight: 17, marginTop: 4 }, planCard: { backgroundColor: c.raised, borderRadius: 12, padding: 14, marginTop: 8 }, planHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, planName: { color: c.text, fontSize: 14, fontWeight: '800', flex: 1 }, planSummary: { color: c.muted, fontSize: 10, marginTop: 6 }, openPlan: { color: c.accent, fontSize: 9, fontWeight: '900', letterSpacing: 0.7, marginTop: 12 }, planDetailHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }, backToPlans: { alignSelf: 'flex-start', marginTop: 14 }, assignedLabel: { color: c.accent, fontSize: 8, letterSpacing: 0.8, fontWeight: '900', marginTop: 5 }, dayBlock: { borderTopWidth: 1, borderTopColor: c.line, marginTop: 9, paddingTop: 8 }, dayName: { color: c.accent, fontSize: 11, fontWeight: '800' }, exercise: { color: c.muted, fontSize: 10, lineHeight: 16, marginTop: 5 }, reportCard: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 8 }, reportTitle: { color: c.accent, fontSize: 11, fontWeight: '800' }, reportWorkout: { borderTopWidth: 1, borderTopColor: c.line, marginTop: 10, paddingTop: 9 }, reportDay: { color: c.text, fontSize: 11, fontWeight: '800' }, reportExercise: { marginTop: 7 }, reportExerciseName: { color: c.text, fontSize: 10, fontWeight: '700' }, reportExerciseSets: { color: c.muted, fontSize: 9, marginTop: 3 }, reportCommentText: { color: c.accent, fontSize: 10, lineHeight: 15, marginTop: 4 }, skippedReport: { borderRadius: 9, backgroundColor: '#30231F', padding: 10, marginTop: 8 }, skippedReportTitle: { color: '#FFB2A1', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  editButton: { minHeight: 42, borderWidth: 1, borderColor: c.accent, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingHorizontal: 10 }, editButtonText: { color: c.accent, fontSize: 9, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' }, realizeButton: { minHeight: 42, backgroundColor: c.accent, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingHorizontal: 10 }, realizeButtonText: { color: c.ink, fontSize: 9, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  pressed: { opacity: 0.82 }, arrow: { color: c.accent, fontSize: 20, fontWeight: '800' },
});
