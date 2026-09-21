import type { Topology } from 'topojson-specification';
import atlas from 'world-atlas/countries-110m.json';
import { buildGeometry, makeInvert } from './geometry';

export const geometry = buildGeometry(atlas as unknown as Topology);
export const invertProjection = makeInvert();
