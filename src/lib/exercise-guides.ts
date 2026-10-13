const guides: Record<string, string> = {
  'wyciskanie na lawce': 'Połóż stopy stabilnie na podłodze. Opuść sztangę kontrolowanie do klatki piersiowej, a następnie wyciśnij ją w górę.',
  'wyciskanie sztangi na lawce': 'Połóż stopy stabilnie na podłodze. Opuść sztangę kontrolowanie do klatki piersiowej, a następnie wyciśnij ją w górę.',
  'wyciskanie hantli na lawce': 'Trzymaj hantle nad klatką piersiową. Opuść je powoli po bokach, a następnie wyciśnij w górę bez zderzania hantli.',
  'przysiad': 'Stań na szerokość barków. Cofnij biodra, ugnij kolana i zejdź w dół, utrzymując stabilne stopy oraz proste plecy.',
  'przysiady ze sztanga': 'Ustaw sztangę stabilnie na plecach. Cofnij biodra, zejdź kontrolowanie w dół i wróć do pozycji stojącej, nie odrywając pięt.',
  'martwy ciag': 'Ustaw stopy pod sztangą. Napnij brzuch i utrzymując plecy w stabilnej pozycji, wstań ze sztangą blisko nóg.',
  'wioslowanie': 'Pochyl tułów i utrzymuj stabilne plecy. Przyciągnij ciężar do dolnej części brzucha, ściągając łopatki.',
  'wioslowanie sztanga': 'Pochyl tułów, napnij brzuch i przyciągnij sztangę do dolnej części brzucha. Opuść ją powoli.',
  'sciaganie drazka wyciagu gornego': 'Usiądź stabilnie i chwyć drążek szerzej niż barki. Przyciągnij go do górnej części klatki, prowadząc łokcie w dół.',
  'podciaganie': 'Zawiśnij na drążku. Ściągnij łopatki i podciągnij się, aż broda znajdzie się nad drążkiem, po czym opuść się kontrolowanie.',
  'wyciskanie zolnierskie': 'Stań stabilnie i napnij brzuch. Wyciśnij sztangę nad głowę, nie odchylając tułowia, a następnie opuść ją do barków.',
  'wyciskanie hantli nad glowe': 'Usiądź lub stań stabilnie. Wyciśnij hantle nad głowę, nie wyginając pleców, i opuść je do wysokości barków.',
  'unoszenie hantli bokiem': 'Lekko ugnij łokcie i unoś hantle bokiem do wysokości barków. Wykonuj ruch bez kołysania tułowiem.',
  'uginanie ramion ze sztanga': 'Trzymaj łokcie blisko tułowia. Ugnij ramiona, unosząc sztangę, a następnie opuść ją powoli bez bujania ciałem.',
  'prostowanie ramion na wyciagu': 'Trzymaj łokcie przy tułowiu. Wyprostuj ramiona w dół, a następnie wróć powoli do pozycji początkowej.',
  'wyciskanie na maszynie': 'Ustaw siedzisko tak, aby uchwyty znajdowały się na wysokości klatki. Wypchnij ciężar i wróć powoli, nie blokując łokci.',
  'wypychanie na suwnicy': 'Ustaw stopy stabilnie na platformie. Opuść ciężar, uginając kolana, a następnie wypchnij go bez blokowania kolan.',
  'prostowanie nog na maszynie': 'Usiądź stabilnie i wyprostuj nogi, unosząc wałek. Opuść ciężar powoli, nie odbijając go.',
  'uginanie nog na maszynie': 'Ustaw wałek nad piętami. Ugnij nogi, przyciągając wałek, a następnie powoli wróć do pozycji początkowej.',
  'wspiecia na palce': 'Stań stabilnie i unieś pięty najwyżej, jak możesz. Zatrzymaj ruch na chwilę i opuść pięty kontrolowanie.',
};

function normalizeExerciseName(name: string) {
  return name.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function getExerciseGuide(name: string) {
  const normalized = normalizeExerciseName(name);
  const exactMatch = guides[normalized];
  if (exactMatch) return exactMatch;

  const matchingGuide = Object.entries(guides).find(([exercise]) => normalized.includes(exercise) || exercise.includes(normalized));
  if (matchingGuide) return matchingGuide[1];

  return 'Ustaw stabilną pozycję i napnij mięśnie tułowia. Wykonuj ruch spokojnie, kontrolując opuszczanie ciężaru i unikając szarpania.';
}
