import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';

import { PublicInformationPage } from '@/components/public-information-page';
import { progresTheme as c } from '@/constants/progres-theme';
import type { InformationSection } from '@/content/public-information';

const sections: InformationSection[] = [
  { title: 'Twój plan. Twój rytm.', paragraphs: ['Progres to dziennik treningowy dla osób trenujących i trenerów. Ułóż plan z podziałem na dni albo zbuduj go podczas treningu. Dla każdej serii określ ciężar i zakres powtórzeń.'] },
  { title: 'Zapisuj serię po serii', paragraphs: ['Podczas treningu widzisz cel aktualnej serii i wyniki poprzedniego treningu. Zapisuj ciężary i powtórzenia, poprawiaj pomyłki i sprawdzaj rekordy. Plan prowadzi Cię przez kolejne dni.'] },
  { title: 'Współpracuj z trenerem', paragraphs: ['Połącz konto kodem otrzymanym od trenera. Trener może przygotować i edytować Twój plan oraz zapisać trening razem z Tobą. Po mikrocyklu wyślij raport z wynikami i komentarzami do ćwiczeń.'] },
  { title: 'Konto na różnych urządzeniach', paragraphs: ['Zaloguj się e-mailem lub przez Google. Plany i wyniki są przechowywane w chmurze i dostępne po zalogowaniu na to samo konto. Synchronizacja wymaga internetu.', 'Informacje o danych, udostępnianiu ich trenerowi i usuwaniu konta znajdziesz w polityce prywatności. W sprawach aplikacji możesz skontaktować się bezpośrednio z jej twórcą.'] },
];

export default function AboutScreen() {
  return <PublicInformationPage title="Progres — Twój dziennik treningowy" intro="Planuj treningi, zapisuj wyniki i obserwuj postępy. Samodzielnie lub ze swoim trenerem." sections={sections}>
    <Link href="/account" style={styles.action}>Zaloguj się lub utwórz konto →</Link>
  </PublicInformationPage>;
}

const styles = StyleSheet.create({
  action: { backgroundColor: c.accent, color: c.accentInk, padding: 18, borderRadius: 14, fontSize: 16, lineHeight: 24, fontWeight: '700', textAlign: 'center', marginBottom: 24, overflow: 'hidden' },
});

