export const PLANS_KEY = 'progres.plans.v1';
export const SESSIONS_KEY = 'progres.sessions.v1';
export const ASSIGNED_PLANS_KEY = 'progres.assigned-plans.v1';

export function userStorageKey(key: string, userId?: string) {
  return userId ? `${key}.user.${userId}` : key;
}

export type ExerciseMetric = 'load' | 'time' | 'band' | 'machine' | 'distance';
export type AssistanceLevel = 'duża' | 'średnia' | 'mała' | 'brak';
export type ProgressionType = 'percent' | 'kilograms' | 'repetitions' | 'seconds' | 'band-kilograms' | 'band-assistance' | 'machine-step' | 'meters';

export type WeeklyProgression = {
  type: ProgressionType;
  amount: number;
};

export type PlannedSetTarget = {
  repsMin: number;
  repsMax: number;
  /** Suggested reps for the next session, based on the last completed set. */
  suggestedReps?: number;
  /** Machine cue shown after reaching the top of the rep range. */
  suggestAddMachineStack?: boolean;
  targetWeight: number;
  bandColor?: string;
  assistanceLevel?: AssistanceLevel;
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
  metric?: ExerciseMetric;
  /** Muscle-group category used by the exercise picker. */
  category?: string;
  bandColor?: string;
  bandResistanceKg?: number;
  assistanceLevel?: AssistanceLevel;
  /** Ordered machine stack values used to suggest the next available pin/plate. */
  progressionValues?: number[];
  setTargets?: PlannedSetTarget[];
  progression?: WeeklyProgression;
  /** Optional independent load increase for distance exercises. */
  loadProgression?: WeeklyProgression;
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
  revision?: number;
  updatedAt?: string;
  completedAt?: string;
  building?: boolean;
  ownerId?: string;
  assignedTo?: string;
};

export type CompletedSet = { reps: number; weight: number; bandColor?: string; assistanceLevel?: AssistanceLevel };
export type CompletedExercise = { exerciseId: string; name?: string; metric?: ExerciseMetric; sets: CompletedSet[]; skipped?: boolean };
export type TrainingSession = {
  id: string;
  startedAt?: string;
  /** Immutable plan and actual suggested targets at workout start. */
  planSnapshot?: TrainingPlan;
  targetDay?: TrainingDay;
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

