import { createStore, useStore } from 'zustand';
import type { ChunkFile, ChunkId, Entry, Manifest, PassportIndex } from '../../shared';
import { DataService, isAbortError, OfflineError, type ChunkState } from '../data/dataService';
import { sortChunksByDistance } from '../lib/chunks';
import { loadStoredPassport, storePassport } from '../lib/passports';

export type Tab = 'map' | 'list';
export type SelectSource = 'map' | 'search' | 'list';
export type LoadError = null | 'offline' | 'failed';

/** Per-country delay step for the staggered repaint inside a chunk (spec 4.7: 15-30 ms). */
const STAGGER_MS = 20;
/** Cap so a large chunk never trails behind for a visible second. */
const MAX_STAGGER_MS = 400;

export interface AppState {
  passport: string;
  manifest: Manifest | null;
  passportIndex: PassportIndex | null;
  entries: Record<string, Entry>;
  /** Transition delay per country for the chunk that just arrived. */
  paintDelay: Record<string, number>;
  chunkState: Partial<Record<ChunkId, ChunkState>>;
  selectedCountry: string | null;
  focusRequest: { iso3: string; zoom: boolean; nonce: number } | null;
  dataBuiltAt: string | null;
  isRefreshing: boolean;
  loadError: LoadError;
  tab: Tab;
  viewportCenter: [number, number];

  init: () => void;
  setPassport: (code: string) => void;
  retryFailed: () => void;
  refresh: () => Promise<void>;
  selectCountry: (iso3: string | null, source?: SelectSource) => void;
  setTab: (tab: Tab) => void;
  setViewportCenter: (center: [number, number]) => void;
}

export function createAppStore(service: DataService) {
  let controller: AbortController | null = null;
  let token = 0;
  let focusNonce = 0;

  return createStore<AppState>()((set, get) => {
    /** Starts a passport load, cancelling any in-flight one; late responses of older loads are dropped. */
    const load = async (passport: string, opts: { keepEntries?: boolean } = {}) => {
      controller?.abort();
      const ctl = (controller = new AbortController());
      const mine = ++token;
      const current = () => mine === token && get().passport === passport;

      set({
        passport,
        passportIndex: null,
        chunkState: {},
        loadError: null,
        paintDelay: {},
        ...(opts.keepEntries ? {} : { entries: {} }),
      });

      try {
        const { failed } = await service.loadPassport(passport, {
          signal: ctl.signal,
          order: (ids) => sortChunksByDistance(ids, get().viewportCenter),
          onManifest: (manifest) => current() && set({ manifest, dataBuiltAt: manifest.builtAt }),
          onIndex: (passportIndex) => current() && set({ passportIndex }),
          onChunkState: (id, state) => current() && set((s) => ({ chunkState: { ...s.chunkState, [id]: state } })),
          onChunk: (_id, data: ChunkFile) => {
            if (!current()) return;
            const paintDelay: Record<string, number> = {};
            Object.keys(data).forEach((iso, i) => (paintDelay[iso] = Math.min(i * STAGGER_MS, MAX_STAGGER_MS)));
            set((s) => ({ entries: { ...s.entries, ...data }, paintDelay: { ...s.paintDelay, ...paintDelay } }));
          },
        });
        if (current() && failed.length > 0) set({ loadError: 'failed' });
      } catch (e) {
        if (isAbortError(e) || !current()) return;
        set({ loadError: e instanceof OfflineError ? 'offline' : 'failed' });
      }
    };

    return {
      passport: loadStoredPassport(),
      manifest: null,
      passportIndex: null,
      entries: {},
      paintDelay: {},
      chunkState: {},
      selectedCountry: null,
      focusRequest: null,
      dataBuiltAt: null,
      isRefreshing: false,
      loadError: null,
      tab: 'map',
      viewportCenter: [0, 20],

      init: () => void load(get().passport),

      setPassport: (code) => {
        if (code === get().passport) return;
        storePassport(code);
        void load(code);
      },

      retryFailed: () => {
        const { passportIndex, chunkState, passport } = get();
        if (!passportIndex) {
          void load(passport); // manifest/index never arrived: start over
          return;
        }
        const failed = (Object.keys(chunkState) as ChunkId[]).filter((id) => chunkState[id] === 'error');
        if (failed.length === 0) return;
        controller?.abort();
        const ctl = (controller = new AbortController());
        const mine = ++token;
        const current = () => mine === token && get().passport === passport;
        set({ loadError: null });
        void service
          .loadChunks(passport, passportIndex, failed, {
            signal: ctl.signal,
            order: (ids) => sortChunksByDistance(ids, get().viewportCenter),
            onChunkState: (id, state) => current() && set((s) => ({ chunkState: { ...s.chunkState, [id]: state } })),
            onChunk: (_id, data) => current() && set((s) => ({ entries: { ...s.entries, ...data } })),
          })
          .then((stillFailed) => current() && stillFailed.length > 0 && set({ loadError: 'failed' }));
      },

      refresh: async () => {
        if (get().isRefreshing) return;
        set({ isRefreshing: true });
        try {
          controller?.abort();
          await service.clearCache();
          await load(get().passport, { keepEntries: true });
        } finally {
          set({ isRefreshing: false });
        }
      },

      selectCountry: (iso3, source = 'map') => {
        if (iso3 === null) {
          set({ selectedCountry: null });
          return;
        }
        set({
          selectedCountry: iso3,
          focusRequest: { iso3, zoom: source !== 'map', nonce: ++focusNonce },
          // Details and focus only exist on the map, so list and search picks must land there.
          tab: 'map' as Tab,
        });
      },

      setTab: (tab) => set({ tab }),
      setViewportCenter: (viewportCenter) => set({ viewportCenter }),
    };
  });
}

export const dataService = new DataService({ baseUrl: `${import.meta.env.BASE_URL}data/` });
export const appStore = createAppStore(dataService);
export const useApp = <T>(selector: (s: AppState) => T): T => useStore(appStore, selector);
