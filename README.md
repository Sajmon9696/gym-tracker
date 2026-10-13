# Progres

Aplikacja treningowa na telefony i przeglądarkę. Umożliwia tworzenie planów, zapisywanie serii, śledzenie progresji i wysyłanie trenerowi raportów z mikrocykli.

## Uruchomienie lokalne

1. Zainstaluj zależności poleceniem `npm install`.
2. Skopiuj `.env.example` do `.env` i uzupełnij adres projektu Supabase oraz klucz publiczny. Bez tych ustawień aplikacja działa w trybie lokalnym.
3. Uruchom `npm run start` i otwórz aplikację przez Expo Go lub emulator. W przeglądarce uruchom `npm run web`.

## Kontrola zmian

- `npm run typecheck` sprawdza typy TypeScript.
- `npm run lint` uruchamia ESLint.

## Układ kodu

- `src/app/` zawiera ekrany routowane przez Expo Router.
- `src/components/` zawiera współdzielone elementy interfejsu.
- `src/lib/` zawiera logikę domenową, uwierzytelnianie i zapis danych.
- `src/constants/progres-theme.ts` przechowuje wspólną paletę kolorów.
- `supabase/` zawiera schemat bazy danych i kolejne migracje SQL.

Zmiany schematu Supabase wprowadzaj jako nową migrację SQL. Kluczy prywatnych nie umieszczaj w aplikacji mobilnej ani w zmiennych `EXPO_PUBLIC_*`.
