import { geoArea, geoNaturalEarth1, geoPath } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { feature } from 'topojson-client';
import { alpha3FromAtlas } from '../lib/countries';
import { MICRO_STATES } from '../lib/microStates';

export const MAP_WIDTH = 960;
/** world-atlas id of Antarctica; hidden per spec 5. */
const ANTARCTICA_ID = '010';
/** Shapes narrower than this (in viewBox units) also get an enlarged transparent hit circle. */
const SMALL_SHAPE = 7;

export interface MapCountry {
  iso3: string | null;
  name: string;
  d: string;
  /** Projected bounds of the largest polygon (so antimeridian-crossing countries still centre sensibly). */
  bounds: [[number, number], [number, number]];
  centroid: [number, number];
  small: boolean;
}

export interface MapMarker {
  iso3: string;
  x: number;
  y: number;
}

export interface MapGeometry {
  width: number;
  height: number;
  spherePath: string;
  countries: MapCountry[];
  /** Micro-states without a shape in the 110m atlas. */
  markers: MapMarker[];
  /** Anchor points that get an enlarged transparent tap target (small shapes + markers). */
  hitTargets: MapMarker[];
  /** iso3 -> focus box, for both shapes and markers. */
  focus: Map<string, { bounds: [[number, number], [number, number]]; centroid: [number, number] }>;
  /** Every iso3 that can be picked on the map. */
  isoOnMap: Set<string>;
}

type CountryFeature = Feature<Polygon | MultiPolygon, { name?: string }>;

function largestPolygon(f: CountryFeature): Feature<Polygon> {
  if (f.geometry.type === 'Polygon') return f as Feature<Polygon>;
  let best = f.geometry.coordinates[0];
  let bestArea = -1;
  for (const coordinates of f.geometry.coordinates) {
    const area = geoArea({ type: 'Polygon', coordinates });
    if (area > bestArea) {
      best = coordinates;
      bestArea = area;
    }
  }
  return { type: 'Feature', properties: f.properties, geometry: { type: 'Polygon', coordinates: best } };
}

export function buildGeometry(topology: Topology): MapGeometry {
  const projection = geoNaturalEarth1().fitWidth(MAP_WIDTH, { type: 'Sphere' });
  const path = geoPath(projection);
  const height = Math.ceil(path.bounds({ type: 'Sphere' })[1][1]);

  const collection = feature(topology, topology.objects.countries as GeometryCollection);
  const countries: MapCountry[] = [];
  const focus: MapGeometry['focus'] = new Map();
  const hitTargets: MapMarker[] = [];

  for (const f of collection.features as unknown as CountryFeature[]) {
    if (String(f.id ?? '') === ANTARCTICA_ID) continue;
    const name = f.properties?.name ?? '';
    const iso3 = alpha3FromAtlas(f.id, name);
    const main = largestPolygon(f);
    const bounds = path.bounds(main);
    const centroid = path.centroid(main);
    const small = Math.max(bounds[1][0] - bounds[0][0], bounds[1][1] - bounds[0][1]) < SMALL_SHAPE;
    countries.push({ iso3, name, d: path(f) ?? '', bounds, centroid, small });
    if (iso3) {
      focus.set(iso3, { bounds, centroid });
      if (small) hitTargets.push({ iso3, x: centroid[0], y: centroid[1] });
    }
  }

  const markers: MapMarker[] = [];
  for (const [iso3, lonLat] of Object.entries(MICRO_STATES)) {
    if (focus.has(iso3)) continue;
    const point = projection(lonLat);
    if (!point) continue;
    const [x, y] = point;
    markers.push({ iso3, x, y });
    hitTargets.push({ iso3, x, y });
    focus.set(iso3, {
      bounds: [
        [x, y],
        [x, y],
      ],
      centroid: [x, y],
    });
  }

  return {
    width: MAP_WIDTH,
    height,
    spherePath: path({ type: 'Sphere' }) ?? '',
    countries,
    markers,
    hitTargets,
    focus,
    isoOnMap: new Set(focus.keys()),
  };
}

/** Inverse projection for viewport-centre tracking (viewBox coords -> [lon, lat]). */
export function makeInvert() {
  const projection = geoNaturalEarth1().fitWidth(MAP_WIDTH, { type: 'Sphere' });
  return (x: number, y: number): [number, number] | null => projection.invert?.([x, y]) ?? null;
}
