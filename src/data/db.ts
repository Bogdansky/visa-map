import Dexie, { type Table } from 'dexie';
import type { ChunkFile } from '../../shared';

export interface ChunkRecord {
  passport: string;
  chunkId: string;
  version: string;
  data: ChunkFile;
  fetchedAt: number;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

export class VisaDb extends Dexie {
  chunks!: Table<ChunkRecord, [string, string]>;
  meta!: Table<MetaRecord, string>;

  constructor(name = 'visa-map') {
    super(name);
    this.version(1).stores({
      chunks: '[passport+chunkId]',
      meta: 'key',
    });
  }
}
