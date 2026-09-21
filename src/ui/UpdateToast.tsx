import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="toast" role="status">
      <span>Доступна новая версия</span>
      <button type="button" onClick={() => void updateServiceWorker(true)}>
        Обновить
      </button>
      <button type="button" className="toast-close" aria-label="Скрыть" onClick={() => setNeedRefresh(false)}>
        ✕
      </button>
    </div>
  );
}
