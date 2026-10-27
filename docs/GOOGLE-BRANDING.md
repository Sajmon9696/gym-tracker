# Progres: strony informacyjne i marka w Google

Stan na 15 października 2026: strony opublikowane pod https://sajmon96-gym-tracker.expo.app. Szczegóły wydania: RELEASE-2026-10-15.md.
Polityka prywatności i regulamin zawierają uzgodnione warunki bezpłatnych testów 18+ i przechowywania danych; oznaczenia wersji roboczej usunięto.
Zgłoszenie marki do Google wymaga osobnego przejścia przez procedurę i potwierdzenia domeny.

## Co przygotowano
- /about — opis aplikacji, funkcji, kontakt i odnośniki.
- /privacy — projekt polityki prywatności.
- /terms — projekt regulaminu.
- Linki na stronie głównej i koncie; bez logowania można wejść na każdą z tych stron.
- Warunki potwierdzone 15 października 2026: bezpłatne testy dla osób pełnoletnich (18+), dla obu typów kont. Warunek opisano w regulaminie; nie wprowadzono weryfikacji wieku w formularzu.
- Operator potwierdzony przez właściciela: Szymon Sroka, Polska, szymon.sroka96@gmail.com.
- Treść dokumentów: src/content/public-information.ts.

## Informacje wymagające ustalenia przed publikacją
1. Warunki odbiorców i odpłatności potwierdzono. Przed publikacją ustal jeszcze sposób zakończenia testów i powiadomienia użytkowników.
2. Uzupełnij wymagane dane usługodawcy, w tym adres do korespondencji, jeżeli wymagany dla sposobu udostępniania usługi. Nie publikuj adresu domowego bez świadomej decyzji właściciela.
3. Zasady przechowywania potwierdzono 15 października 2026: konto i jego dane do usunięcia, korespondencja do 12 miesięcy od zakończenia zgłoszenia. Supabase Free i brak automatycznych kopii potwierdzono w panelu; jednodniową retencję logów API/bazy w cenniku. Szczegóły i pozostałe niepotwierdzone kategorie opisuje docs/DATA-RETENTION.md.
4. Potwierdź obowiązujące umowy powierzenia, listy podwykonawców i podstawy transferów poza EOG. Europejski region bazy nie rozstrzyga całego przetwarzania.
5. Ustal procedurę reklamacji, termin odpowiedzi i informowania o zmianach. Zweryfikuj sposób udostępnienia regulaminu i jego akceptacji przy zakładaniu konta również przez Google.
6. Zapisy treningowe i komentarze mogą ujawniać zdrowie. Przed szerszym udostępnieniem oceń, czy zakres danych wymaga dodatkowych podstaw prawnych i zabezpieczeń. Samo ostrzeżenie w dokumencie tego nie rozstrzyga.
7. Zweryfikuj rzeczywistą konfigurację dostawców. Opis usuwania opracowano na podstawie schema.sql i funkcji delete-account; nie przeprowadzano usuwania kont użytkowników ani inspekcji produkcyjnej bazy.
8. Dokumenty opublikowano z datą 15 października 2026. Aktualizuj je przy zmianie działania aplikacji lub zasad usługi.

## Publikacja
Po zatwierdzeniu treści wyeksportuj aplikację i opublikuj ją w dotychczasowym projekcie Expo:
```powershell
cd C:\Programowanie\gym-tracker
.\node_modules\.bin\expo.cmd export --platform web
npm.cmd exec --yes --package=eas-cli -- eas deploy --prod
```
Otwórz wszystkie trzy adresy w oknie prywatnym bez logowania.
Sprawdź też układ na telefonie, przewijanie, odnośniki i powrót do aplikacji.

## Co wkleić w Google Cloud po publikacji
Projekt „Progres logowanie” → Google Auth Platform → Elementy marki:
- Nazwa: Progres
- Strona główna aplikacji: https://sajmon96-gym-tracker.expo.app/about
- Polityka prywatności: https://sajmon96-gym-tracker.expo.app/privacy
- Warunki korzystania: https://sajmon96-gym-tracker.expo.app/terms

Te adresy zostały opublikowane i są dostępne bez logowania.

## Domena i weryfikacja
Google wymaga kontroli domen wykorzystywanych do marki. Sprawdź możliwość weryfikacji używanej domeny w Search Console i wymagania panelu Google.
Nie wpisuj expo.app jako własnej domeny — należy do dostawcy. Nie potwierdzono możliwości wykorzystania subdomeny Expo do pełnej weryfikacji marki. Jeśli Google nie przyjmie obecnego hostingu, potrzebna będzie własna domena i ponowne ustawienie adresów stron.
Nie zmieniaj działającego adresu callback Supabase na adres strony głównej:
https://bjpexsdgdzdtbosbrcrj.supabase.co/auth/v1/callback
Własna domena uwierzytelniania Supabase jest osobnym zagadnieniem.

Po zatwierdzeniu domeny i dokumentów przejdź przez weryfikację marki w Google. Sama zmiana nazwy aplikacji ani publikacja dokumentów nie gwarantuje zmiany tekstu na ekranie logowania. Google decyduje o zatwierdzeniu.
Jeśli aktywujesz import Sheets, uprawnienie spreadsheets.readonly wymaga osobnego sprawdzenia wymogów weryfikacji zakresów. Nie dodawaj go do podstawowego logowania.

## Źródła do przeglądu
- https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
- https://support.google.com/cloud/answer/15549049?hl=en
- https://developers.google.com/terms/api-services-user-data-policy
- https://supabase.com/legal/customer-resources/data-processing-addendum
- https://supabase.com/privacy
- https://expo.dev/privacy
- https://eur-lex.europa.eu/eli/reg/2016/679/oj
- https://uodo.gov.pl




