# Trwały zapis treningu

## Zachowanie aplikacji

- Każda zatwierdzona seria jest zapisywana lokalnie przed przejściem do kolejnej. Pola formularza, pominięcia i stan edycji również są utrwalane.
- Przycisk „Kontynuuj trening” odtwarza dzień, wyniki i miejsce edycji po ponownym uruchomieniu. Wyjście do listy wstrzymuje trening.
- Zakończenie zapisuje wynik i umieszcza go w kolejce w jednym zapisie lokalnym. Kolejne próby wysyłki używają tego samego identyfikatora.
- Plan do pracy offline trzeba wcześniej otworzyć przy dostępie do sieci. Pierwsze logowanie, pobranie nieznanego planu, OAuth, filmy YouTube i wysyłanie raportu wymagają internetu. Web wymaga załadowanej aplikacji; nie dodano buforowania całej strony przez service workera.
- Po wysłaniu kolejka zachowuje lokalnie ostatnie 40 wyników jako uzupełnienie pobranej historii. Zapobiega to zniknięciu świeżego treningu z widoku offline, gdy wcześniejsza kopia historii powstała przed jego zakończeniem.
- Wcześniej zalogowana osoba może odczytać pobrane dane także wtedy, gdy odświeżenie tokenu nie powiedzie się z powodu braku sieci. Lokalna tożsamość nie nadaje uprawnień do bazy; wylogowanie usuwa ją, a synchronizacja wymaga ważnej sesji serwera.
- Kolejka ponawia wysyłkę co 30 sekund podczas działania aplikacji, po powrocie na pierwszy plan i po sygnale odzyskania sieci na web. Zamknięta aplikacja nie wysyła w tle; wysyłka ruszy po jej otwarciu.
- Odrzucenie uprawnień nie jest traktowane jako sukces ani zwykły brak internetu. Wynik zostaje na urządzeniu z komunikatem.
- Dwie sesje nie nadpisują się bez ostrzeżenia. Przejęcie wczytuje wersję z chmury i zachowuje różniącą się lokalną kopię do eksportu. Nie ma automatycznego scalania serii z dwóch urządzeń.
- Nie należy czyścić danych przeglądarki/odinstalowywać aplikacji przed synchronizacją. Kopia lokalna nie jest kopią poza urządzeniem.
- Historyczny wynik zawiera plan i obliczone cele z chwili rozpoczęcia. Nowe migawki są niezmienne; starych treningów nie uzupełniamy fikcyjnymi celami historycznymi.

## Baza i publikacja

1. Zastosuj `006_durable_workouts.sql` przed publikacją nowego klienta. Nowy klient bez migracji zachowuje lokalną kopię i pokazuje brak gotowości synchronizacji.
2. Nowe tabele mają RLS. Zapis jest dostępny wyłącznie przez funkcje z kontrolą konta, relacji trener–podopieczny, planu i wersji/właściciela zapisu.
3. Nowa wersja klienta używa nowego mechanizmu. Stary APK nadal zapisuje trening dopiero na końcu, więc użytkownicy powinni otrzymać nową wersję przed korzystaniem z dwóch urządzeń. Nie deklarujemy blokowania aktywnego treningu w nieaktualnym kliencie.
4. `npm run release:check` uruchamia lint, kontrolę typów i eksport web. EAS ma kontrolę lint/typów po instalacji zależności. Workflow GitHub uruchamia te kontrole po przesłaniu zmian do repo.
5. Zmiany lokalne, migracja bazy, publikacja web i APK to oddzielne czynności. Samo dodanie workflow nie publikuje aplikacji.

## Kontrola przed wydaniem

Poniższe scenariusze wymagają oddzielnego uruchomienia na urządzeniach; nie są dowodem wykonania testów:

- Potwierdź trzy serie, zamknij proces i wznów.
- Zapisz trening bez sieci, uruchom ponownie i odzyskaj połączenie.
- Przerwij połączenie po przyjęciu zapisu przez serwer; ponowienie nie tworzy duplikatu.
- Przejmij trening na drugim urządzeniu; stary klient zachowuje lokalną kopię i otrzymuje konflikt.
- Zmień plan w trakcie sesji; wcześniejsze cele i nazwy w historii/raporcie pozostają niezmienne.
- Zmień konto; kopia pierwszego konta nie może zostać zapisana na drugim.
- Sprawdź częściowe ćwiczenie, edycję ukończonej serii, pominięcie dnia i dystans z przecinkiem.
- Sprawdź odmowę dostępu po odłączeniu trenera i po wygaśnięciu sesji.
- Sprawdź brak miejsca na urządzeniu: nie wolno pokazywać zatwierdzonej serii bez zapisu.
