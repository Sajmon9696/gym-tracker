import Constants from 'expo-constants';
import { useMemo, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { WebView } from 'react-native-webview';

import { planStyles as s } from '@/components/plans/plan-styles';
import { progresTheme as c } from '@/constants/progres-theme';
import { getExerciseGuide } from '@/lib/exercise-guides';
import { formatSetResult, getExerciseTargets, getNextUnreportedMicrocycle } from '@/lib/training-progression';
import type { AssistanceLevel, CompletedExercise, CompletedSet, PlannedExercise, TrainingPlan, TrainingReport, TrainingSession, TrainingDay } from '@/lib/plans';

type Props = {
  targetDay?: TrainingDay;
  plan: TrainingPlan;
  day: TrainingDay;
  sessions: TrainingSession[];
  reports: TrainingReport[];
  showReportPrompt: boolean;
  confirmSkip: boolean;
  skippedNotice: string | null;
  completedExerciseIds: string[];
  skippedExerciseIds: string[];
  completedSetCounts: Record<string, number>;
  sessionDraft: Record<string, CompletedSet[]>;
  expandedGuideIds: string[];
  playingVideoExerciseId: string | null;
  saving: boolean;
  onOpenReport: (sessions: TrainingSession[]) => void;
  onConfirmSkipChange: (confirm: boolean) => void;
  onSkipDay: () => void;
  onToggleGuide: (exerciseId: string) => void;
  onToggleVideo: (exerciseId: string) => void;
  onOpenVideo: (url: string) => void;
  onUpdateSet: (exerciseId: string, index: number, key: keyof CompletedSet, value: string) => void;
  onMarkSetDone: (exerciseId: string) => void;
  onSkipExercise: (exerciseId: string) => void;
  onResumeExercise: (exerciseId: string) => void;
  onEditSet: (exerciseId: string, setIndex: number) => void;
  onFinish: () => void;
};

function findPreviousExercisePerformance(sessions: TrainingSession[], planId: string, exercise: PlannedExercise) {
  const normalizedName = exercise.name.trim().toLocaleLowerCase('pl-PL');
  const previous = sessions
    .filter((session) => session.planId === planId && !session.skipped)
    .flatMap((session) => {
      const result = session.exercises.find((item: CompletedExercise) =>
        (item.exerciseId === exercise.id || item.name?.trim().toLocaleLowerCase('pl-PL') === normalizedName)
        && (item.metric ?? 'load') === (exercise.metric ?? 'load'),
      );
      return result?.sets.length ? [{ session, result }] : [];
    })
    .sort((a, b) => b.session.completedAt.localeCompare(a.session.completedAt))[0];

  return previous ?? null;
}

export default function TrainingSessionView(props: Props) {
  const reportCycle = useMemo(
    () => props.showReportPrompt ? getNextUnreportedMicrocycle(props.plan, props.sessions, props.reports) : null,
    [props.showReportPrompt, props.plan, props.sessions, props.reports],
  );
  const processedExerciseIds = [...props.completedExerciseIds, ...props.skippedExerciseIds];
  const pendingExercises = props.day.exercises.filter((exercise) => !processedExerciseIds.includes(exercise.id));
  const activeIndex = props.day.exercises.length - pendingExercises.length;

  return <>
    <Text style={s.eyebrow}>TRENING W TOKU · {props.plan.name}</Text>
    <Text style={s.title}>{props.day.name}</Text>
    <Text style={s.subtitle}>Wpisuj po jednej serii i poprawiaj zapisane wyniki poniżej. Na koniec wybierz Zakończ i zapisz trening, aby zapisać go na koncie.</Text>
    {props.skippedNotice && <View style={s.skippedNotice}><Text style={s.skippedNoticeText}>{props.skippedNotice}</Text></View>}
    {reportCycle && <View style={s.reportSessionPrompt}>
      <Text style={s.reportSessionPromptText}>MIKROCYKL GOTOWY · RAPORT CZEKA NA WYSŁANIE</Text>
      <Pressable accessibilityRole="button" onPress={() => props.onOpenReport(reportCycle)} style={s.reportSessionButton}><Text style={s.reportSessionButtonText}>UZUPEŁNIJ RAPORT  ↗</Text></Pressable>
    </View>}
    {props.confirmSkip
      ? <View style={s.confirmBox}>
        <Text style={s.confirmText}>Ten dzień zostanie zapisany jako niewykonany. Wpisane w nim serie nie zostaną zachowane. Od razu przejdziesz do kolejnego dnia.</Text>
        <View style={s.confirmActions}>
          <Pressable disabled={props.saving} onPress={() => props.onConfirmSkipChange(false)} style={s.cancelButton}><Text style={s.cancelButtonText}>WRÓĆ DO TRENINGU</Text></Pressable>
          <Pressable disabled={props.saving} onPress={props.onSkipDay} style={s.skipConfirmButton}><Text style={s.skipConfirmButtonText}>{props.saving ? 'ZAPISUJĘ…' : 'POMIŃ DZIEŃ'}</Text></Pressable>
        </View>
      </View>
      : <Pressable accessibilityRole="button" onPress={() => props.onConfirmSkipChange(true)} style={s.skipDayButton}><Text style={s.skipDayButtonText}>POMIŃ TEN DZIEŃ  ↷</Text></Pressable>}

    <Text style={s.count}>ĆWICZENIE {Math.min(activeIndex + 1, props.day.exercises.length)} / {props.day.exercises.length}</Text>
    {pendingExercises.slice(0, 1).map((exercise) => {
      const targets = { setTargets: props.targetDay?.exercises.find((item) => item.id === exercise.id)?.setTargets ?? getExerciseTargets(props.plan, exercise, props.sessions).setTargets };
      const metric = exercise.metric ?? 'load';
      const exerciseSets = props.sessionDraft[exercise.id] ?? [];
      const currentSetIndex = props.completedSetCounts[exercise.id] ?? 0;
      const currentSetTarget = targets.setTargets[currentSetIndex];
      const previousPerformance = findPreviousExercisePerformance(props.sessions, props.plan.id, exercise);
      const reachedMachineTarget = metric === 'machine' && exerciseSets.slice(0, currentSetIndex).some((set, index) => set.reps >= (targets.setTargets[index]?.repsMax ?? exercise.repsMax));
      const videoId = getYouTubeVideoId(exercise.youtubeUrl);
      const referer = getYouTubeReferer();
      const canEmbedVideo = Platform.OS !== 'web' && videoId && referer;

      return <View key={exercise.id} style={s.dayCard}>
        <View style={s.sessionExerciseHeading}><Text style={s.exerciseName}>{exercise.name}</Text><Text style={s.exerciseMeta}>SERIA {currentSetIndex + 1} / {exerciseSets.length}</Text></View>
        <View accessibilityLabel="Dane z poprzedniego treningu" style={s.previousWorkout}>
          <View style={s.previousWorkoutHeading}>
            <Text style={s.previousWorkoutLabel}>POPRZEDNIA JEDNOSTKA · WYNIKI</Text>
            {previousPerformance && <Text style={s.previousWorkoutDate}>{new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(new Date(previousPerformance.session.completedAt))}</Text>}
          </View>
          {previousPerformance
            ? <View style={s.previousSets}>{previousPerformance.result.sets.map((set, index) => <View key={`${previousPerformance.session.id}-${index}`} style={s.previousSet}><Text style={s.previousSetNumber}>S{index + 1}</Text><Text style={s.previousSetValue}>{formatSetResult(set, previousPerformance.result.metric ?? metric, exercise)}</Text></View>)}</View>
            : <Text style={s.previousWorkoutEmpty}>Brak wcześniejszych zapisów tego ćwiczenia.</Text>}
        </View>
        {currentSetTarget && <View accessibilityLabel={`Cel serii ${currentSetIndex + 1}`} style={s.setTargetCard}>
          <View style={s.setTargetReps}><Text style={s.setTargetLabel}>CEL SERII {currentSetIndex + 1}</Text><Text style={s.setTargetValue}>{currentSetTarget.repsMin}–{currentSetTarget.repsMax}<Text style={s.setTargetUnit}>{metric === 'time' ? ' s' : metric === 'distance' ? ' m' : ' powt.'}</Text></Text><Text style={s.setTargetLabel}>PROPONOWANE: {currentSetTarget.suggestedReps ?? currentSetTarget.repsMin}{metric === 'time' ? ' s' : metric === 'distance' ? ' m' : ' powt.'}</Text></View>
          {metric !== 'time' && <View style={s.setTargetWeight}><Text style={s.setTargetLabel}>{metric === 'machine' ? 'CIĘŻAR MASZYNY' : metric === 'band' ? 'OPÓR / GUMA' : 'SUGEROWANY CIĘŻAR'}</Text><Text style={s.setTargetValue}>{metric === 'band' ? currentSetTarget.bandColor ?? exercise.bandColor ?? '—' : currentSetTarget.targetWeight}<Text style={s.setTargetUnit}>{metric === 'band' ? currentSetTarget.targetWeight ? ` kg · pomoc ${currentSetTarget.assistanceLevel ?? exercise.assistanceLevel ?? 'brak'}` : ` · pomoc ${currentSetTarget.assistanceLevel ?? exercise.assistanceLevel ?? 'brak'}` : ' kg'}</Text></Text></View>}
        </View>}
        {metric === 'machine' && currentSetTarget?.suggestAddMachineStack && <View style={s.buildingNotice}><Text style={s.buildingNoticeTitle}>DODAJ KOLEJNĄ SZTABKĘ</Text><Text style={s.exerciseMeta}>Poprzednio osiągnięto górny zakres. Na tym treningu dodaj sztabkę i wpisz nowy ciężar w kg.</Text></View>}
        {reachedMachineTarget && <View style={s.buildingNotice}><Text style={s.buildingNoticeTitle}>ZAKRES ZALICZONY</Text><Text style={s.exerciseMeta}>Dokończ ćwiczenie na tym ciężarze. Na następnym treningu dodaj kolejną sztabkę i wpisz jej ciężar w kg.</Text></View>}
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: props.expandedGuideIds.includes(exercise.id) }} onPress={() => props.onToggleGuide(exercise.id)} style={s.guideToggle}>
          <Text style={s.guideToggleText}>{props.expandedGuideIds.includes(exercise.id) ? 'UKRYJ OPIS ĆWICZENIA  −' : 'JAK WYKONAĆ ĆWICZENIE?  +'}</Text>
        </Pressable>
        {props.expandedGuideIds.includes(exercise.id) && <View style={s.guidePanel}><Text style={s.guideText}>{exercise.description?.trim() || getExerciseGuide(exercise.name)}</Text></View>}
        {exercise.youtubeUrl && <>
          <Pressable accessibilityRole="button" onPress={() => canEmbedVideo ? props.onToggleVideo(exercise.id) : props.onOpenVideo(exercise.youtubeUrl!)} style={s.youtubeLink}>
            <Text style={s.youtubeLinkText}>{canEmbedVideo ? props.playingVideoExerciseId === exercise.id ? 'UKRYJ FILM  −' : '▶  ODTWÓRZ FILM W APLIKACJI' : '▶  OTWÓRZ FILM NA YOUTUBE'}</Text>
          </Pressable>
          {canEmbedVideo && props.playingVideoExerciseId === exercise.id && <View style={s.youtubeVideoFrame}>
            <WebView source={{ uri: `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&origin=${encodeURIComponent(referer.replace(/\/$/, ''))}`, headers: { Referer: referer } }} style={s.youtubeWebView} javaScriptEnabled domStorageEnabled allowsFullscreenVideo allowsInlineMediaPlayback mediaPlaybackRequiresUserAction originWhitelist={['https://*']} />
          </View>}
        </>}
        {currentSetIndex > 0 && <View style={s.inProgressSets}>
          <Text style={s.inProgressSetsTitle}>Wykonane serie · wybierz jedną do poprawy</Text>
          {exerciseSets.slice(0, currentSetIndex).map((set, index) => <Pressable key={`${exercise.id}-${index}`} accessibilityRole="button" accessibilityLabel={`Popraw wykonaną serię ${index + 1}`} onPress={() => props.onEditSet(exercise.id, index)} style={s.summarySetRow}>
            <Text style={s.summarySetLabel}>SERIA {index + 1} · EDYTUJ</Text><Text style={s.summarySetValue}>{formatSetResult(set, metric, exercise)}</Text>
          </Pressable>)}
        </View>}
        <View style={s.setHeader}><Text style={s.setLabel}>SERIA</Text><Text style={s.setLabel}>{metric === 'time' ? 'CZAS · SEK.' : metric === 'distance' ? 'DYSTANS · M' : 'POWT.'}</Text>{metric !== 'time' && <Text style={s.setLabel}>{metric === 'band' ? 'OPÓR · KG' : 'CIĘŻAR · KG'}</Text>}</View>
        {exerciseSets.slice(currentSetIndex, currentSetIndex + 1).map((set) => <View key={`${exercise.id}-${currentSetIndex}`} style={s.setRow}>
          <Text style={s.setNumber}>{String(currentSetIndex + 1).padStart(2, '0')}</Text>
          <SessionNumberInput accessibilityLabel={metric === 'time' ? `Czas w sekundach, ${exercise.name}, seria ${currentSetIndex + 1}` : metric === 'distance' ? `Dystans w metrach, ${exercise.name}, seria ${currentSetIndex + 1}` : `Powtórzenia, ${exercise.name}, seria ${currentSetIndex + 1}`} keyboardType={metric === 'distance' ? 'decimal-pad' : 'number-pad'} onChangeText={(value) => props.onUpdateSet(exercise.id, currentSetIndex, 'reps', value)} selectTextOnFocus style={s.setInput} value={set.reps} />
          {metric !== 'time' && <SessionNumberInput accessibilityLabel={metric === 'band' ? `Opór gumy w kilogramach, ${exercise.name}, seria ${currentSetIndex + 1}` : `Ciężar w kilogramach, ${exercise.name}, seria ${currentSetIndex + 1}`} keyboardType="decimal-pad" onChangeText={(value) => props.onUpdateSet(exercise.id, currentSetIndex, 'weight', value)} selectTextOnFocus style={s.setInput} value={set.weight} />}
        </View>)}
        {metric === 'band' && exerciseSets.slice(currentSetIndex, currentSetIndex + 1).map((set) => <View key={`band-${exercise.id}-${currentSetIndex}`} style={s.bandSetDetails}>
          <TextInput accessibilityLabel="Kolor użytej gumy" onChangeText={(value) => props.onUpdateSet(exercise.id, currentSetIndex, 'bandColor', value)} placeholder="Kolor gumy" placeholderTextColor={c.muted} style={s.bandColorInput} value={set.bandColor ?? exercise.bandColor ?? ''} />
          <Text style={s.bandHelpLabel}>POMOC</Text>
          {(['duża', 'średnia', 'mała', 'brak'] as AssistanceLevel[]).map((level) => <Pressable key={level} accessibilityRole="button" onPress={() => props.onUpdateSet(exercise.id, currentSetIndex, 'assistanceLevel', level)} style={[s.bandHelpChoice, (set.assistanceLevel ?? exercise.assistanceLevel ?? 'brak') === level && s.bandHelpChoiceSelected]}><Text style={[s.bandHelpText, (set.assistanceLevel ?? exercise.assistanceLevel ?? 'brak') === level && s.bandHelpTextSelected]}>{level}</Text></Pressable>)}
        </View>)}
        <Pressable accessibilityRole="button" onPress={() => props.onMarkSetDone(exercise.id)} style={s.exerciseDoneButton}><Text style={s.exerciseDoneButtonText}>{currentSetIndex + 1 === exerciseSets.length ? 'ZAPISZ SERIĘ I ZAKOŃCZ ĆWICZENIE' : 'ZAPISZ SERIĘ I PRZEJDŹ DALEJ'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={props.saving} onPress={() => props.onSkipExercise(exercise.id)} style={s.skipExerciseButton}><Text style={s.skipExerciseButtonText}>POMIŃ TO ĆWICZENIE</Text></Pressable>
      </View>;
    })}

    {processedExerciseIds.length === props.day.exercises.length && <View style={s.allDone}><Text style={s.allDoneTitle}>Ćwiczenia rozliczone ✓</Text><Text style={s.exerciseMeta}>Zapisane serie możesz poprawić poniżej. Pominięte ćwiczenia pozostaną oznaczone w podsumowaniu.</Text></View>}
    <View style={s.completedExercisesSection}>
      <View style={s.heading}><Text style={s.headingTitle}>Zapisane ćwiczenia</Text><Text style={s.count}>{processedExerciseIds.length}/{props.day.exercises.length}</Text></View>
      {processedExerciseIds.length === 0
        ? <Text style={s.exerciseMeta}>Wykonane lub pominięte ćwiczenia pojawią się tutaj.</Text>
        : props.day.exercises.filter((exercise) => processedExerciseIds.includes(exercise.id)).map((exercise) => {
          const exerciseId = exercise.id;
          const metric = exercise.metric ?? 'load';
          const isSkipped = props.skippedExerciseIds.includes(exerciseId);
          const plannedTargets = (props.targetDay?.exercises.find((item) => item.id === exercise.id)?.setTargets ?? getExerciseTargets(props.plan, exercise, props.sessions).setTargets);
          const reachedMachineTarget = metric === 'machine' && (props.sessionDraft[exerciseId] ?? []).slice(0, props.completedSetCounts[exerciseId] ?? 0).some((set, index) => set.reps >= (plannedTargets[index]?.repsMax ?? exercise.repsMax));
          return <View key={exercise.id} style={s.completedExerciseCard}>
            <View style={s.sessionExerciseHeading}><Text style={s.exerciseName}>{exercise.name}</Text><Text style={isSkipped ? s.skippedExerciseStatus : s.exerciseMeta}>{isSkipped ? 'POMINIĘTE ↷' : 'GOTOWE ✓'}</Text></View>
            {reachedMachineTarget && <View style={s.buildingNotice}><Text style={s.buildingNoticeTitle}>ZAKRES ZALICZONY</Text><Text style={s.exerciseMeta}>Na następnym treningu dodaj kolejną sztabkę i wpisz jej ciężar w kg.</Text></View>}
            {isSkipped && <Pressable accessibilityRole="button" disabled={props.saving} onPress={() => props.onResumeExercise(exerciseId)} style={s.resumeExerciseButton}><Text style={s.resumeExerciseButtonText}>WZNÓW ĆWICZENIE</Text></Pressable>}
            {(props.sessionDraft[exercise.id] ?? []).slice(0, props.completedSetCounts[exerciseId] ?? 0).length > 0 && <Text style={s.exerciseMeta}>Wykonane serie · wybierz jedną, aby ją poprawić:</Text>}
            {(props.sessionDraft[exercise.id] ?? []).slice(0, props.completedSetCounts[exerciseId] ?? 0).map((set, index) => <Pressable key={`${exercise.id}-${index}`} accessibilityRole="button" accessibilityLabel={`Edytuj serię ${index + 1} ćwiczenia ${exercise.name}`} onPress={() => props.onEditSet(exercise.id, index)} style={s.summarySetRow}>
              <Text style={s.summarySetLabel}>SERIA {index + 1} · EDYTUJ</Text><Text style={s.summarySetValue}>{formatSetResult(set, metric, exercise)}</Text>
            </Pressable>)}
            {isSkipped && (props.completedSetCounts[exerciseId] ?? 0) === 0 && <Text style={s.exerciseMeta}>Pominięto bez zapisywania serii.</Text>}
          </View>;
        })}
    </View>
    <Pressable disabled={props.saving || processedExerciseIds.length !== props.day.exercises.length} onPress={props.onFinish} style={[s.primary, (props.saving || processedExerciseIds.length !== props.day.exercises.length) && s.disabled]}>
      <Text style={s.primaryText}>{props.saving ? 'ZAPISUJĘ…' : `ZAKOŃCZ I ZAPISZ TRENING · ${processedExerciseIds.length}/${props.day.exercises.length}`}</Text>
    </Pressable>
  </>;
}

/** W trakcie pisania zachowujemy przecinek i puste pole; model otrzymuje liczbę. */
function SessionNumberInput({ value, onChangeText, ...props }: Omit<TextInputProps, 'value'> & { value: number }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  return <TextInput {...props} value={focused ? text : String(value)}
    onFocus={() => { setText(String(value)); setFocused(true); }}
    onBlur={() => setFocused(false)}
    onChangeText={(next) => { setText(next); onChangeText?.(next); }} />;
}

function getYouTubeVideoId(link?: string) {
  if (!link) return null;
  try {
    const url = new URL(link);
    const host = url.hostname.toLowerCase();
    const id = host === 'youtu.be'
      ? url.pathname.split('/').filter(Boolean)[0]
      : url.searchParams.get('v') ?? url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
    return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
  } catch { return null; }
}

function getYouTubeReferer() {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return 'https://sajmon96-gym-tracker.expo.app/';
  const host = hostUri.replace(/^https?:\/\//, '').split('/')[0];
  const isLocalHost = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i.test(host);
  return `${isLocalHost ? 'http' : 'https'}://${host}/`;
}
