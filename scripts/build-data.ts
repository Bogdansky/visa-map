import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChunkMapSchema, OverridesFileSchema, PassportsFileSchema, TerritoriesFileSchema } from '../shared';
import { buildAll } from './lib/build';
import { parseTidyCsv } from './lib/csv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_URL =
  'https://raw.githubusercontent.com/ilyankou/passport-index-dataset/master/passport-index-tidy-iso3.csv';
const SOURCE_REPO = 'https://github.com/ilyankou/passport-index-dataset';
const outDir = path.join(root, 'public', 'data');

const readJson = async (rel: string) => JSON.parse(await readFile(path.join(root, rel), 'utf8')) as unknown;

async function loadCsv(): Promise<string> {
  // PASSPORT_INDEX_CSV allows a local copy (offline development, reproducible tests).
  const local = process.env.PASSPORT_INDEX_CSV;
  if (local) return readFile(local, 'utf8');
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Failed to download source CSV: HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const [csv, passports, overrides, territories, chunkMap] = await Promise.all([
    loadCsv(),
    readJson('scripts/passports.json').then((v) => PassportsFileSchema.parse(v)),
    readJson('data-src/overrides.json').then((v) => OverridesFileSchema.parse(v)),
    readJson('data-src/territories.json').then((v) => TerritoriesFileSchema.parse(v)),
    readJson('data-src/chunks.json').then((v) => ChunkMapSchema.parse(v)),
  ]);

  const { files, report } = buildAll(
    { rows: parseTidyCsv(csv), passports, overrides, territories, chunkMap },
    new Date().toISOString(),
    { name: 'passport-index-dataset', url: SOURCE_REPO },
  );

  await rm(outDir, { recursive: true, force: true });
  for (const [rel, content] of files) {
    const target = path.join(outDir, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }

  for (const [code, s] of Object.entries(report)) {
    console.log(`\n[${code}] countries by status:`, s.byStatus);
    console.log(
      `[${code}] chunk countries absent from source: ${s.missingFromSource.length}`,
      s.missingFromSource.join(' '),
    );
    console.log(`[${code}] overrides applied:`, s.overridesApplied);
    if (s.staleOverrides.length) console.warn(`[${code}] WARNING overrides equal to source (stale):`, s.staleOverrides);
    console.log(
      `[${code}] territories built:`,
      s.territoriesBuilt.join(' ') || '-',
      '| skipped:',
      s.territoriesSkipped.join(', ') || '-',
    );
  }
  console.log(`\nWrote ${files.size} files to ${path.relative(root, outDir)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
