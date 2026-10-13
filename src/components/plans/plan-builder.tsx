import { useState, type Dispatch, type SetStateAction } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { progresTheme as c } from '@/constants/progres-theme';
import type { LocalProfile } from '@/lib/local-accounts';
import type { PlannedExercise, ProgressionType, TrainingDay } from '@/lib/plans';
import GoogleSheetsImporter from '@/components/plans/google-sheets-importer';

export type ExerciseSetDraft = { repsMin: string; repsMax: string; weight: string };
export type ExerciseDraft = {
  name: string; description: string; youtubeUrl: string; sets: string; repsMin: string; repsMax: string; weight: string;
  progressionType: ProgressionType; progressionAmount: string; customSets: boolean; setTargets: ExerciseSetDraft[];
};

export function createEmptyExerciseDraft(): ExerciseDraft {
  return { name: '', description: '', youtubeUrl: '', sets: '3', repsMin: '8', repsMax: '12', weight: '0', progressionType: 'kilograms', progressionAmount: '0', customSets: false, setTargets: [] };
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
  planName: string;
  onPlanNameChange: (value: string) => void;
  canAssign: boolean;
  canImport: boolean;
  onImportSpreadsheet: (value: string) => boolean;
  onDownloadTemplate: () => void;
  trainees: Pick<LocalProfile, 'id' | 'full_name' | 'email'>[];
  assignedTo: string | null;
  onAssignedToChange: (value: string | null) => void;
  dayCount: string;
  onDayCountChange: (value: string) => void;
  days: TrainingDay[];
  onDaysChange: Dispatch<SetStateAction<TrainingDay[]>>;
  exerciseDrafts: Record<string, ExerciseDraft>;
  onExerciseDraftsChange: Dispatch<SetStateAction<Record<string, ExerciseDraft>>>;
  openExerciseForms: Record<string, boolean>;
  onOpenExerciseFormsChange: Dispatch<SetStateAction<Record<string, boolean>>>;
  editingExerciseIds: Record<string, string | null>;
  saving: boolean;
  onMakeDays: () => void;
  onAddExercise: (day: TrainingDay) => void;
  onEditExercise: (day: TrainingDay, exercise: PlannedExercise) => void;
  onRemoveExercise: (dayId: string, exerciseId: string) => void;
  onSave: () => void;
};

type Layout = { y: number; height: number };

export default function PlanBuilder(props: Props) {
  const [importOpen, setImportOpen] = useState(false);
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
    <Text style={s.title}>{props.editing ? 'Dostosuj swój plan.' : 'Stwórz plan treningowy.'}</Text>
    <Text style={s.subtitle}>{props.editing ? 'Zmieniaj ćwiczenia, zachowując dotychczasową historię.' : '1. Nazwij plan i wybierz liczbę dni.  2. Dodaj ćwiczenia do każdego dnia.'}</Text>

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
      {!props.editing && <View style={s.row}>
        <View style={s.dayCount}><Input label="LICZBA DNI" value={props.dayCount} onChangeText={props.onDayCountChange} placeholder="3" keyboardType="number-pad" /></View>
        <Pressable onPress={props.onMakeDays} style={s.secondary}><Text style={s.secondaryText}>{props.days.length ? 'ZMIŃ DNI' : 'UTWÓRZ DNI'}</Text></Pressable>
      </View>}
      {props.editing && <Text style={s.exerciseMeta}>Dotychczasowe dni i zapisane treningi zostaną zachowane.</Text>}
    </View>

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
      key={day.id} day={day} dayIndex={dayIndex}
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
    {props.days.length > 0 && <Pressable disabled={props.saving} onPress={props.onSave} style={[s.primary, props.saving && s.disabled]}>
      <Text style={s.primaryText}>{props.saving ? 'ZAPISUJĘ…' : props.editing ? 'ZAPISZ ZMIANY W PLANIE' : 'ZAPISZ PLAN'}</Text>
    </Pressable>}
  </>;
}

function DayEditor({ day, dayIndex, draft, formOpen, editingExercise, draggedExerciseId, dragOffset, setDraft, setDayName, setFormOpen, onLayout, createDragGesture, onAdd, onEdit, onRemove }: {
  day: TrainingDay; dayIndex: number; draft: ExerciseDraft; formOpen: boolean; editingExercise: boolean;
  draggedExerciseId: string | null; dragOffset: number;
  setDraft: (draft: ExerciseDraft) => void; setDayName: (name: string) => void; setFormOpen: (open: boolean) => void;
  onLayout: (index: number, layout: Layout) => void;
  createDragGesture: (day: TrainingDay, exercise: PlannedExercise, index: number) => ReturnType<typeof Gesture.Pan>;
  onAdd: () => void; onEdit: (exercise: PlannedExercise) => void; onRemove: (exerciseId: string) => void;
}) {
  const progressionUnit = draft.progressionType === 'percent' ? '%' : draft.progressionType === 'kilograms' ? 'kg' : 'powt.';
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
      <Input label={editingExercise ? 'EDYTUJ ĆWICZENIE' : 'ĆWICZENIE'} value={draft.name} onChangeText={(name) => change({ name })} placeholder="np. Wyciskanie na ławce" />
      <View style={s.field}><Text style={s.label}>OPIS ĆWICZENIA · OPCJONALNIE</Text><TextInput accessibilityLabel="Opis ćwiczenia" multiline numberOfLines={4} onChangeText={(description) => change({ description })} placeholder="Dodaj wskazówki lub technikę wykonania" placeholderTextColor={c.muted} selectionColor={c.accent} style={s.descriptionInput} value={draft.description} /></View>
      <Input label="LINK DO FILMU NA YOUTUBE · OPCJONALNIE" value={draft.youtubeUrl} onChangeText={(youtubeUrl) => change({ youtubeUrl })} placeholder="https://youtu.be/..." keyboardType="url" autoCapitalize="none" autoCorrect={false} />
      <View style={s.row}><View style={s.smallField}><Input label="SERIE" value={draft.sets} onChangeText={(sets) => {
        const updated = { ...draft, sets };
        change({ sets, ...(draft.customSets ? { setTargets: resizeExerciseSetDrafts(updated, Number(sets) || 0) } : {}) });
      }} placeholder="3" keyboardType="number-pad" /></View></View>
      {!draft.customSets && <View style={s.row}>
        <View style={s.smallField}><Input label="POWT. OD" value={draft.repsMin} onChangeText={(repsMin) => change({ repsMin })} placeholder="8" keyboardType="number-pad" /></View>
        <View style={s.smallField}><Input label="DO" value={draft.repsMax} onChangeText={(repsMax) => change({ repsMax })} placeholder="12" keyboardType="number-pad" /></View>
        <View style={s.smallField}><Input label="KG" value={draft.weight} onChangeText={(weight) => change({ weight })} placeholder="0" keyboardType="decimal-pad" /></View>
      </View>}
      <SetTargetsEditor draft={draft} onChange={setDraft} />
      <View style={s.progressionArea}>
        <Text style={s.progressionLabel}>PROGRESJA PO OSIĄGNIĘCIU GÓRNEGO ZAKRESU</Text>
        <View style={s.progressionChoices}>{([{ type: 'percent', label: '% CIĘŻARU' }, { type: 'kilograms', label: 'KG' }, { type: 'repetitions', label: 'POWT.' }] as const).map((option) => <Pressable key={option.type} onPress={() => change({ progressionType: option.type })} style={[s.progressionChoice, draft.progressionType === option.type && s.progressionChoiceSelected]}><Text style={[s.progressionChoiceText, draft.progressionType === option.type && s.progressionChoiceTextSelected]}>{option.label}</Text></Pressable>)}</View>
        <Input label={`PRZYROST PO CELU (${progressionUnit}) · 0 WYŁĄCZA`} value={draft.progressionAmount} onChangeText={(progressionAmount) => change({ progressionAmount })} placeholder="0" keyboardType={draft.progressionType === 'repetitions' ? 'number-pad' : 'decimal-pad'} />
      </View>
      <Pressable onPress={onAdd} style={s.addExercise}><Text style={s.addExerciseText}>{editingExercise ? 'ZAPISZ ZMIANY ĆWICZENIA' : '＋  DODAJ ĆWICZENIE'}</Text></Pressable>
    </> : <Pressable accessibilityRole="button" onPress={() => setFormOpen(true)} style={s.addExercise}><Text style={s.addExerciseText}>＋  DODAJ NOWE ĆWICZENIE</Text></Pressable>}
  </View>;
}

function formatExerciseTargets(exercise: PlannedExercise) {
  const targets = exercise.setTargets?.length
    ? exercise.setTargets.map((set, index) => `${index + 1}. ${set.targetWeight} kg · ${set.repsMin}–${set.repsMax} powt.`).join('  ·  ')
    : `${exercise.sets} serie · ${exercise.repsMin}–${exercise.repsMax} powt. · ${exercise.targetWeight} kg`;
  if (!exercise.progression) return targets;
  const unit = exercise.progression.type === 'percent' ? '%' : exercise.progression.type === 'kilograms' ? ' kg' : ' powt.';
  return `${targets} · +${exercise.progression.amount}${unit} po osiągnięciu celu`;
}

function Input({ label, value, onChangeText, placeholder, keyboardType = 'default', autoCapitalize, autoCorrect }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | 'url';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'; autoCorrect?: boolean;
}) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} autoCapitalize={autoCapitalize} autoCorrect={autoCorrect} keyboardType={keyboardType} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} selectionColor={c.accent} style={s.input} value={value} /></View>;
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
      <Text style={s.exerciseMeta}>Dla każdej serii wybierz własny ciężar i zakres powtórzeń.</Text>
      {draft.setTargets.map((set, index) => <View key={index} style={s.customSetRow}>
        <View style={s.customSetHeading}><Text style={s.customSetTitle}>SERIA {index + 1}</Text>{draft.setTargets.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={`Usuń serię ${index + 1}`} onPress={() => { const setTargets = draft.setTargets.filter((_, setIndex) => setIndex !== index); onChange({ ...draft, sets: String(setTargets.length), setTargets }); }}><Text style={s.removeSetText}>USUŃ ×</Text></Pressable>}</View>
        <View style={s.row}>
          <View style={s.smallField}><Input label="POWT. OD" value={set.repsMin} onChangeText={(value) => updateSet(index, 'repsMin', value)} placeholder="8" keyboardType="number-pad" /></View>
          <View style={s.smallField}><Input label="DO" value={set.repsMax} onChangeText={(value) => updateSet(index, 'repsMax', value)} placeholder="12" keyboardType="number-pad" /></View>
          <View style={s.smallField}><Input label="KG" value={set.weight} onChangeText={(value) => updateSet(index, 'weight', value)} placeholder="0" keyboardType="decimal-pad" /></View>
        </View>
      </View>)}
      <Pressable accessibilityRole="button" onPress={() => { const last = draft.setTargets[draft.setTargets.length - 1] ?? { repsMin: draft.repsMin, repsMax: draft.repsMax, weight: draft.weight }; const setTargets = [...draft.setTargets, { ...last }]; onChange({ ...draft, sets: String(setTargets.length), setTargets }); }} style={s.addSetButton}><Text style={s.addSetButtonText}>＋ DODAJ SERIĘ</Text></Pressable>
    </>}
  </View>;
}

const s = StyleSheet.create({
  eyebrow: { color: c.accent, fontSize: 10, letterSpacing: 1.7, fontWeight: '800', marginBottom: 8 },
  title: { color: c.text, fontSize: 32, lineHeight: 36, letterSpacing: -0.8, fontWeight: '800' },
  subtitle: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 17 },
  card: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 16, padding: 15, marginBottom: 12 },
  importArea: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 2, marginBottom: 11 }, importToggle: { minHeight: 39, justifyContent: 'center' }, importToggleText: { color: c.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 }, importHelp: { color: c.muted, fontSize: 11, lineHeight: 16, marginBottom: 9 }, templateButton: { minHeight: 38, borderRadius: 9, borderWidth: 1, borderColor: c.line, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center', marginBottom: 9 }, templateButtonText: { color: c.accent, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 }, importInput: { minHeight: 150, borderRadius: 10, borderWidth: 1, borderColor: c.line, backgroundColor: c.raised, color: c.text, padding: 10, fontSize: 11, lineHeight: 16 }, importButton: { minHeight: 44, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', marginTop: 9 }, importButtonText: { color: c.accentInk, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  dayCard: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 11 },
  heading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  headingTitle: { color: c.text, fontSize: 18, fontWeight: '700' }, count: { color: c.muted, fontSize: 9, letterSpacing: 1.1, fontWeight: '700' },
  field: { marginTop: 11 }, label: { color: c.muted, fontSize: 9, letterSpacing: 1, fontWeight: '800', marginBottom: 6 },
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
  addExercise: { minHeight: 42, borderWidth: 1, borderColor: c.line, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, addExerciseText: { color: c.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  primary: { minHeight: 50, backgroundColor: c.accent, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, marginTop: 12 }, primaryText: { color: c.accentInk, fontSize: 11, letterSpacing: 1, fontWeight: '900', textAlign: 'center' }, disabled: { opacity: 0.55 },
});
