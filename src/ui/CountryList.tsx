import { useMemo, useState } from 'react';
import { countryName, flagEmoji, normalizeQuery } from '../lib/countries';
import { GROUPS, groupCountries, selectableCountries } from '../lib/countryList';
import { statusText, STATUS_COLORS } from '../lib/status';
import { geometry } from '../map/atlas';
import { useApp } from '../store';

export function CountryList() {
  const entries = useApp((s) => s.entries);
  const selectCountry = useApp((s) => s.selectCountry);
  const complete = useApp(
    (s) => !Object.values(s.chunkState).some((c) => c === 'idle' || c === 'loading') && s.passportIndex !== null,
  );
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = normalizeQuery(query);
    const ids = selectableCountries(entries, geometry.isoOnMap).filter(
      (id) => !q || normalizeQuery(countryName(id)).includes(q),
    );
    return groupCountries(ids, entries, complete);
  }, [entries, query, complete]);

  return (
    <div className="list-pane">
      <div className="list-search">
        <input
          type="search"
          value={query}
          placeholder="Поиск по названию"
          aria-label="Поиск по списку стран"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="list-scroll">
        {GROUPS.map(({ id, title }) =>
          groups[id].length === 0 ? null : (
            <section key={id}>
              <h2>
                {title} <span className="count">{groups[id].length}</span>
              </h2>
              <ul>
                {groups[id].map((iso) => {
                  const entry = entries[iso];
                  return (
                    <li key={iso}>
                      <button type="button" onClick={() => selectCountry(iso, 'list')}>
                        <span
                          className="dot"
                          style={{ background: STATUS_COLORS[entry?.status ?? 'none'] }}
                          aria-hidden="true"
                        />
                        <span className="flag" aria-hidden="true">
                          {flagEmoji(iso)}
                        </span>
                        <span className="name">
                          {countryName(iso)}
                          {entry?.inheritedFrom ? ' *' : ''}
                        </span>
                        <span className="status">{statusText(entry)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
        )}
      </div>
    </div>
  );
}
