# Przechowywanie danych Progres

Uzgodnione z właścicielem 15 października 2026:
- Dane konta, należące do niego plany i wyniki: do usunięcia konta lub wcześniejszego usunięcia planu.
- Korespondencja pomocy: do zakończenia zgłoszenia i następnie 12 miesięcy.
- Logi i ewentualne kopie: zgodnie z rzeczywistą konfiguracją usług.

## Obsługa korespondencji
Reguła 12 miesięcy jest zasadą organizacyjną administratora, nie funkcją aplikacji.
W repozytorium nie ma systemu zgłoszeń ani mechanizmu automatycznego kasowania wiadomości Gmail.
Administrator odnotowuje datę zakończenia zgłoszenia i termin usunięcia korespondencji.
Przy usuwaniu uwzględnia załączniki oraz własne kopie. Nie usuwa korespondencji użytkowników z ich skrzynek.
Wyjątek prawny lub trwający spór musi mieć konkretną przyczynę, zakres i koniec, nie służy bezterminowemu przechowywaniu.

## Fakty sprawdzone 15 października 2026
- Panel projektu bjpexsdgdzdtbosbrcrj: organizacja FREE; Database → Backups: „Free Plan does not include project backups”.
- Cennik Supabase: Free, Log retention (API & Database): 1 day.
- Nie utożsamiaj dostępności logów API i bazy w panelu z usunięciem każdego rodzaju danych technicznych dostawcy.
- Nie potwierdzono okresów wszystkich kategorii logów Expo ani ewentualnych kopii ręcznych. Nie wpisano dla nich wymyślonej liczby dni.
- Nie zmieniano planów usług, nie włączano płatnych kopii, nie usuwano danych.

## Usuwanie konta
Obecna funkcja delete-account usuwa użytkownika Supabase Auth; relacje schema.sql przewidują usuwanie zależnych danych.
Plan należący do trenera może pozostać po usunięciu podopiecznego. Dane osobowe wpisane w opisach takiego planu wymagają osobnej obsługi.
Opis oparto na kodzie i schemacie w repozytorium; nie wykonywano próbnego usunięcia konta w produkcji.
Przy zmianie planu Supabase, hostingu lub wdrożeniu backupów trzeba zaktualizować politykę i tę instrukcję.

Źródła:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/pricing
- https://supabase.com/dashboard/project/bjpexsdgdzdtbosbrcrj/database/backups/scheduled

Politykę i regulamin opublikowano 15 października 2026. Publikacja nie jest zatwierdzeniem marki przez Google. Szczegóły: RELEASE-2026-10-15.md.


