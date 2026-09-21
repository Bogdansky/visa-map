import { useEffect, useState } from 'react';
import { useMediaQuery, useViewportHeight } from '../lib/hooks';
import { MapView, type Insets } from '../map/MapView';
import { useApp } from '../store';
import { Banners } from '../ui/Banners';
import { CountryList } from '../ui/CountryList';
import { DataInfoBar } from '../ui/DataInfoBar';
import { DetailsSheet, SNAP_FRACTION, type Snap } from '../ui/DetailsSheet';
import { Legend } from '../ui/Legend';
import { Menu } from '../ui/Menu';
import { PassportSelect } from '../ui/PassportSelect';
import { SearchBox } from '../ui/SearchBox';
import { UpdateToast } from '../ui/UpdateToast';

const SIDE_PANEL_PX = 360;

export function App() {
  const init = useApp((s) => s.init);
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const selected = useApp((s) => s.selectedCountry);
  const desktop = useMediaQuery('(min-width: 768px)');
  const vh = useViewportHeight();
  const [snap, setSnap] = useState<Snap>('peek');

  useEffect(() => init(), [init]);

  // The map keeps the picked country clear of the details panel (spec 5).
  const insets: Insets = {
    right: selected && desktop ? SIDE_PANEL_PX : 0,
    // At "full" the sheet would swallow the map, so centre for the half-height layout.
    bottom: selected && !desktop ? Math.min(SNAP_FRACTION[snap], SNAP_FRACTION.half) * vh : 0,
  };

  return (
    <div className="app">
      <header className="topbar">
        <PassportSelect />
        <div className="topbar-spacer" />
        <SearchBox />
        <Menu />
      </header>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'map'} onClick={() => setTab('map')}>
          Карта
        </button>
        <button type="button" role="tab" aria-selected={tab === 'list'} onClick={() => setTab('list')}>
          Список
        </button>
      </div>

      <main className="content">
        <div className={`pane${tab === 'map' ? '' : ' pane-hidden'}`}>
          <MapView insets={insets} />
          <Legend />
          <DataInfoBar />
        </div>
        {tab === 'list' && <CountryList />}
        {tab === 'map' && <DetailsSheet desktop={desktop} snap={snap} onSnap={setSnap} />}
      </main>

      <Banners />
      <UpdateToast />
    </div>
  );
}
