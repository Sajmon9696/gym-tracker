import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: corsHeaders });
}

function getSpreadsheetId(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.hostname !== 'docs.google.com') return null;
    return url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonError('Method not allowed.', 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return jsonError('Zaloguj się ponownie do aplikacji.', 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY');
  const googleClientId = Deno.env.get('GOOGLE_OAUTH_WEB_CLIENT_ID');
  const googleClientSecret = Deno.env.get('GOOGLE_OAUTH_WEB_CLIENT_SECRET');
  const allowedRedirectUris = (Deno.env.get('GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!supabaseUrl || !publishableKey || !googleClientId || !googleClientSecret || !allowedRedirectUris.length) {
    return jsonError('Import Google Sheets nie jest jeszcze skonfigurowany na serwerze.', 500);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return jsonError('Zaloguj się ponownie do aplikacji.', 401);

  const { data: profile, error: profileError } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileError || profile?.role !== 'trainer') return jsonError('Import arkuszy Google jest dostępny tylko dla trenera.', 403);

  let body: { code?: unknown; codeVerifier?: unknown; redirectUri?: unknown; spreadsheetUrl?: unknown };
  try { body = await request.json(); }
  catch { return jsonError('Nie udało się odczytać żądania.', 400); }

  const { code, codeVerifier, redirectUri } = body;
  const spreadsheetId = getSpreadsheetId(body.spreadsheetUrl);
  if (typeof code !== 'string' || typeof codeVerifier !== 'string' || typeof redirectUri !== 'string' || !spreadsheetId) {
    return jsonError('Wklej poprawny link do arkusza Google Sheets i spróbuj ponownie.', 400);
  }
  if (!allowedRedirectUris.includes(redirectUri)) return jsonError('Adres powrotu OAuth nie jest dozwolony. Sprawdź konfigurację Google OAuth.', 400);

  const tokenBody = new URLSearchParams({
    code,
    code_verifier: codeVerifier,
    client_id: googleClientId,
    client_secret: googleClientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody,
  });
  if (!tokenResponse.ok) return jsonError('Google nie potwierdził logowania. Połącz konto Google ponownie.', 401);
  const tokenData = await tokenResponse.json();
  if (typeof tokenData.access_token !== 'string') return jsonError('Google nie zwrócił tokenu do odczytu arkusza.', 502);

  const googleHeaders = { Authorization: `Bearer ${tokenData.access_token}` };
  const metadataResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, { headers: googleHeaders });
  if (!metadataResponse.ok) return jsonError('Nie można otworzyć tego arkusza. Sprawdź, czy link jest poprawny i zalogowano się na konto z dostępem.', 403);
  const metadata = await metadataResponse.json();
  const firstSheetTitle = metadata.sheets?.[0]?.properties?.title;
  if (typeof firstSheetTitle !== 'string') return jsonError('Arkusz nie ma żadnych kart z danymi.', 400);

  const range = `'${firstSheetTitle.replace(/'/g, "''")}'!A:K`;
  const valuesUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`);
  const valuesResponse = await fetch(valuesUrl, { headers: googleHeaders });
  if (!valuesResponse.ok) return jsonError('Nie udało się odczytać wierszy z arkusza.', 502);
  const valuesData = await valuesResponse.json();
  const rows = valuesData.values;
  if (!Array.isArray(rows) || rows.length === 0) return jsonError('Wybrana karta arkusza jest pusta.', 400);
  if (rows.length > 500) return jsonError('Arkusz ma ponad 500 wierszy. Podziel plan na mniejsze arkusze i spróbuj ponownie.', 413);

  return Response.json({ rows }, { headers: corsHeaders });
});
