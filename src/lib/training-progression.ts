import type { CompletedSet, ExerciseMetric, PlannedExercise, PlannedSetTarget, TrainingPlan, TrainingReport, TrainingSession } from '@/lib/plans';

export function formatSetResult(set: CompletedSet, metric: ExerciseMetric = 'load', exercise?: PlannedExercise) {
  if (metric === 'time') return `${set.reps} s`;
  if (metric === 'distance') return `${set.reps} m · ${set.weight} kg`;
  if (metric === 'machine') return `${set.weight} kg × ${set.reps} powt.`;
  if (metric === 'band') return `${set.bandColor ?? exercise?.bandColor ?? 'guma'} · ${set.weight ? `${set.weight} kg · ` : ''}pomoc ${set.assistanceLevel ?? exercise?.assistanceLevel ?? 'brak'} · ${set.reps} powt.`;
  return `${set.weight} kg × ${set.reps}`;
}

/** Builds each set's next target from completed sessions in the exercise's plan day. */
export function getExerciseTargets(plan: TrainingPlan, exercise: PlannedExercise, sessions: TrainingSession[]) {
  let setTargets: PlannedSetTarget[] = exercise.setTargets?.length
    ? exercise.setTargets.map((target) => ({ ...target, suggestedReps: target.suggestedReps ?? target.repsMin }))
    : Array.from({ length: exercise.sets }, () => ({ repsMin: exercise.repsMin, repsMax: exercise.repsMax, suggestedReps: exercise.repsMin, targetWeight: exercise.targetWeight }));
  const dayId = plan.days.find((day) => day.exercises.some((item) => item.id === exercise.id))?.id;
  const history = sessions
    .filter((session) => session.planId === plan.id && session.dayId === dayId)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));

  for (const session of history) {
    const completed = session.exercises.find((item) => item.exerciseId === exercise.id);
    if (!completed?.sets.length || (completed.metric && completed.metric !== (exercise.metric ?? 'load'))) continue;
    setTargets = setTargets.map((target, index) => {
      const completedSet = completed.sets[index];
      if (!completedSet) return target;
      let weight = completedSet.weight;
      let repsMin = target.repsMin;
      let repsMax = target.repsMax;
      let suggestedReps = target.suggestedReps ?? repsMin;
      if (completedSet.reps >= repsMin && completedSet.reps < repsMax) suggestedReps = Math.min(repsMax, completedSet.reps + 1);
      else if (completedSet.reps >= repsMax) suggestedReps = repsMin;
      const suggestAddMachineStack = exercise.metric === 'machine' && completedSet.reps >= repsMax;
      let assistanceLevel = completedSet.assistanceLevel ?? target.assistanceLevel ?? exercise.assistanceLevel;
      const progression = exercise.progression;
      if (completedSet.reps >= target.repsMax && progression && progression.amount > 0) {
        if (progression.type === 'machine-step') {
          // Machine stacks vary; keep the entered kg and show a cue instead of guessing.
        } else if (progression.type === 'kilograms' || progression.type === 'band-kilograms') weight += progression.amount;
        else if (progression.type === 'percent') {
          // Percentage increments are always measured from the plan's starting weight.
          const startingWeight = exercise.setTargets?.[index]?.targetWeight ?? exercise.targetWeight;
          weight += startingWeight * progression.amount / 100;
        } else if (progression.type === 'seconds' || progression.type === 'repetitions' || progression.type === 'meters') {
          repsMin += progression.amount;
          repsMax += progression.amount;
          suggestedReps = Math.min(repsMax, completedSet.reps + progression.amount);
        } else if (progression.type === 'band-assistance') {
          const levels = ['duża', 'średnia', 'mała', 'brak'] as const;
          const currentIndex = levels.indexOf(assistanceLevel ?? 'duża');
          const nextIndex = Math.min(currentIndex + 1, levels.length - 1);
          assistanceLevel = levels[nextIndex];
        }
      }
      if (exercise.metric === 'distance' && completedSet.reps >= target.repsMax && exercise.loadProgression && exercise.loadProgression.amount > 0) {
        if (exercise.loadProgression.type === 'percent') {
          const startingWeight = exercise.setTargets?.[index]?.targetWeight ?? exercise.targetWeight;
          weight += startingWeight * exercise.loadProgression.amount / 100;
        } else if (exercise.loadProgression.type === 'kilograms') {
          weight += exercise.loadProgression.amount;
        }
      }
      return {
        ...target,
        repsMin,
        repsMax,
        suggestedReps,
        suggestAddMachineStack,
        targetWeight: Math.round(weight * 100) / 100,
        ...(completedSet.bandColor ? { bandColor: completedSet.bandColor } : {}),
        ...(assistanceLevel ? { assistanceLevel } : {}),
      };
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
