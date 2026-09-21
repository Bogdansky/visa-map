import type { Entry, Status } from '../../shared';
import { countryName, isKnownCountry, normalizeQuery } from './countries';

/** Countries that can be searched/listed: everything with data plus everything drawn on the map. */
export function selectableCountries(entries: Record<string, Entry>, onMap: Iterable<string>): string[] {
  const all = new Set<string>([...Object.keys(entries), ...onMap]);
  return [...all].filter(isKnownCountry).sort((a, b) => countryName(a).localeCompare(countryName(b), 'ru'));
}

/** Name search: prefix matches first, then substring matches (ё folded to е). */
export function searchCountries(ids: string[], query: string, limit = 8): string[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const id of ids) {
    const name = normalizeQuery(countryName(id));
    if (name.startsWith(q)) starts.push(id);
    else if (name.includes(q)) contains.push(id);
  }
  return [...starts, ...contains].slice(0, limit);
}

export type GroupId = 'self' | 'visa_free' | 'voa' | 'visa' | 'no_admission' | 'unknown';

export const GROUPS: { id: GroupId; title: string }[] = [
  { id: 'self', title: 'Ваша страна' },
  { id: 'visa_free', title: 'Без визы' },
  { id: 'voa', title: 'Виза по прилёте' },
  { id: 'visa', title: 'Электронная виза / виза' },
  { id: 'no_admission', title: 'Въезд закрыт' },
  { id: 'unknown', title: 'Нет данных' },
];

const GROUP_OF: Record<Status, GroupId> = {
  self: 'self',
  visa_free: 'visa_free',
  voa: 'voa',
  evisa: 'visa',
  visa_required: 'visa',
  no_admission: 'no_admission',
  unknown: 'unknown',
};

/** Groups countries by status (spec 6). Countries without an entry land in "Нет данных" once `complete`. */
export function groupCountries(
  ids: string[],
  entries: Record<string, Entry>,
  complete: boolean,
): Record<GroupId, string[]> {
  const groups: Record<GroupId, string[]> = {
    self: [],
    visa_free: [],
    voa: [],
    visa: [],
    no_admission: [],
    unknown: [],
  };
  for (const id of ids) {
    const entry = entries[id];
    if (entry) groups[GROUP_OF[entry.status]].push(id);
    else if (complete) groups.unknown.push(id);
  }
  // e-visa before embassy visa inside the shared group
  groups.visa.sort(
    (a, b) => Number(entries[a].status === 'visa_required') - Number(entries[b].status === 'visa_required'),
  );
  return groups;
}
