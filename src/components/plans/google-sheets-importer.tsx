import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { progresTheme as c } from '@/constants/progres-theme';
import { spreadsheetRowsToTsv } from '@/lib/plan-spreadsheet';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

WebBrowser.maybeCompleteAuthSession();

export default function GoogleSheetsImporter({ onImport }: { onImport: (text: string) => boolean }) {
  const [spreadsheetUrl, setSpreadsheetUrl] = useState('');

  if (Platform.OS !== 'web') return null;

  return <View style={s.area}>
    <Text style={s.title}>IMPORT Z GOOGLE SHEETS</Text>
    <Text style={s.help}>Wklej link do arkusza. Google poprosi o dostęp tylko do odczytu wszystkich Twoich arkuszy; aplikacja wczyta wyłącznie pierwszą kartę z podanego linku.</Text>
    <TextInput accessibilityLabel="Link do arkusza Google Sheets" autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={setSpreadsheetUrl} placeholder="https://docs.google.com/spreadsheets/d/..." placeholderTextColor={c.muted} selectionColor={c.accent} style={s.input} value={spreadsheetUrl} />
    {!isSupabaseConfigured
      ? <Text style={s.notice}>Import Google Sheets wymaga aktywnego połączenia z kontem Progres i Supabase.</Text>
      : !googleWebClientId
        ? <Text style={s.notice}>Import Google Sheets wymaga skonfigurowania identyfikatora OAuth Google w ustawieniach aplikacji.</Text>
        : <GoogleSheetsAuthorization spreadsheetUrl={spreadsheetUrl} onImport={onImport} />}
  </View>;
}

function GoogleSheetsAuthorization({ spreadsheetUrl, onImport }: { spreadsheetUrl: string; onImport: (text: string) => boolean }) {
  const [busy, setBusy] = useState(false);
  const redirectUri = AuthSession.makeRedirectUri();
  const [request, , promptAsync] = AuthSession.useAuthRequest({
    clientId: googleWebClientId!,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    usePKCE: true,
    extraParams: { prompt: 'select_account' },
  }, discovery);

  async function handleImport() {
    if (!spreadsheetUrl.trim()) {
      Alert.alert('Wklej link do arkusza', 'Użyj pełnego linku do arkusza Google Sheets.');
      return;
    }
    if (!request || !supabase) return;

    setBusy(true);
    try {
      const result = await promptAsync();
      if (result.type !== 'success') return;
      const code = result.params.code;
      if (!code || !request.codeVerifier) throw new Error('Google nie zwrócił kodu autoryzacji. Spróbuj ponownie.');

      const { data, error } = await supabase.functions.invoke('google-sheets-import', {
        body: { code, codeVerifier: request.codeVerifier, redirectUri, spreadsheetUrl: spreadsheetUrl.trim() },
      });
      if (error) throw new Error(data?.error ?? 'Nie udało się odczytać arkusza.');
      if (!Array.isArray(data?.rows)) throw new Error(data?.error ?? 'Arkusz nie zawiera danych do importu.');
      onImport(spreadsheetRowsToTsv(data.rows));
    } catch (error) {
      Alert.alert('Nie udało się zaimportować arkusza', error instanceof Error ? error.message : 'Sprawdź link i spróbuj ponownie.');
    } finally {
      setBusy(false);
    }
  }

  return <Pressable accessibilityRole="button" disabled={!request || busy} onPress={handleImport} style={[s.button, (!request || busy) && s.disabled]}>
    <Text style={s.buttonText}>{busy ? 'ŁĄCZĘ Z GOOGLE…' : 'ZALOGUJ SIĘ I WCZYTAJ ARKUSZ'}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  area: { backgroundColor: c.raised, borderRadius: 11, padding: 11, marginBottom: 10 },
  title: { color: c.accent, fontSize: 9, letterSpacing: 0.6, fontWeight: '900' },
  help: { color: c.muted, fontSize: 10, lineHeight: 15, marginTop: 6, marginBottom: 8 },
  input: { color: c.text, minHeight: 41, borderRadius: 9, backgroundColor: c.panel, paddingHorizontal: 10, fontSize: 11, borderWidth: 1, borderColor: c.line },
  button: { minHeight: 42, borderRadius: 9, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8, paddingHorizontal: 10 },
  buttonText: { color: c.accentInk, fontSize: 9, fontWeight: '900', letterSpacing: 0.4, textAlign: 'center' },
  notice: { color: c.muted, fontSize: 10, lineHeight: 15, marginTop: 8 },
  disabled: { opacity: 0.55 },
});
