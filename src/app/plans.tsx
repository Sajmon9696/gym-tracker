import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
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
  type PlannedSetTarget,
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
import { formatSetResult, getExerciseTargets, getNextUnreportedMicrocycle } from '@/lib/training-progression';
import { parsePlanSpreadsheet, TRAINER_PLAN_TEMPLATE } from '@/lib/plan-spreadsheet';
import type { CatalogExercise } from '@/lib/exercise-catalog';
import { getDefaultExerciseCatalog, loadTrainerExerciseCatalog } from '@/lib/exercise-catalog-store';
import PlanBuilder, { createEmptyExerciseDraft, type ExerciseDraft } from '@/components/plans/plan-builder';
import TrainingReportForm from '@/components/plans/training-report-form';
import TrainingSessionView from '@/components/plans/training-session-view';
import { useWorkoutRecovery } from '@/lib/use-workout-recovery';
import { claimLocalWorkout, newWorkoutId, pendingWorkoutSessions, syncWorkoutScope, type SetEditContext, type WorkoutDraft } from '@/lib/workout-journal';
import { planStyles as s } from '@/components/plans/plan-styles';

type Mode = 'list' | 'create' | 'session' | 'summary' | 'review' | 'report' | 'building' | 'preview';
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const parseKilograms = (value: string) => Number(value.trim().replace(/\s*kg$/i, '').replace(',', '.'));

function formatPlannedSet(exercise: PlannedExercise, target: PlannedSetTarget) {
  const range = exercise.metric === 'time'
    ? `${target.repsMin}–${target.repsMax} s`
    : exercise.metric === 'distance'
      ? `${target.repsMin}–${target.repsMax} m`
      : `${target.repsMin}–${target.repsMax} powt.`;
  if (exercise.metric === 'time') return range;
  if (exercise.metric === 'distance') return `${range} · ${target.targetWeight} kg`;
  if (exercise.metric === 'band') return `${range} · ${target.bandColor ?? exercise.bandColor ?? 'guma'}${target.targetWeight ? ` · ${target.targetWeight} kg` : ''} · pomoc ${target.assistanceLevel ?? exercise.assistanceLevel ?? 'brak'}`;
  return `${range} · ${target.targetWeight} kg${exercise.metric === 'machine' ? ' · maszyna' : ''}`;
}

function formatProgression(exercise: PlannedExercise) {
  const progression = exercise.progression;
  if (!progression || progression.amount <= 0) return null;
  if (progression.type === 'machine-step') return 'Po osiągnięciu celu: następna sztabka';
  if (progression.type === 'band-assistance') return 'Po osiągnięciu celu: mniejsza pomoc gumy';
  const unit = progression.type === 'percent' ? '%' : progression.type === 'kilograms' || progression.type === 'band-kilograms' ? ' kg' : progression.type === 'seconds' ? ' s' : progression.type === 'meters' ? ' m' : ' powt.';
  return `Progresja po osiągnięciu celu: +${progression.amount}${unit}`;
}

function PlansScreen() {
  const { action, traineeId, planId } = useLocalSearchParams<{ action?: string; traineeId?: string; planId?: string }>();
  const actingForTraineeId = typeof traineeId === 'string' ? traineeId : null;
  const { session, loading: authLoading } = useAuth();
  const dataOwnerId = actingForTraineeId ?? session?.user.id;
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [exerciseCatalog, setExerciseCatalog] = useState<CatalogExercise[]>(getDefaultExerciseCatalog);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [reports, setReports] = useState<TrainingReport[]>([]);
  const [currentProfile, setCurrentProfile] = useState<LocalProfile | null>(null);
  const [linkedTrainees, setLinkedTrainees] = useState<{ id: string; full_name: string; email: string; role: 'trainer' | 'trainee' }[]>([]);
  const [draftAssignedTo, setDraftAssignedTo] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('list');
  const [selectedPlan, setSelectedPlan] = useState<TrainingPlan | null>(null);
  const [selectedDay, setSelectedDay] = useState<TrainingDay | null>(null);
  const [completedSession, setCompletedSession] = useState<TrainingSession | null>(null);
  const [reportSessions, setReportSessions] = useState<TrainingSession[]>([]);
  const [reportComments, setReportComments] = useState<Record<string, string>>({});
  const [reportReturnMode, setReportReturnMode] = useState<'list' | 'session' | 'summary'>('summary');
  const [confirmSkipDay, setConfirmSkipDay] = useState(false);
  const [skippedDayNotice, setSkippedDayNotice] = useState<string | null>(null);
  const [completedExerciseIds, setCompletedExerciseIds] = useState<string[]>([]);
  const [skippedExerciseIds, setSkippedExerciseIds] = useState<string[]>([]);
  const [completedSetCounts, setCompletedSetCounts] = useState<Record<string, number>>({});
  const [setEditContexts, setSetEditContexts] = useState<Record<string, SetEditContext>>({});
  const [expandedGuideIds, setExpandedGuideIds] = useState<string[]>([]);
  const [playingVideoExerciseId, setPlayingVideoExerciseId] = useState<string | null>(null);
  const [planListTab, setPlanListTab] = useState<'active' | 'completed'>('active');
  const [pendingDeletePlanId, setPendingDeletePlanId] = useState<string | null>(null);
  const [pendingCompletePlanId, setPendingCompletePlanId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [buildingPlanCreation, setBuildingPlanCreation] = useState(false);
  const [buildDayAfterSaveId, setBuildDayAfterSaveId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadTrainerExerciseCatalog().then((catalog) => { if (active) setExerciseCatalog(catalog); }).catch(() => { if (active) setExerciseCatalog(getDefaultExerciseCatalog()); });
    return () => { active = false; };
  }, [session?.user.id]);

  const [planName, setPlanName] = useState('');
  const [dayCount, setDayCount] = useState('3');
  const [draftDays, setDraftDays] = useState<TrainingDay[]>([]);
  const [exerciseDrafts, setExerciseDrafts] = useState<Record<string, ExerciseDraft>>({});
  const [exerciseFormOpenDays, setExerciseFormOpenDays] = useState<Record<string, boolean>>({});
  const [editingExerciseIds, setEditingExerciseIds] = useState<Record<string, string | null>>({});
  const [sessionDraft, setSessionDraft] = useState<Record<string, CompletedSet[]>>({});
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDraft | null>(null);
  const confirmingSet = useRef(false);
  const [activeScope, setActiveScope] = useState('');
  const scopeIdentity = `${session?.user.id ?? ''}:${dataOwnerId ?? ''}`;
  const workoutScope = useMemo(() => session?.user.id && dataOwnerId
    ? { actorId: session.user.id, ownerId: dataOwnerId } : null, [session?.user.id, dataOwnerId]);
  const liveWorkout = useMemo(() => mode === 'session' && activeWorkout && activeScope === scopeIdentity ? {
    ...activeWorkout, values: sessionDraft, counts: completedSetCounts,
    completed: completedExerciseIds, skipped: skippedExerciseIds, edits: setEditContexts,
  } : null, [mode, activeWorkout, activeScope, scopeIdentity, sessionDraft, completedSetCounts, completedExerciseIds, skippedExerciseIds, setEditContexts]);
  const recovery = useWorkoutRecovery(workoutScope, liveWorkout);
  // URL intent starts a workout after loading data, without reloading data on every draft edit.
  const onRouteWorkoutLoaded = useEffectEvent((day: TrainingDay, plan: TrainingPlan, history: TrainingSession[]) => {
    void startSession(day, plan, history);
  });

  function restoreWorkout(draft: WorkoutDraft) {
    setActiveScope(scopeIdentity); setActiveWorkout(draft); setSelectedPlan(draft.plan); setSelectedDay(draft.day);
    setSessionDraft(draft.values); setCompletedSetCounts(draft.counts);
    setCompletedExerciseIds(draft.completed); setSkippedExerciseIds(draft.skipped); setSetEditContexts(draft.edits);
    setConfirmSkipDay(false); setMode('session');
  }

  async function resumeWorkout() {
    try { const draft = await recovery.resume(); if (draft) restoreWorkout(draft); }
    catch (error) { Alert.alert('Nie wznowiono treningu', error instanceof Error ? error.message : 'Spróbuj ponownie.'); }
  }

  async function adoptCloudWorkout() {
    const record = recovery.status?.remote ?? recovery.remote;
    if (!record) return;
    const adopt = async () => {
      try {
        const draft = await recovery.adopt(record);
        if (draft) restoreWorkout(draft);
        else {
          setActiveWorkout(null); setMode('list');
          if (record.session_data) setSessions((current) => [record.session_data!, ...current.filter((entry) => entry.id !== record.id)]);
        }
      } catch (error) { Alert.alert('Nie przejęto treningu', error instanceof Error ? error.message : 'Sprawdź połączenie.'); }
    };
    const message = 'Wczytam wersję z chmury i przejmę jej zapis na tym urządzeniu. Różniące się lokalne wyniki zachowam w kopii do eksportu.';
    if (Platform.OS === 'web') { if (window.confirm(message)) await adopt(); }
    else Alert.alert('Przejąć trening?', message, [{ text: 'Anuluj', style: 'cancel' }, { text: 'Przejmij', onPress: () => { void adopt(); } }]);
  }

  async function exportWorkoutCopies() {
    try {
      const value = await recovery.exportCopies();
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'progres-kopia-treningu.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else await Share.share({ title: 'Kopia treningu Progres', message: value });
    } catch { Alert.alert('Nie wyeksportowano kopii', 'Spróbuj ponownie.'); }
  }


  useEffect(() => {
    if (authLoading) return;
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
              if (action === 'complete' && planId) {
                const selected = plansWithGuides.find((plan) => plan.id === planId);
                if (selected?.ownerId === userId && !selected.completedAt) setPendingCompletePlanId(selected.id);
              }
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
                  const latest = traineeData.sessions.filter((entry) => entry.planId === selected.id).sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
                  const previousIndex = latest ? selected.days.findIndex((day) => day.id === latest.dayId) : -1;
                  const nextDay = selected.days[(previousIndex + 1 + selected.days.length) % selected.days.length];
                  if (nextDay) {
                    onRouteWorkoutLoaded(nextDay, selected, traineeData.sessions);
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
            // Parametry URL stosujemy po odczycie sesji: pierwszy render musi odpowiadać statycznemu HTML.
            if (action === 'create' || action === 'build') {
              setBuildingPlanCreation(action === 'build');
              setDayCount(action === 'build' ? '1' : '3');
              setDraftDays(action === 'build' ? [{ id: makeId(), name: 'Dzień 1', exercises: [] }] : []);
              setMode('create');
            }
          }

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
  }, [session?.user.id, authLoading, actingForTraineeId, action, planId]);

  const sessionCount = useMemo(() => sessions.length, [sessions]);
  const roleVisiblePlans = currentProfile?.role === 'trainer' && !actingForTraineeId
    ? plans.filter((plan) => (!plan.ownerId || plan.ownerId === session?.user.id) && !plan.assignedTo)
    : plans;
  const activePlans = roleVisiblePlans.filter((plan) => !plan.completedAt);
  const completedPlans = roleVisiblePlans.filter((plan) => Boolean(plan.completedAt));
  const visiblePlans = planListTab === 'active' ? activePlans : completedPlans;
  const isBuildingPlanEditor = buildingPlanCreation || Boolean(plans.find((plan) => plan.id === editingPlanId)?.building);

  function startCreate() {
    setEditingPlanId(null); setBuildingPlanCreation(false); setBuildDayAfterSaveId(null); setDraftAssignedTo(null); setPlanName(''); setDayCount('3'); setDraftDays([]); setExerciseDrafts({}); setEditingExerciseIds({}); setExerciseFormOpenDays({}); setMode('create');
  }

  function startEditPlan(plan: TrainingPlan) {
    if (plan.ownerId && plan.ownerId !== session?.user.id) return;
    setEditingPlanId(plan.id);
    setBuildingPlanCreation(false);
    setBuildDayAfterSaveId(null);
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

  function startAddBuildingDay(plan: TrainingPlan) {
    if (plan.days.length >= 7) {
      Alert.alert('Osiągnięto limit dni', 'Plan może zawierać maksymalnie 7 dni treningowych.');
      return;
    }
    const newDay = { id: makeId(), name: `Dzień ${plan.days.length + 1}`, exercises: [] };
    setEditingPlanId(plan.id);
    setBuildingPlanCreation(false);
    setBuildDayAfterSaveId(newDay.id);
    setDraftAssignedTo(plan.assignedTo ?? null);
    setPlanName(plan.name);
    setDayCount(String(plan.days.length + 1));
    setDraftDays([...plan.days.map((day) => ({ ...day, exercises: day.exercises.map((exercise) => ({ ...exercise })) })), newDay]);
    setExerciseDrafts({});
    setEditingExerciseIds({});
    setExerciseFormOpenDays({ [newDay.id]: false });
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
        catalogCategory: (exercise.category as ExerciseDraft['catalogCategory']) ?? exerciseCatalog.find((item) => item.pl.toLocaleLowerCase('pl-PL') === exercise.name.toLocaleLowerCase('pl-PL') || item.en.toLocaleLowerCase('en') === exercise.name.toLocaleLowerCase('en'))?.category ?? 'Inne',
        progressionType: exercise.metric === 'machine' ? 'machine-step' : exercise.metric === 'distance' ? 'meters' : exercise.progression?.type ?? (exercise.metric === 'time' ? 'seconds' : exercise.metric === 'band' ? 'band-kilograms' : 'kilograms'),
        progressionAmount: exercise.metric === 'machine' ? '0' : String(exercise.progression?.amount ?? 0),
        loadProgressionType: exercise.loadProgression?.type === 'percent' ? 'percent' : 'kilograms',
        loadProgressionAmount: String(exercise.loadProgression?.amount ?? 0),
        customSets: Boolean(exercise.setTargets?.length),
        metric: exercise.metric ?? 'load',
        bandColor: exercise.bandColor ?? '',
        assistanceLevel: exercise.assistanceLevel ?? 'brak',
        setTargets: exercise.setTargets?.map((set) => ({ repsMin: String(set.repsMin), repsMax: String(set.repsMax), weight: String(set.targetWeight), bandColor: set.bandColor ?? '', assistanceLevel: set.assistanceLevel ?? exercise.assistanceLevel ?? 'brak' })) ?? [],
      },
    }));
  }


  function makeDays() {
    const count = Number(dayCount);
    if (!Number.isInteger(count) || count < 1 || count > 7) {
      Alert.alert('Wybierz liczbę dni', 'Plan może zawierać od 1 do 7 dni treningowych.'); return;
    }
    // Zmiana liczby dni nie kasuje ćwiczeń wpisanych w pozostałych dniach.
    if (count < draftDays.length && draftDays.slice(count).some((day) => day.exercises.length > 0)) {
      Alert.alert('Dni zawierają ćwiczenia', 'Zmniejszenie liczby dni usunęłoby wpisane ćwiczenia. Pozostaw te dni lub najpierw usuń z nich ćwiczenia.');
      return;
    }
    setDraftDays(Array.from({ length: count }, (_, i) => draftDays[i] ?? { id: makeId(), name: `Dzień ${i + 1}`, exercises: [] }));
  }

  function addDraftDay() {
    if (draftDays.length >= 7) {
      Alert.alert('Osiągnięto limit dni', 'Plan może zawierać maksymalnie 7 dni treningowych.');
      return;
    }
    const newDay = { id: makeId(), name: `Dzień ${draftDays.length + 1}`, exercises: [] };
    const nextDays = [...draftDays, newDay];
    setDraftDays(nextDays);
    setDayCount(String(nextDays.length));
    if (isBuildingPlanEditor && !buildDayAfterSaveId) setBuildDayAfterSaveId(newDay.id);
  }

  function addExercise(day: TrainingDay) {
    const draft = exerciseDrafts[day.id] ?? createEmptyExerciseDraft();
    const sets = Number(draft.sets), repsMin = Number(draft.repsMin), repsMax = Number(draft.repsMax);
    const weight = parseKilograms(draft.weight);
    // Maszyna zawsze korzysta z przypomnienia o sztabce; nie z ukrytej liczby progresji.
    const progressionType = draft.metric === 'machine' ? 'machine-step' : draft.metric === 'distance' ? 'meters' : draft.progressionType;
    const loadProgressionAmount = draft.metric === 'distance' ? parseKilograms(draft.loadProgressionAmount) : 0;
    const progressionAmount = progressionType === 'machine-step' || progressionType === 'band-assistance' ? 0 : Number(draft.progressionAmount.replace(',', '.'));
    const youtubeUrl = draft.youtubeUrl.trim();
    if (youtubeUrl && !/^https:\/\/(www\.)?(youtube\.com|m\.youtube\.com|youtu\.be)\/\S+$/i.test(youtubeUrl)) {
      Alert.alert('Nieprawidłowy link', 'Wklej pełny link HTTPS do filmu z YouTube (youtube.com lub youtu.be).'); return;
    }
    if (!draft.name.trim()) { Alert.alert('Podaj nazwę ćwiczenia', 'Wpisz nazwę, aby dodać ćwiczenie do dnia.'); return; }
    if (!draft.catalogCategory) { Alert.alert('Wybierz partię mięśniową', 'Zaznacz kategorię dla tego ćwiczenia. Dzięki temu znajdziesz je później pod właściwą partią.'); return; }
    const customSetTargets = draft.customSets ? draft.setTargets.map((set) => ({ repsMin: Number(set.repsMin), repsMax: Number(set.repsMax), targetWeight: parseKilograms(set.weight), ...(draft.metric === 'band' ? { bandColor: set.bandColor?.trim() || draft.bandColor.trim() || undefined, assistanceLevel: set.assistanceLevel ?? draft.assistanceLevel } : {}) })) : undefined;
    const invalidCustomSet = customSetTargets?.some((set) => ![set.repsMin, set.repsMax, set.targetWeight].every(Number.isFinite) || (draft.metric !== 'distance' && (!Number.isInteger(set.repsMin) || !Number.isInteger(set.repsMax))) || set.repsMin < 1 || set.repsMax < set.repsMin || set.targetWeight < 0);
    const isWholeProgression = progressionType === 'repetitions' || progressionType === 'seconds' || progressionType === 'machine-step' || progressionType === 'band-assistance';
    if (![sets, repsMin, repsMax, weight, progressionAmount].every(Number.isFinite) || !Number.isInteger(sets) || (draft.metric !== 'distance' && (!Number.isInteger(repsMin) || !Number.isInteger(repsMax))) || sets < 1 || repsMin < 1 || repsMax < repsMin || weight < 0 || progressionAmount < 0 || !Number.isFinite(loadProgressionAmount) || loadProgressionAmount < 0 || (isWholeProgression && !Number.isInteger(progressionAmount)) || (draft.customSets && (customSetTargets?.length !== sets || invalidCustomSet))) {
      Alert.alert('Sprawdź wartości', 'Serie, dystans w metrach, ciężar w kg i progresja muszą mieć prawidłowe wartości.'); return;
    }
    const editingId = editingExerciseIds[day.id];
    const existing = day.exercises.find((item) => item.id === editingId);
    const firstCustomSet = customSetTargets?.[0];
    const setTargets = customSetTargets?.map((target) => ({ ...target, ...(draft.metric === 'band' ? {} : {}) }));
    const exercise: PlannedExercise = {
      id: existing && (existing.metric ?? 'load') === draft.metric ? existing.id : makeId(), name: draft.name.trim(), description: draft.description.trim() || exerciseCatalog.find((item) => item.pl.toLocaleLowerCase('pl-PL') === draft.name.trim().toLocaleLowerCase('pl-PL'))?.description || getExerciseGuide(draft.name), ...(youtubeUrl ? { youtubeUrl } : {}),
      sets, repsMin: firstCustomSet?.repsMin ?? repsMin, repsMax: firstCustomSet?.repsMax ?? repsMax, targetWeight: firstCustomSet?.targetWeight ?? weight,
      metric: draft.metric,
      category: draft.catalogCategory,
      ...(draft.metric === 'band' ? { bandColor: draft.bandColor.trim() || undefined, bandResistanceKg: weight, assistanceLevel: draft.assistanceLevel } : {}),
      ...(setTargets ? { setTargets } : {}),
      ...(draft.metric === 'distance' && loadProgressionAmount > 0 ? { loadProgression: { type: draft.loadProgressionType, amount: loadProgressionAmount } } : {}),
      ...(progressionAmount > 0 ? { progression: { type: progressionType, amount: progressionAmount } } : progressionType === 'machine-step' || progressionType === 'band-assistance' ? { progression: { type: progressionType, amount: 1 } } : {}),
    };
    setDraftDays((current) => current.map((item) => item.id === day.id
      ? { ...item, exercises: editingId ? item.exercises.map((entry) => entry.id === editingId ? exercise : entry) : [...item.exercises, exercise] }
      : item));
    setEditingExerciseIds((current) => ({ ...current, [day.id]: null }));
    setExerciseFormOpenDays((current) => ({ ...current, [day.id]: false }));
    setExerciseDrafts((current) => ({ ...current, [day.id]: { ...draft, name: '', description: '', youtubeUrl: '' } }));
  }

  async function savePlan() {
    if (saving) return;
    if (!planName.trim()) { Alert.alert('Nazwij plan', 'Dodaj nazwę, np. Plan siłowy A/B.'); return; }
    if (draftDays.length === 0) { Alert.alert('Dodaj dni treningowe', 'Wybierz liczbę dni i dodaj ćwiczenia.'); return; }
    if (draftDays.some((day) => day.exercises.length === 0)) { Alert.alert('Uzupełnij plan', 'Każdy dzień powinien mieć przynajmniej jedno ćwiczenie.'); return; }
    const originalPlan = editingPlanId ? plans.find((item) => item.id === editingPlanId) : undefined;
    if (actingForTraineeId && (!originalPlan || (originalPlan.ownerId !== session?.user.id && originalPlan.ownerId !== actingForTraineeId))) {
      Alert.alert('Nie można edytować planu', 'Możesz edytować tylko plany należące do Ciebie lub wybranego podopiecznego.'); return;
    }
    const plan: TrainingPlan = originalPlan
      ? { ...originalPlan, name: planName.trim(), days: draftDays, revision: (originalPlan.revision ?? 1) + 1, updatedAt: new Date().toISOString() }
      : { id: makeId(), revision: 1, name: planName.trim(), days: draftDays, createdAt: new Date().toISOString(), ...(buildingPlanCreation ? { building: true } : {}), ...(session?.user.id ? { ownerId: session.user.id } : {}) };
    const planOwnerId = originalPlan?.ownerId ?? session?.user.id;
    const ownedPlan = { ...plan, ownerId: planOwnerId, assignedTo: actingForTraineeId ? (planOwnerId === session?.user.id ? actingForTraineeId : originalPlan?.assignedTo) : (currentProfile?.role === 'trainer' ? draftAssignedTo ?? undefined : originalPlan?.assignedTo) };
    const next = originalPlan ? plans.map((item) => item.id === plan.id ? ownedPlan : item) : [ownedPlan, ...plans];
    const nextSessions = originalPlan ? sessions.map((session) => {
      if (session.planId !== originalPlan.id || session.planSnapshot) return session;
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
          ...(originalPlan ? [saveUserSessions(actingForTraineeId, isSupabaseConfigured ? nextSessions.filter((entry, index) => JSON.stringify(entry) !== JSON.stringify(sessions[index])) : nextSessions)] : []),
        ]);
      } else {
        await Promise.all([
          saveUserPlans(session.user.id, isSupabaseConfigured ? [ownedPlan] : next),
          ...(originalPlan ? [saveUserSessions(session.user.id, isSupabaseConfigured ? nextSessions.filter((entry, index) => JSON.stringify(entry) !== JSON.stringify(sessions[index])) : nextSessions)] : []),
          ...(!isSupabaseConfigured && ownedPlan.assignedTo ? [saveLocalAssignedPlan(ownedPlan)] : []),
          ...(!isSupabaseConfigured && originalPlan?.assignedTo && !ownedPlan.assignedTo ? [deleteLocalAssignedPlan(originalPlan.id)] : []),
        ]);
      }
      setPlans(next);
      if (originalPlan) {
        setSessions(nextSessions);
        setSelectedPlan(ownedPlan);
      }
      const dayToStart = buildDayAfterSaveId ?? (buildingPlanCreation ? draftDays[0]?.id : null);
      setBuildingPlanCreation(false);
      setBuildDayAfterSaveId(null);
      if (ownedPlan.building && dayToStart) {
        const day = ownedPlan.days.find((item) => item.id === dayToStart);
        if (day) {
          setSelectedPlan(ownedPlan);
          startSession(day, ownedPlan, nextSessions);
        } else setMode('list');
      } else setMode('list');
      setEditingPlanId(null);
    }
    catch { Alert.alert('Nie zapisano planu', 'Spróbuj ponownie za chwilę.'); }
    finally { setSaving(false); }
  }

  async function finishPlan(plan: TrainingPlan) {
    if (saving || (plan.ownerId && plan.ownerId !== session?.user.id)) return;
    const finishedPlan = { ...plan, completedAt: new Date().toISOString() };
    const next = plans.map((item) => item.id === plan.id ? finishedPlan : item);
    setSaving(true);
    try {
      if (!session?.user.id) throw new Error('Brak aktywnego użytkownika.');
      await Promise.all([saveUserPlans(session.user.id, isSupabaseConfigured ? [finishedPlan] : next), ...(!isSupabaseConfigured && plan.assignedTo && plan.ownerId === session.user.id ? [saveLocalAssignedPlan(finishedPlan)] : [])]);
      setPlans(next);
      setPendingCompletePlanId(null);
      setPlanListTab('completed');
      setMode('list');
    } catch { Alert.alert('Nie udało się zakończyć planu', 'Spróbuj ponownie za chwilę.'); }
    finally { setSaving(false); }
  }

  async function confirmBuildingPlan(plan: TrainingPlan) {
    if (!session?.user.id || !plan.building) return;
    const confirmedPlan = { ...plan, building: false };
    const nextPlans = plans.map((item) => item.id === plan.id ? confirmedPlan : item);
    setSaving(true);
    try {
      await saveUserPlans(session.user.id, isSupabaseConfigured ? [confirmedPlan] : nextPlans);
      setPlans(nextPlans);
      setSelectedPlan(confirmedPlan);
      openPlan(confirmedPlan, sessions);
    } catch {
      Alert.alert('Nie zatwierdzono planu', 'Nie udało się zapisać planu. Spróbuj ponownie za chwilę.');
    } finally { setSaving(false); }
  }

  async function deletePlan(plan: TrainingPlan) {
    if (actingForTraineeId) return;
    const queued = workoutScope ? await pendingWorkoutSessions(workoutScope) : [];
    if (recovery.saved?.plan.id === plan.id || queued.some((entry) => entry.planId === plan.id)) {
      Alert.alert('Plan ma zapisany trening', 'Najpierw zakończ rozpoczęty trening i zsynchronizuj jego wyniki.'); return;
    }
    const nextPlans = plans.filter((item) => item.id !== plan.id);
    const nextSessions = sessions.filter((session) => session.planId !== plan.id);
    setSaving(true);
    try {
      if (!session?.user.id) throw new Error('Brak aktywnego użytkownika.');
      await Promise.all([deleteUserPlan(session.user.id, plan.id), ...(isSupabaseConfigured ? [] : [saveUserSessions(session.user.id, isSupabaseConfigured ? nextSessions.filter((entry, index) => JSON.stringify(entry) !== JSON.stringify(sessions[index])) : nextSessions)]), ...(!isSupabaseConfigured && plan.assignedTo && plan.ownerId === session.user.id ? [deleteLocalAssignedPlan(plan.id)] : [])]);
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
    if (plan.building) {
      setMode('building');
      return;
    }
    const mostRecentSession = sessionHistory.filter((session) => session.planId === plan.id).sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
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

  async function startSession(day: TrainingDay, plan: TrainingPlan | null = selectedPlan, sessionHistory: TrainingSession[] = sessions) {
    if (!workoutScope || !plan || confirmingSet.current) return;
    confirmingSet.current = true;
    try {
      const previous = await claimLocalWorkout(workoutScope);
      if (previous) {
        restoreWorkout(previous);
        if (previous.plan.id !== plan.id) Alert.alert('Wznowiono rozpoczęty trening', 'Najpierw zakończ poprzedni trening. Jego wyniki są zachowane.');
        return;
      }
      const values: Record<string, CompletedSet[]> = {};
      const targetDay: TrainingDay = { ...day, exercises: day.exercises.map((exercise) => {
        const targets = getExerciseTargets(plan, exercise, sessionHistory).setTargets;
        values[exercise.id] = targets.map((target) => ({ reps: target.suggestedReps ?? target.repsMin, weight: target.targetWeight,
          ...(exercise.metric === 'band' ? { bandColor: target.bandColor ?? exercise.bandColor, assistanceLevel: target.assistanceLevel ?? exercise.assistanceLevel ?? 'brak' } : {}) }));
        return { ...exercise, setTargets: targets };
      }) };
      const draft: WorkoutDraft = JSON.parse(JSON.stringify({ id: newWorkoutId(), startedAt: new Date().toISOString(),
        plan, day, targetDay, values, counts: {}, completed: [], skipped: [], edits: {} }));
      await recovery.save(draft);
      restoreWorkout(draft);
    } catch (error) { Alert.alert('Nie rozpoczęto treningu', error instanceof Error ? error.message : 'Sprawdź miejsce na urządzeniu.'); }
    finally { confirmingSet.current = false; }
  }

  function updateSet(exerciseId: string, index: number, key: keyof CompletedSet, value: string) {
    if (confirmingSet.current) return;
    if (key === 'bandColor' || key === 'assistanceLevel') {
      setSessionDraft((current) => ({
        ...current,
        [exerciseId]: (current[exerciseId] ?? []).map((set, setIndex) => setIndex === index ? { ...set, [key]: value } : set),
      }));
      return;
    }
    const parsed = Number(value.replace(',', '.'));
    if (value.trim() !== '' && !Number.isFinite(parsed)) return;
    setSessionDraft((current) => ({
      ...current,
      [exerciseId]: (current[exerciseId] ?? []).map((set, setIndex) => setIndex === index ? { ...set, [key]: value.trim() === '' ? 0 : parsed } : set),
    }));
  }

  async function markSetDone(exerciseId: string) {
    if (confirmingSet.current || !liveWorkout) return;
    const sets = sessionDraft[exerciseId] ?? [];
    const setIndex = completedSetCounts[exerciseId] ?? 0;
    const currentSet = sets[setIndex];
    const metric = selectedDay?.exercises.find((exercise) => exercise.id === exerciseId)?.metric ?? 'load';
    if (!currentSet || !Number.isFinite(currentSet.reps) || (metric !== 'distance' && !Number.isInteger(currentSet.reps)) || currentSet.reps < 1 || !Number.isFinite(currentSet.weight) || currentSet.weight < 0) {
      Alert.alert('Sprawdź serię', metric === 'time' ? 'Czas musi wynosić co najmniej 1 sekundę.' : metric === 'distance' ? 'Dystans musi wynosić co najmniej 1 metr, a ciężar nie może być ujemny.' : metric === 'machine' ? 'Liczba powtórzeń i ciężar maszyny w kg muszą być prawidłowe.' : metric === 'band' ? 'Liczba powtórzeń i opór gumy muszą być prawidłowe.' : 'Powtórzenia muszą wynosić co najmniej 1, a ciężar nie może być ujemny.');
      return;
    }
    const editContext = setEditContexts[exerciseId];
    const nextCount = editContext?.resumeIndex ?? setIndex + 1;
    const nextCompleted = editContext
      ? editContext.wasExerciseComplete ? [...new Set([...completedExerciseIds, exerciseId])] : completedExerciseIds
      : nextCount >= sets.length ? [...new Set([...completedExerciseIds, exerciseId])] : completedExerciseIds;
    const nextSkipped = editContext?.wasExerciseSkipped ? [...new Set([...skippedExerciseIds, exerciseId])] : skippedExerciseIds;
    const nextEdits = { ...setEditContexts }; delete nextEdits[exerciseId];
    const nextCounts = { ...completedSetCounts, [exerciseId]: nextCount };
    confirmingSet.current = true; setSaving(true);
    try {
      await recovery.save({ ...liveWorkout, counts: nextCounts, completed: nextCompleted, skipped: nextSkipped, edits: nextEdits });
      setCompletedSetCounts(nextCounts); setCompletedExerciseIds(nextCompleted); setSkippedExerciseIds(nextSkipped); setSetEditContexts(nextEdits);
    } catch (error) { Alert.alert('Seria nie została zatwierdzona', error instanceof Error ? error.message : 'Nie zapisano na urządzeniu.'); }
    finally { confirmingSet.current = false; setSaving(false); }
  }

  function editSingleSet(exerciseId: string, setIndex: number) {
    const previousContext = setEditContexts[exerciseId];
    const wasExerciseComplete = previousContext?.wasExerciseComplete ?? completedExerciseIds.includes(exerciseId);
    const wasExerciseSkipped = previousContext?.wasExerciseSkipped ?? skippedExerciseIds.includes(exerciseId);
    const resumeIndex = previousContext?.resumeIndex ?? completedSetCounts[exerciseId] ?? 0;
    setSetEditContexts((current) => ({ ...current, [exerciseId]: { resumeIndex, wasExerciseComplete, wasExerciseSkipped } }));
    setCompletedSetCounts((current) => ({ ...current, [exerciseId]: setIndex }));
    setCompletedExerciseIds((current) => current.filter((id) => id !== exerciseId));
    setSkippedExerciseIds((current) => current.filter((id) => id !== exerciseId));
  }

  function skipExercise(exerciseId: string) {
    const editContext = setEditContexts[exerciseId];
    const savedSetCount = editContext?.resumeIndex ?? completedSetCounts[exerciseId] ?? 0;
    setCompletedSetCounts((current) => ({ ...current, [exerciseId]: savedSetCount }));
    setSetEditContexts((current) => { const next = { ...current }; delete next[exerciseId]; return next; });
    setCompletedExerciseIds((current) => current.filter((id) => id !== exerciseId));
    setSkippedExerciseIds((current) => current.includes(exerciseId) ? current : [...current, exerciseId]);
  }

  function resumeSkippedExercise(exerciseId: string) {
    setSkippedExerciseIds((current) => current.filter((id) => id !== exerciseId));
    // Po edycji ostatniej serii nie pokazujemy pustego formularza kolejnej serii.
    if ((completedSetCounts[exerciseId] ?? 0) >= (sessionDraft[exerciseId]?.length ?? 0)) {
      setCompletedExerciseIds((current) => current.includes(exerciseId) ? current : [...current, exerciseId]);
    }
  }

  async function openExerciseVideo(url: string) {
    try { await Linking.openURL(url); }
    catch { Alert.alert('Nie udało się otworzyć filmu', 'Sprawdź, czy link do YouTube jest poprawny.'); }
  }

  function toggleExerciseGuide(exerciseId: string) {
    setExpandedGuideIds((current) => current.includes(exerciseId) ? current.filter((id) => id !== exerciseId) : [...current, exerciseId]);
  }

  async function finishSession() {
    if (saving || !selectedPlan || !selectedDay || !liveWorkout) return;
    const processedExerciseIds = new Set([...completedExerciseIds, ...skippedExerciseIds]);
    if (selectedDay.exercises.some((exercise) => !processedExerciseIds.has(exercise.id))) {
      Alert.alert('Dokończ trening', 'Oznacz ćwiczenie jako gotowe albo pomiń je, aby zapisać trening.'); return;
    }
    const done: CompletedExercise[] = selectedDay.exercises.map((exercise) => {
      const wasSkipped = skippedExerciseIds.includes(exercise.id);
      const savedSetCount = completedSetCounts[exercise.id] ?? 0;
      return {
        exerciseId: exercise.id,
        name: exercise.name,
        metric: exercise.metric ?? 'load',
        sets: (sessionDraft[exercise.id] ?? []).slice(0, savedSetCount),
        ...(wasSkipped ? { skipped: true } : {}),
      };
    });
    if (done.some((exercise) => exercise.sets.some((set) => !Number.isFinite(set.reps) || ((exercise.metric ?? 'load') !== 'distance' && !Number.isInteger(set.reps)) || set.reps < 1 || !Number.isFinite(set.weight) || set.weight < 0))) {
      Alert.alert('Sprawdź wykonane serie', 'W każdej zapisanej serii podaj prawidłowy czas lub liczbę powtórzeń oraz nieujemną wartość ciężaru/oporu.'); return;
    }
    const completed: TrainingSession = { id: liveWorkout.id, planId: liveWorkout.plan.id, dayId: liveWorkout.day.id, startedAt: liveWorkout.startedAt, completedAt: new Date().toISOString(), exercises: done, planSnapshot: liveWorkout.plan, targetDay: liveWorkout.targetDay };
    const next = [completed, ...sessions];
    setSaving(true);
    try {
      if (!dataOwnerId) throw new Error('Brak aktywnego użytkownika.');
      await recovery.finish(liveWorkout, completed);
      setActiveWorkout(null);
      setSessions(next);
      setCompletedSession(completed);
      setMode('summary');
    } catch (error) { Alert.alert('Nie zapisano treningu', error instanceof Error ? error.message : 'Spróbuj ponownie za chwilę.'); }
    finally { setSaving(false); }
  }

  async function skipTrainingDay() {
    if (saving || !selectedPlan || !selectedDay || !liveWorkout) return;
    if (Object.values(completedSetCounts).some((count) => count > 0) || Object.keys(setEditContexts).length) {
      Alert.alert('Zachowaj wykonane serie', 'Aby zakończyć dzień częściowo, pomiń pozostałe ćwiczenia i zapisz trening. Pominięcie całego dnia jest dostępne przed pierwszą serią.'); return;
    }
    const skipped: TrainingSession = { id: liveWorkout.id, planId: selectedPlan.id, dayId: selectedDay.id, startedAt: liveWorkout.startedAt, completedAt: new Date().toISOString(), exercises: [], skipped: true, planSnapshot: liveWorkout.plan, targetDay: liveWorkout.targetDay };
    const next = [skipped, ...sessions];
    setSaving(true);
    try {
      if (!dataOwnerId) throw new Error('Brak aktywnego użytkownika.');
      await recovery.finish(liveWorkout, skipped);
      setActiveWorkout(null);
      setSessions(next);
      setConfirmSkipDay(false);
      const skippedDayName = selectedDay.name;
      if (selectedPlan.building) {
        setCompletedSession(skipped);
        setMode('summary');
        return;
      }
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

  const hasUnsavedChanges = (mode === 'session' && (Boolean(recovery.error) || recovery.status?.kind === 'saving' || recovery.status?.kind === 'storage-error'))
    || (mode === 'create' && (Boolean(planName.trim()) || draftDays.some((day) => day.exercises.length > 0)))
    || (mode === 'report' && Object.values(reportComments).some((comment) => comment.trim()));

  const confirmLeave = useCallback((leave: () => void) => {
    if (saving) return;
    if (!hasUnsavedChanges) { leave(); return; }
    const message = 'Masz niezapisane zmiany. Wyjście spowoduje ich utratę. Czy wyjść?';
    if (Platform.OS === 'web') {
      if (window.confirm(message)) leave();
    } else Alert.alert('Niezapisane zmiany', message, [
      { text: 'Zostań', style: 'cancel' }, { text: 'Wyjdź', style: 'destructive', onPress: leave },
    ]);
  }, [hasUnsavedChanges, saving]);

  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android' || mode === 'list') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmLeave(() => setMode(mode === 'report' ? reportReturnMode : 'list'));
      return true;
    });
    return () => subscription.remove();
  }, [confirmLeave, mode, reportReturnMode]));

  useEffect(() => {
    if (Platform.OS !== 'web' || !hasUnsavedChanges) return;
    const handleUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [hasUnsavedChanges]);

  function back() {
    confirmLeave(() => setMode(mode === 'report' ? reportReturnMode : 'list'));
  }

  function goHome() {
    confirmLeave(() => { setMode('list'); router.replace('/'); });
  }

  return <SafeAreaView edges={['top']} style={s.safe}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.flex}>
      <ScrollView automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} contentContainerStyle={s.content} keyboardDismissMode="none" keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
        <View style={s.top}><Pressable accessibilityRole="button" accessibilityLabel="Strona główna" onPress={goHome} style={s.brandHome}><View style={s.mark}><Text style={s.markText}>P</Text></View><Text style={s.brand}>PROGRES</Text></Pressable><Text style={s.pill}>{actingForTraineeId ? 'TRENING PODOPIECZNEGO' : 'PLANY'}</Text></View>
        <Pressable onPress={mode === 'list' ? () => actingForTraineeId ? router.back() : router.replace('/') : back} style={s.back}><Text style={s.backText}>{mode === 'list' ? '‹  Strona główna' : '‹  Wróć'}</Text></Pressable>

        {workoutScope && (recovery.status || recovery.error) && <View accessibilityLiveRegion="polite" style={s.workoutSaveBanner}>
          <Text style={s.workoutSaveText}>{recovery.error ?? recovery.status?.message}</Text>
          <View style={s.confirmActions}>
            <Pressable accessibilityRole="button" onPress={() => { if (liveWorkout) void recovery.save(liveWorkout).catch(() => {}); void syncWorkoutScope(workoutScope); void recovery.reload().catch(() => {}); }} style={s.cancelButton}><Text style={s.cancelButtonText}>PONÓW / ODŚWIEŻ</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={exportWorkoutCopies} style={s.cancelButton}><Text style={s.cancelButtonText}>EKSPORT KOPII</Text></Pressable>
          </View>
        </View>}
        {(recovery.status?.remote || recovery.remote) && <View style={s.workoutSaveBanner}>
          <Text style={s.workoutSaveTitle}>Trening dostępny w chmurze</Text>
          <Text style={s.workoutSaveText}>Przejęcie zatrzyma wysyłanie zmian ze starego urządzenia. Zachowamy różniące się lokalne wyniki w kopii.</Text>
          <Pressable accessibilityRole="button" onPress={adoptCloudWorkout} style={s.primary}><Text style={s.primaryText}>WZNÓW Z CHMURY / ROZWIĄŻ KONFLIKT</Text></Pressable>
        </View>}
        {mode === 'list' && recovery.saved && <View style={s.workoutSaveBanner}>
          <Text style={s.workoutSaveTitle}>Wznów rozpoczęty trening</Text>
          <Text style={s.workoutSaveText}>{recovery.saved.plan.name} · {recovery.saved.day.name} · {Object.entries(recovery.saved.counts).reduce((sum, [id, count]) => sum + (recovery.saved?.edits[id]?.resumeIndex ?? count), 0)} zapisanych serii</Text>
          <Pressable accessibilityRole="button" onPress={resumeWorkout} style={s.primary}><Text style={s.primaryText}>KONTYNUUJ TRENING</Text></Pressable>
        </View>}

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
            const isBuilding = Boolean(plan.building);
            const canManagePlan = !actingForTraineeId && (!plan.ownerId || plan.ownerId === session?.user.id);
            const assignedTrainee = linkedTrainees.find((trainee) => trainee.id === plan.assignedTo);
            return <View key={plan.id} style={s.planCard}>
              <Pressable onPress={() => isCompleted ? openCompletedPlan(plan) : openPlan(plan)} style={({ pressed }) => [s.planOpen, pressed && s.pressed]}>
                <View style={s.planHead}><Text style={s.planName}>{plan.name}</Text><Text style={s.arrow}>↗</Text></View>
                <Text style={s.planMeta}>{isCompleted ? `Zakończono ${new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(plan.completedAt!))} · ${planSessions.length} treningów` : `${plan.days.length} ${plan.days.length === 1 ? 'dzień' : 'dni'} treningowe · ${plan.days.reduce((sum, day) => sum + day.exercises.length, 0)} ćwiczeń · ${planSessions.length} treningów${isBuilding ? ' · W BUDOWIE' : ''}`}</Text>
                {plan.assignedTo && <Text style={s.assignmentStatus}>Plan przypisany podopiecznemu{assignedTrainee ? `: ${assignedTrainee.full_name}` : ''}</Text>}
                <View style={s.dayChips}>{plan.days.map((day) => <Text key={day.id} style={s.chip}>{day.name}</Text>)}</View>
                {isCompleted ? <Text style={s.planAction}>ZOBACZ HISTORIĘ CAŁEGO PLANU  ↗</Text> : isBuilding ? <Text style={s.planAction}>DODAJ DZIEŃ LUB ZATWIERDŹ PLAN  ↗</Text> : <Text style={s.planAction}>REALIZUJ PLAN  ↗</Text>}
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => { setSelectedPlan(plan); setMode('preview'); }} style={s.savedPlanPreviewButton}>
                <Text style={s.savedPlanPreviewButtonText}>PODGLĄD CAŁEGO PLANU</Text>
              </Pressable>
              {actingForTraineeId ? <View style={s.planActions}><Text style={s.assignmentStatus}>TRENER UZUPEŁNIA TRENING ZA PODOPIECZNEGO</Text></View> : isBuilding && canManagePlan ? <View style={s.planActions}><Text style={s.assignmentStatus}>PLAN W BUDOWIE</Text><Pressable onPress={() => { setPendingDeletePlanId(plan.id); setPendingCompletePlanId(null); }} style={s.deleteButton}><Text style={s.deleteButtonText}>USUŃ</Text></Pressable></View> : !canManagePlan && plan.assignedTo === session?.user.id && !isCompleted ? <View style={s.planActions}><Text style={s.assignmentStatus}>PLANEM ZARZĄDZA TWÓJ TRENER</Text></View> : !canManagePlan ? <View style={s.planActions}><Text style={s.assignmentStatus}>PLAN PRZYPISANY PRZEZ TRENERA</Text></View> : isCompleted ? (
                <View style={s.planActions}><Pressable onPress={() => setPendingDeletePlanId(plan.id)} style={s.deleteButton}><Text style={s.deleteButtonText}>USUŃ PLAN</Text></Pressable></View>
              ) : (
                <View style={s.planActions}>
                  <Pressable onPress={() => startEditPlan(plan)} style={s.editPlanButton}><Text style={s.editPlanButtonText}>EDYTUJ</Text></Pressable>
                  <Pressable onPress={() => { setPendingDeletePlanId(plan.id); setPendingCompletePlanId(null); }} style={s.deleteButton}><Text style={s.deleteButtonText}>USUŃ</Text></Pressable>
                  <Pressable onPress={() => { setPendingCompletePlanId(plan.id); setPendingDeletePlanId(null); }} style={s.completeButton}><Text style={s.completeButtonText}>ZAKOŃCZ PLAN</Text></Pressable>
                </View>
              )}
              {!isBuilding && currentProfile?.role === 'trainee' && !actingForTraineeId && linkedTrainees.length > 0 && unreportedMicrocycle && <Pressable accessibilityRole="button" onPress={() => { setSelectedPlan(plan); setReportSessions(unreportedMicrocycle); setReportComments({}); setReportReturnMode('list'); setMode('report'); }} style={s.reportListButton}><Text style={s.reportListButtonText}>RAPORT DO WYSŁANIA · MIKROCYKL GOTOWY</Text><Text style={s.reportListHint}>Uzupełnij komentarze i wyślij trenerowi  ↗</Text></Pressable>}
              {pendingDeletePlanId === plan.id && <View style={s.confirmBox}><Text style={s.confirmText}>Usunięcie planu skasuje też zapisaną historię jego treningów. Czy usunąć?</Text><View style={s.confirmActions}><Pressable onPress={() => setPendingDeletePlanId(null)} style={s.cancelButton}><Text style={s.cancelButtonText}>ANULUJ</Text></Pressable><Pressable disabled={saving} onPress={() => deletePlan(plan)} style={s.confirmDeleteButton}><Text style={s.confirmDeleteText}>{saving ? 'USUWAM…' : 'USUŃ PLAN'}</Text></Pressable></View></View>}
              {pendingCompletePlanId === plan.id && <View style={s.confirmBox}><Text style={s.confirmText}>Plan zostanie przeniesiony do zakończonych. Jego historia treningów pozostanie dostępna do wglądu.</Text><View style={s.confirmActions}><Pressable onPress={() => setPendingCompletePlanId(null)} style={s.cancelButton}><Text style={s.cancelButtonText}>ANULUJ</Text></Pressable><Pressable disabled={saving} onPress={() => finishPlan(plan)} style={s.confirmCompleteButton}><Text style={s.confirmCompleteText}>{saving ? 'ZAPISUJĘ…' : 'ZAKOŃCZ PLAN'}</Text></Pressable></View></View>}
            </View>;
          })}</View>}
          {planListTab === 'active' && !actingForTraineeId && <Pressable disabled={!ready} onPress={startCreate} style={({ pressed }) => [s.primary, pressed && s.pressed, !ready && s.disabled]}><Text style={s.primaryText}>＋  UTWÓRZ NOWY PLAN</Text></Pressable>}
        </>}

        {mode === 'preview' && selectedPlan && <>
          <Text style={s.eyebrow}>PODGLĄD ZAPISANEGO PLANU</Text>
          <Text style={s.title}>{selectedPlan.name}</Text>
          <Text style={s.subtitle}>{selectedPlan.days.length} {selectedPlan.days.length === 1 ? 'dzień treningowy' : 'dni treningowe'} · {selectedPlan.days.reduce((sum, day) => sum + day.exercises.length, 0)} ćwiczeń{selectedPlan.building ? ' · plan w budowie' : ''}</Text>
          {selectedPlan.days.map((day, dayIndex) => <View key={day.id} style={s.savedPreviewDay}>
            <View style={s.planHead}><Text style={s.savedPreviewDayTitle}>{day.name || `Dzień ${dayIndex + 1}`}</Text><Text style={s.count}>{day.exercises.length} ĆW.</Text></View>
            {day.exercises.length === 0 ? <Text style={s.exerciseMeta}>Brak dodanych ćwiczeń.</Text> : day.exercises.map((exercise, exerciseIndex) => {
              const targets = exercise.setTargets?.length
                ? exercise.setTargets
                : Array.from({ length: exercise.sets }, () => ({ repsMin: exercise.repsMin, repsMax: exercise.repsMax, targetWeight: exercise.targetWeight }));
              const progression = formatProgression(exercise);
              return <View key={exercise.id} style={s.savedPreviewExercise}>
                <View style={s.planHead}><Text style={s.savedPreviewExerciseTitle}>{exerciseIndex + 1}. {exercise.name}</Text><Text style={s.count}>{targets.length} SER.</Text></View>
                {targets.map((target, setIndex) => <View key={`${exercise.id}-set-${setIndex}`} style={s.savedPreviewSet}>
                  <Text style={s.savedPreviewSetLabel}>SERIA {setIndex + 1}</Text><Text style={s.savedPreviewSetValue}>{formatPlannedSet(exercise, target)}</Text>
                </View>)}
                {progression && <Text style={s.savedPreviewProgression}>{progression}</Text>}
                {exercise.metric === 'distance' && exercise.loadProgression && exercise.loadProgression.amount > 0 && <Text style={s.savedPreviewProgression}>Dodatkowa progresja ciężaru: +{exercise.loadProgression.amount}{exercise.loadProgression.type === 'percent' ? '%' : ' kg'}</Text>}
                {exercise.description?.trim() && <Text style={s.savedPreviewDescription}>{exercise.description}</Text>}
                {exercise.youtubeUrl?.trim() && <Pressable accessibilityRole="link" onPress={() => Linking.openURL(exercise.youtubeUrl!)} style={s.savedPreviewVideo}><Text style={s.youtubeLinkText}>OTWÓRZ FILM INSTRUKTAŻOWY ↗</Text></Pressable>}
              </View>;
            })}
          </View>)}
          <Pressable onPress={() => setMode('list')} style={s.primary}><Text style={s.primaryText}>WRÓĆ DO PLANÓW</Text></Pressable>
        </>}

        {mode === 'building' && selectedPlan?.building && <>
          <Text style={s.eyebrow}>PLAN W BUDOWIE</Text>
          <Text style={s.title}>{selectedPlan.name}</Text>
          <Text style={s.subtitle}>Treningi, które już zapisałeś, są zachowane. Dodaj kolejny dzień albo zatwierdź układ i kontynuuj plan.</Text>
          <View style={s.buildingStats}>
            <Text style={s.statNum}>{selectedPlan.days.length}</Text><Text style={s.statLabel}>DNI</Text>
            <View style={s.divider}/>
            <Text style={s.statNum}>{sessions.filter((entry) => entry.planId === selectedPlan.id).length}</Text><Text style={s.statLabel}>ZAPISANYCH TRENINGÓW</Text>
          </View>
          <View style={s.heading}><Text style={s.headingTitle}>Dotychczasowe dni</Text><Text style={s.count}>{selectedPlan.days.length.toString().padStart(2, '0')}</Text></View>
          <View style={s.list}>{selectedPlan.days.map((day, index) => {
            const daySessions = sessions.filter((entry) => entry.planId === selectedPlan.id && entry.dayId === day.id);
            return <View key={day.id} style={s.buildingDayCard}>
              <View style={s.planHead}><Text style={s.planName}>{day.name || `Dzień ${index + 1}`}</Text><Text style={s.count}>{daySessions.length} TRENINGÓW</Text></View>
              <Text style={s.exerciseMeta}>{day.exercises.map((exercise) => exercise.name).join(' · ') || 'Brak ćwiczeń'}</Text>
            </View>;
          })}</View>
          <Pressable accessibilityRole="button" disabled={saving || selectedPlan.days.length >= 7} onPress={() => startAddBuildingDay(selectedPlan)} style={[s.buildingAddButton, (saving || selectedPlan.days.length >= 7) && s.disabled]}>
            <Text style={s.buildingAddText}>{selectedPlan.days.length >= 7 ? 'PLAN MA JUŻ MAKSYMALNIE 7 DNI' : '＋  DODAJ KOLEJNY DZIEŃ TRENINGOWY'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => confirmBuildingPlan(selectedPlan)} style={[s.primary, saving && s.disabled]}>
            <Text style={s.primaryText}>{saving ? 'ZAPISUJĘ…' : 'ZATWIERDŹ PLAN I KONTYNUUJ'}</Text>
          </Pressable>
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
              const day = session.targetDay ?? session.planSnapshot?.days.find((item) => item.id === session.dayId) ?? selectedPlan.days.find((item) => item.id === session.dayId);
              const date = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(session.completedAt));
              const sessionSets = session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
              const volume = session.exercises.reduce((sum, exercise) => {
                if ((day?.exercises.find((item) => item.id === exercise.exerciseId)?.metric ?? 'load') !== 'load') return sum;
                return sum + exercise.sets.reduce((setSum, set) => setSum + set.weight * set.reps, 0);
              }, 0);
              return <View key={session.id} style={s.reviewSession}>
                <View style={s.reviewSessionHeader}><View style={s.reviewSessionNumber}><Text style={s.reviewSessionNumberText}>{String(sessionIndex + 1).padStart(2, '0')}</Text></View><View style={s.exerciseInfo}><Text style={s.planName}>{day?.name ?? 'Trening'}</Text><Text style={s.exerciseMeta}>{date} · {sessionSets} serii · {Math.round(volume).toLocaleString('pl-PL')} kg łącznie</Text></View></View>
                {session.exercises.map((completedExercise) => {
                  const exercise = day?.exercises.find((item) => item.id === completedExercise.exerciseId);
                  return <View key={completedExercise.exerciseId} style={s.reviewExercise}>
                    <Text style={s.exerciseName}>{completedExercise.name ?? exercise?.name ?? 'Ćwiczenie'}</Text>
                    {completedExercise.sets.map((set, setIndex) => <View key={`${completedExercise.exerciseId}-${setIndex}`} style={s.reviewSetRow}><Text style={s.summarySetLabel}>SERIA {setIndex + 1}</Text><Text style={s.summarySetValue}>{formatSetResult(set, completedExercise.metric ?? exercise?.metric ?? 'load', exercise)}</Text></View>)}
                  </View>;
                })}
              </View>;
            })}</View>}
          </>;
        })()}
        {mode === 'create' && <PlanBuilder
          editing={Boolean(editingPlanId)}
          buildingPlan={isBuildingPlanEditor}
          canImport={currentProfile?.role === 'trainer' && !actingForTraineeId && !isBuildingPlanEditor}
          onImportSpreadsheet={importSpreadsheet}
          onDownloadTemplate={downloadPlanTemplate}
          planName={planName}
          onPlanNameChange={setPlanName}
          canAssign={currentProfile?.role === 'trainer' && !actingForTraineeId && !isBuildingPlanEditor}
          canManageAtlas={currentProfile?.role === 'trainer' && !actingForTraineeId}
          trainees={linkedTrainees}
          assignedTo={draftAssignedTo}
          onAssignedToChange={setDraftAssignedTo}
          dayCount={dayCount}
          onDayCountChange={setDayCount}
          days={draftDays}
          catalog={exerciseCatalog}
          customExercises={[...new Map([
            ...plans.flatMap((plan) => plan.days.flatMap((day) => day.exercises.map((exercise) => [exercise.name.toLocaleLowerCase('pl-PL'), { name: exercise.name, category: exercise.category }] as const))),
            ...draftDays.flatMap((day) => day.exercises.map((exercise) => [exercise.name.toLocaleLowerCase('pl-PL'), { name: exercise.name, category: exercise.category }] as const)),
          ]).values()]}
          onDaysChange={setDraftDays}
          exerciseDrafts={exerciseDrafts}
          onExerciseDraftsChange={setExerciseDrafts}
          openExerciseForms={exerciseFormOpenDays}
          onOpenExerciseFormsChange={setExerciseFormOpenDays}
          editingExerciseIds={editingExerciseIds}
          saving={saving || recovery.status?.kind === 'conflict' || recovery.status?.kind === 'storage-error'}
          onMakeDays={makeDays}
          onAddDay={addDraftDay}
          onAddExercise={addExercise}
          onEditExercise={editDraftExercise}
          onRemoveExercise={removeDraftExercise}
          onSave={savePlan}
        />}
        {mode === 'summary' && selectedPlan && selectedDay && completedSession && (() => {
          const nextDayIndex = (selectedPlan.days.findIndex((day) => day.id === selectedDay.id) + 1) % selectedPlan.days.length;
          const nextDay = selectedPlan.days[nextDayIndex];
          const completedSets = completedSession.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
          const volume = completedSession.exercises.reduce((sum, exercise) => {
            if ((selectedDay.exercises.find((item) => item.id === exercise.exerciseId)?.metric ?? 'load') !== 'load') return sum;
            return sum + exercise.sets.reduce((exerciseSum, set) => exerciseSum + set.weight * set.reps, 0);
          }, 0);
          const completedAt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(completedSession.completedAt));
          return <>
            <Text style={s.eyebrow}>{completedSession.skipped ? 'DZIEŃ POMINIĘTY' : 'TRENING ZAPISANY'} · {selectedPlan.name}</Text>
            <Text style={s.title}>{completedSession.skipped ? 'Dzień zapisany.' : 'Dobra robota.'}</Text>
            <Text style={s.subtitle}>{completedSession.skipped ? `${selectedDay.name} oznaczony jako niewykonany · ${completedAt}` : `${selectedDay.name} · ${completedAt}`}</Text>
            {completedSession.skipped
              ? <View style={s.skippedSummary}><Text style={s.skippedSummaryTitle}>{selectedPlan.building ? 'Ten trening nie został wykonany.' : 'Ten dzień pozostaje w planie jako niewykonany.'}</Text><Text style={s.exerciseMeta}>{selectedPlan.building ? 'Plan nadal jest w budowie. Możesz wrócić do jego opcji.' : 'Przy następnym wejściu w plan otworzy się kolejny dzień treningowy.'}</Text></View>
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
                {item.skipped && <Text style={s.skippedExerciseStatus}>POMINIĘTE · ZAPISANO {item.sets.length} {item.sets.length === 1 ? 'SERIĘ' : 'SERII'}</Text>}
                {item.sets.map((set, index) => <View key={`${item.exerciseId}-${index}`} style={s.summarySetRow}><Text style={s.summarySetLabel}>SERIA {index + 1}</Text><Text style={s.summarySetValue}>{formatSetResult(set, item.metric ?? exercise?.metric ?? 'load', exercise)}</Text></View>)}
              </View>;
            })}
            </>}
            {!selectedPlan.building && nextDay && <View style={s.nextDayCard}><Text style={s.nextDayLabel}>NASTĘPNY TRENING W TYM PLANIE</Text><Text style={s.nextDayName}>{nextDay.name}</Text><Text style={s.exerciseMeta}>Przy kolejnym wejściu w plan od razu otworzy się ten dzień.</Text></View>}
            {selectedPlan.building && <View style={s.buildingNotice}>
              <Text style={s.buildingNoticeTitle}>Ten dzień jest już zapisany w planie.</Text>
              <Text style={s.exerciseMeta}>Plan pozostaje w budowie. Przy kolejnym wejściu wybierzesz, czy dodać dzień, czy zatwierdzić plan.</Text>
              <Pressable accessibilityRole="button" onPress={() => setMode('building')} style={s.buildingAddButton}><Text style={s.buildingAddText}>PRZEJDŹ DO PLANU W BUDOWIE  ↗</Text></Pressable>
            </View>}
            {!selectedPlan.building && currentProfile?.role === 'trainee' && !actingForTraineeId && linkedTrainees.length > 0 && (() => {
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
          saving={saving || recovery.status?.kind === 'conflict' || recovery.status?.kind === 'storage-error'}
          onCommentChange={(key, value) => setReportComments((current) => ({ ...current, [key]: value }))}
          onSend={sendTrainingReport}
          onCancel={() => setMode(reportReturnMode)}
        />}
        {mode === 'session' && selectedPlan && selectedDay && <TrainingSessionView targetDay={activeWorkout?.targetDay}
          plan={selectedPlan}
          day={selectedDay}
          sessions={sessions}
          reports={reports}
          showReportPrompt={!selectedPlan.building && currentProfile?.role === 'trainee' && !actingForTraineeId && linkedTrainees.length > 0}
          confirmSkip={confirmSkipDay}
          skippedNotice={skippedDayNotice}
          completedExerciseIds={completedExerciseIds}
          skippedExerciseIds={skippedExerciseIds}
          completedSetCounts={completedSetCounts}
          sessionDraft={sessionDraft}
          expandedGuideIds={expandedGuideIds}
          playingVideoExerciseId={playingVideoExerciseId}
          saving={saving || recovery.status?.kind === 'conflict' || recovery.status?.kind === 'storage-error'}
          onOpenReport={(cycle) => { setReportSessions(cycle); setReportComments({}); setReportReturnMode('session'); setMode('report'); }}
          onConfirmSkipChange={setConfirmSkipDay}
          onSkipDay={skipTrainingDay}
          onToggleGuide={toggleExerciseGuide}
          onToggleVideo={(id) => setPlayingVideoExerciseId((current) => current === id ? null : id)}
          onOpenVideo={openExerciseVideo}
          onUpdateSet={updateSet}
          onMarkSetDone={markSetDone}
          onSkipExercise={skipExercise}
          onResumeExercise={resumeSkippedExercise}
          onEditSet={editSingleSet}
          onFinish={finishSession}
        />}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}




// Remount all recovery/editor state when the account or coached trainee changes.
export default function PlansRoute() {
  const { session } = useAuth();
  const { traineeId } = useLocalSearchParams<{ traineeId?: string }>();
  return <PlansScreen key={`${session?.user.id ?? 'guest'}:${traineeId ?? 'self'}`}/>;
}
