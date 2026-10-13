export const MIN_PASSWORD_LENGTH = 15;

const commonPasswords = new Set([
  'passwordpassword',
  'password1234567',
  'qwertyuiopasdfgh',
  '123456789012345',
  '123456789123456',
  'letmeinletmein1',
  'adminadminadmin',
  'iloveyouiloveyou',
  'welcome12345678',
]);

export function normalizeEmail(value: string) {
  return value.trim().toLocaleLowerCase('pl-PL');
}

export function isValidEmail(value: string) {
  const email = normalizeEmail(value);
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(email);
}

export function getPasswordProblem(password: string, email: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków. Możesz użyć kilku słów jako jednej frazy.`;
  }

  const normalizedPassword = password.toLocaleLowerCase('pl-PL');
  if (commonPasswords.has(normalizedPassword) || /^(.)\1{14,}$/u.test(normalizedPassword)) {
    return 'To hasło jest zbyt łatwe do odgadnięcia. Wybierz inną, dłuższą frazę.';
  }

  const emailName = normalizeEmail(email).split('@')[0];
  if (emailName.length >= 6 && normalizedPassword.includes(emailName)) {
    return 'Nie używaj adresu e-mail w haśle. Wybierz niezależną frazę.';
  }

  return null;
}
