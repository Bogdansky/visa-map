import { useMemo, useRef, useState } from 'react';
import { countryName, flagEmoji } from '../lib/countries';
import { searchCountries, selectableCountries } from '../lib/countryList';
import { geometry } from '../map/atlas';
import { useApp } from '../store';

export function SearchBox() {
  const entries = useApp((s) => s.entries);
  const selectCountry = useApp((s) => s.selectCountry);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const ids = useMemo(() => selectableCountries(entries, geometry.isoOnMap), [entries]);
  const results = useMemo(() => searchCountries(ids, query), [ids, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const pick = (iso3: string) => {
    selectCountry(iso3, 'search');
    close();
  };

  if (!open) {
    return (
      <button
        type="button"
        className="icon-btn"
        aria-label="Поиск страны"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        🔍
      </button>
    );
  }

  return (
    <div className="search">
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder="Страна…"
        aria-label="Поиск страны"
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
          if (e.key === 'Enter' && results[0]) pick(results[0]);
        }}
      />
      <button type="button" className="icon-btn" aria-label="Закрыть поиск" onClick={close}>
        ✕
      </button>
      {query.trim() !== '' && (
        <ul className="search-results" role="listbox">
          {results.length === 0 && <li className="search-empty">Ничего не найдено</li>}
          {results.map((iso) => (
            <li key={iso}>
              <button type="button" role="option" aria-selected={false} onClick={() => pick(iso)}>
                <span aria-hidden="true">{flagEmoji(iso)}</span> {countryName(iso)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
