import { describe, expect, it } from 'vitest';
import { geometry } from '../../src/map/atlas';
import { MICRO_STATES } from '../../src/lib/microStates';

describe('map geometry', () => {
  it('hides Antarctica', () => {
    expect(geometry.countries.some((c) => c.name === 'Antarctica')).toBe(false);
  });

  it('matches shapes to alpha-3 codes, including Kosovo by name', () => {
    const iso = new Set(geometry.countries.map((c) => c.iso3));
    for (const code of ['BLR', 'KAZ', 'USA', 'RUS', 'XKX', 'GRL', 'PRI']) expect(iso.has(code), code).toBe(true);
    const unmatched = geometry.countries.filter((c) => !c.iso3).map((c) => c.name);
    expect(unmatched.sort()).toEqual(['N. Cyprus', 'Somaliland']);
  });

  it('has no duplicate country codes', () => {
    const codes = geometry.countries.map((c) => c.iso3).filter(Boolean);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('adds a tappable marker for every micro-state without a shape', () => {
    const shapes = new Set(geometry.countries.map((c) => c.iso3));
    const markers = new Set(geometry.markers.map((m) => m.iso3));
    for (const code of Object.keys(MICRO_STATES)) expect(shapes.has(code) || markers.has(code), code).toBe(true);
    for (const code of ['SGP', 'MLT', 'LIE', 'MCO', 'SMR']) expect(markers.has(code), code).toBe(true);
    for (const m of geometry.markers) {
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x).toBeLessThanOrEqual(geometry.width);
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.y).toBeLessThanOrEqual(geometry.height);
    }
  });

  it('gives every drawn or marked country a focus box', () => {
    for (const c of geometry.countries) if (c.iso3) expect(geometry.focus.has(c.iso3), c.iso3!).toBe(true);
    expect(geometry.isoOnMap.has('SGP')).toBe(true);
  });

  it('enlarges tap targets for small shapes', () => {
    expect(geometry.hitTargets.length).toBeGreaterThanOrEqual(geometry.markers.length);
  });
});
