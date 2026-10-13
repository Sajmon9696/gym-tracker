# Google Sheets import setup

The importer uses Google OAuth with the read-only `spreadsheets.readonly` scope. Google describes this as a sensitive scope that can read all spreadsheets in the trainer's Google account. The function only fetches the first tab from the spreadsheet URL the trainer submits. The OAuth client secret stays in Supabase Edge Function secrets. The app requests access only when a trainer starts an import and does not store Google tokens.

## Google Cloud

1. Select or create a Google Cloud project and enable **Google Sheets API**.
2. Configure the OAuth consent screen. While testing, add each trainer's Google address as a test user.
3. Create an OAuth client of type **Web application**.
4. Add the development app origin (usually `http://localhost:8081`) and the deployed app origin to **Authorized JavaScript origins**. Add the exact values returned by `AuthSession.makeRedirectUri()` (usually `http://localhost:8081` locally and your deployed app URL in production) to **Authorized redirect URIs**.
5. Put the web client ID in `.env` as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and restart Expo.

The `spreadsheets.readonly` permission is read-only but can read every spreadsheet in the Google account, so the user must review and approve it. Google requires OAuth verification before a public app can use it beyond its configured test users.

## Supabase Edge Function

Set the secret values in the linked Supabase project. Do not put the client secret in `.env` or app code.

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
npx.cmd supabase secrets set GOOGLE_OAUTH_WEB_CLIENT_ID="YOUR_WEB_CLIENT_ID" GOOGLE_OAUTH_WEB_CLIENT_SECRET="YOUR_WEB_CLIENT_SECRET" GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS="http://localhost:8081,https://YOUR_APP_DOMAIN"
npx.cmd supabase functions deploy google-sheets-import
```

`GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS` is a comma-separated list of exact redirect URIs. Keep it in sync with the URIs registered in Google Cloud. Add one URI for each development or production app origin.

Get `YOUR_SUPABASE_PROJECT_REF` from Supabase **Project Settings → General → Project ID**. The app's current local Supabase link may already be set; if so, the `link` step can be skipped.

## Import a plan

Use the app in a web browser, sign in as a trainer, create a plan, open **Utwórz plan z arkusza**, paste the Google Sheets URL, and choose **Zaloguj się i wczytaj arkusz**. The importer reads the first tab, converts its rows using the same column format as the CSV template, and lets the trainer review the plan before saving.
