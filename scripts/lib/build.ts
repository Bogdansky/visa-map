import { createHash } from 'node:crypto';
import {
  ChunkFileSchema,
  ManifestSchema,
  PassportIndexSchema,
  SCHEMA_VERSION,
  type ChunkFile,
  type ChunkId,
  type ChunkMap,
  type Entry,
  type Manifest,
  type Override,
  type PassportIndex,
  type PassportInfo,
  type Status,
  type Territory,
} from '../../shared';
import type { SourceRow } from './csv';
import { normalizeRequirement } from './normalize';

export interface PassportStats {
  byStatus: Partial<Record<Status, number>>;
  missingFromSource: string[];
  overridesApplied: string[];
  staleOverrides: string[];
  territoriesBuilt: string[];
  territoriesSkipped: string[];
}

export interface PassportBuild {
  entries: Record<string, Entry>;
  chunks: Partial<Record<ChunkId, ChunkFile>>;
  stats: PassportStats;
}

export interface BuildInput {
  rows: SourceRow[];
  passports: PassportInfo[];
  overrides: Override[];
  territories: Territory[];
  chunkMap: ChunkMap;
}

const sameEntry = (a: Entry, b: Pick<Entry, 'status' | 'days' | 'note'>) =>
  a.status === b.status && a.days === b.days && a.note === b.note;

export function buildPassport(passport: PassportInfo, input: BuildInput): PassportBuild {
  const { rows, overrides, territories, chunkMap } = input;
  const stats: PassportStats = {
    byStatus: {},
    missingFromSource: [],
    overridesApplied: [],
    staleOverrides: [],
    territoriesBuilt: [],
    territoriesSkipped: [],
  };

  // 1. Source rows -> normalized entries (throws on unknown values, spec 2.4).
  const entries: Record<string, Entry> = {};
  for (const row of rows) {
    if (row.passport !== passport.iso3) continue;
    if (entries[row.destination]) throw new Error(`Duplicate source row ${passport.code} -> ${row.destination}`);
    const { status, days } = normalizeRequirement(row.requirement);
    entries[row.destination] = { status, days, note: null, inheritedFrom: null };
  }
  if (Object.keys(entries).length === 0)
    throw new Error(`No source rows for passport ${passport.code} (${passport.iso3})`);

  const territoryIds = new Set(territories.map((t) => t.territory));
  const fromSource = new Set(Object.keys(entries));

  // 2. Overrides win over the source (spec 2.5).
  for (const o of overrides.filter((x) => x.passport === passport.code)) {
    if (!fromSource.has(o.destination) && !territoryIds.has(o.destination)) {
      throw new Error(
        `Override ${passport.code} -> ${o.destination}: destination is neither in the source nor a territory`,
      );
    }
    const next: Entry = { status: o.entry.status, days: o.entry.days, note: o.entry.note, inheritedFrom: null };
    const current = entries[o.destination];
    const label = `${passport.code} -> ${o.destination} (${o.reason})`;
    if (current && sameEntry(current, next)) stats.staleOverrides.push(label);
    entries[o.destination] = next;
    stats.overridesApplied.push(label);
  }

  // 3. Territories inherit their parent's entry (spec 2.6).
  for (const { territory, parent } of territories) {
    if (entries[territory]) {
      stats.territoriesSkipped.push(`${territory} (${fromSource.has(territory) ? 'in source' : 'has override'})`);
      continue;
    }
    const base = entries[parent];
    if (!base) throw new Error(`Territory ${territory}: parent ${parent} has no entry for passport ${passport.code}`);
    entries[territory] =
      parent === passport.iso3
        ? { status: 'self', days: null, note: null, inheritedFrom: parent }
        : { ...base, inheritedFrom: parent };
    stats.territoriesBuilt.push(territory);
  }

  // 4. Distribute over chunks; every destination needs exactly one chunk (spec 2.3).
  const noChunk = Object.keys(entries).filter((iso) => !chunkMap[iso]);
  if (noChunk.length > 0) throw new Error(`Countries without a chunk in data-src/chunks.json: ${noChunk.join(', ')}`);

  const chunks: Partial<Record<ChunkId, ChunkFile>> = {};
  for (const iso of Object.keys(entries).sort()) {
    const id = chunkMap[iso];
    (chunks[id] ??= {})[iso] = entries[iso];
    stats.byStatus[entries[iso].status] = (stats.byStatus[entries[iso].status] ?? 0) + 1;
  }
  stats.missingFromSource = Object.keys(chunkMap).filter((iso) => !entries[iso]);

  return { entries, chunks, stats };
}

/** Short content hash: a chunk unchanged between builds keeps its version (spec 2.2 step 7). */
export const chunkVersion = (content: string) => createHash('sha256').update(content).digest('hex').slice(0, 8);

export interface BuildOutput {
  files: Map<string, string>;
  report: Record<string, PassportStats>;
}

/** Produces every published file (path relative to `public/data`) and validates them with the shared schemas. */
export function buildAll(input: BuildInput, builtAt: string, source: Manifest['source']): BuildOutput {
  const files = new Map<string, string>();
  const report: Record<string, PassportStats> = {};

  for (const passport of input.passports) {
    const built = buildPassport(passport, input);
    report[passport.code] = built.stats;

    const index: PassportIndex = { passport: passport.code, chunks: [] };
    for (const [id, chunk] of Object.entries(built.chunks) as [ChunkId, ChunkFile][]) {
      ChunkFileSchema.parse(chunk);
      const content = JSON.stringify(chunk);
      const file = `${id}.json`;
      files.set(`${passport.code}/${file}`, content);
      index.chunks.push({ id, file, version: chunkVersion(content), countries: Object.keys(chunk).length });
    }
    index.chunks.sort((a, b) => a.id.localeCompare(b.id));
    files.set(`${passport.code}/index.json`, JSON.stringify(PassportIndexSchema.parse(index)));
  }

  const manifest: Manifest = ManifestSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    builtAt,
    source,
    passports: input.passports,
  });
  files.set('manifest.json', JSON.stringify(manifest));
  return { files, report };
}
