import { vi } from 'vitest';
import { VisaDb } from '../../src/data/db';

export const BASE = 'http://test/data/';
let n = 0;
export const freshDb = () => new VisaDb(`test-${++n}-${Math.random()}`);

export const entry = (status = 'visa_free', days: number | null = 90) => ({
  status,
  days,
  note: null,
  inheritedFrom: null,
});

export function makeFiles(
  passport: string,
  opts: { builtAt?: string; schemaVersion?: number; versions?: Record<string, string>; tag?: string } = {},
) {
  const { builtAt = 'b1', schemaVersion = 1, versions = {}, tag = passport } = opts;
  const v = (id: string) => versions[id] ?? `${id}-v1`;
  return {
    'manifest.json': {
      schemaVersion,
      builtAt,
      source: { name: 's', url: 'u' },
      passports: [{ code: passport, iso3: 'BLR', name: 'x' }],
    },
    [`${passport}/index.json`]: {
      passport,
      chunks: [
        { id: 'europe-east', file: 'europe-east.json', version: v('europe-east'), countries: 1 },
        { id: 'asia-west', file: 'asia-west.json', version: v('asia-west'), countries: 1 },
      ],
    },
    [`${passport}/europe-east.json`]: { POL: { ...entry(), note: tag } },
    [`${passport}/asia-west.json`]: { TUR: { ...entry('evisa', null), note: tag } },
  } as Record<string, unknown>;
}

/** In-memory server: counts requests, can fail/delay/mutate individual files. */
export function makeServer(files: Record<string, unknown>) {
  const hits: string[] = [];
  const failing = new Map<string, number>(); // path -> remaining 500 responses (Infinity = always)
  const gates = new Map<string, Promise<void>>();
  let offline = false;
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    hits.push(u);
    if (offline) throw new TypeError('Failed to fetch');
    const path = u.replace(BASE, '').split('?')[0];
    const gate = gates.get(path);
    if (gate) await gate;
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const left = failing.get(path) ?? 0;
    if (left > 0) {
      failing.set(path, left - 1);
      return new Response('boom', { status: 500 });
    }
    if (!(path in files)) return new Response('nf', { status: 404 });
    const body = files[path];
    return new Response(typeof body === 'string' ? body : JSON.stringify(body));
  }) as unknown as typeof fetch;
  return {
    files,
    hits,
    fetchFn,
    fail: (path: string, times = Infinity) => failing.set(path, times),
    gate: (path: string) => {
      let open!: () => void;
      gates.set(path, new Promise<void>((r) => (open = r)));
      return open;
    },
    setOffline: (v: boolean) => (offline = v),
    chunkHits: () => hits.filter((h) => /\/(europe-east|asia-west)\.json/.test(h)),
  };
}
