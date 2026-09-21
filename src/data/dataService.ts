import {
  ChunkFileSchema,
  ManifestSchema,
  PassportIndexSchema,
  type ChunkFile,
  type ChunkId,
  type Manifest,
  type PassportIndex,
} from '../../shared';
import { VisaDb } from './db';

export type ChunkState = 'idle' | 'loading' | 'loaded' | 'error';
type ChunkInfo = PassportIndex['chunks'][number];

export class OfflineError extends Error {
  constructor() {
    super('No network and no cached data');
  }
}
export class InvalidDataError extends Error {}
class HttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

export interface DataServiceOptions {
  /** Base URL of the published data folder, with trailing slash (e.g. `/visa-map/data/`). */
  baseUrl: string;
  fetchFn?: typeof fetch;
  db?: VisaDb;
  now?: () => number;
  /** Extra attempts after the first for network/5xx failures. */
  retries?: number;
  retryDelayMs?: number;
  ttlMs?: number;
}

export interface LoadOptions {
  signal: AbortSignal;
  /** Chunk ids in the order they should be requested (spec 4.4 step 5). */
  order?: (ids: ChunkId[]) => ChunkId[];
  onManifest?: (manifest: Manifest, meta: { fromCache: boolean }) => void;
  onIndex?: (index: PassportIndex) => void;
  onChunkState?: (id: ChunkId, state: ChunkState) => void;
  onChunk?: (id: ChunkId, data: ChunkFile, meta: { fromCache: boolean }) => void;
}

export interface LoadResult {
  manifest: Manifest;
  index: PassportIndex;
  failed: ChunkId[];
}

const DAY = 24 * 60 * 60 * 1000;

export const isAbortError = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

export class DataService {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly db: VisaDb;
  private readonly now: () => number;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly ttlMs: number;

  constructor(opts: DataServiceOptions) {
    this.baseUrl = opts.baseUrl;
    this.fetchFn = opts.fetchFn ?? ((...args) => fetch(...args));
    this.db = opts.db ?? new VisaDb();
    this.now = opts.now ?? Date.now;
    this.retries = opts.retries ?? 2;
    this.retryDelayMs = opts.retryDelayMs ?? 400;
    this.ttlMs = opts.ttlMs ?? 30 * DAY;
  }

  /** Full load of one passport: manifest -> index -> all chunks in parallel. Throws on manifest/index failure. */
  async loadPassport(passport: string, opts: LoadOptions): Promise<LoadResult> {
    const { signal } = opts;
    const { manifest, fromCache } = await this.getManifest(signal);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    opts.onManifest?.(manifest, { fromCache });

    const index = await this.getIndex(passport, manifest, signal);
    opts.onIndex?.(index);

    const failed = await this.loadChunks(
      passport,
      index,
      index.chunks.map((c) => c.id),
      opts,
    );
    return { manifest, index, failed };
  }

  /** Loads the given chunks in parallel; resolves with the ids that failed. Also used for "Retry". */
  async loadChunks(passport: string, index: PassportIndex, ids: ChunkId[], opts: LoadOptions): Promise<ChunkId[]> {
    const { signal } = opts;
    const ordered = opts.order ? opts.order(ids) : ids;
    const infos = ordered.map((id) => index.chunks.find((c) => c.id === id)).filter((c): c is ChunkInfo => !!c);
    for (const info of infos) if (!signal.aborted) opts.onChunkState?.(info.id, 'loading');

    const results = await Promise.all(
      infos.map(async (info) => ((await this.loadChunk(passport, info, opts)) ? null : info.id)),
    );
    return results.filter((id): id is ChunkId => id !== null);
  }

  async clearCache(): Promise<void> {
    await Promise.all([this.db.chunks.clear(), this.db.meta.clear()]);
  }

  // --- manifest / index -------------------------------------------------------------------

  private async getManifest(signal: AbortSignal): Promise<{ manifest: Manifest; fromCache: boolean }> {
    try {
      const raw = await this.fetchJson(`${this.baseUrl}manifest.json`, signal, 'no-store');
      const parsed = ManifestSchema.safeParse(raw);
      if (!parsed.success) throw new InvalidDataError('Invalid manifest.json');
      const manifest = parsed.data;
      const stored = (await this.db.meta.get('schemaVersion'))?.value;
      if (stored !== undefined && stored !== manifest.schemaVersion) await this.clearCache();
      await this.db.meta.bulkPut([
        { key: 'schemaVersion', value: manifest.schemaVersion },
        { key: 'manifestBuiltAt', value: manifest.builtAt },
        { key: 'manifest', value: manifest },
      ]);
      return { manifest, fromCache: false };
    } catch (e) {
      if (isAbortError(e)) throw e;
      const cached = ManifestSchema.safeParse((await this.db.meta.get('manifest'))?.value);
      if (cached.success) return { manifest: cached.data, fromCache: true };
      throw new OfflineError();
    }
  }

  private async getIndex(passport: string, manifest: Manifest, signal: AbortSignal): Promise<PassportIndex> {
    const key = `index:${passport}`;
    const stored = (await this.db.meta.get(key))?.value as { builtAt?: string; index?: unknown } | undefined;
    const cached = PassportIndexSchema.safeParse(stored?.index);
    if (cached.success && stored?.builtAt === manifest.builtAt) return cached.data;

    try {
      const raw = await this.fetchJson(`${this.baseUrl}${passport}/index.json`, signal, 'no-store');
      const index = PassportIndexSchema.parse(raw);
      await this.db.meta.put({ key, value: { builtAt: manifest.builtAt, index } });
      return index;
    } catch (e) {
      if (isAbortError(e)) throw e;
      if (cached.success) return cached.data; // offline: fall back to the last known index
      throw e;
    }
  }

  // --- chunks -----------------------------------------------------------------------------

  /** Resolves true when the chunk ended up loaded; failures become the `error` chunk state instead of rejecting. */
  private async loadChunk(passport: string, info: ChunkInfo, opts: LoadOptions): Promise<boolean> {
    const { signal } = opts;
    const emit = (data: ChunkFile, fromCache: boolean) => {
      if (signal.aborted) return;
      opts.onChunk?.(info.id, data, { fromCache });
      opts.onChunkState?.(info.id, 'loaded');
    };

    try {
      let cached = await this.db.chunks.get([passport, info.id]);
      if (cached && !ChunkFileSchema.safeParse(cached.data).success) {
        await this.db.chunks.delete([passport, info.id]); // corrupt entry, spec 4.5
        cached = undefined;
      }

      if (cached && cached.version === info.version) {
        emit(cached.data, true);
        if (this.now() - cached.fetchedAt > this.ttlMs) void this.revalidate(passport, info, cached.data, opts);
        return true;
      }

      const data = await this.fetchChunk(passport, info, signal, 'default');
      if (signal.aborted) return false;
      await this.db.chunks.put({ passport, chunkId: info.id, version: info.version, data, fetchedAt: this.now() });
      emit(data, false);
      return true;
    } catch (e) {
      if (!signal.aborted) opts.onChunkState?.(info.id, 'error');
      if (!isAbortError(e) && !signal.aborted) console.warn(`Chunk ${passport}/${info.id} failed`, e);
      return false;
    }
  }

  /** Stale-while-revalidate for entries past the TTL: refresh in the background, re-emit only on change. */
  private async revalidate(passport: string, info: ChunkInfo, current: ChunkFile, opts: LoadOptions) {
    try {
      const data = await this.fetchChunk(passport, info, opts.signal, 'no-cache');
      if (opts.signal.aborted) return;
      await this.db.chunks.put({ passport, chunkId: info.id, version: info.version, data, fetchedAt: this.now() });
      if (JSON.stringify(data) !== JSON.stringify(current)) opts.onChunk?.(info.id, data, { fromCache: false });
    } catch {
      // Background refresh is best-effort; the cached data is already on screen.
    }
  }

  private async fetchChunk(passport: string, info: ChunkInfo, signal: AbortSignal, cache: RequestCache) {
    // ?v=<version> defeats the GitHub Pages HTTP cache when a chunk changes (spec 2.7).
    const url = `${this.baseUrl}${passport}/${info.file}?v=${encodeURIComponent(info.version)}`;
    const parsed = ChunkFileSchema.safeParse(await this.fetchJson(url, signal, cache));
    if (!parsed.success) throw new InvalidDataError(`Invalid chunk ${passport}/${info.file}`);
    return parsed.data;
  }

  // --- transport --------------------------------------------------------------------------

  private async fetchJson(url: string, signal: AbortSignal, cache: RequestCache): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await this.sleep(this.retryDelayMs * attempt, signal);
      try {
        const res = await this.fetchFn(url, { signal, cache });
        if (!res.ok) throw new HttpError(res.status, url);
        return await res.json();
      } catch (e) {
        if (isAbortError(e) || signal.aborted) throw new DOMException('Aborted', 'AbortError');
        if (e instanceof HttpError && e.status < 500) throw e; // 4xx will not fix itself
        if (e instanceof SyntaxError) throw new InvalidDataError(`Malformed JSON at ${url}`);
        lastError = e;
      }
    }
    throw lastError;
  }

  private sleep(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  }
}
