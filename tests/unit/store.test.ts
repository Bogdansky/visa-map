import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DataService } from '../../src/data/dataService';
import { createAppStore } from '../../src/store';
import { BASE, freshDb, makeFiles, makeServer } from './helpers';

function setup() {
  const server = makeServer({ ...makeFiles('BY'), ...makeFiles('KZ') });
  // manifest must list both passports
  (server.files['manifest.json'] as { passports: unknown[] }).passports = [
    { code: 'BY', iso3: 'BLR', name: 'Беларусь' },
    { code: 'KZ', iso3: 'KAZ', name: 'Казахстан' },
  ];
  const service = new DataService({
    baseUrl: BASE,
    fetchFn: server.fetchFn,
    db: freshDb(),
    retryDelayMs: 0,
    retries: 0,
  });
  return { server, store: createAppStore(service) };
}
const settle = () => new Promise((r) => setTimeout(r, 50));

describe('app store', () => {
  it('loads a passport and fills entries chunk by chunk', async () => {
    const { store } = setup();
    store.getState().init();
    await settle();
    const s = store.getState();
    expect(Object.keys(s.entries).sort()).toEqual(['POL', 'TUR']);
    expect(s.chunkState).toEqual({ 'europe-east': 'loaded', 'asia-west': 'loaded' });
    expect(s.dataBuiltAt).toBe('b1');
    expect(s.loadError).toBeNull();
    expect(s.paintDelay.POL).toBe(0);
  });

  it('switching passport mid-load drops late responses and leaves no colours of the previous one', async () => {
    const { store, server } = setup();
    const open = server.gate('BY/asia-west.json');
    store.getState().init(); // BY, asia-west stuck
    await settle();
    store.getState().setPassport('KZ');
    await settle();
    open(); // late BY response
    await settle();
    const s = store.getState();
    expect(s.passport).toBe('KZ');
    expect(Object.values(s.entries).every((e) => e.note === 'KZ')).toBe(true);
    expect(Object.keys(s.entries)).toHaveLength(2);
  });

  it('reports failed chunks and retryFailed re-requests only those', async () => {
    const { store, server } = setup();
    server.fail('BY/asia-west.json');
    store.getState().init();
    await settle();
    expect(store.getState().loadError).toBe('failed');
    expect(store.getState().chunkState['asia-west']).toBe('error');
    expect(store.getState().entries.POL).toBeDefined();

    server.fail('BY/asia-west.json', 0);
    server.hits.length = 0;
    store.getState().retryFailed();
    await settle();
    expect(server.chunkHits()).toHaveLength(1);
    expect(store.getState().loadError).toBeNull();
    expect(store.getState().entries.TUR).toBeDefined();
  });

  it('shows the offline error when there is no network and no cache', async () => {
    const { store, server } = setup();
    server.setOffline(true);
    store.getState().init();
    await settle();
    expect(store.getState().loadError).toBe('offline');
  });

  it('refresh clears the cache, re-downloads everything and keeps the map painted meanwhile', async () => {
    const { store, server } = setup();
    store.getState().init();
    await settle();
    server.hits.length = 0;
    const open = server.gate('BY/asia-west.json');
    const p = store.getState().refresh();
    await settle();
    expect(store.getState().isRefreshing).toBe(true);
    expect(store.getState().entries.TUR).toBeDefined(); // not reset to grey
    open();
    await p;
    expect(store.getState().isRefreshing).toBe(false);
    expect(server.chunkHits()).toHaveLength(2);
  });

  it('selectCountry from the list switches to the map and asks for a zoom; map taps only centre', () => {
    const { store } = setup();
    store.getState().setTab('list');
    store.getState().selectCountry('POL', 'list');
    expect(store.getState().tab).toBe('map');
    expect(store.getState().focusRequest).toMatchObject({ iso3: 'POL', zoom: true });
    store.getState().selectCountry('TUR', 'map');
    expect(store.getState().focusRequest).toMatchObject({ iso3: 'TUR', zoom: false });
    store.getState().setTab('list');
    store.getState().selectCountry('POL', 'search');
    expect(store.getState().tab).toBe('map'); // search from the list tab must reach the map
    store.getState().selectCountry(null);
    expect(store.getState().selectedCountry).toBeNull();
  });
});
