# Kopie zapasowe i odtwarzanie

## Stan przygotowania

Workflow `.github/workflows/database-backup.yml` jest przygotowany, lecz domyślnie wyłączony. Nie stanowi potwierdzenia wykonywania kopii. Włączenie wymaga osobno zapisanych sekretów i przesłania zmian do GitHuba. Nie przeprowadzono odtworzenia na osobnym projekcie.

## Włączenie

W prywatnym repozytorium GitHub: Settings → Secrets and variables → Actions:

1. Dodaj sekret `PROGRES_BACKUP_DB_PASSWORD`: samo hasło bazy PostgreSQL. Workflow uzupełni adres session poolera projektu bjpexsdgdzdtbosbrcrj i poprawnie zakoduje znaki specjalne. Alternatywnie można podać cały connection string w sekrecie `PROGRES_BACKUP_DB_URL`, który ma pierwszeństwo. Nie używaj hasła do konta Supabase ani publicznego klucza aplikacji.
2. Dodaj sekret `PROGRES_BACKUP_PASSPHRASE`: osobny losowy klucz o długości przynajmniej 32 znaków. Zachowaj go także w menedżerze haseł poza GitHubem.
3. Dodaj zmienną repozytorium `PROGRES_BACKUPS_ENABLED` z wartością `true`.
4. Uruchom workflow ręcznie i potwierdź obecność zaszyfrowanego artefaktu. Następnie działa harmonogram codzienny 03:17 UTC; GitHub może opóźniać zaplanowane zadania.
5. Ustaw powiadomienia o nieudanym workflow. Co miesiąc pobierz jedną kopię do niezależnego magazynu. Artefakty mają retencję 30 dni; GitHub nie jest jedynym miejscem przechowywania klucza.

Nie zapisuj URL bazy, hasła ani klucza szyfrowania w repozytorium, EXPO_PUBLIC_* ani logach. Sekrety workflow nigdy nie trafiają do aplikacji. Rola połączenia musi wystarczać do uzgodnionego zakresu kopii; błąd eksportu nie może być ignorowany.

## Zakres

Workflow zapisuje osobno role, schemat i dane przy użyciu Supabase CLI oraz kopię schematu aplikacji z repozytorium, a następnie szyfruje archiwum AES256 przez GPG przed publikacją artefaktu. To logiczny eksport, nie punktowe odtwarzanie PITR ani gwarancja zerowej utraty danych między kopiami.

Domyślne wykluczenia CLI i zakres uprawnień należy sprawdzić podczas pierwszego odtworzenia. Konta/logowanie Auth, dostawcy OAuth, sekrety Edge Functions, ustawienia projektu i konfiguracja usług wymagają osobnego sprawdzenia i ewidencji. Kopia bazy nie zawiera rzeczywistych plików Storage. Gdy pojawią się prywatne filmy/zdjęcia, trzeba uruchomić oddzielną kopię plików przed publikacją tej funkcji.

## Odtworzenie — tylko w osobnym projekcie

1. Utwórz projekt próbny, odizolowany od użytkowników; zachowaj obecną bazę produkcyjną.
2. Pobierz artefakt i odszyfruj go GPG, podając klucz w bezpiecznym monicie. Nie podawaj klucza jako jawnego argumentu polecenia.
3. Rozpakuj archiwum, sprawdź datę i pliki. Zgodnie z aktualną instrukcją Supabase przygotuj role, schemat i dane, uwzględniając istniejące zarządzane role oraz wymagane wyłączenie wybranych triggerów na czas kontrolowanego odtwarzania.
4. Odtwórz konfigurację usług i brakujące zakresy Auth/Storage z ich osobnych kopii. Nie uruchamiaj automatycznie wiadomości ani integracji na prawdziwych użytkownikach.
5. Porównaj liczby planów, sesji, raportów i punktów zapisu; sprawdź przykładowe pięć metryk, migawki planu i relacje trener–podopieczny. Sam udany import SQL nie potwierdza odtworzenia logowania ani plików.
6. Dopiero po zakończeniu próby zapisz datę, zakres, brakujące elementy i czas odtworzenia w dzienniku operacyjnym. Odtwarzanie produkcji wymaga osobnej decyzji i planu przełączenia.

Dokumentacja: https://supabase.com/docs/guides/platform/backups oraz https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
