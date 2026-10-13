import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  Share,
  ScrollView,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  PLANS_KEY,
  SESSIONS_KEY,
  type CompletedExercise,
  type CompletedSet,
  type PlannedExercise,
  type TrainingDay,
  type TrainingPlan,
  type TrainingReport,
  type TrainingSession,
} from '@/lib/plans';
import { useAuth } from '@/lib/auth-context';
import { getExerciseGuide } from '@/lib/exercise-guides';
import { deleteLocalAssignedPlan, deleteUserPlan, getConnectedProfiles, getLocalProfile, getLocalTraineeTrainingDataForTrainer, loadUserTrainingData, saveLocalAssignedPlan, saveTrainerEditedTraineePlan, saveTrainingReport, saveUserPlans, saveUserSessions, type LocalProfile } from '@/lib/local-accounts';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getExerciseTargets, getNextUnreportedMicrocycle } from '@/lib/training-progression';
import { parsePlanSpreadsheet, TRAINER_PLAN_TEMPLATE } from '@/lib/plan-spreadsheet';
import PlanBuilder, { createEmptyExerciseDraft, type ExerciseDraft } from '@/components/plans/plan-builder';
import TrainingReportForm from '@/components/plans/training-report-form';
import TrainingSessionView from '@/components/plans/training-session-view';
import { planStyles as s } from '@/components/plans/plan-styles';

type Mode = 'list' | 'create' | 'session' | 'summary' | 'review' | 'report';
type SetEditContext = { resumeIndex: number; wasExerciseComplete: boolean };
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export default function PlansScreen() {
  const { action, traineeId, planId } = useLocalSearchParams<{ action?: string; traineeId?: string; planId?: string }>();
  const actingForTraineeId = typeof traineeId === 'string' ? traineeId : null;
  const { session } = useAuth();
  const dataOwnerId = actingForTraineeId ?? session?.user.id;
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [reports, setReports] = useState<TrainingReport[]>([]);
  const [currentProfile, setCurrentProfile] = useState<LocalProfile | null>(null);
  const [linkedTrainees, setLinkedTrainees] = useState<{ id: string; full_name: string; email: string; role: 'trainer' | 'trainee' }[]>([]);
  const [draftAssignedTo, setDraftAssignedTo] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>(() => action === 'create' ? 'create' : 'list');
  const [selectedPlan, setSelectedPlan] = useState<TrainingPlan | null>(null);
  const [selectedDay, setSelectedDay] = useState<TrainingDay | null>(null);
  const [completedSession, setCompletedSession] = useState<TrainingSession | null>(null);
  const [reportSessions, setReportSessions] = useState<TrainingSession[]>([]);
  const [reportComments, setReportComments] = useState<Record<string, string>>({});
  const [reportReturnMode, setReportReturnMode] = useState<'list' | 'session' | 'summary'>('summary');
  const [confirmSkipDay, setConfirmSkipDay] = useState(false);
  const [skippedDayNotice, setSkippedDayNotice] = useState<string | null>(null);
  const [completedExerciseIds, setCompletedExerciseIds] = useState<string[]>([]);
  const [completedSetCounts, setCompletedSetCounts] = useState<Record<string, number>>({});
  const [setEditContexts, setSetEditContexts] = useState<Record<string, SetEditContext>>({});
  const [expandedGuideIds, setExpandedGuideIds] = useState<string[]>([]);
  const [playingVideoExerciseId, setPlayingVideoExerciseId] = useState<string | null>(null);
  const [planListTab, setPlanListTab] = useState<'active' | 'completed'>('active');
  const [pendingDeletePlanId, setPendingDeletePlanId] = useState<string | null>(null);
  const [pendingCompletePlanId, setPendingCompletePlanId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  const [planName, setPlanName] = useState('');
  const [dayCount, setDayCount] = useState('3');
  const [draftDays, setDraftDays] = useState<TrainingDay[]>([]);
  const [exerciseDrafts, setExerciseDrafts] = useState<Record<string, ExerciseDraft>>({});
  const [exerciseFormOpenDays, setExerciseFormOpenDays] = useState<Record<string, boolean>>({});
  const [editingExerciseIds, setEditingExerciseIds] = useState<Record<string, string | null>>({});
  const [sessionDraft, setSessionDraft] = useState<Record<string, CompletedSet[]>>({});

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        const userId = session?.user.id;
        if (userId) {
          if (actingForTraineeId) {
            const traineeData = await getLocalTraineeTrainingDataForTrainer(userId, actingForTraineeId);
            const profile = await getLocalProfile(userId);
            const connections = profile ? await getConnectedProfiles(profile) : [];
            const plansWithGuides = traineeData.plans.map((plan) => ({ ...plan, days: plan.days.map((day) => ({ ...day, exercises: day.exercises.map((exercise) => exercise.description?.trim() ? exercise : { ...exercise, description: getExerciseGuide(exercise.name) }) })) }));
            if (active) {
              setCurrentProfile(profile); setLinkedTrainees(connections); setPlans(plansWithGuides); setSessions(traineeData.sessions);
              if (action === 'edit' && planId) {
                const selected = plansWithGuides.find((plan) => plan.id === planId);
                if (selected && !selected.completedAt) {
                  setEditingPlanId(selected.id); setDraftAssignedTo(selected.assignedTo ?? null);
                  setPlanName(selected.name); setDayCount(String(selected.days.length));
                  setDraftDays(selected.days.map((day) => ({ ...day, exercises: day.exercises.map((exercise) => ({ ...exercise })) })));
                  setExerciseDrafts({}); setEditingExerciseIds({}); setExerciseFormOpenDays({});
                  setSelectedPlan(selected); setMode('create');
                }
              }
              if (action === 'realize' && planId) {
                const selected = plansWithGuides.find((plan) => plan.id === planId);
                if (selected) {
                  const latest = traineeData.sessions.find((entry) => entry.planId === selected.id);
                  const previousIndex = latest ? selected.days.findIndex((day) => day.id === latest.dayId) : -1;
                  const nextDay = selected.days[(previousIndex + 1 + selected.days.length) % selected.days.length];
                  if (nextDay) {
                    const draft: Record<string, CompletedSet[]> = {};
                    nextDay.exercises.forEach((exercise) => {
                      const target = getExerciseTargets(selected, exercise, traineeData.sessions);
                      draft[exercise.id] = target.setTargets.map((set) => ({ reps: set.repsMin, weight: set.targetWeight }));
                    });
                    setSelectedPlan(selected); setSelectedDay(nextDay); setSessionDraft(draft); setCompletedExerciseIds([]); setCompletedSetCounts({}); setSetEditContexts({}); setMode('session');
                  }
                }
              }
            }
            return;
          }
          const [trainingData, profile] = await Promise.all([loadUserTrainingData(userId), getLocalProfile(userId)]);
          const storedPlans = trainingData.plans;
          const connections = profile ? await getConnectedProfiles(profile) : [];
          const plansWithGuides = storedPlans.map((plan) => ({ ...plan, days: plan.days.map((day) => ({ ...day, exercises: day.exercises.map((exercise) => exercise.description?.trim() ? exercise : { ...exercise, description: getExerciseGuide(exercise.name) }) })) }));
          if (active) {
            setCurrentProfile(profile);
            setLinkedTrainees(connections);
            setPlans(plansWithGuides);
            setSessions(trainingData.sessions);
            setReports(trainingData.reports);
          }
          const guidedPlans = plansWithGuides.filter((plan) => !plan.ownerId || plan.ownerId === userId);
          if (JSON.stringify(storedPlans.filter((plan) => !plan.ownerId || plan.ownerId === userId)) !== JSON.stringify(guidedPlans)) await saveUserPlans(userId, guidedPlans);
        } else {
          const [rawPlans, rawSessions] = await Promise.all([AsyncStorage.getItem(PLANS_KEY), AsyncStorage.getItem(SESSIONS_KEY)]);
          const storedPlans = rawPlans ? JSON.parse(rawPlans) as TrainingPlan[] : [];
          const plansWithGuides = storedPlans.map((plan) => ({ ...plan, days: plan.days.map((day) => ({ ...day, exercises: day.exercises.map((exercise) => exercise.description?.trim() ? exercise : { ...exercise, description: getExerciseGuide(exercise.name) }) })) }));
          if (active) { setCurrentProfile(null); setLinkedTrainees([]); setPlans(plansWithGuides); setSessions(rawSessions ? JSON.parse(rawSessions) as TrainingSession[] : []); setReports([]); }
          if (JSON.stringify(storedPlans) !== JSON.stringify(plansWithGuides)) await AsyncStorage.setItem(PLANS_KEY, JSON.stringify(plansWithGuides));
        }
      } catch (error) {
        if (active) Alert.alert('Nie udało się wczytać planów', error instanceof Error ? error.message : 'Sprawdź połączenie z bazą.');
      } finally { if (active) setReady(true); }
    }
    void loadData();
    return () => { active = false; };
  }, [session?.user.id, actingForTraineeId, action, planId]);

  const sessionCount = useMemo(() => sessions.length, [sessions]);
  const roleVisiblePlans = currentProfile?.role === 'trainer' && !actingForTraineeId
    ? plans.filter((plan) => (!plan.ownerId || plan.ownerId === session?.user.id) && !plan.assignedTo)
    : plans;
  const activePlans = roleVisiblePlans.filter((plan) => !plan.completedAt);
  const completedPlans = roleVisiblePlans.filter((plan) => Boolean(plan.completedAt));
  const visiblePlans = planListTab === 'active' ? activePlans : completedPlans;

  function startCreate() {
    setEditingPlanId(null); setDraftAssignedTo(null); setPlanName(''); setDayCount('3'); setDraftDays([]); setExerciseDrafts({}); setEditingExerciseIds({}); setExerciseFormOpenDays({}); setMode('create');
  }

  function startEditPlan(plan: TrainingPlan) {
    if (plan.ownerId && plan.ownerId !== session?.user.id) return;
    setEditingPlanId(plan.id);
    setDraftAssignedTo(plan.assignedTo ?? null);
    setPlanName(plan.name);
    setDayCount(String(plan.days.length));
    setDraftDays(plan.days.map((day) => ({ ...day, exercises: day.exercises.map((exercise) => ({ ...exercise })) })));
    setExerciseDrafts({});
    setEditingExerciseIds({});
    setExerciseFormOpenDays({});
    setSelectedPlan(plan);
    setMode('create');
  }

  function importSpreadsheet(value: string) {
    try {
      const importedDays = parsePlanSpreadsheet(value);
      if (importedDays.some((day) => day.exercises.length === 0)) throw new Error('Każdy dzień arkusza musi zawierać przynajmniej jedno ćwiczenie.');
      setDraftDays(importedDays);
      setDayCount(String(importedDays.length));
      setExerciseDrafts({});
      setEditingExerciseIds({});
      setExerciseFormOpenDays({});
      Alert.alert('Arkusz wczytany', `Dodano ${importedDays.length} ${importedDays.length === 1 ? 'dzień' : 'dni'} i ${importedDays.reduce((count, day) => count + day.exercises.length, 0)} ćwiczeń. Sprawdź plan i nadaj mu nazwę przed zapisem.`);
      return true;
    } catch (error) {
      Alert.alert('Nie udało się wczytać arkusza', error instanceof Error ? error.message : 'Sprawdź dane i spróbuj ponownie.');
      return false;
    }
  }

  async function downloadPlanTemplate() {
    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([`\uFEFF${TRAINER_PLAN_TEMPLATE}`], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'szablon-planu-treningowego.csv';
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      await Share.share({ title: 'Szablon planu treningowego CSV', message: TRAINER_PLAN_TEMPLATE });
    } catch {
      Alert.alert('Nie udało się udostępnić szablonu', 'Spróbuj ponownie albo użyj pliku szablonu z folderu assets/templates.');
    }
  }

  function removeDraftExercise(dayId: string, exerciseId: string) {
    setDraftDays((current) => current.map((day) => day.id === dayId
      ? { ...day, exercises: day.exercises.filter((exercise) => exercise.id !== exerciseId) }
      : day));
    if (editingExerciseIds[dayId] === exerciseId) {
      setEditingExerciseIds((current) => ({ ...current, [dayId]: null }));
      setExerciseDrafts((current) => ({ ...current, [dayId]: createEmptyExerciseDraft() }));
    }
  }

  function editDraftExercise(day: TrainingDay, exercise: PlannedExercise) {
    setEditingExerciseIds((current) => ({ ...current, [day.id]: exercise.id }));
    setExerciseFormOpenDays((current) => ({ ...current, [day.id]: true }));
    setExerciseDrafts((current) => ({
      ...current,
      [day.id]: {
        name: exercise.name,
        description: exercise.description ?? '',
        youtubeUrl: exercise.youtubeUrl ?? '',
        sets: String(exercise.sets),
        repsMin: String(exercise.repsMin),
        repsMax: String(exercise.repsMax),
        weight: String(exercise.targetWeight),
        progressionType: exercise.progression?.type ?? 'kilograms',
        progressionAmount: String(exercise.progression?.amount ?? 0),
        customSets: Boolean(exercise.setTargets?.length),
        setTargets: exercise.setTargets?.map((set) => ({ repsMin: String(set.repsMin), repsMax: String(set.repsMax), weight: String(set.targetWeight) })) ?? [],
      },
    }));
  }


  function makeDays() {
    const count = Number(dayCount);
    if (!Number.isInteger(count) || count < 1 || count > 7) {
      Alert.alert('Wybierz liczbę dni', 'Plan może zawierać od 1 do 7 dni treningowych.'); return;
    }
    setDraftDays(Array.from({ length: count }, (_, i) => ({ id: makeId(), name: `Dzień ${i + 1}`, exercises: [] })));
  }

  function addExercise(day: TrainingDay) {
    const draft = exerciseDrafts[day.id] ?? createEmptyExerciseDraft();
    const sets = Number(draft.sets), repsMin = Number(draft.repsMin), repsMax = Number(draft.repsMax);
    const weight = Number(draft.weight.replace(',', '.'));
    const progressionAmount = Number(draft.progressionAmount.replace(',', '.'));
    const youtubeUrl = draft.youtubeUrl.trim();
    if (youtubeUrl && !/^https:\/\/(www\.)?(youtube\.com|m\.youtube\.com|youtu\.be)\/\S+$/i.test(youtubeUrl)) {
      Alert.alert('Nieprawidłowy link', 'Wklej pełny link HTTPS do filmu z YouTube (youtube.com lub youtu.be).'); return;
    }
    if (!draft.name.trim()) { Alert.alert('Podaj nazwę ćwiczenia', 'Wpisz nazwę, aby dodać ćwiczenie do dnia.'); return; }
    const customSetTargets = draft.customSets ? draft.setTargets.map((set) => ({ repsMin: Number(set.repsMin), repsMax: Number(set.repsMax), targetWeight: Number(set.weight.replace(',', '.')) })) : undefined;
    const invalidCustomSet = customSetTargets?.some((set) => ![set.repsMin, set.repsMax, set.targetWeight].every(Number.isFinite) || !Number.isInteger(set.repsMin) || !Number.isInteger(set.repsMax) || set.repsMin < 1 || set.repsMax < set.repsMin || set.targetWeight < 0);
    if (![sets, repsMin, repsMax, weight, progressionAmount].every(Number.isFinite) || !Number.isInteger(sets) || !Number.isInteger(repsMin) || !Number.isInteger(repsMax) || sets < 1 || repsMin < 1 || repsMax < repsMin || weight < 0 || progressionAmount < 0 || (draft.progressionType === 'repetitions' && !Number.isInteger(progressionAmount)) || (draft.customSets && (customSetTargets?.length !== sets || invalidCustomSet))) {
      Alert.alert('Sprawdź wartości', 'Serie, powtórzenia i progresja muszą mieć prawidłowe wartości, a ciężar nie może być ujemny.'); return;
    }
    const editingId = editingExerciseIds[day.id];
    const existing = day.exercises.find((item) => item.id === editingId);
    const firstCustomSet = customSetTargets?.[0];
    const exercise: PlannedExercise = { id: existing?.id ?? makeId(), name: draft.name.trim(), description: draft.description.trim() || getExerciseGuide(draft.name), ...(youtubeUrl ? { youtubeUrl } : {}), sets, repsMin: firstCustomSet?.repsMin ?? repsMin, repsMax: firstCustomSet?.repsMax ?? repsMax, targetWeight: firstCustomSet?.targetWeight ?? weight, ...(customSetTargets ? { setTargets: customSetTargets } : {}), ...(progressionAmount > 0 ? { progression: { type: draft.progressionType, amount: progressionAmount } } : {}) };
    setDraftDays((current) => current.map((item) => item.id === day.id
      ? { ...item, exercises: editingId ? item.exercises.map((entry) => entry.id === editingId ? exercise : entry) : [...item.exercises, exercise] }
      : item));
    setEditingExerciseIds((current) => ({ ...current, [day.id]: null }));
    setExerciseFormOpenDays((current) => ({ ...current, [day.id]: false }));
    setExerciseDrafts((current) => ({ ...current, [day.id]: { ...draft, name: '', description: '', youtubeUrl: '' } }));
  }

  async function savePlan() {
    if (!planName.trim()) { Alert.alert('Nazwij plan', 'Dodaj nazwę, np. Plan siłowy A/B.'); return; }
    if (draftDays.length === 0) { Alert.alert('Dodaj dni treningowe', 'Wybierz liczbę dni i dodaj ćwiczenia.'); return; }
    if (draftDays.some((day) => day.exercises.length === 0)) { Alert.alert('Uzupełnij plan', 'Każdy dzień powinien mieć przynajmniej jedno ćwiczenie.'); return; }
    const originalPlan = editingPlanId ? plans.find((item) => item.id === editingPlanId) : undefined;
    if (actingForTraineeId && (!originalPlan || (originalPlan.ownerId !== session?.user.id && originalPlan.ownerId !== actingForTraineeId))) {
      Alert.alert('Nie można edytować planu', 'Możesz edytować tylko plany należące do Ciebie lub wybranego podopiecznego.'); return;
    }
    const plan: TrainingPlan = originalPlan
      ? { ...originalPlan, name: planName.trim(), days: draftDays }
      : { id: makeId(), name: planName.trim(), days: draftDays, createdAt: new Date().toISOString(), ...(session?.user.id ? { ownerId: session.user.id } : {}) };
    const planOwnerId = originalPlan?.ownerId ?? session?.user.id;
    const ownedPlan = { ...plan, ownerId: planOwnerId, assignedTo: actingForTraineeId ? (planOwnerId === session?.user.id ? actingForTraineeId : originalPlan?.assignedTo) : (currentProfile?.role === 'trainer' ? draftAssignedTo ?? undefined : originalPlan?.assignedTo) };
    const next = originalPlan ? plans.map((item) => item.id === plan.id ? ownedPlan : item) : [ownedPlan, ...plans];
    const nextSessions = originalPlan ? sessions.map((session) => {
      if (session.planId !== originalPlan.id) return session;
      const previousDay = originalPlan.days.find((day) => day.id === session.dayId);
      return {
        ...session,
        exercises: session.exercises.map((completed) => {
          if (completed.name) return completed;
          const previousExercise = previousDay?.exercises.find((exercise) => exercise.id === completed.exerciseId);
          return previousExercise ? { ...completed, name: previousExercise.name } : completed;
        }),
      };
    }) : sessions;
    setSaving(true);
    try {
      if (!session?.user.id) throw new Error('Brak aktywnego użytkownika.');
      if (actingForTraineeId) {
        await Promise.all([
          saveTrainerEditedTraineePlan(session.user.id, actingForTraineeId, ownedPlan),
          ...(originalPlan ? [saveUserSessions(actingForTraineeId, nextSessions)] : []),
        ]);
      } else {
        await Promise.all([
          saveUserPlans(session.user.id, next),
          ...(originalPlan ? [saveUserSessions(session.user.id, nextSessions)] : []),
          ...(!isSupabaseConfigured && ownedPlan.assignedTo ? [saveLocalAssignedPlan(ownedPlan)] : []),
          ...(!isSupabaseConfigured && originalPlan?.assignedTo && !ownedPlan.assignedTo ? [deleteLocalAssignedPlan(originalPlan.id)] : []),
        ]);
      }
      setPlans(next);
      if (originalPlan) {
        setSessions(nextSessions);
        setSelectedPlan(ownedPlan);
        setMode('list');
      } else setMode('list');
      setEditingPlanId(null);
    }
    catch { Alert.alert('Nie zapisano planu', 'Spróbuj ponownie za chwilę.'); }
    finally { setSaving(false); }
  }

  async function finishPlan(plan: TrainingPlan) {
    if (actingForTraineeId) return;
    const finishedPlan = { ...plan, completedAt: new Date().toISOString() };
    const next = plans.map((item) => item.id === plan.id ? finishedPlan : item);
    setSaving(true);
    try {
      if (!session?.user.id) throw new Error('Brak aktywnego użytkownika.');
      await Promise.all([saveUserPlans(session.user.id, next), ...(!isSupabaseConfigured && plan.assignedTo && plan.ownerId === session.user.id ? [saveLocalAssignedPlan(finishedPlan)] : [])]);
      setPlans(next);
      setPendingCompletePlanId(null);
      setPlanListTab('completed');
      setMode('list');
    } catch { Alert.alert('Nie udało się zakończyć planu', 'Spróbuj ponownie za chwilę.'); }
    finally { setSaving(false); }
  }

  async function deletePlan(plan: TrainingPlan) {
    if (actingForTraineeId) return;
    const nextPlans = plans.filter((item) => item.id !== plan.id);
    const nextSessions = sessions.filter((session) => session.planId !== plan.id);
    setSaving(true);
    try {
      if (!session?.user.id) throw new Error('Brak aktywnego użytkownika.');
      await Promise.all([deleteUserPlan(session.user.id, plan.id), ...(isSupabaseConfigured ? [] : [saveUserSessions(session.user.id, nextSessions)]), ...(!isSupabaseConfigured && plan.assignedTo && plan.ownerId === session.user.id ? [deleteLocalAssignedPlan(plan.id)] : [])]);
      setPlans(nextPlans);
      setSessions(nextSessions);
      setPendingDeletePlanId(null);
    } catch { Alert.alert('Nie udało się usunąć planu', 'Spróbuj ponownie za chwilę.'); }
    finally { setSaving(false); }
  }

  function openCompletedPlan(plan: TrainingPlan) {
    setSelectedPlan(plan);
    setMode('review');
  }
  function openPlan(plan: TrainingPlan, sessionHistory: TrainingSession[] = sessions) {
    setSkippedDayNotice(null);
    setSelectedPlan(plan);
    const mostRecentSession = sessionHistory.find((session) => session.planId === plan.id);
    if (!mostRecentSession) {
      const firstDay = plan.days[0];
      if (firstDay) startSession(firstDay, plan, sessionHistory);
      else setMode('list');
      return;
    }

    const previousDayIndex = plan.days.findIndex((day) => day.id === mostRecentSession.dayId);
    const nextDayIndex = previousDayIndex >= 0 ? (previousDayIndex + 1) % plan.days.length : 0;
    const nextDay = plan.days[nextDayIndex];
    if (nextDay) startSession(nextDay, plan, sessionHistory);
    else setMode('list');
  }

  function startSession(day: TrainingDay, plan: TrainingPlan | null = selectedPlan, sessionHistory: TrainingSession[] = sessions) {
    setSelectedDay(day);
    setConfirmSkipDay(false);
    const draft: Record<string, CompletedSet[]> = {};
    day.exercises.forEach((exercise) => {
      const targets = plan ? getExerciseTargets(plan, exercise, sessionHistory).setTargets : Array.from({ length: exercise.sets }, () => ({ repsMin: exercise.repsMin, repsMax: exercise.repsMax, targetWeight: exercise.targetWeight }));
      draft[exercise.id] = targets.map((target) => ({ reps: target.repsMin, weight: target.targetWeight }));
    });
    setSessionDraft(draft); setCompletedExerciseIds([]); setCompletedSetCounts({}); setSetEditContexts({}); setMode('session');
  }

  function updateSet(exerciseId: string, index: number, key: keyof CompletedSet, value: string) {
    const parsed = Number(value.replace(',', '.'));
    if (value.trim() !== '' && !Number.isFinite(parsed)) return;
    setSessionDraft((current) => ({
      ...current,
      [exerciseId]: (current[exerciseId] ?? []).map((set, setIndex) => setIndex === index ? { ...set, [key]: value.trim() === '' ? 0 : parsed } : set),
    }));
  }

  function markSetDone(exerciseId: string) {
    const sets = sessionDraft[exerciseId] ?? [];
    const setIndex = completedSetCounts[exerciseId] ?? 0;
    const currentSet = sets[setIndex];
    if (!currentSet || currentSet.reps < 1 || currentSet.weight < 0) {
      Alert.alert('Sprawdź serię', 'Powtórzenia muszą wynosić co najmniej 1, a ciężar nie może być ujemny.');
      return;
    }
    const nextCount = setIndex + 1;
    const editContext = setEditContexts[exerciseId];
    if (editContext) {
      setCompletedSetCounts((current) => ({ ...current, [exerciseId]: editContext.resumeIndex }));
      if (editContext.wasExerciseComplete) setCompletedExerciseIds((current) => current.includes(exerciseId) ? current : [...current, exerciseId]);
      setSetEditContexts((current) => { const next = { ...current }; delete next[exerciseId]; return next; });
      return;
    }
    setCompletedSetCounts((current) => ({ ...current, [exerciseId]: nextCount }));
    if (nextCount >= sets.length) setCompletedExerciseIds((current) => current.includes(exerciseId) ? current : [...current, exerciseId]);
  }

  function editSingleSet(exerciseId: string, setIndex: number) {
    const wasExerciseComplete = completedExerciseIds.includes(exerciseId);
    const resumeIndex = completedSetCounts[exerciseId] ?? 0;
    setSetEditContexts((current) => ({ ...current, [exerciseId]: { resumeIndex, wasExerciseComplete } }));
    setCompletedSetCounts((current) => ({ ...current, [exerciseId]: setIndex }));
    setCompletedExerciseIds((current) => current.filter((id) => id !== exerciseId));
  }

  async function openExerciseVideo(url: string) {
    try { await Linking.openURL(url); }
    catch { Alert.alert('Nie udało się otworzyć filmu', 'Sprawdź, czy link do YouTube jest poprawny.'); }
  }

  function toggleExerciseGuide(exerciseId: string) {
    setExpandedGuideIds((current) => current.includes(exerciseId) ? current.filter((id) => id !== exerciseId) : [...current, exerciseId]);
  }

  async function finishSession() {
    if (!selectedPlan || !selectedDay) return;
    if (selectedDay.exercises.some((exercise) => !completedExerciseIds.includes(exercise.id))) {
      Alert.alert('Dokończ ćwiczenia', 'Oznacz każde ćwiczenie jako gotowe. Jeśli zauważysz pomyłkę, wybierz „Edytuj ćwiczenie” przed zapisaniem treningu.'); return;
    }
    const done: CompletedExercise[] = selectedDay.exercises.map((exercise) => ({ exerciseId: exercise.id, name: exercise.name, sets: sessionDraft[exercise.id] ?? [] }));
    if (done.some((exercise) => exercise.sets.some((set) => set.reps < 1 || set.weight < 0))) {
      Alert.alert('Sprawdź wykonane serie', 'Powtórzenia muszą wynosić co najmniej 1, a ciężar nie może być ujemny.'); return;
    }
    const completed: TrainingSession = { id: makeId(), planId: selectedPlan.id, dayId: selectedDay.id, completedAt: new Date().toISOString(), exercises: done };
    const next = [completed, ...sessions];
    setSaving(true);
    try {
      if (!dataOwnerId) throw new Error('Brak aktywnego użytkownika.');
      await saveUserSessions(dataOwnerId, next);
      setSessions(next);
      setCompletedSession(completed);
      setMode('summary');
    } catch { Alert.alert('Nie zapisano treningu', 'Spróbuj ponownie za chwilę.'); }
    finally { setSaving(false); }
  }

  async function skipTrainingDay() {
    if (!selectedPlan || !selectedDay) return;
    const skipped: TrainingSession = { id: makeId(), planId: selectedPlan.id, dayId: selectedDay.id, completedAt: new Date().toISOString(), exercises: [], skipped: true };
    const next = [skipped, ...sessions];
    setSaving(true);
    try {
      if (!dataOwnerId) throw new Error('Brak aktywnego użytkownika.');
      await saveUserSessions(dataOwnerId, next);
      setSessions(next);
      setConfirmSkipDay(false);
      const skippedDayName = selectedDay.name;
      const nextDayIndex = (selectedPlan.days.findIndex((day) => day.id === selectedDay.id) + 1) % selectedPlan.days.length;
      const nextDay = selectedPlan.days[nextDayIndex];
      if (nextDay) {
        setSkippedDayNotice(`${skippedDayName} pominięty i zapisany jako niewykonany. Zaczynasz teraz: ${nextDay.name}.`);
        startSession(nextDay, selectedPlan, next);
      } else setMode('list');
    } catch { Alert.alert('Nie pominięto dnia', 'Spróbuj ponownie za chwilę.'); }
    finally { setSaving(false); }
  }

  async function sendTrainingReport() {
    const trainer = linkedTrainees[0];
    if (!currentProfile || currentProfile.role !== 'trainee' || !selectedPlan || !reportSessions.length || !trainer) {
      Alert.alert('Nie można wysłać raportu', 'Sprawdź, czy konto podopiecznego jest połączone z trenerem.');
      return;
    }
    const report: TrainingReport = {
      id: makeId(),
      traineeId: currentProfile.id,
      trainerId: trainer.id,
      planId: selectedPlan.id,
      sessionIds: reportSessions.map((entry) => entry.id),
      sessions: reportSessions,
      exerciseComments: reportComments,
      createdAt: new Date().toISOString(),
    };
    setSaving(true);
    try {
      await saveTrainingReport(report);
      setReports((current) => [report, ...current]);
      setReportSessions([]);
      setReportComments({});
      setMode(reportReturnMode);
      Alert.alert('Raport wysłany', `Podsumowanie zostało wysłane do trenera ${trainer.full_name}.`);
    } catch (error) {
      Alert.alert('Nie udało się wysłać raportu', error instanceof Error ? error.message : 'Spróbuj ponownie za chwilę.');
    } finally { setSaving(false); }
  }

  function back() {
    if (mode === 'report') setMode(reportReturnMode);
    else setMode('list');
  }

  return <SafeAreaView edges={['top']} style={s.safe}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.flex}>
      <ScrollView automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} contentContainerStyle={s.content} keyboardDismissMode="none" keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
        <View style={s.top}><Pressable accessibilityRole="button" accessibilityLabel="Strona główna" onPress={() => router.replace('/')} style={s.brandHome}><View style={s.mark}><Text style={s.markText}>P</Text></View><Text style={s.brand}>PROGRES</Text></Pressable><Text style={s.pill}>{actingForTraineeId ? 'TRENING PODOPIECZNEGO' : 'PLANY'}</Text></View>
        <Pressable onPress={mode === 'list' ? () => router.back() : back} style={s.back}><Text style={s.backText}>{mode === 'list' ? '‹  Strona główna' : '‹  Wróć'}</Text></Pressable>

        {mode === 'list' && <>
          <Text style={s.eyebrow}>TWÓJ TRENING</Text><Text style={s.title}>Plany, które{ '\n' }prowadzą do celu.</Text>
          <Text style={s.subtitle}>Ułóż dni treningowe i śledź swój progres przy każdym ćwiczeniu.</Text>
          <View style={s.stats}><Text style={s.statNum}>{plans.length}</Text><Text style={s.statLabel}>PLANÓW</Text><View style={s.divider}/><Text style={s.statNum}>{sessionCount}</Text><Text style={s.statLabel}>TRENINGÓW</Text></View>
          <View style={s.listTabs}>
            <Pressable onPress={() => { setPlanListTab('active'); setPendingDeletePlanId(null); setPendingCompletePlanId(null); }} style={[s.listTab, planListTab === 'active' && s.listTabSelected]}><Text style={[s.listTabText, planListTab === 'active' && s.listTabTextSelected]}>AKTYWNE · {activePlans.length}</Text></Pressable>
            <Pressable onPress={() => { setPlanListTab('completed'); setPendingDeletePlanId(null); setPendingCompletePlanId(null); }} style={[s.listTab, planListTab === 'completed' && s.listTabSelected]}><Text style={[s.listTabText, planListTab === 'completed' && s.listTabTextSelected]}>ZAKOŃCZONE · {completedPlans.length}</Text></Pressable>
          </View>
          <View style={s.heading}><Text style={s.headingTitle}>{planListTab === 'active' ? 'Aktywne plany' : 'Plany zakończone'}</Text><Text style={s.count}>{visiblePlans.length.toString().padStart(2, '0')}</Text></View>
          {!ready ? <View style={s.empty}><Text style={s.emptyTitle}>Wczytuję Twoje plany…</Text></View> : visiblePlans.length === 0 ? <View style={s.empty}><Text style={s.emptyIcon}>{planListTab === 'active' ? '＋' : '✓'}</Text><Text style={s.emptyTitle}>{planListTab === 'active' ? 'Nie masz jeszcze aktywnych planów' : 'Nie masz jeszcze zakończonych planów'}</Text><Text style={s.emptyText}>{planListTab === 'active' ? 'Utwórz plan, aby zacząć zapisywać swoje treningi.' : 'Zakończony plan i jego historia pojawią się tutaj.'}</Text></View> : <View style={s.list}>{visiblePlans.map((plan) => {
            const planSessions = sessions.filter((session) => session.planId === plan.id);
            const unreportedMicrocycle = getNextUnreportedMicrocycle(plan, sessions, reports);
            const isCompleted = Boolean(plan.completedAt);
            const canManagePlan = !actingForTraineeId && (!plan.ownerId || plan.ownerId === session?.user.id);
            const assignedTrainee = linkedTrainees.find((trainee) => trainee.id === plan.assignedTo);
            return <View key={plan.id} style={s.planCard}>
              <Pressable onPress={() => isCompleted ? openCompletedPlan(plan) : openPlan(plan)} style={({ pressed }) => [s.planOpen, pressed && s.pressed]}>
                <View style={s.planHead}><Text style={s.planName}>{plan.name}</Text><Text style={s.arrow}>↗</Text></View>
                <Text style={s.planMeta}>{isCompleted ? `Zakończono ${new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(plan.completedAt!))} · ${planSessions.length} treningów` : `${plan.days.length} ${plan.days.length === 1 ? 'dzień' : 'dni'} treningowe · ${plan.days.reduce((sum, day) => sum + day.exercises.length, 0)} ćwiczeń · ${planSessions.length} treningów`}</Text>
                {plan.assignedTo && <Text style={s.assignmentStatus}>Plan przypisany podopiecznemu{assignedTrainee ? `: ${assignedTrainee.full_name}` : ''}</Text>}
                <View style={s.dayChips}>{plan.days.map((day) => <Text key={day.id} style={s.chip}>{day.name}</Text>)}</View>
                {isCompleted ? <Text style={s.planAction}>ZOBACZ HISTORIĘ CAŁEGO PLANU  ↗</Text> : <Text style={s.planAction}>REALIZUJ PLAN  ↗</Text>}
              </Pressable>
              {actingForTraineeId ? <View style={s.planActions}><Text style={s.assignmentStatus}>TRENER UZUPEŁNIA TRENING ZA PODOPIECZNEGO</Text></View> : !canManagePlan && plan.assignedTo === session?.user.id && !isCompleted ? <View style={s.planActions}><Pressable onPress={() => { setPendingCompletePlanId(plan.id); setPendingDeletePlanId(null); }} style={s.completeButton}><Text style={s.completeButtonText}>ZAKOŃCZ PLAN</Text></Pressable></View> : !canManagePlan ? <View style={s.planActions}><Text style={s.assignmentStatus}>PLAN PRZYPISANY PRZEZ TRENERA</Text></View> : isCompleted ? (
                <View style={s.planActions}><Pressable onPress={() => setPendingDeletePlanId(plan.id)} style={s.deleteButton}><Text style={s.deleteButtonText}>USUŃ PLAN</Text></Pressable></View>
              ) : (
                <View style={s.planActions}>
                  <Pressable onPress={() => startEditPlan(plan)} style={s.editPlanButton}><Text style={s.editPlanButtonText}>EDYTUJ</Text></Pressable>
                  <Pressable onPress={() => { setPendingDeletePlanId(plan.id); setPendingCompletePlanId(null); }} style={s.deleteButton}><Text style={s.deleteButtonText}>USUŃ</Text></Pressable>
                  <Pressable onPress={() => { setPendingCompletePlanId(plan.id); setPendingDeletePlanId(null); }} style={s.completeButton}><Text style={s.completeButtonText}>ZAKOŃCZ PLAN</Text></Pressable>
                </View>
              )}
              {currentProfile?.role === 'trainee' && !actingForTraineeId && linkedTrainees.length > 0 && unreportedMicrocycle && <Pressable accessibilityRole="button" onPress={() => { setSelectedPlan(plan); setReportSessions(unreportedMicrocycle); setReportComments({}); setReportReturnMode('list'); setMode('report'); }} style={s.reportListButton}><Text style={s.reportListButtonText}>RAPORT DO WYSŁANIA · MIKROCYKL GOTOWY</Text><Text style={s.reportListHint}>Uzupełnij komentarze i wyślij trenerowi  ↗</Text></Pressable>}
              {pendingDeletePlanId === plan.id && <View style={s.confirmBox}><Text style={s.confirmText}>Usunięcie planu skasuje też zapisaną historię jego treningów. Czy usunąć?</Text><View style={s.confirmActions}><Pressable onPress={() => setPendingDeletePlanId(null)} style={s.cancelButton}><Text style={s.cancelButtonText}>ANULUJ</Text></Pressable><Pressable disabled={saving} onPress={() => deletePlan(plan)} style={s.confirmDeleteButton}><Text style={s.confirmDeleteText}>{saving ? 'USUWAM…' : 'USUŃ PLAN'}</Text></Pressable></View></View>}
              {pendingCompletePlanId === plan.id && <View style={s.confirmBox}><Text style={s.confirmText}>Plan zostanie przeniesiony do zakończonych. Jego historia treningów pozostanie dostępna do wglądu.</Text><View style={s.confirmActions}><Pressable onPress={() => setPendingCompletePlanId(null)} style={s.cancelButton}><Text style={s.cancelButtonText}>ANULUJ</Text></Pressable><Pressable disabled={saving} onPress={() => finishPlan(plan)} style={s.confirmCompleteButton}><Text style={s.confirmCompleteText}>{saving ? 'ZAPISUJĘ…' : 'ZAKOŃCZ PLAN'}</Text></Pressable></View></View>}
            </View>;
          })}</View>}
          {planListTab === 'active' && !actingForTraineeId && <Pressable disabled={!ready} onPress={startCreate} style={({ pressed }) => [s.primary, pressed && s.pressed, !ready && s.disabled]}><Text style={s.primaryText}>＋  UTWÓRZ NOWY PLAN</Text></Pressable>}
        </>}

        {mode === 'review' && selectedPlan && (() => {
          const history = sessions.filter((session) => session.planId === selectedPlan.id).sort((a, b) => a.completedAt.localeCompare(b.completedAt));
          const completedAt = selectedPlan.completedAt ? new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(selectedPlan.completedAt)) : '';
          const totalSets = history.reduce((sum, session) => sum + session.exercises.reduce((exerciseSum, exercise) => exerciseSum + exercise.sets.length, 0), 0);
          return <>
            <Text style={s.eyebrow}>PLAN ZAKOŃCZONY</Text>
            <Text style={s.title}>{selectedPlan.name}</Text>
            <Text style={s.subtitle}>{completedAt ? `Zakończono ${completedAt}` : 'Historia wszystkich treningów w tym planie.'}</Text>
            <View style={s.stats}>
              <View style={s.summaryMetric}><Text style={s.statNum}>{history.length}</Text><Text style={s.statLabel}>TRENINGÓW</Text></View>
              <View style={s.divider}/>
              <View style={s.summaryMetric}><Text style={s.statNum}>{totalSets}</Text><Text style={s.statLabel}>WYKONANYCH SERII</Text></View>
            </View>
            <View style={s.heading}><Text style={s.headingTitle}>Przebieg planu</Text><Text style={s.count}>{history.length} TRENINGÓW</Text></View>
            {history.length === 0 ? <View style={s.empty}><Text style={s.emptyText}>Plan zakończono bez zapisanych treningów.</Text></View> : <View style={s.list}>{history.map((session, sessionIndex) => {
              const day = selectedPlan.days.find((item) => item.id === session.dayId);
              const date = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(session.completedAt));
              const sessionSets = session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
              const volume = session.exercises.reduce((sum, exercise) => sum + exercise.sets.reduce((setSum, set) => setSum + set.weight * set.reps, 0), 0);
              return <View key={session.id} style={s.reviewSession}>
                <View style={s.reviewSessionHeader}><View style={s.reviewSessionNumber}><Text style={s.reviewSessionNumberText}>{String(sessionIndex + 1).padStart(2, '0')}</Text></View><View style={s.exerciseInfo}><Text style={s.planName}>{day?.name ?? 'Trening'}</Text><Text style={s.exerciseMeta}>{date} · {sessionSets} serii · {Math.round(volume).toLocaleString('pl-PL')} kg łącznie</Text></View></View>
                {session.exercises.map((completedExercise) => {
                  const exercise = day?.exercises.find((item) => item.id === completedExercise.exerciseId);
                  return <View key={completedExercise.exerciseId} style={s.reviewExercise}>
                    <Text style={s.exerciseName}>{completedExercise.name ?? exercise?.name ?? 'Ćwiczenie'}</Text>
                    {completedExercise.sets.map((set, setIndex) => <View key={`${completedExercise.exerciseId}-${setIndex}`} style={s.reviewSetRow}><Text style={s.summarySetLabel}>SERIA {setIndex + 1}</Text><Text style={s.summarySetValue}>{set.weight} kg × {set.reps} powt.</Text></View>)}
                  </View>;
                })}
              </View>;
            })}</View>}
          </>;
        })()}
        {mode === 'create' && <PlanBuilder
          editing={Boolean(editingPlanId)}
          canImport={currentProfile?.role === 'trainer' && !actingForTraineeId}
          onImportSpreadsheet={importSpreadsheet}
          onDownloadTemplate={downloadPlanTemplate}
          planName={planName}
          onPlanNameChange={setPlanName}
          canAssign={currentProfile?.role === 'trainer' && !actingForTraineeId}
          trainees={linkedTrainees}
          assignedTo={draftAssignedTo}
          onAssignedToChange={setDraftAssignedTo}
          dayCount={dayCount}
          onDayCountChange={setDayCount}
          days={draftDays}
          onDaysChange={setDraftDays}
          exerciseDrafts={exerciseDrafts}
          onExerciseDraftsChange={setExerciseDrafts}
          openExerciseForms={exerciseFormOpenDays}
          onOpenExerciseFormsChange={setExerciseFormOpenDays}
          editingExerciseIds={editingExerciseIds}
          saving={saving}
          onMakeDays={makeDays}
          onAddExercise={addExercise}
          onEditExercise={editDraftExercise}
          onRemoveExercise={removeDraftExercise}
          onSave={savePlan}
        />}
        {mode === 'summary' && selectedPlan && selectedDay && completedSession && (() => {
          const nextDayIndex = (selectedPlan.days.findIndex((day) => day.id === selectedDay.id) + 1) % selectedPlan.days.length;
          const nextDay = selectedPlan.days[nextDayIndex];
          const completedSets = completedSession.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
          const volume = completedSession.exercises.reduce((sum, exercise) => sum + exercise.sets.reduce((exerciseSum, set) => exerciseSum + set.weight * set.reps, 0), 0);
          const completedAt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(completedSession.completedAt));
          return <>
            <Text style={s.eyebrow}>{completedSession.skipped ? 'DZIEŃ POMINIĘTY' : 'TRENING ZAPISANY'} · {selectedPlan.name}</Text>
            <Text style={s.title}>{completedSession.skipped ? 'Dzień zapisany.' : 'Dobra robota.'}</Text>
            <Text style={s.subtitle}>{completedSession.skipped ? `${selectedDay.name} oznaczony jako niewykonany · ${completedAt}` : `${selectedDay.name} · ${completedAt}`}</Text>
            {completedSession.skipped
              ? <View style={s.skippedSummary}><Text style={s.skippedSummaryTitle}>Ten dzień pozostaje w planie jako niewykonany.</Text><Text style={s.exerciseMeta}>Przy następnym wejściu w plan otworzy się kolejny dzień treningowy.</Text></View>
              : <>
            <View style={s.stats}>
              <View style={s.summaryMetric}><Text style={s.statNum}>{completedSets}</Text><Text style={s.statLabel}>WYKONANYCH SERII</Text></View>
              <View style={s.divider}/>
              <View style={s.summaryMetric}><Text style={s.statNum}>{Math.round(volume).toLocaleString('pl-PL')}</Text><Text style={s.statLabel}>KG OBJĘTOŚCI</Text></View>
            </View>
            <View style={s.heading}><Text style={s.headingTitle}>Wyniki dnia</Text><Text style={s.count}>{completedSession.exercises.length} ĆW.</Text></View>
            {completedSession.exercises.map((item) => {
              const exercise = selectedDay.exercises.find((entry) => entry.id === item.exerciseId);
              return <View key={item.exerciseId} style={s.dayCard}>
                <Text style={s.exerciseName}>{item.name ?? exercise?.name ?? 'Ćwiczenie'}</Text>
                {item.sets.map((set, index) => <View key={`${item.exerciseId}-${index}`} style={s.summarySetRow}><Text style={s.summarySetLabel}>SERIA {index + 1}</Text><Text style={s.summarySetValue}>{set.weight} kg × {set.reps}</Text></View>)}
              </View>;
            })}
            </>}
            {nextDay && <View style={s.nextDayCard}><Text style={s.nextDayLabel}>NASTĘPNY TRENING W TYM PLANIE</Text><Text style={s.nextDayName}>{nextDay.name}</Text><Text style={s.exerciseMeta}>Przy kolejnym wejściu w plan od razu otworzy się ten dzień.</Text></View>}
            {currentProfile?.role === 'trainee' && !actingForTraineeId && linkedTrainees.length > 0 && (() => {
              const cycle = getNextUnreportedMicrocycle(selectedPlan, sessions, reports);
              const justCompletedCycle = cycle?.some((entry) => entry.id === completedSession.id);
              return justCompletedCycle ? <View style={s.reportPrompt}>
                <Text style={s.reportPromptTitle}>MIKROCYKL UKOŃCZONY ✓</Text>
                <Text style={s.reportPromptBody}>Wyślij podsumowanie treningów trenerowi. Raport czeka na uzupełnienie.</Text>
                <Pressable accessibilityRole="button" onPress={() => { setReportSessions(cycle ?? []); setReportComments({}); setReportReturnMode('summary'); setMode('report'); }} style={s.reportCta}><Text style={s.reportCtaText}>UZUPEŁNIJ I WYŚLIJ RAPORT  ↗</Text></Pressable>
              </View> : null;
            })()}
            <Pressable onPress={() => setMode('list')} style={s.primary}><Text style={s.primaryText}>WRÓĆ DO PLANÓW</Text></Pressable>
          </>;
        })()}
        {mode === 'report' && selectedPlan && reportSessions.length > 0 && <TrainingReportForm
          plan={selectedPlan}
          sessions={reportSessions}
          comments={reportComments}
          saving={saving}
          onCommentChange={(key, value) => setReportComments((current) => ({ ...current, [key]: value }))}
          onSend={sendTrainingReport}
          onCancel={() => setMode(reportReturnMode)}
        />}
        {mode === 'session' && selectedPlan && selectedDay && <TrainingSessionView
          plan={selectedPlan}
          day={selectedDay}
          sessions={sessions}
          reports={reports}
          showReportPrompt={currentProfile?.role === 'trainee' && !actingForTraineeId && linkedTrainees.length > 0}
          confirmSkip={confirmSkipDay}
          skippedNotice={skippedDayNotice}
          completedExerciseIds={completedExerciseIds}
          completedSetCounts={completedSetCounts}
          sessionDraft={sessionDraft}
          expandedGuideIds={expandedGuideIds}
          playingVideoExerciseId={playingVideoExerciseId}
          saving={saving}
          onOpenReport={(cycle) => { setReportSessions(cycle); setReportComments({}); setReportReturnMode('session'); setMode('report'); }}
          onConfirmSkipChange={setConfirmSkipDay}
          onSkipDay={skipTrainingDay}
          onToggleGuide={toggleExerciseGuide}
          onToggleVideo={(id) => setPlayingVideoExerciseId((current) => current === id ? null : id)}
          onOpenVideo={openExerciseVideo}
          onUpdateSet={updateSet}
          onMarkSetDone={markSetDone}
          onEditSet={editSingleSet}
          onFinish={finishSession}
        />}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}


