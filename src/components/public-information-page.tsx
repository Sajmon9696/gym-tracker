import { Link } from 'expo-router';
import Head from 'expo-router/head';
import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { progresTheme as c } from '@/constants/progres-theme';
import { operator, type InformationSection } from '@/content/public-information';

export function PublicInformationLinks() {
  return <View style={styles.footer}>
    <Link href="/about" style={styles.footerLink}>O aplikacji</Link>
    <Link href="/privacy" style={styles.footerLink}>Polityka prywatności</Link>
    <Link href="/terms" style={styles.footerLink}>Regulamin</Link>
  </View>;
}

export function PublicInformationPage({ title, intro, sections = [], draft = false, children }: PropsWithChildren<{
  title: string;
  intro: string;
  sections?: InformationSection[];
  draft?: boolean;
}>) {
  return <SafeAreaView style={styles.safe}>
    <Head>
      <title>{title} — Progres</title>
      <meta name="description" content={intro} />
      {draft && <meta name="robots" content="noindex" />}
    </Head>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Link href="/" style={styles.brand} accessibilityLabel="Progres — strona główna">P  PROGRES</Link>
        <Link href="/account" style={styles.link}>Konto →</Link>
      </View>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.intro}>{intro}</Text>
      {!draft && sections.length > 0 && <Text style={styles.intro}>Aktualizacja: 15 października 2026</Text>}
      {draft && <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Wersja robocza · 13 października 2026</Text>
        <Text style={styles.body}>Projekt dokumentu do zatwierdzenia przez właściciela aplikacji. Informacje o warunkach udostępnienia i konfiguracji dostawców wymagają jeszcze potwierdzenia.</Text>
      </View>}
      {children}
      {sections.map((section) => <View key={section.title} style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>
        {section.paragraphs.map((paragraph) => <Text key={paragraph} selectable style={styles.body}>{paragraph}</Text>)}
        {section.links?.map((link) => <Link key={link.href} href={link.href} style={styles.link}>{link.label} ↗</Link>)}
      </View>)}
      <View style={styles.contact}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Kontakt</Text>
        <Text style={styles.body}>{operator.name} · {operator.country}</Text>
        <Link href={`mailto:${operator.email}`} style={styles.link}>{operator.email}</Link>
      </View>
      <PublicInformationLinks />
      <Link href="/" style={styles.homeLink}>← Wróć do aplikacji</Link>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 22, paddingBottom: 40 },
  header: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  brand: { color: c.accent, fontSize: 18, fontWeight: '900', letterSpacing: 2, paddingVertical: 12 },
  title: { color: c.text, fontSize: 32, fontWeight: '800', lineHeight: 38 },
  intro: { color: c.muted, fontSize: 16, lineHeight: 25, marginTop: 12, marginBottom: 24 },
  section: { borderTopWidth: 1, borderTopColor: c.line, paddingVertical: 22, gap: 12 },
  sectionTitle: { color: c.text, fontSize: 20, lineHeight: 28, fontWeight: '700' },
  body: { color: c.text, fontSize: 15, lineHeight: 25 },
  link: { color: c.accent, fontSize: 15, lineHeight: 24, paddingVertical: 10, textDecorationLine: 'underline' },
  notice: { backgroundColor: c.raised, borderColor: c.accent, borderWidth: 1, borderRadius: 14, padding: 18, gap: 10, marginBottom: 24 },
  noticeTitle: { color: c.accent, fontSize: 15, fontWeight: '700' },
  contact: { backgroundColor: c.panel, padding: 18, borderRadius: 14, gap: 8, marginTop: 10 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 20, paddingTop: 18 },
  footerLink: { color: c.muted, fontSize: 13, lineHeight: 22, paddingVertical: 12, textDecorationLine: 'underline' },
  homeLink: { color: c.accent, alignSelf: 'center', fontSize: 15, paddingVertical: 16, marginTop: 12 },
});


