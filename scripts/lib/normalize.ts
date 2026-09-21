import type { Status } from '../../shared';

export interface Normalized {
  status: Status;
  days: number | null;
}

export class UnknownRequirementError extends Error {
  constructor(public readonly raw: string) {
    super(`Unknown Requirement value in source: ${JSON.stringify(raw)}`);
  }
}

/** Maps a raw `Requirement` cell of the Passport Index CSV to an internal status (spec 2.4). */
export function normalizeRequirement(raw: string): Normalized {
  const value = raw.trim().toLowerCase();
  if (value === '-1') return { status: 'self', days: null };
  if (value === 'visa free') return { status: 'visa_free', days: null };
  if (/^\d+$/.test(value)) {
    const days = Number(value);
    if (days > 0) return { status: 'visa_free', days };
  }
  switch (value) {
    case 'visa on arrival':
      return { status: 'voa', days: null };
    case 'e-visa':
    case 'eta':
      return { status: 'evisa', days: null };
    case 'visa required':
      return { status: 'visa_required', days: null };
    case 'no admission':
      return { status: 'no_admission', days: null };
    case '':
      return { status: 'unknown', days: null };
    default:
      throw new UnknownRequirementError(raw);
  }
}
