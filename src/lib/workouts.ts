export const WORKOUTS_KEY = 'progres.workouts.v1';

export type WorkoutEntry = {
  id: string;
  exercise: string;
  weight: number;
  sets: number;
  reps: number;
  createdAt: string;
};
