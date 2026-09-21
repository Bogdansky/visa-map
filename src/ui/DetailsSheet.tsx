import { useRef, useState } from 'react';
import { useViewportHeight } from '../lib/hooks';
import { countryName, flagEmoji } from '../lib/countries';
import { DISCLAIMER, formatDays, STATUS_COLORS, statusText, TERRITORY_NOTE } from '../lib/status';
import { useApp } from '../store';

export type Snap = 'peek' | 'half' | 'full';
/** Sheet height as a fraction of the viewport (spec 6: peek -> half -> full). */
export const SNAP_FRACTION: Record<Snap, number> = { peek: 0.3, half: 0.5, full: 0.88 };
const CLOSE_BELOW = 0.16;

function Details({ iso3 }: { iso3: string }) {
  const entry = useApp((s) => s.entries[iso3]);
  const status = entry?.status ?? 'unknown';
  return (
    <div className="details">
      <p className="status-line">
        <span className="dot" style={{ background: STATUS_COLORS[status] }} aria-hidden="true" />
        <strong>{statusText(entry)}</strong>
        {entry?.inheritedFrom ? ' *' : ''}
      </p>
      {entry?.status === 'visa_free' && entry.days && <p>Срок пребывания: до {formatDays(entry.days)}</p>}
      {entry?.note && <p>{entry.note}</p>}
      {entry?.inheritedFrom && <p className="territory-note">* {TERRITORY_NOTE(countryName(entry.inheritedFrom))}</p>}
      <p className="disclaimer">{DISCLAIMER}</p>
    </div>
  );
}

interface Props {
  desktop: boolean;
  snap: Snap;
  onSnap: (snap: Snap) => void;
}

export function DetailsSheet({ desktop, snap, onSnap }: Props) {
  const selected = useApp((s) => s.selectedCountry);
  const selectCountry = useApp((s) => s.selectCountry);
  const vh = useViewportHeight();
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startH: number; lastY: number; lastT: number; v: number } | null>(null);

  if (!selected) return null;

  const header = (
    <div className="sheet-head">
      <h2>
        <span aria-hidden="true">{flagEmoji(selected)}</span> {countryName(selected)}
      </h2>
      <button type="button" className="icon-btn" aria-label="Закрыть" onClick={() => selectCountry(null)}>
        ✕
      </button>
    </div>
  );

  if (desktop) {
    return (
      <aside className="side-panel" aria-label="Детали страны">
        {header}
        <Details iso3={selected} />
      </aside>
    );
  }
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('button')) return; // let the close button work
    e.currentTarget.setPointerCapture(e.pointerId);
    const startH = SNAP_FRACTION[snap] * vh;
    drag.current = { startY: e.clientY, startH, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
    setDragHeight(startH);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = Math.max(e.timeStamp - d.lastT, 1);
    d.v = (e.clientY - d.lastY) / dt; // px/ms, positive = downwards
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setDragHeight(Math.min(SNAP_FRACTION.full * vh, Math.max(0, d.startH - (e.clientY - d.startY))));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || dragHeight === null) return;
    const projected = (dragHeight - d.v * 160) / vh; // fling bias
    setDragHeight(null);
    if (projected < CLOSE_BELOW) {
      selectCountry(null);
      return;
    }
    const next = (Object.keys(SNAP_FRACTION) as Snap[]).reduce((best, s) =>
      Math.abs(SNAP_FRACTION[s] - projected) < Math.abs(SNAP_FRACTION[best] - projected) ? s : best,
    );
    onSnap(next);
  };

  return (
    <section
      className={`sheet${dragHeight !== null ? ' dragging' : ''}`}
      style={{ height: dragHeight ?? SNAP_FRACTION[snap] * vh }}
      aria-label="Детали страны"
    >
      <div
        className="sheet-grip"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className="grip-bar" aria-hidden="true" />
        {header}
      </div>
      <div className="sheet-body">
        <Details iso3={selected} />
      </div>
    </section>
  );
}
