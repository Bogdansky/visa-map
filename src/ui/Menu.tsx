import { useEffect, useRef, useState } from 'react';
import { DISCLAIMER } from '../lib/status';
import { useApp } from '../store';
import { formatBuiltAt } from './DataInfoBar';

export function Menu() {
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState(false);
  const refreshing = useApp((s) => s.isRefreshing);
  const refresh = useApp((s) => s.refresh);
  const manifest = useApp((s) => s.manifest);
  const builtAt = useApp((s) => formatBuiltAt(s.dataBuiltAt));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button type="button" className="icon-btn" aria-label="Меню" aria-expanded={open} onClick={() => setOpen(!open)}>
        ⋯
      </button>
      {open && (
        <ul className="menu-list" role="menu">
          <li>
            <button
              type="button"
              role="menuitem"
              disabled={refreshing}
              onClick={() => {
                setOpen(false);
                void refresh();
              }}
            >
              {refreshing ? 'Обновление…' : 'Обновить данные'}
            </button>
          </li>
          <li>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setAbout(true);
              }}
            >
              О данных
            </button>
          </li>
        </ul>
      )}
      {about && (
        <div className="modal-backdrop" onClick={() => setAbout(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="about-title">О данных</h2>
            <p>{builtAt ? `Данные от ${builtAt}.` : 'Данные ещё не загружены.'}</p>
            <p>
              Источник:{' '}
              <a
                href={manifest?.source.url ?? 'https://github.com/ilyankou/passport-index-dataset'}
                target="_blank"
                rel="noreferrer"
              >
                {manifest?.source.name ?? 'passport-index-dataset'}
              </a>
              , собранный с passportindex.org, с ручными правками.
            </p>
            <p className="disclaimer">{DISCLAIMER}</p>
            <button type="button" onClick={() => setAbout(false)}>
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
