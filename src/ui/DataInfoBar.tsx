import { useOnline } from '../lib/hooks';
import { useApp } from '../store';

export const formatBuiltAt = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('ru-RU');
};

export function DataInfoBar() {
  const builtAt = useApp((s) => formatBuiltAt(s.dataBuiltAt));
  const loading = useApp((s) => Object.values(s.chunkState).some((c) => c === 'loading'));
  const refreshing = useApp((s) => s.isRefreshing);
  const online = useOnline();
  return (
    <div className="data-info" role="status">
      {refreshing ? 'Обновление данных…' : loading ? 'Загрузка данных…' : builtAt ? `Данные от ${builtAt}` : ''}
      {!online && ' · оффлайн'}
    </div>
  );
}
