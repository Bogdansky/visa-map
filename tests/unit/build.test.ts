import { describe, expect, it } from 'vitest';
import { buildAll, buildPassport, chunkVersion, type BuildInput } from '../../scripts/lib/build';
import { parseTidyCsv } from '../../scripts/lib/csv';
import { ChunkFileSchema, ChunkMapSchema, ManifestSchema, PassportIndexSchema } from '../../shared';

const csv = `Passport,Destination,Requirement
BLR,BLR,-1
BLR,KAZ,90
BLR,POL,visa required
BLR,DNK,e-visa
BLR,PRK,visa required
BLR,USA,visa required
USA,USA,-1
USA,DNK,90
USA,PRK,visa required
USA,POL,visa free
`;

const base = (): BuildInput => ({
  rows: parseTidyCsv(csv),
  passports: [
    { code: 'BY', iso3: 'BLR', name: 'Беларусь' },
    { code: 'US', iso3: 'USA', name: 'США' },
  ],
  overrides: [],
  territories: [],
  chunkMap: ChunkMapSchema.parse({
    BLR: 'europe-east',
    KAZ: 'asia-central-south',
    POL: 'europe-east',
    DNK: 'europe-west',
    PRK: 'asia-east-southeast',
    USA: 'americas-north',
    GRL: 'americas-north',
    PRI: 'americas-north',
  }),
});

const by = (input: BuildInput) => buildPassport(input.passports[0], input);
const us = (input: BuildInput) => buildPassport(input.passports[1], input);

describe('parseTidyCsv', () => {
  it('parses rows and rejects a changed header', () => {
    expect(parseTidyCsv(csv)).toHaveLength(10);
    expect(() => parseTidyCsv('A,B,C\n1,2,3')).toThrow(/header/);
  });
});

describe('buildPassport: source rows', () => {
  it('normalizes statuses and only keeps the passport own rows', () => {
    const { entries } = by(base());
    expect(entries.KAZ).toEqual({ status: 'visa_free', days: 90, note: null, inheritedFrom: null });
    expect(entries.BLR.status).toBe('self');
    expect(entries.DNK.status).toBe('evisa');
    expect(entries.POL.status).toBe('visa_required'); // BY's own row, not the US `visa free`
  });

  it('fails on an unknown source value instead of mapping it to unknown', () => {
    const input = base();
    input.rows.push({ passport: 'BLR', destination: 'FRA', requirement: 'teleport' });
    input.chunkMap.FRA = 'europe-west';
    expect(() => by(input)).toThrow(/Unknown Requirement/);
  });

  it('fails on duplicate rows', () => {
    const input = base();
    input.rows.push({ passport: 'BLR', destination: 'KAZ', requirement: '30' });
    expect(() => by(input)).toThrow(/Duplicate/);
  });
});

describe('buildPassport: overrides', () => {
  it('has priority over the source and is reported', () => {
    const input = base();
    input.overrides = [
      {
        passport: 'US',
        destination: 'PRK',
        entry: { status: 'no_admission', days: null, note: null },
        reason: 'closed',
      },
    ];
    const { entries, stats } = us(input);
    expect(entries.PRK.status).toBe('no_admission');
    expect(stats.overridesApplied).toHaveLength(1);
    expect(stats.staleOverrides).toEqual([]);
    // other passports are untouched
    expect(by(input).entries.PRK.status).toBe('visa_required');
  });

  it('flags an override that equals the source as stale', () => {
    const input = base();
    input.overrides = [
      { passport: 'BY', destination: 'PRK', entry: { status: 'visa_required', days: null, note: null }, reason: 'x' },
    ];
    expect(by(input).stats.staleOverrides).toHaveLength(1);
  });

  it('keeps note and days from the override', () => {
    const input = base();
    input.overrides = [
      { passport: 'BY', destination: 'KAZ', entry: { status: 'visa_free', days: 30, note: 'ЕАЭС' }, reason: 'x' },
    ];
    expect(by(input).entries.KAZ).toEqual({ status: 'visa_free', days: 30, note: 'ЕАЭС', inheritedFrom: null });
  });

  it('rejects an override for a destination that does not exist', () => {
    const input = base();
    input.overrides = [
      { passport: 'BY', destination: 'ZZZ', entry: { status: 'voa', days: null, note: null }, reason: 'x' },
    ];
    expect(() => by(input)).toThrow(/neither in the source nor a territory/);
  });
});

describe('buildPassport: territories', () => {
  const territories = [
    { territory: 'GRL', parent: 'DNK' },
    { territory: 'PRI', parent: 'USA' },
  ];

  it('copies the parent entry and marks inheritedFrom', () => {
    const input = { ...base(), territories };
    expect(by(input).entries.GRL).toEqual({ status: 'evisa', days: null, note: null, inheritedFrom: 'DNK' });
    expect(us(input).entries.GRL).toEqual({ status: 'visa_free', days: 90, note: null, inheritedFrom: 'DNK' });
  });

  it('gives `self` to a territory whose parent is the passport country', () => {
    const input = { ...base(), territories };
    expect(us(input).entries.PRI).toEqual({ status: 'self', days: null, note: null, inheritedFrom: 'USA' });
    expect(by(input).entries.PRI).toEqual({ status: 'visa_required', days: null, note: null, inheritedFrom: 'USA' });
  });

  it('prefers an override on the territory itself over inheritance', () => {
    const input = { ...base(), territories };
    input.overrides = [
      {
        passport: 'BY',
        destination: 'GRL',
        entry: { status: 'visa_required', days: null, note: 'своя виза' },
        reason: 'x',
      },
    ];
    expect(by(input).entries.GRL).toEqual({
      status: 'visa_required',
      days: null,
      note: 'своя виза',
      inheritedFrom: null,
    });
  });

  it('does not inherit into territories already present in the source', () => {
    const input = { ...base(), territories: [{ territory: 'POL', parent: 'DNK' }] };
    const { entries, stats } = by(input);
    expect(entries.POL.inheritedFrom).toBeNull();
    expect(entries.POL.status).toBe('visa_required');
    expect(stats.territoriesSkipped).toEqual(['POL (in source)']);
  });

  it('inherits `unknown` from a parent with unknown status', () => {
    const input = { ...base(), territories };
    input.rows = input.rows.map((r) =>
      r.passport === 'BLR' && r.destination === 'DNK' ? { ...r, requirement: '' } : r,
    );
    expect(by(input).entries.GRL).toEqual({ status: 'unknown', days: null, note: null, inheritedFrom: 'DNK' });
  });

  it('fails when the parent has no entry', () => {
    const input = { ...base(), territories: [{ territory: 'GRL', parent: 'SWE' }] };
    expect(() => by(input)).toThrow(/parent SWE/);
  });
});

describe('buildPassport: chunks', () => {
  it('puts every country in exactly one chunk', () => {
    const { entries, chunks } = by(base());
    const seen = Object.values(chunks).flatMap((c) => Object.keys(c!));
    expect(seen.sort()).toEqual(Object.keys(entries).sort());
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('fails when a dataset country has no chunk', () => {
    const input = base();
    delete input.chunkMap.KAZ;
    expect(() => by(input)).toThrow(/without a chunk.*KAZ/);
  });
});

describe('buildAll', () => {
  const built = buildAll(base(), '2026-01-01T00:00:00Z', { name: 'src', url: 'https://example.test' });

  it('writes schema-valid manifest, indexes and chunks', () => {
    expect(() => ManifestSchema.parse(JSON.parse(built.files.get('manifest.json')!))).not.toThrow();
    const index = PassportIndexSchema.parse(JSON.parse(built.files.get('BY/index.json')!));
    for (const c of index.chunks) {
      const chunk = ChunkFileSchema.parse(JSON.parse(built.files.get(`BY/${c.file}`)!));
      expect(Object.keys(chunk)).toHaveLength(c.countries);
      expect(c.version).toBe(chunkVersion(built.files.get(`BY/${c.file}`)!));
    }
  });

  it('keeps the version of an unchanged chunk across builds and changes it with content', () => {
    const again = buildAll(base(), '2027-01-01T00:00:00Z', { name: 'src', url: 'https://example.test' });
    const version = (o: typeof built, chunk: string) =>
      PassportIndexSchema.parse(JSON.parse(o.files.get('BY/index.json')!)).chunks.find((c) => c.id === chunk)!.version;
    expect(version(again, 'europe-east')).toBe(version(built, 'europe-east'));

    const changed = base();
    changed.rows = changed.rows.map((r) =>
      r.destination === 'POL' && r.passport === 'BLR' ? { ...r, requirement: '30' } : r,
    );
    const other = buildAll(changed, '2026-01-01T00:00:00Z', { name: 'src', url: 'https://example.test' });
    expect(version(other, 'europe-east')).not.toBe(version(built, 'europe-east'));
    expect(version(other, 'europe-west')).toBe(version(built, 'europe-west'));
  });
});
