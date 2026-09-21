import { describe, expect, it } from 'vitest';
import type { Entry } from '../../shared';
import { alpha3FromAtlas, countryName, flagEmoji, isKnownCountry } from '../../src/lib/countries';
import { groupCountries, searchCountries, selectableCountries } from '../../src/lib/countryList';
import { CHUNK_CENTROIDS, sortChunksByDistance } from '../../src/lib/chunks';
import { colorFor, formatDays, LEGEND, STATUS_COLORS, STATUS_LABELS, statusText } from '../../src/lib/status';

const entry = (status: Entry['status'], days: number | null = null, inheritedFrom: string | null = null): Entry => ({
  status,
  days,
  note: null,
  inheritedFrom,
});

describe('status colours (spec 3)', () => {
  it.each([
    ['visa_free', '#2E9E5B'],
    ['voa', '#F2C230'],
    ['evisa', '#F6B26B'],
    ['visa_required', '#EF8A2F'],
    ['no_admission', '#D64545'],
    ['self', '#4A6FA5'],
    ['unknown', '#C9CDD2'],
  ] as const)('%s -> %s', (status, color) => {
    expect(colorFor(entry(status))).toBe(color);
  });

  it('paints a missing entry grey', () => {
    expect(colorFor(undefined)).toBe(STATUS_COLORS.none);
  });

  it('paints a territory like its parent (same status, same colour)', () => {
    expect(colorFor(entry('evisa', null, 'DNK'))).toBe(colorFor(entry('evisa')));
  });

  it('legend has six items without self', () => {
    expect(LEGEND).toHaveLength(6);
    expect(LEGEND.map((l) => l.status)).not.toContain('self');
  });
});

describe('status text (colour is never the only signal)', () => {
  it.each([
    [entry('visa_free', 90), 'Без визы, до 90 дней'],
    [entry('visa_free'), 'Без визы'],
    [entry('voa'), STATUS_LABELS.voa],
    [entry('no_admission'), 'Въезд закрыт'],
    [undefined, 'Нет данных'],
  ])('%j', (e, want) => {
    expect(statusText(e)).toBe(want);
  });

  it.each([
    [1, '1 день'],
    [2, '2 дня'],
    [5, '5 дней'],
    [11, '11 дней'],
    [21, '21 день'],
    [90, '90 дней'],
    [180, '180 дней'],
  ])('formatDays(%i)', (n, want) => {
    expect(formatDays(n)).toBe(want);
  });
});

describe('countries', () => {
  it('maps numeric atlas ids to alpha-3 (leading zeros ignored)', () => {
    expect(alpha3FromAtlas('004', 'Afghanistan')).toBe('AFG');
    expect(alpha3FromAtlas('112', 'Belarus')).toBe('BLR');
    expect(alpha3FromAtlas(840, 'United States of America')).toBe('USA');
  });

  it('matches id-less shapes by name and leaves the rest unmatched', () => {
    expect(alpha3FromAtlas(undefined, 'Kosovo')).toBe('XKX');
    expect(alpha3FromAtlas(undefined, 'Somaliland')).toBeNull();
    expect(alpha3FromAtlas(undefined, 'N. Cyprus')).toBeNull();
  });

  it('gives Russian names and flags', () => {
    expect(countryName('BLR')).toBe('Беларусь');
    expect(countryName('KAZ')).toBe('Казахстан');
    expect(countryName('XKX')).toBe('Косово');
    expect(countryName('ZZZ')).toBe('ZZZ');
    expect(flagEmoji('BLR')).toBe('🇧🇾');
    expect(flagEmoji('ZZZ')).toBe('');
    expect(isKnownCountry('XKX')).toBe(true);
  });
});

describe('search and list grouping', () => {
  const entries = {
    BLR: entry('self'),
    POL: entry('visa_required'),
    DEU: entry('evisa'),
    KAZ: entry('visa_free', 90),
    GRL: entry('evisa', null, 'DNK'),
    PRK: entry('no_admission'),
  };
  const ids = selectableCountries(entries, ['FRA', 'ESH']);

  it('lists entries plus map-only countries, sorted by Russian name', () => {
    expect(ids).toContain('FRA');
    expect(ids).toContain('ESH');
    expect([...ids].sort((a, b) => countryName(a).localeCompare(countryName(b), 'ru'))).toEqual(ids);
  });

  it('searches by prefix first, then substring, case- and ё-insensitively', () => {
    expect(searchCountries(ids, 'каза')[0]).toBe('KAZ');
    expect(searchCountries(ids, 'БЕЛАРУ')).toContain('BLR');
    expect(searchCountries(ids, '')).toEqual([]);
    expect(searchCountries(ids, 'zzzz')).toEqual([]);
    const res = searchCountries(ids, 'ия');
    expect(res.length).toBeGreaterThan(0);
  });

  it('groups by status and only shows missing entries under "no data" when loading is complete', () => {
    const loading = groupCountries(ids, entries, false);
    expect(loading.unknown).toEqual([]);
    expect(loading.visa_free).toEqual(['KAZ']);
    expect(loading.self).toEqual(['BLR']);
    expect(loading.no_admission).toEqual(['PRK']);
    expect(loading.visa.slice(0, 2).every((id) => entries[id as keyof typeof entries].status === 'evisa')).toBe(true);
    expect(loading.visa[loading.visa.length - 1]).toBe('POL');

    const done = groupCountries(ids, entries, true);
    expect(done.unknown).toEqual(expect.arrayContaining(['FRA', 'ESH']));
  });
});

describe('chunk request order (spec 4.4 step 5)', () => {
  it('requests the chunk nearest to the viewport centre first', () => {
    const ids = Object.keys(CHUNK_CENTROIDS) as (keyof typeof CHUNK_CENTROIDS)[];
    expect(sortChunksByDistance(ids, [30, 50])[0]).toBe('europe-east');
    expect(sortChunksByDistance(ids, [-100, 40])[0]).toBe('americas-north');
    expect(sortChunksByDistance(ids, [140, -20])[0]).toBe('oceania');
    expect(sortChunksByDistance(ids, [0, 0])).toHaveLength(ids.length);
  });
});
