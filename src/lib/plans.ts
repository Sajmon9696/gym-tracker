export const PLANS_KEY = 'progres.plans.v1';
export const SESSIONS_KEY = 'progres.sessions.v1';
export const ASSIGNED_PLANS_KEY = 'progres.assigned-plans.v1';

export function userStorageKey(key: string, userId?: string) {
  return userId ? `${key}.user.${userId}` : key;
}

export type ProgressionType = 'percent' | 'kilograms' | 'repetitions';

export type WeeklyProgression = {
  type: ProgressionType;
  amount: number;
};

export type PlannedSetTarget = {
  repsMin: number;
  repsMax: number;
  targetWeight: number;
};

export type PlannedExercise = {
  id: string;
  name: string;
  description?: string;
  youtubeUrl?: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  targetWeight: number;
  setTargets?: PlannedSetTarget[];
  progression?: WeeklyProgression;
};

export type TrainingDay = {
  id: string;
  name: string;
  exercises: PlannedExercise[];
};

export type TrainingPlan = {
  id: string;
  name: string;
  days: TrainingDay[];
  createdAt: string;
  completedAt?: string;
  ownerId?: string;
  assignedTo?: string;
};

export type CompletedSet = { reps: number; weight: number };
export type CompletedExercise = { exerciseId: string; name?: string; sets: CompletedSet[] };
export type TrainingSession = {
  id: string;
  planId: string;
  dayId: string;
  completedAt: string;
  exercises: CompletedExercise[];
  skipped?: boolean;
};

export type TrainingReport = {
  id: string;
  traineeId: string;
  trainerId: string;
  planId: string;
  sessionIds: string[];
  sessions: TrainingSession[];
  exerciseComments: Record<string, string>;
  createdAt: string;
};

