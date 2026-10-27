// Dane operatora potwierdzone przez właściciela. Przed publikacją zobacz docs/GOOGLE-BRANDING.md.
export const operator = { name: 'Szymon Sroka', country: 'Polska', email: 'szymon.sroka96@gmail.com' } as const;

export type InformationSection = {
  title: string;
  paragraphs: string[];
  links?: { label: string; href: `https://${string}` }[];
};

export const privacySections: InformationSection[] = [
  {
    title: '1. Administrator i kontakt',
    paragraphs: [
      `Administratorem danych w aplikacji Progres jest ${operator.name}, ${operator.country}. W sprawach konta i prywatności napisz na ${operator.email}.`,
      'Progres pomaga układać plany, zapisywać treningi i współpracować z trenerem. Dokument opisuje wersję korzystającą ze wspólnego zapisu w chmurze.',
    ],
  },
  {
    title: '2. Jakie dane zapisujemy',
    paragraphs: [
      'Dane konta: identyfikator, imię i nazwisko, e-mail, typ profilu, kod trenera i powiązanie z trenerem. Przy rejestracji e-mailem dane uwierzytelniające obsługuje Supabase Auth.',
      'Dane treningowe: plany, dni, ćwiczenia, opisy, linki do filmów, cele serii, ciężary, powtórzenia, progresja, daty, pominięcia, raporty i komentarze. Dane wprowadzasz Ty lub Twój trener.',
      'Dostawcy obsługujący aplikację mogą otrzymywać dane techniczne, w tym adres IP, czas żądania, dane przeglądarki i informacje o błędach. Nie wpisuj do komentarzy diagnoz, dokumentacji medycznej ani zbędnych danych innych osób.',
    ],
  },
  {
    title: '3. Cele i podstawy przetwarzania',
    paragraphs: [
      'Prowadzenie konta, synchronizacja treningów i wybrane funkcje współpracy z trenerem służą wykonaniu umowy o korzystanie z aplikacji (art. 6 ust. 1 lit. b RODO). Bez danych wymaganych do konta nie można korzystać z zapisywania wyników.',
      'Obsługa zgłoszeń i ochrona przed nadużyciami mogą opierać się na uzasadnionym interesie administratora: zapewnieniu bezpiecznej usługi (art. 6 ust. 1 lit. f RODO). Jeśli przepis nakazuje zachowanie danych, podstawą jest obowiązek prawny (art. 6 ust. 1 lit. c RODO).',
      'Sugestie progresji wynikają z ustawień planu i zapisanych wyników. Nie podejmujemy na ich podstawie zautomatyzowanych decyzji wywołujących skutki prawne lub podobnie istotnie wpływających na użytkownika.',
    ],
  },
  {
    title: '4. Logowanie przez Google',
    paragraphs: [
      'Google przekazuje do Supabase identyfikator, e-mail i podstawowe dane profilu, takie jak nazwa i ewentualne zdjęcie. Progres wykorzystuje te informacje do logowania i utworzenia lub połączenia profilu. Nie otrzymuje hasła do Google.',
      'Samo logowanie nie daje dostępu do Gmaila ani arkuszy. Dostęp można cofnąć w ustawieniach konta Google; nie usuwa to automatycznie konta Progres i treningów.',
    ],
    links: [{ label: 'Połączenia na koncie Google', href: 'https://myaccount.google.com/connections' }],
  },
  {
    title: '5. Opcjonalne arkusze i filmy',
    paragraphs: [
      'Jeśli import Google Sheets jest dostępny i go uruchomisz, osobny ekran Google poprosi o dostęp tylko do odczytu arkuszy. Uprawnienie obejmuje wszystkie Twoje arkusze; Progres odczytuje pierwszą kartę arkusza ze wskazanego linku, w kolumnach A–K. Nie zmienia arkusza. Dane przechodzą przez funkcję Supabase do formularza importu, a po zapisaniu stają się częścią planu.',
      'Funkcja importu używa tokenu Google do obsługi danego żądania i nie zapisuje go w tabelach aplikacji. Dane Google służą udostępnieniu tych funkcji, nie reklamom ani sprzedaży danych.',
      'Uruchomienie filmu otwiera YouTube lub jego odtwarzacz. Google otrzymuje wtedy dane połączenia i może korzystać z własnych mechanizmów zapisu na urządzeniu. Film nie jest wymagany do zapisania treningu.',
    ],
    links: [{ label: 'Polityka prywatności Google', href: 'https://policies.google.com/privacy' }],
  },
  {
    title: '6. Dostęp do danych i dostawcy',
    paragraphs: [
      'Po połączeniu kodem trenera trener ma dostęp do profilu podopiecznego, jego planów, wyników i przesłanych raportów. Może edytować plany i zapisywać treningi w imieniu podopiecznego. Podopieczny widzi dane powiązanego trenera. W sprawie zakończenia powiązania napisz do administratora.',
      'Supabase obsługuje konta, bazę i funkcje serwerowe, Expo udostępnia wersję internetową, a Google obsługuje wybrane integracje. Administrator może potrzebować dostępu do obsługi zgłoszenia. Wyniki nie trafiają do publicznej listy.',
      'Dostawcy mogą korzystać z infrastruktury i podwykonawców poza Europejskim Obszarem Gospodarczym. Informacje o miejscach przetwarzania i stosowanych zabezpieczeniach opisują dokumenty dostawców wskazane poniżej. W sprawie przetwarzania danych przez Progres możesz napisać do administratora.',
    ],
    links: [
      { label: 'Prywatność w Supabase', href: 'https://supabase.com/privacy' },
      { label: 'Prywatność w Expo', href: 'https://expo.dev/privacy' },
    ],
  },
  {
    title: '7. Przechowywanie i usuwanie',
    paragraphs: [
      'Dane konta, należące do niego plany, wyniki i raporty przechowujemy do usunięcia konta przez użytkownika. Możesz wcześniej usunąć plan; usuwa to także powiązane z nim wyniki i raporty zgodnie z powiązaniami w bazie. Samo wylogowanie nie usuwa danych.',
      'Konto usuniesz na ekranie Konto → Usuwanie konta. Usunięcie obejmuje profil, należące do konta plany, powiązania oraz powiązane wyniki i raporty. Plan należący do trenera może pozostać po usunięciu konta podopiecznego. Jeżeli w opisie planu znajdują się Twoje dane, zgłoś administratorowi potrzebę ich usunięcia.',
      'Korespondencję dotyczącą pomocy przechowujemy podczas obsługi zgłoszenia oraz przez 12 miesięcy od jego zakończenia. Po tym okresie usuwamy ją, chyba że konkretny obowiązek prawny lub trwający spór wymaga zachowania niezbędnych informacji. W takim przypadku ograniczamy zakres zachowanych danych i przechowujemy je do ustania tej przyczyny.',
      'Logi techniczne i ewentualne kopie zapasowe podlegają okresom przechowywania właściwym dla używanych usług i ich konfiguracji. Dla obecnego planu Supabase Free dostawca deklaruje jednodniowe przechowywanie logów API i bazy danych; plan nie obejmuje automatycznych kopii zapasowych projektu. Nie oznacza to jednodniowego okresu przechowywania wszystkich danych technicznych u wszystkich dostawców. Usunięcie z działającej bazy nie gwarantuje natychmiastowego usunięcia danych z ewentualnych kopii i logów. Szczegóły dotyczące pozostałych kategorii możesz uzyskać od administratora.',
    ],
  },
  {
    title: '8. Zapis na urządzeniu',
    paragraphs: [
      'Aplikacja zapisuje informacje potrzebne do utrzymania sesji i działania funkcji lokalnych w pamięci przeglądarki lub aplikacji na telefonie. Wyczyszczenie danych witryny może wylogować konto i usunąć lokalne zapisy, ale nie usuwa danych z chmury.',
      'W obecnym kodzie Progres nie ma własnej analityki marketingowej ani narzędzi reklamowych. Zewnętrzne usługi otwierane z aplikacji mają własne zasady prywatności.',
    ],
  },
  {
    title: '9. Twoje prawa',
    paragraphs: [
      'Na zasadach określonych w RODO możesz żądać dostępu i kopii danych, sprostowania, usunięcia, ograniczenia przetwarzania oraz przenoszenia. Możesz wnieść sprzeciw wobec przetwarzania opartego na uzasadnionym interesie. Jeśli podstawą jest zgoda, możesz ją cofnąć bez wpływu na zgodność wcześniejszego przetwarzania.',
      `Napisz na ${operator.email}, najlepiej z adresu przypisanego do konta. Możemy potrzebować potwierdzenia tożsamości, ale nie wysyłaj hasła. Masz prawo złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych.`,
    ],
    links: [{ label: 'Urząd Ochrony Danych Osobowych', href: 'https://uodo.gov.pl' }],
  },
];

export const termsSections: InformationSection[] = [
  {
    title: '1. Usługa i operator',
    paragraphs: [
      `Progres udostępnia ${operator.name}, ${operator.country}. Kontakt: ${operator.email}. Aplikacja służy planowaniu i zapisywaniu treningów oraz współpracy z trenerem.`,
      'Obecna wersja Progres jest udostępniana bezpłatnie do testów osobom, które ukończyły 18 lat. Dotyczy to zarówno kont trenera, jak i osoby trenującej. Korzystanie z tej wersji nie wymaga zakupu subskrypcji.',
      'Opis funkcji i dane kontaktowe operatora są dostępne bez logowania na stronie O aplikacji. Informacje o przetwarzaniu danych zawiera polityka prywatności.',
    ],
  },
  {
    title: '2. Konto i wymagania',
    paragraphs: [
      'Do synchronizacji potrzebne są internet i konto Progres. Korzystaj z aktualnej przeglądarki lub udostępnionej aplikacji mobilnej. Logowanie odbywa się e-mailem i hasłem albo przez Google, jeśli ta metoda jest dostępna.',
      'Podawaj dane, z których masz prawo korzystać. Chroń dostęp do konta, nie udostępniaj hasła, nie podszywaj się pod inne osoby i nie próbuj uzyskiwać dostępu do cudzych danych.',
    ],
  },
  {
    title: '3. Treningi i współpraca',
    paragraphs: [
      'Możesz tworzyć i edytować plany, dodawać dni, ćwiczenia i serie, zapisywać wyniki oraz budować plan podczas treningu. Propozycje progresji zależą od ustawień i zapisanych wyników.',
      'Połączenie z trenerem umożliwia mu dostęp do Twoich planów i wyników oraz ich uzupełnianie. Raport z komentarzami trafia do powiązanego trenera po jego wysłaniu. Upewnij się, że kod pochodzi od właściwej osoby.',
      'Trener odpowiada za swoje treści i uzgodnienia z podopiecznym. Korzystanie z aplikacji nie oznacza zawarcia z jej operatorem umowy o prowadzenie treningów.',
    ],
  },
  {
    title: '4. Treści i integracje',
    paragraphs: [
      'Dodawaj treści, do których masz prawo. Nie zamieszczaj treści bezprawnych ani zbędnych danych innych osób. Zachowujesz prawa do swoich treści; zapis i udostępnianie w ramach wybranych funkcji służy działaniu aplikacji.',
      'Google, YouTube i inne otwierane serwisy mają własne warunki korzystania. Import arkusza wymaga uprawnień. Link do filmu nie oznacza, że operator jest jego autorem lub zweryfikował wszystkie instrukcje.',
    ],
  },
  {
    title: '5. Korzystanie i dostępność',
    paragraphs: [
      'Progres jest dziennikiem treningowym, nie udziela diagnoz ani indywidualnej porady medycznej. Dobieraj trening do swoich możliwości; wątpliwości dotyczące zdrowia omów z właściwym specjalistą.',
      'Aplikacja jest rozwijana; mogą występować błędy i przerwy techniczne. Sprawdzaj zapis treningu, szczególnie przy niestabilnym internecie. Zgłaszając problem, opisz czynności i rodzaj urządzenia, bez haseł i kluczy dostępu.',
      'Regulamin nie wyłącza uprawnień użytkownika ani odpowiedzialności, których nie można ograniczyć na mocy obowiązujących przepisów.',
    ],
  },
  {
    title: '6. Rezygnacja i zgłoszenia',
    paragraphs: [
      'Możesz przestać korzystać z usługi i usunąć konto w sekcji Konto → Usuwanie konta. Operacja jest nieodwracalna. Szczegóły dotyczące danych i kopii zapasowych opisuje polityka prywatności.',
      `Reklamacje i prośby dotyczące konta kieruj na ${operator.email}. Opisz problem i oczekiwany sposób rozwiązania oraz podaj adres, na który można odpowiedzieć. Nie przesyłaj hasła. Jeżeli sprawa wymaga dodatkowych informacji, operator może poprosić o ich uzupełnienie.`,
    ],
  },
];




