import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ChunkMapSchema, OverridesFileSchema, PassportsFileSchema, TerritoriesFileSchema } from '../../shared';

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')) as unknown;

const chunkMap = ChunkMapSchema.parse(read('data-src/chunks.json'));
const territories = TerritoriesFileSchema.parse(read('data-src/territories.json'));
const overrides = OverridesFileSchema.parse(read('data-src/overrides.json'));
const passports = PassportsFileSchema.parse(read('scripts/passports.json'));

describe('data-src/chunks.json', () => {
  it('uses only the 10 documented chunk ids', () => {
    expect(new Set(Object.values(chunkMap)).size).toBe(10);
  });

  it.each([
    ['XKX', 'europe-west'],
    ['TWN', 'asia-east-southeast'],
    ['BLR', 'europe-east'],
    ['KAZ', 'asia-central-south'],
    ['USA', 'americas-north'],
    ['GRL', 'americas-north'],
    ['GUF', 'americas-south'],
  ])('assigns %s to %s', (iso, chunk) => {
    expect(chunkMap[iso]).toBe(chunk);
  });
});

describe('data-src consistency', () => {
  it('every territory and its parent has a chunk', () => {
    for (const t of territories) {
      expect(chunkMap[t.territory], t.territory).toBeDefined();
      expect(chunkMap[t.parent], t.parent).toBeDefined();
    }
  });

  it('has no duplicate territories', () => {
    const ids = territories.map((t) => t.territory);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('overrides only reference configured passports and known destinations', () => {
    const codes = new Set(passports.map((p) => p.code));
    for (const o of overrides) {
      expect(codes.has(o.passport), o.passport).toBe(true);
      expect(chunkMap[o.destination], o.destination).toBeDefined();
    }
  });

  it('ships the initial US -> PRK override', () => {
    expect(overrides.find((o) => o.passport === 'US' && o.destination === 'PRK')?.entry.status).toBe('no_admission');
  });
});
