import type { PlannedSetTarget, ProgressionType, TrainingDay } from '@/lib/plans';

export const TRAINER_PLAN_TEMPLATE = [
  'Dzień;Nazwa dnia;Ćwiczenie;Seria;Powt. od;Powt. do;Ciężar kg;Opis ćwiczenia;Link YouTube;Progresja (%/kg/powt.);Wartość progresji',
  '1;Góra ciała;Wyciskanie na ławce;1;3;5;50;Łopatki ściągnięte, stopy stabilnie;;kg;2,5',
  '1;Góra ciała;Wyciskanie na ławce;2;5;8;30;Łopatki ściągnięte, stopy stabilnie;;kg;2,5',
  '2;Dół ciała;Przysiad;1;6;8;60;Zachowaj stabilny tułów;;;',
  '2;Dół ciała;Przysiad;2;6;8;60;Zachowaj stabilny tułów;;;',
  '2;Dół ciała;Przysiad;3;6;8;60;Zachowaj stabilny tułów;;;',
].join('\r\n');

export function spreadsheetRowsToTsv(rows: unknown[][]) {
  return rows.map((row) => row.map((cell) => {
    const value = String(cell ?? '');
    return /[\t\r\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join('\t')).join('\n');
}

type ExerciseRows = {
  name: string;
  description: string;
  youtubeUrl: string;
  progressionType: ProgressionType | null;
  progressionAmount: number;
  setRows: Map<number, PlannedSetTarget>;
};

function parseDelimitedRows(input: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      row.push(cell.trim()); cell = '';
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = '';
    } else cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function detectDelimiter(input: string) {
  const firstLine = input.split(/\r?\n/, 1)[0] ?? '';
  const counts = { '\t': 0, ';': 0, ',': 0 };
  let quoted = false;
  for (let index = 0; index < firstLine.length; index += 1) {
    const character = firstLine[index];
    if (character === '"') quoted = !quoted;
    else if (!quoted && character in counts) counts[character as keyof typeof counts] += 1;
  }
  if (counts['\t']) return '\t';
  return counts[';'] >= counts[','] ? ';' : ',';
}

function numberCell(value: string, rowNumber: number, label: string) {
  const number = Number(value.replace(',', '.'));
  if (!Number.isFinite(number)) throw new Error(`Wiersz ${rowNumber}: sprawdź kolumnę „${label}”.`);
  return number;
}

function parseProgression(value: string, rowNumber: number): ProgressionType | null {
  const normalized = value.trim().toLocaleLowerCase('pl-PL');
  if (!normalized) return null;
  if (['%', 'procent', 'procenty'].includes(normalized)) return 'percent';
  if (['kg', 'kilogram', 'kilogramy'].includes(normalized)) return 'kilograms';
  if (['powt.', 'powt', 'powtórzenia', 'powtorzenia'].includes(normalized)) return 'repetitions';
  throw new Error(`Wiersz ${rowNumber}: progresja musi mieć wartość %, kg albo powt.`);
}

export function parsePlanSpreadsheet(input: string): TrainingDay[] {
  const content = input.replace(/^\uFEFF/, '').trim();
  if (!content) throw new Error('Wklej wiersze z arkusza, aby zaimportować plan.');

  const rows = parseDelimitedRows(content, detectDelimiter(content));
  const firstCell = rows[0]?.[0]?.toLocaleLowerCase('pl-PL') ?? '';
  const hasHeader = firstCell.includes('dzień') || firstCell.includes('dzien');
  if (hasHeader) rows.shift();
  if (!rows.length) throw new Error('Arkusz nie zawiera wierszy z ćwiczeniami.');

  const dayNames = new Map<number, string>();
  const exercisesByDay = new Map<number, Map<string, ExerciseRows>>();

  rows.forEach((row, index) => {
    const rowNumber = index + (hasHeader ? 2 : 1);
    if (row.length < 7) throw new Error(`Wiersz ${rowNumber}: brakuje kolumn. Użyj szablonu i wklej cały wiersz.`);
    const dayNumber = numberCell(row[0], rowNumber, 'Dzień');
    const suppliedDayName = row[1] ?? '';
    const name = row[2];
    const setNumber = numberCell(row[3], rowNumber, 'Seria');
    const repsMin = numberCell(row[4], rowNumber, 'Powt. od');
    const repsMax = numberCell(row[5], rowNumber, 'Powt. do');
    const weight = numberCell(row[6], rowNumber, 'Ciężar kg');

    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 7) throw new Error(`Wiersz ${rowNumber}: numer dnia musi być od 1 do 7.`);
    if (!name) throw new Error(`Wiersz ${rowNumber}: podaj nazwę ćwiczenia.`);
    if (!Number.isInteger(setNumber) || setNumber < 1) throw new Error(`Wiersz ${rowNumber}: numer serii musi być liczbą całkowitą od 1.`);
    if (!Number.isInteger(repsMin) || !Number.isInteger(repsMax) || repsMin < 1 || repsMax < repsMin) throw new Error(`Wiersz ${rowNumber}: zakres powtórzeń jest nieprawidłowy.`);
    if (weight < 0) throw new Error(`Wiersz ${rowNumber}: ciężar nie może być ujemny.`);

    const description = row[7] ?? '';
    const youtubeUrl = row[8] ?? '';
    const progressionType = parseProgression(row[9] ?? '', rowNumber);
    const suppliedProgressionAmount = row[10] ? numberCell(row[10], rowNumber, 'Wartość progresji') : null;
    if ((suppliedProgressionAmount ?? 0) < 0 || (progressionType === 'repetitions' && suppliedProgressionAmount !== null && !Number.isInteger(suppliedProgressionAmount))) throw new Error(`Wiersz ${rowNumber}: wartość progresji jest nieprawidłowa.`);
    if (!progressionType && suppliedProgressionAmount !== null && suppliedProgressionAmount > 0) throw new Error(`Wiersz ${rowNumber}: wybierz typ progresji: %, kg albo powt.`);
    if (youtubeUrl && !/^https:\/\/(www\.)?(youtube\.com|m\.youtube\.com|youtu\.be)\/\S+$/i.test(youtubeUrl)) throw new Error(`Wiersz ${rowNumber}: link do filmu musi prowadzić do YouTube.`);

    const exercises = exercisesByDay.get(dayNumber) ?? new Map<string, ExerciseRows>();
    const key = name.toLocaleLowerCase('pl-PL');
    const existing = exercises.get(key);
    const exercise = existing ?? { name, description: '', youtubeUrl: '', progressionType: null, progressionAmount: 0, setRows: new Map<number, PlannedSetTarget>() };
    if ((description && exercise.description && exercise.description !== description) || (youtubeUrl && exercise.youtubeUrl && exercise.youtubeUrl !== youtubeUrl)) {
      throw new Error(`Wiersz ${rowNumber}: opis i link do filmu muszą być takie same dla ćwiczenia „${name}”.`);
    }
    if (progressionType && exercise.progressionType && exercise.progressionType !== progressionType) {
      throw new Error(`Wiersz ${rowNumber}: typ progresji musi być taki sam dla ćwiczenia „${name}”.`);
    }
    if (suppliedProgressionAmount !== null && exercise.progressionAmount > 0 && exercise.progressionAmount !== suppliedProgressionAmount) {
      throw new Error(`Wiersz ${rowNumber}: wartość progresji musi być taka sama dla ćwiczenia „${name}”.`);
    }
    const previousDayName = dayNames.get(dayNumber);
    if (suppliedDayName && previousDayName && previousDayName !== `Dzień ${dayNumber}` && previousDayName !== suppliedDayName) throw new Error(`Wiersz ${rowNumber}: nazwa dnia musi być taka sama dla wszystkich jego ćwiczeń.`);
    if (suppliedDayName) dayNames.set(dayNumber, suppliedDayName);
    else if (!previousDayName) dayNames.set(dayNumber, `Dzień ${dayNumber}`);
    exercise.description = description || exercise.description;
    exercise.youtubeUrl = youtubeUrl || exercise.youtubeUrl;
    exercise.progressionType = progressionType ?? exercise.progressionType;
    exercise.progressionAmount = suppliedProgressionAmount ?? exercise.progressionAmount;
    if (exercise.setRows.has(setNumber)) throw new Error(`Wiersz ${rowNumber}: seria ${setNumber} ćwiczenia „${name}” jest wpisana więcej niż raz.`);
    exercise.setRows.set(setNumber, { repsMin, repsMax, targetWeight: weight });
    exercises.set(key, exercise);
    exercisesByDay.set(dayNumber, exercises);
  });

  return [...exercisesByDay.entries()].sort(([a], [b]) => a - b).map(([dayNumber, exercises]) => ({
    id: `import-day-${Date.now()}-${dayNumber}`,
    name: dayNames.get(dayNumber) || `Dzień ${dayNumber}`,
    exercises: [...exercises.values()].map((exercise, index) => {
      const setTargets = [...exercise.setRows.entries()].sort(([a], [b]) => a - b).map(([, target]) => target);
      if (exercise.setRows.size !== setTargets.length || [...exercise.setRows.keys()].some((setNumber, index) => setNumber !== index + 1)) {
        throw new Error(`Ćwiczenie „${exercise.name}” w dniu ${dayNumber}: serie muszą być ponumerowane kolejno od 1.`);
      }
      const [firstSet] = setTargets;
      return {
        id: `import-exercise-${Date.now()}-${dayNumber}-${index}`,
        name: exercise.name,
        description: exercise.description,
        ...(exercise.youtubeUrl ? { youtubeUrl: exercise.youtubeUrl } : {}),
        sets: setTargets.length,
        repsMin: firstSet.repsMin,
        repsMax: firstSet.repsMax,
        targetWeight: firstSet.targetWeight,
        setTargets,
        ...(exercise.progressionType && exercise.progressionAmount > 0 ? { progression: { type: exercise.progressionType, amount: exercise.progressionAmount } } : {}),
      };
    }),
  }));
}
