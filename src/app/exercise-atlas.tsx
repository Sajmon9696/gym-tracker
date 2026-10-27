import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { progresTheme as c } from '@/constants/progres-theme';
import { EXERCISE_CATEGORIES, type CatalogExercise, type ExerciseCategory } from '@/lib/exercise-catalog';
import { getDefaultExerciseCatalog, loadTrainerExerciseCatalog, saveTrainerCatalogExercise } from '@/lib/exercise-catalog-store';
import { getLocalProfile, type LocalProfile } from '@/lib/local-accounts';
import { useAuth } from '@/lib/auth-context';

type EditableExercise = CatalogExercise & { id: string };
const makeId = () => `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function ExerciseAtlasScreen() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [catalog, setCatalog] = useState<EditableExercise[]>(getDefaultExerciseCatalog);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ExerciseCategory | 'Wszystkie'>('Wszystkie');
  const [draft, setDraft] = useState<EditableExercise | null>(null);
  const categoryScrollRef = useRef<ScrollView>(null);
  const categoryScrollOffset = useRef(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        if (session?.user.id) {
          const currentProfile = await getLocalProfile(session.user.id);
          if (active) setProfile(currentProfile);
        } else if (active) setProfile(null);
        const entries = await loadTrainerExerciseCatalog();
        if (active) { setCatalog(entries); setError(''); }
      } catch (loadError) {
        if (active) {
          setCatalog(getDefaultExerciseCatalog());
          setError(loadError instanceof Error ? loadError.message : 'Nie udało się pobrać atlasu ćwiczeń.');
        }
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [session?.user.id]);

  const visibleExercises = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pl-PL');
    return catalog.filter((exercise) => (category === 'Wszystkie' || exercise.category === category)
      && (!normalizedQuery || exercise.pl.toLocaleLowerCase('pl-PL').includes(normalizedQuery)
        || exercise.en.toLocaleLowerCase('en').includes(normalizedQuery)
        || exercise.description?.toLocaleLowerCase('pl-PL').includes(normalizedQuery)));
  }, [catalog, category, query]);

  function startNew() {
    setError(''); setNotice('');
    setDraft({ id: makeId(), pl: '', en: '', category: 'Klatka piersiowa', description: '' });
  }

  function startEdit(exercise: EditableExercise) {
    setError(''); setNotice(''); setDraft({ ...exercise });
  }

  async function saveExercise() {
    if (!draft || saving) return;
    const normalized = { ...draft, pl: draft.pl.trim(), en: draft.en.trim(), description: draft.description?.trim() ?? '' };
    if (!normalized.pl || !normalized.en || !normalized.description) {
      setError('Uzupełnij polską i angielską nazwę oraz opis techniki.');
      return;
    }
    setSaving(true); setError(''); setNotice('');
    try {
      await saveTrainerCatalogExercise(normalized);
      setCatalog((current) => [...current.filter((item) => item.id !== normalized.id), normalized]
        .sort((left, right) => left.category.localeCompare(right.category, 'pl') || left.pl.localeCompare(right.pl, 'pl')));
      setDraft(null); setNotice('Ćwiczenie zapisane. Jest teraz dostępne w wyborze ćwiczeń podczas tworzenia planu.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nie udało się zapisać ćwiczenia.');
    } finally { setSaving(false); }
  }

  if (profile && profile.role !== 'trainer') return <SafeAreaView style={s.safe}><View style={s.content}><Pressable onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹  Wróć</Text></Pressable><Text style={s.title}>Atlas ćwiczeń</Text><Text style={s.body}>Zarządzanie atlasem jest dostępne dla trenerów.</Text></View></SafeAreaView>;

  return <SafeAreaView edges={['top']} style={s.safe}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={s.top}><Pressable onPress={() => router.replace('/')} style={s.brandHome}><View style={s.mark}><Text style={s.markText}>P</Text></View><Text style={s.brand}>PROGRES</Text></Pressable><Text style={s.pill}>ATLAS</Text></View>
      <Pressable onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹  Wróć</Text></Pressable>
      <Text style={s.eyebrow}>DLA TRENERA</Text><Text style={s.title}>Atlas ćwiczeń</Text>
      <Text style={s.body}>Przeglądaj opisy techniki, dodawaj pozycje i poprawiaj dane. Zmiany w atlasie będą dostępne trenerom oraz w formularzu planu.</Text>

      {profile?.role === 'trainer' && <Pressable accessibilityRole="button" onPress={startNew} style={s.addButton}><Text style={s.addButtonText}>＋  DODAJ ĆWICZENIE DO ATLASU</Text></Pressable>}

      {draft && <View style={s.editor}>
        <View style={s.editorHead}><Text style={s.editorTitle}>{draft.id.startsWith('custom-') ? 'Nowe ćwiczenie' : 'Edytuj ćwiczenie'}</Text><Pressable accessibilityRole="button" onPress={() => setDraft(null)}><Text style={s.cancel}>ANULUJ</Text></Pressable></View>
        <Text style={s.label}>NAZWA PO POLSKU</Text><TextInput value={draft.pl} onChangeText={(pl) => setDraft({ ...draft, pl })} style={s.input} placeholder="np. Wyciskanie hantli" placeholderTextColor={c.muted}/>
        <Text style={s.label}>NAZWA PO ANGIELSKU</Text><TextInput value={draft.en} onChangeText={(en) => setDraft({ ...draft, en })} style={s.input} placeholder="e.g. Dumbbell Press" placeholderTextColor={c.muted}/>
        <Text style={s.label}>KATEGORIA</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryList}>{EXERCISE_CATEGORIES.map((item) => <Pressable key={item} onPress={() => setDraft({ ...draft, category: item })} style={[s.categoryChip, draft.category === item && s.categoryChipSelected]}><Text style={[s.categoryText, draft.category === item && s.categoryTextSelected]}>{item}</Text></Pressable>)}</ScrollView>
        <Text style={s.label}>OPIS TECHNIKI</Text><TextInput value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} style={[s.input, s.description]} multiline textAlignVertical="top" placeholder="Opisz ustawienie, przebieg ruchu i najważniejsze wskazówki." placeholderTextColor={c.muted}/>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveExercise()} style={[s.saveButton, saving && s.disabled]}><Text style={s.saveButtonText}>{saving ? 'ZAPISUJĘ…' : 'ZAPISZ ĆWICZENIE'}</Text></Pressable>
      </View>}

      {notice ? <Text style={s.notice}>{notice}</Text> : null}
      {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text>{error.includes('exercise_catalog') || error.includes('schema cache') ? <Text style={s.errorHint}>Uruchom migrację z pliku supabase/migrations/005_exercise_catalog.sql w SQL Editor projektu Supabase, a potem odśwież atlas.</Text> : null}</View> : null}
      <TextInput value={query} onChangeText={setQuery} style={s.search} placeholder="Szukaj ćwiczenia lub opisu…" placeholderTextColor={c.muted}/>
      <View style={s.categoryScroller}>
        <View style={s.categoryScrollerHeader}><Text style={s.categoryScrollerHint}>KATEGORIE</Text><View style={s.categoryScrollerControls}>
          <Pressable accessibilityRole="button" accessibilityLabel="Przewiń kategorie w lewo" onPress={() => { categoryScrollOffset.current = Math.max(0, categoryScrollOffset.current - 180); categoryScrollRef.current?.scrollTo({ x: categoryScrollOffset.current, animated: true }); }} style={s.categoryArrow}><Text style={s.categoryArrowText}>‹</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Przewiń kategorie w prawo" onPress={() => { categoryScrollOffset.current += 180; categoryScrollRef.current?.scrollTo({ x: categoryScrollOffset.current, animated: true }); }} style={s.categoryArrow}><Text style={s.categoryArrowText}>›</Text></Pressable>
        </View></View>
        <ScrollView ref={categoryScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryList} onScroll={(event) => { categoryScrollOffset.current = event.nativeEvent.contentOffset.x; }} scrollEventThrottle={16}>
          {(['Wszystkie', ...EXERCISE_CATEGORIES] as const).map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[s.categoryChip, category === item && s.categoryChipSelected]}><Text style={[s.categoryText, category === item && s.categoryTextSelected]}>{item}</Text></Pressable>)}
        </ScrollView>
      </View>
      <View style={s.listHeading}><View style={s.listHeadingTitle}><Text style={s.sectionTitle}>{loading ? 'Wczytuję atlas…' : 'Ćwiczenia'}</Text><Text style={s.listScrollHint}>PRZEWIŃ LISTĘ</Text></View><Text style={s.count}>{visibleExercises.length}</Text></View>
      <ScrollView style={s.exerciseListScroll} contentContainerStyle={s.list} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {visibleExercises.map((exercise) => <View key={exercise.id} style={s.exerciseCard}>
        <View style={s.exerciseHead}><View style={s.exerciseInfo}><Text style={s.exerciseName}>{exercise.pl}</Text><Text style={s.exerciseEnglish}>{exercise.en} · {exercise.category}</Text></View>{profile?.role === 'trainer' && <Pressable accessibilityRole="button" onPress={() => startEdit(exercise)} style={s.editButton}><Text style={s.editButtonText}>EDYTUJ</Text></Pressable>}</View>
        <Text style={s.descriptionText}>{exercise.description}</Text>
      </View>)}
      </ScrollView>
      {!loading && visibleExercises.length === 0 && <Text style={s.empty}>Nie znaleziono ćwiczeń dla tego wyszukiwania.</Text>}
      <View style={s.sources}><Text style={s.sourcesTitle}>ŹRÓDŁA TECHNIKI</Text><Text style={s.sourcesText}>Opisy przygotowano jako krótkie wskazówki ruchowe na podstawie biblioteki ćwiczeń ACE i zaleceń ACSM. Dobierz wariant oraz zakres ruchu do możliwości ćwiczącej osoby.</Text><Pressable onPress={() => void Linking.openURL('https://www.acefitness.org/resources/everyone/exercise-library/')}><Text style={s.sourceLink}>Biblioteka ćwiczeń ACE ↗</Text></Pressable><Pressable onPress={() => void Linking.openURL('https://acsm.org/resistance-training-guidelines-update-2026/')}><Text style={s.sourceLink}>Zalecenia treningu oporowego ACSM ↗</Text></Pressable></View>
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background }, content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 10, paddingBottom: 40 },
  top: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 }, brandHome: { flex: 1, flexDirection: 'row', alignItems: 'center' }, mark: { width: 30, height: 30, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', marginRight: 10 }, markText: { color: c.accentInk, fontSize: 19, fontWeight: '900' }, brand: { color: c.text, letterSpacing: 2.4, fontSize: 13, fontWeight: '800' }, pill: { color: c.muted, borderColor: c.line, borderWidth: 1, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7, fontSize: 9, letterSpacing: 1.4, fontWeight: '700' },
  back: { marginBottom: 15 }, backText: { color: c.accent, fontSize: 14, fontWeight: '700' }, eyebrow: { color: c.accent, fontSize: 10, letterSpacing: 1.7, fontWeight: '800', marginBottom: 10 }, title: { color: c.text, fontSize: 32, lineHeight: 36, fontWeight: '800' }, body: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 15 },
  addButton: { minHeight: 46, borderRadius: 11, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, addButtonText: { color: c.accentInk, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 }, editor: { backgroundColor: c.panel, borderRadius: 14, borderWidth: 1, borderColor: c.accent, padding: 13, marginBottom: 14 }, editorHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, editorTitle: { color: c.text, fontSize: 15, fontWeight: '800' }, cancel: { color: c.muted, fontSize: 9, fontWeight: '800' }, label: { color: c.muted, fontSize: 9, letterSpacing: 0.8, fontWeight: '800', marginTop: 10, marginBottom: 6 }, input: { minHeight: 42, borderRadius: 9, backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, color: c.text, paddingHorizontal: 10, fontSize: 12 }, description: { minHeight: 120, paddingVertical: 10, lineHeight: 18 }, categoryScroller: { marginTop: 6 }, categoryScrollerHeader: { minHeight: 31, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, categoryScrollerHint: { color: c.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.6 }, categoryScrollerControls: { flexDirection: 'row', gap: 5 }, categoryArrow: { width: 28, height: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent, borderRadius: 7 }, categoryArrowText: { color: c.accentInk, fontSize: 17, lineHeight: 20, fontWeight: '900' }, categoryList: { flexDirection: 'row', gap: 6, paddingVertical: 7 }, categoryChip: { minHeight: 32, borderRadius: 18, borderWidth: 1, borderColor: c.line, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' }, categoryChipSelected: { backgroundColor: c.accent, borderColor: c.accent }, categoryText: { color: c.muted, fontSize: 9, fontWeight: '800' }, categoryTextSelected: { color: c.accentInk }, saveButton: { minHeight: 42, borderRadius: 9, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', marginTop: 13 }, saveButtonText: { color: c.accentInk, fontSize: 10, fontWeight: '900' }, disabled: { opacity: 0.55 },
  notice: { color: c.accent, backgroundColor: c.raised, padding: 11, borderRadius: 9, fontSize: 11, lineHeight: 16, marginBottom: 10 }, errorBox: { backgroundColor: '#30231F', borderColor: '#765146', borderWidth: 1, borderRadius: 10, padding: 11, marginBottom: 10 }, errorText: { color: '#FFB2A1', fontSize: 11, lineHeight: 16 }, errorHint: { color: '#E9C8BE', fontSize: 10, lineHeight: 15, marginTop: 7 }, search: { minHeight: 44, color: c.text, backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: 10, paddingHorizontal: 11, marginBottom: 7 }, listHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 12, marginBottom: 10 }, listHeadingTitle: { flexDirection: 'row', alignItems: 'baseline', gap: 9 }, listScrollHint: { color: c.muted, fontSize: 7, fontWeight: '800', letterSpacing: 0.5 }, sectionTitle: { color: c.text, fontSize: 18, fontWeight: '800' }, count: { color: c.muted, fontSize: 10, fontWeight: '800' }, exerciseListScroll: { height: 330, flexGrow: 0, flexShrink: 1 }, list: { gap: 8, paddingBottom: 2 }, exerciseCard: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 12 }, exerciseHead: { flexDirection: 'row', alignItems: 'center', gap: 10 }, exerciseInfo: { flex: 1 }, exerciseName: { color: c.text, fontSize: 13, fontWeight: '800' }, exerciseEnglish: { color: c.muted, fontSize: 9, marginTop: 3 }, editButton: { minHeight: 32, borderRadius: 8, borderColor: c.accent, borderWidth: 1, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, editButtonText: { color: c.accent, fontSize: 8, fontWeight: '900' }, descriptionText: { color: c.muted, fontSize: 11, lineHeight: 17, marginTop: 9 }, empty: { color: c.muted, fontSize: 12, textAlign: 'center', paddingVertical: 20 }, sources: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 13, marginTop: 20 }, sourcesTitle: { color: c.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 }, sourcesText: { color: c.muted, fontSize: 10, lineHeight: 15, marginTop: 6 }, sourceLink: { color: c.accent, fontSize: 10, fontWeight: '800', marginTop: 9 },
});
