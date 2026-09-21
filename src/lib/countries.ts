import { COUNTRY_ROWS } from './countryRows';

const byAlpha3 = new Map<string, { alpha2: string; numeric: string }>();
const numericToAlpha3 = new Map<string, string>();
for (const [a3, a2, num] of COUNTRY_ROWS) {
  byAlpha3.set(a3, { alpha2: a2, numeric: num });
  if (num) numericToAlpha3.set(String(Number(num)), a3);
}

/** world-atlas ids are numeric ISO 3166-1 (spec 5). Shapes without an id are matched by name. */
const NAME_TO_ALPHA3: Record<string, string> = { Kosovo: 'XKX' };

export function alpha3FromAtlas(id: string | number | undefined, name: string | undefined): string | null {
  if (id !== undefined && id !== null && id !== '') return numericToAlpha3.get(String(Number(id))) ?? null;
  return (name && NAME_TO_ALPHA3[name]) || null;
}

let regionNames: Intl.DisplayNames | null | undefined;
const getRegionNames = () => {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['ru'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  return regionNames;
};

const nameCache = new Map<string, string>();

/** Russian country name via Intl (no bundled translations); falls back to the ISO code. */
export function countryName(iso3: string): string {
  const cached = nameCache.get(iso3);
  if (cached) return cached;
  const alpha2 = byAlpha3.get(iso3)?.alpha2;
  let name = iso3;
  if (alpha2) {
    try {
      name = getRegionNames()?.of(alpha2) ?? iso3;
    } catch {
      name = iso3;
    }
  }
  nameCache.set(iso3, name);
  return name;
}

/** Flag emoji built from regional indicator symbols; empty for unknown codes. */
export function flagEmoji(iso3: string): string {
  const alpha2 = byAlpha3.get(iso3)?.alpha2;
  if (!alpha2 || alpha2.length !== 2) return '';
  return String.fromCodePoint(...[...alpha2].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export const isKnownCountry = (iso3: string) => byAlpha3.has(iso3);

/** Lowercased, ё-folded form used for search matching. */
export const normalizeQuery = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е');
