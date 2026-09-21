import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DataService, OfflineError, type LoadOptions } from '../../src/data/dataService';
import { BASE, entry, freshDb, makeFiles, makeServer } from './helpers';

function setup(files = makeFiles('BY'), extra: { now?: () => number; retries?: number } = {}) {
  const server = makeServer(files);
  const db = freshDb();
  const service = new DataService({
    baseUrl: BASE,
    fetchFn: server.fetchFn,
    db,
    retryDelayMs: 0,
    retries: 0,
    ...extra,
  });
  const events: string[] = [];
  const loaded: Record<string, unknown> = {};
  const opts = (signal = new AbortController().signal): LoadOptions => ({
    signal,
    onChunkState: (id, s) => events.push(`${id}:${s}`),
    onChunk: (id, data, meta) => {
      events.push(`${id}:data${meta.fromCache ? ':cache' : ''}`);
      loaded[id] = data;
    },
  });
  return { server, db, service, events, loaded, opts };
}

describe('DataService', () => {
  it('cache miss: fetches manifest, index and every chunk, delivering each chunk as it arrives', async () => {
    const { service, server, opts, loaded, db } = setup();
    const res = await service.loadPassport('BY', opts());
    expect(res.failed).toEqual([]);
    expect(Object.keys(loaded).sort()).toEqual(['asia-west', 'europe-east']);
    expect(server.chunkHits()).toHaveLength(2);
    expect(server.hits.find((h) => h.includes('europe-east'))).toContain('?v=europe-east-v1');
    expect(await db.chunks.count()).toBe(2);
  });

  it('starts all chunk requests in parallel and paints the first arrival without waiting for the rest', async () => {
    const { service, server, opts, events } = setup();
    const open = server.gate('BY/asia-west.json');
    const p = service.loadPassport('BY', opts());
    await new Promise((r) => setTimeout(r, 20));
    expect(events).toContain('europe-east:data');
    expect(events).not.toContain('asia-west:data');
    expect(server.chunkHits()).toHaveLength(2); // both already requested
    open();
    await p;
    expect(events).toContain('asia-west:data');
  });

  it('requests chunks in the order given by `order`', async () => {
    const { service, server, opts } = setup();
    await service.loadPassport('BY', { ...opts(), order: (ids) => [...ids].reverse() });
    expect(server.chunkHits()[0]).toContain('asia-west');
  });

  it('cache hit: a warm cache only requests the manifest', async () => {
    const { service, server, opts, db } = setup();
    await service.loadPassport('BY', opts());
    server.hits.length = 0;
    const again = setup();
    const service2 = new DataService({ baseUrl: BASE, fetchFn: server.fetchFn, db, retryDelayMs: 0, retries: 0 });
    const res = await service2.loadPassport('BY', again.opts());
    expect(res.failed).toEqual([]);
    expect(server.hits).toHaveLength(1);
    expect(server.hits[0]).toContain('manifest.json');
    expect(again.events).toContain('europe-east:data:cache');
  });

  it('manifest and index are requested with no-store', async () => {
    const { service, server, opts } = setup();
    await service.loadPassport('BY', opts());
    const calls = (server.fetchFn as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    for (const [url, init] of calls.filter(([u]) => /manifest|index/.test(u))) expect(init.cache, url).toBe('no-store');
  });

  it('chunk version change: only the changed chunk is downloaded again', async () => {
    const { service, server, opts, db } = setup();
    await service.loadPassport('BY', opts());
    server.hits.length = 0;
    Object.assign(server.files, makeFiles('BY', { builtAt: 'b2', versions: { 'asia-west': 'asia-west-v2' } }));
    server.files['BY/asia-west.json'] = { TUR: entry('voa', null) };
    const svc = new DataService({ baseUrl: BASE, fetchFn: server.fetchFn, db, retryDelayMs: 0, retries: 0 });
    const events = setup().opts();
    const got: Record<string, unknown> = {};
    await svc.loadPassport('BY', { ...events, onChunk: (id, d) => (got[id] = d) });
    expect(server.chunkHits()).toHaveLength(1);
    expect(server.chunkHits()[0]).toContain('asia-west.json?v=asia-west-v2');
    expect(got['asia-west']).toEqual({ TUR: entry('voa', null) });
    expect((await db.chunks.get(['BY', 'asia-west']))?.version).toBe('asia-west-v2');
  });

  it('abort (passport switch): nothing is delivered or cached after abort', async () => {
    const { service, server, opts, events, db } = setup();
    const open = server.gate('BY/asia-west.json');
    const ctl = new AbortController();
    const p = service.loadPassport('BY', opts(ctl.signal));
    await new Promise((r) => setTimeout(r, 20));
    ctl.abort();
    open();
    await p.catch(() => undefined);
    expect(events).not.toContain('asia-west:data');
    expect(events).not.toContain('asia-west:error');
    expect(await db.chunks.get(['BY', 'asia-west'])).toBeUndefined();
  });

  it('partial failure: others still load, failed chunk is reported and retry only re-requests it', async () => {
    const { service, server, opts, events, loaded } = setup();
    server.fail('BY/asia-west.json');
    const res = await service.loadPassport('BY', opts());
    expect(res.failed).toEqual(['asia-west']);
    expect(events).toContain('asia-west:error');
    expect(loaded['europe-east']).toBeDefined();

    server.fail('BY/asia-west.json', 0);
    server.hits.length = 0;
    const failed = await service.loadChunks('BY', res.index, res.failed, opts());
    expect(failed).toEqual([]);
    expect(server.chunkHits()).toHaveLength(1);
    expect(server.chunkHits()[0]).toContain('asia-west');
    expect(loaded['asia-west']).toBeDefined();
  });

  it('retries transient 5xx errors and does not retry a 404', async () => {
    const a = setup(makeFiles('BY'), { retries: 2 });
    a.server.fail('BY/europe-east.json', 2);
    expect((await a.service.loadPassport('BY', a.opts())).failed).toEqual([]);
    expect(a.server.hits.filter((h) => h.includes('europe-east'))).toHaveLength(3);

    const files = makeFiles('BY');
    delete files['BY/europe-east.json'];
    const b = setup(files, { retries: 2 });
    expect((await b.service.loadPassport('BY', b.opts())).failed).toEqual(['europe-east']);
    expect(b.server.hits.filter((h) => h.includes('europe-east'))).toHaveLength(1);
  });

  it('a chunk that fails zod validation counts as failed and is not cached', async () => {
    const { service, server, opts, db } = setup();
    server.files['BY/europe-east.json'] = { POL: { status: 'nonsense' } };
    const res = await service.loadPassport('BY', opts());
    expect(res.failed).toEqual(['europe-east']);
    expect(await db.chunks.get(['BY', 'europe-east'])).toBeUndefined();
  });

  it('a corrupt cache record is deleted and downloaded again', async () => {
    const { service, server, opts, db, loaded } = setup();
    await service.loadPassport('BY', opts());
    await db.chunks.put({
      passport: 'BY',
      chunkId: 'europe-east',
      version: 'europe-east-v1',
      data: { POL: { bad: 1 } } as never,
      fetchedAt: Date.now(),
    });
    server.hits.length = 0;
    await service.loadPassport('BY', opts());
    expect(server.chunkHits()).toHaveLength(1);
    expect(loaded['europe-east']).toEqual({ POL: { ...entry(), note: 'BY' } });
    expect((await db.chunks.get(['BY', 'europe-east']))?.data).toEqual(loaded['europe-east']);
  });

  it('schemaVersion change wipes the cache', async () => {
    const { service, server, opts, db } = setup();
    await service.loadPassport('BY', opts());
    server.hits.length = 0;
    Object.assign(server.files, makeFiles('BY', { schemaVersion: 2 }));
    const res = await service.loadPassport('BY', opts());
    expect(res.failed).toEqual([]);
    expect(server.chunkHits()).toHaveLength(2); // same versions, yet re-downloaded
    expect((await db.meta.get('schemaVersion'))?.value).toBe(2);
  });

  it('TTL: expired entries are shown from cache at once and revalidated in the background', async () => {
    let now = 1_000;
    const { service, server, opts, db } = setup(makeFiles('BY'), { now: () => now });
    await service.loadPassport('BY', opts());
    now += 31 * 24 * 3600 * 1000;
    server.files['BY/europe-east.json'] = { POL: entry('voa', null) };
    server.hits.length = 0;

    const seen: string[] = [];
    await service.loadPassport('BY', {
      signal: new AbortController().signal,
      onChunk: (id, d, m) =>
        id === 'europe-east' && seen.push(`${m.fromCache ? 'cache' : 'net'}:${(d.POL as { status: string }).status}`),
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(seen).toEqual(['cache:visa_free', 'net:voa']);
    expect((await db.chunks.get(['BY', 'europe-east']))?.fetchedAt).toBe(now);
  });

  it('a fresh cache entry is not revalidated', async () => {
    const { service, server, opts } = setup();
    await service.loadPassport('BY', opts());
    server.hits.length = 0;
    await service.loadPassport('BY', opts());
    await new Promise((r) => setTimeout(r, 20));
    expect(server.chunkHits()).toHaveLength(0);
  });

  it('offline with a cache: works entirely from the cache', async () => {
    const { service, server, opts, db } = setup();
    await service.loadPassport('BY', opts());
    server.setOffline(true);
    const again = setup();
    const svc = new DataService({ baseUrl: BASE, fetchFn: server.fetchFn, db, retryDelayMs: 0, retries: 0 });
    let fromCache = false;
    const res = await svc.loadPassport('BY', {
      ...again.opts(),
      onManifest: (_m, meta) => (fromCache = meta.fromCache),
    });
    expect(fromCache).toBe(true);
    expect(res.failed).toEqual([]);
    expect(again.events).toContain('europe-east:data:cache');
  });

  it('offline without a cache: rejects with OfflineError', async () => {
    const { service, server, opts } = setup();
    server.setOffline(true);
    await expect(service.loadPassport('BY', opts())).rejects.toBeInstanceOf(OfflineError);
  });

  it('clearCache empties both tables', async () => {
    const { service, opts, db } = setup();
    await service.loadPassport('BY', opts());
    await service.clearCache();
    expect(await db.chunks.count()).toBe(0);
    expect(await db.meta.count()).toBe(0);
  });
});
