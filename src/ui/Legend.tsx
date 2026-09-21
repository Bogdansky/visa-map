import { useState } from 'react';
import { LEGEND, STATUS_COLORS } from '../lib/status';

export function Legend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="legend">
      {open && (
        <div className="legend-panel">
          <ul>
            {LEGEND.map((item) => (
              <li key={item.status}>
                <span className="swatch" style={{ background: STATUS_COLORS[item.status] }} aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>
          <p>
            <span className="swatch" style={{ background: STATUS_COLORS.self }} aria-hidden="true" />
            Синим отмечена страна паспорта. Значок * — территория: показан режим основной страны.
          </p>
        </div>
      )}
      <button type="button" className="legend-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Легенда {open ? '▾' : '▸'}
      </button>
    </div>
  );
}
