import type { Entry, Status } from '../../shared';

export const STATUS_COLORS: Record<Status | 'none', string> = {
  visa_free: '#2E9E5B',
  voa: '#F2C230',
  evisa: '#F6B26B',
  visa_required: '#EF8A2F',
  no_admission: '#D64545',
  self: '#4A6FA5',
  unknown: '#C9CDD2',
  none: '#C9CDD2',
};

export const STATUS_LABELS: Record<Status, string> = {
  visa_free: 'Без визы',
  voa: 'Виза по прилёте',
  evisa: 'Электронная виза / eTA',
  visa_required: 'Нужна виза',
  no_admission: 'Въезд закрыт',
  self: 'Ваша страна',
  unknown: 'Нет данных',
};

export const colorFor = (entry: Entry | undefined): string => STATUS_COLORS[entry?.status ?? 'none'];

const plural = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'день';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дня';
  return 'дней';
};

export const formatDays = (days: number) => `${days} ${plural(days)}`;

/** Status as text, so colour is never the only carrier of meaning (spec 3). */
export function statusText(entry: Entry | undefined): string {
  if (!entry) return STATUS_LABELS.unknown;
  if (entry.status === 'visa_free' && entry.days) return `${STATUS_LABELS.visa_free}, до ${formatDays(entry.days)}`;
  return STATUS_LABELS[entry.status];
}

/** Legend items (spec 3: six positions, `self` and grey are explained separately). */
export const LEGEND: { status: Status; label: string }[] = [
  { status: 'visa_free', label: STATUS_LABELS.visa_free },
  { status: 'voa', label: STATUS_LABELS.voa },
  { status: 'evisa', label: STATUS_LABELS.evisa },
  { status: 'visa_required', label: STATUS_LABELS.visa_required },
  { status: 'no_admission', label: STATUS_LABELS.no_admission },
  { status: 'unknown', label: STATUS_LABELS.unknown },
];

export const TERRITORY_NOTE = (parentName: string) =>
  `Территория ${parentName}: показан режим основной страны, он может отличаться, проверьте отдельно`;

export const DISCLAIMER = 'Информация справочная. Правила меняются, проверяйте на сайте МИД страны назначения';
