import AsyncStorage from '@react-native-async-storage/async-storage';
import { EXERCISE_CATALOG, type CatalogExercise, type ExerciseCategory } from '@/lib/exercise-catalog';
import { getExerciseGuide } from '@/lib/exercise-guides';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const LOCAL_CATALOG_KEY = 'progres.exercise-catalog.v1';

export type StoredExercise = CatalogExercise & { id: string; created_by?: string | null };

function normalizeIdPart(value: string) {
  return value.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function getBuiltinExerciseId(exercise: Pick<CatalogExercise, 'pl' | 'category'>) {
  return `builtin-${normalizeIdPart(exercise.category)}-${normalizeIdPart(exercise.pl)}`;
}

export function getExerciseDescription(exercise: Pick<CatalogExercise, 'pl' | 'description'>) {
  return exercise.description?.trim() || getExerciseGuide(exercise.pl);
}

export function getDefaultExerciseCatalog(): StoredExercise[] {
  return EXERCISE_CATALOG.map((exercise) => ({
    ...exercise,
    id: getBuiltinExerciseId(exercise),
    description: getExerciseGuide(exercise.pl),
  }));
}

export async function loadTrainerExerciseCatalog(): Promise<StoredExercise[]> {
  if (!isSupabaseConfigured || !supabase) {
    const local = await AsyncStorage.getItem(LOCAL_CATALOG_KEY);
    return mergeExerciseCatalog(local ? JSON.parse(local) as StoredExercise[] : []);
  }

  const { data, error } = await supabase
    .from('exercise_catalog')
    .select('id, pl, en, category, description, created_by');
  if (error) throw error;
  return mergeExerciseCatalog((data ?? []) as StoredExercise[]);
}

export async function saveTrainerCatalogExercise(exercise: Omit<StoredExercise, 'created_by'>) {
  if (!isSupabaseConfigured || !supabase) {
    const local = await AsyncStorage.getItem(LOCAL_CATALOG_KEY);
    const current = local ? JSON.parse(local) as StoredExercise[] : [];
    const next = [...current.filter((item) => item.id !== exercise.id), exercise];
    await AsyncStorage.setItem(LOCAL_CATALOG_KEY, JSON.stringify(next));
    return;
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('Zaloguj się jako trener, aby edytować atlas ćwiczeń.');
  const { error } = await supabase.from('exercise_catalog').upsert({
    ...exercise,
    created_by: authData.user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export function mergeExerciseCatalog(overrides: StoredExercise[]): StoredExercise[] {
  const entries = new Map(getDefaultExerciseCatalog().map((exercise) => [exercise.id, exercise]));
  for (const override of overrides) {
    const builtin = entries.get(override.id);
    entries.set(override.id, {
      ...builtin,
      ...override,
      category: override.category as ExerciseCategory,
      description: override.description?.trim() || builtin?.description || getExerciseGuide(override.pl),
    });
  }
  return [...entries.values()].sort((left, right) => left.category.localeCompare(right.category, 'pl') || left.pl.localeCompare(right.pl, 'pl'));
}
