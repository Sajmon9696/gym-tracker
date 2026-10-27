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
  return name.toLocaleLowerCase('pl-PL').replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function getExerciseGuide(name: string) {
  const normalized = normalizeExerciseName(name);
  const exactMatch = guides[normalized];
  if (exactMatch) return exactMatch;

  const has = (...terms: string[]) => terms.some((term) => normalized.includes(term));
  if (has('wioslowanie sztanga do brody', 'upright row')) return 'Stań stabilnie, trzymaj ciężar blisko tułowia i prowadź łokcie na boki. Unieś go tylko do zakresu, w którym barki pozostają bez bólu; opuść powoli, nie kołysząc tułowiem.';
  if (has('rotatory barku', 'external rotation', 'rotacja zewnetrzna')) return 'Ustaw łokieć przy boku lub oprzyj ramię zgodnie z wariantem. Obracaj przedramię na zewnątrz bez odrywania łokcia i bez skręcania tułowia; użyj lekkiego oporu i wróć powoli.';
  if (has('prostowanie tulowia', 'wyprost grzbietu', 'back extension', 'roman chair')) return 'Ustaw biodra na podparciu i stopy stabilnie. Opuść tułów z bioder, zachowując neutralne plecy, po czym unieś go do jednej linii z nogami; nie odginaj się mocno ponad tę pozycję.';
  if (has('skrety tulowia', 'woodchop', 'rotation', 'rotac', 'pallof', 'plate around', 'przenoszenie talerza wokol')) return 'Stań lub usiądź stabilnie i napnij brzuch. Obracaj tułów albo przeciwdziałaj obrotowi zgodnie z wariantem, utrzymując biodra pod kontrolą; wróć powoli i wykonaj ruch na obie strony, jeśli plan tego wymaga.';
  if (has('ab wheel', 'rollout', 'bear crawl')) return 'Utrzymaj żebra nad miednicą i napnij brzuch. Wysuwaj ręce lub przesuwaj ciało tylko tak daleko, by nie opadał odcinek lędźwiowy; wróć kontrolowanie, bez szarpania.';
  if (has('nozyce', 'flutter kick', 'scissor kick')) return 'Połóż się stabilnie i napnij brzuch, utrzymując lędźwie w kontakcie z podłożem. Wykonuj naprzemienne, niewielkie ruchy nóg bez rozpędu; zmniejsz zakres, jeśli plecy zaczynają się odrywać.';
  if (has('zwijanie linki', 'zwijanie nadgarstka', 'wrist roller')) return 'Trzymaj ramiona stabilnie przed sobą i obracaj nadgarstki, aby nawijać oraz rozwijać linkę. Prowadź ruch płynnie w obie strony, bez bujania tułowiem i bez puszczania ciężaru.';
  if (has('burpee', 'box jump', 'wskoki', 'wejscia na skrzyni', 'skoki na skakance', 'pajacyki', 'przeskoki boczne', 'lateral hop')) return 'Wykonuj ruch sprężyście, ale ląduj miękko na całej stopie lub śródstopiu z kolanami skierowanymi zgodnie z palcami. Utrzymuj stabilny tułów, dobierz wysokość i tempo do kontroli lądowania.';
  if (has('tureckie wstawanie', 'turkish get up')) return 'Zacznij bez obciążenia lub z lekkim ciężarem i prowadź go nad barkiem. Przechodź powoli przez kolejne pozycje podporu i klęku, patrząc na ciężar i utrzymując nadgarstek nad barkiem; wróć tą samą drogą.';
  if (has('rzut pilka', 'wall ball', 'medicine ball slam')) return 'Ustaw stopy i tułów stabilnie, nabierz siły z nóg i bioder, a następnie dynamicznie wyrzuć lub uderz piłkę w wyznaczonym kierunku. Złap ją lub przygotuj do kolejnego powtórzenia bez utraty równowagi.';
  if (has('wypychanie nog', 'leg press')) return 'Oprzyj całe stopy na platformie i dobierz ich rozstaw do wygodnego toru kolan. Opuść platformę kontrolowanie tak, by miednica nie odrywała się od oparcia, następnie wypchnij ciężar bez gwałtownego blokowania kolan.';
  if (has('pchanie san', 'ciagniecie san', 'pchanie platformy')) return 'Ustaw tułów pod lekkim pochyleniem, chwyć uchwyty i napnij brzuch. Pchaj lub ciągnij platformę krótkimi, równymi krokami, utrzymując kolana w kierunku stóp; dobierz opór tak, by zachować płynny ruch.';
  if (has('sprint', 'wchodzenie po schodach', 'wspinaczka na linie')) return 'Utrzymuj stabilny tułów i rytmiczny oddech, dobierając tempo do dystansu lub czasu odcinka. Zwiększaj intensywność stopniowo; kończ ruch po utracie kontroli nad krokiem, chwytem lub postawą.';
  if (has('pullover')) return 'Połóż się stabilnie lub ustaw się przy wyciągu, utrzymując żebra nad miednicą. Z lekko ugiętymi łokciami prowadź ciężar łukiem za głowę lub z góry do ud, nie zmieniając kąta w łokciach; wróć powoli tylko do wygodnego zakresu barków.';

  const matchingGuide = Object.entries(guides).find(([exercise]) => normalized.includes(exercise) || exercise.includes(normalized));
  if (matchingGuide) return matchingGuide[1];

  if (has('martwy ciag', 'deadlift', 'good morning', 'dzien dobry', 'pull through', 'rack pull')) return 'Ustaw stopy stabilnie, cofnij biodra i napnij brzuch. Trzymaj ciężar blisko nóg, prowadź ruch z bioder i wróć do wyprostu bez zaokrąglania pleców ani przeprostu w lędźwiach.';
  if (has('przysiad', 'squat', 'suwnica', 'leg press', 'hack', 'pendulum')) return 'Ustaw stopy stabilnie na szerokość dobraną do ćwiczenia. Ugnij biodra i kolana, prowadząc kolana w kierunku palców; zejdź tylko tak nisko, by zachować stabilny tułów i całe stopy na podłożu, po czym odepchnij się do góry.';
  if (has('wykrok', 'lunge', 'step up', 'step-up', 'wejscia na podest', 'wchodzenie na skrzyni')) return 'Stań stabilnie, zrób kontrolowany krok lub postaw całą stopę na podwyższeniu. Opuść biodra, utrzymując kolano nad stopą i tułów stabilny; odepchnij się nogą pracującą i wróć bez odbijania.';
  if (has('hip thrust', 'glute bridge', 'most biodrowy', 'frog pump', 'donkey kick', 'fire hydrant', 'wykop noga', 'odwodzenie', 'przywodzenie', 'wypychanie bioder')) return 'Ustaw miednicę i tułów stabilnie, napnij brzuch. Prowadź ruch z biodra lub nogi zgodnie z ćwiczeniem, zatrzymaj napięcie pośladka w końcowej pozycji i wróć powoli bez kołysania tułowiem.';
  if (has('wioslow', 'row', 'przyciaganie', 'face pull', 'szrugsy', 'shrug')) return 'Ustaw tułów stabilnie i rozpocznij ruch od łopatek. Przyciągnij uchwyt lub ciężar w stronę tułowia, prowadząc łokcie zgodnie z wariantem ćwiczenia; wróć powoli, nie szarpiąc i nie unosząc barków.';
  if (has('podciag', 'pull up', 'chin up', 'sciaganie', 'pulldown', 'rope climb')) return 'Ustabilizuj tułów i zacznij od opuszczenia barków oraz napięcia łopatek. Przyciągnij ciało lub drążek, prowadząc łokcie w dół; wróć kontrolowanie do wyprostu ramion bez bujania.';
  if (has('rozpiet', 'fly', 'pec deck', 'butterfly', 'crossover', 'krzyzowanie linek')) return 'Ustaw ławki lub linki tak, by ruch był wygodny dla barków. Utrzymaj lekko ugięte łokcie, otwórz ramiona do kontrolowanego rozciągnięcia i zbliż je przed sobą; nie pogłębiaj zakresu kosztem bólu ani ustawienia barków.';
  if (has('pompki', 'push up', 'dip', 'porecz')) return 'Ustaw dłonie stabilnie i utrzymaj ciało w jednej linii, napinając brzuch i pośladki. Opuść klatkę kontrolowanie między dłońmi lub do wygodnej głębokości, następnie odepchnij się bez zapadania barków.';
  if (has('wycisk', 'press', 'thruster')) return 'Ustaw stopy i tułów stabilnie. Prowadź ciężar po kontrolowanym torze, utrzymując nadgarstki nad przedramionami i nie wyginając nadmiernie pleców; wróć do pozycji startowej bez odbijania.';
  if (has('uginanie nog', 'leg curl', 'nordic', 'hamstring curl')) return 'Ustaw wałek lub zaczep stabilnie przy kostkach. Ugnij kolana, przyciągając pięty w stronę pośladków; zatrzymaj ruch bez unoszenia bioder i powoli wyprostuj nogi.';
  if (has('prostowanie nog', 'leg extension')) return 'Ustaw oś maszyny na wysokości kolana i wałek nad dolną częścią goleni. Wyprostuj kolana płynnie, zatrzymaj ruch bez gwałtownego blokowania i powoli opuść ciężar.';
  if (has('uginanie nadgarst', 'wrist curl', 'forearm', 'gripper', 'chwyt', 'hang', 'zwis')) return 'Utrzymaj przedramiona i nadgarstki w stabilnym ustawieniu. Wykonuj pełny, kontrolowany ruch dłonią lub utrzymuj chwyt bez kołysania ciałem; przerwij, jeśli pojawi się ból.';
  if (has('wspiec', 'calf raise', 'tibialis', 'lydki')) return 'Oprzyj stopy stabilnie i poruszaj się w stawie skokowym. Unieś pięty lub palce w pełnym, wygodnym zakresie, zatrzymaj skurcz na moment i opuść powoli bez odbijania.';
  if (has('plank', 'deska', 'hollow', 'l sit', 'hold', 'utrzymanie', 'dead bug', 'bird dog')) return 'Ustaw kręgosłup w wygodnej, neutralnej pozycji i napnij brzuch. Oddychaj spokojnie, utrzymuj żebra nad miednicą i nie pozwól, by biodra opadały lub obracały się; zakończ serię, gdy tracisz pozycję.';
  if (has('crunch', 'spiecia', 'brzuszki', 'sit up', 'v up', 'toe touch', 'unoszenie nog', 'leg raise', 'mountain climber')) return 'Ustaw tułów stabilnie i napnij brzuch przed ruchem. Zbliż żebra do miednicy lub unieś nogi bez rozpędu, a następnie wróć powoli; nie ciągnij szyi rękami ani nie odrywaj lędźwi w sposób niekontrolowany.';
  if (has('twist', 'woodchop', 'rotation', 'rotac', 'pallof')) return 'Stań lub usiądź stabilnie i napnij brzuch. Obracaj tułów albo przeciwdziałaj obrotowi zgodnie z wariantem, utrzymując biodra pod kontrolą; wróć powoli i wykonaj ruch na obie strony, jeśli plan tego wymaga.';
  if (has('spacer', 'carry', 'farmer', 'walizk', 'rack carry', 'sled', 'sanie')) return 'Ustaw ciężar pewnie w dłoniach lub oprzyj go zgodnie z wariantem. Napnij brzuch, utrzymuj barki stabilne i wykonuj równe kroki; nie pochylaj się na bok ani nie przyspieszaj kosztem kontroli.';
  if (has('bieg', 'run', 'marsz', 'walk', 'rower', 'bike', 'ergometr', 'rowing', 'ski erg', 'orbitrek', 'elliptical', 'stepper', 'skakanka', 'jump rope', 'plywanie', 'swimming')) return 'Ustaw urządzenie lub trasę i rozpocznij od tempa, w którym zachowujesz kontrolę. Utrzymuj płynny, rytmiczny ruch i stabilną postawę; zwiększaj tempo stopniowo, a przy bólu lub zawrotach głowy przerwij.';
  if (has('zarzut', 'clean', 'rwanie', 'snatch', 'podrzut', 'swing', 'kettlebell')) return 'Najpierw opanuj lekki wariant ruchu i ustaw bezpieczną przestrzeń. Napędzaj ciężar dynamicznie z bioder i nóg, utrzymując go blisko ciała; przyjmij lub zatrzymaj go stabilnie, nie nadrabiając ruchu przeprostem pleców.';
  if (has('uginanie', 'curl')) return 'Utrzymaj łokcie blisko tułowia lub w podparciu przewidzianym przez wariant. Ugnij ramiona bez kołysania, a następnie wyprostuj je powoli, zachowując kontrolę nad ciężarem.';
  if (has('prostowanie ramion', 'prostowanie ramienia', 'triceps', 'extension')) return 'Ustabilizuj barki i utrzymuj łokcie w miejscu przewidzianym przez ćwiczenie. Wyprostuj ramiona płynnie, nie blokując ich gwałtownie, po czym wróć powoli do pozycji startowej.';
  if (has('unoszenie', 'raise', 'wznos', 'odwrotne rozpietki')) return 'Ustaw tułów stabilnie i lekko ugnij łokcie. Unieś kończyny tylko do zakresu, który utrzymujesz bez kołysania i unoszenia barków, a następnie opuść je powoli.';
  return 'Przygotuj stanowisko i stabilną pozycję. Napnij tułów, wykonaj ruch w kontrolowanym zakresie właściwym dla ćwiczenia i spokojnie wróć do startu; zmniejsz obciążenie, jeśli nie możesz utrzymać techniki.';
}
