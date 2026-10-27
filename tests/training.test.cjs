const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getExerciseTargets, getNextUnreportedMicrocycle } = require('../src/lib/training-progression.ts');
const { parsePlanSpreadsheet, TRAINER_PLAN_TEMPLATE } = require('../src/lib/plan-spreadsheet.ts');

function fixture(progression = { type: 'percent', amount: 10 }) {
  const exercise = { id: 'exercise', name: 'Przysiad', sets: 2, repsMin: 6, repsMax: 8, targetWeight: 100, progression };
  const plan = { id: 'plan', name: 'Test', createdAt: '2026-10-01', days: [{ id: 'day', name: 'A', exercises: [exercise] }] };
  return { exercise, plan };
}
function workout(id, weight, reps, extra = {}) {
  return { id, planId: 'plan', dayId: 'day', completedAt: `2026-10-${id.padStart(2, '0')}T10:00:00Z`,
    exercises: [{ exerciseId: 'exercise', sets: [{ weight, reps }, { weight, reps }] }], ...extra };
}

test('procent progresji pozostaje liczony od ciężaru początkowego', () => {
  const { plan, exercise } = fixture();
  assert.equal(getExerciseTargets(plan, exercise, [workout('1', 100, 8), workout('2', 110, 8)]).weight, 120);
});
test('progresja wymaga osiągnięcia górnego zakresu danej serii', () => {
  const { plan, exercise } = fixture({ type: 'kilograms', amount: 2.5 });
  const previous = workout('1', 100, 7);
  assert.equal(getExerciseTargets(plan, exercise, [previous]).weight, 100);
  previous.exercises[0].sets[0].reps = 8;
  assert.deepEqual(getExerciseTargets(plan, exercise, [previous]).setTargets.map((set) => set.targetWeight), [102.5, 100]);
});
test('pominięte ćwiczenie zachowuje wykonane serie; brakujące nie uruchamiają progresji', () => {
  const { plan, exercise } = fixture({ type: 'kilograms', amount: 2.5 });
  const previous = workout('1', 100, 8);
  previous.exercises[0].skipped = true;
  previous.exercises[0].sets = previous.exercises[0].sets.slice(0, 1);
  assert.deepEqual(getExerciseTargets(plan, exercise, [previous]).setTargets.map((set) => set.targetWeight), [102.5, 100]);
});
test('nieregularne serie mają niezależne podstawy progresji procentowej', () => {
  const { plan, exercise } = fixture();
  exercise.setTargets = [{ repsMin: 3, repsMax: 5, targetWeight: 50 }, { repsMin: 5, repsMax: 8, targetWeight: 30 }];
  const previous = workout('1', 50, 5);
  previous.exercises[0].sets[1] = { weight: 30, reps: 8 };
  assert.deepEqual(getExerciseTargets(plan, exercise, [previous]).setTargets.map((set) => set.targetWeight), [55, 33]);
});
test('zmiana identyfikatora ćwiczenia nie dziedziczy progresji usuniętego ćwiczenia', () => {
  const { plan, exercise } = fixture();
  exercise.id = 'replacement';
  assert.equal(getExerciseTargets(plan, exercise, [workout('1', 160, 8)]).weight, 100);
});
test('raport obejmuje pominięty dzień i nie jest proponowany drugi raz po wysłaniu', () => {
  const { plan } = fixture();
  plan.days.push({ id: 'day2', name: 'B', exercises: [] });
  const first = workout('1', 100, 8);
  const skipped = workout('2', 0, 0, { dayId: 'day2', skipped: true, exercises: [] });
  const history = [skipped, first];
  assert.deepEqual(getNextUnreportedMicrocycle(plan, history, []).map((entry) => entry.id), ['1', '2']);
  assert.equal(getNextUnreportedMicrocycle(plan, history, [{ planId: 'plan', sessionIds: ['1', '2'] }]), null);
  assert.equal(getNextUnreportedMicrocycle(plan, [first], []), null);
});
test('szablon importu zachowuje nieregularne serie, progresję 2,5 kg i opisy', () => {
  const days = parsePlanSpreadsheet(TRAINER_PLAN_TEMPLATE);
  assert.equal(days.length, 2);
  assert.deepEqual(days[0].exercises[0].setTargets, [
    { repsMin: 3, repsMax: 5, targetWeight: 50 },
    { repsMin: 5, repsMax: 8, targetWeight: 30 },
  ]);
  assert.equal(days[0].exercises[0].progression.amount, 2.5);
  assert.match(days[0].exercises[0].description, /Łopatki/);
});

