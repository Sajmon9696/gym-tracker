import { cachedTrainingRead, clearTrainingCache, isConnectionError } from '@/lib/offline-training-cache';
import { readOfflineIdentity, rememberOfflineIdentity } from '@/lib/offline-auth-identity';
import { cachedWorkoutSessions, clearWorkoutJournal } from '@/lib/workout-journal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ASSIGNED_PLANS_KEY, PLANS_KEY, SESSIONS_KEY, type TrainingPlan, type TrainingReport, type TrainingSession, userStorageKey } from '@/lib/plans';
import { WORKOUTS_KEY } from '@/lib/workouts';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getPasswordProblem, isValidEmail, normalizeEmail } from '@/lib/auth-validation';

const ACCOUNTS_KEY = 'progres.local-accounts.v1';
const ACTIVE_ACCOUNT_KEY = 'progres.local-session.v1';
const TRAINING_REPORTS_KEY = 'progres.training-reports.v1';
const PBKDF2_ITERATIONS = 120_000;

export type AccountRole = 'trainer' | 'trainee';
export type LocalProfile = {
  id: string;
  full_name: string;
  email: string;
  role: AccountRole;
  trainer_code: string | null;
  trainer_id: string | null;
};
type StoredAccount = LocalProfile & { password_salt: string; password_hash: string };
export type LocalSession = { user: { id: string; email: string } };

function isMissingTrainingReportsTable(error: { code?: string; message?: string } | null) {
  return error?.code === 'PGRST205' || error?.code === '42P01'
    || Boolean(error?.message?.includes('training_reports') && /schema cache|does not exist|could not find/i.test(error.message));
}

function cryptoApi() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw new Error('Ta przeglądarka nie obsługuje bezpiecznego lokalnego logowania. Otwórz aplikację w aktualnej wersji Chrome lub Edge.');
  }
  return globalThis.crypto;
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string) {
  return new Uint8Array(value.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}

function randomHex(bytes = 16) {
  const random = cryptoApi().getRandomValues(new Uint8Array(bytes));
  return toHex(random);
}

async function hashPassword(password: string, salt: string) {
  const crypto = cryptoApi();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return toHex(new Uint8Array(derived));
}

async function readAccounts() {
  const value = await AsyncStorage.getItem(ACCOUNTS_KEY);
  return value ? JSON.parse(value) as StoredAccount[] : [];
}

async function writeAccounts(accounts: StoredAccount[]) {
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export async function getStoredSession() {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.getSession();
    if (error && isConnectionError(error)) return readOfflineIdentity();
    if (error) throw error;
    const identity = data.session ? { user: { id: data.session.user.id, email: data.session.user.email ?? '' } } : null;
    await rememberOfflineIdentity(identity).catch(() => {});
    return identity;
  }
  const value = await AsyncStorage.getItem(ACTIVE_ACCOUNT_KEY);
  return value ? JSON.parse(value) as LocalSession : null;
}

export async function registerLocalAccount(input: { fullName: string; email: string; password: string; role: AccountRole }) {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new Error('Wpisz poprawny adres e-mail, np. imie@domena.pl.');
  const passwordProblem = getPasswordProblem(input.password, email);
  if (passwordProblem) throw new Error(passwordProblem);

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: { data: { full_name: input.fullName.trim(), role: input.role } },
    });
    if (error) throw error;
    if (!data.session) throw new Error('Konto utworzono. Potwierdź adres e-mail, a potem zaloguj się.');
    return { user: { id: data.session.user.id, email: data.session.user.email ?? email } };
  }
  const accounts = await readAccounts();
  if (accounts.some((account) => account.email === email)) throw new Error('Konto z tym adresem e-mail już istnieje na tym urządzeniu.');
  const salt = randomHex();
  const id = randomHex(16);
  const account: StoredAccount = {
    id,
    full_name: input.fullName.trim(),
    email,
    role: input.role,
    trainer_code: input.role === 'trainer' ? randomHex(5).toUpperCase() : null,
    trainer_id: null,
    password_salt: salt,
    password_hash: await hashPassword(input.password, salt),
  };
  if (accounts.length === 0) {
    for (const key of [PLANS_KEY, SESSIONS_KEY, WORKOUTS_KEY]) {
      const existingData = await AsyncStorage.getItem(key);
      const accountKey = userStorageKey(key, id);
      if (existingData !== null && await AsyncStorage.getItem(accountKey) === null) {
        await AsyncStorage.setItem(accountKey, existingData);
      }
    }
  }
  await writeAccounts([...accounts, account]);
  const session = { user: { id, email } };
  await AsyncStorage.setItem(ACTIVE_ACCOUNT_KEY, JSON.stringify(session));
  return session;
}

export async function signInLocalAccount(emailValue: string, password: string) {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailValue.trim().toLowerCase(), password });
    if (error) throw error;
    if (!data.session) throw new Error('Logowanie nie zwróciło aktywnej sesji. Spróbuj ponownie.');
    return { user: { id: data.session.user.id, email: data.session.user.email ?? emailValue.trim().toLowerCase() } };
  }
  const email = emailValue.trim().toLocaleLowerCase('pl-PL');
  const account = (await readAccounts()).find((item) => item.email === email);
  if (!account || await hashPassword(password, account.password_salt) !== account.password_hash) {
    throw new Error('Nieprawidłowy e-mail lub hasło.');
  }
  const session = { user: { id: account.id, email: account.email } };
  await AsyncStorage.setItem(ACTIVE_ACCOUNT_KEY, JSON.stringify(session));
  return session;
}

export async function signOutLocalAccount() {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return;
  }
  await AsyncStorage.removeItem(ACTIVE_ACCOUNT_KEY);
}

export async function deleteAccountData(userId: string) {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (error) {
      const status = 'context' in error && error.context instanceof Response ? error.context.status : undefined;
      if (status === 404) throw new Error('Usuwanie konta wymaga wdrożenia funkcji Supabase delete-account. Jej plik znajduje się w supabase/functions/delete-account/.');
      throw new Error(error.message || 'Nie udało się usunąć konta.');
    }
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    if (signOutError) throw signOutError;
  } else {
    const accounts = await readAccounts();
    const existing = accounts.find((account) => account.id === userId);
    if (!existing) throw new Error('Nie znaleziono konta do usunięcia.');
    await writeAccounts(accounts.filter((account) => account.id !== userId).map((account) => account.trainer_id === userId ? { ...account, trainer_id: null } : account));
    await AsyncStorage.removeItem(ACTIVE_ACCOUNT_KEY);

    const assignedValue = await AsyncStorage.getItem(ASSIGNED_PLANS_KEY);
    const assignedPlans = assignedValue ? JSON.parse(assignedValue) as TrainingPlan[] : [];
    const removedPlanIds = new Set(assignedPlans.filter((plan) => plan.ownerId === userId).map((plan) => plan.id));
    await AsyncStorage.setItem(ASSIGNED_PLANS_KEY, JSON.stringify(assignedPlans.filter((plan) => plan.ownerId !== userId && plan.assignedTo !== userId)));
    const keysToRemove = [userStorageKey(PLANS_KEY, userId), userStorageKey(SESSIONS_KEY, userId), userStorageKey(WORKOUTS_KEY, userId)];
    await AsyncStorage.multiRemove(keysToRemove);

    if (removedPlanIds.size) {
      const remaining = await readAccounts();
      for (const account of remaining) {
        const sessionsKey = userStorageKey(SESSIONS_KEY, account.id);
        const sessionsValue = await AsyncStorage.getItem(sessionsKey);
        if (!sessionsValue) continue;
        const sessions = JSON.parse(sessionsValue) as TrainingSession[];
        await AsyncStorage.setItem(sessionsKey, JSON.stringify(sessions.filter((session) => !removedPlanIds.has(session.planId))));
      }
    }
  }

  await clearWorkoutJournal(userId);
  await clearTrainingCache(userId);
  const accountRows = await readAccounts();
  await writeAccounts(accountRows.filter((account) => account.id !== userId));
  const localKeys = [userStorageKey(PLANS_KEY, userId), userStorageKey(SESSIONS_KEY, userId), userStorageKey(WORKOUTS_KEY, userId)];
  await AsyncStorage.multiRemove(localKeys);
}

async function read_getLocalProfile(id: string) {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('profiles').select('id, full_name, role, trainer_code').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? { ...data, email: (await supabase.auth.getSession()).data.session?.user.email ?? '', trainer_id: null } as LocalProfile : null;
  }
  const account = (await readAccounts()).find((item) => item.id === id);
  if (!account) return null;
  const { password_hash: _hash, password_salt: _salt, ...profile } = account;
  return profile;
}

async function read_getConnectedProfiles(profile: LocalProfile) {
  if (isSupabaseConfigured && supabase) {
    const relationColumn = profile.role === 'trainer' ? 'trainee_id' : 'trainer_id';
    const ownColumn = profile.role === 'trainer' ? 'trainer_id' : 'trainee_id';
    const { data: relations, error: relationError } = await supabase.from('trainer_clients').select('trainer_id, trainee_id').eq(ownColumn, profile.id);
    if (relationError) throw relationError;
    const ids = (relations ?? []).map((relation) => relation[relationColumn]);
    if (!ids.length) return [];
    const { data, error } = await supabase.from('profiles').select('id, full_name, role').in('id', ids);
    if (error) throw error;
    return (data ?? []).map((item) => ({ ...item, email: '', trainer_code: null, trainer_id: null })) as LocalProfile[];
  }
  const accounts = await readAccounts();
  if (profile.role === 'trainer') return accounts.filter((account) => account.trainer_id === profile.id).map(({ id, full_name, email, role }) => ({ id, full_name, email, role }));
  const trainer = profile.trainer_id ? accounts.find((account) => account.id === profile.trainer_id) : null;
  return trainer ? [{ id: trainer.id, full_name: trainer.full_name, email: trainer.email, role: trainer.role }] : [];
}

export async function connectLocalTraineeToTrainer(traineeId: string, code: string) {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('connect_trainee_to_trainer', { p_code: code.trim().toUpperCase() });
    if (error) throw error;
    return;
  }
  const accounts = await readAccounts();
  const trainer = accounts.find((account) => account.role === 'trainer' && account.trainer_code === code.trim().toUpperCase());
  const trainee = accounts.find((account) => account.id === traineeId && account.role === 'trainee');
  if (!trainer) throw new Error('Nie znaleziono trenera z takim kodem na tym urządzeniu.');
  if (!trainee) throw new Error('Nie znaleziono konta osoby trenującej.');
  await writeAccounts(accounts.map((account) => account.id === trainee.id ? { ...account, trainer_id: trainer.id } : account));
}

export async function getLocalAssignedPlans(traineeId: string) {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('training_plans').select('plan_data').eq('assigned_to', traineeId);
    if (error) throw error;
    return (data ?? []).map((row) => row.plan_data as TrainingPlan).filter((plan) => !plan.completedAt);
  }
  const value = await AsyncStorage.getItem(ASSIGNED_PLANS_KEY);
  const plans = value ? JSON.parse(value) as TrainingPlan[] : [];
  return plans.filter((plan) => plan.assignedTo === traineeId && !plan.completedAt);
}

export async function saveLocalAssignedPlan(plan: TrainingPlan) {
  if (isSupabaseConfigured && supabase) {
    await saveCloudPlan(plan.ownerId ?? '', plan);
    return;
  }
  const value = await AsyncStorage.getItem(ASSIGNED_PLANS_KEY);
  const plans = value ? JSON.parse(value) as TrainingPlan[] : [];
  await AsyncStorage.setItem(ASSIGNED_PLANS_KEY, JSON.stringify([plan, ...plans.filter((item) => item.id !== plan.id)]));
}

export async function deleteLocalAssignedPlan(planId: string) {
  if (isSupabaseConfigured && supabase) {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('training_plans').delete().eq('id', planId).eq('owner_id', userData.user?.id ?? '');
    if (error) throw error;
    return;
  }
  const value = await AsyncStorage.getItem(ASSIGNED_PLANS_KEY);
  const plans = value ? JSON.parse(value) as TrainingPlan[] : [];
  await AsyncStorage.setItem(ASSIGNED_PLANS_KEY, JSON.stringify(plans.filter((item) => item.id !== planId)));
}


export async function getLocalTrainerResults(trainerId: string) {
  if (isSupabaseConfigured && supabase) {
    const { data: relations, error: relationError } = await supabase.from('trainer_clients').select('trainee_id').eq('trainer_id', trainerId);
    if (relationError) throw relationError;
    const ids = (relations ?? []).map((row) => row.trainee_id);
    if (!ids.length) return [];
    const [{ data: profiles, error: profileError }, { data: ownedPlanRows, error: ownPlanError }, { data: assignedPlanRows, error: assignedPlanError }, { data: sessionRows, error: sessionError }, { data: reportRows, error: reportError }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role, email').in('id', ids),
      supabase.from('training_plans').select('plan_data, owner_id, assigned_to').in('owner_id', ids),
      supabase.from('training_plans').select('plan_data, owner_id, assigned_to').in('assigned_to', ids),
      supabase.from('training_sessions').select('session_data, trainee_id').in('trainee_id', ids),
      supabase.from('training_reports').select('report_data').eq('trainer_id', trainerId),
    ]);
    if (profileError) throw profileError;
    if (ownPlanError) throw ownPlanError;
    if (assignedPlanError) throw assignedPlanError;
    if (sessionError) throw sessionError;
    if (reportError && !isMissingTrainingReportsTable(reportError)) throw reportError;
    const planRows = [...(ownedPlanRows ?? []), ...(assignedPlanRows ?? [])];
    return (profiles ?? []).map((trainee) => ({
      trainee: { ...trainee, trainer_code: null, trainer_id: trainerId } as LocalProfile,
      plans: (planRows ?? []).filter((row) => row.owner_id === trainee.id || row.assigned_to === trainee.id).map((row) => ({ ...(row.plan_data as TrainingPlan), ownerId: row.owner_id, assignedTo: row.assigned_to ?? undefined })),
      sessions: (sessionRows ?? []).filter((row) => row.trainee_id === trainee.id).map((row) => row.session_data as TrainingSession),
      reports: (reportRows ?? []).map((row) => row.report_data as TrainingReport).filter((report) => report.traineeId === trainee.id),
    }));
  }
  const accounts = await readAccounts();
  const trainees = accounts.filter((account) => account.role === 'trainee' && account.trainer_id === trainerId);
  const sharedValue = await AsyncStorage.getItem(ASSIGNED_PLANS_KEY);
  const sharedPlans = sharedValue ? JSON.parse(sharedValue) as TrainingPlan[] : [];
  const rawReports = await AsyncStorage.getItem(TRAINING_REPORTS_KEY);
  const localReports = rawReports ? JSON.parse(rawReports) as TrainingReport[] : [];
  return Promise.all(trainees.map(async (trainee) => {
    const [rawPlans, rawSessions] = await Promise.all([
      AsyncStorage.getItem(userStorageKey(PLANS_KEY, trainee.id)),
      AsyncStorage.getItem(userStorageKey(SESSIONS_KEY, trainee.id)),
    ]);
    const { password_hash: _hash, password_salt: _salt, ...profile } = trainee;
    const ownPlans = (rawPlans ? JSON.parse(rawPlans) as TrainingPlan[] : []).map((plan) => ({ ...plan, ownerId: plan.ownerId ?? trainee.id }));
    const traineePlans = [...ownPlans, ...sharedPlans.filter((plan) => plan.assignedTo === trainee.id && !ownPlans.some((own) => own.id === plan.id))];
    return {
      trainee: profile,
      plans: traineePlans,
      sessions: rawSessions ? JSON.parse(rawSessions) as TrainingSession[] : [],
      reports: localReports.filter((report) => report.trainerId === trainerId && report.traineeId === trainee.id),
    };
  }));
}

async function read_getLocalTraineeTrainingDataForTrainer(trainerId: string, traineeId: string) {
  if (isSupabaseConfigured && supabase) {
    const { data: relation, error: relationError } = await supabase.from('trainer_clients').select('trainee_id').eq('trainer_id', trainerId).eq('trainee_id', traineeId).maybeSingle();
    if (relationError) throw relationError;
    if (!relation) throw new Error('Nie masz dostępu do tego podopiecznego.');
    const [{ data: ownedRows, error: ownError }, { data: assignedRows, error: assignedError }, { data: sessionRows, error: sessionError }] = await Promise.all([
      supabase.from('training_plans').select('plan_data, owner_id, assigned_to').eq('owner_id', traineeId),
      supabase.from('training_plans').select('plan_data, owner_id, assigned_to').eq('assigned_to', traineeId),
      supabase.from('training_sessions').select('session_data').eq('trainee_id', traineeId),
    ]);
    if (ownError) throw ownError;
    if (assignedError) throw assignedError;
    if (sessionError) throw sessionError;
    const plans = new Map<string, TrainingPlan>();
    for (const row of [...(ownedRows ?? []), ...(assignedRows ?? [])]) { const plan = { ...(row.plan_data as TrainingPlan), ownerId: row.owner_id, assignedTo: row.assigned_to ?? undefined }; plans.set(plan.id, plan); }
    return { trainee: await getLocalProfile(traineeId) as LocalProfile, plans: [...plans.values()], sessions: (sessionRows ?? []).map((row) => row.session_data as TrainingSession) };
  }
  const accounts = await readAccounts();
  const trainer = accounts.find((account) => account.id === trainerId && account.role === 'trainer');
  const trainee = accounts.find((account) => account.id === traineeId && account.role === 'trainee' && account.trainer_id === trainerId);
  if (!trainer || !trainee) throw new Error('Nie masz dostępu do tego podopiecznego.');
  const [rawPlans, rawSessions, rawAssignedPlans] = await Promise.all([
    AsyncStorage.getItem(userStorageKey(PLANS_KEY, trainee.id)),
    AsyncStorage.getItem(userStorageKey(SESSIONS_KEY, trainee.id)),
    AsyncStorage.getItem(ASSIGNED_PLANS_KEY),
  ]);
  const ownPlans = (rawPlans ? JSON.parse(rawPlans) as TrainingPlan[] : []).map((plan) => ({ ...plan, ownerId: plan.ownerId ?? trainee.id }));
  const assignedPlans = rawAssignedPlans ? JSON.parse(rawAssignedPlans) as TrainingPlan[] : [];
  const plans = [...ownPlans, ...assignedPlans.filter((plan) => plan.assignedTo === trainee.id && !ownPlans.some((own) => own.id === plan.id))];
  const { password_hash: _hash, password_salt: _salt, ...profile } = trainee;
  return { trainee: profile, plans, sessions: rawSessions ? JSON.parse(rawSessions) as TrainingSession[] : [] };
}

async function saveCloudPlan(userId: string, plan: TrainingPlan) {
  if (!supabase) return;
  const ownerId = plan.ownerId ?? userId;
  const { error } = await supabase.from('training_plans').upsert({
    id: plan.id,
    owner_id: ownerId,
    assigned_to: plan.assignedTo ?? null,
    name: plan.name,
    plan_data: { ...plan, ownerId },
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function read_loadUserTrainingData(userId: string) {
  if (isSupabaseConfigured && supabase) {
    const [{ data: planRows, error: planError }, { data: sessionRows, error: sessionError }, { data: reportRows, error: reportError }] = await Promise.all([
      supabase.from('training_plans').select('plan_data').or(`owner_id.eq.${userId},assigned_to.eq.${userId}`),
      supabase.from('training_sessions').select('session_data').eq('trainee_id', userId).order('completed_at', { ascending: false }),
      supabase.from('training_reports').select('report_data').eq('trainee_id', userId).order('created_at', { ascending: false }),
    ]);
    if (planError) throw planError;
    if (sessionError) throw sessionError;
    if (reportError && !isMissingTrainingReportsTable(reportError)) throw reportError;
    return { plans: (planRows ?? []).map((row) => row.plan_data as TrainingPlan), sessions: (sessionRows ?? []).map((row) => row.session_data as TrainingSession), reports: (reportRows ?? []).map((row) => row.report_data as TrainingReport) };
  }
  const [rawPlans, rawSessions, assignedPlans, rawReports] = await Promise.all([
    AsyncStorage.getItem(userStorageKey(PLANS_KEY, userId)), AsyncStorage.getItem(userStorageKey(SESSIONS_KEY, userId)), getLocalAssignedPlans(userId), AsyncStorage.getItem(TRAINING_REPORTS_KEY),
  ]);
  const ownPlans = rawPlans ? JSON.parse(rawPlans) as TrainingPlan[] : [];
  const reports = rawReports ? JSON.parse(rawReports) as TrainingReport[] : [];
  return { plans: [...ownPlans, ...assignedPlans.filter((plan) => !ownPlans.some((own) => own.id === plan.id))], sessions: rawSessions ? JSON.parse(rawSessions) as TrainingSession[] : [], reports: reports.filter((report) => report.traineeId === userId) };
}

export async function saveUserPlans(userId: string, plans: TrainingPlan[]) {
  if (isSupabaseConfigured && supabase) {
    const ownPlans = plans.filter((plan) => !plan.ownerId || plan.ownerId === userId);
    await Promise.all(ownPlans.map((plan) => saveCloudPlan(userId, { ...plan, ownerId: userId })));
    return;
  }
  await AsyncStorage.setItem(userStorageKey(PLANS_KEY, userId), JSON.stringify(plans.filter((plan) => !plan.ownerId || plan.ownerId === userId)));
}

export async function saveTrainerEditedTraineePlan(trainerId: string, traineeId: string, plan: TrainingPlan) {
  if (plan.ownerId === trainerId) {
    await saveLocalAssignedPlan({ ...plan, ownerId: trainerId, assignedTo: traineeId });
    return;
  }
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('training_plans').update({
      name: plan.name,
      assigned_to: plan.assignedTo ?? null,
      plan_data: { ...plan, ownerId: traineeId },
      updated_at: new Date().toISOString(),
    }).eq('id', plan.id).eq('owner_id', traineeId).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Nie udało się zapisać planu podopiecznego. Sprawdź uprawnienia trenera w Supabase.');
    return;
  }
  const accounts = await readAccounts();
  const linked = accounts.some((account) => account.id === trainerId && account.role === 'trainer')
    && accounts.some((account) => account.id === traineeId && account.role === 'trainee' && account.trainer_id === trainerId);
  if (!linked) throw new Error('Nie masz dostępu do tego podopiecznego.');
  const key = userStorageKey(PLANS_KEY, traineeId);
  const raw = await AsyncStorage.getItem(key);
  const plans = raw ? JSON.parse(raw) as TrainingPlan[] : [];
  if (!plans.some((item) => item.id === plan.id)) throw new Error('Nie znaleziono planu podopiecznego.');
  await AsyncStorage.setItem(key, JSON.stringify(plans.map((item) => item.id === plan.id ? { ...plan, ownerId: traineeId } : item)));
}

export async function deleteUserPlan(userId: string, planId: string) {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('training_plans').delete().eq('id', planId).eq('owner_id', userId);
    if (error) throw error;
    return;
  }
  const raw = await AsyncStorage.getItem(userStorageKey(PLANS_KEY, userId));
  const plans = raw ? JSON.parse(raw) as TrainingPlan[] : [];
  await AsyncStorage.setItem(userStorageKey(PLANS_KEY, userId), JSON.stringify(plans.filter((plan) => plan.id !== planId)));
  await deleteLocalAssignedPlan(planId);
}

export async function saveUserSessions(userId: string, sessions: TrainingSession[]) {
  if (!sessions.length && isSupabaseConfigured) return;
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('training_sessions').upsert(sessions.map((item) => ({ id: item.id, plan_id: item.planId, trainee_id: userId, session_data: item, completed_at: item.completedAt })));
    if (error) throw error;
    return;
  }
  await AsyncStorage.setItem(userStorageKey(SESSIONS_KEY, userId), JSON.stringify(sessions));
}

export async function saveTrainingReport(report: TrainingReport) {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('training_reports').insert({
      id: report.id,
      trainee_id: report.traineeId,
      trainer_id: report.trainerId,
      plan_id: report.planId,
      report_data: report,
      created_at: report.createdAt,
    });
    if (error) throw error;
    return;
  }
  const accounts = await readAccounts();
  const linked = accounts.some((account) => account.id === report.traineeId && account.role === 'trainee' && account.trainer_id === report.trainerId);
  if (!linked) throw new Error('Nie znaleziono połączenia z trenerem.');
  const raw = await AsyncStorage.getItem(TRAINING_REPORTS_KEY);
  const reports = raw ? JSON.parse(raw) as TrainingReport[] : [];
  await AsyncStorage.setItem(TRAINING_REPORTS_KEY, JSON.stringify([report, ...reports]));
}

export async function getLocalProfile(id: string) {
  const actor = (await supabase?.auth.getSession())?.data.session?.user.id ?? id;
  return isSupabaseConfigured ? cachedTrainingRead(`profile:${actor}:${id}`, () => read_getLocalProfile(id)) : read_getLocalProfile(id);
}
export async function getConnectedProfiles(profile: LocalProfile) {
  return isSupabaseConfigured ? cachedTrainingRead(`connections:${profile.id}:${profile.role}`, () => read_getConnectedProfiles(profile)) : read_getConnectedProfiles(profile);
}
export async function loadUserTrainingData(userId: string) {
  const data = isSupabaseConfigured ? await cachedTrainingRead(`training:${userId}`, () => read_loadUserTrainingData(userId)) : await read_loadUserTrainingData(userId);
  const pending = await cachedWorkoutSessions({ actorId: userId, ownerId: userId });
  const merged = new Map(data.sessions.map((entry) => [entry.id, entry]));
  pending.forEach((entry) => merged.set(entry.id, entry));
  return { ...data, sessions: [...merged.values()].sort((a, b) => b.completedAt.localeCompare(a.completedAt)) };
}
export async function getLocalTraineeTrainingDataForTrainer(trainerId: string, traineeId: string) {
  const data = isSupabaseConfigured ? await cachedTrainingRead(`coached:${trainerId}:${traineeId}`, () => read_getLocalTraineeTrainingDataForTrainer(trainerId, traineeId)) : await read_getLocalTraineeTrainingDataForTrainer(trainerId, traineeId);
  const pending = await cachedWorkoutSessions({ actorId: trainerId, ownerId: traineeId });
  const merged = new Map(data.sessions.map((entry) => [entry.id, entry]));
  pending.forEach((entry) => merged.set(entry.id, entry));
  return { ...data, sessions: [...merged.values()] };
}
