import raw from '../../scripts/passports.json';
import { PassportsFileSchema, type PassportInfo } from '../../shared';

/** Static passport list (the same file the build script reads) so the select works before/without the manifest. */
export const PASSPORTS: PassportInfo[] = PassportsFileSchema.parse(raw);
export const DEFAULT_PASSPORT = 'BY';
const STORAGE_KEY = 'visa-map:passport';

export function loadStoredPassport(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && PASSPORTS.some((p) => p.code === stored)) return stored;
  } catch {
    // localStorage can be blocked (private mode); the default is fine.
  }
  return DEFAULT_PASSPORT;
}

export function storePassport(code: string) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Ignore: remembering the passport is a convenience only.
  }
}
