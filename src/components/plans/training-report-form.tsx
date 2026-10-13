import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { progresTheme as c } from '@/constants/progres-theme';
import { getReportCommentKey } from '@/lib/training-progression';
import type { TrainingPlan, TrainingSession } from '@/lib/plans';

type Props = {
  plan: TrainingPlan;
  sessions: TrainingSession[];
  comments: Record<string, string>;
  saving: boolean;
  onCommentChange: (key: string, value: string) => void;
  onSend: () => void;
  onCancel: () => void;
};

export default function TrainingReportForm({ plan, sessions, comments, saving, onCommentChange, onSend, onCancel }: Props) {
  return <>
    <Text style={s.eyebrow}>RAPORT DLA TRENERA · {plan.name}</Text>
    <Text style={s.title}>Podsumowanie mikrocyklu.</Text>
    <Text style={s.subtitle}>Sprawdź wykonane treningi i dodaj komentarz przy ćwiczeniach, które chcesz omówić z trenerem.</Text>
    {sessions.map((session) => {
      const day = plan.days.find((item) => item.id === session.dayId);
      const date = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(session.completedAt));
      return <View key={session.id} style={s.workout}>
        <Text style={s.dayName}>{day?.name ?? 'Dzień treningowy'}</Text>
        <Text style={s.meta}>{date}</Text>
        {session.skipped
          ? <View style={s.skipped}><Text style={s.skippedTitle}>NIEWYKONANY · DZIEŃ POMINIĘTY</Text><Text style={s.meta}>Ten dzień został pominięty i nie zawiera wykonanych ćwiczeń.</Text></View>
          : session.exercises.map((exercise) => {
            const key = getReportCommentKey(session.id, exercise.exerciseId);
            return <View key={exercise.exerciseId} style={s.exercise}>
              <Text style={s.exerciseName}>{exercise.name ?? day?.exercises.find((item) => item.id === exercise.exerciseId)?.name ?? 'Ćwiczenie'}</Text>
              <Text style={s.meta}>{exercise.sets.map((set) => `${set.weight} kg × ${set.reps}`).join('  ·  ')}</Text>
              <TextInput accessibilityLabel={`Komentarz do ${exercise.name ?? 'ćwiczenia'}`} multiline onChangeText={(value) => onCommentChange(key, value)} placeholder="Dodaj komentarz do ćwiczenia (opcjonalnie)" placeholderTextColor={c.muted} style={s.comment} textAlignVertical="top" value={comments[key] ?? ''} />
            </View>;
          })}
      </View>;
    })}
    <Pressable accessibilityRole="button" disabled={saving} onPress={onSend} style={[s.primary, saving && s.disabled]}><Text style={s.primaryText}>{saving ? 'WYSYŁAM RAPORT…' : 'WYŚLIJ RAPORT DO TRENERA'}</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={onCancel} style={s.cancel}><Text style={s.backText}>‹  Wróć bez wysyłania</Text></Pressable>
  </>;
}

const s = StyleSheet.create({
  eyebrow: { color: c.accent, fontSize: 10, letterSpacing: 1.7, fontWeight: '800', marginBottom: 8 },
  title: { color: c.text, fontSize: 32, lineHeight: 36, letterSpacing: -0.8, fontWeight: '800' },
  subtitle: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 17 },
  workout: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 11 },
  dayName: { color: c.accent, fontSize: 13, fontWeight: '900' },
  meta: { color: c.muted, fontSize: 10, lineHeight: 16, marginTop: 5 },
  exercise: { marginTop: 12, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 10 },
  exerciseName: { color: c.text, fontSize: 13, fontWeight: '800' },
  comment: { color: c.text, minHeight: 76, borderRadius: 10, backgroundColor: c.raised, paddingHorizontal: 11, paddingVertical: 10, fontSize: 12, lineHeight: 18, borderWidth: 1, borderColor: c.line, marginTop: 8 },
  skipped: { backgroundColor: '#30231F', borderColor: '#765146', borderWidth: 1, borderRadius: 10, padding: 11, marginTop: 9 },
  skippedTitle: { color: '#FFB2A1', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  primary: { minHeight: 50, backgroundColor: c.accent, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, marginTop: 12 },
  primaryText: { color: c.accentInk, fontSize: 11, letterSpacing: 1, fontWeight: '900', textAlign: 'center' },
  disabled: { opacity: 0.55 },
  cancel: { alignSelf: 'center', paddingVertical: 14, marginBottom: 12 },
  backText: { color: c.accent, fontWeight: '700', fontSize: 14 },
});
