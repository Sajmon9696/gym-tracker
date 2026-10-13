import Constants from 'expo-constants';
import { useMemo } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { planStyles as s } from '@/components/plans/plan-styles';
import { getExerciseGuide } from '@/lib/exercise-guides';
import { getExerciseTargets, getNextUnreportedMicrocycle } from '@/lib/training-progression';
import type { CompletedExercise, CompletedSet, PlannedExercise, TrainingPlan, TrainingReport, TrainingSession, TrainingDay } from '@/lib/plans';

type Props = {
  plan: TrainingPlan;
  day: TrainingDay;
  sessions: TrainingSession[];
  reports: TrainingReport[];
  showReportPrompt: boolean;
  confirmSkip: boolean;
  skippedNotice: string | null;
  completedExerciseIds: string[];
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
  onUpdateSet: (exerciseId: string, index: number, key: 'reps' | 'weight', value: string) => void;
  onMarkSetDone: (exerciseId: string) => void;
  onEditSet: (exerciseId: string, setIndex: number) => void;
  onFinish: () => void;
};

function findPreviousExercisePerformance(sessions: TrainingSession[], planId: string, exercise: PlannedExercise) {
  const normalizedName = exercise.name.trim().toLocaleLowerCase('pl-PL');
  const previous = sessions
    .filter((session) => session.planId === planId && !session.skipped)
    .flatMap((session) => {
      const result = session.exercises.find((item: CompletedExercise) =>
        item.exerciseId === exercise.id || item.name?.trim().toLocaleLowerCase('pl-PL') === normalizedName,
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
  const pendingExercises = props.day.exercises.filter((exercise) => !props.completedExerciseIds.includes(exercise.id));
  const activeIndex = props.day.exercises.length - pendingExercises.length;

  return <>
    <Text style={s.eyebrow}>TRENING W TOKU · {props.plan.name}</Text>
    <Text style={s.title}>{props.day.name}</Text>
    <Text style={s.subtitle}>Wpisuj po jednej serii. Zapisz ją, aby przejść do następnej. Wykonane ćwiczenia i serie możesz poprawić poniżej.</Text>
    {props.skippedNotice && <View style={s.skippedNotice}><Text style={s.skippedNoticeText}>{props.skippedNotice}</Text></View>}
    {reportCycle && <View style={s.reportSessionPrompt}>
      <Text style={s.reportSessionPromptText}>MIKROCYKL GOTOWY · RAPORT CZEKA NA WYSŁANIE</Text>
      <Pressable accessibilityRole="button" onPress={() => props.onOpenReport(reportCycle)} style={s.reportSessionButton}><Text style={s.reportSessionButtonText}>UZUPEŁNIJ RAPORT  ↗</Text></Pressable>
    </View>}
    {props.confirmSkip
      ? <View style={s.confirmBox}>
        <Text style={s.confirmText}>Ten dzień zostanie zapisany w planie jako niewykonany. Przy następnym wejściu przejdziesz do kolejnego dnia.</Text>
        <View style={s.confirmActions}>
          <Pressable disabled={props.saving} onPress={() => props.onConfirmSkipChange(false)} style={s.cancelButton}><Text style={s.cancelButtonText}>WRÓĆ DO TRENINGU</Text></Pressable>
          <Pressable disabled={props.saving} onPress={props.onSkipDay} style={s.skipConfirmButton}><Text style={s.skipConfirmButtonText}>{props.saving ? 'ZAPISUJĘ…' : 'POMIŃ DZIEŃ'}</Text></Pressable>
        </View>
      </View>
      : <Pressable accessibilityRole="button" onPress={() => props.onConfirmSkipChange(true)} style={s.skipDayButton}><Text style={s.skipDayButtonText}>POMIŃ TEN DZIEŃ  ↷</Text></Pressable>}

    <Text style={s.count}>ĆWICZENIE {Math.min(activeIndex + 1, props.day.exercises.length)} / {props.day.exercises.length}</Text>
    {pendingExercises.slice(0, 1).map((exercise) => {
      const targets = getExerciseTargets(props.plan, exercise, props.sessions);
      const exerciseSets = props.sessionDraft[exercise.id] ?? [];
      const currentSetIndex = props.completedSetCounts[exercise.id] ?? 0;
      const currentSetTarget = targets.setTargets[currentSetIndex];
      const previousPerformance = findPreviousExercisePerformance(props.sessions, props.plan.id, exercise);
      const videoId = getYouTubeVideoId(exercise.youtubeUrl);
      const referer = getYouTubeReferer();
      const canEmbedVideo = Platform.OS !== 'web' && videoId && referer;

      return <View key={exercise.id} style={s.dayCard}>
        <View style={s.sessionExerciseHeading}><Text style={s.exerciseName}>{exercise.name}</Text><Text style={s.exerciseMeta}>SERIA {currentSetIndex + 1} / {exerciseSets.length}</Text></View>
        <View accessibilityLabel="Dane z poprzedniego treningu" style={s.previousWorkout}>
          <View style={s.previousWorkoutHeading}>
            <Text style={s.previousWorkoutLabel}>POPRZEDNI TRENING</Text>
            {previousPerformance && <Text style={s.previousWorkoutDate}>{new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(new Date(previousPerformance.session.completedAt))}</Text>}
          </View>
          {previousPerformance
            ? <View style={s.previousSets}>{previousPerformance.result.sets.map((set, index) => <View key={`${previousPerformance.session.id}-${index}`} style={s.previousSet}><Text style={s.previousSetNumber}>S{index + 1}</Text><Text style={s.previousSetValue}>{set.weight} kg × {set.reps}</Text></View>)}</View>
            : <Text style={s.previousWorkoutEmpty}>Brak wcześniejszych zapisów tego ćwiczenia.</Text>}
        </View>
        {currentSetTarget && <View accessibilityLabel={`Cel serii ${currentSetIndex + 1}: od ${currentSetTarget.repsMin} do ${currentSetTarget.repsMax} powtórzeń, sugerowany ciężar ${currentSetTarget.targetWeight} kilogramów`} style={s.setTargetCard}>
          <View style={s.setTargetReps}><Text style={s.setTargetLabel}>CEL SERII {currentSetIndex + 1}</Text><Text style={s.setTargetValue}>{currentSetTarget.repsMin}–{currentSetTarget.repsMax}<Text style={s.setTargetUnit}> powt.</Text></Text></View>
          <View style={s.setTargetWeight}><Text style={s.setTargetLabel}>SUGEROWANY CIĘŻAR</Text><Text style={s.setTargetValue}>{currentSetTarget.targetWeight}<Text style={s.setTargetUnit}> kg</Text></Text></View>
        </View>}
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
            <Text style={s.summarySetLabel}>SERIA {index + 1} · EDYTUJ</Text><Text style={s.summarySetValue}>{set.weight} kg × {set.reps}</Text>
          </Pressable>)}
        </View>}
        <View style={s.setHeader}><Text style={s.setLabel}>SERIA</Text><Text style={s.setLabel}>POWT.</Text><Text style={s.setLabel}>CIĘŻAR · KG</Text></View>
        {exerciseSets.slice(currentSetIndex, currentSetIndex + 1).map((set) => <View key={`${exercise.id}-${currentSetIndex}`} style={s.setRow}>
          <Text style={s.setNumber}>{String(currentSetIndex + 1).padStart(2, '0')}</Text>
          <TextInput accessibilityLabel={`Powtórzenia, ${exercise.name}, seria ${currentSetIndex + 1}`} keyboardType="number-pad" onChangeText={(value) => props.onUpdateSet(exercise.id, currentSetIndex, 'reps', value)} selectTextOnFocus style={s.setInput} value={String(set.reps)} />
          <TextInput accessibilityLabel={`Ciężar, ${exercise.name}, seria ${currentSetIndex + 1}`} keyboardType="decimal-pad" onChangeText={(value) => props.onUpdateSet(exercise.id, currentSetIndex, 'weight', value)} selectTextOnFocus style={s.setInput} value={String(set.weight)} />
        </View>)}
        <Pressable accessibilityRole="button" onPress={() => props.onMarkSetDone(exercise.id)} style={s.exerciseDoneButton}><Text style={s.exerciseDoneButtonText}>{currentSetIndex + 1 === exerciseSets.length ? 'ZAPISZ SERIĘ I ZAKOŃCZ ĆWICZENIE' : 'ZAPISZ SERIĘ I PRZEJDŹ DALEJ'}</Text></Pressable>
      </View>;
    })}

    {props.completedExerciseIds.length === props.day.exercises.length && <View style={s.allDone}><Text style={s.allDoneTitle}>Wszystkie ćwiczenia gotowe ✓</Text><Text style={s.exerciseMeta}>Możesz jeszcze poprawić zapisane serie poniżej albo zapisać trening.</Text></View>}
    <View style={s.completedExercisesSection}>
      <View style={s.heading}><Text style={s.headingTitle}>Wykonane ćwiczenia</Text><Text style={s.count}>{props.completedExerciseIds.length}/{props.day.exercises.length}</Text></View>
      {props.completedExerciseIds.length === 0
        ? <Text style={s.exerciseMeta}>Oznaczone ćwiczenia pojawią się tutaj.</Text>
        : props.completedExerciseIds.map((exerciseId) => {
          const exercise = props.day.exercises.find((item) => item.id === exerciseId);
          if (!exercise) return null;
          return <View key={exercise.id} style={s.completedExerciseCard}>
            <View style={s.sessionExerciseHeading}><Text style={s.exerciseName}>{exercise.name}</Text><Text style={s.exerciseMeta}>GOTOWE ✓</Text></View>
            <Text style={s.exerciseMeta}>Wybierz serię, którą chcesz poprawić:</Text>
            {(props.sessionDraft[exercise.id] ?? []).map((set, index) => <Pressable key={`${exercise.id}-${index}`} accessibilityRole="button" accessibilityLabel={`Edytuj serię ${index + 1} ćwiczenia ${exercise.name}`} onPress={() => props.onEditSet(exercise.id, index)} style={s.summarySetRow}>
              <Text style={s.summarySetLabel}>SERIA {index + 1} · EDYTUJ</Text><Text style={s.summarySetValue}>{set.weight} kg × {set.reps}</Text>
            </Pressable>)}
          </View>;
        })}
    </View>
    <Pressable disabled={props.saving || props.completedExerciseIds.length !== props.day.exercises.length} onPress={props.onFinish} style={[s.primary, (props.saving || props.completedExerciseIds.length !== props.day.exercises.length) && s.disabled]}>
      <Text style={s.primaryText}>{props.saving ? 'ZAPISUJĘ…' : `ZAKOŃCZ I ZAPISZ TRENING · ${props.completedExerciseIds.length}/${props.day.exercises.length}`}</Text>
    </Pressable>
  </>;
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
  if (!hostUri) return null;
  const host = hostUri.replace(/^https?:\/\//, '').split('/')[0];
  const isLocalHost = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i.test(host);
  return `${isLocalHost ? 'http' : 'https'}://${host}/`;
}
