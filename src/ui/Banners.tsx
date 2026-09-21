import { useApp } from '../store';

export function Banners() {
  const loadError = useApp((s) => s.loadError);
  const retryFailed = useApp((s) => s.retryFailed);
  if (!loadError) return null;
  return (
    <div className="banner" role="alert">
      <span>{loadError === 'offline' ? 'Нет соединения' : 'Не удалось загрузить часть данных'}</span>
      <button type="button" onClick={retryFailed}>
        Повторить
      </button>
    </div>
  );
}
