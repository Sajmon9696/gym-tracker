# Konfiguracja kont, haseł i logowania Google

## Google OAuth

1. W Google Cloud otwórz istniejący klient OAuth typu **Web application**.
2. W **Authorized redirect URIs** dodaj callback Supabase:

   `https://bjpexsdgdzdtbosbrcrj.supabase.co/auth/v1/callback`

   Ten sam klient OAuth może być używany przez logowanie Google i import Google Sheets.
3. W Supabase otwórz **Authentication → Sign In / Providers → Google**, włącz Google i wklej Client ID oraz Client Secret z Google Cloud.
4. W **Authentication → URL Configuration → Redirect URLs** dodaj adresy powrotu aplikacji:
   - `http://localhost:8081/account` do lokalnego weba,
   - `gymtracker://account` do aplikacji zainstalowanej jako build,
   - podczas testowania w Expo Go możesz dodać wzorzec `exp://**/--/account` (usuń go przed publikacją),
   - `https://TWOJA-DOMENA/account` po opublikowaniu aplikacji.
5. W Google Cloud, w **Authorized JavaScript origins**, dodaj `http://localhost:8081` i domenę produkcyjną aplikacji.

Nie wpisuj Client Secret do `.env` ani kodu aplikacji. Zapisz go wyłącznie w konfiguracji dostawcy Google w Supabase. Po tej konfiguracji przycisk Google używa konta Supabase; konto Google nie zastępuje konta Progres.

Nowe konto utworzone przez Google otrzymuje domyślnie rolę osoby trenującej. Zweryfikowane konto z tym samym adresem e-mail zostanie automatycznie połączone z dotychczasowym profilem. Aby utworzyć nowe konto trenera, użyj formularza e-mail.

## E-mail i hasła

- Pozostaw włączone **Confirm email** w ustawieniach Supabase Auth. Aplikacja sprawdza format adresu przed wysłaniem, a Supabase potwierdza, że użytkownik ma dostęp do skrzynki.
- Ustaw minimalną długość hasła na **15 znaków** i nie wymagaj określonych klas znaków. Aplikacja sprawdza długość, potwierdzenie oraz odrzuca kilka oczywistych słabych haseł.
- Opcję Supabase **Leaked password protection** można włączyć na planie Pro. Gdy jest dostępna, warto ją włączyć, aby odrzucać hasła znalezione w bazach wycieków.

Zmiana minimalnej długości w Supabase może wymagać zmiany hasła przez osoby używające krótszych haseł. Ustawienie wymagań w aplikacji nie zmienia ustawień serwera Supabase.
