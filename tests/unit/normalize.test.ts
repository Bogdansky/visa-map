import { describe, expect, it } from 'vitest';
import { normalizeRequirement, UnknownRequirementError } from '../../scripts/lib/normalize';

describe('normalizeRequirement', () => {
  it.each([
    ['90', { status: 'visa_free', days: 90 }],
    ['360', { status: 'visa_free', days: 360 }],
    ['visa free', { status: 'visa_free', days: null }],
    ['visa on arrival', { status: 'voa', days: null }],
    ['e-visa', { status: 'evisa', days: null }],
    ['eta', { status: 'evisa', days: null }],
    ['visa required', { status: 'visa_required', days: null }],
    ['no admission', { status: 'no_admission', days: null }],
    ['-1', { status: 'self', days: null }],
    ['', { status: 'unknown', days: null }],
    ['  E-Visa ', { status: 'evisa', days: null }],
  ])('maps %j', (raw, want) => {
    expect(normalizeRequirement(raw)).toEqual(want);
  });

  it.each(['maybe', '0', '12 days', '-2', 'visa-free'])('throws on unknown value %j', (raw) => {
    expect(() => normalizeRequirement(raw)).toThrow(UnknownRequirementError);
  });
});
