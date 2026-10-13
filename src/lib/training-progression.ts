import type { PlannedExercise, PlannedSetTarget, TrainingPlan, TrainingReport, TrainingSession } from '@/lib/plans';

/** Builds each set's next target from completed sessions in the exercise's plan day. */
export function getExerciseTargets(plan: TrainingPlan, exercise: PlannedExercise, sessions: TrainingSession[]) {
  let setTargets: PlannedSetTarget[] = exercise.setTargets?.length
    ? exercise.setTargets.map((target) => ({ ...target }))
    : Array.from({ length: exercise.sets }, () => ({ repsMin: exercise.repsMin, repsMax: exercise.repsMax, targetWeight: exercise.targetWeight }));
  const dayId = plan.days.find((day) => day.exercises.some((item) => item.id === exercise.id))?.id;
  const history = sessions
    .filter((session) => session.planId === plan.id && session.dayId === dayId)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));

  for (const session of history) {
    const completed = session.exercises.find((item) => item.exerciseId === exercise.id);
    if (!completed?.sets.length) continue;
    setTargets = setTargets.map((target, index) => {
      const completedSet = completed.sets[index];
      if (!completedSet) return target;
      let weight = completedSet.weight;
      let repsMin = target.repsMin;
      let repsMax = target.repsMax;
      const progression = exercise.progression;
      if (completedSet.reps >= target.repsMax && progression && progression.amount > 0) {
        if (progression.type === 'kilograms') weight += progression.amount;
        else if (progression.type === 'percent') {
          // Percentage increments are always measured from the plan's starting weight.
          const startingWeight = exercise.setTargets?.[index]?.targetWeight ?? exercise.targetWeight;
          weight += startingWeight * progression.amount / 100;
        } else {
          repsMin += progression.amount;
          repsMax += progression.amount;
        }
      }
      return { repsMin, repsMax, targetWeight: Math.round(weight * 100) / 100 };
    });
  }

  const first = setTargets[0] ?? { repsMin: exercise.repsMin, repsMax: exercise.repsMax, targetWeight: exercise.targetWeight };
  return { weight: first.targetWeight, repsMin: first.repsMin, repsMax: first.repsMax, setTargets };
}

/** Finds the oldest complete cycle that has not been sent to the trainer yet. */
export function getNextUnreportedMicrocycle(plan: TrainingPlan, sessions: TrainingSession[], reports: TrainingReport[]) {
  const expectedDayIds = new Set(plan.days.map((day) => day.id));
  if (!expectedDayIds.size) return null;
  const reportedSessionIds = new Set(reports.filter((report) => report.planId === plan.id).flatMap((report) => report.sessionIds));
  const history = sessions
    .filter((session) => session.planId === plan.id && expectedDayIds.has(session.dayId) && !reportedSessionIds.has(session.id))
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  let cycle: TrainingSession[] = [];
  let seenDays = new Set<string>();
  for (const workout of history) {
    if (seenDays.has(workout.dayId)) { cycle = []; seenDays = new Set(); }
    cycle.push(workout);
    seenDays.add(workout.dayId);
    if (seenDays.size === expectedDayIds.size) return cycle;
  }
  return null;
}

export function getReportCommentKey(sessionId: string, exerciseId: string) {
  return `${sessionId}:${exerciseId}`;
}
