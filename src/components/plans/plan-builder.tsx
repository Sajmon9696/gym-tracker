import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { router } from 'expo-router';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { progresTheme as c } from '@/constants/progres-theme';
import type { LocalProfile } from '@/lib/local-accounts';
import type { AssistanceLevel, ExerciseMetric, PlannedExercise, ProgressionType, TrainingDay } from '@/lib/plans';
import GoogleSheetsImporter from '@/components/plans/google-sheets-importer';
import { EXERCISE_CATEGORIES, type CatalogExercise, type ExerciseCategory } from '@/lib/exercise-catalog';

export type ExerciseSetDraft = { repsMin: string; repsMax: string; weight: string; bandColor?: string; assistanceLevel?: AssistanceLevel };
export type ExerciseDraft = {
  name: string; description: string; youtubeUrl: string; sets: string; repsMin: string; repsMax: string; weight: string;
  catalogCategory: ExerciseCategory | '';
  progressionType: ProgressionType; progressionAmount: string; loadProgressionType: 'kilograms' | 'percent'; loadProgressionAmount: string; customSets: boolean; setTargets: ExerciseSetDraft[];
  metric: ExerciseMetric; bandColor: string; assistanceLevel: AssistanceLevel;
};

export function createEmptyExerciseDraft(): ExerciseDraft {
  return { name: '', description: '', youtubeUrl: '', sets: '3', repsMin: '8', repsMax: '12', weight: '0', catalogCategory: '', progressionType: 'kilograms', progressionAmount: '0', loadProgressionType: 'kilograms', loadProgressionAmount: '0', customSets: false, setTargets: [], metric: 'load', bandColor: '', assistanceLevel: 'brak' };
}

export function resizeExerciseSetDrafts(draft: ExerciseDraft, sets: number): ExerciseSetDraft[] {
  return Array.from({ length: Math.max(0, sets) }, (_, index) => draft.setTargets[index] ?? draft.setTargets[draft.setTargets.length - 1] ?? {
    repsMin: draft.repsMin,
    repsMax: draft.repsMax,
    weight: draft.weight,
  });
}

type Props = {
  editing: boolean;
  buildingPlan: boolean;
  planName: string;
  onPlanNameChange: (value: string) => void;
  canAssign: boolean;
  canManageAtlas: boolean;
  canImport: boolean;
  onImportSpreadsheet: (value: string) => boolean;
  onDownloadTemplate: () => void;
  trainees: Pick<LocalProfile, 'id' | 'full_name' | 'email'>[];
  assignedTo: string | null;
  onAssignedToChange: (value: string | null) => void;
  dayCount: string;
  onDayCountChange: (value: string) => void;
  days: TrainingDay[];
  catalog: CatalogExercise[];
  customExercises: { name: string; category?: string }[];
  onDaysChange: Dispatch<SetStateAction<TrainingDay[]>>;
  exerciseDrafts: Record<string, ExerciseDraft>;
  onExerciseDraftsChange: Dispatch<SetStateAction<Record<string, ExerciseDraft>>>;
  openExerciseForms: Record<string, boolean>;
  onOpenExerciseFormsChange: Dispatch<SetStateAction<Record<string, boolean>>>;
  editingExerciseIds: Record<string, string | null>;
  saving: boolean;
  onMakeDays: () => void;
  onAddDay: () => void;
  onAddExercise: (day: TrainingDay) => void;
  onEditExercise: (day: TrainingDay, exercise: PlannedExercise) => void;
  onRemoveExercise: (dayId: string, exerciseId: string) => void;
  onSave: () => void;
};

type Layout = { y: number; height: number };

export default function PlanBuilder(props: Props) {
  const [importOpen, setImportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [spreadsheetText, setSpreadsheetText] = useState('');
  const [layoutsByDay, setLayoutsByDay] = useState<Record<string, Layout[]>>({});
  const [draggedExerciseId, setDraggedExerciseId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  function moveExercise(dayId: string, exerciseId: string, targetIndex: number) {
    props.onDaysChange((days) => days.map((day) => {
      if (day.id !== dayId) return day;
      const fromIndex = day.exercises.findIndex((exercise) => exercise.id === exerciseId);
      if (fromIndex < 0 || targetIndex < 0 || targetIndex >= day.exercises.length || fromIndex === targetIndex) return day;
      const exercises = [...day.exercises];
      const [moved] = exercises.splice(fromIndex, 1);
      exercises.splice(targetIndex, 0, moved);
      return { ...day, exercises };
    }));
  }

  function createDragGesture(day: TrainingDay, exercise: PlannedExercise, index: number) {
    return Gesture.Pan().minDistance(3).shouldCancelWhenOutside(false).runOnJS(true)
      .onBegin(() => { setDraggedExerciseId(exercise.id); setDragOffset(0); })
      .onUpdate((event) => setDragOffset(event.translationY))
      .onEnd((event) => {
        const rows = layoutsByDay[day.id] ?? [];
        const start = rows[index];
        if (!start || rows.length !== day.exercises.length) return;
        const center = start.y + start.height / 2 + event.translationY;
        const targetIndex = rows.reduce((closest, row, rowIndex) => {
          const closestRow = rows[closest];
          return Math.abs(row.y + row.height / 2 - center) < Math.abs(closestRow.y + closestRow.height / 2 - center) ? rowIndex : closest;
        }, 0);
        moveExercise(day.id, exercise.id, targetIndex);
      })
      .onFinalize(() => { setDraggedExerciseId(null); setDragOffset(0); });
  }

  return <>
    <Text style={s.eyebrow}>{props.editing ? 'EDYCJA PLANU' : 'NOWY PLAN'}</Text>
    <Text style={s.title}>{props.buildingPlan ? props.editing ? 'Dodaj trening do planu.' : 'Zbuduj plan w biegu.' : props.editing ? 'Dostosuj swój plan.' : 'Stwórz plan treningowy.'}</Text>
    <Text style={s.subtitle}>{props.buildingPlan ? 'Zapisz ćwiczenia na dziś, a potem od razu przejdź do realizacji treningu.' : props.editing ? 'Zmieniaj ćwiczenia, zachowując dotychczasową historię.' : '1. Nazwij plan i wybierz liczbę dni.  2. Dodaj ćwiczenia do każdego dnia.'}</Text>

    <View style={s.card}>
      <Input label="NAZWA PLANU" value={props.planName} onChangeText={props.onPlanNameChange} placeholder="np. Siła · 3 dni" />
      {props.canAssign && <View style={s.assignmentArea}>
        <Text style={s.progressionLabel}>PRZYPISZ PLAN PODOPIECZNEMU</Text>
        {props.trainees.length ? <>
          <Pressable onPress={() => props.onAssignedToChange(null)} style={[s.assignmentChoice, !props.assignedTo && s.assignmentChoiceSelected]}>
            <Text style={[s.assignmentChoiceText, !props.assignedTo && s.assignmentChoiceTextSelected]}>Zostaw jako plan własny</Text>
          </Pressable>
          {props.trainees.map((trainee) => <Pressable key={trainee.id} onPress={() => props.onAssignedToChange(trainee.id)} style={[s.assignmentChoice, props.assignedTo === trainee.id && s.assignmentChoiceSelected]}>
            <Text style={[s.assignmentChoiceText, props.assignedTo === trainee.id && s.assignmentChoiceTextSelected]}>{trainee.full_name} · {trainee.email}</Text>
          </Pressable>)}
        </> : <Text style={s.exerciseMeta}>Najpierw połącz konto podopiecznego w zakładce KONTO.</Text>}
      </View>}
      {!props.editing && !props.buildingPlan && <View style={s.row}>
        <View style={s.dayCount}><Input label="LICZBA DNI" value={props.dayCount} onChangeText={props.onDayCountChange} placeholder="3" keyboardType="number-pad" /></View>
        <Pressable onPress={props.onMakeDays} style={s.secondary}><Text style={s.secondaryText}>{props.days.length ? 'ZMIŃ DNI' : 'UTWÓRZ DNI'}</Text></Pressable>
      </View>}
      {props.editing && <Text style={s.exerciseMeta}>{props.buildingPlan ? 'Możesz poprawić wcześniejsze dni i ćwiczenia. Zapisane treningi oraz progres pozostaną zachowane.' : 'Dotychczasowe dni i zapisane treningi zostaną zachowane.'}</Text>}
    </View>
    {props.canManageAtlas && <Pressable accessibilityRole="button" onPress={() => router.push('/exercise-atlas' as never)} style={s.manageAtlasButton}>
      <Text style={s.manageAtlasTitle}>ZARZĄDZAJ PEŁNYM ATLASEM ĆWICZEŃ</Text>
      <Text style={s.manageAtlasHint}>Dodawaj ćwiczenia, poprawiaj nazwy i opisy techniki  ↗</Text>
    </Pressable>}
    {props.days.some((day) => day.exercises.length > 0) && <Pressable accessibilityRole="button" onPress={() => setPreviewOpen(true)} style={s.previewButton}>
      <View style={s.previewButtonCopy}><Text style={s.previewButtonTitle}>PODGLĄD CAŁEGO PLANU</Text><Text style={s.previewButtonMeta}>{props.days.length} dni · {props.days.reduce((count, day) => count + day.exercises.length, 0)} ćwiczeń</Text></View><Text style={s.previewButtonArrow}>↗</Text>
    </Pressable>}
    <Modal visible={previewOpen} animationType="slide" onRequestClose={() => setPreviewOpen(false)}>
      <View style={s.previewScreen}>
        <View style={s.previewHeader}>
          <View style={s.previewHeaderCopy}><Text style={s.eyebrow}>PLAN TRENINGOWY</Text><Text style={s.previewTitle}>{props.planName.trim() || 'Podgląd planu'}</Text><Text style={s.previewSubtitle}>{props.days.length} dni · {props.days.reduce((count, day) => count + day.exercises.length, 0)} ćwiczeń</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Zamknij podgląd planu" onPress={() => setPreviewOpen(false)} style={s.previewClose}><Text style={s.previewCloseText}>×</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={s.previewContent}>
          {props.days.map((day, dayIndex) => <View key={day.id} style={s.previewDay}>
            <View style={s.previewDayHeader}><Text style={s.previewDayTitle}>{day.name || `Dzień ${dayIndex + 1}`}</Text><Text style={s.previewDayCount}>{day.exercises.length} ćw.</Text></View>
            {day.exercises.length ? day.exercises.map((exercise, exerciseIndex) => <View key={exercise.id} style={s.previewExercise}>
              <View style={s.previewExerciseHeading}><Text style={s.previewExerciseIndex}>{String(exerciseIndex + 1).padStart(2, '0')}</Text><View style={s.previewExerciseInfo}><Text style={s.previewExerciseName}>{exercise.name}</Text>{exercise.category && <Text style={s.previewExerciseCategory}>{exercise.category}</Text>}</View></View>
              <Text style={s.previewExerciseTargets}>{formatExerciseTargets(exercise)}</Text>
              {exercise.description?.trim() && <Text style={s.previewExerciseDescription}>{exercise.description}</Text>}
            </View>) : <Text style={s.previewEmptyDay}>Nie dodano jeszcze ćwiczeń do tego dnia.</Text>}
          </View>)}
        </ScrollView>
      </View>
    </Modal>

    {props.canImport && !props.editing && <View style={s.importArea}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: importOpen }} onPress={() => setImportOpen((open) => !open)} style={s.importToggle}>
        <Text style={s.importToggleText}>{importOpen ? 'UKRYJ IMPORT Z ARKUSZA  −' : 'UTWÓRZ PLAN Z ARKUSZA  ＋'}</Text>
      </Pressable>
      {importOpen && <>
        <Text style={s.importHelp}>W Excelu zaznacz i skopiuj całą tabelę, a potem wklej ją tutaj. Każdy wiersz opisuje jedną serię. Kolumny muszą być w kolejności z szablonu; opis, link i progresję możesz podać raz dla ćwiczenia.</Text>
          <GoogleSheetsImporter onImport={(value) => {
            const imported = props.onImportSpreadsheet(value);
            if (imported) setImportOpen(false);
            return imported;
          }} />
        <Pressable accessibilityRole="button" onPress={props.onDownloadTemplate} style={s.templateButton}>
          <Text style={s.templateButtonText}>{Platform.OS === 'web' ? 'POBIERZ SZABLON CSV' : 'UDOSTĘPNIJ SZABLON CSV'}</Text>
        </Pressable>
        <TextInput accessibilityLabel="Dane planu skopiowane z arkusza" multiline numberOfLines={8} onChangeText={setSpreadsheetText} placeholder="Wklej tutaj skopiowaną tabelę z arkusza…" placeholderTextColor={c.muted} selectionColor={c.accent} style={s.importInput} textAlignVertical="top" value={spreadsheetText} />
        <Pressable accessibilityRole="button" disabled={!spreadsheetText.trim()} onPress={() => { if (props.onImportSpreadsheet(spreadsheetText)) { setSpreadsheetText(''); setImportOpen(false); } }} style={[s.importButton, !spreadsheetText.trim() && s.disabled]}>
          <Text style={s.importButtonText}>WCZYTAJ ARKUSZ DO PLANU</Text>
        </Pressable>
      </>}
    </View>}

    {props.days.map((day, dayIndex) => <DayEditor
      key={day.id} day={day} dayIndex={dayIndex} catalog={props.catalog}
      customExercises={props.customExercises}
      draft={props.exerciseDrafts[day.id] ?? createEmptyExerciseDraft()}
      formOpen={Boolean(props.openExerciseForms[day.id])}
      editingExercise={Boolean(props.editingExerciseIds[day.id])}
      draggedExerciseId={draggedExerciseId} dragOffset={dragOffset}
      setDraft={(next) => props.onExerciseDraftsChange((all) => ({ ...all, [day.id]: next }))}
      setDayName={(name) => props.onDaysChange((all) => all.map((item) => item.id === day.id ? { ...item, name } : item))}
      setFormOpen={(open) => props.onOpenExerciseFormsChange((all) => ({ ...all, [day.id]: open }))}
      onLayout={(index, layout) => setLayoutsByDay((all) => {
        const rows = [...(all[day.id] ?? [])];
        rows[index] = layout;
        return { ...all, [day.id]: rows };
      })}
      createDragGesture={createDragGesture}
      onAdd={() => props.onAddExercise(day)}
      onEdit={(exercise) => props.onEditExercise(day, exercise)}
      onRemove={(exerciseId) => props.onRemoveExercise(day.id, exerciseId)}
    />)}
    {props.editing && <View style={s.addDayArea}>
      <Pressable accessibilityRole="button" disabled={props.saving || props.days.length >= 7} onPress={props.onAddDay} style={[s.addDayButton, (props.saving || props.days.length >= 7) && s.disabled]}>
        <Text style={s.addDayButtonText}>{props.days.length >= 7 ? 'MAKSYMALNIE 7 DNI W PLANIE' : '＋  DODAJ KOLEJNY DZIEŃ TRENINGOWY'}</Text>
      </Pressable>
      <Text style={s.exerciseMeta}>Nowy dzień pojawi się na końcu planu. Dotychczasowe treningi i progres zostaną zachowane.</Text>
    </View>}
    {props.days.length > 0 && <Pressable disabled={props.saving} onPress={props.onSave} style={[s.primary, props.saving && s.disabled]}>
      <Text style={s.primaryText}>{props.saving ? 'ZAPISUJĘ…' : props.buildingPlan ? 'ZAPISZ DZIEŃ I ZACZNIJ TRENING' : props.editing ? 'ZAPISZ ZMIANY W PLANIE' : 'ZAPISZ PLAN'}</Text>
    </Pressable>}
  </>;
}

function DayEditor({ day, dayIndex, draft, formOpen, editingExercise, draggedExerciseId, dragOffset, catalog, customExercises, setDraft, setDayName, setFormOpen, onLayout, createDragGesture, onAdd, onEdit, onRemove }: {
  day: TrainingDay; dayIndex: number; draft: ExerciseDraft; formOpen: boolean; editingExercise: boolean;
  catalog: CatalogExercise[];
  customExercises: { name: string; category?: string }[];
  draggedExerciseId: string | null; dragOffset: number;
  setDraft: (draft: ExerciseDraft) => void; setDayName: (name: string) => void; setFormOpen: (open: boolean) => void;
  onLayout: (index: number, layout: Layout) => void;
  createDragGesture: (day: TrainingDay, exercise: PlannedExercise, index: number) => ReturnType<typeof Gesture.Pan>;
  onAdd: () => void; onEdit: (exercise: PlannedExercise) => void; onRemove: (exerciseId: string) => void;
}) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogCategory, setCatalogCategory] = useState<ExerciseCategory | 'Wszystkie'>('Wszystkie');
  const progressionOptions: { type: ProgressionType; label: string }[] = draft.metric === 'distance'
    ? [{ type: 'meters', label: 'METRY' }]
    : draft.metric === 'time'
    ? [{ type: 'seconds', label: 'SEKUNDY' }]
    : draft.metric === 'band'
      ? [{ type: 'band-kilograms', label: 'OPÓR · KG' }, { type: 'band-assistance', label: 'MNIEJSZA POMOC' }]
      : draft.metric === 'machine'
        ? [{ type: 'machine-step', label: 'NASTĘPNA SZTABKA' }]
        : [{ type: 'percent', label: '% CIĘŻARU' }, { type: 'kilograms', label: 'KG' }, { type: 'repetitions', label: 'POWT.' }];
  const progressionUnit = draft.progressionType === 'percent' ? '%' : draft.progressionType === 'kilograms' || draft.progressionType === 'band-kilograms' ? 'kg' : draft.progressionType === 'seconds' ? 's' : draft.progressionType === 'meters' ? 'm' : draft.progressionType === 'repetitions' ? 'powt.' : 'krok';
  const rangeLabel = draft.metric === 'time' ? 'SEK. OD' : draft.metric === 'distance' ? 'METRY OD' : 'POWT. OD';
  const rangeEndLabel = draft.metric === 'time' ? 'SEK. DO' : draft.metric === 'distance' ? 'METRY DO' : 'POWT. DO';
  const metricOptions: { value: ExerciseMetric; label: string }[] = [
    { value: 'load', label: 'CIĘŻAR' }, { value: 'time', label: 'CZAS' }, { value: 'band', label: 'GUMA' }, { value: 'machine', label: 'MASZYNA · KG' }, { value: 'distance', label: 'DYSTANS + KG' },
  ];
  const change = (updates: Partial<ExerciseDraft>) => setDraft({ ...draft, ...updates });
  return <View style={s.dayCard}>
    <View style={s.heading}><Text style={s.headingTitle}>{day.name}</Text><Text style={s.count}>{day.exercises.length} ĆW.</Text></View>
    <Input label="NAZWA DNIA (NP. GÓRA CIAŁA)" value={day.name} onChangeText={setDayName} placeholder={`Dzień ${dayIndex + 1}`} />
    {day.exercises.map((exercise, index) => <View key={exercise.id}
      style={[s.draftExercise, draggedExerciseId === exercise.id && s.draftExerciseDragging, draggedExerciseId === exercise.id && { transform: [{ translateY: dragOffset }] }]}
      onLayout={(event) => onLayout(index, { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height })}>
      <View style={s.exerciseRow}><View style={s.exerciseMark}><Text style={s.exerciseMarkText}>✓</Text></View><View style={s.exerciseInfo}><Text style={s.exerciseName}>{exercise.name}</Text><Text style={s.exerciseMeta}>{formatExerciseTargets(exercise)}</Text></View></View>
      <View style={s.draftExerciseActions}>
        <GestureDetector gesture={createDragGesture(day, exercise, index)}><View accessibilityLabel={`Przeciągnij, aby zmienić kolejność: ${exercise.name}`} style={s.dragHandle}><Text style={s.dragHandleText}>⠿</Text></View></GestureDetector>
        <Pressable accessibilityRole="button" onPress={() => onEdit(exercise)} style={s.draftAction}><Text style={s.draftActionText}>EDYTUJ</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => onRemove(exercise.id)} style={s.draftAction}><Text style={s.draftDeleteText}>USUŃ</Text></Pressable>
      </View>
    </View>)}
    {formOpen ? <>
      <Input label={editingExercise ? 'EDYTUJ ĆWICZENIE' : 'WYSZUKAJ LUB WPISZ ĆWICZENIE'} value={draft.name} onChangeText={(name) => {
        const normalizedName = name.trim().toLocaleLowerCase('pl-PL');
        const catalogMatch = catalog.find((exercise) => exercise.pl.toLocaleLowerCase('pl-PL') === normalizedName || exercise.en.toLocaleLowerCase('en') === normalizedName);
        const savedMatch = customExercises.find((exercise) => exercise.name.toLocaleLowerCase('pl-PL') === normalizedName);
        const savedCategory = savedMatch ? (EXERCISE_CATEGORIES.includes(savedMatch.category as ExerciseCategory) ? savedMatch.category as ExerciseCategory : 'Inne') : '';
        change({ name, catalogCategory: catalogMatch?.category ?? savedCategory, ...(catalogMatch?.description ? { description: catalogMatch.description } : {}) });
        setCatalogOpen(true);
      }} onFocus={() => setCatalogOpen(true)} placeholder="np. wyciskanie na ławce / bench press" />
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: catalogOpen }} onPress={() => setCatalogOpen((open) => !open)} style={s.catalogToggle}>
        <Text style={s.catalogToggleText}>{catalogOpen ? 'UKRYJ PODPOWIEDZI  −' : 'PRZEGLĄDAJ KATALOG ĆWICZEŃ  ＋'}</Text>
      </Pressable>
      {catalogOpen && <View style={s.catalogPanel}>
        <CategoryScroller categories={['Wszystkie', ...EXERCISE_CATEGORIES] as const} selected={catalogCategory} onSelect={setCatalogCategory} />
        {(() => {
          const query = draft.name.trim().toLocaleLowerCase('pl-PL');
          const catalogNames = new Set(catalog.map((exercise) => exercise.pl.toLocaleLowerCase('pl-PL')));
          const customCatalogExercises: CatalogExercise[] = [...new Map(customExercises.map(({ name, category }) => [name.trim().toLocaleLowerCase('pl-PL'), { name: name.trim(), category }])).values()]
            .filter(({ name }) => name && !catalogNames.has(name.toLocaleLowerCase('pl-PL')))
            .map(({ name, category }) => ({ pl: name, en: name, category: (EXERCISE_CATEGORIES.includes(category as ExerciseCategory) ? category : 'Inne') as ExerciseCategory }));
          const allExercises = [...catalog, ...customCatalogExercises];
          const matchingExercises = allExercises.filter((exercise) => (catalogCategory === 'Wszystkie' || exercise.category === catalogCategory) && (!query || exercise.pl.toLocaleLowerCase('pl-PL').includes(query) || exercise.en.toLocaleLowerCase('en').includes(query)));
          const hasExactMatch = allExercises.some((exercise) => exercise.pl.toLocaleLowerCase('pl-PL') === query || exercise.en.toLocaleLowerCase('en') === query);
          return <>
            <Text style={s.catalogCount}>{matchingExercises.length} ćwiczeń{matchingExercises.length > 36 ? ' · pierwsze 36, doprecyzuj wyszukiwanie' : ''}</Text>
            <ScrollView style={s.catalogResults} contentContainerStyle={s.catalogResultsContent} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {query && !hasExactMatch && <View style={s.customCategoryPicker}>
                <Text style={s.catalogCount}>NOWE ĆWICZENIE · WYBIERZ PARTIĘ</Text>
                <CategoryScroller categories={EXERCISE_CATEGORIES.filter((category) => category !== 'Inne')} selected={draft.catalogCategory} onSelect={(category) => { if (category !== 'Wszystkie') change({ catalogCategory: category }); }} />
                <Pressable accessibilityRole="button" disabled={!draft.catalogCategory} onPress={() => setCatalogOpen(false)} style={[s.customExerciseChoice, !draft.catalogCategory && s.disabled]}>
                  <Text style={s.catalogToggleText}>{draft.catalogCategory ? `UŻYJ WŁASNEJ NAZWY · ${draft.catalogCategory.toLocaleUpperCase('pl-PL')}` : 'NAJPIERW WYBIERZ PARTIĘ'}</Text>
                </Pressable>
              </View>}
              {matchingExercises.slice(0, 36).map((exercise, index) => <Pressable key={exercise.id ?? `${exercise.category}-${exercise.pl}-${index}`} accessibilityRole="button" onPress={() => { change({ name: exercise.pl, catalogCategory: exercise.category, description: exercise.description ?? '' }); setCatalogOpen(false); }} style={s.catalogExercise}>
              <View style={s.catalogExerciseInfo}><Text style={s.catalogExerciseName}>{exercise.pl}</Text><Text style={s.catalogExerciseEnglish}>{exercise.en}</Text></View><Text style={s.catalogExerciseCategory}>{exercise.category}</Text>
            </Pressable>)}
            </ScrollView>
            {matchingExercises.length === 0 && !query && <Text style={s.exerciseMeta}>Wpisz nazwę, aby przeszukać katalog. Możesz też dodać własne ćwiczenie.</Text>}
          </>;
        })()}
      </View>}
      <View style={s.field}><Text style={s.label}>OPIS ĆWICZENIA · OPCJONALNIE</Text><TextInput accessibilityLabel="Opis ćwiczenia" multiline numberOfLines={4} onChangeText={(description) => change({ description })} placeholder="Dodaj wskazówki lub technikę wykonania" placeholderTextColor={c.muted} selectionColor={c.accent} style={s.descriptionInput} value={draft.description} /></View>
      <Input label="LINK DO FILMU NA YOUTUBE · OPCJONALNIE" value={draft.youtubeUrl} onChangeText={(youtubeUrl) => change({ youtubeUrl })} placeholder="https://youtu.be/..." keyboardType="url" autoCapitalize="none" autoCorrect={false} />
      <View style={s.metricArea}>
        <Text style={s.progressionLabel}>SPOSÓB ZAPISU ĆWICZENIA</Text>
        <View style={s.progressionChoices}>{metricOptions.map((option) => <Pressable key={option.value} accessibilityRole="button" onPress={() => change({ metric: option.value, progressionType: option.value === 'time' ? 'seconds' : option.value === 'distance' ? 'meters' : option.value === 'band' ? 'band-kilograms' : option.value === 'machine' ? 'machine-step' : 'kilograms', progressionAmount: '0', loadProgressionType: option.value === 'distance' ? 'kilograms' : draft.loadProgressionType, loadProgressionAmount: '0' })} style={[s.progressionChoice, draft.metric === option.value && s.progressionChoiceSelected]}><Text style={[s.progressionChoiceText, draft.metric === option.value && s.progressionChoiceTextSelected]}>{option.label}</Text></Pressable>)}</View>
        {draft.metric === 'time' && <Text style={s.exerciseMeta}>Zakres celu wpisz w sekundach. Przykład: 30–45 s plank.</Text>}
        {draft.metric === 'distance' && <Text style={s.exerciseMeta}>Ustal dystans w metrach oraz ciężar w kg dla każdej serii. Progresję dystansu i ciężaru ustawisz osobno.</Text>}
        {draft.metric === 'band' && <>
          <Input label="KOLOR GUMY · OPCJONALNIE" value={draft.bandColor} onChangeText={(bandColor) => change({ bandColor })} placeholder="np. zielona" />
          <Input label="OPÓR GUMY · KG · 0 JEŚLI NIEZNANY" value={draft.weight} onChangeText={(weight) => change({ weight })} placeholder="0" keyboardType="decimal-pad" />
          <Text style={s.label}>POZIOM POMOCY</Text>
          <View style={s.progressionChoices}>{(['duża', 'średnia', 'mała', 'brak'] as AssistanceLevel[]).map((level) => <Pressable key={level} onPress={() => change({ assistanceLevel: level })} style={[s.progressionChoice, draft.assistanceLevel === level && s.progressionChoiceSelected]}><Text style={[s.progressionChoiceText, draft.assistanceLevel === level && s.progressionChoiceTextSelected]}>{level.toLocaleUpperCase('pl-PL')}</Text></Pressable>)}</View>
        </>}
        {draft.metric === 'machine' && <Text style={s.exerciseMeta}>Ciężar maszyny wpisuj w kilogramach. Po osiągnięciu górnego zakresu powtórzeń aplikacja przypomni o dodaniu kolejnej sztabki.</Text>}
      </View>
      <View style={s.row}><View style={s.smallField}><Input label="SERIE" value={draft.sets} onChangeText={(sets) => {
        const updated = { ...draft, sets };
        change({ sets, ...(draft.customSets ? { setTargets: resizeExerciseSetDrafts(updated, Number(sets) || 0) } : {}) });
      }} placeholder="3" keyboardType="number-pad" /></View></View>
      {!draft.customSets && <View style={s.row}>
        <View style={s.smallField}><Input label={rangeLabel} value={draft.repsMin} onChangeText={(repsMin) => change({ repsMin })} placeholder={draft.metric === 'time' ? '30' : draft.metric === 'distance' ? '20' : '8'} keyboardType={draft.metric === 'distance' ? 'decimal-pad' : 'number-pad'} /></View>
        <View style={s.smallField}><Input label={rangeEndLabel} value={draft.repsMax} onChangeText={(repsMax) => change({ repsMax })} placeholder={draft.metric === 'time' ? '45' : draft.metric === 'distance' ? '40' : '12'} keyboardType={draft.metric === 'distance' ? 'decimal-pad' : 'number-pad'} /></View>
        {draft.metric !== 'time' && draft.metric !== 'band' && <View style={s.smallField}><Input label="CIĘŻAR · KG" value={draft.weight} onChangeText={(weight) => change({ weight })} placeholder="0" keyboardType="decimal-pad" /></View>}
      </View>}
      <SetTargetsEditor draft={draft} onChange={setDraft} />
      <View style={s.progressionArea}>
        <Text style={s.progressionLabel}>PROGRESJA PO OSIĄGNIĘCIU GÓRNEGO ZAKRESU</Text>
        <View style={s.progressionChoices}>{progressionOptions.map((option) => <Pressable key={option.type} onPress={() => change({ progressionType: option.type })} style={[s.progressionChoice, draft.progressionType === option.type && s.progressionChoiceSelected]}><Text style={[s.progressionChoiceText, draft.progressionType === option.type && s.progressionChoiceTextSelected]}>{option.label}</Text></Pressable>)}</View>
        {draft.progressionType === 'machine-step'
          ? <Text style={s.exerciseMeta}>Po osiągnięciu górnego zakresu powtórzeń zobaczysz informację, żeby dodać kolejną sztabkę. Jej ciężar wpiszesz w kg.</Text>
          : draft.progressionType === 'band-assistance'
            ? <Text style={s.exerciseMeta}>Po osiągnięciu celu zmniejszy poziom pomocy o jeden stopień.</Text>
            : <Input label={`PRZYROST PO CELU (${draft.metric === 'distance' ? 'm' : progressionUnit}) · 0 WYŁĄCZA`} value={draft.progressionAmount} onChangeText={(progressionAmount) => change({ progressionAmount })} placeholder="0" keyboardType={draft.progressionType === 'repetitions' || draft.progressionType === 'seconds' ? 'number-pad' : 'decimal-pad'} />}
        {draft.metric === 'distance' && <View style={{ marginTop: 11 }}><Text style={s.progressionLabel}>DODATKOWA PROGRESJA CIĘŻARU</Text><View style={s.progressionChoices}>{([{ type: 'kilograms', label: 'KG' }, { type: 'percent', label: '% CIĘŻARU' }] as const).map((option) => <Pressable key={option.type} accessibilityRole="button" onPress={() => change({ loadProgressionType: option.type })} style={[s.progressionChoice, draft.loadProgressionType === option.type && s.progressionChoiceSelected]}><Text style={[s.progressionChoiceText, draft.loadProgressionType === option.type && s.progressionChoiceTextSelected]}>{option.label}</Text></Pressable>)}</View><Input label={`PRZYROST CIĘŻARU (${draft.loadProgressionType === 'percent' ? '%' : 'kg'}) · 0 WYŁĄCZA`} value={draft.loadProgressionAmount} onChangeText={(loadProgressionAmount) => change({ loadProgressionAmount })} placeholder="0" keyboardType="decimal-pad" /></View>}
      </View>
      <Pressable onPress={onAdd} style={s.addExercise}><Text style={s.addExerciseText}>{editingExercise ? 'ZAPISZ ZMIANY ĆWICZENIA' : '＋  DODAJ ĆWICZENIE'}</Text></Pressable>
    </> : <Pressable accessibilityRole="button" onPress={() => setFormOpen(true)} style={s.addExercise}><Text style={s.addExerciseText}>＋  DODAJ NOWE ĆWICZENIE</Text></Pressable>}
  </View>;
}

function formatExerciseTargets(exercise: PlannedExercise) {
  const metric = exercise.metric ?? 'load';
  const range = (min: number, max: number) => metric === 'time' ? `${min}–${max} s` : metric === 'distance' ? `${min}–${max} m` : `${min}–${max} powt.`;
  const targets = exercise.setTargets?.length
    ? exercise.setTargets.map((set, index) => {
      const details = metric === 'time'
        ? range(set.repsMin, set.repsMax)
        : metric === 'distance'
          ? `${range(set.repsMin, set.repsMax)} · ${set.targetWeight} kg`
          : metric === 'band'
            ? `${set.bandColor ?? exercise.bandColor ?? 'guma'} · ${set.targetWeight} kg · pomoc ${set.assistanceLevel ?? exercise.assistanceLevel ?? 'brak'} · ${range(set.repsMin, set.repsMax)}`
            : `${set.targetWeight} kg · ${range(set.repsMin, set.repsMax)}`;
      return `${index + 1}. ${details}`;
    }).join('  ·  ')
    : `${exercise.sets} serie · ${metric === 'time' || metric === 'distance' ? range(exercise.repsMin, exercise.repsMax) : `${exercise.repsMin}–${exercise.repsMax} powt. · ${metric === 'band' ? `${exercise.bandColor || 'guma'} · ${exercise.targetWeight} kg · pomoc ${exercise.assistanceLevel ?? 'brak'}` : `${exercise.targetWeight} kg`}`}${metric === 'distance' ? ` · ${exercise.targetWeight} kg` : ''}`;
  const progressions = [
    exercise.progression && `${exercise.progression.type === 'meters' ? '+' + exercise.progression.amount + ' m' : exercise.progression.type === 'machine-step' ? 'następna sztabka' : exercise.progression.type === 'band-assistance' ? 'mniejsza pomoc' : `+${exercise.progression.amount}${exercise.progression.type === 'percent' ? '%' : exercise.progression.type === 'kilograms' || exercise.progression.type === 'band-kilograms' ? ' kg' : exercise.progression.type === 'seconds' ? ' s' : ' powt.'}`}`,
    exercise.loadProgression && `ciężar +${exercise.loadProgression.amount}${exercise.loadProgression.type === 'percent' ? '%' : ' kg'}`,
  ].filter(Boolean);
  return progressions.length ? `${targets} · ${progressions.join(' · ')} po osiągnięciu celu` : targets;
}

function Input({ label, value, onChangeText, placeholder, keyboardType = 'default', autoCapitalize, autoCorrect, onFocus }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | 'url';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'; autoCorrect?: boolean; onFocus?: () => void;
}) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} autoCapitalize={autoCapitalize} autoCorrect={autoCorrect} keyboardType={keyboardType} onChangeText={onChangeText} onFocus={onFocus} placeholder={placeholder} placeholderTextColor={c.muted} selectionColor={c.accent} style={s.input} value={value} /></View>;
}

function CategoryScroller({ categories, selected, onSelect }: {
  categories: readonly (ExerciseCategory | 'Wszystkie')[];
  selected: ExerciseCategory | 'Wszystkie' | '';
  onSelect: (category: ExerciseCategory | 'Wszystkie') => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  return <View style={s.categoryScroller}>
    <View style={s.categoryScrollerHeader}><Text style={s.categoryScrollerHint}>PRZESUŃ LISTĘ KATEGORII</Text><View style={s.categoryScrollerControls}>
      <Pressable accessibilityRole="button" accessibilityLabel="Przewiń kategorie w lewo" onPress={() => { offset.current = Math.max(0, offset.current - 180); scrollRef.current?.scrollTo({ x: offset.current, animated: true }); }} style={({ pressed }) => [s.categoryArrow, pressed && s.categoryArrowPressed]}><Text style={s.categoryArrowText}>←</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Przewiń kategorie w prawo" onPress={() => { offset.current += 180; scrollRef.current?.scrollTo({ x: offset.current, animated: true }); }} style={({ pressed }) => [s.categoryArrow, pressed && s.categoryArrowPressed]}><Text style={s.categoryArrowText}>→</Text></Pressable>
    </View></View>
    <ScrollView ref={scrollRef} horizontal style={s.catalogCategoryScroller} contentContainerStyle={s.catalogCategories} onScroll={(event) => { offset.current = event.nativeEvent.contentOffset.x; }} scrollEventThrottle={16} showsHorizontalScrollIndicator={false}>
      {categories.map((category) => <Pressable key={category} accessibilityRole="button" accessibilityState={{ selected: selected === category }} onPress={() => onSelect(category)} style={[s.catalogCategory, selected === category && s.catalogCategorySelected]}>
        <Text style={[s.catalogCategoryText, selected === category && s.catalogCategoryTextSelected]}>{category}</Text>
      </Pressable>)}
    </ScrollView>
  </View>;
}

function SetTargetsEditor({ draft, onChange }: { draft: ExerciseDraft; onChange: (draft: ExerciseDraft) => void }) {
  function toggleCustomSets() {
    if (!draft.customSets) onChange({ ...draft, customSets: true, setTargets: resizeExerciseSetDrafts(draft, Number(draft.sets) || 1) });
    else onChange({ ...draft, customSets: false });
  }
  function updateSet(index: number, key: keyof ExerciseSetDraft, value: string) {
    onChange({ ...draft, setTargets: draft.setTargets.map((set, setIndex) => setIndex === index ? { ...set, [key]: value } : set) });
  }
  return <View style={s.customSetsArea}>
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: draft.customSets }} onPress={toggleCustomSets} style={s.customSetsToggle}>
      <View style={[s.checkMark, draft.customSets && s.checkMarkSelected]}><Text style={s.checkMarkText}>{draft.customSets ? '✓' : ''}</Text></View><Text style={s.customSetsToggleText}>USTAW PARAMETRY OSOBNO DLA KAŻDEJ SERII</Text>
    </Pressable>
    {draft.customSets && <>
      <Text style={s.exerciseMeta}>Dla każdej serii wybierz własny cel{draft.metric === 'time' ? ' czasowy' : draft.metric === 'distance' ? ' dystansowy' : ' powtórzeń'}{draft.metric === 'machine' ? ' i ciężar w kg' : draft.metric === 'band' ? ' oraz opór gumy' : draft.metric === 'time' ? '' : ' i ciężar'}.</Text>
      {draft.setTargets.map((set, index) => <View key={index} style={s.customSetRow}>
        <View style={s.customSetHeading}><Text style={s.customSetTitle}>SERIA {index + 1}</Text>{draft.setTargets.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={`Usuń serię ${index + 1}`} onPress={() => { const setTargets = draft.setTargets.filter((_, setIndex) => setIndex !== index); onChange({ ...draft, sets: String(setTargets.length), setTargets }); }}><Text style={s.removeSetText}>USUŃ ×</Text></Pressable>}</View>
        <View style={s.row}>
          <View style={s.smallField}><Input label={draft.metric === 'time' ? 'SEK. OD' : draft.metric === 'distance' ? 'METRY OD' : 'POWT. OD'} value={set.repsMin} onChangeText={(value) => updateSet(index, 'repsMin', value)} placeholder={draft.metric === 'time' ? '30' : draft.metric === 'distance' ? '20' : '8'} keyboardType={draft.metric === 'distance' ? 'decimal-pad' : 'number-pad'} /></View>
          <View style={s.smallField}><Input label={draft.metric === 'time' ? 'SEK. DO' : draft.metric === 'distance' ? 'METRY DO' : 'POWT. DO'} value={set.repsMax} onChangeText={(value) => updateSet(index, 'repsMax', value)} placeholder={draft.metric === 'time' ? '45' : draft.metric === 'distance' ? '40' : '12'} keyboardType={draft.metric === 'distance' ? 'decimal-pad' : 'number-pad'} /></View>
          {draft.metric !== 'time' && draft.metric !== 'band' && <View style={s.smallField}><Input label="CIĘŻAR · KG" value={set.weight} onChangeText={(value) => updateSet(index, 'weight', value)} placeholder="0" keyboardType="decimal-pad" /></View>}
          {draft.metric === 'band' && <View style={s.smallField}><Input label="OPÓR · KG" value={set.weight} onChangeText={(value) => updateSet(index, 'weight', value)} placeholder="0" keyboardType="decimal-pad" /></View>}
        </View>
        {draft.metric === 'band' && <>
          <Input label="KOLOR GUMY" value={set.bandColor ?? draft.bandColor} onChangeText={(value) => updateSet(index, 'bandColor', value)} placeholder="np. zielona" />
          <Text style={[s.label, { marginTop: 9 }]}>POMOC W TEJ SERII</Text>
          <View style={s.progressionChoices}>{(['duża', 'średnia', 'mała', 'brak'] as AssistanceLevel[]).map((level) => <Pressable key={level} onPress={() => onChange({ ...draft, setTargets: draft.setTargets.map((target, setIndex) => setIndex === index ? { ...target, assistanceLevel: level } : target) })} style={[s.progressionChoice, (set.assistanceLevel ?? draft.assistanceLevel) === level && s.progressionChoiceSelected]}><Text style={[s.progressionChoiceText, (set.assistanceLevel ?? draft.assistanceLevel) === level && s.progressionChoiceTextSelected]}>{level.toLocaleUpperCase('pl-PL')}</Text></Pressable>)}</View>
        </>}
      </View>)}
      <Pressable accessibilityRole="button" onPress={() => { const last = draft.setTargets[draft.setTargets.length - 1] ?? { repsMin: draft.repsMin, repsMax: draft.repsMax, weight: draft.weight, bandColor: draft.bandColor, assistanceLevel: draft.assistanceLevel }; const setTargets = [...draft.setTargets, { ...last }]; onChange({ ...draft, sets: String(setTargets.length), setTargets }); }} style={s.addSetButton}><Text style={s.addSetButtonText}>＋ DODAJ SERIĘ</Text></Pressable>
    </>}
  </View>;
}

const s = StyleSheet.create({
  eyebrow: { color: c.accent, fontSize: 10, letterSpacing: 1.7, fontWeight: '800', marginBottom: 8 },
  title: { color: c.text, fontSize: 32, lineHeight: 36, letterSpacing: -0.8, fontWeight: '800' },
  subtitle: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 17 },
  card: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 16, padding: 15, marginBottom: 12 },
  manageAtlasButton: { borderWidth: 1, borderColor: c.line, borderRadius: 12, backgroundColor: c.panel, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 11 }, manageAtlasTitle: { color: c.accent, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 }, manageAtlasHint: { color: c.muted, fontSize: 10, marginTop: 5 },
  previewButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: c.accent, borderRadius: 12, backgroundColor: c.panel, paddingHorizontal: 14, marginBottom: 11 }, previewButtonCopy: { flex: 1 }, previewButtonTitle: { color: c.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 }, previewButtonMeta: { color: c.muted, fontSize: 10, marginTop: 4 }, previewButtonArrow: { color: c.accent, fontSize: 20, fontWeight: '800' },
  previewScreen: { flex: 1, backgroundColor: c.background, paddingTop: 20 }, previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: c.line }, previewHeaderCopy: { flex: 1 }, previewTitle: { color: c.text, fontSize: 25, lineHeight: 30, fontWeight: '900' }, previewSubtitle: { color: c.muted, fontSize: 11, marginTop: 5 }, previewClose: { width: 42, height: 42, borderRadius: 12, backgroundColor: c.panel, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }, previewCloseText: { color: c.accent, fontSize: 27, lineHeight: 30, fontWeight: '600' }, previewContent: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 15, paddingBottom: 40 },
  previewDay: { backgroundColor: c.panel, borderWidth: 1, borderColor: c.line, borderRadius: 15, padding: 14, marginBottom: 12 }, previewDayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 }, previewDayTitle: { color: c.accent, fontSize: 17, fontWeight: '900' }, previewDayCount: { color: c.muted, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' }, previewExercise: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 11, paddingBottom: 9 }, previewExerciseHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 }, previewExerciseIndex: { color: c.accent, fontSize: 11, fontWeight: '900' }, previewExerciseInfo: { flex: 1 }, previewExerciseName: { color: c.text, fontSize: 13, fontWeight: '800' }, previewExerciseCategory: { color: c.muted, fontSize: 9, marginTop: 3 }, previewExerciseTargets: { color: c.accent, fontSize: 11, fontWeight: '700', lineHeight: 17, marginTop: 8 }, previewExerciseDescription: { color: c.muted, fontSize: 10, lineHeight: 15, marginTop: 6 }, previewEmptyDay: { color: c.muted, fontSize: 11, paddingVertical: 10 },
  importArea: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 2, marginBottom: 11 }, importToggle: { minHeight: 39, justifyContent: 'center' }, importToggleText: { color: c.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 }, importHelp: { color: c.muted, fontSize: 11, lineHeight: 16, marginBottom: 9 }, templateButton: { minHeight: 38, borderRadius: 9, borderWidth: 1, borderColor: c.line, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center', marginBottom: 9 }, templateButtonText: { color: c.accent, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 }, importInput: { minHeight: 150, borderRadius: 10, borderWidth: 1, borderColor: c.line, backgroundColor: c.raised, color: c.text, padding: 10, fontSize: 11, lineHeight: 16 }, importButton: { minHeight: 44, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', marginTop: 9 }, importButtonText: { color: c.accentInk, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  dayCard: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 11 },
  heading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  headingTitle: { color: c.text, fontSize: 18, fontWeight: '700' }, count: { color: c.muted, fontSize: 9, letterSpacing: 1.1, fontWeight: '700' },
  field: { marginTop: 11 }, label: { color: c.muted, fontSize: 9, letterSpacing: 1, fontWeight: '800', marginBottom: 6 },
  catalogToggle: { minHeight: 40, borderWidth: 1, borderColor: c.accent, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 1 }, catalogToggleText: { color: c.accent, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  catalogPanel: { marginTop: 8, padding: 10, borderRadius: 11, backgroundColor: c.raised, borderWidth: 1, borderColor: c.line }, catalogSearch: { color: c.text, height: 42, borderRadius: 9, backgroundColor: c.panel, borderWidth: 1, borderColor: c.line, paddingHorizontal: 11, fontSize: 12 },
  categoryScroller: { width: '100%', minWidth: 0 }, categoryScrollerHeader: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, categoryScrollerHint: { color: c.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.6 }, categoryScrollerControls: { flexDirection: 'row', gap: 5, padding: 3, borderRadius: 11, backgroundColor: c.raised, borderWidth: 1, borderColor: c.line }, categoryArrow: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent, borderRadius: 8 }, categoryArrowPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] }, categoryArrowText: { color: c.accentInk, fontSize: 16, lineHeight: 20, fontWeight: '900' }, catalogCategoryScroller: { width: '100%', minWidth: 0, flexGrow: 0, flexShrink: 1 }, catalogCategories: { gap: 6, paddingVertical: 8, paddingHorizontal: 2 }, catalogCategory: { minHeight: 31, borderRadius: 16, borderWidth: 1, borderColor: c.line, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, catalogCategorySelected: { backgroundColor: c.accent, borderColor: c.accent }, catalogCategoryText: { color: c.muted, fontSize: 9, fontWeight: '800' }, catalogCategoryTextSelected: { color: c.accentInk }, catalogCount: { color: c.muted, fontSize: 9, fontWeight: '700', marginBottom: 4 },
  catalogResults: { height: 270, flexGrow: 0, flexShrink: 1 }, catalogResultsContent: { paddingBottom: 2 }, catalogExercise: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: c.line, paddingVertical: 7 }, catalogExerciseInfo: { flex: 1 }, catalogExerciseName: { color: c.text, fontSize: 11, fontWeight: '800' }, catalogExerciseEnglish: { color: c.muted, fontSize: 10, marginTop: 2 }, catalogExerciseCategory: { color: c.accent, fontSize: 8, fontWeight: '800', maxWidth: 100, textAlign: 'right' },
  customCategoryPicker: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 8 }, customExerciseChoice: { minHeight: 38, borderRadius: 9, backgroundColor: c.panel, borderWidth: 1, borderColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, marginVertical: 4 },
  input: { color: c.text, height: 46, borderRadius: 10, backgroundColor: c.raised, paddingHorizontal: 12, fontSize: 13, borderWidth: 1, borderColor: c.line },
  descriptionInput: { color: c.text, minHeight: 88, borderRadius: 10, backgroundColor: c.raised, paddingHorizontal: 12, paddingVertical: 10, fontSize: 12, lineHeight: 18, borderWidth: 1, borderColor: c.line, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 9, alignItems: 'flex-end' }, smallField: { flex: 1, minWidth: 0 }, dayCount: { flex: 1 },
  secondary: { minHeight: 46, flex: 1, borderWidth: 1, borderColor: c.accent, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 11 }, secondaryText: { color: c.accent, fontSize: 10, fontWeight: '900' },
  exerciseMeta: { color: c.muted, fontSize: 10, lineHeight: 16, marginTop: 5 }, assignmentArea: { marginTop: 14 }, progressionLabel: { color: c.accent, fontSize: 9, letterSpacing: 0.8, fontWeight: '900', marginBottom: 8 },
  assignmentChoice: { minHeight: 40, justifyContent: 'center', padding: 10, marginTop: 6, borderRadius: 9, backgroundColor: c.raised, borderWidth: 1, borderColor: c.line }, assignmentChoiceSelected: { borderColor: c.accent }, assignmentChoiceText: { color: c.muted, fontSize: 11 }, assignmentChoiceTextSelected: { color: c.accent, fontWeight: '700' },
  draftExercise: { backgroundColor: c.raised, borderRadius: 12, padding: 11, marginTop: 8, borderWidth: 1, borderColor: c.line }, draftExerciseDragging: { borderColor: c.accent, backgroundColor: '#293322', zIndex: 2, elevation: 5 },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, exerciseMark: { width: 28, height: 28, borderRadius: 9, backgroundColor: c.panel, alignItems: 'center', justifyContent: 'center' }, exerciseMarkText: { color: c.accent, fontSize: 13, fontWeight: '900' }, exerciseInfo: { flex: 1 }, exerciseName: { color: c.text, fontSize: 13, fontWeight: '800' },
  draftExerciseActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 7, marginTop: 9 }, dragHandle: { width: 40, height: 38, borderWidth: 1, borderColor: c.line, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: c.panel }, dragHandleText: { color: c.accent, fontSize: 19, fontWeight: '900' }, draftAction: { minWidth: 58, minHeight: 38, borderWidth: 1, borderColor: c.line, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }, draftActionText: { color: c.accent, fontSize: 9, fontWeight: '900' }, draftDeleteText: { color: c.danger, fontSize: 9, fontWeight: '900' },
  customSetsArea: { marginTop: 13, backgroundColor: c.raised, padding: 11, borderRadius: 11 }, customSetsToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 }, checkMark: { width: 19, height: 19, borderWidth: 1, borderColor: c.line, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }, checkMarkSelected: { backgroundColor: c.accent, borderColor: c.accent }, checkMarkText: { color: c.accentInk, fontSize: 12, fontWeight: '900' }, customSetsToggleText: { color: c.text, fontSize: 8, fontWeight: '800', letterSpacing: 0.4, flex: 1 },
  customSetRow: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 9, marginTop: 9 }, customSetHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, customSetTitle: { color: c.accent, fontSize: 9, fontWeight: '900' }, removeSetText: { color: c.danger, fontSize: 8, fontWeight: '900' }, addSetButton: { minHeight: 36, borderWidth: 1, borderColor: c.line, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, addSetButtonText: { color: c.accent, fontSize: 9, fontWeight: '900' },
  progressionArea: { marginTop: 13, backgroundColor: c.raised, padding: 11, borderRadius: 11 }, progressionChoices: { flexDirection: 'row', gap: 6 }, progressionChoice: { flex: 1, minHeight: 36, borderWidth: 1, borderColor: c.line, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, progressionChoiceSelected: { backgroundColor: c.accent, borderColor: c.accent }, progressionChoiceText: { color: c.muted, fontSize: 8, fontWeight: '900' }, progressionChoiceTextSelected: { color: c.accentInk },
  metricArea: { marginTop: 13, backgroundColor: c.raised, padding: 11, borderRadius: 11 },
  addExercise: { minHeight: 42, borderWidth: 1, borderColor: c.line, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, addExerciseText: { color: c.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  addDayArea: { marginTop: 12 }, addDayButton: { minHeight: 46, borderWidth: 1, borderColor: c.accent, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, addDayButtonText: { color: c.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  primary: { minHeight: 50, backgroundColor: c.accent, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, marginTop: 12 }, primaryText: { color: c.accentInk, fontSize: 11, letterSpacing: 1, fontWeight: '900', textAlign: 'center' }, disabled: { opacity: 0.55 },
});
